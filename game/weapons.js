// weapons.js — the weapon definitions, extracted from main.js so they're a pure,
// importable data module (main.js and the content-integrity check both consume
// it). Weapons live here; everything else lives in ITEMS (items.js). The save
// system resolves an id via WEAPONS[id] || ITEMS[id] (see item-registry.js resolveItemDef).
//
// Several weapons GRANT a skill while worn (grantsTricks / grantsSpells) — the
// gear-derived ability wiring reads these in _refreshGrantedSkills.
//
// Every weapon names a class (weaponClass). A class says how many hands it
// takes and which kinds of hit it lands (plans/ws1-weapon-class-table.md).
// Nothing reads hands or attackKinds in play yet; class ids are internal.

// The hit kinds a weapon can land.
export const ATTACK_KINDS = Object.freeze(['slash', 'stab', 'crush']);

const cls = (id, hands, attackKinds) =>
    Object.freeze({ id, hands, attackKinds: Object.freeze(attackKinds), kit: Object.freeze([]) });

// kit: the class's base kit. Empty on every class until it is ruled.
export const WEAPON_CLASSES = Object.freeze({
    shield:       cls('shield',       1, ['crush']),
    axe:          cls('axe',          1, ['slash']),
    sword:        cls('sword',        1, ['slash', 'stab']),
    dagger:       cls('dagger',       1, ['stab', 'slash']),
    hammer:       cls('hammer',       1, ['crush']),
    great_sword:  cls('great_sword',  2, ['slash', 'stab']),
    battle_axe:   cls('battle_axe',   2, ['slash']),
    war_hammer:   cls('war_hammer',   2, ['crush']),
    book:         cls('book',         1, ['crush']),    // book and grimoire are one class
    bell:         cls('bell',         1, ['crush']),
    whip:         cls('whip',         1, ['slash']),
    knuckles:     cls('knuckles',     1, ['crush']),    // the fist that crushes
    claws:        cls('claws',        1, ['slash']),    // the fist that slashes
    doll:         cls('doll',         1, ['stab']),     // a voodoo doll: hit the doll, the target feels it
    wand:         cls('wand',         1, ['stab']),
    staff:        cls('staff',        1, ['crush']),
    throwing_axe: cls('throwing_axe', 1, ['slash']),
    frying_pan:   cls('frying_pan',   1, ['crush']),
});

// The class a weapon def belongs to, or null when it names none.
export function weaponClassOf(def) {
    return (def && WEAPON_CLASSES[def.weaponClass]) || null;
}

export const WEAPONS = {
    wooden_sword: {
        id: 'wooden_sword', name: '[Wooden Sword]', damage: 10, equipSlot: 'weapon', icon: 'sword',
        weaponClass: 'sword',
        useType: 'equip',   // without it, the sword could never be re-equipped once swapped out
        category: 'weapon',
        baseValue: 6,
        description: 'A practice blade, all splinters and optimism. Swings true enough.',
    },
    // Ray Gun — a tech weapon that GRANTS the Ray Blast trick (GP) while worn.
    // Its world source is the Factory alien boss (deferred); the def lives here
    // so the weapon-grants-skill wiring is real and testable now.
    ray_gun: {
        id: 'ray_gun', name: '[Ray Gun]', damage: 22, damageType: 'energy', equipSlot: 'weapon',
        useType: 'equip', grantsTricks: ['ray_blast'],
        weaponClass: 'wand',
        category: 'weapon',
        baseValue: 45,
        description: 'Dented brass housing around a coil of glass that hums when charged. Nobody has explained how it works, least of all it.',
    },
    // Fearmur — a leg-bone club. Grants the Boo! fear spell (MP) while worn, and
    // fears an enemy you hit twice in a row (onHit: 'fearOnRepeat'). Source: the
    // Graveyard (world drop deferred; the def lives here for the fear mechanics).
    fearmur: {
        id: 'fearmur', name: '[Fearmur]', damage: 14, equipSlot: 'weapon',
        useType: 'equip', grantsSpells: ['boo'], onHit: 'fearOnRepeat',
        weaponClass: 'hammer',
        category: 'weapon',
        baseValue: 28,
        description: "A single femur, gripped at the joint and colder than it has any right to be. It hasn't warmed up once.",
    },
    // Gator Tail — a dehydrated gator club. Heavy, mean, and you're not sure
    // where it came from (Lonny, the Sewer's own alligator, has a theory).
    gator_tail: {
        id: 'gator_tail', name: '[Gator Tail]', damage: 16, equipSlot: 'weapon', useType: 'equip',
        weaponClass: 'hammer',
        category: 'weapon',
        baseValue: 18,
        description: "A stiff, leathery tail, heavier than it looks and reeking faintly of swamp water. You've carried worse for less reason.",
    },
    // Lion Whip — a carnival tamer's whip. Reaches 3 tiles and YANKS whatever it
    // strikes one tile closer; grants the "Hire a Lion" trick (GP) while worn.
    lion_whip: {
        id: 'lion_whip', name: '[Lion Whip]', damage: 12, equipSlot: 'weapon', useType: 'equip',
        reach: 3, pullDistance: 1, grantsTricks: ['hire_lion'],
        weaponClass: 'whip',
        category: 'weapon',
        baseValue: 26,
        description: "A tamer's whip, braided leather gone shiny at the grip. Crack it right and something always comes closer.",
    },
};
