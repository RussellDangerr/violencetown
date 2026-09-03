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

    // (Phase 6) Night shrinks the cone. The Town Clock's lighting grade is
    // stamped onto each watcher on the world beat, so a guard genuinely sees less
    // after dark rather than merely looking like it — the same number the screen
    // is dimmed by is the number their sight is cut by.
    //
    // Read defensively: a watcher built by a test, or by any path that never went
    // through a world beat, has no _nightLevel and simply sees in full daylight.
    const night = Math.max(0, Math.min(1, watcher._nightLevel ?? 0));
    const sight = Math.max(0, Math.round((watcher.sightRange ?? 0) * (1 - 0.4 * night)));
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

// ── The awareness ladder ────────────────────────────────────────────────────
//
// idle → suspicious → searching → chasing → returning → idle
//
// This is a RENAME, not a new state axis. Enemies already carry `fsmState`
// (IDLE/WANDER/WORKING/HOSTILE/ALLIED) and a legacy `state`
// (idle/chasing/returning); a third variable would be exactly the ballooning
// plans/systems-audit-2026-08.md warns about. So the ladder extends `state` —
// and most of it already existed unnamed, since a blind chaser already pursued
// _lastSeenX/Y and gave up on arrival. That was searching without a name.

export const SUSPICION_BEATS   = 2;  // consecutive PERIPHERAL beats → suspicious
export const CALM_BEATS        = 6;  // sweeping a KNOWN last-seen this long → returning
export const BLIND_SWEEP_BEATS = 8;  // a robbed victim, with NO last-seen, casts about longer

// Pure: reads the npc, returns the transition. The caller applies it.
// Returns { state, awareBeats, sweepBeats, faceTo?, lastSeen? }.
export function nextAwareness(npc, verdict, playerPos) {
    const state = npc.state ?? 'idle';
    const awareBeats = npc._awareBeats ?? 0;
    const sweepBeats = npc._sweepBeats ?? 0;

    // A live sighting outranks every other transition, from any state.
    if (verdict === VERDICT.DIRECT) {
        return { state: 'chasing', awareBeats: 0, sweepBeats: 0, lastSeen: { ...playerPos } };
    }

    if (verdict === VERDICT.PERIPHERAL) {
        const beats = awareBeats + 1;
        if (state === 'idle' && beats >= SUSPICION_BEATS) {
            // Turn to look — and DON'T advance. This beat is the window in which
            // the player ducks back behind the corner; it is the whole reason a
            // peripheral glance is not a death sentence.
            return { state: 'suspicious', awareBeats: 0, sweepBeats: 0, faceTo: { ...playerPos } };
        }
        return { state, awareBeats: beats, sweepBeats };
    }

    // verdict === NONE
    switch (state) {
        case 'suspicious':
            return { state: 'searching', awareBeats: 0, sweepBeats: 0 };
        case 'chasing':
            // Lost contact. Becomes a search of the LAST-SEEN tile — deliberately
            // NOT refreshed here, so a blind chaser never tracks through a wall.
            return { state: 'searching', awareBeats: 0, sweepBeats: 0 };
        case 'searching': {
            const beats = sweepBeats + 1;
            // No last-seen means a theft victim: they know they were robbed but not
            // by whom or from where, so there is nowhere to walk to. They cast about
            // for longer before giving up.
            const limit = (npc._lastSeenX == null) ? BLIND_SWEEP_BEATS : CALM_BEATS;
            if (beats >= limit) return { state: 'returning', awareBeats: 0, sweepBeats: 0 };
            return { state, awareBeats: 0, sweepBeats: beats };
        }
        default:
            return { state, awareBeats: 0, sweepBeats };
    }
}

// ── Noise ───────────────────────────────────────────────────────────────────
//
// Generalises ai.js's rockClatter, which its own comment called "the game's first
// stealth affordance". Same rule, now the general case: a sound sets a FALSE
// last-seen without the maker ever having been seen. An enemy already chasing (or
// already searching, which has its own lead) is NOT redirected — a rock distracts,
// it does not rescue you from a fight you already started.
//
// Sound ignores walls in v1. It goes around corners, which is both truthful and
// the forgiving direction for the AI: noise cannot see through a wall to find
// you, it can only mislocate attention.
//
// NOTE: rockClatter is NOT yet retired into this — that happens with the main.js
// call-site wiring, which is deferred until feature/unified-offer-screen lands.

export const NOISE = {
    step:         1,   // effectively silent; present so it is tunable
    door:         4,   // a door, the pipe-jam
    cast:         5,
    melee:        6,   // fighting is loud; a brawl draws a crowd
    throwImpact:  8,   // preserves the rock's shipped `sightRange ?? 8` reach
    theft:        0,   // silent BY DEFINITION — only the victim ever reacts
};

export function emitNoise(watchers, x, y, loudness) {
    if (!(loudness > 0)) return;
    for (const w of watchers || []) {
        if (!w || !w.entity?.isAlive?.()) continue;
        if (w.state !== 'idle' && w.state !== 'suspicious') continue;
        if (chebyshev(w.x, w.y, x, y) > loudness + (w.hearingRange ?? 0)) continue;
        w._lastSeenX = x;
        w._lastSeenY = y;
        w.state = 'suspicious';
        w._awareBeats = 0;
        w._sweepBeats = 0;
    }
}
