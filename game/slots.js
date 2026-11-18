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
import { resolveItemDef } from './item-registry.js';
import { attitudeOf } from './bones.js';

// What every Act 2 boss hits for (plans/ep1-act2-boss-damage.md, ruling EP1R1 a),
// two above the Were-Rat's 12. Each boss gets its own number when it is designed.
export const ACT2_BOSS_DAMAGE = 14;

// What the ordinary Act 2 enemies hit for (plans/ep2-act2-mob-damage.md, ruling EP2R1 a): the
// Clown, the Skeleton and the Greedy Green on their maps, and the two entries that copy them,
// the Alien's allies (the Green) and the Snowman (the Skeleton).
export const ACT2_MOB_DAMAGE = 12;

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
        loadout: ['rock', 'goo'],
        immune: ['goo'],   // (GO2) robots are immune to goo, and throw it
        hp: 100,
        armor: -30,
        damage: 6,
        sightRange: 6,
    },
    // The Carnival's lion (plans/ln1-carnival-lion.md, ruling LN1R1 a): a mini-boss you
    // always meet, placed by hand (`{ id, entry, x, y }`). Not Lire, the lion the Lion
    // Whip hires. Stand-ins until designed: the Fungus King's numbers and kit, the name,
    // the barks, the tint. No `boss`, `tag` or slot, so it drops nothing required.
    carnival_lion: {
        type: 'Carnival Lion',
        name: 'Lion',
        gold: 20,
        loadout: ['tunnel_mushroom', 'tunnel_mushroom', 'sludge_sack', 'sludge_sack', 'boardwalk_burger', 'foil_hat', 'defence_poition', 'soap'],
        hp: 100,
        armor: 6,
        damage: 12,
        barks: ['[TEXT]'],
        barkEveryTurns: 6,
    },
    // The Carnival's named clown (plans/cw1-the-clown-mini-boss.md, ruling LN1R1 a): a
    // mini-boss you always meet, placed by hand, apart from the five ordinary Carnival
    // Clowns. Stand-ins until designed: the Fungus King's numbers and kit with one sludge
    // sack swapped for Fire Blood (he throws it), the name, the barks, the art. He refuses a
    // bribe. No `boss`, `tag` or slot, so he drops nothing required.
    the_clown: {
        type: 'The Clown',
        name: 'The Clown',
        gold: 20,
        loadout: ['tunnel_mushroom', 'tunnel_mushroom', 'sludge_sack', 'fire_blood', 'boardwalk_burger', 'foil_hat', 'defence_poition', 'soap'],
        hp: 100,
        armor: 6,
        damage: 12,
        bribeable: false,
        barks: ['[TEXT]'],
        barkEveryTurns: 6,
    },
    // The Carnival's strongman (plans/st2-strongman-wins-contest.md, ruling ST2R1 a): placed by
    // hand. Give him enough and he turns to your side (give-action.js applyFlip), then fights
    // beside you at the contest against the boss. Stand-ins until designed: the ordinary Carnival
    // Clown's look, numbers, kit and gift values, the name, the barks. No `boss`, no slot.
    // SG1: calm where he stands (24,13); a talk recruit sits beside the gift flip. His own type
    // carries the art stand-in (Pike's cell); the numbers are still the Clown's.
    strongman: {
        type: 'Strongman',
        name: 'Strongman',
        dialogueId: 'strongman',
        gold: 7,
        loadout: ['hot_dog', 'red_cape', 'soap', 'fire_blood'],
        hp: 100,
        armor: 0,
        damage: ACT2_MOB_DAMAGE,
        disposition: -40,
        flipThreshold: 30,
        bribeable: true,
        values: { bandage: 6, soap: 4, rock: 3 },
        behavior: ['IDLE'],   // he stands where he is placed: a wander would draw the shared ambient stream and move the autoplay replay
        adjacencyBark: '[TEXT]',
    },
    // The Carnival's horses (plans/cb1-carnival-horses-circle.md): three combatants placed by
    // hand around (28,4), which circle you once beside you (ai.js circleStep; the `circler`
    // tag is the flag, off for every other entry). Stand-ins until designed: the Graveyard
    // Rattling Skeleton's numbers and kit, the name, the barks, the art. No `boss`, no slot.
    carnival_horse: {
        type: 'Carnival Horse',
        name: 'Horse',
        tag: 'circler',
        gold: 4,
        loadout: ['rock', 'pipe', 'foil_hat', 'shoe_bags'],
        hp: 100,
        armor: 0,
        damage: ACT2_MOB_DAMAGE,
        barks: ['[TEXT]'],
        barkEveryTurns: 6,
    },
    // The Carnival's dolls (plans/ec1-carnival-doll-pack.md): four combatants placed by hand
    // around (10,17), which circle you once beside you exactly as the horses do (the `circler`
    // tag, ai.js circleStep). Stand-ins until designed: the townie Knuckles's armour and
    // damage with a two-item kit, the purse, the name, the barks, the art. No `boss`, no slot.
    carnival_doll: {
        type: 'Carnival Doll',
        name: 'Doll',
        tag: 'circler',
        gold: 2,
        loadout: ['rock', 'pipe'],
        hp: 100,
        armor: -30,
        damage: 4,
        barks: ['[TEXT]'],
        barkEveryTurns: 6,
    },
    // The Carnival's assistant manager (plans/as1-unicycle-clown.md, ruling LN1R1 a): someone
    // you talk to, never a fight. Placed by hand at (32,3); he rolls about near it. He shares
    // the Carnival Clown's type (no sprite row of his own) drawn small, on a unicycle. Stand-ins
    // until designed: the Crat's numbers (a townsperson's), the name, every line, the drawn
    // size, the unicycle. No `boss`, no slot.
    assistant_manager: {
        type: 'Carnival Clown',
        name: 'Assistant Manager',
        ambient: true,
        hp: 100,
        armor: -80,
        damage: 0,
        sightRange: 4,
        disposition: 0,
        behavior: ['IDLE', 'WANDER'],
        homeRegion: 'assistant-yard',   // the carnival-map region round (32,3): he rolls about in it, no further
        wanderRadius: 2,
        wanderEveryTurns: 3,
        dialogueId: 'assistant_manager',
        drawScale: 0.5,
        unicycle: true,
        ownDice: true,   // his wander never draws the shared ambient stream (it moved a replay that never met him)
    },
    // The Graveyard's angel (plans/ca1-crying-angel.md): one stone figure placed by hand at
    // (21,10). It moves only on the beats you look at it (npc.js angelTurn; the `angel` tag is
    // the flag, off for every other entry) and has no sight of its own, so it never joins or
    // starts a fight. Stand-ins until designed: the Graveyard Rattling Skeleton's numbers and
    // kit, the name, the barks, the examine text, the art. No `boss`, no slot.
    crying_angel: {
        type: 'Crying Angel',
        name: 'Angel',
        tag: 'angel',
        gold: 4,
        loadout: ['rock', 'pipe', 'foil_hat', 'shoe_bags'],
        hp: 100,
        armor: 0,
        damage: ACT2_MOB_DAMAGE,
        sightRange: 0,
        barks: ['[TEXT]'],
        barkEveryTurns: 6,
        examine: '[TEXT]',
    },
    // The Graveyard's Ankou (plans/ak1-ankou-graveyard.md): one skeleton with a ghost drawn
    // around it (sprites.js `ghost`, renderer.js), placed by hand at (8,22). It fights as an
    // ordinary hostile. The name is Caelan's; stand-ins until designed: the Polar Bear's numbers
    // and kit, the barks, the examine text, the art. No `boss`, no slot, so it is in no pool.
    ankou: {
        type: 'Ankou',
        name: 'Ankou',
        gold: 10,
        loadout: ['mystery_meat', 'mystery_meat', 'mystery_meat', 'tunnel_mushroom', 'sludge_sack', 'fire_blood', 'defence_poition'],
        hp: 100,
        armor: 3,
        damage: 10,
        barks: ['[TEXT]'],
        barkEveryTurns: 6,
        examine: '[TEXT]',
    },
    // The Tunnels' Molemen (plans/mo1-molemen-tunnels.md): two placed by hand, each born hostile
    // so it hunts you. The name is Caelan's; stand-ins until designed: the Graveyard Rattling
    // Skeleton's numbers and kit, the bark, the art. No `boss`, no slot, so it is in no pool.
    moleman: {
        type: 'Moleman',
        name: 'Moleman',
        gold: 4,
        loadout: ['rock', 'pipe', 'foil_hat', 'shoe_bags'],
        hp: 100,
        armor: 0,
        damage: ACT2_MOB_DAMAGE,
        barks: ['The Moleman stops digging and comes for you.'],
        barkEveryTurns: 6,
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
    bigfoot:        { ...act2Boss(), name: 'Bigfoot' },
    // The Carnival's second pool entry (plans/rm1-ringmaster-carnival-boss.md):
    // the same stand-in block, a placeholder name.
    ringmaster:     { ...act2Boss(), name: 'Ringmaster' },
    // The first built out (plans/ab2-alien-boss-fight.md). He carries the Ray
    // Gun, so his death drop hands it over (ABR3: it left the Factory floor);
    // it heals nothing, so his kit never spends it.
    alien_invasion: alienInvasion(),
    the_deity:      { ...act2Boss(), name: 'The Deity' },
    // The finale's phase 1 (plans/fin2-financier-fight.md). The Financier is a
    // Locked character, so he is a fixed spawn in the vault (`{ id, entry, x, y }`),
    // not a pool entry. The stand-in boss block, unchanged, wearing the bank's
    // banker. His `_boss` tag is what runs the boss retry when he beats you.
    financier: {
        ...placeholderBoss(),
        type: 'Banker',
        name: 'Financier',
        tag: 'financier_boss',
        dialogueId: 'financier_vault',
        behavior: ['IDLE'],
    },
    // The Alien's allies (ABR2: a few he funds). Law 5's rally pays for any
    // hurt fighter on his side near him; these are on his side because they
    // carry no behaviour list, so they are born hostile. Placed by hand beside
    // him in the Factory. The Factory's Greedy Green, look and numbers, until
    // they are designed.
    alien_ally: {
        type: 'Greedy Green',
        name: 'Alien Ally',
        gold: 8,
        loadout: ['hot_dog', 'foil_hat', 'latex_gloves', 'cardboard_cuirass', 'soap', 'goo'],
        immune: ['goo'],   // (GO2) aliens are immune to goo, and throw it
        hp: 100,
        armor: 3,
        damage: ACT2_MOB_DAMAGE,
    },
    // The Factory's Hypno Vision (plans/hv1-hypno-vision-factory.md): two workers and a robot who
    // stand neutral until the screen turns them on you one at a time (hypno-vision.js; the
    // `hypno_target` tag is the flag). Stand-ins until designed: the workers carry the Graveyard
    // Rattling Skeleton's numbers and kit, the robot the Greedy Green's look, numbers and kit; the
    // names. They stand where they are placed (IDLE only: a wander would draw the shared ambient
    // stream and move the autoplay replay).
    factory_worker: {
        type: 'Worker',
        name: 'Worker',
        tag: 'hypno_target',
        gold: 4,
        loadout: ['rock', 'pipe', 'foil_hat', 'shoe_bags'],
        hp: 100,
        armor: 0,
        damage: ACT2_MOB_DAMAGE,
        disposition: 0,
        behavior: ['IDLE'],
    },
    factory_robot: {
        type: 'Greedy Green',
        name: 'Robot',
        tag: 'hypno_target',
        gold: 8,
        loadout: ['hot_dog', 'foil_hat', 'latex_gloves', 'cardboard_cuirass', 'soap'],
        hp: 100,
        armor: 3,
        damage: ACT2_MOB_DAMAGE,
        disposition: 0,
        behavior: ['IDLE'],
    },
    // The nerd who runs the Hypno Vision: you talk to him or knock him out, and either switches it
    // off. The Factory Manager's numbers (damage 0) until he is designed.
    hypno_nerd: {
        type: 'Violencian',
        name: 'Nerd',
        tag: 'hypno_nerd',
        hp: 100,
        armor: -80,
        damage: 0,
        sightRange: 4,
        disposition: 0,
        behavior: ['IDLE'],
        dialogueId: 'hypno_nerd',
    },
    // The frozen area's mooks (plans/ic4-frozen-creatures.md), its `frozen.mob`
    // pool. Each copies the fight numbers and kit of the nearest existing enemy,
    // and its weakness row is the chart's `cold` row (elements.js).
    // Copied from the Graveyard's Rattling Skeleton, whose art it shares.
    snowman: frozenMob('Snowman', {
        gold: 4, loadout: ['rock', 'pipe', 'foil_hat', 'shoe_bags'], hp: 100, armor: 0, damage: ACT2_MOB_DAMAGE,
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
        ...act2Boss(),
        type: 'Siberia',
        name: 'Siberia',
        weak: weaknessesOf('cold'),
        resist: resistancesOf('cold'),
        examine: '[TEXT]',
    },
    // The trash compactor (plans/tc1-trash-compactor-walls.md, ruling TC1R1 a): one machine in the
    // middle of its room that never swings and never moves (sight 0, so it never hunts, and
    // main.js does not let a blow provoke it). The walls closing in are the threat (compactor.js).
    // Stand-ins until designed: armour 6, damage 0, 100 HP, the name and the examine line. Its
    // tag is compactor.js COMPACTOR_TAG; breaking it is what stops the walls.
    compactor: {
        type: 'Compactor',
        name: 'Compactor',
        tag: 'compactor',
        gold: 0,
        hp: 100,
        armor: 6,
        damage: 0,
        sightRange: 0,
        heavy: true,
        bribeable: false,
        thievable: false,
        examine: '[A trash compactor. Break it to stop the walls.]',
    },
};

// RO1: the stand-in that fills the Were-Rat's spot once he has stayed dead the full wait
// (plans/ro1-returning-boss-spot.md). Obviously fake: the Were-Rat's numbers and kit, a
// placeholder name and barks, its own tag (so no fur and no required item), and a tint
// (sprites.js picks the look from that tag).
ENTRIES.returning_boss = {
    ...structuredClone(ENTRIES.wererat),
    name: 'Returning Boss',
    tag: 'returning_boss',
    barks: ['[TEXT]', '[TEXT]'],
};

// The spot a boss at `id` on map `url` leaves open, or null.
export function spotFor(url, id, spots = RETURNING_SPOTS) {
    for (const [spotId, spot] of Object.entries(spots)) {
        if (spot.replaces === id && url && String(url).endsWith(spot.map)) return { id: spotId, ...spot };
    }
    return null;
}

// The picks for every returning spot, from their own stream (never game.rng, never the slot stream).
export function pickReturning(seed, spots = RETURNING_SPOTS) {
    const rng = new RNG((seed ^ 0x2E7B055) >>> 0);
    const picks = {};
    for (const id of Object.keys(spots).sort()) picks[id] = pickFrom(spots[id].pool, rng);
    return picks;
}

export function defaultReturning(spots = RETURNING_SPOTS) {
    const picks = {};
    for (const id of Object.keys(spots)) picks[id] = spots[id].pool[0].entry;
    return picks;
}

// The finale's phase 1 in one place (plans/fin2-financier-fight.md). Both are
// stand-ins until Caelan tunes them: Sun Man stays three turns (his note), and
// the Financier then loses `defenceDrop` of defence for the rest of the fight
// (FINR7 b). 8 is twice the armour he stands up with (his kit dresses him in the
// cardboard cuirass: 4): with 4 the weakest gear, a wooden sword and nothing worn,
// loses to his own healing; with 8 it wins (tests/finale-phase1.test.js).
//
// Sun Man (FINR3) is the encounter's own ally, summoned when the fight begins
// (main.js _beginFinalFight), never placed on a map, so he is not a registry
// entry. His damage is a stand-in, well past the hired lion's 25; his look is a
// borrowed townsperson (`type` is the picture's key).
export const FINALE_PHASE1 = {
    sunManTurns: 3,
    defenceDrop: 8,
    sunMan: { type: 'Stranger', name: 'Sun Man', hp: 100, damage: 30, dialogueId: 'sun_man' },
    sunManTag: 'sun_man',
    financierTag: 'financier_boss',
    // The quest flag that says phase 1 was won, and its value.
    flag: 'finalePhase1',
    won: 'won',
};

// One frozen-area mook: its numbers, the chart's cold row, and placeholder
// name and examine text.
function frozenMob(type, numbers) {
    return {
        type,
        name: type,
        ...numbers,
        weak: weaknessesOf('cold'),
        resist: resistancesOf('cold'),
        examine: '[TEXT]',
    };
}

function alienInvasion() {
    const e = { ...act2Boss(), name: 'Alien Invasion' };
    // GW1R2 (a): he carries the Great Sword. In the kit, so it drops when he falls; in his
    // worn gear in place of the Wooden Sword, so he swings it at you.
    // GW1R5 (c): the sword pushed his haul to 238 GP, over the elite band's 200. Three 15 GP
    // items come off (a burger, a defence poition, a soap): 45 GP, back to 193.
    const lighter = ['boardwalk_burger', 'defence_poition', 'soap'];
    e.loadout = [...e.loadout.filter(x => !lighter.includes(x)), 'ray_gun', 'great_sword'];
    e.equipped = ['great_sword'];
    e.loadout.push('goo');
    e.immune = ['goo'];   // (GO2)
    return e;
}

// The Act 2 bosses' stand-in: the shared block with the ruled damage. The
// Financier copies placeholderBoss() directly, so he keeps 12.
function act2Boss() {
    return { ...placeholderBoss(), damage: ACT2_BOSS_DAMAGE };
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

// Your old character (plans/bn2-old-character-in-town.md): a stand-in block, built from a
// snapshot by echoSpawn. Your own sprite tinted pale (tag old_self), [TEXT] barks.
export const OLD_SELF = {
    type: 'Violencian',   // drawn as you, tinted pale, by its tag (sprites.js byTag)
    tag: 'old_self',
    name: 'Old Self',
    hp: 100,
    armor: 0,
    damage: 0,
    sightRange: 4,
    disposition: 0,
    behavior: ['IDLE'],
    barks: ['[TEXT]', '[TEXT]'],
    barkEveryTurns: 6,
};

// Echo slots (BN2): a character slot filled from a player's kept snapshot, not from a pool. Kept
// apart from SLOTS because nothing in them is picked, saved or required: no seed stream, no save
// field, no registry entry for the balance and validator sweeps to read. `at` is where it stands.
export const ECHO_SLOTS = {
    'town.echo': { kind: 'echo', map: 'town-map.json', spawn: 'old-self', at: { x: 21, y: 16 }, shows: ['friend', 'neutral'] },
    // (GH1, GHR2 c) A character that turned on you is fought only in the Graveyard.
    'graveyard.echo': { kind: 'echo', map: 'graveyard-map.json', spawn: 'old-self-foe', at: { x: 20, y: 12 }, shows: ['foe'] },
};

// (GH1) Does this echo slot stand for this snapshot? No usable snapshot, no ghost.
export function echoStands(slot, snap) {
    if (!slot || !snap || !(snap.maxHp > 0)) return false;
    return (slot.shows || ['friend', 'neutral', 'foe']).includes(attitudeOf(snap));
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
    // Act 2 (plans/spine.md §9, 2026-10-23): each item comes from its zone's
    // quest with the boss a step inside it (plans/ab3-act2-quests.md); `viaQuest` marks that.
    'carnival.boss': {
        kind: 'boss',
        map: 'carnival-map.json',
        requiredDrop: 'act2_item_a',
        viaQuest: true,   // (AB3) the zone's quest hands this over; the boss's death is a step in it
        pool: [{ entry: 'bigfoot', weight: 1 }, { entry: 'ringmaster', weight: 1 }],
    },
    'factory.boss': {
        kind: 'boss',
        map: 'factory-map.json',
        requiredDrop: 'act2_item_b',
        viaQuest: true,   // (AB3) the zone's quest hands this over; the boss's death is a step in it
        pool: [{ entry: 'alien_invasion', weight: 1 }],
    },
    'graveyard.boss': {
        kind: 'boss',
        map: 'graveyard-map.json',
        requiredDrop: 'act2_item_c',
        viaQuest: true,   // (AB3) the zone's quest hands this over; the boss's death is a step in it
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
    // A returning boss spot (RO1R1 a, an exception to spine SL-6 for bosses; plans/ro1-returning-boss-spot.md):
    // once the boss at `replaces` has stayed dead the whole respawn wait, a DIFFERENT boss from the
    // pool stands at `at` as `spawn`. It is not an anchor pick (no map spawn, no entry in the saved
    // picks): the spot's own pick is made by pickReturning. It carries no required item.
    'sewer.returning': {
        kind: 'returning_boss',
        map: 'sewer-map.json',
        replaces: 'wererat',
        spawn: 'wererat_return',
        at: { x: 17, y: 10 },
        pool: [{ entry: 'returning_boss', weight: 1 }],
    },
    // The Carnival's spawn table (plans/rv2-rats-roll-spawn-table.md): the three rats RV1
    // placed, equal weights (a stand-in until tuned). Each rat spawn on the map names a
    // seat and rolls one from here per new game; `seats` is how many spawns there are.
    'carnival.mob': {
        kind: 'mob',
        map: 'carnival-map.json',
        seats: 3,
        pool: [
            { entry: 'birthday_rat', weight: 1 },
            { entry: 'sludge_rat', weight: 1 },
            { entry: 'robot_rat', weight: 1 },
        ],
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
const isReturning = (slot) => slot?.kind === 'returning_boss';

// (BN2) The old character a snapshot makes, standing where the map's echo spawn is; null when
// there is no usable snapshot (the spawn then does not exist). It wears the snapshot's gear,
// minus anything a slot guarantees or a quest owns (it never carries a required item), and
// acts by attitudeOf: a foe fights, a friend is warm, a neutral just stands there.
export function echoSpawn(spawn, snap, echoes = ECHO_SLOTS, slots = SLOTS) {
    if (!spawn || !snap || !snap.gear || typeof snap.gear !== 'object') return null;
    const entry = echoes[spawn.slot] ? OLD_SELF : null;
    if (!entry || attitudeOf(snap) == null || !(snap.maxHp > 0)) return null;
    const required = new Set(Object.values(slots).map(s => s.requiredDrop).filter(Boolean));
    const worn = Object.values(snap.gear).filter(id => typeof id === 'string' && !required.has(id)
        && resolveItemDef(id) && !resolveItemDef(id).questItem);
    const attitude = attitudeOf(snap);
    const out = { ...structuredClone(entry), id: spawn.id, x: spawn.x, y: spawn.y, slot: spawn.slot, equipped: worn, attitude };
    if (spawn.facing) out.facing = spawn.facing;
    if (attitude === 'foe') {
        out.damage = ACT2_MOB_DAMAGE; out.disposition = -40; delete out.behavior;   // no behavior list: born hostile (ai.js)
        // (GH1) Its own snapshot's stats: its max HP, and one worn item is what beating it drops.
        out.hp = snap.maxHp;
        if (worn.length) { out.loadout = [worn[0]]; out.equipped = worn.slice(1); }
    }
    else if (attitude === 'friend') out.disposition = 40;
    return out;
}

// The returning boss spots, by id.
export const RETURNING_SPOTS = Object.fromEntries(Object.entries(SLOTS).filter(([, s]) => isReturning(s)));

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
        if (!isMob(slots[id]) && !isReturning(slots[id])) picks[id] = pickFrom(slots[id].pool, rng);
    }
    for (const id of Object.keys(slots).sort()) {
        if (isMob(slots[id])) {
            const rng = new RNG((seed ^ SLOT_SALT ^ hashId(id)) >>> 0);
            picks[id] = slots[id].seats ? rollSeats(slots[id].pool, slots[id].seats, rng) : dealDeck(slots[id].pool, rng);
        }
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

// A mob slot with `seats` rolls one entry per seat, independently (repeats allowed):
// the zone's spawn table, one roll per mook spawn (plans/rv2-rats-roll-spawn-table.md).
function rollSeats(pool, seats, rng) {
    const rolls = [];
    for (let i = 0; i < seats; i++) rolls.push(pickFrom(pool, rng));
    return rolls;
}

// The deck a mob slot deals from: this game's, when it is a true shuffle of the
// pool (a rolled slot: `seats` entries from it), else the pool's own order (a
// save from before the slot, or the bench).
function deckFor(slot, saved) {
    const order = slot.pool.map(p => p.entry);
    if (slot.seats) {
        const ids = new Set(order);
        const ok = Array.isArray(saved) && saved.length === slot.seats && saved.every(e => ids.has(e));
        return ok ? saved : Array.from({ length: slot.seats }, (_, i) => order[i % order.length]);
    }
    const ok = Array.isArray(saved) && saved.length === order.length
        && order.every(e => saved.includes(e));
    return ok ? saved : order;
}

// Today's content: the first entry of every anchor pool. What a save written
// before slots existed loads, and what a slot with no saved pick falls back to.
// A mob slot has no pick; its deck falls back to the pool's order (deckFor).
export function defaultPicks(slots = SLOTS) {
    const picks = {};
    for (const id of Object.keys(slots)) if (!isMob(slots[id]) && !isReturning(slots[id])) picks[id] = slots[id].pool[0].entry;
    return picks;
}

// A spawn with a `slot` becomes its picked entry (a mob slot: the entry dealt to
// its seat), with the spawn's own id, place and facing on top. A spawn naming an `entry` is placed by hand: it becomes
// that entry the same way. Any other spawn passes through untouched.
export function resolveSpawn(spawn, picks, slots = SLOTS, entries = ENTRIES, returning = null) {
    if (spawn && spawn.returning) {
        const spot = RETURNING_SPOTS[spawn.returning];
        if (!spot) return spawn;
        const want = returning?.[spawn.returning];
        const entryId = spot.pool.some(p => p.entry === want) ? want : spot.pool[0].entry;
        const entry = entries[entryId];
        if (!entry) return spawn;
        const out = { ...structuredClone(entry), id: spawn.id, x: spawn.x, y: spawn.y };
        if (spawn.facing) out.facing = spawn.facing;
        return out;
    }
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

// Does this enemy fill a spine boss slot? (ruling EMR1) The boss flag and a `*_boss` tag
// do not say so: the Borgir boss has the flag and Pike has a tag, and neither fills one.
export function fillsBossSlot(enemy, mapSpawns = [], slots = SLOTS) {
    const slotId = slotIdOf(enemy, mapSpawns);
    return !!slotId && slots[slotId]?.kind === 'boss';
}

// The item a slot guarantees for this enemy, or null.
export function requiredDropFor(enemy, mapSpawns = [], slots = SLOTS) {
    const slotId = slotIdOf(enemy, mapSpawns);
    return (slotId && slots[slotId]?.requiredDrop) || null;
}
