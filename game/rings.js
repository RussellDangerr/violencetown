// rings.js — the pure store operations behind the Remembrance Rings axis.
//
// Game (main.js) is browser-coupled and can't be constructed under node; this
// module holds the slot / adjacency / fusion logic as pure functions so it's
// unit-testable in isolation (mirrors ai.js / pathing.js / skills.js). Game
// delegates from _refreshGrantedSkills / _acquireRing / _slotRing / _unslotRing.

// Anatomical finger order per hand. Index in this array = adjacency order:
// two fingers are neighbours iff they are consecutive here.
export const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];
export const HANDS   = ['left', 'right'];

// Fingers unlock in this order, the same finger on BOTH hands at each tier:
//   tier 0 → ring (2 slots) · 1 → +middle (4) · 2 → +index (6)
//   3 → +thumb (8, hidden) · 4 → +pinky (10, hidden)
// Because the set grows ring→middle→index→thumb→pinky, the unlocked fingers are
// ALWAYS anatomically contiguous, so within-hand adjacency is well-defined.
export const UNLOCK_ORDER = ['ring', 'middle', 'index', 'thumb', 'pinky'];

export function unlockedFingers(tier) {
    const n = Math.max(0, Math.min(tier + 1, UNLOCK_ORDER.length));
    return UNLOCK_ORDER.slice(0, n);
}

// Every unlocked slot as { hand, finger, key }, in a stable order (hand major,
// anatomical finger order minor). key = `${hand}:${finger}`.
export function unlockedSlots(tier) {
    const fingers = unlockedFingers(tier);
    const out = [];
    for (const hand of HANDS) {
        for (const finger of FINGERS) {
            if (fingers.includes(finger)) out.push({ hand, finger, key: `${hand}:${finger}` });
        }
    }
    return out;
}

// Within-hand adjacent slot-key pairs { a, b } at a tier. Adjacency never
// crosses hands; a pair needs both fingers unlocked (guaranteed contiguous).
export function adjacentPairs(tier) {
    const fingers = unlockedFingers(tier);
    const pairs = [];
    for (const hand of HANDS) {
        const present = FINGERS.filter(f => fingers.includes(f)); // anatomical order
        for (let i = 0; i < present.length - 1; i++) {
            pairs.push({ a: `${hand}:${present[i]}`, b: `${hand}:${present[i + 1]}` });
        }
    }
    return pairs;
}

// First authored fusion whose tag pair is satisfied by the two rings in EITHER
// order. Deterministic (authored order). Returns the fusion object or null.
export function findFusion(ringA, ringB, fusionTable) {
    if (!ringA || !ringB) return null;
    const at = ringA.tags || [], bt = ringB.tags || [];   // a passive-only ring carries no tags
    for (const fz of fusionTable) {
        if (!fz || !Array.isArray(fz.pair)) continue;      // skip a malformed fusion entry
        const [x, y] = fz.pair;
        const ax = at.includes(x), ay = at.includes(y);
        const bx = bt.includes(x), by = bt.includes(y);
        if ((ax && by) || (ay && bx)) return fz;
    }
    return null;
}

// Resolve every adjacent filled pair into fusions (authored) or resonance
// (unauthored). getRing: id → RING|null. Returns:
//   { grantedActives: string[] (deduped), fusions: [{a,b,fusion}], resonancePairs: number }
export function resolveAdjacencies(tier, slots, getRing, fusionTable) {
    const grantedActives = [];
    const fusions = [];
    let resonancePairs = 0;
    for (const { a, b } of adjacentPairs(tier)) {
        const ra = getRing(slots[a]);
        const rb = getRing(slots[b]);
        if (!ra || !rb) continue;                 // both slots must be filled
        const fz = findFusion(ra, rb, fusionTable);
        if (fz) { fusions.push({ a, b, fusion: fz }); if (fz.grants) grantedActives.push(fz.grants); }
        else resonancePairs++;
    }
    return { grantedActives: [...new Set(grantedActives)], fusions, resonancePairs };
}

// The active ability granted by each slotted ring itself (deduped).
export function slottedActives(slots, getRing) {
    const out = [];
    for (const key of Object.keys(slots)) {
        const r = getRing(slots[key]);
        if (r && r.grants) out.push(r.grants);
    }
    return [...new Set(out)];
}

// Sum each slotted ring's numeric `passive` modifiers into one object.
export function aggregatePassives(slots, getRing) {
    const mods = {};
    for (const key of Object.keys(slots)) {
        const r = getRing(slots[key]);
        if (r && r.passive) {
            for (const [k, v] of Object.entries(r.passive)) mods[k] = (mods[k] || 0) + v;
        }
    }
    return mods;
}

// Slot a ring. Refuses (false) if the slot is locked at this tier or the ring
// is un-owned. A ring is ONE physical instance — vacate any slot it already
// occupies before placing it.
export function slotRing(slots, owned, tier, slotKey, ringId) {
    if (!unlockedSlots(tier).some(s => s.key === slotKey)) return false;
    if (!owned.has(ringId)) return false;
    for (const k of Object.keys(slots)) if (slots[k] === ringId) slots[k] = null;
    slots[slotKey] = ringId;
    return true;
}

// Clear a slot. Returns true if it held a ring.
export function unslotRing(slots, slotKey) {
    if (!slots[slotKey]) return false;
    slots[slotKey] = null;
    return true;
}

// Add a ring to the owned pool (idempotent). Generous: auto-slot into the first
// empty unlocked slot so a fashioned ring is usable at once (buffs-feel-given).
// Returns true only if newly acquired.
export function acquireRing(owned, slots, tier, ringId) {
    if (owned.has(ringId)) return false;
    owned.add(ringId);
    for (const s of unlockedSlots(tier)) {
        if (!slots[s.key]) { slots[s.key] = ringId; break; }
    }
    return true;
}

// Sanitize a persisted slot map (save.validate, no live Game): keep only
// assignments whose slot is unlocked at `tier` AND whose ring is owned. Also
// enforce the one-physical-instance invariant that slotRing upholds at runtime —
// a corrupted/hand-edited save with the same ring in two slots is deduped
// (first assignment wins), so aggregatePassives can't double-count it.
export function sanitizeSlots(slots, owned, tier) {
    const keys = new Set(unlockedSlots(tier).map(s => s.key));
    const out = {};
    const seen = new Set();
    for (const key of Object.keys(slots || {})) {
        const id = slots[key];
        if (id && keys.has(key) && owned.has(id) && !seen.has(id)) {
            out[key] = id;
            seen.add(id);
        }
    }
    return out;
}

// ── Skill-merge helpers (relocated from the retired skills.js, ring Task 5) ────
// Rings feed the same two outputs the wheel reads (knownSpells / grantedTricks);
// these two pure functions do the merge + the suppression-aware read, so the one
// slotting system lives here and skills.js is gone.

// The active list = base ∪ granted-from-rings ∪ gear-granted, de-duped, order
// stable (base, then ring actives, then gear). Suppression is applied at READ
// (isActive), never here — so unsuppressing restores a skill by construction.
export function mergeKnown(base, ringActives, granted) {
    return [...new Set([...base, ...ringActives, ...granted])];
}

// A skill can fire iff it's in the merged list AND not currently suppressed
// (NH-2 `blocked`). `suppressed` is a Set.
export function isActive(list, suppressed, id) {
    return list.includes(id) && !suppressed.has(id);
}
