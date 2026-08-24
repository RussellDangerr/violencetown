import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WEAPONS } from '../game/weapons.js';
import { ITEMS, itemTier } from '../game/items.js';
import { sellPrice, buyPrice } from '../game/trade.js';

describe('weapons are first-class tradeable items', () => {
  test('every weapon carries the fields the offer screen renders', () => {
    for (const [id, def] of Object.entries(WEAPONS)) {
      assert.equal(typeof def.baseValue, 'number', `${id} has no baseValue`);
      assert.ok(def.baseValue > 0, `${id} baseValue must be positive`);
      assert.equal(typeof def.description, 'string', `${id} has no description`);
      assert.ok(def.description.length > 20, `${id} description is too short to be real`);
      assert.equal(typeof def.name, 'string', `${id} has no name`);
    }
  });

  test('every weapon prices on both sides of a trade', () => {
    for (const [id, def] of Object.entries(WEAPONS)) {
      assert.ok(sellPrice(def, 0) > 0, `${id} cannot be sold`);
      assert.ok(buyPrice(def, 0) > 0, `${id} cannot be bought`);
    }
  });

  test('every weapon resolves to a rarity tier', () => {
    for (const [id, def] of Object.entries(WEAPONS)) {
      assert.ok(itemTier(def), `${id} has no tier`);
    }
  });

  test('no weapon id collides with an item id', () => {
    for (const id of Object.keys(WEAPONS)) {
      assert.equal(ITEMS[id], undefined,
        `${id} exists in both registries — _resolveItemDef would hide one`);
    }
  });
});

describe('the ground-take path no longer swallows unresolvable items', () => {
  test('_takeItemAt resolves through _resolveItemDef, not a bare ITEMS lookup', () => {
    const src = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');
    const at = src.indexOf('_takeItemAt(');
    assert.ok(at > 0, '_takeItemAt not found in main.js');
    const fn = src.slice(at, at + 1400);
    assert.ok(!/ITEMS\[gi\.type\]/.test(fn),
      '_takeItemAt still does a bare ITEMS[gi.type] lookup — a weapon on the floor is deleted silently');
    assert.ok(/_resolveItemDef\(/.test(fn),
      '_takeItemAt must resolve through _resolveItemDef so WEAPONS are found');
  });
});
