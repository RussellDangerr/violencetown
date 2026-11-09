// interactions.js — "carry this, here, and this happens", each row with a note.
// A row: { id, carry: item id, zone: map url, effect?: (game) => void, note: text }.
// The table ships empty; each later idea is one row. The note shows once (the first
// firing), is remembered in the save, and is listed on the Remoticon notes tab.

export const INTERACTIONS = [];

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
