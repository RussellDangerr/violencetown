// weapons.js — the weapon definitions, extracted from main.js so they're a pure,
// importable data module (main.js and the content-integrity check both consume
// it). Weapons live here; everything else lives in ITEMS (items.js). The save
// system resolves an id via WEAPONS[id] || ITEMS[id] (see main.js _resolveItemDef).
//
// Several weapons GRANT a skill while worn (grantsTricks / grantsSpells) — the
// gear-derived ability wiring reads these in _refreshGrantedSkills.
export const WEAPONS = {
    wooden_sword: {
        id: 'wooden_sword', name: '[Wooden Sword]', damage: 10, equipSlot: 'weapon', icon: 'sword',
    },
    // Ray Gun — a tech weapon that GRANTS the Ray Blast trick (GP) while worn.
    // Its world source is the Factory alien boss (deferred); the def lives here
    // so the weapon-grants-skill wiring is real and testable now.
    ray_gun: {
        id: 'ray_gun', name: '[Ray Gun]', damage: 22, damageType: 'energy', equipSlot: 'weapon',
        useType: 'equip', grantsTricks: ['ray_blast'],
    },
    // Fearmur — a leg-bone club. Grants the Boo! fear spell (MP) while worn, and
    // fears an enemy you hit twice in a row (onHit: 'fearOnRepeat'). Source: the
    // Graveyard (world drop deferred; the def lives here for the fear mechanics).
    fearmur: {
        id: 'fearmur', name: '[Fearmur]', damage: 14, equipSlot: 'weapon',
        useType: 'equip', grantsSpells: ['boo'], onHit: 'fearOnRepeat',
    },
    // Gator Tail — a dehydrated gator club. Heavy, mean, and you're not sure
    // where it came from (Lonny, the Sewer's own alligator, has a theory).
    gator_tail: {
        id: 'gator_tail', name: '[Gator Tail]', damage: 16, equipSlot: 'weapon', useType: 'equip',
    },
    // Lion Whip — a carnival tamer's whip. Reaches 3 tiles and YANKS whatever it
    // strikes one tile closer; grants the "Hire a Lion" trick (GP) while worn.
    lion_whip: {
        id: 'lion_whip', name: '[Lion Whip]', damage: 12, equipSlot: 'weapon', useType: 'equip',
        reach: 3, pullDistance: 1, grantsTricks: ['hire_lion'],
    },
};
