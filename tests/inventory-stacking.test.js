// inventory-stacking.test.js — stacking respects MAX_STACK and the slot limit.
//
// ⚠ SEAM NOTE (read me):
//   The real stacking logic lives in game/main.js::_addToInventory (the Game
//   class). main.js cannot be imported under Node — it touches `document` at
//   module-evaluation time — so we CANNOT call the real method here without a
//   refactor (which is another branch's lane; do NOT move it from this branch).
//
//   Therefore the `addToInventory` function below is a FAITHFUL LOCAL COPY of
//   game/main.js::_addToInventory (as of this commit). It is a transcription,
//   not the production code. ACTION ITEM: once main.js exposes inventory
//   stacking through an importable seam (e.g. a pure helper in items.js or
//   data.js, or a Game made constructible under Node), delete this copy and
//   re-point these tests at the real implementation.
//
//   To keep the test honest in the meantime, the LIMITS it checks (MAX_STACK,
//   INVENTORY_SIZE) are imported from the REAL game/data.js — so if those
//   constants change, the test tracks them automatically and only the tiny
//   loop body is mirrored.
//
//   The reference snippet being mirrored (game/main.js:1897-1906):
//     _addToInventory(itemDef) {
//         for (let i = 0; i < INVENTORY_SIZE; i++) {
//             const s = this.inventory[i];
//             if (s && s.itemDef.id === itemDef.id && s.count < MAX_STACK) { s.count++; return true; }
//         }
//         for (let i = 0; i < INVENTORY_SIZE; i++) {
//             if (!this.inventory[i]) { this.inventory[i] = { itemDef, count: 1 }; return true; }
//         }
//         return false;
//     }
//
// These assertions are EXPECTED GREEN — they pin the intended stacking contract.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { MAX_STACK, INVENTORY_SIZE } from '../game/data.js';

// ── Faithful local mirror of Game._addToInventory ────────────────────────────
// Operates on a plain { inventory: [...] } "game" so it matches the real method
// shape (which mutates this.inventory). Returns true if the item was stored.
function addToInventory(game, itemDef) {
    for (let i = 0; i < INVENTORY_SIZE; i++) {
        const s = game.inventory[i];
        if (s && s.itemDef.id === itemDef.id && s.count < MAX_STACK) { s.count++; return true; }
    }
    for (let i = 0; i < INVENTORY_SIZE; i++) {
        if (!game.inventory[i]) { game.inventory[i] = { itemDef, count: 1 }; return true; }
    }
    return false;
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
