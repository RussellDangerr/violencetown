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
import { weaknessesOf, resistancesOf } from './elements.js';

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
    // The Sewer's character (plans/cs1-crat-talk-both-sides.md): the Crat, who
    // asks you to settle a dispute in the side room north of the Sewer. A
    // townsperson's numbers; borrowed Violencian art until it is designed.
    crat: {
        type: 'Violencian',
        name: 'The Crat',
        sewerDweller: true,
        hp: 100,
        armor: -80,
        damage: 0,
        sightRange: 4,
        disposition: 0,
        behavior: ['IDLE'],
        dialogueId: 'crat',
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
    // The frozen area's mooks (plans/ic4-frozen-creatures.md), its `frozen.mob`
    // pool. Each copies the fight numbers and kit of the nearest existing enemy,
    // and its weakness row is the chart's `cold` row (elements.js).
    // Copied from the Graveyard's Rattling Skeleton, whose art it shares.
    snowman: frozenMob('Snowman', {
        gold: 4, loadout: ['rock', 'pipe', 'foil_hat', 'shoe_bags'], hp: 100, armor: 0, damage: 8,
    }),
    // Copied from the Sewer's Fungus King, whose art it shares.
    yeti: frozenMob('Yeti', {
        gold: 20,
        loadout: ['tunnel_mushroom', 'tunnel_mushroom', 'sludge_sack', 'sludge_sack', 'boardwalk_burger', 'foil_hat', 'defence_poition', 'soap'],
        hp: 100, armor: 6, damage: 12,
    }),
    // Copied from the Sewer's Red Fungus, the tier between the other two.
    polar_bear: frozenMob('Polar Bear', {
        gold: 10,
        loadout: ['mystery_meat', 'mystery_meat', 'mystery_meat', 'tunnel_mushroom', 'sludge_sack', 'fire_blood', 'defence_poition'],
        hp: 100, armor: 3, damage: 10,
    }),
    // The frozen area's boss (plans/ic5-siberia-frozen-boss.md): a tigress
    // snowwoman. The shared placeholder boss numbers and kit until she is
    // designed, the chart's cold row like the mooks, her one name, [TEXT] copy.
    siberia: {
        ...placeholderBoss(),
        type: 'Siberia',
        name: 'Siberia',
        weak: weaknessesOf('cold'),
        resist: resistancesOf('cold'),
        examine: '[TEXT]',
    },
};

// One frozen-area mook: its numbers, the chart's cold row, and placeholder
// name and examine text.
function frozenMob(type, numbers) {
    return {
        type,
        name: `[${type}]`,
        ...numbers,
        weak: weaknessesOf('cold'),
        resist: resistancesOf('cold'),
        examine: '[TEXT]',
    };
}

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
    // A character slot (spine SL-5): no required item, so it guarantees no drop.
    'sewer.character': {
        kind: 'character',
        map: 'sewer-north-map.json',
        pool: [{ entry: 'crat', weight: 1 }],
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
    // The frozen area's boss: a map off the spine, so no Locked row moves. Beating
    // her hands over the Tiger's Blood Ice Cone (IC1). No dropLine yet: the death
    // handler logs its generic line.
    'frozen.boss': {
        kind: 'boss',
        map: 'frozen-map.json',
        requiredDrop: 'tigers_blood_ice_cone',
        pool: [{ entry: 'siberia', weight: 1 }],
    },
    // A mob slot (spine SL-6) holds mooks, not an anchor: see dealDeck below.
    'frozen.mob': {
        kind: 'mob',
        map: 'frozen-map.json',
        pool: [
            { entry: 'snowman', weight: 1 },
            { entry: 'yeti', weight: 1 },
            { entry: 'polar_bear', weight: 1 },
        ],
    },
};

const isMob = (slot) => slot?.kind === 'mob';

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

// One entry per anchor slot, the same for the same seed. Slots are walked in a
// fixed (sorted) order so adding one slot cannot reshuffle the picks of another
// declared before it in the object. A mob slot is not an anchor: it gets a deck
// instead (dealDeck), on a stream of its own, so adding one moves no anchor.
export function pickSlots(seed, slots = SLOTS) {
    const rng = new RNG((seed ^ SLOT_SALT) >>> 0);
    const picks = {};
    for (const id of Object.keys(slots).sort()) {
        if (!isMob(slots[id])) picks[id] = pickFrom(slots[id].pool, rng);
    }
    for (const id of Object.keys(slots).sort()) {
        if (isMob(slots[id])) picks[id] = dealDeck(slots[id].pool, new RNG((seed ^ SLOT_SALT ^ hashId(id)) >>> 0));
    }
    return picks;
}

// FNV-1a over a slot id: each mob slot's deck draws from its own stream.
function hashId(id) {
    let h = 0x811C9DC5;
    for (const ch of String(id)) {
        h ^= ch.charCodeAt(0);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
}

// A mob slot (spine SL-6) holds mooks, rolled per spawn rather than picked once
// per game. Its pool is shuffled like a deck, weighted, with no repeats; each
// mob spawn names a `seat`, its place in the deal (wrapping past the end). So a
// map with a seat per entry shows every entry, in an order that changes from
// game to game.
function dealDeck(pool, rng) {
    const left = pool.slice();
    const deck = [];
    while (left.length) {
        const entry = pickFrom(left, rng);
        deck.push(entry);
        left.splice(left.findIndex(p => p.entry === entry), 1);
    }
    return deck;
}

// The deck a mob slot deals from: this game's, when it is a true shuffle of the
// pool, else the pool's own order (a save from before the slot, or the bench).
function deckFor(slot, saved) {
    const order = slot.pool.map(p => p.entry);
    const ok = Array.isArray(saved) && saved.length === order.length
        && order.every(e => saved.includes(e));
    return ok ? saved : order;
}

// Today's content: the first entry of every anchor pool. What a save written
// before slots existed loads, and what a slot with no saved pick falls back to.
// A mob slot has no pick; its deck falls back to the pool's order (deckFor).
export function defaultPicks(slots = SLOTS) {
    const picks = {};
    for (const id of Object.keys(slots)) if (!isMob(slots[id])) picks[id] = slots[id].pool[0].entry;
    return picks;
}

// A spawn with a `slot` becomes its picked entry (a mob slot: the entry dealt to
// its seat), with the spawn's own id, place and facing on top. A spawn naming an `entry` is placed by hand: it becomes
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
    let entryId;
    if (isMob(slot)) {
        const deck = deckFor(slot, picks?.[spawn.slot]);
        const seat = Number.isInteger(spawn.seat) && spawn.seat >= 0 ? spawn.seat : 0;
        entryId = deck[seat % deck.length];
    } else {
        entryId = (picks && slot.pool.some(p => p.entry === picks[spawn.slot])) ? picks[spawn.slot] : slot.pool[0].entry;
    }
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
