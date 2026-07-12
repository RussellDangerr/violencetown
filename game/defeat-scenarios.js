// defeat-scenarios.js — the pure core of the Outward-style defeat system.
//
// Game (main.js) is browser-coupled and can't be constructed under node; the
// scenario table + selection + take-matching + safe-floor predicate live here as
// pure functions/data (mirrors ai.js / skills.js). Game's resolveDefeat runner
// delegates here; the ITEMS/GEAR glyph shares isSafe so the marker and the
// take-logic can never disagree.

// An item survives EVERY defeat iff it's a quest item, the equipped weapon, or
// explicitly flagged essential. Everything else is the at-risk pool.
export function isSafe(itemDef, equippedWeapon) {
    if (!itemDef) return false;
    return !!itemDef.questItem || itemDef === equippedWeapon || !!itemDef.essential;
}

// A defeater is a "boss" iff its tag ends in _boss (only the Wererat, for now).
export function isBoss(enemy) {
    return !!(enemy && typeof enemy.tag === 'string' && enemy.tag.endsWith('_boss'));
}

// Split inventory into { safe, atRisk } — entries carry the slot index so the
// caller can null the taken slots. Skips empty slots.
export function partitionInventory(inventory, equippedWeapon) {
    const safe = [], atRisk = [];
    (inventory || []).forEach((slot, i) => {
        if (!slot || !slot.itemDef) return;
        (isSafe(slot.itemDef, equippedWeapon) ? safe : atRisk).push({ i, itemDef: slot.itemDef, count: slot.count });
    });
    return { safe, atRisk };
}

// Which at-risk entries a take-rule claims (pure — caller mutates + spawns stash).
//   categories: take items whose def.category is in the list  (beasts eat food)
//   breakables: take consumables                              (a fall cracks them)
//   loot: 'all' | fraction — take spare gear/junk               (humanoids rob you)
export function matchTake(take, atRisk) {
    if (!take || !atRisk || !atRisk.length) return [];
    let out = atRisk.filter(e => {
        const d = e.itemDef;
        if (take.categories && take.categories.includes(d.category)) return true;
        if (take.breakables && d.consumable && d.category !== 'quest') return true;
        if (take.loot) return true;
        return false;
    });
    if (typeof take.loot === 'number' && take.loot < 1) out = out.slice(0, Math.floor(out.length * take.loot));
    return out;
}

// Weighted pick over scenarios whose when(ctx) is true. rand() ∈ [0,1). Returns
// the chosen scenario, or the last eligible (the generic fallback has when:()=>true
// so there is always at least one). Null only if the table is empty.
export function pickScenario(ctx, scenarios, rand) {
    const eligible = (scenarios || []).filter(s => { try { return s.when(ctx); } catch { return false; } });
    if (!eligible.length) return null;
    const total = eligible.reduce((n, s) => n + (s.weight || 1), 0);
    let r = rand() * total;
    for (const s of eligible) { r -= (s.weight || 1); if (r < 0) return s; }
    return eligible[eligible.length - 1];
}

// The scenario table. Consequences are DECLARATIVE data; Game._runScenario
// interprets them. Seeded with the generic fallback; sewer flavor added in Task 5.
export const DEFEAT_SCENARIOS = [
    {
        id: 'beaten_and_dumped',
        when: () => true,             // generic fallback — always eligible, lowest weight
        weight: 1,
        consequence: {
            wakeAt: null,             // → _safeRespawnCell (zone entrance/spawn)
            hp: 0.5,
            status: 'rattled',
            take: { loot: 0.5, recoverable: false },
            log: '[You come to, beaten and dumped. Some of your things are gone.]',
        },
    },
];
