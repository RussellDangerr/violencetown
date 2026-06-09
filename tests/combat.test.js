// combat.test.js — combat.js attack() math is deterministic and correct.
//
// combat.js is pure (no DOM, no RNG, no imports), so we exercise the REAL
// Entity/attack/formatDamageNumber. These are the rules of the game:
//   - everything starts at 100 HP
//   - damage is one flat number, no rolls, no misses
//   - armor is a flat reduction applied before damage lands; at least 1 always
//     gets through
//   - hp clamps at 0 and the entity dies when it hits 0
//
// All of these are EXPECTED GREEN — they pin the combat contract so a future
// change that breaks the math is caught.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Entity, attack, formatDamageNumber, DEFAULT_HP, DEFAULT_ARMOR } from '../game/combat.js';

describe('Entity defaults', () => {
    test('defaults to 100 HP, 0 armor, alive', () => {
        const e = new Entity({ name: '[Test]' });
        assert.equal(e.hp, DEFAULT_HP);
        assert.equal(e.maxHp, DEFAULT_HP);
        assert.equal(e.armor, DEFAULT_ARMOR);
        assert.equal(e.isAlive(), true);
        assert.equal(e.isDead(), false);
    });

    test('honors explicit hp / armor', () => {
        const e = new Entity({ name: '[Tank]', hp: 50, armor: 5 });
        assert.equal(e.hp, 50);
        assert.equal(e.maxHp, 50);
        assert.equal(e.armor, 5);
    });
});

describe('Entity.takeDamage — armor reduction', () => {
    test('subtracts armor from raw damage', () => {
        const e = new Entity({ name: '[Armored]', hp: 100, armor: 3 });
        const dealt = e.takeDamage(10);
        assert.equal(dealt, 7, '10 raw - 3 armor = 7 dealt');
        assert.equal(e.hp, 93);
    });

    test('always deals at least 1, even against overwhelming armor', () => {
        const e = new Entity({ name: '[Bunker]', hp: 100, armor: 999 });
        const dealt = e.takeDamage(10);
        assert.equal(dealt, 1, 'minimum 1 always lands');
        assert.equal(e.hp, 99);
    });

    test('exactly-lethal damage drops hp to 0 and kills', () => {
        const e = new Entity({ name: '[Mook]', hp: 12, armor: 0 });
        const dealt = e.takeDamage(12);
        assert.equal(dealt, 12);
        assert.equal(e.hp, 0);
        assert.equal(e.isDead(), true);
        assert.equal(e.isAlive(), false);
    });

    test('over-kill clamps hp at 0 (no negative HP)', () => {
        const e = new Entity({ name: '[Mook]', hp: 8, armor: 0 });
        const dealt = e.takeDamage(1000);
        assert.equal(dealt, 1000, 'dealt is the post-armor amount, not the clamped loss');
        assert.equal(e.hp, 0, 'hp floors at 0');
        assert.equal(e.isDead(), true);
    });
});

describe('attack()', () => {
    test('returns the full result shape with correct numbers', () => {
        const atk = new Entity({ name: '[Player]' });
        const def = new Entity({ name: '[Rat]', hp: 50, armor: 2 });
        const r = attack(atk, def, 15);
        assert.deepEqual(r, {
            attacker: '[Player]',
            target: '[Rat]',
            rawDamage: 15,
            dealt: 13,        // 15 - 2 armor
            blocked: 2,
            targetHp: 37,     // 50 - 13
            killed: false,
        });
    });

    test('reports killed when the blow is lethal', () => {
        const atk = new Entity({ name: '[Player]' });
        const def = new Entity({ name: '[Rat]', hp: 5, armor: 0 });
        const r = attack(atk, def, 5);
        assert.equal(r.dealt, 5);
        assert.equal(r.targetHp, 0);
        assert.equal(r.killed, true);
    });

    test('is deterministic — identical inputs yield identical results', () => {
        const mk = () => attack(
            new Entity({ name: '[A]' }),
            new Entity({ name: '[B]', hp: 30, armor: 4 }),
            13,
        );
        assert.deepEqual(mk(), mk());
    });

    test('attacking an already-dead target returns null (no double-kill)', () => {
        const atk = new Entity({ name: '[Player]' });
        const def = new Entity({ name: '[Corpse]', hp: 1, armor: 0 });
        attack(atk, def, 1);            // kill it
        assert.equal(def.isDead(), true);
        const r2 = attack(atk, def, 50); // swing at the corpse
        assert.equal(r2, null);
        assert.equal(def.hp, 0, 'a dead target takes no further damage');
    });

    test('blocked never goes negative when damage exceeds armor', () => {
        const r = attack(new Entity({ name: '[A]' }), new Entity({ name: '[B]', armor: 1 }), 20);
        assert.equal(r.blocked, 1);
        assert.ok(r.blocked >= 0);
    });
});

describe('formatDamageNumber()', () => {
    test('plain number when nothing blocked and target survives', () => {
        const r = attack(new Entity({ name: '[A]' }), new Entity({ name: '[B]', hp: 50 }), 10);
        assert.equal(formatDamageNumber(r), '10');
    });

    test('annotates blocked damage', () => {
        const r = attack(new Entity({ name: '[A]' }), new Entity({ name: '[B]', hp: 50, armor: 4 }), 10);
        assert.equal(formatDamageNumber(r), '6 (4 blocked)');
    });

    test('marks a kill with the ✕ glyph', () => {
        const r = attack(new Entity({ name: '[A]' }), new Entity({ name: '[B]', hp: 3 }), 10);
        assert.equal(formatDamageNumber(r), '10 ✕');
    });

    test('null result formats to null', () => {
        assert.equal(formatDamageNumber(null), null);
    });
});
