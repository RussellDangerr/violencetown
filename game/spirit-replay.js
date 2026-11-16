// spirit-replay.js — the boss-door replay (plans/heroic-spirits.md, slice 3,
// HS-R2). Near the spot where a heroic spirit fell to a boss, while that foe
// still stands, the spirit's last few turns play again, faint. Opt-in: off
// unless Settings.spirits is on.
//
// Showing a spirit never draws game.rng (rule 2): which replay shows is picked
// by distance and seed, and its frame by the clock alone.

import { hashJson, retire } from './spirits.js';

export const REPLAY_ROWS = 8;     // the rows a hero lived before the fall
export const REPLAY_RADIUS = 6;   // tiles from the fall at which it shows
export const ROW_MS = 500;        // one row per half second (the idle redraw is 250 ms)
export const HOLD_ROWS = 2;       // beats the fall is held before it loops

const zone = (url) => (typeof url === 'string' ? url.replace(/-map\.json$/, '') : null);
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

// Every replay in a spirit set: for each fall to a boss, the rows the hero
// lived just before it on that map (never reaching back past an earlier fall
// or another map), ending on the fall itself. A spirit with no track (retired)
// has none.
export function replaysOf(spirits, rows = REPLAY_ROWS) {
    const out = [];
    for (const s of spirits || []) {
        const track = s?.track;
        if (!track) continue;
        track.forEach((r, i) => {
            if (r.act !== 'fell' || !r.boss) return;
            const before = [];
            for (let j = i - 1; j >= 0 && before.length < rows; j--) {
                const p = track[j];
                if (p.map !== r.map || p.act === 'fell') break;
                if (p.act !== 'felled') before.unshift(p);
            }
            out.push({
                hero: s.hero, attempt: s.attempt, cleared: !!s.outcome?.cleared,
                map: r.map, by: r.by, at: { x: r.x, y: r.y }, turn: r.t,
                rows: [...before, r],
            });
        });
    }
    return out;
}

// The one replay to show, or null: on this map, within `radius` of where it
// fell, its foe still standing (`standing` holds the live foes' names). A
// spirit that never cleared comes first (rule 5), then the nearest, then the
// lowest seed, then the hero's name, so the same place always shows the same
// spirit.
export function pickReplay(replays, map, player, standing, radius = REPLAY_RADIUS) {
    let best = null;
    for (const r of replays) {
        if (r.map !== map || !standing.has(r.by)) continue;
        const d = cheb(r.at, player);
        if (d > radius) continue;
        const key = [r.cleared ? 1 : 0, d, r.attempt, r.hero];
        if (!best || cmp(key, best.key) < 0) best = { r, key };
    }
    return best ? best.r : null;
}
const cmp = (a, b) => {
    for (let i = 0; i < a.length; i++) {
        if (a[i] < b[i]) return -1;
        if (a[i] > b[i]) return 1;
    }
    return 0;
};

// The row a replay shows at `now` ms: one row per ROW_MS, the last one held
// for HOLD_ROWS more, then from the top.
export function replayRow(replay, now, rowMs = ROW_MS) {
    const n = replay.rows.length;
    const i = Math.floor(Math.max(0, now) / rowMs) % (n + HOLD_ROWS);
    return replay.rows[Math.min(i, n - 1)];
}

// ── Loading (only once the switch is on) ───────────────────────────────────

let loading = null;
let replays = null;

// Fetch the harvested set and every zone map its spirits walked; retire the
// tracks whose map moved (rule 4), and keep the replays left. `fetchJson` is
// injectable for tests. Resolves to the replays; never throws.
export function loadReplays(fetchJson = (url) => fetch(url).then((r) => r.json())) {
    if (!loading) {
        loading = (async () => {
            try {
                const set = await fetchJson('spirits-harvest.json');
                const zones = [...new Set(set.spirits.flatMap((s) => Object.keys(s.provenance?.maps || {})))];
                const hashes = {};
                await Promise.all(zones.map(async (z) => {
                    try { hashes[z] = hashJson(await fetchJson(`${z}-map.json`)); } catch { hashes[z] = null; }
                }));
                replays = replaysOf(set.spirits.map((s) => retire(s, hashes)));
            } catch {
                replays = [];
            }
            return replays;
        })();
    }
    return loading;
}

// For tests: forget what was loaded.
export function resetReplays() { loading = null; replays = null; }

// What the renderer draws this frame (game._spiritShow), or null. Off, or not
// loaded yet, is nothing; the first call with the switch on starts the load.
export function spiritToShow(game, on, now) {
    if (!on) return null;
    if (!replays) { loadReplays(); return null; }
    const standing = new Set((game.enemies || [])
        .filter((e) => e?.entity?.isAlive?.())
        .map((e) => e.type || e.tag || e.id));
    const r = pickReplay(replays, zone(game._mapUrl), { x: game.playerX, y: game.playerY }, standing);
    return r ? { hero: r.hero, attempt: r.attempt, by: r.by, row: replayRow(r, now) } : null;
}
