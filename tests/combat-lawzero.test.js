// tests/combat-lawzero.test.js — Law 0: The Hundred. Every combatant has
// exactly 100 HP, no exceptions (amended 2026-07-24: repeals the old vermin
// sub-Hundred exemption — softness is now negative armor, Law 3).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Enemy } from '../game/enemies.js';
import { lintEntity } from '../tools/balance-harness.mjs';

describe('Law 0 — The Hundred', () => {
    test('an Enemy with no hp override defaults to 100', () => {
        const e = new Enemy({ id: 'g1', type: 'Grunt', x: 0, y: 0 });
        assert.equal(e.entity.maxHp, 100);
        assert.equal(e.entity.hp, 100);
    });
    test('vermin:true gets 100 hp too — it is a role marker, not an hp exemption', () => {
        const r = new Enemy({ id: 'r1', type: 'Rat', x: 0, y: 0, vermin: true });
        assert.equal(r.entity.maxHp, 100);
        assert.equal(r.entity.hp, 100);
        assert.equal(r.vermin, true);
    });
    test('lintEntity now flags a sub-Hundred vermin (the repealed exemption)', () => {
        const flags = lintEntity({ type: 'Rat', hp: 16, armor: 0, damage: 6, gold: 0, vermin: true });
        assert.ok(flags.some(f => f.includes('Law 0')), 'a sub-100 vermin used to pass; it must fail now');
    });
});
