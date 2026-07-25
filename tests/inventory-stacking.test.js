// inventory-stacking.test.js — stacking respects MAX_STACK and the slot limit.
//
// SEAM-NOTE (remoticon-overhaul B3): this used to be a hand-copied mirror of
// game/main.js::_addToInventory's old 2-loop SAFE-first fill. B3 made the real
// _addToInventory delegate to the pure PACK-first router in game/inventory.js
// (SAFE = [0, SAFE_SLOTS), PACK = [SAFE_SLOTS, size)), so a from-index-0 mirror
// would now lie about production behavior. Rather than keep a stale copy, this
// file calls the REAL addToInventory from game/inventory.js — with safeSlots:0
// so the whole array is one zone, which reproduces the from-index-0 fill order
// these tests were written against (a wash: 0 safe slots + PACK-first search
// from 0 == the old plain linear scan). This file stays scoped to generic
// stacking/slot-limit behavior; real zone-routing coverage (PACK-first, SAFE
// overflow, protect/unprotect) lives in tests/inventory-zones.test.js.
//
// These assertions are EXPECTED GREEN — they pin the intended stacking contract.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { MAX_STACK, INVENTORY_SIZE } from '../game/data.js';
import { addToInventory as realAddToInventory } from '../game/inventory.js';

// ── Thin adapter over the real pure module ────────────────────────────────
// Operates on a plain { inventory: [...] } "game" so it matches the shape
// these tests were written against. Returns true if the item was stored.
function addToInventory(game, itemDef) {
    return realAddToInventory(game.inventory, itemDef, { size: INVENTORY_SIZE, safeSlots: 0, maxStack: MAX_STACK });
}

const newGame = () => ({ inventory: new Array(INVENTORY_SIZE).fill(null) });
const ROCK = { id: 'rock', name: '[Rock]' };
const SOAP = { id: 'soap', name: '[Soap]' };
const occupiedSlots = (g) => g.inventory.filter(Boolean).length;

describe('inventory stacking (local mirror of main.js::_addToInventory — EXPECTED GREEN)', () => {

    test('first pickup of an item fills one slot with count 1', () => {
        const g = newGame();
        assert.equal(addToInventory(g, ROCK), true);
        assert.equal(occupiedSlots(g), 1);
        assert.deepEqual(g.inventory[0], { itemDef: ROCK, count: 1 });
    });

    test('same-item pickups stack into the existing slot, not new slots', () => {
        const g = newGame();
        for (let i = 0; i < 5; i++) addToInventory(g, ROCK);
        assert.equal(occupiedSlots(g), 1, 'all five rocks share one slot');
        assert.equal(g.inventory[0].count, 5);
    });

    test('different items occupy separate slots', () => {
        const g = newGame();
        addToInventory(g, ROCK);
        addToInventory(g, SOAP);
        assert.equal(occupiedSlots(g), 2);
        assert.equal(g.inventory[0].itemDef.id, 'rock');
        assert.equal(g.inventory[1].itemDef.id, 'soap');
    });

    test('a stack never exceeds MAX_STACK — overflow opens a new slot', () => {
        const g = newGame();
        // Fill one stack to exactly MAX_STACK.
        for (let i = 0; i < MAX_STACK; i++) addToInventory(g, ROCK);
        assert.equal(g.inventory[0].count, MAX_STACK);
        assert.equal(occupiedSlots(g), 1);

        // One more rock can't go on the full stack → spills into slot 1.
        assert.equal(addToInventory(g, ROCK), true);
        assert.equal(g.inventory[0].count, MAX_STACK, 'first stack stays capped at MAX_STACK');
        assert.equal(g.inventory[1].count, 1, 'overflow starts a fresh stack');
        assert.equal(occupiedSlots(g), 2);
    });

    test('respects the slot limit — a full inventory rejects new item types', () => {
        const g = newGame();
        // Fill every slot with a DISTINCT item id so none can stack.
        for (let i = 0; i < INVENTORY_SIZE; i++) {
            assert.equal(addToInventory(g, { id: `item_${i}`, name: `[Item ${i}]` }), true);
        }
        assert.equal(occupiedSlots(g), INVENTORY_SIZE);

        // A brand-new item id has nowhere to go → rejected.
        assert.equal(addToInventory(g, { id: 'overflow', name: '[Overflow]' }), false);
        assert.equal(occupiedSlots(g), INVENTORY_SIZE, 'rejected item did not displace anything');
    });

    test('a full inventory can still TOP UP an existing non-maxed stack', () => {
        const g = newGame();
        // Slot 0 = a small rock stack; slots 1..N-1 = distinct singletons.
        addToInventory(g, ROCK);
        for (let i = 1; i < INVENTORY_SIZE; i++) {
            addToInventory(g, { id: `item_${i}`, name: `[Item ${i}]` });
        }
        assert.equal(occupiedSlots(g), INVENTORY_SIZE);

        // Inventory is "full" by slot count, but the rock stack isn't maxed, so
        // another rock still stacks rather than being rejected.
        assert.equal(addToInventory(g, ROCK), true);
        assert.equal(g.inventory[0].count, 2);
        assert.equal(occupiedSlots(g), INVENTORY_SIZE);
    });

    test('sanity: the limits under test are the real game constants', () => {
        assert.equal(MAX_STACK, 99);
        assert.equal(INVENTORY_SIZE, 50);
    });
});
