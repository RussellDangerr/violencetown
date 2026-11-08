// drops.js — pure helpers for the per-zone runtime dropped-items layer.
//
// The record + re-inject logic lives here so it is unit-testable under node:
// Game (main.js) touches document at load and can't be constructed in a test,
// while these functions are pure and mirror ai.js / pathing.js / rings.js.
// Game delegates from _recordDrop (record), _loadMap (re-inject), and
// _handleEnemyDeath (the unused-kit death drop, below).

import { resolveLoadout } from './enemies.js';

// Record a runtime drop into the per-map bucket ("mapUrl" → [{ type, x, y, count? }]).
// One record per {type,x,y}; a second drop of the same item on the same tile
// raises its `count` (left off while it is 1), so three Mystery Meat on one tile
// come back as three. Farming a respawned boss is closed elsewhere: its items drop
// only on the first kill (bossDropOnce), and a looted enemy comes back with no kit.
// Mutates `dropped`; returns true only if a new record was made.
export function recordDrop(dropped, url, type, x, y) {
    const bucket = (dropped[url] ||= []);
    const rec = bucket.find(d => d.type === type && d.x === x && d.y === y);
    if (rec) { rec.count = countOf(rec) + 1; return false; }
    bucket.push({ type, x, y });
    return true;
}

const countOf = (d) => (Number.isInteger(d?.count) && d.count > 1 ? d.count : 1);

// The runtime drops to re-inject for `url` on map load, one entry per item (a
// record with a count of 3 gives three). A record whose "url|x|y|type" key is in
// `collected` is skipped: that is how an older save marked a drop as taken.
// Pure read — returns a new [{ type, x, y }] array and mutates nothing; the
// caller resolves defs and places them.
export function pendingDrops(dropped, collected, url) {
    const out = [];
    for (const d of (dropped[url] || [])) {
        if (collected.has(`${url}|${d.x}|${d.y}|${d.type}`)) continue;
        for (let i = 0; i < countOf(d); i++) out.push({ type: d.type, x: d.x, y: d.y });
    }
    return out;
}

// One item taken off the ground: takes one off its drop record (dropping the
// record at zero) and returns true, or returns false when no record matches, so
// the caller marks an authored spawn collected instead. Mutates `dropped`.
export function takeDrop(dropped, url, type, x, y) {
    const bucket = dropped[url];
    if (!bucket) return false;
    const i = bucket.findIndex(d => d.type === type && d.x === x && d.y === y);
    if (i < 0) return false;
    const n = countOf(bucket[i]) - 1;
    if (n <= 0) bucket.splice(i, 1);
    else if (n === 1) delete bucket[i].count;
    else bucket[i].count = n;
    if (!bucket.length) delete dropped[url];
    return true;
}

// ── The respawn list (plans/ks1-respawn-list.md) ────────────────────────────
//
// A kill is remembered per zone ("mapUrl" → [{ id, age }]) and comes back over
// zone changes, a few at a time. `age` counts the zone changes since the kill.

// How many zone changes until every kill is back. One constant: 5 is a one-line change.
export const RESPAWN_STEPS = 7;

// Put a map-placed enemy's id on its zone's list. Mutates `lists`; returns true
// if it was added (an id already waiting is not added twice).
export function recordKill(lists, url, id) {
    if (!url || id == null) return false;
    const list = (lists[url] ||= []);
    if (list.some(k => k.id === id)) return false;
    list.push({ id, age: 0 });
    return true;
}

// One zone change. Every waiting kill ages one step. Kills made on the same visit
// share an age and drain together as a batch: a batch of n with stepsLeft steps
// to go sends back floor(n / (stepsLeft + 1)) of them, first killed first, and all
// of them once they have waited the full `steps`. A lone kill therefore waits
// every step, `steps` kills come back one per step, and a fresh batch is never
// hurried along by an older one. No dice. Mutates `lists` (an emptied zone is
// removed); returns { url: [ids back] } for the zones that got any.
export function stepRespawns(lists, steps = RESPAWN_STEPS) {
    const back = {};
    for (const url of Object.keys(lists)) {
        const list = lists[url];
        for (const k of list) k.age += 1;
        const leaving = new Set();
        for (const age of new Set(list.map(k => k.age))) {
            const batch = list.filter(k => k.age === age);      // kill order is kept
            const stepsLeft = Math.max(0, steps - age);
            const take = Math.floor(batch.length / (stepsLeft + 1));
            for (const k of batch.slice(0, take)) leaving.add(k);
        }
        if (leaving.size) {
            back[url] = list.filter(k => leaving.has(k)).map(k => k.id);
            lists[url] = list.filter(k => !leaving.has(k));
        }
        if (!lists[url].length) delete lists[url];
    }
    return back;
}

// The ids still dead in `url` — the spawns _loadMap leaves out.
export function deadIds(lists, url) {
    return new Set((lists[url] || []).map(k => k.id));
}

// Keep only well-formed entries of a saved respawn list (a save is never trusted).
// Returns a fresh object; zones left empty are dropped.
export function sanitizeRespawnLists(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const [url, list] of Object.entries(raw)) {
        if (!Array.isArray(list)) continue;
        const seen = new Set();
        const kept = [];
        for (const k of list) {
            if (!k || typeof k !== 'object' || typeof k.id !== 'string' || seen.has(k.id)) continue;
            seen.add(k.id);
            kept.push({ id: k.id, age: Number.isInteger(k.age) && k.age >= 0 ? k.age : 0 });
        }
        if (kept.length) out[url] = kept;
    }
    return out;
}

// A boss's own items (its slot's required item, a remembrance, Pike's rope) drop
// only the first time it dies. `given` is a Set of "url|id" keys. Returns true —
// and remembers the kill — on the first call for that enemy, false ever after.
export function bossDropOnce(given, url, id) {
    const key = `${url}|${id}`;
    if (given.has(key)) return false;
    given.add(key);
    return true;
}

// Task 14 / Law 6f AS AMENDED — the unused kit drops. He spent his tricks or
// he didn't; what's left is the reward for rushing him. Resolves an enemy's
// authored `loadout` (an item-id array) to real item defs and returns the
// ground-item descriptors to place at its tile — the same {type,x,y,def}
// shape _handleEnemyDeath already pushes for the Were-Rat converter / Pike's
// rope. Pure — like _recordDrop, "the CALLER then places it into
// groundItems" (and records the drop, logs it, and mugs the id).
export function dropLoadout(loadout, x, y) {
    return resolveLoadout(loadout).map(def => ({ type: def.id, x, y, def }));
}
