// rivals.js — pure helpers for the rival record (plans/ne1-rival-remembered.md).
//
// An ordinary enemy that beat you and took your things is remembered, per zone:
// { "mapUrl": { id, items, carrying? } }. `items` is a list of item ids, one per
// item (a stack of three is three ids). The next time the zone loads, spawnEnemy
// adds `items` to that enemy's kit and the record reads `carrying`. Like
// drops.js, this is pure so it can be node-tested; Game (main.js) does the
// touching of its own state.

import { isBoss } from './defeat-scenarios.js';
import { resolveItemDef } from './item-registry.js';

// May this defeater become a rival? An ordinary enemy the map placed: the same
// test _rememberKill uses (its id is on the zone's enemy spawns). A boss, a
// summon, an ally, the sewer escape's rats and a hazard (no enemy at all) never.
export function canBeRival(by, enemySpawns) {
    if (!by || !by.entity || typeof by.id !== 'string') return false;
    if (isBoss(by) || by._isSummon || by._ally || by.ambient || by.tag === 'sewer_rat') return false;
    return (enemySpawns || []).some(s => s && s.id === by.id);
}

// The item ids a take removed, one per item, leaving out any id the game cannot
// resolve again (it could never be dropped back to you).
export function itemIdsOf(taken) {
    const out = [];
    for (const e of taken || []) {
        const id = e && e.itemDef && e.itemDef.id;
        if (!id || !resolveItemDef(id)) continue;
        for (let i = 0; i < Math.max(1, (e.count | 0)); i++) out.push(id);
    }
    return out;
}

// A defeat by `id` in `url` that took `items`. Mutates `rivals`. Returns:
//   'made'   a new rival (the zone had none)
//   'grew'   the zone's rival beat you again; `items` joined its record
//   null     nothing changed (no items, or someone else already holds the post)
export function recordDefeat(rivals, url, id, items) {
    if (!url || typeof id !== 'string' || !items || !items.length) return null;
    const held = rivals[url];
    if (!held) { rivals[url] = { id, items: [...items] }; return 'made'; }
    if (held.id !== id) return null;
    held.items.push(...items);
    return 'grew';
}

// The record for `id` in `url` when it is time to spawn it, as the kit to add,
// or null. Pure read.
export function kitFor(rivals, url, id) {
    const r = rivals[url];
    return r && r.id === id && r.items.length ? r.items : null;
}

// The zone loaded and the rival is at its post: the record now reads carrying.
export function markCarrying(rivals, url, id) {
    const r = rivals[url];
    if (r && r.id === id) r.carrying = true;
}

const tally = (ids) => {
    const n = new Map();
    for (const id of ids || []) if (typeof id === 'string') n.set(id, (n.get(id) || 0) + 1);
    return n;
};

// What the rival still carries of what it took. `live` is its kit now, `base` is
// the kit the map alone would give it (so a spare of its own is not counted as
// yours). Something it used or Thieve lifted is missing from `live`, and drops off.
export function settleItems(recordItems, live, base) {
    const have = tally(live), own = tally(base), left = new Map();
    for (const [id, n] of have) left.set(id, Math.max(0, n - (own.get(id) || 0)));
    const out = [];
    for (const id of recordItems || []) {
        if ((left.get(id) || 0) > 0) { out.push(id); left.set(id, left.get(id) - 1); }
    }
    return out;
}

// The rival of `url` died. Removes its record and returns the items it still
// owed you: all of them if it never got to carry them, none if they are in its
// kit (the kill drop hands those over).
export function clearRival(rivals, url, id) {
    const r = rivals[url];
    if (!r || r.id !== id) return [];
    delete rivals[url];
    return r.carrying ? [] : [...r.items];
}

// Keep only well-formed records of a saved rival list (a save is never trusted).
export function sanitizeRivals(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const [url, r] of Object.entries(raw)) {
        if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !Array.isArray(r.items)) continue;
        const items = r.items.filter(i => typeof i === 'string' && i);
        if (!items.length) continue;
        out[url] = r.carrying === true ? { id: r.id, items, carrying: true } : { id: r.id, items };
    }
    return out;
}
