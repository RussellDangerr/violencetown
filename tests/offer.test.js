import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { emptyOffer, offerBalance, settledGold } from '../game/offer.js';

const PUCK = {
  type: 'Puck', disposition: 60, flipThreshold: 0, vendor: true,
  values: { rock: 1, soap: 4, bandage: 3, hot_dog: 2 },
};
const SOAP    = { id: 'soap',    name: '[Soap]',    baseValue: 15 };
const BANDAGE = { id: 'bandage', name: '[Bandage]', baseValue: 25 };
const ROCK    = { id: 'rock',    name: '[Rock]',    baseValue: 3 };

describe('offerBalance — the signed heart of the model', () => {
  test('an empty offer is perfectly balanced', () => {
    const b = offerBalance(PUCK, emptyOffer());
    assert.equal(b.givenValue, 0);
    assert.equal(b.takenValue, 0);
    assert.equal(b.balance, 0);
  });

  test('gold alone is a surplus in their favour', () => {
    const b = offerBalance(PUCK, { ...emptyOffer(), gold: 30 });
    assert.equal(b.balance, 30);
  });

  test('given items settle at MARKET price — the values weight is not money', () => {
    // Puck is warm (disposition 60): sell x0.60, so floor(15 * 0.60) = 9 each.
    const b = offerBalance(PUCK, { give: [{ def: SOAP, count: 2 }], take: [], gold: 0 });
    assert.equal(b.givenValue, 18, 'he pays 9 a bar, not 36 — his soap:4 is affection, not cash');
    assert.equal(b.giftValue, 72, 'the weighted worth is tracked separately, for goodwill only');
    assert.equal(b.itemsGiven, 18);
  });

  test('settledGold is what the screen drops in a tray for you', () => {
    assert.equal(settledGold(PUCK, { give: [], take: [{ def: BANDAGE, count: 1 }] }), 30,
      'buying: the player owes 30');
    assert.equal(settledGold(PUCK, { give: [{ def: SOAP, count: 2 }], take: [] }), -18,
      'selling: Puck owes 18');
  });

  test('an item the NPC has no opinion about still counts at face value', () => {
    const stranger = { type: 'Violencian', disposition: 60 };   // no values block at all
    const b = offerBalance(stranger, { give: [{ def: SOAP, count: 1 }], take: [], gold: 0 });
    assert.equal(b.giftValue, 9, 'weight defaults to 1, not 0');
  });

  test('taken items are valued at buyPrice', () => {
    // warm: buy x1.2. ceil(25 * 1.2) = 30.
    const b = offerBalance(PUCK, { give: [], take: [{ def: BANDAGE, count: 1 }], gold: 0 });
    assert.equal(b.takenValue, 30);
    assert.equal(b.balance, -30, 'taking without giving is a negative balance');
  });

  test('the worked example from the spec: 2 soap + 30 GP against a bandage', () => {
    const b = offerBalance(PUCK, {
      give: [{ def: SOAP, count: 2 }], take: [{ def: BANDAGE, count: 1 }], gold: 30,
    });
    assert.equal(b.givenValue, 48, '18 of soap at market + 30 gold');
    assert.equal(b.takenValue, 30);
    assert.equal(b.balance, 18);
    assert.equal(b.giftValue, 102, '72 of weighted soap + the 30 gold');
  });

  test('a lowball: a rock for a bandage', () => {
    // rock sells for max(1, floor(3 * 0.60)) = 1, weight 1.
    const b = offerBalance(PUCK, {
      give: [{ def: ROCK, count: 1 }], take: [{ def: BANDAGE, count: 1 }], gold: 0,
    });
    assert.equal(b.balance, -29);
  });

  test('negative gold is the NPC paying out — this is what a sale IS', () => {
    // Selling 2 soap at Puck's warm rate: 9 each. Settled, so the balance is 0
    // and disposition does not move.
    const b = offerBalance(PUCK, { give: [{ def: SOAP, count: 2 }], take: [], gold: -18 });
    assert.equal(b.takenValue, 18, 'gold the NPC pays out counts on the taken side');
    assert.equal(b.balance, 0, 'selling at the asking price is a straight trade, not a gift');
  });

  test('a straight settled purchase moves nothing', () => {
    const b = offerBalance(PUCK, { give: [], take: [{ def: BANDAGE, count: 1 }], gold: 30 });
    assert.equal(b.balance, 0, 'paying exactly the asking price is a straight trade');
  });

  test('an unsellable item contributes nothing on the give side', () => {
    const quest = { id: 'catalytic_converter', name: '[Cataclysmic Converter]', baseValue: 0, questItem: true };
    const b = offerBalance(PUCK, { give: [{ def: quest, count: 1 }], take: [], gold: 0 });
    assert.equal(b.givenValue, 0, 'sellPrice returns null for a quest item');
    assert.equal(b.giftValue, 0);
  });

  test('below the trade floor everything prices at zero rather than throwing', () => {
    const enemy = { type: 'Bandit', disposition: -80 };
    const b = offerBalance(enemy, {
      give: [{ def: SOAP, count: 1 }], take: [{ def: BANDAGE, count: 1 }], gold: 5,
    });
    assert.equal(b.givenValue, 5, 'no band, so items price at 0 — only the gold counts');
    assert.equal(b.takenValue, 0);
  });
});
