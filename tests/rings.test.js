// rings.test.js — the pure store ops behind the Remembrance Rings axis.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    FINGERS, HANDS, UNLOCK_ORDER,
    unlockedFingers, unlockedSlots, adjacentPairs,
    findFusion, resolveAdjacencies, slottedActives, aggregatePassives,
    slotRing, unslotRing, acquireRing, sanitizeSlots,
    mergeKnown, isActive,   // (ring Task 5) relocated here from the retired skills.js
} from '../game/rings.js';

// A tiny fixture roster + fusion table.
const RINGS = {
    rat:   { id: 'rat',   tags: ['vermin', 'sewer'], grants: 'rat_form', passive: { evasion: 5 } },
    fire:  { id: 'fire',  tags: ['fire'],            passive: { fireDamage: 10 } },
    water: { id: 'water', tags: ['water', 'sewer'],  passive: { armor: 1 } },
};
const FUSIONS = [
    { pair: ['vermin', 'fire'],  id: 'ember_rat', grants: 'ember_rat' },
    { pair: ['sewer', 'water'],  id: 'pet_slime', grants: 'pet_slime' },
];
const get = (id) => RINGS[id] || null;

describe('unlock ladder', () => {
    test('tier 0 unlocks only the ring finger (2 slots)', () => {
        assert.deepEqual(unlockedFingers(0), ['ring']);
        assert.equal(unlockedSlots(0).length, 2);
    });
    test('tiers 1..4 unlock middle, index, thumb, pinky (4,6,8,10 slots)', () => {
        assert.equal(unlockedSlots(1).length, 4);
        assert.equal(unlockedSlots(2).length, 6);
        assert.equal(unlockedSlots(3).length, 8);
        assert.equal(unlockedSlots(4).length, 10);
    });
    test('slot keys are hand:finger and stable', () => {
        assert.ok(unlockedSlots(0).every(s => s.key === `${s.hand}:${s.finger}`));
        assert.deepEqual(unlockedSlots(0).map(s => s.key).sort(), ['left:ring', 'right:ring']);
    });
});

describe('adjacency', () => {
    test('pair counts are 0,2,4,6,8 across tiers 0..4', () => {
        assert.equal(adjacentPairs(0).length, 0);   // two rings on opposite hands — never adjacent
        assert.equal(adjacentPairs(1).length, 2);
        assert.equal(adjacentPairs(2).length, 4);
        assert.equal(adjacentPairs(3).length, 6);
        assert.equal(adjacentPairs(4).length, 8);
    });
    test('adjacency never crosses hands', () => {
        for (const { a, b } of adjacentPairs(4)) {
            assert.equal(a.split(':')[0], b.split(':')[0]);
        }
    });
    test('unlocked fingers are always anatomically contiguous', () => {
        for (let t = 0; t <= 4; t++) {
            const idxs = unlockedFingers(t).map(f => FINGERS.indexOf(f)).sort((x, y) => x - y);
            for (let i = 1; i < idxs.length; i++) assert.equal(idxs[i] - idxs[i - 1], 1);
        }
    });
});

describe('findFusion', () => {
    test('matches a tag pair in either ring order', () => {
        assert.equal(findFusion(RINGS.rat, RINGS.fire, FUSIONS).id, 'ember_rat');
        assert.equal(findFusion(RINGS.fire, RINGS.rat, FUSIONS).id, 'ember_rat');
    });
    test('returns null when no pair matches', () => {
        assert.equal(findFusion(RINGS.fire, RINGS.water, FUSIONS), null);
    });
    test('is deterministic — first authored match wins', () => {
        // rat+water share tag 'sewer'; only pet_slime matches (sewer+water).
        assert.equal(findFusion(RINGS.rat, RINGS.water, FUSIONS).id, 'pet_slime');
    });
    test('a passive-only ring (no tags) never fuses, never throws', () => {
        const band = { id: 'band', passive: { armor: 1 } }; // no tags array
        assert.equal(findFusion(band, RINGS.fire, FUSIONS), null);
        assert.equal(findFusion(RINGS.fire, band, FUSIONS), null);
    });
    test('a malformed fusion entry (no pair) is skipped, not fatal', () => {
        const bad = [{ id: 'broken' }, ...FUSIONS]; // first entry lacks .pair
        assert.equal(findFusion(RINGS.rat, RINGS.fire, bad).id, 'ember_rat');
    });
});

describe('resolveAdjacencies', () => {
    test('an authored adjacent pair grants its fusion active; others resonate', () => {
        // tier 1: left has ring+middle adjacent, right has ring+middle adjacent.
        const slots = { 'left:ring': 'rat', 'left:middle': 'fire', 'right:ring': 'water', 'right:middle': null };
        const r = resolveAdjacencies(1, slots, get, FUSIONS);
        assert.deepEqual(r.grantedActives, ['ember_rat']);
        assert.equal(r.fusions.length, 1);
        assert.equal(r.resonancePairs, 0); // right pair has an empty slot → not a pair
    });
    test('a filled non-fusion adjacent pair counts as resonance, not fusion', () => {
        const slots = { 'left:ring': 'fire', 'left:middle': 'water' };
        const r = resolveAdjacencies(1, slots, get, FUSIONS);
        assert.deepEqual(r.grantedActives, []);
        assert.equal(r.resonancePairs, 1);
    });
    test('the same fusion adjacent on both hands grants once (deduped)', () => {
        const slots = {
            'left:ring': 'rat', 'left:middle': 'fire',
            'right:ring': 'rat', 'right:middle': 'fire',
        };
        const r = resolveAdjacencies(1, slots, get, FUSIONS);
        assert.deepEqual(r.grantedActives, ['ember_rat']); // once, not twice
        assert.equal(r.fusions.length, 2);                 // but both discoveries recorded
    });
});

describe('slottedActives / aggregatePassives', () => {
    test('slottedActives collects each slotted ring grant, deduped', () => {
        const slots = { 'left:ring': 'rat', 'right:ring': 'water' };
        assert.deepEqual(slottedActives(slots, get), ['rat_form']); // water has no grant
    });
    test('aggregatePassives sums numeric modifiers across slots', () => {
        const slots = { 'left:ring': 'fire', 'left:middle': 'water', 'right:ring': 'rat' };
        assert.deepEqual(aggregatePassives(slots, get), { fireDamage: 10, armor: 1, evasion: 5 });
    });
});

describe('slotRing / unslotRing / acquireRing', () => {
    test('acquireRing adds to the pool and auto-slots into the first empty unlocked slot', () => {
        const owned = new Set(), slots = {};
        assert.equal(acquireRing(owned, slots, 0, 'rat'), true);
        assert.equal(owned.has('rat'), true);
        assert.equal(slots['left:ring'], 'rat'); // first unlocked slot
    });
    test('acquireRing is idempotent', () => {
        const owned = new Set(['rat']), slots = { 'left:ring': 'rat' };
        assert.equal(acquireRing(owned, slots, 0, 'rat'), false);
    });
    test('slotRing refuses an un-owned ring or a locked slot, and moves a ring out of its old slot', () => {
        const owned = new Set(['rat']), slots = {};
        assert.equal(slotRing(slots, owned, 0, 'right:ring', 'fire'), false); // not owned
        assert.equal(slotRing(slots, owned, 0, 'left:middle', 'rat'), false); // middle locked at tier 0
        assert.equal(slotRing(slots, owned, 0, 'left:ring', 'rat'), true);
        assert.equal(slotRing(slots, owned, 1, 'left:middle', 'rat'), true);  // moves rat
        assert.equal(slots['left:ring'], null);   // vacated — a ring is one physical instance
        assert.equal(slots['left:middle'], 'rat');
    });
    test('unslotRing clears a slot, returns false if already empty', () => {
        const slots = { 'left:ring': 'rat' };
        assert.equal(unslotRing(slots, 'left:ring'), true);
        assert.equal(slots['left:ring'], null);
        assert.equal(unslotRing(slots, 'left:ring'), false);
    });
});

describe('sanitizeSlots', () => {
    test('drops assignments for un-owned rings and locked slots', () => {
        const owned = new Set(['rat']);
        const dirty = { 'left:ring': 'rat', 'left:middle': 'ghost', 'right:pinky': 'rat' };
        const clean = sanitizeSlots(dirty, owned, 0); // tier 0: only ring fingers unlocked
        assert.deepEqual(clean, { 'left:ring': 'rat' });
    });
    test('dedupes the same ring across slots (one physical instance, first wins)', () => {
        const owned = new Set(['rat']);
        // both slots unlocked at tier 1, both owned — corruption is the duplicate id.
        const dirty = { 'left:ring': 'rat', 'left:middle': 'rat' };
        const clean = sanitizeSlots(dirty, owned, 1);
        assert.deepEqual(clean, { 'left:ring': 'rat' });               // not counted twice
        assert.deepEqual(aggregatePassives(clean, get), { evasion: 5 }); // +5, never +10
    });
});

// ── Skill-merge helpers (relocated from the retired skills.js, ring Task 5) ────
// These two drive hasSpell/hasTrick (main.js). Their only unit tests lived in the
// deleted skills.test.js; ported here so the merge + suppression-aware read stay
// covered now that skills.js is gone.
describe('mergeKnown', () => {
    test('unions base, ring actives, and gear with no dupes, base first', () => {
        assert.deepEqual(mergeKnown(['a', 'b'], ['b', 'c'], ['c', 'd']), ['a', 'b', 'c', 'd']);
    });
    test('empty ring actives + gear returns the base unchanged', () => {
        assert.deepEqual(mergeKnown(['a', 'b'], [], []), ['a', 'b']);
    });
});

describe('isActive', () => {
    test('true when present and not suppressed', () => {
        assert.equal(isActive(['a', 'b'], new Set(), 'a'), true);
    });
    test('false when suppressed', () => {
        assert.equal(isActive(['a', 'b'], new Set(['a']), 'a'), false);
    });
    test('false when absent', () => {
        assert.equal(isActive(['a'], new Set(), 'z'), false);
    });
});
