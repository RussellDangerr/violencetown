// knockout-guard.test.js — a knockout kills through a live Defence Poition (FX62).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Entity, attack, knockoutDamage } from '../game/combat.js';
import { Enemy } from '../game/enemies.js';

function guarded(amount) {
    const e = new Enemy({ type: 'Red Fungus', x: 1, y: 1 });
    e.addBuff('defence', 'Defence', 5, 'buff', { stat: 'defence', amount });
    return e;
}

describe('knockoutDamage counts the guard', () => {
    test('a guarded enemy dies to the knockout', () => {
        const e = guarded(7);
        const dmg = knockoutDamage(1, e.entity);
        assert.equal(dmg, e.entity.hp + e.entity.armor + 7);
        const r = attack({ name: 'you' }, e.entity, dmg);
        assert.equal(r.killed, true);
        assert.equal(e.entity.hp, 0);
    });

    test('with no guard the number is unchanged', () => {
        assert.equal(knockoutDamage(5, new Entity({ hp: 40, armor: 6 })), 46);
        const e = new Enemy({ type: 'Red Fungus', x: 1, y: 1 });
        assert.equal(knockoutDamage(1, e.entity), e.entity.hp + e.entity.armor);
    });

    test('a weakened enemy (negative guard) still dies and the hit never shrinks below dmg', () => {
        const e = guarded(-3);
        const dmg = knockoutDamage(1, e.entity);
        assert.ok(dmg >= 1);
        assert.equal(attack({ name: 'you' }, e.entity, dmg).killed, true);
        assert.equal(knockoutDamage(500, guarded(4).entity), 500);
    });
});
