// perception.js — who can see what.
//
// The ONE authoritative answer to "can this watcher perceive this tile", shared
// by the chase AI (npc.js) and the threat overlay (renderer.js) so the two can
// never disagree — the disagreement the old READ-ONLY aggro overlay existed to
// avoid. Pure leaf module: imports only utils.js + pathing.js, so it is
// node-testable in isolation the way ai.js / pathing.js / rings.js are.
//
// Three zones, measured from the watcher's facing:
//   cone       ±45°, full sightRange       → DIRECT (spotted)
//   periphery  ±90°, ceil(sightRange / 2)  → PERIPHERAL (accrues suspicion)
//   rear       anything behind             → NONE (blind at any range)
//
// The property the whole design rests on: for ALL EIGHT facings, cardinal and
// diagonal alike, the eight adjacent tiles split identically into 3 cone /
// 2 peripheral / 3 blind. So the entire player-facing rule is "the three tiles
// behind them are the blind spot" — no exceptions to memorise.
//
// Design: plans/stealth-perception-and-thieve.md

import { chebyshev } from './utils.js';
import { hasLineOfSight } from './pathing.js';

export const VERDICT = { DIRECT: 'DIRECT', PERIPHERAL: 'PERIPHERAL', NONE: 'NONE' };

export const CONE_COS         = Math.cos(Math.PI / 4);  // ±45° → a 90° wedge
export const PERIPH_COS       = 0;                      // ±90°
export const PERIPH_RANGE_DIV = 2;                      // periphery = ceil(sight / 2)

// Float slack. cos for a diagonal offset computes to 0.7071067811865475 while
// Math.cos(PI/4) is 0.7071067811865476 — one unit in the last place apart, and
// WITHOUT this epsilon the two diagonal front tiles fall out of the cone and the
// 3/2/3 property silently breaks (the blind spot quietly becomes five tiles
// wide). The all-facings test in tests/perception.test.js is what catches that.
const EPS = 1e-9;

// Authored spawn facing → the same vector pair stepEntity stamps. Screen coords:
// y grows downward, so N is -1 (matches wheel-model.js's RING8, "clockwise from N").
export const FACING_VECTORS = {
    N: [0, -1], NE: [1, -1], E: [1, 0], SE: [1, 1],
    S: [0, 1], SW: [-1, 1], W: [-1, 0], NW: [-1, -1],
};

// Facing as a vector. Enemies stamp _lastDx/_lastDy on every step (pathing.js
// stepEntity) and the pair is persisted; one that has never moved reads (0,0),
// which is not a direction — those face south, toward the camera.
export function facingOf(watcher) {
    const fx = watcher?._lastDx ?? 0;
    const fy = watcher?._lastDy ?? 0;
    if (fx === 0 && fy === 0) return { fx: 0, fy: 1 };
    return { fx, fy };
}

// The verdict for one watcher against one tile.
export function perceives(map, watcher, tx, ty) {
    if (!watcher) return VERDICT.NONE;

    const dx = tx - watcher.x;
    const dy = ty - watcher.y;
    if (dx === 0 && dy === 0) return VERDICT.DIRECT;   // its own tile, trivially

    const sight = watcher.sightRange ?? 0;
    if (sight <= 0) return VERDICT.NONE;

    const dist = chebyshev(watcher.x, watcher.y, tx, ty);
    if (dist > sight) return VERDICT.NONE;

    const { fx, fy } = facingOf(watcher);
    const cos = (fx * dx + fy * dy) / (Math.hypot(fx, fy) * Math.hypot(dx, dy));

    // Behind: blind at any range, and cheap to reject before walking the LOS line.
    if (cos < PERIPH_COS - EPS) return VERDICT.NONE;
    if (!hasLineOfSight(map, watcher.x, watcher.y, tx, ty)) return VERDICT.NONE;
    if (cos >= CONE_COS - EPS) return VERDICT.DIRECT;
    return dist <= Math.ceil(sight / PERIPH_RANGE_DIV) ? VERDICT.PERIPHERAL : VERDICT.NONE;
}

// Every watcher holding DIRECT on (x,y). "Am I hidden" is `spotters(...).length === 0`
// — note that PERIPHERAL deliberately does NOT count: being half-noticed from a
// flank is not being seen, it is what makes them turn to look.
export function spotters(map, watchers, x, y) {
    return (watchers || []).filter(w => perceives(map, w, x, y) === VERDICT.DIRECT);
}
