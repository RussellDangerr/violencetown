// inventory.js — the pure bag model (zones, routing, protect/unprotect).
//
// Extracted from main.js's _addToInventory so it's importable under node and
// testable without the DOM (the defeat-scenarios.js / layout.js convention).
// The bag is one flat array; zones are index ranges: SAFE = [0, safeSlots),
// PACK = [safeSlots, size). Config is passed in ({ size, safeSlots, maxStack })
// so nothing here imports data.js — the caller supplies the real constants.

export function zoneOf(i, safeSlots) {
    return i < safeSlots ? 'safe' : 'pack';
}

function zoneRange(zone, cfg) {
    return zone === 'safe' ? [0, cfg.safeSlots] : [cfg.safeSlots, cfg.size];
}

function firstFreeIn(inv, zone, cfg) {
    const [lo, hi] = zoneRange(zone, cfg);
    for (let i = lo; i < hi; i++) if (!inv[i]) return i;
    return -1;
}

// Add one unit of itemDef. Merge into an existing non-full stack (either zone)
// first, then a free PACK slot, then a free SAFE slot (overflow), else fail.
// Mutates inv; returns true on success. PACK-first keeps SAFE as deliberate,
// player-curated protection rather than a dumping ground.
export function addToInventory(inv, itemDef, cfg) {
    for (let i = 0; i < cfg.size; i++) {
        const s = inv[i];
        if (s && s.itemDef.id === itemDef.id && s.count < cfg.maxStack) { s.count++; return true; }
    }
    let i = firstFreeIn(inv, 'pack', cfg);
    if (i < 0) i = firstFreeIn(inv, 'safe', cfg);
    if (i < 0) return false;
    inv[i] = { itemDef, count: 1 };
    return true;
}

// Move the stack at fromSlot to the first free slot of targetZone. If it's
// already in that zone, no-op success. If the target zone is full, fail
// (leaving the stack put). Mutates inv; returns boolean.
export function moveToZone(inv, fromSlot, targetZone, cfg) {
    const stack = inv[fromSlot];
    if (!stack) return false;
    if (zoneOf(fromSlot, cfg.safeSlots) === targetZone) return true;
    const dest = firstFreeIn(inv, targetZone, cfg);
    if (dest < 0) return false;
    inv[dest] = stack;
    inv[fromSlot] = null;
    return true;
}
