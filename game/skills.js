// skills.js — the pure store operations behind the ring-builds ability axis.
//
// Game (main.js) is browser-coupled and can't be constructed under node; this
// module holds the learn / equip / merge / suppress-read logic as pure
// functions so it's unit-testable in isolation (mirrors ai.js / pathing.js /
// buffs.js). Game's _refreshGrantedSkills / hasSpell / hasTrick / _learnSkill /
// _equipSkill / _unequipSkill delegate here.

// Generous, fixed loadout capacity per ring (tune toward the wheel's leaf room).
export const SKILL_SLOTS = { trick: 6, spell: 6 };

// The active list for a ring = base ∪ equipped ∪ gear-granted, de-duped, order
// stable (base, then equipped, then gear). Suppression is applied at READ
// (isActive), never here — so unsuppressing restores a skill by construction.
export function mergeKnown(base, equipped, granted) {
    return [...new Set([...base, ...equipped, ...granted])];
}

// A skill can fire iff it's in the merged list AND not currently suppressed
// (NH-2 `blocked`). `suppressed` is a Set.
export function isActive(list, suppressed, id) {
    return list.includes(id) && !suppressed.has(id);
}

// Add id to the learned pool (idempotent). If a loadout slot is free, auto-equip
// it — a newly learned skill is usable immediately (generous; buffs-feel-given).
// Returns true if newly learned, false if already in the pool.
export function learnInto(pool, equipped, cap, id) {
    if (pool.has(id)) return false;
    pool.add(id);
    if (equipped.length < cap && !equipped.includes(id)) equipped.push(id);
    return true;
}

// Slot a learned skill into the loadout. No-op (returns false) if unlearned,
// already slotted, or the loadout is full.
export function equipSkill(pool, equipped, cap, id) {
    if (!pool.has(id) || equipped.includes(id) || equipped.length >= cap) return false;
    equipped.push(id);
    return true;
}

// Remove a skill from the loadout (it stays in the pool). Returns true if changed.
export function unequipSkill(equipped, id) {
    const i = equipped.indexOf(id);
    if (i < 0) return false;
    equipped.splice(i, 1);
    return true;
}

// Sanitize a persisted loadout with no live Game (used by save.validate): keep
// only ids present in the pool, drop dupes, clamp to capacity.
export function sanitizeEquipped(learnedArr, equippedArr, cap) {
    const pool = new Set(learnedArr);
    const seen = new Set();
    const out = [];
    for (const id of equippedArr) {
        if (pool.has(id) && !seen.has(id)) { seen.add(id); out.push(id); }
        if (out.length >= cap) break;
    }
    return out;
}
