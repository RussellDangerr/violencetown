// bones.js — a capped snapshot of a character, kept when RESTART wipes the save.
//
// It lives under its own localStorage key and nothing reads it back into stats,
// gear or gold: it is a record, so no value crosses into the new run (BNR1).
// Storage is passed in so the module is testable without a browser, and every
// access is defensive: a missing, broken or old snapshot is skipped, never thrown.

export const BONES_VERSION = 1;
export const BONES_KEY = 'violencetown.bones';
export const BONES_CAP = 3;

const num = (v) => (Number.isFinite(v) ? v : 0);

// Build a snapshot from a live game. Gear is stored as ids only.
export function snapshotOf(game) {
    const gear = {};
    for (const [slot, def] of Object.entries(game.equipment || {})) {
        if (def && typeof def.id === 'string') gear[slot] = def.id;
    }
    return {
        v: BONES_VERSION,
        at: Date.now(),
        hp: num(game.playerHp), maxHp: num(game.playerMaxHp),
        mp: num(game.playerMp), maxMp: num(game.playerMaxMp),
        gold: num(game.gold),
        gear,
        map: typeof game.map?.url === 'string' ? game.map.url : null,
        turn: num(game.turn),
        zones: game._visitedZones ? game._visitedZones.size : 0,
    };
}

// A snapshot is usable only if it is the current version and the right shape.
export function isValid(s) {
    return !!s && typeof s === 'object' && s.v === BONES_VERSION
        && Number.isFinite(s.at) && Number.isFinite(s.turn)
        && Number.isFinite(s.gold) && Number.isFinite(s.maxHp)
        && !!s.gear && typeof s.gear === 'object' && !Array.isArray(s.gear);
}

// Every usable snapshot, oldest first. Anything else in storage is dropped.
export function readSnapshots(storage) {
    try {
        const list = JSON.parse(storage.getItem(BONES_KEY));
        return Array.isArray(list) ? list.filter(isValid).slice(-BONES_CAP) : [];
    } catch { return []; }
}

// Add a snapshot, keep the newest BONES_CAP. Returns true if it was written.
export function keepSnapshot(storage, snap) {
    try {
        if (!isValid(snap)) return false;
        const next = [...readSnapshots(storage), snap].slice(-BONES_CAP);
        storage.setItem(BONES_KEY, JSON.stringify(next));
        return true;
    } catch { return false; }
}

// The "while you were gone" report: three lines, all placeholders (copy is Caelan's).
export function reportLines(snap) {
    if (!isValid(snap)) return [];
    return ['[TEXT]', '[TEXT]', '[TEXT]'];
}
