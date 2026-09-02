// trade.test.js — the pricing spine.
//
// tests/wallets.test.js was the only test importing from trade.js, and it only
// took transferGold / burnGold. band, canTrade, mood, buyPrice, sellPrice and
// bribeStepCost had ZERO coverage — the whole offer screen prices through them.
//
// Every number here was read off the live module before it was written down, not
// derived from the spec: the spec has been wrong about this code before.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    band, canTrade, mood, buyPrice, sellPrice, bribeStepCost, TRADE_FLOOR, BRIBE_STEP,
} from '../game/trade.js';

const ITEM = { id: 'x', baseValue: 10 };

describe('trade bands', () => {
    test('there are six bands, not the eight the module header used to claim', () => {
        // If this fails the band table changed, and the spec's §4 curves — which
        // are derived from it — need re-deriving before anything else.
        const moods = [100, 60, 30, 10, -10, -40].map(d => band(d).mood);
        assert.deepEqual(moods, ['adoring', 'warm', 'friendly', 'neutral', 'wary', 'hostile']);
    });

    test('each band starts exactly where the one below it ends', () => {
        // Pinned as pairs so an off-by-one in a `min` is visible as a boundary
        // move rather than a vague "prices changed".
        const at = (d) => (band(d) ? band(d).mood : null);
        assert.deepEqual(
            [[75, at(75)], [74, at(74)], [50, at(50)], [49, at(49)], [25, at(25)], [24, at(24)],
             [0, at(0)], [-1, at(-1)], [-25, at(-25)], [-26, at(-26)], [-50, at(-50)], [-51, at(-51)]],
            [[75, 'adoring'], [74, 'warm'], [50, 'warm'], [49, 'friendly'], [25, 'friendly'], [24, 'neutral'],
             [0, 'neutral'], [-1, 'wary'], [-25, 'wary'], [-26, 'hostile'], [-50, 'hostile'], [-51, null]]);
    });

    test('below the floor there is no band and no deal', () => {
        assert.equal(band(TRADE_FLOOR - 1), null);
        assert.equal(canTrade(TRADE_FLOOR - 1), false);
        assert.equal(canTrade(TRADE_FLOOR), true, 'the floor itself still deals');
    });

    test('a null disposition reads as neutral, not as refusal', () => {
        // Enemy.disposition defaults to null, so this is the common case for an
        // NPC nobody authored a mood for — they must still trade.
        assert.equal(band(null).mood, 'neutral');
        assert.equal(band(undefined).mood, 'neutral');
        assert.equal(canTrade(null), true);
    });

    test('mood works below the floor, where band does not', () => {
        // The meter still has to draw a face for someone who will not deal.
        assert.equal(band(-90), null);
        assert.equal(mood(-90).face, 'refuse');
        assert.equal(mood(-90).mood, "won't deal");
    });
});

describe('pricing', () => {
    test('buy always costs more than sell pays — there is no arbitrage loop', () => {
        // The one property that keeps the economy from being a money printer:
        // buy low from a friend, sell high to the same friend.
        for (let d = TRADE_FLOOR; d <= 100; d += 5) {
            assert.ok(buyPrice(ITEM, d) > sellPrice(ITEM, d), `spread inverted at disposition ${d}`);
        }
    });

    test('friendlier traders charge less and pay more', () => {
        assert.ok(buyPrice(ITEM, 80) < buyPrice(ITEM, 0));
        assert.ok(sellPrice(ITEM, 80) > sellPrice(ITEM, 0));
    });

    test('prices floor at 1, never 0 — nothing is ever free', () => {
        assert.equal(buyPrice({ id: 'z', baseValue: 0 }, 0), 1);
        assert.equal(buyPrice({ id: 'z' }, 0), 1, 'a missing baseValue is not a free item');
    });

    test('buying rounds up and selling rounds down — both in the trader’s favour', () => {
        // baseValue 3 at neutral: buy ceil(3 × 1.6) = 5, sell floor(3 × 0.5) = 1.
        assert.equal(buyPrice({ id: 'a', baseValue: 3 }, 0), 5);
        assert.equal(sellPrice({ id: 'a', baseValue: 3 }, 0), 1);
    });

    test('quest items and worthless items do not sell', () => {
        assert.equal(sellPrice({ id: 'q', baseValue: 500, questItem: true }, 0), null);
        assert.equal(sellPrice({ id: 'w', baseValue: 0 }, 0), null);
    });

    test('nothing prices below the floor', () => {
        assert.equal(buyPrice(ITEM, -80), null);
        assert.equal(sellPrice(ITEM, -80), null);
    });

    test('a missing item prices at nothing rather than throwing', () => {
        assert.equal(buyPrice(null, 0), null);
        assert.equal(sellPrice(null, 0), null);
    });
});

describe('bribeStepCost', () => {
    test('calming someone is cheaper than buying loyalty', () => {
        assert.ok(bribeStepCost(-40) < bribeStepCost(40));
    });

    test('a step is BRIBE_STEP points, priced 1 GP below neutral and 2 above', () => {
        assert.equal(bribeStepCost(-100), BRIBE_STEP * 1);
        assert.equal(bribeStepCost(50), BRIBE_STEP * 2);
    });

    test('the rate rises ACROSS a step that straddles zero', () => {
        // The module's claim is that the per-point rate climbs during the step,
        // not that the whole step is priced off its starting value. From -2 the
        // five points are -2,-1,0,1,2 → 1,1,2,2,2 = 8, between the all-cheap 5
        // and the all-dear 10.
        assert.equal(bribeStepCost(-2), 8);
        assert.ok(bribeStepCost(-2) > bribeStepCost(-100));
        assert.ok(bribeStepCost(-2) < bribeStepCost(50));
    });

    test('a null disposition is priced as neutral, not as a throw', () => {
        assert.equal(bribeStepCost(null), bribeStepCost(0));
    });
});
