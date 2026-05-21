// npc.js — NPC FSM (Finite State Machine) for non-player characters.
//
// Per Gate-2 design (plans/sewer-npc-skeleton.md): NPCs with a `behavior`
// whitelist in their spawn data run this FSM. The whitelist limits which
// states the NPC can enter — Carrion's [IDLE] means she literally cannot
// become HOSTILE, no matter the stimulus. This makes the system character-
// agnostic from the AI's perspective.
//
// Current states (step 3): IDLE, WANDER.
// Future states: WORKING (step 4, deposits items into target container),
// HOSTILE (step 5+, may consolidate with legacy enemies.js chase logic),
// ALLIED (when feature/give-action ships and disposition flips an enemy).
//
// Per the project ontology (Character > {Hero, NPC > {Enemy, friendly NPC}}),
// this file operates on the NPC tier. The Enemy class instances pass through
// here when they have a `behavior` field; otherwise they run the legacy
// chase logic in enemies.js.

import { getGreedyStep } from './pathing.js';

// State constants — string values stored on each NPC so they're inspectable
// in dev tools and serializable in any future save format.
export const STATE = {
    IDLE:    'IDLE',
    WANDER:  'WANDER',
    WORKING: 'WORKING', // declared but not yet routed; arrives in step 4
    HOSTILE: 'HOSTILE', // declared but not yet routed here; legacy chase in enemies.js for now
};

// ── Public API ──────────────────────────────────────────────────────────────
//
// Run one tick of the FSM for a single NPC. Mutates the NPC (state, x, y,
// turn counters). Returns an array of log message strings to surface to the
// player. Called from enemies.js::resolveEnemyTurns when the NPC has a
// `behavior` field.

export function tickNpcState(game, npc) {
    if (!npc.behavior) return [];

    // Lazy initialization — pick a starting state from the whitelist.
    // Prefer IDLE if available; otherwise take the first allowed state.
    if (npc.fsmState == null) {
        npc.fsmState = npc.behavior.includes(STATE.IDLE)
            ? STATE.IDLE
            : npc.behavior[0];
        npc._lastWanderTurn = game.turn;
    }

    const messages = [];

    switch (npc.fsmState) {
        case STATE.IDLE: {
            // Periodically transition to WANDER if the whitelist allows.
            if (!npc.behavior.includes(STATE.WANDER)) break;
            const turnsSince = game.turn - (npc._lastWanderTurn ?? 0);
            const cadence = npc.wanderEveryTurns ?? 4;
            if (turnsSince >= cadence) {
                npc.fsmState = STATE.WANDER;
                npc._lastWanderTurn = game.turn;
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
                    npc.x = step.x;
                    npc.y = step.y;
                }
            }
            // One step (or attempt) per wander burst — drop back to IDLE
            // so the cadence counter throttles the next move.
            npc.fsmState = STATE.IDLE;
            break;
        }

        // WORKING and HOSTILE fall through to no-op for this ship — those
        // states are routed elsewhere or arrive in later steps.
        default:
            break;
    }

    return messages;
}

// ── Wander target selection ─────────────────────────────────────────────────
//
// Pick a random walkable tile within the NPC's wander radius. If the NPC
// has a `homeRegion`, candidates are constrained to within that named
// region (defined in map JSON's `regions` array). If no valid candidate
// exists, returns null and the NPC stays put this tick.
//
// Math.random is intentional for v1 — seeded RNG is on the deferred-debt
// list per Gate-2 design. Once a save system exists, deterministic wander
// targets will matter; not now.

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
    return candidates[Math.floor(Math.random() * candidates.length)];
}
