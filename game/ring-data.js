// ring-data.js — the Remembrance Rings roster + fusion table (CONTENT).
//
// This is the long tail Caelan authors: each boss/notable foe → a remembrance
// material → a ring here; each interesting adjacency → a FUSIONS entry. Fusions
// key on TAGS not ids, so one recipe covers a whole family. Effects conjure
// ghosts/elementals — never gore or animal cruelty (see plans/remembrance-rings.md).

export const RINGS = {
    rat_ring: {
        id: 'rat_ring',
        name: '[Rat Ring]',
        description: 'A braid of coarse wererat fur set in dull silver. It twitches when you look away.',
        tags: ['vermin', 'sewer'],
        remembranceFrom: 'wererat_boss',
        grants: 'rat_form',            // an active — feeds the wheel
        passive: { evasion: 5 },       // small always-on modifier
    },
    fire_ring: {
        id: 'fire_ring',
        name: '[Fire Ring]',
        description: 'A band of blackened copper that is always a little too warm to wear.',
        tags: ['fire'],
        passive: { fireDamage: 10 },   // +10% (applied in combat, Task 6)
        trigger: { on: 'hit', effect: 'ignite', chance: 0.25 },
    },
};

export const FUSIONS = [
    {
        // Rat Ring (vermin) beside Fire Ring (fire) → a conjured fire-elemental
        // rat. NOT a live animal — a rat of cinder and grudge (content rule).
        pair: ['vermin', 'fire'],
        id: 'ember_rat',
        name: '[Ember Rat]',
        grants: 'ember_rat',
    },
];
