// notice.test.js — succeeding and being NOTICED are two different questions.
//
// A theft from a blind spot always succeeds. Whether the victim notices is
// decided by the WEIGHT of what you took against a buffer that never refills.
// Under the buffer nothing happens at all — no disposition change, no hostility,
// they never know. The -100 is the price of being noticed, not of stealing.
//
// The clean-theft-is-silent case is the regression that matters most here: it is
// the entire point of the 2026-08-23 revision, and it is the one a later
// "helpful" tweak would most plausibly break.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { VERDICT } from '../game/perception.js';
import {
    coinWeight, itemWeight, gearWeight,
    stealLimit, baseNotice, noticeBuffer, isClean,
    STEAL_BASE, NOTICE_BASE, PERIPHERAL_PENALTY,
} from '../game/theft.js';

describe('weight — what a take costs you', () => {
    test('coin weight is one point per 25 GP', () => {
        assert.equal(coinWeight(50), 2);
        assert.equal(coinWeight(100), 4);
        assert.equal(coinWeight(25), 1);
        assert.equal(coinWeight(1), 1);
        assert.equal(coinWeight(0), 0);
    });

    test('item weight floors at 1, so a rock is cheap but never free', () => {
        assert.equal(itemWeight({ baseValue: 3 }), 1);     // rock
        assert.equal(itemWeight({ baseValue: 30 }), 2);
        assert.equal(itemWeight({}), 1);
        assert.equal(itemWeight(null), 1);
    });

    test('gear weight is the STAT SWING — the action-economy take', () => {
        // You are not moving an icon, you are moving their combat numbers onto
        // your side of the fight, so gear is priced by what it swings.
        assert.equal(gearWeight({ damage: 12 }), 12);      // crowbar
        assert.equal(gearWeight({ armor: 4 }), 8);         // traffic cone
        assert.equal(gearWeight({ armor: 2, damage: 3 }), 7);
    });

    test('gear has a floor of 3, so even a trinket is felt', () => {
        assert.equal(gearWeight({ baseValue: 2 }), 3);
        assert.equal(gearWeight({}), 3);
        assert.equal(gearWeight(null), 3);
    });
});

describe('buffer — what a victim fails to notice', () => {
    test('a blind-spot theft gets the full buffer', () => {
        assert.equal(noticeBuffer({}, VERDICT.NONE), NOTICE_BASE);
    });

    test('a flank halves it, floored at 1', () => {
        assert.equal(noticeBuffer({}, VERDICT.PERIPHERAL),
            Math.max(1, Math.floor(NOTICE_BASE * PERIPHERAL_PENALTY)));
        assert.ok(noticeBuffer({}, VERDICT.PERIPHERAL) >= 1);
    });

    test('the flank floor holds even for a tiny base', () => {
        assert.equal(noticeBuffer({ noticeBuffer: -NOTICE_BASE }, VERDICT.PERIPHERAL), 1);
    });

    test('passives raise it', () => {
        assert.equal(baseNotice({ noticeBuffer: 5 }), NOTICE_BASE + 5);
        assert.equal(noticeBuffer({ noticeBuffer: 5 }, VERDICT.NONE), NOTICE_BASE + 5);
    });

    test('missing passives price as none rather than NaN', () => {
        assert.equal(baseNotice(undefined), NOTICE_BASE);
        assert.equal(baseNotice({}), NOTICE_BASE);
    });
});

describe('the two perk axes pull against each other', () => {
    test('steal limit is 50 plus passives', () => {
        assert.equal(stealLimit({}), STEAL_BASE);
        assert.equal(stealLimit({ stealLimit: 50 }), 100);
        assert.equal(stealLimit(undefined), STEAL_BASE);
    });

    test('a limit perk ALONE makes you take more and get caught for it', () => {
        // 100 GP is weight 4 against a base buffer of 3. Wanting both axes is a
        // build; taking only the limit perk is a trap, on purpose.
        const buf = noticeBuffer({}, VERDICT.NONE);
        const greedy = coinWeight(stealLimit({ stealLimit: 50 }));
        assert.equal(isClean(0, greedy, buf), false);

        // ...unless you also carry the quiet-hands axis.
        const bothBuf = noticeBuffer({ noticeBuffer: 2 }, VERDICT.NONE);
        assert.equal(isClean(0, greedy, bothBuf), true);
    });
});

describe('clean or noticed', () => {
    test('50 GP from a blind spot is clean; going back for another is not', () => {
        const buf = noticeBuffer({}, VERDICT.NONE);            // 3
        assert.equal(isClean(0, coinWeight(STEAL_BASE), buf), true);   // 0 + 2 <= 3
        assert.equal(isClean(2, coinWeight(STEAL_BASE), buf), false);  // 2 + 2 >  3
    });

    test('a rock then coin lands exactly on the buffer and is still clean', () => {
        const buf = noticeBuffer({}, VERDICT.NONE);
        const rock = itemWeight({ baseValue: 3 });             // 1
        assert.equal(isClean(0, rock, buf), true);
        assert.equal(isClean(rock, coinWeight(50), buf), true); // 1 + 2 === 3, inclusive
    });

    test('the crowbar is noticed by anyone, always, from anywhere', () => {
        const crowbar = gearWeight({ damage: 12 });
        assert.equal(isClean(0, crowbar, noticeBuffer({}, VERDICT.NONE)), false);
        assert.equal(isClean(0, crowbar, noticeBuffer({}, VERDICT.PERIPHERAL)), false);
    });

    test('from a flank, only the very lightest touch survives', () => {
        const flank = noticeBuffer({}, VERDICT.PERIPHERAL);    // 1
        assert.equal(isClean(0, itemWeight({ baseValue: 3 }), flank), true);   // weight 1
        assert.equal(isClean(0, coinWeight(50), flank), false);                // weight 2
    });

    test('the accumulator never refills — the second pocket is permanently riskier', () => {
        const buf = noticeBuffer({}, VERDICT.NONE);
        assert.equal(isClean(0, 1, buf), true);
        assert.equal(isClean(3, 1, buf), false);
        assert.equal(isClean(99, 1, buf), false);
    });
});
