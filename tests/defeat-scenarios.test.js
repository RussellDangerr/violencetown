import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isSafe, isBoss, partitionInventory, matchTake, pickScenario, DEFEAT_SCENARIOS } from '../game/defeat-scenarios.js';

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

// RB1 (plans/rb1-rat-robbery-stash.md): the robbery fires for the sewer's own rats.
describe('the rats rob you in the sewer (RB1)', () => {
  const eligible = (zone, by, cause = 'unknown') =>
    DEFEAT_SCENARIOS.filter(s => s.when({ zone, by, cause })).map(s => s.id);
  const gauntletRat = { type: 'Rat', tag: 'sewer_rat', vermin: true, entity: {} };
  const robbery = DEFEAT_SCENARIOS.find(s => s.id === 'robbed_by_wererats');

  test('a gauntlet rat that beats you in the sewer can rob you', () => {
    assert.deepEqual(eligible('SEWER', gauntletRat), ['robbed_by_wererats', 'patched_by_carrion', 'beaten_and_dumped']);
  });
  test('the robbery outweighs the rest: a roll under 3/5 robs you, the rest goes as before', () => {
    const pick = (r) => pickScenario({ zone: 'SEWER', by: gauntletRat, cause: 'unknown' }, DEFEAT_SCENARIOS, () => r).id;
    assert.equal(pick(0), 'robbed_by_wererats');
    assert.equal(pick(0.59), 'robbed_by_wererats');
    assert.equal(pick(0.61), 'patched_by_carrion');
    assert.equal(pick(0.99), 'beaten_and_dumped');
  });
  test('its numbers stay as they were: weight, stash spot, wake spot, the whole haul, recoverable', () => {
    assert.equal(robbery.weight, 3);
    assert.equal(robbery.consequence.wakeAt, null);
    assert.equal(robbery.consequence.hp, 0.6);
    assert.deepEqual(robbery.consequence.take, { loot: 'all', recoverable: true, stashAt: { spot: { x: 17, y: 10 } } });
    assert.equal(robbery.consequence.log, "[The rats rolled you and scampered off with your haul. You'll want it back.]");
  });
  test('anything else in the sewer picks from the same scenarios as before', () => {
    assert.deepEqual(eligible('SEWER', { type: 'Violencian', entity: {} }), ['patched_by_carrion', 'beaten_and_dumped']);
    assert.deepEqual(eligible('SEWER', { type: 'Violet Fungus', entity: {} }), ['processed_by_fungus', 'patched_by_carrion', 'beaten_and_dumped']);
    assert.deepEqual(eligible('SEWER', null, 'sludge'), ['swept_into_sludge', 'patched_by_carrion', 'beaten_and_dumped']);
    // A rat-family enemy that is not the gauntlet's does not rob you.
    assert.deepEqual(eligible('SEWER', { type: 'Sludge Rat', vermin: true, entity: {} }), ['patched_by_carrion', 'beaten_and_dumped']);
  });
  test("the Canyon's rats are not in the sewer, so they never rob you", () => {
    const canyonRat = { type: 'Rat', tag: 'canyon_critter', vermin: true, entity: {} };
    assert.deepEqual(eligible('CANYON', canyonRat), ['beaten_and_dumped']);
  });
  test('a gauntlet rat that chased you out of the sewer does not rob you there', () => {
    assert.deepEqual(eligible('TOWN', gauntletRat), ['beaten_and_dumped']);
  });
});
