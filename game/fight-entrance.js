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

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
const easeInOut = (t) => { t = clamp01(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };

// What `ms` into an entrance draws: whether the impact frame is up (and how
// far through it), and the zoom factor. Reduce motion drops both.
export function entranceAt(entrance, ms, { reduceMotion = false } = {}) {
    if (!entrance || reduceMotion || !(ms >= 0)) return { impact: false, impactT: 1, zoom: 1 };
    const lift = entrance.zoom - 1;
    let zoom = 1;
    if (lift > 0 && ms < ZOOM_IN_MS) zoom = 1 + lift * easeOut(ms / ZOOM_IN_MS);
    else if (lift > 0 && ms < ZOOM_IN_MS + ZOOM_OUT_MS) zoom = 1 + lift * (1 - easeInOut((ms - ZOOM_IN_MS) / ZOOM_OUT_MS));
    return { impact: ms < IMPACT_MS, impactT: clamp01(ms / IMPACT_MS), zoom };
}

// How far one fogged tile has faded in, 0..1, `ms` into the fight. `order` is
// its place in the roll (steps from their sight when rolling out, from the
// screen's edge when closing in), `maxOrder` the largest in play, `jitter` its
// own 0..1 scatter. Quiet (reduce motion, or no entrance) fades every tile
// together.
export function fogReveal(order, maxOrder, ms, jitter, { quiet = false } = {}) {
    if (quiet) return clamp01(ms / QUIET_FADE_MS);
    const room = ROLL_LAST_START_MS - IMPACT_MS - ROLL_JITTER_MS;
    const step = maxOrder > 0 ? Math.min(ROLL_STEP_MS, room / maxOrder) : ROLL_STEP_MS;
    const start = IMPACT_MS + order * step + jitter * ROLL_JITTER_MS;
    return clamp01((ms - start) / TILE_FADE_MS);
}

// How deep the fog lies on a tile `dist` steps from their sight (0 = seen).
export function fogDepth(dist) {
    if (!(dist > 0)) return 0;
    return FOG_NEAR + (1 - FOG_NEAR) * Math.min(1, (dist - 1) / FOG_FAR_TILES);
}

// The fog's strength `ms` after the fight ended: 1, easing to 0 by FOG_OUT_MS.
export function fogOut(ms) {
    return 1 - easeInOut(ms / FOG_OUT_MS);
}

// Whether the fight's fog or entrance is still moving. main.js keeps the
// render loop alive while it is.
export function fightFxActive(on, start, endedAt, now) {
    if (on) return !!start && now - start.at < FOG_IN_MS;
    return endedAt != null && now - endedAt < FOG_OUT_MS;
}

// A tile's own 0..1 scatter, the same every frame.
export function tileJitter(x, y) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
