// npc.js — NPC FSM (Finite State Machine) for non-player characters.
//
// Per Gate-2 design (plans/sewer-npc-skeleton.md): NPCs with a `behavior`
// whitelist in their spawn data run this FSM. The whitelist limits which
// states the NPC can enter — Carrion's [IDLE] means she literally cannot
// become HOSTILE, no matter the stimulus. This makes the system character-
// agnostic from the AI's perspective.
//
// Current states (steps 3-4): IDLE, WANDER, WORKING.
// Future states: HOSTILE (still routed via legacy enemies.js chase logic;
// will be consolidated here in a later step), ALLIED (when
// feature/give-action ships and disposition flips an enemy).
//
// State priority on each tick: WORKING (if there's work) > WANDER (if the
// cadence has elapsed) > stay IDLE. This gives workers diligence — once
// there's work to do, they do it every tick, no cadence throttling — while
// keeping wanderers lazy in the absence of stimulus.
//
// Per the project ontology (Character > {Hero, NPC > {Enemy, friendly NPC}}),
// this file operates on the NPC tier. The Enemy class instances pass through
// here when they have a `behavior` field; otherwise they run the legacy
// chase logic in enemies.js.

import { manhattan } from './utils.js';
import { getGreedyStep, stepEntity } from './pathing.js';

// State constants — string values stored on each NPC so they're inspectable
// in dev tools and serializable in any future save format.
export const STATE = {
    IDLE:    'IDLE',
    WANDER:  'WANDER',
    WORKING: 'WORKING',
    HOSTILE: 'HOSTILE', // declared but not yet routed here; legacy chase in enemies.js for now
    ALLIED:  'ALLIED',  // a bribe-flipped ally — fights the player's hostiles (game._allyTakeTurn)
};

// ── Public API ──────────────────────────────────────────────────────────────
//
// Run one tick of the FSM for a single NPC. Mutates the NPC (state, x, y,
// carrying, turn counters) and the world (groundItems, container.contents).
// Returns an array of log message strings to surface to the player. Called
// from enemies.js::resolveEnemyTurns when the NPC has a `behavior` field.

export function tickNpcState(game, npc) {
    if (!npc.behavior) return [];

    // Lazy initialization — pick a starting state from the whitelist.
    // Prefer IDLE if available; otherwise take the first allowed state;
    // otherwise default to IDLE explicitly (for the empty-whitelist case
    // produced by give-action::applyFlip on a legacy chaser).
    if (npc.fsmState == null) {
        if (npc.behavior.includes(STATE.IDLE)) {
            npc.fsmState = STATE.IDLE;
        } else if (npc.behavior.length > 0) {
            npc.fsmState = npc.behavior[0];
        } else {
            npc.fsmState = STATE.IDLE; // empty whitelist defaults to permanent IDLE
        }
        npc._lastWanderTurn = game.turn;
    }

    const messages = [];

    switch (npc.fsmState) {
        case STATE.IDLE: {
            // Priority 1: WORKING if there's work and the whitelist allows.
            // No cadence throttle on the WORKING transition — workers should
            // start working as soon as work exists.
            if (npc.behavior.includes(STATE.WORKING) && hasWork(game, npc)) {
                npc.fsmState = STATE.WORKING;
                // Fall through? No — we want the next tick to run WORKING.
                // The state is set; next call to tickNpcState will route here.
                break;
            }
            // Priority 2: WANDER if the cadence has elapsed and the whitelist
            // allows. Cadence throttle applies to wandering only.
            if (npc.behavior.includes(STATE.WANDER)) {
                const turnsSince = game.turn - (npc._lastWanderTurn ?? 0);
                const cadence = npc.wanderEveryTurns ?? 4;
                if (turnsSince >= cadence) {
                    npc.fsmState = STATE.WANDER;
                    npc._lastWanderTurn = game.turn;
                }
            }
            break;
        }

        case STATE.WANDER: {
            const target = pickWanderTarget(game, npc);
            if (target) {
                const step = getGreedyStep(
                    game,
                    { x: npc.x, y: npc.y },
                    target,
                    { self: npc }
                );
                if (step) {
                    stepEntity(npc, step.x, step.y, game._MOVE_MS);
                }
            }
            // One step (or attempt) per wander burst — drop back to IDLE
            // so the cadence counter throttles the next move.
            npc.fsmState = STATE.IDLE;
            break;
        }

        case STATE.WORKING: {
            // Workers operate every tick they're in WORKING — no cadence
            // throttle. The state is exited only when there's nothing left
            // to do.
            const msg = tickWorking(game, npc);
            if (msg) messages.push(msg);
            break;
        }

        case STATE.ALLIED: {
            // A bribe-flipped ally. The combat + targeting + leash-follow logic
            // lives in main.js (_allyTakeTurn), which has the attack pipeline,
            // hit-splats, and enemy-death hooks; the FSM just delegates so npc.js
            // stays free of combat coupling. Returns log lines to surface.
            const allyMsgs = game._allyTakeTurn ? game._allyTakeTurn(npc) : [];
            for (const m of allyMsgs) messages.push(m);
            break;
        }

        default:
            break;
    }

    return messages;
}

// ── WORKING state ───────────────────────────────────────────────────────────
//
// Two sub-behaviors based on whether the worker is carrying anything:
//   - Empty carry slot: head toward the nearest wanted item in range. If
//     standing on it, pick it up (consume from groundItems, set carrying).
//   - Full carry slot: head toward the depositsTo container. If adjacent
//     (manhattan distance 1), deposit (push to chest.contents, clear carry).
//
// On either path, after one action, stay in WORKING. The next IDLE check
// will recurse only if work has run out. This keeps the loop tight and
// the per-tick observable change small (one step or one pickup/deposit).
//
// If work runs out (no items in region AND not carrying), revert to IDLE
// so the cadence counter eventually wanders the worker.

function tickWorking(game, npc) {
    if (npc.carrying) {
        return tickCarrying(game, npc);
    } else {
        return tickFindingItem(game, npc);
    }
}

function tickCarrying(game, npc) {
    const chest = findContainer(game, npc.depositsTo);
    if (!chest) {
        // Target chest doesn't exist; we have nowhere to put this. Revert
        // to IDLE. Worker will keep the item in carry slot indefinitely —
        // acceptable v1 behavior. Log a one-time dev warning.
        if (!npc._warnedMissingChest) {
            console.warn(`[npc] ${npc.type} (id=${npc.id}) depositsTo "${npc.depositsTo}" — no such container.`);
            npc._warnedMissingChest = true;
        }
        npc.fsmState = STATE.IDLE;
        return null;
    }

    const dist = manhattan(npc.x, npc.y, chest.x, chest.y);
    if (dist <= 1) {
        // Adjacent — deposit
        const itemType = typeof npc.carrying === 'string'
            ? npc.carrying
            : npc.carrying.type;
        chest.contents.push({ type: itemType, source: npc.id });
        npc.carrying = null;
        return `[A ${npc.type} drops a ${itemType} into the chest.]`;
    }

    // Not adjacent — step toward chest
    const step = getGreedyStep(
        game,
        { x: npc.x, y: npc.y },
        { x: chest.x, y: chest.y },
        { self: npc }
    );
    if (step) {
        stepEntity(npc, step.x, step.y, game._MOVE_MS);
    }
    return null;
}

function tickFindingItem(game, npc) {
    const target = findNearestWantedItem(game, npc);
    if (!target) {
        // Nothing to grab in this radius. Revert to IDLE — the cadence
        // counter will eventually trigger a WANDER, which may relocate the
        // worker into range of new items.
        npc.fsmState = STATE.IDLE;
        return null;
    }

    if (npc.x === target.x && npc.y === target.y) {
        // Standing on the item — pick it up
        npc.carrying = target.type;
        const idx = game.groundItems.indexOf(target);
        if (idx >= 0) game.groundItems.splice(idx, 1);
        return `[A ${npc.type} pockets a ${target.type}.]`;
    }

    // Step toward it
    const step = getGreedyStep(
        game,
        { x: npc.x, y: npc.y },
        { x: target.x, y: target.y },
        { self: npc }
    );
    if (step) {
        stepEntity(npc, step.x, step.y, game._MOVE_MS);
    }
    return null;
}

// ── Work-detection helpers ──────────────────────────────────────────────────

function hasWork(game, npc) {
    if (npc.carrying) return true;
    return findNearestWantedItem(game, npc) != null;
}

function findContainer(game, id) {
    if (!id || !game.containers) return null;
    return game.containers.find(c => c.id === id) || null;
}

// Find the closest groundItem that this NPC wants and that lies within both
// its wander radius and (if defined) its home region. Returns null if none.

function findNearestWantedItem(game, npc) {
    if (!npc.wantsItems || npc.wantsItems.length === 0) return null;
    const radius = npc.wanderRadius ?? 3;
    const region = npc.homeRegion ? game.map.getRegion(npc.homeRegion) : null;

    let best = null;
    let bestDist = Infinity;

    for (const item of game.groundItems) {
        if (!npc.wantsItems.includes(item.type)) continue;

        // Within wander radius (Chebyshev for the search box; greedy
        // pathfinding uses Manhattan, but the search shape is a square so
        // we filter by max-axis distance here)
        if (Math.abs(item.x - npc.x) > radius) continue;
        if (Math.abs(item.y - npc.y) > radius) continue;

        // Within home region (if one is named)
        if (region) {
            if (item.x < region.x || item.x >= region.x + region.w) continue;
            if (item.y < region.y || item.y >= region.y + region.h) continue;
        }

        const d = manhattan(item.x, item.y, npc.x, npc.y);
        if (d < bestDist) {
            bestDist = d;
            best = item;
        }
    }

    return best;
}

// ── Wander target selection ─────────────────────────────────────────────────
//
// Pick a random walkable tile within the NPC's wander radius. If the NPC
// has a `homeRegion`, candidates are constrained to within that named
// region (defined in map JSON's `regions` array). If no valid candidate
// exists, returns null and the NPC stays put this tick.
//
// Pulls from the seeded RNG (game.rng) so wander targets are deterministic
// and resumable across saves — the save persists the live RNG stream and
// restores it on load.

function pickWanderTarget(game, npc) {
    const radius = npc.wanderRadius ?? 3;
    const region = npc.homeRegion ? game.map.getRegion(npc.homeRegion) : null;

    const candidates = [];
    for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
            if (dx === 0 && dy === 0) continue;
            const tx = npc.x + dx;
            const ty = npc.y + dy;

            if (!game.map.isWalkable(tx, ty)) continue;

            // Constrain to home region if one is named
            if (region) {
                if (tx < region.x || tx >= region.x + region.w) continue;
                if (ty < region.y || ty >= region.y + region.h) continue;
            }

            candidates.push({ x: tx, y: ty });
        }
    }

    if (candidates.length === 0) return null;
    return game.rng.pick(candidates);
}
