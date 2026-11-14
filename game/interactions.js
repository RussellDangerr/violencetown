// interactions.js — "carry this, here, and this happens", each row with a note.
// A row: { id, carry: item id, zone: map url, effect?: (game) => void, note: text }.
// The table ships empty; each later idea is one row. The note shows once (the first
// firing), is remembered in the save, and is listed on the Remoticon notes tab.

import { resolveSpawn } from './slots.js';
import { spawnEnemy } from './enemies.js';

// (FD1) Carry Mola Cola into the frozen area and a pack of polar bears comes for it.
export const MOLA_ID = 'mola_cola';
export const FROZEN_MAP = 'frozen-map.json';
export const PACK_SIZE = 3;          // FD1R1 (a)

// Up to `n` open tiles on the map's outer rings, nearest the player but at least `minDist`
// away, so the pack walks in from the edge rather than appearing at your feet.
export function edgeSpots(game, n, minDist = 5) {
    const m = game.map;
    const out = [];
    const taken = (x, y) => (x === game.playerX && y === game.playerY)
        || game.enemies.some(e => e.entity.isAlive() && e.x === x && e.y === y);
    for (let y = 0; y < m.height; y++) {
        for (let x = 0; x < m.width; x++) {
            if (x > 1 && y > 1 && x < m.width - 2 && y < m.height - 2) continue;   // the outer two rings: the first is often trees
            if (!m.isWalkable(x, y) || taken(x, y)) continue;
            const d = Math.abs(x - game.playerX) + Math.abs(y - game.playerY);
            if (d >= minDist) out.push({ x, y, d });
        }
    }
    out.sort((a, b) => a.d - b.d);
    return out.slice(0, n);
}

// The effect: the pack arrives, once per entry (main.js clears the flag on every map load).
export function callMolaPack(game) {
    if (game._molaPackCalled) return;
    game._molaPackCalled = true;
    const spots = edgeSpots(game, PACK_SIZE);
    spots.forEach((s, i) => {
        const e = spawnEnemy(resolveSpawn({ id: `mola-pack-${i + 1}`, entry: 'polar_bear', x: s.x, y: s.y }, game.slots));
        e.state = 'chasing';
        e._emergeDelay = 1;
        e._molaPack = true;
        game.enemies.push(e);
    });
}

const carriesMola = (game) =>
    (game.inventory || []).some(s => s && s.itemDef && s.itemDef.id === MOLA_ID)
    || Object.values(game.equipment || {}).some(it => it && it.id === MOLA_ID);

// Called after every beat and every drop: once no Mola Cola is carried, the living pack
// takes what lies on the ground and leaves. Returns how many bears left.
export function molaPackLeaves(game) {
    const pack = (game.enemies || []).filter(e => e._molaPack && e.entity.isAlive());
    if (!pack.length || carriesMola(game)) return 0;
    game.groundItems = (game.groundItems || []).filter(g => {
        if (g.type !== MOLA_ID) return true;
        game._takeDropRecord?.(g.type, g.x, g.y);
        return false;
    });
    game.enemies = game.enemies.filter(e => !pack.includes(e));
    game._log?.('[TEXT: the bears took the cola and left.]', 'note');
    return pack.length;
}

export const INTERACTIONS = [
    { id: 'mola_cola_frozen', carry: MOLA_ID, zone: FROZEN_MAP, effect: callMolaPack, note: '[TEXT]' },
];

// Rows whose item is carried and whose zone is the one you are in.
export function matchingRows(rows, carriedIds, mapUrl) {
    const carried = carriedIds instanceof Set ? carriedIds : new Set(carriedIds);
    return rows.filter(r => r && r.zone === mapUrl && carried.has(r.carry));
}

// Fire every matching row's effect. Returns the rows whose note has not been seen
// yet (callers log them and remember them); `seen` is a Set or array of row ids.
export function fireRows(game, rows, carriedIds, mapUrl, seen) {
    const known = seen instanceof Set ? seen : new Set(seen || []);
    const fresh = [];
    for (const row of matchingRows(rows, carriedIds, mapUrl)) {
        if (typeof row.effect === 'function') row.effect(game);
        if (!known.has(row.id)) fresh.push(row);
    }
    return fresh;
}

// A saved list of seen ids, cleaned: strings only, no repeats.
export function sanitizeNoteIds(raw) {
    if (!Array.isArray(raw)) return [];
    return [...new Set(raw.filter(id => typeof id === 'string' && id))];
}

// The notes to list on the device, in the order they were first seen. An id the table
// no longer has is skipped.
export function seenNotes(rows, seenIds) {
    const byId = new Map(rows.map(r => [r.id, r]));
    return sanitizeNoteIds(seenIds).map(id => byId.get(id)).filter(Boolean).map(r => ({ id: r.id, note: r.note }));
}
