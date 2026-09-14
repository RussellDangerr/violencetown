// fight-entrance.js — how a fight arrives, and how its fog rolls in and out
// (plans/fight-fog.md §2).
//
// Three entrances, picked by how the fight started — you struck first, they
// spotted you, or it grew out of a search — each an impact frame, a zoom punch
// and a way for the fog to arrive. This module is the choice and the timeline;
// the renderer draws them. Pure: numbers in, numbers out.

// ── The timeline, in ms from the moment the fight began ─────────────────────
export const IMPACT_MS          = 110;    // the impact frame
export const ZOOM_IN_MS         = 80;     // the punch lands...
export const ZOOM_OUT_MS        = 280;    // ...and has settled by 360
export const ROLL_STEP_MS       = 34;     // per step of order, as the smoke rolls
export const ROLL_JITTER_MS     = 70;     // each tile's own scatter, so the edge reads as smoke
export const TILE_FADE_MS       = 150;    // each tile's own fade-in
export const ROLL_LAST_START_MS = 820;    // a big screen's step shrinks so its last tile starts by here
export const FOG_IN_MS          = 1000;   // all of the above is done inside this
export const QUIET_FADE_MS      = 300;    // reduce motion, or a fight resumed inside NO_REPLAY_MS
export const FOG_OUT_MS         = 520;    // the fog clearing when the fight ends
export const NO_REPLAY_MS       = 3000;   // a fight that restarts this soon gets no second entrance

// ── The fog's look ──────────────────────────────────────────────────────────
export const FOG_TINT       = 'rgb(58,62,84)';   // the cool dark the world multiplies toward
export const FOG_DENSITY    = 0.62;              // its strength at full depth
export const FOG_NEAR       = 0.4;               // depth at the edge of their sight...
export const FOG_FAR_TILES  = 7;                 // ...reaching full this many tiles further out
export const FOG_BLUR_TILES = 1.2;               // how soft its edge is

// ── The three entrances ─────────────────────────────────────────────────────
// impact: the impact frame's look. silhouette: how far you and the fighters
// are blown up about the fight's middle (0 = no silhouettes). zoom: the
// punch's peak. roll: whether the fog rolls out from their sight or closes in
// from the screen's edges.
export const ENTRANCES = Object.freeze({
    struck:  Object.freeze({ kind: 'struck',  impact: 'bw',       silhouette: 2.5, zoom: 1.08, roll: 'out' }),
    spotted: Object.freeze({ kind: 'spotted', impact: 'redblack', silhouette: 4,   zoom: 1.16, roll: 'in' }),
    search:  Object.freeze({ kind: 'search',  impact: 'flash',    silhouette: 0,   zoom: 1,    roll: 'out' }),
});

// How the fight started, read off its fighters at the moment it began. You
// struck first if you hit one of them this turn or the last: a blow lands
// before the world beat that turns them (main.js combatAttack stamps
// _struckAt). Otherwise they spotted you if any is chasing; otherwise it grew
// out of a search.
export function fightStartKind(fs, turn) {
    if (fs.some(f => f._struckAt != null && f._struckAt >= turn - 1)) return 'struck';
    if (fs.some(f => f.state === 'chasing')) return 'spotted';
    return 'search';
}

// The entrance a fight beginning at `now` gets, or none when the last fight
// ended under NO_REPLAY_MS ago, as when an enemy loses you and finds you again.
export function entranceFor(kind, lastEndedAt, now) {
    if (lastEndedAt != null && now - lastEndedAt < NO_REPLAY_MS) return null;
    return ENTRANCES[kind] ?? null;
}
