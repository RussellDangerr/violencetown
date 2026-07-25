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

describe('itemStatLine', () => {
    test('heal item', () => assert.equal(itemStatLine(POTION), 'Heals 10 HP'));
    test('armor gear', () => assert.equal(itemStatLine(GEAR), '+2 armor'));
    test('quest item', () => assert.equal(itemStatLine(QUEST), 'Always kept'));
});
