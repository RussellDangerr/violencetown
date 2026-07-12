// skills.test.js — the pure store ops behind the ring-builds ability axis.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    SKILL_SLOTS, mergeKnown, isActive, learnInto,
    equipSkill, unequipSkill, sanitizeEquipped,
} from '../game/skills.js';

describe('mergeKnown', () => {
    test('unions base, equipped, and gear with no dupes, base first', () => {
        assert.deepEqual(mergeKnown(['a', 'b'], ['b', 'c'], ['c', 'd']), ['a', 'b', 'c', 'd']);
    });
    test('empty equipped + gear returns the base unchanged', () => {
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

describe('learnInto', () => {
    test('adds to pool and auto-equips when a slot is free', () => {
        const pool = new Set(), eq = [];
        assert.equal(learnInto(pool, eq, 6, 'x'), true);
        assert.equal(pool.has('x'), true);
        assert.deepEqual(eq, ['x']);
    });
    test('learns but does NOT auto-equip when the loadout is full', () => {
        const pool = new Set(['a', 'b']), eq = ['a', 'b'];
        assert.equal(learnInto(pool, eq, 2, 'c'), true);
        assert.equal(pool.has('c'), true);
        assert.deepEqual(eq, ['a', 'b']); // no room — stays in the pool only
    });
    test('is idempotent — re-learning returns false and does not duplicate', () => {
        const pool = new Set(['a']), eq = ['a'];
        assert.equal(learnInto(pool, eq, 6, 'a'), false);
        assert.deepEqual([...pool], ['a']);
        assert.deepEqual(eq, ['a']);
    });
});

describe('equipSkill / unequipSkill', () => {
    test('equipSkill slots a learned, unslotted skill when room', () => {
        const pool = new Set(['a', 'b']), eq = ['a'];
        assert.equal(equipSkill(pool, eq, 6, 'b'), true);
        assert.deepEqual(eq, ['a', 'b']);
    });
    test('equipSkill refuses when unlearned, already slotted, or full', () => {
        assert.equal(equipSkill(new Set(['a']), ['a'], 6, 'z'), false); // unlearned
        assert.equal(equipSkill(new Set(['a']), ['a'], 6, 'a'), false); // already slotted
        assert.equal(equipSkill(new Set(['a', 'b']), ['a'], 1, 'b'), false); // full
    });
    test('unequipSkill removes from the loadout, returns false if absent', () => {
        const eq = ['a', 'b'];
        assert.equal(unequipSkill(eq, 'a'), true);
        assert.deepEqual(eq, ['b']);
        assert.equal(unequipSkill(eq, 'z'), false);
    });
});

describe('sanitizeEquipped', () => {
    test('keeps only learned ids, drops dupes, clamps to capacity', () => {
        assert.deepEqual(sanitizeEquipped(['a', 'b', 'c'], ['a', 'a', 'z', 'b', 'c'], 2), ['a', 'b']);
    });
    test('empty in, empty out', () => {
        assert.deepEqual(sanitizeEquipped([], [], 6), []);
    });
});

describe('SKILL_SLOTS', () => {
    test('exposes generous fixed capacities', () => {
        assert.equal(SKILL_SLOTS.trick, 6);
        assert.equal(SKILL_SLOTS.spell, 6);
    });
});
