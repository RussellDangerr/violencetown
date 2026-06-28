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

import { chebyshev } from './utils.js';

// ── Greedy single-step pathfinding ──────────────────────────────────────────
//
// Take one step toward `to`, picking the 8-way neighbour that most reduces
// Chebyshev distance (diagonals cost the same as orthogonals). Skips walls,
// other living characters, and (by default) the player tile; a diagonal is
// only taken when both of its orthogonal component tiles are open, so enemies
// and allies never cut through a wall seam — symmetric with the player's rule.
//
// options:
//   - self:        the character moving (skipped in occupancy check). Optional.
//   - avoidPlayer: if true (default), do not step onto the player's tile.
//                  Workers and other non-hostile pathing should leave this true;
//                  set false only if you specifically want to allow tile-overlap
//                  with the player (no current use case).

export function getGreedyStep(game, from, to, options = {}) {
    const { self = null, avoidPlayer = true } = options;

    const ortho = [
        { x: from.x - 1, y: from.y }, { x: from.x + 1, y: from.y },
        { x: from.x, y: from.y - 1 }, { x: from.x, y: from.y + 1 },
    ];
    const diag = [
        { x: from.x - 1, y: from.y - 1 }, { x: from.x + 1, y: from.y - 1 },
        { x: from.x - 1, y: from.y + 1 }, { x: from.x + 1, y: from.y + 1 },
    ];

    let bestDist = chebyshev(from.x, from.y, to.x, to.y);
    let best = null;

    // A tile this character may step onto: open floor, no other living
    // character (self excluded), not the player (unless allowed), no container.
    const free = (x, y) => {
        if (!game.map.isWalkable(x, y)) return false;
        if (game.enemies.some(e => e !== self && e.entity.isAlive() && e.x === x && e.y === y)) return false;
        if (avoidPlayer && x === game.playerX && y === game.playerY) return false;
        if (game.containers?.some(cc => cc.x === x && cc.y === y)) return false;
        return true;
    };

    const consider = (c) => {
        if (!free(c.x, c.y)) return;
        const d = chebyshev(c.x, c.y, to.x, to.y);
        if (d < bestDist) { bestDist = d; best = c; }
    };

    for (const c of ortho) consider(c);
    for (const c of diag) {
        // No corner-cutting: both orthogonal components must be open floor.
        if (!game.map.isWalkable(c.x, from.y) || !game.map.isWalkable(from.x, c.y)) continue;
        consider(c);
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
