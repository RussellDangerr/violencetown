// inventory.js — the pure bag model (zones, routing, protect/unprotect, pages).
//
// Extracted from main.js's _addToInventory so it's importable under node and
// testable without the DOM (the defeat-scenarios.js / layout.js convention).
// The bag is one flat array; zones are index ranges: SAFE = [0, safeSlots),
// PACK = [safeSlots, size). Config is passed in ({ size, safeSlots, maxStack })
// so nothing here imports data.js — the caller supplies the real constants.
//
// (BG1) A bag that GROWS: pass `pageSize` and a full PACK appends another page
// of `pageSize` empty PACK slots instead of refusing. The SAFE row never grows.
// Pages are views over the flat array: page p shows SAFE plus PACK slots
// [safeSlots + p*pageSize, safeSlots + (p+1)*pageSize). Without `pageSize` the
// bag is the old fixed size and a full one still refuses.

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

// (BG1) Append one page of empty PACK slots; returns the first new slot.
// Mutates inv in place, so every holder of the array sees the new page.
export function addPage(inv, cfg) {
    const first = inv.length;
    for (let i = 0; i < cfg.pageSize; i++) inv.push(null);
    return first;
}

// (BG1) How many PACK pages a bag of `length` slots has (always at least one).
export function pageCount(length, cfg) {
    return Math.max(1, Math.ceil((length - cfg.safeSlots) / cfg.pageSize));
}

// (BG1) The slot a bag-screen position shows on `page`. Positions 0..safeSlots-1
// are the SAFE row on every page; the rest are that page's PACK slots.
export function slotOnPage(view, page, cfg) {
    return view < cfg.safeSlots ? view : view + page * cfg.pageSize;
}

// (BG1) The page a slot lives on (a SAFE slot is on every page: -1).
export function pageOfSlot(slot, cfg) {
    return slot < cfg.safeSlots ? -1 : Math.floor((slot - cfg.safeSlots) / cfg.pageSize);
}

// (BG1) The slot count a save of `n` slots loads into: at least `minSize`, and
// whole pages past it, so a page that was open when you saved comes back whole.
export function pagedSize(n, minSize, cfg) {
    if (!(n > minSize)) return minSize;
    return minSize + Math.ceil((n - minSize) / cfg.pageSize) * cfg.pageSize;
}

// Add one unit of itemDef. Merge into an existing non-full stack (either zone)
// first, then a free PACK slot; then, in a growing bag, a new PACK page — or,
// in a fixed bag, a free SAFE slot (overflow), else fail.
// Mutates inv; returns true on success. PACK-first keeps SAFE as deliberate,
// player-curated protection rather than a dumping ground.
export function addToInventory(inv, itemDef, cfg) {
    for (let i = 0; i < cfg.size; i++) {
        const s = inv[i];
        if (s && s.itemDef.id === itemDef.id && s.count < cfg.maxStack) { s.count++; return true; }
    }
    let i = firstFreeIn(inv, 'pack', cfg);
    if (i < 0 && cfg.pageSize > 0) i = addPage(inv, cfg);
    if (i < 0) i = firstFreeIn(inv, 'safe', cfg);
    if (i < 0) return false;
    inv[i] = { itemDef, count: 1 };
    return true;
}

// Move the stack at fromSlot to the first free slot of targetZone. If it's
// already in that zone, no-op success. If the target zone is full, fail
// (leaving the stack put), except a growing bag's PACK, which adds a page.
// Mutates inv; returns boolean.
export function moveToZone(inv, fromSlot, targetZone, cfg) {
    const stack = inv[fromSlot];
    if (!stack) return false;
    if (zoneOf(fromSlot, cfg.safeSlots) === targetZone) return true;
    let dest = firstFreeIn(inv, targetZone, cfg);
    if (dest < 0 && targetZone === 'pack' && cfg.pageSize > 0) dest = addPage(inv, cfg);
    if (dest < 0) return false;
    inv[dest] = stack;
    inv[fromSlot] = null;
    return true;
}
