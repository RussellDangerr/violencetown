// spells.js — castable spells for the wheel's FIGHT → Magic verb.
//
// Spell shape: { id, name, mpCost, damage, damageType, range, aoe }
//   damageType  feeds the typed hit-splat (renderer.js — 'fire' and 'cold' wired).
//   range       reticle reach (wheel-model aimRange reads it per selected spell).
//   aoe         { shape:'burst', radius } 3×3-style splash centred on the reticle
//             | { shape:'cone',  depth }  cardinal triangle from the caster (widths 1,3,5…)
//   Every enemy on an affected tile takes the full `damage` (AoE doesn't fall off).
//
// The Magic ring (wheel SPELL layer) lets the player pick between these.

export const SPELLS = {
    // A real fireball: a hot 3×3 burst you lob onto a tile.
    fireball: {
        id: 'fireball', name: 'Fireball', mpCost: 12, damage: 20, damageType: 'fire',
        range: 6, aoe: { shape: 'burst', radius: 1 },
    },
    // Cone of Cold: a widening triangle of frost from the caster. Damage only for
    // now — the freeze/slow status is a later pass (kept off deliberately).
    coneOfCold: {
        id: 'coneOfCold', name: 'Cone of Cold', mpCost: 10, damage: 14, damageType: 'cold',
        range: 3, aoe: { shape: 'cone', depth: 3 },
    },
    // Boo! — no damage; a self-centred burst of dread that FEARS every enemy
    // around you (they flee for `fear` turns). Granted by the Fearmur; resolved
    // by the castBoo resolver (main.js), not castSpell (which deals damage).
    boo: {
        id: 'boo', name: 'Boo!', mpCost: 8, damage: 0, damageType: 'fear',
        range: 0, fear: 3, aoe: { shape: 'self', radius: 2 },
    },
};
