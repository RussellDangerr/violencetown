// ai.test.js — the shared AI predicates (PD-3/NH-3).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isHostile, deriveAllegiance, parseCapabilities, healPurchase } from '../game/ai.js';

describe('deriveAllegiance', () => {
  test('no behavior array → hostile (born chaser)', () => {
    assert.equal(deriveAllegiance({ behavior: null }), 'hostile');
    assert.equal(deriveAllegiance({}), 'hostile');
  });
  test('an ambient behavior array → neutral', () => {
    assert.equal(deriveAllegiance({ behavior: ['IDLE', 'WANDER'] }), 'neutral');
  });
  test('legacy ALLIED array or _ally → ally', () => {
    assert.equal(deriveAllegiance({ behavior: ['ALLIED'] }), 'ally');
    assert.equal(deriveAllegiance({ behavior: null, _ally: true }), 'ally');
  });
});

describe('parseCapabilities', () => {
  test('collects ambient states, drops ALLIED/HOSTILE tokens', () => {
    const caps = parseCapabilities(['IDLE', 'WANDER', 'WORKING', 'ALLIED']);
    assert.ok(caps.has('IDLE') && caps.has('WANDER') && caps.has('WORKING'));
    assert.ok(!caps.has('ALLIED'));
  });
  test('null behavior → empty capability set', () => {
    assert.equal(parseCapabilities(null).size, 0);
  });
});

describe('isHostile', () => {
  test('true iff allegiance === hostile', () => {
    assert.equal(isHostile({ allegiance: 'hostile' }), true);
    assert.equal(isHostile({ allegiance: 'neutral' }), false);
    assert.equal(isHostile({ allegiance: 'ally' }), false);
  });
});

describe('healPurchase — Law 6a/6b (peg-priced heal, extras only)', () => {
    test('hurt and solvent → spends 1 GP per HP, capped at missing HP', () => {
        assert.deepEqual(healPurchase(30, 100, 200), { spend: 70, heal: 70 });
    });
    test('hurt grunt with 20 GP → the whole 20, ceiling 50 (the readable prediction)', () => {
        assert.deepEqual(healPurchase(30, 100, 20), { spend: 20, heal: 20 });
    });
    test('not hurt enough (hp > 40) → no purchase', () => {
        assert.equal(healPurchase(41, 100, 200), null);
    });
    test('broke (gold < 20) → no purchase; the sliver can never heal', () => {
        assert.equal(healPurchase(10, 100, 19), null);
    });
});
