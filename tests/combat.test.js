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

import { Entity, attack, formatDamageNumber, computeHit, elementalMult, isBackstab, DEFAULT_HP, DEFAULT_ARMOR } from '../game/combat.js';

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

    // Negative armor (Law 3 amended 2026-07-24, repeals the vermin sub-Hundred
    // exception): max(1, raw - armor) already ADDS the deficit when armor is
    // negative, so softness lives entirely in the armor stat and The Hundred
    // never bends. These are PINS, not new behavior — takeDamage needs no change.
    test("Caelan's example: -10 armor turns a 1-hit into 11", () => {
        const e = new Entity({ hp: 100, armor: -10 });
        const dealt = e.takeDamage(1);
        assert.equal(dealt, 11, 'max(1, 1 - (-10)) = 11');
        assert.equal(e.hp, 89);
    });
    test("Caelan's example: -80 armor one-shots to a reference (20) swing", () => {
        const e = new Entity({ hp: 100, armor: -80 });
        const dealt = e.takeDamage(20);
        assert.equal(dealt, 100, 'max(1, 20 - (-80)) = 100');
        assert.equal(e.hp, 0);
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

describe('computeHit — the bucket law (Gold Standard Law 2)', () => {
    test('base alone passes through', () => {
        assert.equal(computeHit({ base: 10 }), 10);
    });
    test('flats add before multipliers', () => {
        // (10 + 5) × 2 = 30
        assert.equal(computeHit({ base: 10, flats: 5, elemental: 2 }), 30);
    });
    test('multipliers from different categories multiply', () => {
        // 20 × 2 (weakness) × 1.5 (backstab) = 60 — the "above 50" worked example
        assert.equal(computeHit({ base: 20, elemental: 2, positional: 1.5 }), 60);
    });
    test('outgoing and incoming status buckets fold in', () => {
        // Blind attacker: 8 × 0.5 = 4
        assert.equal(computeHit({ base: 8, outgoingMult: 0.5 }), 4);
        // Guarding defender: 10 × 0.5 = 5
        assert.equal(computeHit({ base: 10, incomingMult: 0.5 }), 5);
    });
    test('rounds ONCE at the end, floor at 1', () => {
        // 9 × 0.5 = 4.5 → rounds to 5 (round-once law; the old inline floor gave 4)
        assert.equal(computeHit({ base: 9, outgoingMult: 0.5 }), 5);
        // elemental immunity ×0 is the one true zero — no floor to 1
        assert.equal(computeHit({ base: 20, elemental: 0 }), 0);
        // tiny positive result floors at 1
        assert.equal(computeHit({ base: 1, outgoingMult: 0.4 }), 1);
    });
    test('immunity annihilates flats and other multipliers', () => {
        assert.equal(computeHit({ base: 20, flats: 10, elemental: 0, positional: 1.5 }), 0);
    });
    test('missing base yields 0, never NaN', () => {
        assert.equal(computeHit({}), 0);
    });
});

describe('elementalMult — Law 2 elemental family', () => {
    const gasbag = { weak: ['fire'], resist: ['cold'], immune: ['fear'] };
    test('weakness doubles', () => assert.equal(elementalMult('fire', gasbag), 2));
    test('resistance halves', () => assert.equal(elementalMult('cold', gasbag), 0.5));
    test('immunity zeroes', () => assert.equal(elementalMult('fear', gasbag), 0));
    test('untyped damage or unlisted type is neutral', () => {
        assert.equal(elementalMult(undefined, gasbag), 1);
        assert.equal(elementalMult('energy', gasbag), 1);
        assert.equal(elementalMult('fire', {}), 1);
        assert.equal(elementalMult('fire', null), 1);
    });
    test('a type in both weak and immune → immune wins (0)', () => {
        assert.equal(elementalMult('fire', { weak: ['fire'], immune: ['fire'] }), 0);
    });
});

describe('isBackstab — Law 2 positional', () => {
    test('attacker on the tile directly behind the facing → true', () => {
        const e = { x: 5, y: 5, _lastDx: 0, _lastDy: -1 };   // moved north, faces north
        assert.equal(isBackstab(5, 6, e), true);               // player directly south
    });
    test('any other adjacent tile → false', () => {
        const e = { x: 5, y: 5, _lastDx: 0, _lastDy: -1 };
        assert.equal(isBackstab(4, 5, e), false);
        assert.equal(isBackstab(4, 6, e), false);              // diagonal-behind of a CARDINAL facing is not the back tile
    });
    test('an enemy that has never moved cannot be backstabbed', () => {
        assert.equal(isBackstab(5, 6, { x: 5, y: 5 }), false);
    });
});
