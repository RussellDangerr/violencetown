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
// caller can null the taken slots. Skips empty slots. An item is kept if it's
// in a SAFE-zone slot (index < safeSlots) OR intrinsically safe (isSafe) —
// quest/equipped/essential items are safe wherever they sit. safeSlots
// defaults to 0 (no zone) so pre-B3 callers keep their old all-PACK behavior.
export function partitionInventory(inventory, equippedWeapon, safeSlots = 0) {
    const safe = [], atRisk = [];
    (inventory || []).forEach((slot, i) => {
        if (!slot || !slot.itemDef) return;
        const kept = i < safeSlots || isSafe(slot.itemDef, equippedWeapon);
        (kept ? safe : atRisk).push({ i, itemDef: slot.itemDef, count: slot.count });
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
    // Fractional loot takes AT LEAST one when anything is at-risk (else a 1-item
    // bag under loot:0.5 would floor to 0 while the log claims "some are gone").
    if (typeof take.loot === 'number' && take.loot < 1) out = out.slice(0, Math.min(out.length, Math.max(1, Math.round(out.length * take.loot))));
    return out;
}

// Weighted pick over scenarios whose when(ctx) is true. rand() ∈ [0,1). Returns
// the chosen scenario, or the last eligible (the generic fallback has when:()=>true
// so there is always at least one). Null only if the table is empty.
export function pickScenario(ctx, scenarios, rand) {
    const eligible = (scenarios || []).filter(s => { try { return s.when(ctx); } catch (e) { console.warn('[defeat] scenario when() threw:', s.id, e); return false; } });
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
        id: 'processed_by_fungus',
        when: c => c.zone && /sewer/i.test(c.zone) && c.by && /Fungus/.test(c.by.type || ''),
        weight: 3,
        consequence: {
            wakeAt: { spot: { x: 10, y: 10 } },      // a spore-cell by the soap-mine
            hp: 0.5, timeSkip: 'hours', status: 'hunched',
            take: { categories: ['ambro'], recoverable: false },   // they feast on your food/mushrooms — gone
            log: '[You wake in a spore-cell. Your provisions are gone; the Fungus fed well.]',
        },
    },
    {
        id: 'robbed_by_wererats',
        when: c => c.zone && /sewer/i.test(c.zone) && c.by && (c.by.type || '') === 'Wererat',
        weight: 3,
        consequence: {
            wakeAt: null,                            // dumped at the sewer mouth (spawn)
            hp: 0.6, status: 'rattled',
            take: { loot: 'all', recoverable: true, stashAt: { spot: { x: 17, y: 10 } } },
            log: "[The rats rolled you and scampered off with your haul. You'll want it back.]",
        },
    },
    {
        id: 'swept_into_sludge',
        when: c => c.zone && /sewer/i.test(c.zone) && (c.cause === 'sludge' || c.cause === 'fall'),
        weight: 2,
        consequence: {
            wakeAt: { spot: { x: 3, y: 10 } },       // washed downstream
            hp: 0.5, status: 'sludged',
            take: { breakables: true, recoverable: false },
            log: '[The sludge river took you downstream. Your kit is soaked and cracked.]',
        },
    },
    {
        id: 'patched_by_carrion',
        when: c => c.zone && /sewer/i.test(c.zone),
        weight: 1,                                   // the hope roll — any sewer defeat, low weight
        consequence: {
            wakeAt: { spot: { x: 8, y: 16 } },        // Carrion's corridor
            hp: 1.0,
            take: { gold: 0.1, recoverable: false },  // a small fee, not a robbery
            gift: { items: ['bandage'] },
            log: "[Carrion dragged you to his corner and patched you up. 'You owe me,' he grunts.]",
        },
    },
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
