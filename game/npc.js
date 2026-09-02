// npc.js — NPC FSM (Finite State Machine) for non-player characters.
//
// Per Gate-2 design (plans/sewer-npc-skeleton.md): NPCs with a `behavior`
// whitelist in their spawn data run this FSM. The whitelist limits which
// states the NPC can enter — Carrion's [IDLE] means she literally cannot
// become HOSTILE, no matter the stimulus. This makes the system character-
// agnostic from the AI's perspective.
//
// States: IDLE, WANDER, WORKING (ambient), HOSTILE (the chase — relocated here
// from enemies.js in PD-3 step 4), ALLIED (a disposition-flipped ally).
//
// State priority on each tick: WORKING (if there's work) > WANDER (if the
// cadence has elapsed) > stay IDLE. This gives workers diligence — once
// there's work to do, they do it every tick, no cadence throttling — while
// keeping wanderers lazy in the absence of stimulus.
//
// Per the project ontology (Character > {Hero, NPC > {Enemy, friendly NPC}}),
// this file operates on the NPC tier. Every non-ambient Enemy instance is now
// dispatched here by resolveEnemyTurns (enemies.js), routed by allegiance into
// the HOSTILE (chase), ALLIED, or ambient states.

import { manhattan, chebyshev } from './utils.js';
import { getGreedyStep, stepEntity, findPath } from './pathing.js';
import { perceives, nextAwareness, VERDICT } from './perception.js';
import { healPurchase, kitChoice, isSewerDweller, bossSpend, BOSS_RALLY_RANGE, isHunting } from './ai.js';
import { ITEMS, kitHealValue, applyKitItem } from './items.js';
import { WEAPONS } from './weapons.js';
import { burnGold } from './trade.js';

// ── Leash tuning ─────────────────────────────────────────────────────────────
// A chasing enemy gives up and walks home when it strays past LEASH_DISTANCE
// tiles from its spawn, OR loses line-of-sight to the player for
// LOST_SIGHT_BEATS consecutive turns. Both are one-line-tunable; LEASH_DISTANCE
// is generous (≈ 2× the default sight range) so a fair foot-chase still works,
// while LOST_SIGHT_BEATS gives the player a real "break contact and they
// disengage" stealth beat. Per-type override via the enemy's `leashDistance` /
// `lostSightBeats` fields (absent → these defaults). (Moved here with the chase
// from enemies.js, PD-3 step 4.)
const LEASH_DISTANCE   = 14; // max tiles from home before a chaser breaks off
const LOST_SIGHT_BEATS = 6;  // turns out of sight before a chaser breaks off

// State constants — string values stored on each NPC so they're inspectable
// in dev tools and serializable in any future save format.
export const STATE = {
    IDLE:    'IDLE',
    WANDER:  'WANDER',
    WORKING: 'WORKING',
    HOSTILE: 'HOSTILE', // chases + attacks the player (the relocated legacy chase)
    ALLIED:  'ALLIED',  // a bribe-flipped ally — fights the player's hostiles (game._allyTakeTurn)
};

// ── Public API ──────────────────────────────────────────────────────────────
//
// Run one tick of the FSM for a single NPC. Mutates the NPC (state, x, y,
// carrying, turn counters) and the world (groundItems, container.contents).
// Returns an array of log messages (plain strings for FSM activity; rich
// { text, sourceEnemy, category } objects from the HOSTILE chase). Called for
// every non-ambient Enemy from enemies.js::resolveEnemyTurns, dispatched by
// allegiance; also for neutrals on the world heartbeat (resolveAmbientTurns).

export function tickNpcState(game, npc, clock = game.turn) {
    // Lazy initialization — pick a starting state. Allegiance decides first
    // (a born-hostile with null `behavior` has no whitelist to read); otherwise
    // fall back to the ambient whitelist: prefer IDLE, else the first allowed
    // state, else IDLE (the empty-whitelist case a flipped legacy chaser leaves).
    if (npc.fsmState == null) {
        if (npc.allegiance === 'hostile')      npc.fsmState = STATE.HOSTILE;
        else if (npc.allegiance === 'ally')    npc.fsmState = STATE.ALLIED;
        else if (npc.behavior && npc.behavior.includes(STATE.IDLE)) npc.fsmState = STATE.IDLE;
        else if (npc.behavior && npc.behavior.length > 0)          npc.fsmState = npc.behavior[0];
        else                                   npc.fsmState = STATE.IDLE;
        npc._lastWanderTurn = clock;
    }

    const messages = [];

    switch (npc.fsmState) {
        case STATE.IDLE: {
            // Priority 0: go back to your post.
            //
            // (go home, ruled 2026-09-02) A bump shoves whoever is in the way,
            // shopkeepers included — that is deliberate, and it is meant to be
            // funny. It stops being funny if it is permanent: without this, every
            // walk through town leaves the cast a little further from where they
            // belong, and after a while the market is a scatter of people standing
            // in the road. So anyone who was displaced walks back.
            //
            // Only characters who HOLD a post do this. A wanderer's whole design is
            // to drift — pickWanderTarget steps from wherever it currently stands,
            // not from an anchor — so giving one a post would have it wander off
            // and trudge back forever, fighting itself. Shoving a wanderer just
            // changes where it drifts from, which is fine.
            if (goHomeStep(game, npc)) break;      // one step per turn, same as a wander

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
                const turnsSince = clock - (npc._lastWanderTurn ?? 0);
                const cadence = npc.wanderEveryTurns ?? 4;
                if (turnsSince >= cadence) {
                    npc.fsmState = STATE.WANDER;
                    npc._lastWanderTurn = clock;
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

        case STATE.HOSTILE: {
            // Legacy chase logic — relocated verbatim from enemies.js (PD-3 step 4),
            // plus the leash (a strayed/blind chaser breaks off and walks home).
            // (perception) ONE source of truth, shared with the threat overlay, so
            // what the player is shown and what the AI acts on can never disagree.
            // Only DIRECT — the forward cone — counts as "sees you"; PERIPHERAL
            // feeds the suspicion ladder instead, and the rear three tiles are blind.
            //
            // Note this also moves the range metric from Manhattan to Chebyshev.
            // Manhattan was the stricter of the two on diagonals, so sight widens
            // very slightly diagonally — correct, since movement is 8-way and the
            // overlay has always drawn sight as a circle.
            //
            // Spotting the player (re)acquires aggro from either idle OR returning —
            // a foe walking home that catches sight of you again turns and resumes
            // the chase. A live sighting also clears the lost-sight timer so contact
            // has to actually break to count.
            const verdict = perceives(game.map, npc, game.playerX, game.playerY);
            const canSeePlayer = verdict === VERDICT.DIRECT;
            if (canSeePlayer) {
                npc._lostSightTurns = 0;
                npc._awareBeats = 0;             // a real sighting outranks any accrued suspicion
                npc._sweepBeats = 0;
                npc._lastSeenX = game.playerX;   // (PD-1) refresh the last-seen mark
                npc._lastSeenY = game.playerY;   // only while the player is actually in view
                if (npc.state === 'idle' || npc.state === 'suspicious' || npc.state === 'returning') {
                    const reacquire = npc.state !== 'returning';
                    npc.state = 'chasing';
                    if (reacquire) messages.push({
                        text: `[${npc.entity.name} spotted you!]`,
                        sourceEnemy: npc,
                        category: 'spotted',
                    });
                }
            } else if (npc.state === 'idle' || npc.state === 'suspicious') {
                // (ladder) nextAwareness owns the PRE-CHASE states only — the
                // idle → suspicious promotion on sustained peripheral contact, and
                // suspicious → searching. The chasing / returning / leash logic
                // below is deliberately left exactly as it was: it already
                // implements "pursue the last-seen tile, give up on arrival",
                // which IS searching, just under the older name. Renaming it would
                // risk the leash for no gain until the renderer needs the label.
                //
                // Consequence worth knowing: BLIND_SWEEP_BEATS has no runtime
                // consumer yet. It only applies to a searcher with NO last-seen
                // mark, which today only a theft can produce — so it wires up with
                // the Thieve verb, not here.
                const before = npc.state;
                const t = nextAwareness(npc, verdict, { x: game.playerX, y: game.playerY });
                npc.state       = t.state;
                npc._awareBeats = t.awareBeats;
                npc._sweepBeats = t.sweepBeats;
                if (t.faceTo) {
                    // Turn toward the disturbance, and remember where it was so the
                    // search that follows has somewhere to walk to.
                    npc._lastDx = Math.sign(t.faceTo.x - npc.x);
                    npc._lastDy = Math.sign(t.faceTo.y - npc.y);
                    npc._lastSeenX = t.faceTo.x;
                    npc._lastSeenY = t.faceTo.y;
                }
                if (npc.state === 'suspicious') {
                    if (before !== 'suspicious') messages.push({
                        text: `[${npc.entity.name} looks your way...]`,
                        sourceEnemy: npc,
                        category: 'spotted',
                    });
                    break;   // turning to look IS the turn — no move, no attack
                }
            }

            // Returning: walk back toward home using the same greedy-step spine as
            // the chase. Arrive (or get stuck against a wall) → drop to idle and
            // resume normal LOS re-acquisition / FSM-free wander-at-rest.
            if (npc.state === 'returning') {
                if (npc.x === npc.homeX && npc.y === npc.homeY) {
                    npc.state = 'idle';
                    break;
                }
                const homeMove = getGreedyStep(
                    game,
                    { x: npc.x, y: npc.y },
                    { x: npc.homeX, y: npc.homeY },
                    { self: npc }
                );
                if (homeMove) stepEntity(npc, homeMove.x, homeMove.y, game._MOVE_MS);
                else npc.state = 'idle'; // boxed in — give up the walk-back, idle here
                break;
            }

            // 'searching' runs the same pursuit spine as 'chasing' below — it
            // walks to the last-seen tile and gives up on arrival. That is exactly
            // what the blind-chase branch already did; it just has a name now.
            if (!isHunting(npc)) break;

            // Leash: a chaser that has broken contact — out of sight — gives up when
            // it has strayed too far from home OR stayed blind for too many beats,
            // and heads home. Gating on !canSeePlayer means an enemy still in sight
            // (incl. one adjacent and attacking) NEVER disengages, however far it
            // has chased you — you have to actually break line of sight to shake it.
            if (!canSeePlayer) {
                npc._lostSightTurns += 1;
                const leashDist  = npc.leashDistance ?? LEASH_DISTANCE;
                const blindBeats = npc.lostSightBeats ?? LOST_SIGHT_BEATS;
                const tooFar  = manhattan(npc.x, npc.y, npc.homeX, npc.homeY) > leashDist;
                const tooLong = npc._lostSightTurns >= blindBeats;
                if (tooFar || tooLong) {
                    npc.state = 'returning';
                    npc._lostSightTurns = 0;
                    messages.push({
                        text: `[${npc.entity.name} loses interest.]`,
                        sourceEnemy: npc,
                        category: 'deaggro',
                    });
                    break; // spend this beat disengaging; walk-home starts next turn
                }
            }

            // (PD-1) Pursue the LAST-SEEN tile when blind — path to where the player
            // was last actually visible, not their true position (no tracking through
            // walls). Reaching that spot without re-sighting them breaks the chase; the
            // leash above is the outer backstop.
            const chaseTarget = canSeePlayer
                ? { x: game.playerX, y: game.playerY }
                : { x: npc._lastSeenX, y: npc._lastSeenY };
            if (!canSeePlayer &&
                (chaseTarget.x == null || (npc.x === chaseTarget.x && npc.y === chaseTarget.y))) {
                npc.state = 'returning';
                npc._lostSightTurns = 0;
                messages.push({
                    text: `[${npc.entity.name} loses the trail.]`,
                    sourceEnemy: npc,
                    category: 'deaggro',
                });
                break;
            }

            // Law 2 positional (ruled 2026-07-24): a shove spins its victim clean
            // around, and it spends its NEXT turn recovering — no heal purchase,
            // no attack, no re-face, no move — so the shove's backstab window
            // survives exactly one follow-up hit instead of dying before the
            // player can cash it in.
            if (npc._spunTurns > 0) {
                npc._spunTurns--;
                break;
            }

            // Law 6f — SPEND WHAT YOU CARRY BEFORE YOU SPEND GOLD. The kits have
            // been authored and priced onto the nameplate since the gold standard
            // shipped, but nothing ever consumed them: the systems audit lists
            // enemy kits among the systems that never execute because "the enemy
            // is dead before its second turn". With fight length re-roled to
            // TTK 5-8 there is finally a middle to a fight to spend them in.
            //
            // Deliberately ABOVE the heal-purchase block: an enemy reaches into
            // its own pack before it buys HP at the peg. Eating IS the turn, same
            // as buying, and the item leaves the loadout — so the nameplate's pips
            // drop as it eats and Law 6f's "the unused kit drops on death" finally
            // means something, because some of it got used.
            //
            // Weapons-first resolution mirrors Game._resolveItemDef: a loadout may
            // legally hold a weapon and a bare ITEMS lookup silently drops it.
            // Collapses onto item-registry.js's resolveItemDef when the offer
            // screen lands.
            const kitDefs = (npc.loadout ?? []).map(
                x => (typeof x === 'string' ? (WEAPONS[x] || ITEMS[x] || null) : x));
            const dweller = isSewerDweller(npc);
            const pick = kitChoice(
                npc.entity.hp, npc.entity.maxHp, kitDefs,
                (d) => kitHealValue(d, dweller),
                (npc.buffs ?? []).some(b => (b.dmg ?? 0) < 0));   // already regenerating?
            if (pick && applyKitItem(pick.def, npc, dweller)) {
                npc.loadout = (npc.loadout ?? []).filter((_, i) => i !== pick.index);
                messages.push({
                    text: `[${npc.name ?? npc.type} digs out ${pick.def.name} and uses it.]`,
                    sourceEnemy: npc,
                    category: 'combat',
                });
                break;   // eating IS the turn
            }

            // Law 5 — BOSSES SPEND, NOT POOL. Carried in the bible since the gold
            // standard and never executed once; the systems audit calls it the most
            // interesting idea in there and notes it has never run. This is the
            // first time it does.
            //
            // A boss's purse is both its second health bar and its loot, so what
            // you take off the corpse is exactly what it did not have to spend on
            // you. Rush it and you get the purse; let it settle in and you fight
            // the purse. Gold moves through burnGold — the declared sink — the same
            // way the grunt heal policy does.
            //
            // Sits BELOW the kit block (free supplies first) and ABOVE the grunt
            // policy, which it supersedes for anything flagged `boss`.
            if (npc.boss) {
                const allyList = game.enemies.filter(a =>
                    a !== npc && a.entity?.isAlive?.() && a.allegiance === npc.allegiance
                    && chebyshev(a.x, a.y, npc.x, npc.y) <= BOSS_RALLY_RANGE);
                const plan = bossSpend(
                    npc.entity.hp, npc.entity.maxHp, npc.gold,
                    allyList.map(a => ({ hp: a.entity.hp, maxHp: a.entity.maxHp })));
                if (plan && burnGold(npc, plan.spend, 'boss')) {
                    if (plan.kind === 'heal') {
                        npc.entity.hp = Math.min(npc.entity.maxHp, npc.entity.hp + plan.heal);
                        messages.push({
                            text: `[${npc.name ?? npc.type} spends ${plan.spend} GP on itself. (+${plan.heal} HP)]`,
                            sourceEnemy: npc,
                            category: 'combat',
                        });
                    } else {
                        const ward = allyList[plan.index];
                        ward.entity.hp = Math.min(ward.entity.maxHp, ward.entity.hp + plan.heal);
                        messages.push({
                            text: `[${npc.name ?? npc.type} pays ${plan.spend} GP — ${ward.name ?? ward.type} straightens up. (+${plan.heal} HP)]`,
                            sourceEnemy: npc,
                            category: 'combat',
                        });
                    }
                    break;   // the purchase IS the turn
                }
            }

            // Law 6a/6b (plans/gold-standard-design.md): a hurt, solvent enemy
            // spends its turn buying HP back at the peg instead of swinging —
            // the purchase IS the turn. Spent gold is BURNED (leaves the
            // economy for now; the vendor the enemy notionally pays is
            // offscreen) — intentional, first wallet extra.
            const buy = healPurchase(npc.entity.hp, npc.entity.maxHp, npc.gold);
            if (buy && burnGold(npc, buy.spend, 'heal')) {
                npc.entity.hp = Math.min(npc.entity.maxHp, npc.entity.hp + buy.heal);
                messages.push({
                    text: `[${npc.name ?? npc.type} buys back ${buy.heal} HP! (-${buy.spend} GP)]`,
                    sourceEnemy: npc,
                    category: 'combat',
                });
                break;   // the purchase IS the turn
            }

            // Adjacent? Attack. Visual feedback (red damage number, hit-flash,
            // stagger, event word, screen shake on big hits) replaces the
            // attack log line. The player-death case is handled by the death-
            // screen flow in main.js, which has its own messaging.
            //
            // Raw damage only — blind (outgoing) and guard (incoming) both
            // fold into the single computeHit call inside applyDamageToPlayer,
            // so they compose in one round instead of double-rounding.
            if (chebyshev(npc.x, npc.y, game.playerX, game.playerY) <= 1) {
                // Attacking faces the target — a shove buys one backstab window, not a farm.
                npc._lastDx = Math.sign(game.playerX - npc.x);
                npc._lastDy = Math.sign(game.playerY - npc.y);
                game.applyDamageToPlayer(npc.damage, npc);   // blind folds in at the one computeHit call site
                break;
            }

            // Chase: greedy move toward the pursuit target — the player's true position
            // while in sight, else the last-seen tile (PD-1).
            const bestMove = getGreedyStep(
                game,
                { x: npc.x, y: npc.y },
                chaseTarget,
                { self: npc }
            );
            if (bestMove) {
                stepEntity(npc, bestMove.x, bestMove.y, game._MOVE_MS);
            }
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
        if (item.def && item.def.questItem) continue;   // never let a worker carry off a quest / remembrance item
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

// One step back toward this character's post, or false if it is already there,
// has no post, or is the sort that roams by design.
//
// Returns true when a step was taken so the caller can spend the turn on it —
// walking home is what you are doing this turn, the same way wandering is.
export function goHomeStep(game, npc) {
    if (!npc || npc.homeX == null || npc.homeY == null) return false;
    // A wanderer has no post to keep; see the note at the IDLE case.
    if (npc.behavior && npc.behavior.includes(STATE.WANDER)) return false;
    if (npc.x === npc.homeX && npc.y === npc.homeY) return false;

    // A real route, not a greedy nudge. getGreedyStep only ever moves to a
    // neighbour that reduces straight-line distance, so it strands anyone whose
    // post is back around a corner — it cannot even leave a spot where every
    // improving neighbour is a wall. "If possible" was meant literally, so this
    // asks whether a way home EXISTS and takes its first step.
    const path = findPath(game, { x: npc.x, y: npc.y }, { x: npc.homeX, y: npc.homeY },
                          { self: npc, avoidPlayer: true });
    // No path means genuinely cut off — someone standing in the doorway, most
    // likely. Wait and try again next turn rather than shoving back; being
    // politely stuck beside your own stall is the funnier failure anyway.
    if (!path || !path.length) return false;
    const step = path[0];
    stepEntity(npc, step.x, step.y, game._MOVE_MS);
    return true;
}

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
