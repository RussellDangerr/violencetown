// inspector.test.js — the pure inspector model (what stats + actions a selection shows).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { itemActions, itemStatLine } from '../game/inspector.js';

const POTION = { id: 'bandage', name: '[Bandage]', useType: 'self', healAmount: 10 };
const GEAR   = { id: 'foil_hat', name: '[Foil Hat]', useType: 'equip', equipSlot: 'top', armor: 2 };
const QUEST  = { id: 'converter', name: '[Converter]', questItem: true };

describe('itemActions — context actions by item kind and zone', () => {
    test('a consumable in PACK offers Use, Protect, Drop', () => {
        assert.deepEqual(itemActions(POTION, 'pack').map(a => a.id), ['use', 'protect', 'drop']);
    });
    test('gear in SAFE offers Equip, Unprotect, Drop', () => {
        assert.deepEqual(itemActions(GEAR, 'safe').map(a => a.id), ['equip', 'unprotect', 'drop']);
    });
    test('a quest item offers no Protect and no Drop (always kept)', () => {
        assert.deepEqual(itemActions(QUEST, 'pack').map(a => a.id), []);
    });
});

const SLUDGE_GEAR = { id: 'shoe_bags', name: '[Shoe Bags]', useType: 'equip', equipSlot: 'bottom', armor: 2, sludgeImmune: true };
const RAY_GUN    = { id: 'ray_gun', name: '[Ray Gun]', useType: 'equip', equipSlot: 'weapon', damage: 22, damageType: 'energy' };
const PIPE       = { id: 'pipe', name: '[Pipe]', useType: 'melee', damage: 12 };
const ROCK       = { id: 'rock', name: '[Rock]', useType: 'throw', damage: 15, damageType: 'physical' };

describe('itemStatLine', () => {
    test('heal item', () => assert.equal(itemStatLine(POTION), 'Heals 10 HP'));
    test('armor gear', () => assert.equal(itemStatLine(GEAR), '+2 armor'));
    test('quest item', () => assert.equal(itemStatLine(QUEST), 'Always kept'));
    test('sludge-immune gear notes it', () => {
        const line = itemStatLine(SLUDGE_GEAR);
        assert.match(line, /sludge/);
        assert.equal(line, '+2 armor, sludge-proof');
    });
    test('an energy weapon reads its damageType, not "Melee"', () => {
        const line = itemStatLine(RAY_GUN);
        assert.equal(line, 'energy 22 dmg');
        assert.doesNotMatch(line, /Melee/);
    });
    test('a plain melee weapon drops the "Melee" word', () => {
        const line = itemStatLine(PIPE);
        assert.equal(line, '12 dmg');
        assert.doesNotMatch(line, /Melee/);
    });
    test('a throw weapon keeps the Throw verb', () => {
        assert.equal(itemStatLine(ROCK), 'Throw 15 dmg');
    });
});
