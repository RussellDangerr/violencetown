// pathing.js — Pathfinding utilities for any character.
//
// Extracted from enemies.js in feature/sewer-npc-skeleton (step 3) so that
// both the legacy enemy chase logic and the new NPC FSM (npc.js) can share
// the same single-step pathfinder without introducing a circular import.
//
// Per the project ontology (Character > {Hero, NPC > {Enemy, friendly NPC}}),
// pathing is a Character-level concern — it doesn't care whether the mover
// is hostile, friendly, or going about its business. A future cleanup may
// consolidate Hero pathing here too; for now Hero uses the bump-move loop
// in main.js directly.

import { manhattan } from './utils.js';

// ── Greedy single-step pathfinding ──────────────────────────────────────────
//
// Take one step toward `to`, picking the orthogonal neighbor that minimizes
// Manhattan distance. Skips walls, other living characters, and (by default)
// the player tile.
//
// options:
//   - self:        the character moving (skipped in occupancy check). Optional.
//   - avoidPlayer: if true (default), do not step onto the player's tile.
//                  Workers and other non-hostile pathing should leave this true;
//                  set false only if you specifically want to allow tile-overlap
//                  with the player (no current use case).

export function getGreedyStep(game, from, to, options = {}) {
    const { self = null, avoidPlayer = true } = options;

    // (diagonal prototype) 8-way candidates — diagonals included so the whole
    // cast can cut corners and swarm from the diagonals. With the Manhattan
    // heuristic a diagonal step toward the target drops distance by 2 (vs 1 for
    // a cardinal), so chasers naturally prefer diagonals when off-axis. No
    // corner-cut restriction: a diagonal is allowed whenever its own tile is
    // clear (lets things squeeze between two blockers — that's the chaos).
    const candidates = [
        { x: from.x - 1, y: from.y },
        { x: from.x + 1, y: from.y },
        { x: from.x, y: from.y - 1 },
        { x: from.x, y: from.y + 1 },
        { x: from.x - 1, y: from.y - 1 },
        { x: from.x + 1, y: from.y - 1 },
        { x: from.x - 1, y: from.y + 1 },
        { x: from.x + 1, y: from.y + 1 },
    ];

    let bestDist = manhattan(from.x, from.y, to.x, to.y);
    let best = null;

    for (const c of candidates) {
        if (!game.map.isWalkable(c.x, c.y)) continue;

        // Don't step on other living characters (skip self if present)
        const occupied = game.enemies.some(
            e => e !== self && e.entity.isAlive() && e.x === c.x && e.y === c.y
        );
        if (occupied) continue;

        // Don't step on player (unless explicitly allowed)
        if (avoidPlayer && c.x === game.playerX && c.y === game.playerY) continue;

        // Don't step on containers (they're unwalkable entities)
        if (game.containers?.some(cc => cc.x === c.x && cc.y === c.y)) continue;

        const d = manhattan(c.x, c.y, to.x, to.y);
        if (d < bestDist) {
            bestDist = d;
            best = c;
        }
    }

    return best;
}

// ── Apply a one-tile step with a render-side slide ──────────────────────────
//
// Set the character's logical tile (collision/AI read x/y immediately, as
// before) AND stamp the fields the renderer reads to interpolate a smooth
// glide from the tile it just left — so enemies and NPCs walk their step
// instead of teleporting, matching the player's slide. `ms` should be the
// player's per-tile duration (game._MOVE_MS) so the whole scene moves at one
// cadence. (plans/movement-feel.md #6)
export function stepEntity(ent, x, y, ms) {
    ent._slideFromX = ent.x;
    ent._slideFromY = ent.y;
    if (x < ent.x) ent._faceLeft = true;        // horizontal facing for the flip;
    else if (x > ent.x) ent._faceLeft = false;  // vertical moves keep prior facing
    ent.x = x;
    ent.y = y;
    ent._slideStart = performance.now();
    ent._slideMs = ms || 150;
    ent._stepIndex = (ent._stepIndex || 0) + 1; // alternates the walk waddle/foot
}
