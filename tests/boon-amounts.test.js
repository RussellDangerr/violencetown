import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, BOON_KINDS } from '../game/items.js';

test('BOON_KINDS holds the picked amounts: 10 MP, 1 armour, 1 strength', () => {
    assert.deepEqual(Object.fromEntries(Object.entries(BOON_KINDS).map(([k, v]) => [k, v.amount])),
        { mana: 10, defence: 1, strength: 1 });
});

test('the poition carries the MP amount from that table, not a second copy', () => {
    assert.equal(ITEMS.boon_poition.poition.amount, BOON_KINDS.mana.amount);
});
