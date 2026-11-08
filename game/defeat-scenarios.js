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

// A defeater is a "boss" iff it carries the boss flag or its tag ends in _boss.
// The Act 2 stand-ins (slots.js placeholderBoss) have the flag and no tag.
export function isBoss(enemy) {
    if (!enemy) return false;
    return enemy.boss === true || (typeof enemy.tag === 'string' && enemy.tag.endsWith('_boss'));
}

// The boss that ends a fight you lose: whoever landed the blow if it is a boss,
// else the first boss still in the fight (`fs` is fight-area.js fighters()), else
// null. A boss's ally can land the last blow; the fight is still the boss's.
export function bossInFight(fs, by) {
    if (isBoss(by)) return by;
    return (fs || []).find(isBoss) || null;
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
// No scenario adds a status: the post-defeat debuffs did nothing and were dropped
// (ruling DFR1); the log's cost line says what a defeat cost instead.
export const DEFEAT_SCENARIOS = [
    {
        id: 'processed_by_fungus',
        when: c => c.zone && /sewer/i.test(c.zone) && c.by && /Fungus/.test(c.by.type || ''),
        weight: 3,
        consequence: {
            // A spore-cell by the soap-mine: the walled pocket south of it, the
            // nearest tile no sewer enemy can see (pinned in tests/fungus-wake-spot.test.js).
            wakeAt: { spot: { x: 12, y: 17 } },
            hp: 0.5, timeSkip: 'hours',
            take: { categories: ['ambro'], recoverable: false },   // they feast on your food/mushrooms — gone
            log: '[You wake in a spore-cell. Your provisions are gone; the Fungus fed well.]',
        },
    },
    {
        id: 'robbed_by_wererats',
        // The sewer's ordinary rats (the escape gauntlet's, tagged sewer_rat) rob
        // you (ruling WRR1). The real Were-Rat is a boss, so its defeats take the
        // boss retry before this table is read; its match here is never reached.
        when: c => c.zone && /sewer/i.test(c.zone) && c.by
            && ((c.by.type || '') === 'Wererat' || c.by.tag === 'sewer_rat'),
        weight: 3,
        consequence: {
            wakeAt: null,                            // dumped at the sewer mouth (spawn)
            hp: 0.6,
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
            hp: 0.5,
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
            log: "[Carrion dragged you to her corner and patched you up. 'You owe me,' she grunts.]",
        },
    },
    {
        id: 'beaten_and_dumped',
        when: () => true,             // generic fallback — always eligible, lowest weight
        weight: 1,
        consequence: {
            wakeAt: null,             // → _safeRespawnCell (zone entrance/spawn)
            hp: 0.5,
            take: { loot: 0.5, recoverable: false },
            log: '[You come to, beaten and dumped.]',   // the cost line after it says what was taken
        },
    },
];
