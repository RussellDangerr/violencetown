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

// A tile a character may step onto — the single source of truth for occupancy,
// shared by getGreedyStep, fleeStep, and findPath so every mover (player click-
// to-move OR enemy/NPC chase) agrees about what's blocked: open floor, no other
// living character (self excluded), no container, and — unless allowed — not the
// player's own tile.
export function stepFree(game, x, y, opts = {}) {
    const { self = null, avoidPlayer = true } = opts;
    if (!game.map.isWalkable(x, y)) return false;
    if (game.enemies.some(e => e !== self && e.entity.isAlive() && e.x === x && e.y === y)) return false;
    if (avoidPlayer && x === game.playerX && y === game.playerY) return false;
    if (game.containers?.some(cc => cc.x === x && cc.y === y)) return false;
    return true;
}

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

    const free = (x, y) => stepFree(game, x, y, { self, avoidPlayer });

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

// ── Flee: one step AWAY from the player ─────────────────────────────────────
//
// The inverse of getGreedyStep — pick the 8-way neighbour that most INCREASES
// Chebyshev distance from the player. A feared enemy's retreat. Same occupancy
// and no-corner-cutting rules as the chase step. Returns {x,y}, or null when
// boxed in / already as far as it can get (nowhere strictly better → cower).
export function fleeStep(game, enemy) {
    const fx = enemy.x, fy = enemy.y;
    const px = game.playerX, py = game.playerY;

    const ortho = [
        { x: fx - 1, y: fy }, { x: fx + 1, y: fy },
        { x: fx, y: fy - 1 }, { x: fx, y: fy + 1 },
    ];
    const diag = [
        { x: fx - 1, y: fy - 1 }, { x: fx + 1, y: fy - 1 },
        { x: fx - 1, y: fy + 1 }, { x: fx + 1, y: fy + 1 },
    ];

    let bestDist = chebyshev(fx, fy, px, py);
    let best = null;

    const free = (x, y) => stepFree(game, x, y, { self: enemy });   // avoidPlayer defaults true
    const consider = (c) => {
        if (!free(c.x, c.y)) return;
        const d = chebyshev(c.x, c.y, px, py);
        if (d > bestDist) { bestDist = d; best = c; }
    };

    for (const c of ortho) consider(c);
    for (const c of diag) {
        // No corner-cutting: both orthogonal components must be open floor.
        if (!game.map.isWalkable(c.x, fy) || !game.map.isWalkable(fx, c.y)) continue;
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

// ── Full path (BFS) — for click-to-move / click-to-interact ──────────────────
//
// Breadth-first search from `from` to `to` over the 8-way grid, reusing stepFree
// (so it agrees with the greedy chase about occupancy) and the same no-corner-
// cutting rule. Unlike getGreedyStep this WON'T dead-end on a concave wall — it
// finds the shortest step-path or reports there is none.
//
// Returns the path as an array of { x, y } tiles EXCLUDING `from` (each one a
// single step from the last); `[]` when already satisfied; `null` when the
// destination is unreachable.
//
// options:
//   - adjacent:   goal is any tile with Chebyshev ≤ 1 of `to` (and never `to`
//                 itself) — used to walk UP TO an NPC/item, then act.
//   - self:       the mover, skipped in the occupancy check (default null = Hero).
//   - avoidPlayer: default false — the Hero paths from its own tile, so its
//                 current tile must not read as blocked.
//   - maxNodes:   explored-node safety cap (default 4096).
export function findPath(game, from, to, options = {}) {
    const { adjacent = false, self = null, avoidPlayer = false, maxNodes = 4096 } = options;
    const isTarget = (n) => n.x === to.x && n.y === to.y;
    const goal = (n) => adjacent ? (chebyshev(n.x, n.y, to.x, to.y) <= 1 && !isTarget(n)) : isTarget(n);

    if (goal(from)) return [];   // already there (or already adjacent)

    const key = (x, y) => `${x},${y}`;
    const prev = new Map();
    const seen = new Set([key(from.x, from.y)]);
    const queue = [from];
    let head = 0, explored = 0;
    const NB = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];

    while (head < queue.length) {
        const cur = queue[head++];
        if (++explored > maxNodes) break;
        for (const [dx, dy] of NB) {
            const nx = cur.x + dx, ny = cur.y + dy, k = key(nx, ny);
            if (seen.has(k)) continue;
            // No corner-cutting: a diagonal needs both orthogonal seams open.
            if (dx !== 0 && dy !== 0 &&
                (!game.map.isWalkable(cur.x + dx, cur.y) || !game.map.isWalkable(cur.x, cur.y + dy))) continue;
            // In adjacent mode the target's own tile is never walked onto (we stop
            // beside it); otherwise it must be a stand-able tile like any other.
            const passable = (adjacent && nx === to.x && ny === to.y)
                ? false
                : stepFree(game, nx, ny, { self, avoidPlayer });
            if (!passable) continue;
            seen.add(k);
            prev.set(k, cur);
            const node = { x: nx, y: ny };
            if (goal(node)) {
                const path = [];
                for (let c = node; c && !(c.x === from.x && c.y === from.y); c = prev.get(key(c.x, c.y))) {
                    path.push({ x: c.x, y: c.y });
                }
                path.reverse();
                return path;
            }
            queue.push(node);
        }
    }
    return null;
}

// ── Bresenham Line-of-Sight ──────────────────────────────────────────────────
//
// Pure map LOS — walk the Bresenham line from (x0,y0) to (x1,y1) and report
// whether an unwalkable tile blocks it before the target. Lives here (not in
// enemies.js) so both the chase AI (npc.js HOSTILE case) and the aggro overlay
// (renderer.js) can share it without an enemies.js↔npc.js import cycle.
export function hasLineOfSight(map, x0, y0, x1, y1) {
    if (x0 === x1 && y0 === y1) return true;  // same cell — trivially visible; avoids a degenerate loop
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
