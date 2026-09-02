// fence.test.js — stolen goods, and the one person who will take them.
//
// Thieve shipped creating contraband in a world that had no concept of it: you
// could rob someone blind and sell it straight back to them at market rate, and
// nobody had an opinion. `_robbed` was written by the resolver and read by
// exactly two things, respawn and the save. sellPrice had never heard of
// provenance.
//
// Two opinions now exist, and they are deliberately different in kind:
//
//   THEY RECOGNISE IT      the VICTIM knows their own property, always — even
//                          from a clean theft they never noticed at the time.
//   IT'S TOO HOT FOR THEM  the STREET has heard, which only happens when a take
//                          was NOTICED. That makes the clean/noticed split pay
//                          a second time: get away with it and your loot is
//                          worth full price anywhere.
//
// Heat is per ITEM ID, not per object, because the bag holds stacks rather than
// instances — nobody, the vendor included, can tell your stolen soap from your
// own. One hot soap taints the pile until a fence takes it, which is a
// consequence rather than an accident.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { commitBlocker, emptyOffer, stage } from '../game/offer.js';
import { Enemy } from '../game/enemies.js';

const soap = { id: 'soap', name: '[Soap]', baseValue: 15 };
const rock = { id: 'rock', name: '[Rock]', baseValue: 2 };

const vendor = (over = {}) => ({ id: 'v1', type: 'Violencian', disposition: 40,
                                 vendor: true, gold: 500, ...over });

function offering(def, count = 1) {
    return stage(emptyOffer(), 'give', { def, count, max: count }, count);
}

describe('the victim knows their own property', () => {
    const ctxFor = (stolen) => ({ playerGold: 999, npcGold: 999,
                                  stolenFrom: (id) => stolen.includes(id),
                                  isHot: () => false });

    test('you cannot sell someone the thing you took from them', () => {
        assert.equal(commitBlocker(vendor(), offering(soap), ctxFor(['soap'])),
            'THEY RECOGNISE IT');
    });

    test('even from a CLEAN theft they never noticed at the time', () => {
        // isHot is false throughout — this refusal is about ownership, not heat.
        assert.equal(commitBlocker(vendor(), offering(soap), ctxFor(['soap'])),
            'THEY RECOGNISE IT');
    });

    test('something else in the same basket still trips it', () => {
        const o = stage(offering(rock), 'give', { def: soap, count: 1, max: 1 }, 1);
        assert.equal(commitBlocker(vendor(), o, ctxFor(['soap'])), 'THEY RECOGNISE IT');
    });

    test('a DIFFERENT person will happily buy it', () => {
        assert.equal(commitBlocker(vendor({ id: 'v2' }), offering(soap), ctxFor([])), null);
    });

    test('and a fence is not exempt from being robbed himself', () => {
        // The heat rule spares a fence; the ownership rule does not. Selling
        // Hooch his own bottle should still be refused.
        assert.equal(commitBlocker(vendor({ fence: true }), offering(soap), ctxFor(['soap'])),
            'THEY RECOGNISE IT');
    });
});

describe('the street has heard', () => {
    const hotCtx = { playerGold: 999, npcGold: 999,
                     stolenFrom: () => false, isHot: (id) => id === 'soap' };

    test('an honest vendor will not touch hot goods', () => {
        assert.equal(commitBlocker(vendor(), offering(soap), hotCtx), "IT'S TOO HOT FOR THEM");
    });

    test('a fence will', () => {
        assert.equal(commitBlocker(vendor({ fence: true }), offering(soap), hotCtx), null);
    });

    test('clean loot is worth full price to anybody', () => {
        assert.equal(commitBlocker(vendor(), offering(rock), hotCtx), null,
            'rock was never hot');
    });

    test('one hot item taints the whole basket', () => {
        const o = stage(offering(rock), 'give', { def: soap, count: 1, max: 1 }, 1);
        assert.equal(commitBlocker(vendor(), o, hotCtx), "IT'S TOO HOT FOR THEM");
    });

    test('ownership outranks heat — the more specific refusal wins', () => {
        const both = { playerGold: 999, npcGold: 999,
                       stolenFrom: () => true, isHot: () => true };
        assert.equal(commitBlocker(vendor(), offering(soap), both), 'THEY RECOGNISE IT');
    });
});

describe('offer.js stays pure', () => {
    test('a caller that answers neither question is unaffected', () => {
        // Every pre-existing caller passes no stolenFrom / isHot at all. They
        // must behave exactly as before rather than throwing or refusing.
        assert.equal(commitBlocker(vendor(), offering(soap), { playerGold: 999, npcGold: 999 }), null);
    });

    test('non-function answers are ignored rather than trusted', () => {
        const junk = { playerGold: 999, npcGold: 999, stolenFrom: true, isHot: 'yes' };
        assert.equal(commitBlocker(vendor(), offering(soap), junk), null);
    });
});

describe('the fence flag', () => {
    test('an ordinary vendor is not a fence', () => {
        assert.equal(new Enemy({ id: 'a', type: 'v', x: 0, y: 0, vendor: true }).fence, false);
    });

    test('a fence is, and it survives a save', () => {
        const h = new Enemy({ id: 'h', type: 'Bootlegger', x: 0, y: 0, vendor: true, fence: true });
        assert.equal(h.fence, true);
        assert.equal(Enemy.fromSave(JSON.parse(JSON.stringify(h.toSave()))).fence, true);
    });

    test('a truthy non-true value does not sneak in', () => {
        assert.equal(new Enemy({ id: 'a', type: 'v', x: 0, y: 0, fence: 'yes' }).fence, false);
    });
});

describe('Hooch is the fence, and always was', () => {
    test("the Bootlegger who says 'no refunds, no questions' takes hot goods", async () => {
        const { readFileSync } = await import('node:fs');
        const { fileURLToPath } = await import('node:url');
        const town = JSON.parse(readFileSync(
            fileURLToPath(new URL('../game/town-map.json', import.meta.url)), 'utf8'));
        const hooch = (town.enemies || []).find(e => e.name === 'Hooch');
        assert.ok(hooch, 'Hooch should exist in town');
        assert.equal(hooch.fence, true);
        assert.equal(hooch.vendor, true, 'a fence has to be able to trade at all');
        assert.ok((hooch.barks || []).some(b => /no questions/i.test(b)),
            'the flag is making his existing bark true, not inventing a character');
    });

    test('the honest vendor in the same square is NOT a fence', async () => {
        // Otherwise the choice is not a choice — you need somewhere hot goods
        // are refused for the fence to mean anything.
        const { readFileSync } = await import('node:fs');
        const { fileURLToPath } = await import('node:url');
        const town = JSON.parse(readFileSync(
            fileURLToPath(new URL('../game/town-map.json', import.meta.url)), 'utf8'));
        const macc = (town.enemies || []).find(e => e.name === 'Macc');
        assert.ok(macc, 'Macc should exist in town');
        assert.ok(!macc.fence, 'the other vendor must refuse, or there is no decision');
    });
});
