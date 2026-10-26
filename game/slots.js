// slots.js — the slot registry (plans/slot-registry.md, plans/spine.md §2).
//
// A beat binds to a SLOT, never to a named monster: "the Sewer's boss drops the
// Converter", not "the Were-Rat does". A slot holds a POOL of registry entries;
// a new game picks one per slot from its seed, and the save keeps the picks.
//
// The map says WHERE (a spawn carrying `slot`); the registry says WHO (the entry's
// stat block). A new boss is one ENTRIES row plus one pool row — the quest, the
// map and the death handler never learn its name.

import { RNG } from './rng.js';

// The registry: the stat block a map spawn used to carry, minus its id and place.
export const ENTRIES = {
    wererat: {
        type: 'Wererat',
        boss: true,
        sewerDweller: true,
        gold: 44,
        loadout: ['bandage', 'hot_dog', 'boardwalk_burger', 'defence_poition', 'foil_hat', 'soap', 'cardboard_cuirass'],
        equipped: ['wooden_sword'],
        hp: 100,
        armor: 6,
        damage: 12,
        tag: 'wererat_boss',
        barks: [
            "[Were-Rat: The converter's OURS now, grease-boy.]",
            '[Were-Rat: You smell like a dead-end job.]',
        ],
        barkEveryTurns: 6,
    },
    // The Carnival's rats (plans/rv1-carnival-rats.md): the canyon rat's stats,
    // vermin, one drop each inside the vermin cap. Each is the brown rat
    // recoloured (ratVariants in sprites.js). Placed by hand: a map spawn names
    // the entry, `{ id, entry, x, y }`. No `tag`: canyon_critter is Pike's deal.
    birthday_rat: {
        type: 'Birthday Rat',
        name: 'Birthday Rat',
        sewerDweller: true,
        vermin: true,
        gold: 1,
        loadout: ['mystery_meat'],
        hp: 100,
        armor: -30,
        damage: 6,
        sightRange: 6,
    },
    sludge_rat: {
        type: 'Sludge Rat',
        name: 'Sludge Rat',
        sewerDweller: true,
        vermin: true,
        gold: 1,
        loadout: ['mystery_meat'],
        hp: 100,
        armor: -30,
        damage: 6,
        sightRange: 6,
    },
    robot_rat: {
        type: 'Robot Rat',
        name: 'Robot Rat',
        sewerDweller: true,
        vermin: true,
        gold: 1,
        loadout: ['rock'],
        hp: 100,
        armor: -30,
        damage: 6,
        sightRange: 6,
    },
    // Act 2's bosses (plans/ab1-act2-placeholder-bosses.md): each is its zone's
    // first pool entry from the spine, standing in with placeholderBoss() below.
    bigfoot:        { ...placeholderBoss(), name: 'Bigfoot' },
    // The first built out (plans/ab2-alien-boss-fight.md). He carries the Ray
    // Gun, so his death drop hands it over (ABR3: it left the Factory floor);
    // it heals nothing, so his kit never spends it.
    alien_invasion: alienInvasion(),
    the_deity:      { ...placeholderBoss(), name: 'The Deity' },
    // The Alien's allies (ABR2: a few he funds). Law 5's rally pays for any
    // hurt fighter on his side near him; these are on his side because they
    // carry no behaviour list, so they are born hostile. Placed by hand beside
    // him in the Factory. The Factory's Greedy Green, look and numbers, until
    // they are designed.
    alien_ally: {
        type: 'Greedy Green',
        name: '[NAME]',
        gold: 8,
        loadout: ['hot_dog', 'foil_hat', 'latex_gloves', 'cardboard_cuirass', 'soap'],
        hp: 100,
        armor: 3,
        damage: 9,
    },
};

function alienInvasion() {
    const e = { ...placeholderBoss(), name: 'Alien Invasion' };
    e.loadout = [...e.loadout, 'ray_gun'];
    return e;
}

// One stand-in stat block for every Act 2 boss until each is designed: the
// Were-Rat's numbers as they stand, the existing Boss cell, and [TEXT] barks.
function placeholderBoss() {
    return {
        type: 'Boss',
        boss: true,
        gold: 44,
        loadout: ['bandage', 'hot_dog', 'boardwalk_burger', 'defence_poition', 'foil_hat', 'soap', 'cardboard_cuirass'],
        equipped: ['wooden_sword'],
        hp: 100,
        armor: 6,
        damage: 12,
        barks: ['[TEXT]', '[TEXT]'],
        barkEveryTurns: 6,
    };
}

// A required item belongs to the slot, not the entry (SL-4): every entry in the
// pool drops it, so a new boss can never strand the quest.
export const SLOTS = {
    'sewer.boss': {
        kind: 'boss',
        map: 'sewer-map.json',
        requiredDrop: 'catalytic_converter',
        // The slot owns its item, so it owns the line; {who} is whoever filled it.
        dropLine: '[The {who} drops your cataclysmic converter!]',
        pool: [{ entry: 'wererat', weight: 1 }],
    },
    // Act 2 (plans/spine.md §9, 2026-10-23): each item will come from its zone's
    // quest with the boss a step inside it. Interim: the boss drops it directly.
    // No dropLine, so the drop logs the death handler's generic line.
    'carnival.boss': {
        kind: 'boss',
        map: 'carnival-map.json',
        requiredDrop: 'act2_item_a',
        pool: [{ entry: 'bigfoot', weight: 1 }],
    },
    'factory.boss': {
        kind: 'boss',
        map: 'factory-map.json',
        requiredDrop: 'act2_item_b',
        pool: [{ entry: 'alien_invasion', weight: 1 }],
    },
    'graveyard.boss': {
        kind: 'boss',
        map: 'graveyard-map.json',
        requiredDrop: 'act2_item_c',
        pool: [{ entry: 'the_deity', weight: 1 }],
    },
};

// What the log calls an entry that has no `name` of its own (keyed by type).
const LABELS = { Wererat: 'Were-Rat' };
export const labelOf = (enemy) => enemy?.name || LABELS[enemy?.type] || enemy?.type || 'enemy';

// The line a required drop logs, with {who} filled in.
export function dropLineFor(enemy, mapSpawns = [], slots = SLOTS) {
    const slotId = slotIdOf(enemy, mapSpawns);
    const t = slotId && slots[slotId]?.dropLine;
    return t ? t.replace('{who}', labelOf(enemy)) : null;
}

// The picks' own stream (SL-2): derived from the game seed, never game.rng, so
// adding a slot or an entry cannot move a single combat roll.
const SLOT_SALT = 0x51077ED5;

function pickFrom(pool, rng) {
    const total = pool.reduce((s, p) => s + (p.weight ?? 1), 0);
    let roll = rng.float() * total;
    for (const p of pool) {
        roll -= (p.weight ?? 1);
        if (roll < 0) return p.entry;
    }
    return pool[pool.length - 1].entry;
}

// One entry per slot, the same for the same seed. Slots are walked in a fixed
// (sorted) order so adding one slot cannot reshuffle the picks of another
// declared before it in the object.
export function pickSlots(seed, slots = SLOTS) {
    const rng = new RNG((seed ^ SLOT_SALT) >>> 0);
    const picks = {};
    for (const id of Object.keys(slots).sort()) picks[id] = pickFrom(slots[id].pool, rng);
    return picks;
}

// Today's content: the first entry of every pool. What a save written before
// slots existed loads, and what a slot with no saved pick falls back to.
export function defaultPicks(slots = SLOTS) {
    const picks = {};
    for (const id of Object.keys(slots)) picks[id] = slots[id].pool[0].entry;
    return picks;
}

// A spawn with a `slot` becomes its picked entry, with the spawn's own id, place
// and facing on top. A spawn naming an `entry` is placed by hand: it becomes
// that entry the same way. Any other spawn passes through untouched.
export function resolveSpawn(spawn, picks, slots = SLOTS, entries = ENTRIES) {
    if (spawn && !spawn.slot && spawn.entry) {
        const entry = entries[spawn.entry];
        if (!entry) return spawn;
        const out = { ...structuredClone(entry), id: spawn.id, x: spawn.x, y: spawn.y };
        if (spawn.facing) out.facing = spawn.facing;
        return out;
    }
    if (!spawn || !spawn.slot) return spawn;
    const slot = slots[spawn.slot];
    if (!slot) return spawn;
    const entryId = (picks && slot.pool.some(p => p.entry === picks[spawn.slot])) ? picks[spawn.slot] : slot.pool[0].entry;
    const entry = entries[entryId];
    if (!entry) return spawn;
    const out = { ...structuredClone(entry), id: spawn.id, x: spawn.x, y: spawn.y, slot: spawn.slot };
    if (spawn.facing) out.facing = spawn.facing;
    return out;
}

// Which slot this enemy fills. Falls back to the map spawn with the same id, so
// a save written before slots existed (its Were-Rat carries no `slot`) still
// knows it is the Sewer's boss.
export function slotIdOf(enemy, mapSpawns = []) {
    if (!enemy) return null;
    return enemy.slot ?? ((mapSpawns || []).find(s => s && s.id === enemy.id)?.slot ?? null);
}

// The item a slot guarantees for this enemy, or null.
export function requiredDropFor(enemy, mapSpawns = [], slots = SLOTS) {
    const slotId = slotIdOf(enemy, mapSpawns);
    return (slotId && slots[slotId]?.requiredDrop) || null;
}
