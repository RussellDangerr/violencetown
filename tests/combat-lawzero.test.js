// tests/combat-lawzero.test.js — Law 0: The Hundred. Every combatant of
// consequence has exactly 100 HP; only vermin:true spawns may go below.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Enemy } from '../game/enemies.js';

describe('Law 0 — The Hundred', () => {
    test('an Enemy with no hp override defaults to 100', () => {
        const e = new Enemy({ id: 'g1', type: 'Grunt', x: 0, y: 0 });
        assert.equal(e.entity.maxHp, 100);
        assert.equal(e.entity.hp, 100);
    });
    test('vermin may be sub-Hundred and carry the flag', () => {
        const r = new Enemy({ id: 'r1', type: 'Rat', x: 0, y: 0, hp: 16, vermin: true });
        assert.equal(r.entity.maxHp, 16);
        assert.equal(r.vermin, true);
    });
});
