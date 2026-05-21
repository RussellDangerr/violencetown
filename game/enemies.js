// enemies.js — Enemy entities, Bresenham LOS, dispatch to FSM or legacy chase
//
// Per the project's character ontology (Character > {Hero, NPC > {Enemy,
// non-hostile NPC}}), this file holds the Enemy class — the hostile-NPC
// subclass with chase+attack as its default. Non-hostile NPC behavior and
// the general FSM live in npc.js. A future cleanup may rename Enemy → Npc
// and consolidate these files; for now, the Enemy class persists for back-
// compat with the original chase-only behavior.
//
// Dispatch rule (added in feature/sewer-npc-skeleton step 3): if a spawn
// entry includes a `behavior` array, that entry is FSM-controlled and is
// routed to tickNpcState in npc.js. If `behavior` is absent, the entry
// runs the legacy chase logic preserved below. This makes the FSM purely
// additive — existing map JSONs without `behavior` fields keep working.

import { Entity, attack, formatDamageNumber } from './combat.js';
import { manhattan } from './utils.js';
import { getGreedyStep } from './pathing.js';
import { tickNpcState } from './npc.js';

const DEFAULT_SIGHT = 8;
const DEFAULT_DAMAGE = 8;

export class Enemy {
    constructor({
        id, type, x, y,
        hp = 50, armor = 0, damage = DEFAULT_DAMAGE, sightRange = DEFAULT_SIGHT,
        // FSM fields (optional; absence triggers legacy chase behavior)
        behavior = null,
        homeRegion = null,
        wanderRadius = 3,
        wanderEveryTurns = 4,
        // Disposition fields (read by future feature/give-action; inert here)
        disposition = null,
        flipThreshold = null,
        bribeable = null,
        values = null,
        onFlip = null,
    }) {
        this.id         = id;
        this.type       = type;
        this.x          = x;
        this.y          = y;
        this.damage     = damage;
        this.sightRange = sightRange;
        this.state      = 'idle'; // legacy chase state: 'idle' | 'chasing'
        this.entity     = new Entity({ name: `[${type}]`, hp, armor });

        // FSM config (null behavior = legacy entry; non-null = FSM-controlled)
        this.behavior         = behavior;
        this.homeRegion       = homeRegion;
        this.wanderRadius     = wanderRadius;
        this.wanderEveryTurns = wanderEveryTurns;

        // FSM runtime state (initialized lazily in tickNpcState)
        this.fsmState         = null;
        this._lastWanderTurn  = 0;

        // Disposition data — stored but not yet read. See plans/give-action-
        // and-disposition.md for the feature that consumes these fields.
        this.disposition   = disposition;
        this.flipThreshold = flipThreshold;
        this.bribeable     = bribeable;
        this.values        = values;
        this.onFlip        = onFlip;
    }
}

// ── Bresenham Line-of-Sight ──────────────────────────────────────────────────

export function hasLineOfSight(map, x0, y0, x1, y1) {
    let dx = Math.abs(x1 - x0);
    let dy = Math.abs(y1 - y0);
    let sx = x0 < x1 ? 1 : -1;
    let sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    let cx = x0;
    let cy = y0;

    while (cx !== x1 || cy !== y1) {
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; cx += sx; }
        if (e2 <  dx) { err += dx; cy += sy; }

        // If we haven't reached the target and hit a wall, no LOS
        if ((cx !== x1 || cy !== y1) && !map.isWalkable(cx, cy)) {
            return false;
        }
    }

    return true;
}

// ── Resolve all enemies for one turn ─────────────────────────────────────────
//
// Two paths:
//   1. If the enemy has a `behavior` whitelist, dispatch to tickNpcState
//      (the FSM in npc.js). The FSM may transition IDLE ↔ WANDER and
//      eventually WORKING / HOSTILE. Returns log messages.
//   2. Otherwise, run the legacy chase logic — LOS check, transition to
//      'chasing' on first sighting, attack-if-adjacent, greedy step toward
//      player. This is exactly the v0.4.x behavior preserved for back-compat.

export function resolveEnemyTurns(game) {
    const messages = [];

    for (const enemy of game.enemies) {
        if (!enemy.entity.isAlive()) continue;

        // FSM-controlled entry?
        if (enemy.behavior) {
            const npcMessages = tickNpcState(game, enemy);
            for (const m of npcMessages) messages.push(m);
            continue;
        }

        // Legacy chase logic below — unchanged from v0.4.3-dev behavior.
        const dist = manhattan(enemy.x, enemy.y, game.playerX, game.playerY);

        // Check LOS
        if (dist <= enemy.sightRange && hasLineOfSight(game.map, enemy.x, enemy.y, game.playerX, game.playerY)) {
            if (enemy.state === 'idle') {
                enemy.state = 'chasing';
                messages.push(`[${enemy.entity.name} spotted you!]`);
            }
        }

        if (enemy.state !== 'chasing') continue;

        // Adjacent? Attack.
        if (dist <= 1) {
            // Use game.applyDamageToPlayer so Guard buff can halve damage
            const dealt = game.applyDamageToPlayer(enemy.damage);
            const killed = game.playerHp === 0;
            let s = `${dealt}`;
            if (killed) s += ' ✕';
            messages.push(`[${enemy.entity.name} attacks — ${s}]`);
            continue;
        }

        // Chase: greedy move toward player
        const bestMove = getGreedyStep(
            game,
            { x: enemy.x, y: enemy.y },
            { x: game.playerX, y: game.playerY },
            { self: enemy }
        );
        if (bestMove) {
            enemy.x = bestMove.x;
            enemy.y = bestMove.y;
        }
    }

    return messages;
}
