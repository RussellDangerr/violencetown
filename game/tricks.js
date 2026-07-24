// tricks.js — GP-costed "Trick" skills for the wheel's FIGHT / TRICK verbs.
//
// A Trick mirrors a spell, but it costs GP (gold), not MP — "turning tricks for
// money". Tech-flavoured gear grants tricks while equipped (the Ray Gun grants
// Ray Blast); the Trick ring gates each node on grantedTricks + gold, and the
// castTrick resolver (main.js) spends the gold and resolves the effect.
//
//   gpCost      gold spent per use (wheel-model aimRange + the node gate + the
//               castTrick resolver all read it).
//   damage      per-tile damage dealt on affected tiles (via _aoeStrike).
//   damageType  feeds the typed hit-splat (renderer.js).
//   range       reticle reach.
//   aoe         { shape:'burst', radius } | { shape:'cone', depth } | omitted = single-target.

export const TRICKS = {
    // The Ray Gun's shot: a focused bolt of alien energy. Each pull burns an
    // energy cell — and cells cost money, so it spends GP. Single-target, long
    // reach, hits harder than a spell to justify the gold.
    ray_blast: {
        id: 'ray_blast', name: 'Ray Blast', gpCost: 6, damage: 18, damageType: 'energy', range: 6,
        // no aoe → single-target bolt
    },
    // Hire a Lion — a carnival tamer's whistle. Spend GP and a lion bounds out
    // to fight at your side for a couple of turns, then melts back into the
    // crowd. No damage/aim: `summon` routes it to _spawnSummon (main.js).
    // 50 GP -> 25 dmg x 2 turns = 50 total damage: exactly at peg (Law 1). The
    // lion is a combatant, so The Hundred applies: 100 HP.
    hire_lion: {
        id: 'hire_lion', name: 'Hire Lire', gpCost: 50,
        summon: 'lion', summonName: 'Lire', summonTurns: 2, summonHp: 100, summonDamage: 25,
    },
    // Rat Form — a braid of wererat fur (the Rat Ring). Fold down into a rat for
    // a few turns: small enough to slip through the sewer grates. No aim, no
    // damage, no cost — a utility transform. `transform` routes it to the
    // rat-form branch in castTrick (main.js); the countdown ticks in _advanceWorld.
    rat_form: {
        id: 'rat_form', name: 'Rat Form', gpCost: 0,
        transform: 'rat', transformTurns: 3,
    },
    // Ember Rat — the Rat Ring beside a Fire Ring. Conjure a rat of cinder and
    // grudge and send it scurrying into a knot of foes, where it bursts into
    // flame. A ghost/elemental, NEVER a live animal (content rule). Mechanically
    // just a fire burst — reuses the same damage/aoe path as the other Tricks.
    ember_rat: {
        id: 'ember_rat', name: 'Ember Rat', gpCost: 4, damage: 14, damageType: 'fire', range: 5,
        aoe: { shape: 'burst', radius: 1 },
    },
};
