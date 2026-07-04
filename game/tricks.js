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
    hire_lion: {
        id: 'hire_lion', name: 'Hire Lire', gpCost: 12,
        summon: 'lion', summonName: 'Lire', summonTurns: 2, summonHp: 30, summonDamage: 12,
    },
};
