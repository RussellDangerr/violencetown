// enemies.js — Enemy entities, Bresenham LOS, greedy chase AI
// Sewer demo prototype

import { Entity, attack, formatDamageNumber } from './combat.js';
import { manhattan } from './utils.js';

const DEFAULT_SIGHT = 8;
const DEFAULT_DAMAGE = 8;

export class Enemy {
    constructor({ id, type, x, y, hp = 50, armor = 0, damage = DEFAULT_DAMAGE, sightRange = DEFAULT_SIGHT }) {
        this.id         = id;
        this.type       = type;
        this.x          = x;
        this.y          = y;
        this.damage     = damage;
        this.sightRange = sightRange;
        this.state      = 'idle'; // 'idle' | 'chasing'
        this.entity     = new Entity({ name: `[${type}]`, hp, armor });
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

export function resolveEnemyTurns(game) {
    const messages = [];

    for (const enemy of game.enemies) {
        if (!enemy.entity.isAlive()) continue;

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

// ── Greedy single-step pathfinding ───────────────────────────────────────────
//
// Generalized in feature/sewer-npc-skeleton (step 1): any entity can call this
// to take one step toward any destination. Behavior for the existing chase use
// is identical — the call site passes {self: enemy} so the entity skips its own
// tile in the occupancy check.
//
// options:
//   - self:        the entity moving (skipped in occupancy check). Optional.
//   - avoidPlayer: if true (default), do not step onto the player's tile.
//                  Workers and other non-hostile pathing should leave this true;
//                  set false only if you specifically want to allow tile-overlap
//                  with the player (no current use case).

export function getGreedyStep(game, from, to, options = {}) {
    const { self = null, avoidPlayer = true } = options;

    const candidates = [
        { x: from.x - 1, y: from.y },
        { x: from.x + 1, y: from.y },
        { x: from.x, y: from.y - 1 },
        { x: from.x, y: from.y + 1 },
    ];

    let bestDist = manhattan(from.x, from.y, to.x, to.y);
    let best = null;

    for (const c of candidates) {
        if (!game.map.isWalkable(c.x, c.y)) continue;

        // Don't step on other living enemies (or self if for some reason
        // a duplicate-position entity exists in game.enemies)
        const occupied = game.enemies.some(
            e => e !== self && e.entity.isAlive() && e.x === c.x && e.y === c.y
        );
        if (occupied) continue;

        // Don't step on player (unless explicitly allowed)
        if (avoidPlayer && c.x === game.playerX && c.y === game.playerY) continue;

        const d = manhattan(c.x, c.y, to.x, to.y);
        if (d < bestDist) {
            bestDist = d;
            best = c;
        }
    }

    return best;
}
