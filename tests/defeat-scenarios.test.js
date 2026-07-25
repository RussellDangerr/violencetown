import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isSafe, isBoss, partitionInventory, matchTake, pickScenario } from '../game/defeat-scenarios.js';

const weapon = { id: 'sword' };
const quest  = { id: 'converter', questItem: true };
const food   = { id: 'meat', category: 'ambro' };
const potion = { id: 'bandage', category: 'med', consumable: true };
const loot   = { id: 'mace', category: 'weapon', baseValue: 20 };

describe('isSafe', () => {
  test('quest items, the equipped weapon, and essential-flagged are safe', () => {
    assert.equal(isSafe(quest, weapon), true);
    assert.equal(isSafe(weapon, weapon), true);
    assert.equal(isSafe({ id: 'x', essential: true }, weapon), true);
  });
  test('ordinary items are not safe', () => {
    assert.equal(isSafe(food, weapon), false);
    assert.equal(isSafe(loot, weapon), false);
  });
});

describe('isBoss', () => {
  test('true only for a _boss tag', () => {
    assert.equal(isBoss({ tag: 'wererat_boss' }), true);
    assert.equal(isBoss({ tag: null }), false);
    assert.equal(isBoss({}), false);
  });
});

describe('partitionInventory', () => {
  test('splits safe vs at-risk, skips holes', () => {
    const inv = [{ itemDef: quest, count: 1 }, null, { itemDef: food, count: 2 }, { itemDef: loot, count: 1 }];
    const { safe, atRisk } = partitionInventory(inv, weapon);
    assert.deepEqual(safe.map(e => e.itemDef.id), ['converter']);
    assert.deepEqual(atRisk.map(e => e.itemDef.id), ['meat', 'mace']);
    assert.equal(atRisk[0].i, 2); // slot index preserved
  });
});

describe('matchTake', () => {
  const atRisk = [{ i: 0, itemDef: food }, { i: 1, itemDef: potion }, { i: 2, itemDef: loot }];
  test('categories rule takes only matching categories (beasts eat food)', () => {
    assert.deepEqual(matchTake({ categories: ['ambro'] }, atRisk).map(e => e.itemDef.id), ['meat']);
  });
  test('breakables rule takes consumables (a fall cracks them)', () => {
    assert.deepEqual(matchTake({ breakables: true }, atRisk).map(e => e.itemDef.id), ['bandage']);
  });
  test('loot:all takes everything at-risk (a full robbery)', () => {
    assert.equal(matchTake({ loot: 'all' }, atRisk).length, 3);
  });
  test('never crashes on an empty pool', () => {
    assert.deepEqual(matchTake({ loot: 'all' }, []), []);
  });
});

describe('partitionInventory — zonal safety (remoticon-overhaul)', () => {
    test('an ordinary item in a SAFE slot (index < safeSlots) is safe', () => {
        const inv = new Array(50).fill(null);
        inv[2] = { itemDef: loot, count: 1 };
        inv[15] = { itemDef: loot, count: 1 };
        const { safe, atRisk } = partitionInventory(inv, weapon, 10);
        assert.deepEqual(safe.map(e => e.i), [2]);
        assert.deepEqual(atRisk.map(e => e.i), [15]);
    });
    test('a quest item is safe even in a PACK slot (free, index-independent)', () => {
        const inv = new Array(50).fill(null);
        inv[20] = { itemDef: quest, count: 1 };
        const { safe, atRisk } = partitionInventory(inv, weapon, 10);
        assert.deepEqual(safe.map(e => e.i), [20]);
        assert.equal(atRisk.length, 0);
    });
    test('safeSlots defaults to 0 — old 2-arg calls keep their behavior', () => {
        const inv = [{ itemDef: loot, count: 1 }];
        const { atRisk } = partitionInventory(inv, weapon);
        assert.deepEqual(atRisk.map(e => e.i), [0]);
    });
});

describe('pickScenario', () => {
  const S = [
    { id: 'fungus', when: c => c.zone === 'sewer' && /Fungus/.test(c.by?.type || ''), weight: 3, consequence: {} },
    { id: 'wererat', when: c => c.by?.type === 'Wererat', weight: 3, consequence: {} },
    { id: 'fallback', when: () => true, weight: 1, consequence: {} },
  ];
  test('filters by when() and returns a match', () => {
    const pick = pickScenario({ zone: 'sewer', by: { type: 'Violet Fungus' } }, S, () => 0);
    assert.equal(pick.id, 'fungus');
  });
  test('falls back when nothing area/enemy-specific matches', () => {
    const pick = pickScenario({ zone: 'town', by: { type: 'Pigeon' } }, S, () => 0.99);
    assert.equal(pick.id, 'fallback');
  });
  test('weighted pick is deterministic given rand()', () => {
    assert.equal(pickScenario({ zone: 'town', by: { type: 'Pigeon' } }, S, () => 0).id, 'fallback');
  });
});
