// away.js (CK1) — how long the player was away, in whole hours.
//
// The save already stamps `savedAt`, and the game saves when the tab is hidden, so the time
// away is the gap between that stamp and now. It is read once per return (a load, or the tab
// becoming visible again) and never by counting timers. Nothing here touches the main RNG.

export const MS_PER_HOUR = 3600 * 1000;
// PLACEHOLDER: 7 days. The top of the clamp; Caelan has not chosen the real number.
export const MAX_AWAY_HOURS = 24 * 7;

// Whole hours from `savedAt` to `now`. A clock set backwards, or a missing or garbled stamp,
// gives 0; a long absence is capped at MAX_AWAY_HOURS.
export function hoursAway(savedAt, now) {
    if (typeof savedAt !== 'number' || typeof now !== 'number') return 0;
    if (!Number.isFinite(savedAt) || !Number.isFinite(now)) return 0;
    const hours = Math.floor((now - savedAt) / MS_PER_HOUR);
    if (!(hours > 0)) return 0;
    return Math.min(hours, MAX_AWAY_HOURS);
}

// Work out the hours away and keep them on the game as `hoursAway`. Returns the number.
export function readAway(game, savedAt, now = Date.now()) {
    game.hoursAway = hoursAway(savedAt, now);
    game.awaySavedAt = savedAt;   // (CK2) the news is keyed on the save's own stamp
    game.awayRestHours = game.hoursAway;   // (WP1) the news clears hoursAway on a zone change; this stays for the rested check
    return game.hoursAway;
}

// ── CK2: the city tells you something happened ───────────────────────────────────────────
// News only: one line in the log, the first time you change zone after an hour or more away.
// It costs nothing and changes no state. Which line it is comes from a hash of the save's own
// stamp and the hours away, run through a small stream of its own: the same save and the same
// hours give the same news, and game.rng is never read or advanced.

export const NEWS_MIN_HOURS = 1;
// PLACEHOLDER pool: obviously fake lines. Caelan writes the real ones.
export const NEWS_LINES = [
    '[TEXT] news A',
    '[TEXT] news B',
    '[TEXT] news C',
    '[TEXT] news D',
];

// FNV-1a over a string, as an unsigned 32-bit number.
function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
}

// A first draw from the news's own stream (mulberry32 seeded by the hash). Pure.
function newsDraw(seed) {
    let a = (seed + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// The news line for a save stamp and hours away, or null when it was under an hour.
export function pickNews(savedAt, hours) {
    if (!(hours >= NEWS_MIN_HOURS)) return null;
    const r = newsDraw(fnv1a(`away-news|${savedAt}|${hours}`));
    return `${NEWS_LINES[Math.floor(r * NEWS_LINES.length)]} (${hours}h)`;
}

// Tell the news once, then forget the absence so a second zone change says nothing.
// `say` is the game's log. Returns the line told, or null.
export function tellAwayNews(game, say) {
    const hours = game.hoursAway;
    const line = pickNews(game.awaySavedAt, hours);
    game.hoursAway = 0;
    if (line) say(line);
    return line;
}

// ── WP1: quit beside a bench, come back rested ───────────────────────────────────────────
// One fixed buff per return (never banked, never stacked): the strength Poition's numbers.
// It costs nothing and changes nothing else. Placeholders: the name and the log line.

export const BENCH_TILE = 20;                 // the Town bench, HP1's rest spot
export const REST_ZONE = 'town-map.json';     // Town only for now (WP1R1)
export const RESTED_MIN_HOURS = NEWS_MIN_HOURS;   // CK1's one-hour threshold
export const RESTED_BUFF = { id: 'rested', name: '[TEXT] rested', turns: 5, stat: 'strength', amount: 6 };
export const RESTED_LINE = '[TEXT] you come back rested.';

// True when (x, y) has a bench on one of its four sides, the way a hero faces one.
export function besideBench(map, x, y) {
    if (!map || typeof map.getTile !== 'function') return false;
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => map.getTile(x + dx, y + dy) === BENCH_TILE);
}

// Give the rested buff when the player is in the Town beside a bench and was away an hour or
// more. The save's own stamp marks it as given, so reading the same return twice gives it once.
// Returns true when it was given.
export function restedOnReturn(game, say) {
    if (!(game.awayRestHours >= RESTED_MIN_HOURS)) return false;
    if (game.map?.url !== REST_ZONE) return false;
    if (!besideBench(game.map, game.playerX, game.playerY)) return false;
    if (game.awaySavedAt != null && game._restedFor === game.awaySavedAt) return false;
    if (typeof game._inCombat === 'function' && game._inCombat()) return false;
    game._restedFor = game.awaySavedAt;
    const b = RESTED_BUFF;
    game.addBuff(b.id, b.name, b.turns, 'buff', { stat: b.stat, amount: b.amount });
    if (say) say(RESTED_LINE);
    return true;
}
