// fight-area.js — who is in a fight, and what they can see (plans/fight-fog.md §1).
//
// A fight's area is every tile at least one fighter perceives: the same
// perceives() the chase AI and the threat overlay ask, so standing outside it
// genuinely means none of them can see you there. The renderer draws the fog
// from it; F3 (who gets pulled into a fight) will read it too.
//
// Pure: game data in, numbers out. Node-testable like perception.js.

import { isHunting } from './ai.js';
import { perceives, VERDICT } from './perception.js';

// How many tiles past the view's edge the area reaches, so the fog's blur and
// a step's scroll never show where it stops.
export const FIGHT_MARGIN = 3;

// The enemies in the fight: the ones isCombatActive counts (alive, not
// ambient, hunting you), less allies and anyone without eyes — the threat
// overlay's watcher filter. A fight is on while this is non-empty.
export function fighters(enemies) {
    return (enemies || []).filter(e =>
        !!e && !e.ambient && !e._ally && isHunting(e)
        && !!e.entity?.isAlive?.() && (e.sightRange || 0) > 0);
}

// The area over `bounds` ({ x0, y0, x1, y1 }, inclusive, world tiles). Returns
// { x0, y0, w, h, seen, dist }, indexed k = (y - y0) * w + (x - x0):
//   seen[k] is 1 where a fighter perceives the tile (DIRECT or PERIPHERAL);
//   dist[k] is 0 there, the Chebyshev steps to the nearest seen tile
//   elsewhere, and -1 everywhere when nothing in bounds is seen.
export function fightArea(map, fs, bounds) {
    const { x0, y0 } = bounds;
    const w = bounds.x1 - x0 + 1, h = bounds.y1 - y0 + 1;
    const seen = new Uint8Array(w * h);
    const dist = new Int16Array(w * h).fill(-1);
    const queue = [];
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const tx = x0 + x, ty = y0 + y;
            if (fs.some(f => perceives(map, f, tx, ty) !== VERDICT.NONE)) {
                const k = y * w + x;
                seen[k] = 1; dist[k] = 0; queue.push(k);
            }
        }
    }
    // Breadth-first outward from what they see; eight-way steps make it Chebyshev.
    for (let head = 0; head < queue.length; head++) {
        const k = queue[head], x = k % w, y = (k - x) / w;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                const nk = ny * w + nx;
                if (dist[nk] !== -1) continue;
                dist[nk] = dist[k] + 1;
                queue.push(nk);
            }
        }
    }
    return { x0, y0, w, h, seen, dist };
}

// One tile of an area, in world coordinates. Outside it reads as unseen, with
// no distance.
export function areaAt(area, x, y) {
    const i = x - area.x0, j = y - area.y0;
    if (i < 0 || j < 0 || i >= area.w || j >= area.h) return { inside: false, seen: false, dist: -1 };
    const k = j * area.w + i;
    return { inside: true, seen: area.seen[k] === 1, dist: area.dist[k] };
}
