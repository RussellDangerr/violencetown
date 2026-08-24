import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { emptyOffer, offerBalance, settledGold, resolveOffer, stage, unstage, commitBlocker } from '../game/offer.js';
import { RESENT_MAX_PER_OFFER } from '../game/disposition-curves.js';

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
    assert.equal(b.givenItemsValue, 18);
  });

  test('settledGold is what the screen drops in a tray for you', () => {
    assert.equal(settledGold(PUCK, { give: [], take: [{ def: BANDAGE, count: 1 }] }), 30,
      'buying: the player owes 30');
    assert.equal(settledGold(PUCK, { give: [{ def: SOAP, count: 2 }], take: [] }), -18,
      'selling: Puck owes 18');
  });

  test('settledGold ignores whatever gold is already sitting in the offer', () => {
    // 30 is buyPrice(BANDAGE, 60) itself -- if the gold already on the tray were
    // NOT zeroed first, this would settle at 0 (30 given - 30 taken), not 30.
    assert.equal(settledGold(PUCK, { give: [], take: [{ def: BANDAGE, count: 1 }], gold: 30 }), 30);
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
    assert.equal(b.givenItemsValue, 18, 'the item-only total, gold excluded');
    assert.equal(b.takenValue, 30);
    assert.equal(b.balance, 18);
    assert.equal(b.giftValue, 72, 'weighted soap only — gold carries no gift weight');
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

  test('a straight settled purchase has a zero balance', () => {
    const b = offerBalance(PUCK, { give: [], take: [{ def: BANDAGE, count: 1 }], gold: 30 });
    assert.equal(b.balance, 0, 'paying exactly the asking price is a straight trade');
  });

  test('an unsellable item contributes nothing on the give side', () => {
    const quest = { id: 'catalytic_converter', name: '[Cataclysmic Converter]', baseValue: 0, questItem: true };
    const b = offerBalance(PUCK, { give: [{ def: quest, count: 1 }], take: [], gold: 0 });
    assert.equal(b.givenValue, 0, 'sellPrice returns null for a quest item');
    assert.equal(b.giftValue, 0);
  });

  test('below the trade floor, giving still prices but taking stays refused', () => {
    // Enemy is below TRADE_FLOOR (-50): no band, so buyPrice refuses. But a gift
    // still prices at the hostile band's rate — max(1, floor(15 * 0.40)) = 6 —
    // so a hostile NPC is a puzzle you can gift your way out of, not a wall.
    const enemy = { type: 'Bandit', disposition: -80 };
    const b = offerBalance(enemy, {
      give: [{ def: SOAP, count: 1 }], take: [{ def: BANDAGE, count: 1 }], gold: 5,
    });
    assert.equal(b.givenValue, 11, '5 gold + soap priced at the hostile band (6)');
    assert.equal(b.takenValue, 0, 'taking stays refused below the floor');
    assert.equal(b.balance, 11);
  });

  test('multiple rows on the same side accumulate', () => {
    const b = offerBalance(PUCK, {
      give: [{ def: SOAP, count: 1 }, { def: ROCK, count: 1 }], take: [], gold: 0,
    });
    // soap: floor(15 * 0.60) = 9. rock: max(1, floor(3 * 0.60)) = 1. 9 + 1 = 10.
    assert.equal(b.givenValue, 10);
    assert.equal(b.givenItemsValue, 10);
  });

  test('a row with no count field defaults to 1', () => {
    const b = offerBalance(PUCK, { give: [{ def: SOAP }], take: [], gold: 0 });
    assert.equal(b.givenValue, 9, 'no count field at all still prices exactly one unit');
  });

  test('offerBalance(null, null) returns clean zeros rather than throwing', () => {
    const b = offerBalance(null, null);
    assert.deepEqual(b, { givenValue: 0, takenValue: 0, balance: 0, giftValue: 0, givenItemsValue: 0 });
  });

  test('a zero, negative, or NaN count contributes nothing — no phantom item, no fabricated surplus', () => {
    const zero = offerBalance(PUCK, { give: [{ def: SOAP, count: 0 }], take: [], gold: 0 });
    assert.equal(zero.givenValue, 0, 'count 0 must not invent a phantom unit');

    const negative = offerBalance(PUCK, { give: [{ def: SOAP, count: -3 }], take: [], gold: 0 });
    assert.equal(negative.givenValue, 0, 'a negative count must not fabricate a surplus');

    const nan = offerBalance(PUCK, { give: [{ def: SOAP, count: NaN }], take: [], gold: 0 });
    assert.equal(nan.givenValue, 0, 'NaN from an empty quantity field must not poison the balance');

    // The take side is where the original bug lived: a negative count used to
    // fabricate a surplus (balance: +30 on a bandage that was never handed over).
    const takenNegative = offerBalance(PUCK, { give: [], take: [{ def: BANDAGE, count: -1 }], gold: 0 });
    assert.equal(takenNegative.takenValue, 0, 'a negative take count must not fabricate a surplus');
    assert.equal(takenNegative.balance, 0);
  });

  test('settledGold below the trade floor never quotes a payout he will refuse', () => {
    // Puck's other settledGold test sells at disposition 60 — well above the
    // floor, where a payout is honest. Below the floor the NPC won't pay out
    // at all, so quoting one would auto-stage a gift into a blocked offer.
    const enemy = { type: 'Bandit', disposition: -80 };
    const g = settledGold(enemy, { give: [{ def: SOAP, count: 3 }], take: [] });
    assert.equal(g, 0, 'a gift below the floor stages at zero, not a refused payout');
  });
});

const KING = { type: 'Fungus King', disposition: -80, flipThreshold: 200, values: { soap: 20 } };

describe('resolveOffer — one call, the whole projection', () => {
  test('a settled sale moves nothing', () => {
    const r = resolveOffer(PUCK, { give: [{ def: SOAP, count: 2 }], take: [], gold: -18 });
    assert.equal(r.balance, 0);
    assert.equal(r.points, 0);
    assert.equal(r.projected, 60);
  });

  test('a settled purchase moves nothing', () => {
    const r = resolveOffer(PUCK, { give: [], take: [{ def: BANDAGE, count: 1 }], gold: 30 });
    assert.equal(r.balance, 0);
    assert.equal(r.points, 0);
  });

  test('handing two soap over for free is +16, and crosses into adoring', () => {
    const r = resolveOffer(PUCK, { give: [{ def: SOAP, count: 2 }], take: [], gold: 0 });
    assert.equal(r.balance, 18, 'the market surplus');
    assert.equal(r.points, 16, 'amplified by his soap weight of 4');
    assert.equal(r.projected, 76);
    // A surplus is never a refusal — shortfall belongs to the deficit branch
    // only. Pinned because `shortfall: unspent` also passes every other test
    // in this file, and a consumer reading shortfall > 0 as a refusal would
    // then mis-report every generous gift as one.
    assert.equal(r.shortfall, 0);
  });

  test('the same soap inside a purchase projects identically', () => {
    const r = resolveOffer(PUCK, {
      give: [{ def: SOAP, count: 2 }], take: [{ def: BANDAGE, count: 1 }], gold: 30,
    });
    assert.equal(r.points, 16, 'gold paid the bill; the soap is still a gift on top');
    assert.equal(r.projected, 76);
  });

  test('a pure bribe routes through the gold half', () => {
    const r = resolveOffer(PUCK, { give: [], take: [], gold: 30 });
    assert.equal(r.fromItems, 0);
    assert.ok(r.fromGold > 0);
    assert.equal(r.points, r.fromGold);
  });

  test('a lowball is accepted and costs 15', () => {
    const r = resolveOffer(PUCK, {
      give: [{ def: ROCK, count: 1 }], take: [{ def: BANDAGE, count: 1 }], gold: 0,
    });
    assert.equal(r.balance, -29);
    assert.equal(r.points, -15);
    assert.equal(r.projected, 45);
    assert.equal(r.patienceExceeded, false);
  });

  test('a lowball bigger than his patience is refused', () => {
    const r = resolveOffer(PUCK, { give: [], take: [{ def: BANDAGE, count: 20 }], gold: 0 });
    assert.equal(r.points, -RESENT_MAX_PER_OFFER);
    assert.equal(r.patienceExceeded, true);
    assert.ok(r.shortfall > 0);
  });

  test('an empty offer is inert', () => {
    const r = resolveOffer(PUCK, emptyOffer());
    assert.equal(r.points, 0);
    assert.equal(r.patienceExceeded, false);
  });

  test('resolveOffer mutates neither the npc nor the offer', () => {
    const npc = { ...PUCK };
    const offer = { give: [{ def: SOAP, count: 2 }], take: [], gold: 0 };
    const snapshot = JSON.stringify({ npc, offer });
    resolveOffer(npc, offer);
    assert.equal(JSON.stringify({ npc, offer }), snapshot);
  });

  test('a null offer does not throw', () => {
    // offerBalance's equivalent null-offer guard is pinned (see
    // offerBalance(null, null) above); resolveOffer's own `offer ||
    // emptyOffer()` deserves the same, since deleting it makes this throw
    // instead of returning the inert result an absent offer should.
    const r = resolveOffer(PUCK, null);
    assert.equal(r.points, 0);
    assert.equal(r.balance, 0);
  });

  test('a raised ceiling (flipThreshold 200) is honoured by the goldUnspent math, not just the point count', () => {
    // The Fungus King's ceiling is 200, not the default 100 every other
    // resolveOffer test uses. fromGold/points already come from splitGoodwill
    // (which reads the real ceiling), so they pass even if resolveOffer's own
    // `dispositionCeil(npc)` call were hardcoded to 100 -- only goldUnspent,
    // which resolveOffer prices itself, exposes that. Under that mutant this
    // comes back 0 instead of ~129.52.
    const r = resolveOffer(KING, { give: [], take: [], gold: 1000 });
    assert.equal(r.fromGold, 279);
    assert.equal(r.itemUnspent, 0, 'no items were given');
    assert.ok(Math.abs(r.goldUnspent - 129.52) < 1e-6);
  });

  describe('the three accounting seams', () => {
    test('itemUnspent is honest GP even when the surplus is entirely a weighted gift', () => {
      // 100 soap on Puck: way past his 40-point headroom to the 100 ceiling,
      // so most of the (weighted) value buys nothing. givenItemsValue is 900
      // real GP (100 * 9) -- resolveOffer no longer exposes it, so check it
      // via offerBalance directly, which is the exported, separately-tested
      // way to get tray totals. The exact figure below is 900 minus the
      // real-GP cost of the 40 points he actually bought, divided back out
      // of his soap:4 weight — pinned, not bounded, so a formula that skips
      // the avgWeight division (or applies it the wrong way) fails here.
      const offer = { give: [{ def: SOAP, count: 100 }], take: [], gold: 0 };
      assert.equal(offerBalance(PUCK, offer).givenItemsValue, 900);
      const r = resolveOffer(PUCK, offer);
      assert.equal(r.points, 40, 'capped at his headroom to the 100 ceiling');
      assert.equal(r.goldUnspent, 0, 'no gold was given, and no summation means no float drift to tolerate');
      // Tolerance, not ===: this value is an exact terminating decimal in
      // rational arithmetic, but splitGoodwill reaches it via a 40-term float
      // summation, and whether that summation happens to land bit-exact on
      // 854.1 is luck, not structure -- a change to goodwillCostPerPoint's
      // constants or the summation order can re-roll it without being a
      // regression.
      assert.ok(Math.abs(r.itemUnspent - 854.1) < 1e-9);
    });

    test('gold spent on ceiling-refused points is not lost — the doorstep case', () => {
      // Sharpest right at the doorstep: one point shy of the flip threshold,
      // so the gold ceiling admits ZERO points no matter how much is offered.
      // Every GP staged must come back as unspent — none may vanish into
      // goodwillFor's internal "cost" of points the ceiling then refused.
      const r = resolveOffer({ disposition: 59, flipThreshold: 60 }, { give: [], take: [], gold: 500 });
      assert.equal(r.points, 0);
      assert.equal(r.fromGold, 0);
      assert.ok(r.goldRefusedPoints > 0, 'the curve wanted points; the threshold refused all of them');
      assert.equal(r.itemUnspent, 0);
      assert.equal(r.goldUnspent, 500, 'the whole 500 GP is accounted for');
    });

    test('goldRefusedPoints survives the trip through resolveOffer, with goldUnspent pinned alongside it', () => {
      const bribable = { type: 'Ghost Fungus', disposition: -50, flipThreshold: 60, bribeable: true, values: { bandage: 8 } };
      const r = resolveOffer(bribable, { give: [], take: [], gold: 100000 });
      assert.equal(r.fromGold, 109);
      assert.equal(r.goldRefusedPoints, 41, 'the curve wanted 150; the flip ceiling allowed 109');
      assert.equal(r.itemUnspent, 0);
      // The GP charged for those 41 refused points must land back in
      // goldUnspent rather than disappearing inside goodwillFor's internal
      // accounting — this is the only assertion in the file that a goldSpent
      // of 0 fails. Tolerance for the same reason as the 854.1 case above:
      // exact in rational arithmetic, bit-exact here only by luck of where a
      // 109-term summation happens to round.
      assert.ok(Math.abs(r.goldUnspent - 99664.28) < 1e-9);
    });

    test('a mixed surplus prices the item and gold halves on their own segments', () => {
      // 5 soap (weight 4) plus 100 gold, buying a bandage: items and gold
      // BOTH land points here (39 from items, 1 from gold), so a formula
      // that prices item points across the whole climb instead of their own
      // segment, or prices gold from d0 instead of afterItems, both diverge
      // from these exact figures while every other committed case (all
      // fromItems=0 or fromGold=0) cannot tell the difference. This is the
      // ONLY case in the file that kills the d0-instead-of-afterItems
      // mutant -- do not weaken or re-baseline these assertions without
      // replacing that coverage.
      const r = resolveOffer(PUCK, {
        give: [{ def: SOAP, count: 5 }], take: [{ def: BANDAGE, count: 1 }], gold: 100,
      });
      assert.equal(r.fromItems, 39);
      assert.equal(r.fromGold, 1);
      assert.ok(Math.abs(r.itemUnspent - 0.345) < 1e-9);
      assert.ok(Math.abs(r.goldUnspent - 65.02) < 1e-9);
    });

    test('itemUnspent and goldUnspent are different in KIND, not just in source', () => {
      // At disposition 95 (ceiling 100, room for only 5 points), 10 soap
      // (weight 4) plus 300 gold: the gift alone fills every remaining point
      // of room, so the 300 gold buys nothing at all -- fromGold is 0 for a
      // reason a single combined "unspent: 393.825" cannot distinguish from
      // "he's at his ceiling and neither half landed". itemUnspent (soap
      // market value he had no room left to appreciate) and goldUnspent
      // (real money that bought nothing) are reported separately so a log
      // line doesn't call one number "393 GP wasted" when it is two
      // different kinds of nothing.
      const npc = { type: 'Almost-Full', disposition: 95, values: { soap: 4 } };
      const r = resolveOffer(npc, { give: [{ def: SOAP, count: 10 }], take: [], gold: 300 });
      assert.equal(r.fromItems, 5, 'the gift alone fills his remaining headroom');
      assert.equal(r.fromGold, 0, 'no room left for gold to buy anything');
      assert.equal(r.goldUnspent, 300, 'no summation happens when fromGold is 0 -- exact, not tolerant');
      assert.ok(Math.abs(r.itemUnspent - 93.825) < 1e-9);
    });

    test('a fully-settled offer and a refused offer both report a clean zero, not undefined', () => {
      // Downstream consumers (the ledger line, the meter's ghost segment)
      // read itemUnspent/goldUnspent/goldRefusedPoints unconditionally;
      // neither branch that skips splitGoodwill may leave them missing.
      const settled = resolveOffer(PUCK, { give: [], take: [{ def: BANDAGE, count: 1 }], gold: 30 });
      assert.equal(settled.itemUnspent, 0);
      assert.equal(settled.goldUnspent, 0);
      assert.equal(settled.goldRefusedPoints, 0);

      const deficitCase = resolveOffer(PUCK, { give: [], take: [{ def: BANDAGE, count: 20 }], gold: 0 });
      assert.equal(deficitCase.itemUnspent, 0);
      assert.equal(deficitCase.goldUnspent, 0);
      assert.equal(deficitCase.goldRefusedPoints, 0);
    });
  });
});

describe('staging', () => {
  test('staging adds, and staging the same thing again increments', () => {
    let o = stage(emptyOffer(), 'give', { def: SOAP, slot: 3 });
    o = stage(o, 'give', { def: SOAP, slot: 3 });
    assert.equal(o.give.length, 1);
    assert.equal(o.give[0].count, 2);
  });

  test('the same item in a different bag slot stages separately', () => {
    let o = stage(emptyOffer(), 'give', { def: SOAP, slot: 3 });
    o = stage(o, 'give', { def: SOAP, slot: 9 });
    assert.equal(o.give.length, 2);
  });

  test('unstaging decrements, then removes the entry', () => {
    let o = stage(stage(emptyOffer(), 'give', { def: SOAP, slot: 3 }), 'give', { def: SOAP, slot: 3 });
    o = unstage(o, 'give', 0);
    assert.equal(o.give[0].count, 1);
    o = unstage(o, 'give', 0);
    assert.equal(o.give.length, 0);
  });

  test('unstaging an index that is not there is a no-op, not a crash', () => {
    const o = unstage(emptyOffer(), 'give', 7);
    assert.equal(o.give.length, 0);
  });

  test('staging never mutates the offer it was given', () => {
    const before = emptyOffer();
    stage(before, 'give', { def: SOAP, slot: 3 });
    assert.equal(before.give.length, 0);
  });

  test('unstaging never mutates the offer it came from', () => {
    const staged = stage(stage(emptyOffer(), 'give', { def: SOAP, slot: 3 }), 'give', { def: SOAP, slot: 3 });
    unstage(staged, 'give', 0);
    assert.equal(staged.give[0].count, 2, "the caller's own basket must not have decremented");
  });

  test("staging does not brand the caller's entry object", () => {
    const entry = { def: SOAP, slot: 3 };
    stage(emptyOffer(), 'give', entry);
    assert.equal('count' in entry, false, 'stage must clone the entry, not write count onto it');
  });

  test('two different items from the same slot stage separately, never merge', () => {
    let o = stage(emptyOffer(), 'give', { def: SOAP, slot: 3 });
    o = stage(o, 'give', { def: BANDAGE, slot: 3 });
    assert.equal(o.give.length, 2, "matching on slot alone would fold soap and a bandage into one entry");
  });

  test('a max caps staging at the real stack size, not the click count', () => {
    let o = emptyOffer();
    for (let i = 0; i < 5; i++) o = stage(o, 'give', { def: SOAP, slot: 3 }, 2);
    assert.equal(o.give.length, 1);
    assert.equal(o.give[0].count, 2, "five clicks on a stack of two must not stage five");
  });

  test('a new entry always starts at count 1, even if the entry argument carries its own count', () => {
    const o = stage(emptyOffer(), 'give', { def: SOAP, slot: 3, count: 5 });
    assert.equal(o.give[0].count, 1, "one click stages one unit, never the whole stack");
  });

  test('unstaging a missing index leaves the rest of the offer untouched', () => {
    const before = { give: [{ def: SOAP, slot: 3, count: 1 }], take: [], gold: 40 };
    const after = unstage(before, 'give', 7);
    assert.deepEqual(after, before, "a miss must not blank the other tray or the gold");
  });

  test('an unrecognized side falls back to give, rather than writing a garbage field', () => {
    const o = stage(emptyOffer(), 'gold', { def: SOAP, slot: 3 });
    assert.equal(o.gold, 0, "gold must stay a number, never overwritten by a stray side");
    assert.equal(o.give.length, 1);
  });

  test('staging an increment clones the entry, not just the array', () => {
    const first = stage(emptyOffer(), 'give', { def: SOAP, slot: 3 });
    stage(first, 'give', { def: SOAP, slot: 3 });
    assert.equal(first.give[0].count, 1, "incrementing a clone must not write into the source offer");
  });

  test('unstaging one entry among several leaves the rest exactly alone', () => {
    let o = stage(emptyOffer(), 'give', { def: SOAP, slot: 1 });
    o = stage(o, 'give', { def: BANDAGE, slot: 2 });
    o = stage(o, 'give', { def: ROCK, slot: 3 });
    o = unstage(o, 'give', 0);
    assert.equal(o.give.length, 2);
    assert.equal(o.give[0].def, BANDAGE);
    assert.equal(o.give[1].def, ROCK);
  });

  test('staging by source and index merges when both match -- the container/ground path', () => {
    let o = stage(emptyOffer(), 'take', { def: BANDAGE, source: 'chest-1', index: 2 });
    o = stage(o, 'take', { def: BANDAGE, source: 'chest-1', index: 2 });
    assert.equal(o.take.length, 1);
    assert.equal(o.take[0].count, 2);
  });

  test('a different source at the same index stages separately', () => {
    let o = stage(emptyOffer(), 'take', { def: BANDAGE, source: 'chest-1', index: 2 });
    o = stage(o, 'take', { def: BANDAGE, source: 'chest-2', index: 2 });
    assert.equal(o.take.length, 2);
  });

  test('the same source at a different index stages separately', () => {
    let o = stage(emptyOffer(), 'take', { def: BANDAGE, source: 'chest-1', index: 2 });
    o = stage(o, 'take', { def: BANDAGE, source: 'chest-1', index: 5 });
    assert.equal(o.take.length, 2);
  });

  test('a click past max is refused, not clamped -- staged units are never destroyed', () => {
    let o = emptyOffer();
    for (let i = 0; i < 3; i++) o = stage(o, 'give', { def: SOAP, slot: 3 }, 5);
    assert.equal(o.give[0].count, 3);
    o = stage(o, 'give', { def: SOAP, slot: 3 }, 0);
    assert.equal(o.give[0].count, 3, "a max of 0 must not rewrite an existing count down to 0");
  });

  test('staging at max 0 with nothing staged yet is a no-op, not a live zero-count row', () => {
    const o = stage(emptyOffer(), 'give', { def: SOAP, slot: 9 }, 0);
    assert.equal(o.give.length, 0);
  });
});

describe('commitBlocker — every refusal is a sentence', () => {
  const ctx = { playerGold: 750, npcGold: 9999 };

  test('an empty offer has nothing to commit', () => {
    assert.match(commitBlocker(PUCK, emptyOffer(), ctx), /NOTHING STAGED/);
  });

  test('a good offer is not blocked', () => {
    const o = { give: [{ def: SOAP, count: 2 }], take: [], gold: 0 };
    assert.equal(commitBlocker(PUCK, o, ctx), null);
  });

  test('the player cannot stage gold they do not have', () => {
    const o = { give: [], take: [], gold: 900 };
    assert.match(commitBlocker(PUCK, o, { ...ctx, playerGold: 100 }), /800 GP SHORT/);
  });

  test("the NPC's till is checked BEFORE commit, not discovered during it", () => {
    const o = { give: [{ def: SOAP, count: 2 }], take: [], gold: -18 };
    assert.match(commitBlocker(PUCK, o, { ...ctx, npcGold: 5 }), /TILL IS 13 GP SHORT/);
  });

  test('below the trade floor he will not deal at all', () => {
    const hostile = { ...PUCK, disposition: -80 };
    const o = { give: [], take: [{ def: BANDAGE, count: 1 }], gold: 0 };
    assert.match(commitBlocker(hostile, o, ctx), /WON'T DEAL/);
  });

  test("...but the give tray still works below the floor, so he can be won round", () => {
    const hostile = { ...PUCK, disposition: -80 };
    const o = { give: [{ def: SOAP, count: 2 }], take: [], gold: 0 };
    assert.equal(commitBlocker(hostile, o, ctx), null);
  });

  test('an unabsorbable lowball is refused with a reason', () => {
    const o = { give: [], take: [{ def: BANDAGE, count: 20 }], gold: 0 };
    assert.match(commitBlocker(PUCK, o, ctx), /WON'T TAKE ANOTHER BAD DEAL/);
  });

  test('a bad deal within his patience costs him, but is not blocked', () => {
    // Taking one ROCK (buyPrice 4 at his warm band) is a real deficit --
    // resentmentFor absorbs it with room to spare (shortfall 0), so this
    // is the 'a deficit is not a refusal' path: distinct from the lowball
    // above, which blows through his patience.
    const o = { give: [], take: [{ def: ROCK, count: 1 }], gold: 0 };
    assert.equal(commitBlocker(PUCK, o, ctx), null);
  });

  test('an untracked NPC cannot be shortchanged', () => {
    const untracked = { type: 'Violencian' };   // disposition undefined, not 0
    const o = { give: [], take: [{ def: BANDAGE, count: 1 }], gold: 0 };
    assert.match(commitBlocker(untracked, o, ctx), /CAN'T BE SHORTCHANGED/);
  });

  test('a container cannot be shortchanged either -- via its till, not its stock', () => {
    // Item takes from a container price at 0 (the next test), so the only way
    // left to shortchange one is gold: paying out 10 GP for nothing is still a
    // real deficit even though the till itself can easily cover it. ctx carries
    // no isContainer flag, so this isolates npc._container on its own.
    const chest = { type: 'Chest', disposition: 100, _container: true };
    const o = { give: [], take: [], gold: -10 };
    assert.match(commitBlocker(chest, o, { ...ctx, npcGold: 50 }), /CAN'T BE SHORTCHANGED/);
  });

  test('ctx.isContainer alone protects an NPC that is not itself flagged as a container', () => {
    const notAContainer = { type: 'Violencian', disposition: 50 };
    const o = { give: [], take: [], gold: -10 };
    assert.match(commitBlocker(notAContainer, o, { ...ctx, npcGold: 50, isContainer: true }), /CAN'T BE SHORTCHANGED/);
  });

  test('a null NPC with a real deficit does not throw', () => {
    const o = { give: [], take: [{ def: BANDAGE, count: 1 }], gold: 0 };
    assert.match(commitBlocker(null, o, ctx), /CAN'T BE SHORTCHANGED/);
  });

  test('taking loot from a container is free and unblocked', () => {
    const chest = { type: 'Chest', disposition: 100, _container: true };
    const o = { give: [], take: [{ def: BANDAGE, count: 1 }], gold: 0 };
    assert.equal(offerBalance(chest, o).balance, 0, "a container's own stock must price at zero");
    assert.equal(commitBlocker(chest, o, { ...ctx, isContainer: true }), null);
  });

  test('a container prices only its OWN stock at zero -- giving items into one still counts normally', () => {
    const chest = { type: 'Chest', disposition: 100, _container: true };
    const b = offerBalance(chest, { give: [{ def: SOAP, count: 2 }], take: [], gold: 0 });
    // adoring band (disposition 100): sell x0.70, floor(15 * 0.70) = 10 each.
    assert.equal(b.givenValue, 20);
  });

  test('the player-short check outranks the floor -- you hear about your own wallet first', () => {
    const hostile = { ...PUCK, disposition: -80 };
    const o = { give: [], take: [{ def: BANDAGE, count: 1 }], gold: 900 };
    assert.match(commitBlocker(hostile, o, { ...ctx, playerGold: 100 }), /800 GP SHORT/);
  });

  test('the floor outranks the till -- a hostile NPC cannot be fixed by finding him more gold', () => {
    const hostile = { ...PUCK, disposition: -80 };
    const o = { give: [], take: [], gold: -100 };
    assert.match(commitBlocker(hostile, o, { ...ctx, npcGold: 5 }), /WON'T DEAL/);
  });

  test('the till outranks a patience-exceeding balance', () => {
    const o = { give: [], take: [{ def: BANDAGE, count: 20 }], gold: -1 };
    assert.match(commitBlocker(PUCK, o, { ...ctx, npcGold: 0 }), /TILL IS 1 GP SHORT/);
  });

  test('a hostile NPC paying gold out is gated by the floor too, not just taking items', () => {
    const hostile = { ...PUCK, disposition: -80 };
    const o = { give: [], take: [], gold: -40 };
    assert.match(commitBlocker(hostile, o, ctx), /WON'T DEAL/);
  });

  test('a perfectly balanced offer from an untracked NPC is never shortchanged', () => {
    const untracked = { type: 'Violencian' };
    // buyPrice(SOAP, 0) = ceil(15 * 1.6) = 24 -- the gold exactly settles the soap.
    const o = { give: [], take: [{ def: SOAP, count: 1 }], gold: 24 };
    assert.equal(commitBlocker(untracked, o, ctx), null);
  });

  test('spending every last gold piece is not a shortfall', () => {
    const o = { give: [], take: [], gold: 750 };
    assert.equal(commitBlocker(PUCK, o, ctx), null);
  });

  test('draining a till to the exact gold on hand is not a shortfall', () => {
    const o = { give: [{ def: SOAP, count: 2 }], take: [], gold: -18 };
    assert.equal(commitBlocker(PUCK, o, { ...ctx, npcGold: 18 }), null);
  });

  test('fractional gold is truncated before it is priced, not just before it is drawn', () => {
    const o = { give: [], take: [], gold: 31.9 };
    assert.equal(commitBlocker(PUCK, o, { ...ctx, playerGold: 30 }), "YOU'RE 1 GP SHORT");
  });

  test('gold that truncates to exactly what the player has is not a shortfall', () => {
    const o = { give: [], take: [], gold: 30.9 };
    assert.equal(commitBlocker(PUCK, o, { ...ctx, playerGold: 30 }), null);
  });

  test('exactly at the trade floor, the deal still goes through, paid in full', () => {
    const edge = { ...PUCK, disposition: -50 };
    // buyPrice(BANDAGE, -50) = ceil(25 * 2.4) = 60 -- the hostile band's own rate.
    const o = { give: [], take: [{ def: BANDAGE, count: 1 }], gold: 60 };
    assert.equal(commitBlocker(edge, o, ctx), null);
  });

  test('one point below the trade floor, the deal is refused', () => {
    const edge = { ...PUCK, disposition: -51 };
    const o = { give: [], take: [{ def: BANDAGE, count: 1 }], gold: 0 };
    assert.match(commitBlocker(edge, o, ctx), /WON'T DEAL/);
  });

  test('a null NPC does not throw, and prices as neutral', () => {
    // buyPrice(SOAP, 0) = 24, so this settles at zero -- the floor gate is
    // the line under test, not the balance check below it.
    const o = { give: [], take: [{ def: SOAP, count: 1 }], gold: 24 };
    assert.equal(commitBlocker(null, o, ctx), null);
  });

  test('a NaN disposition prices as neutral, not as a refusal', () => {
    const npc = { type: 'Violencian', disposition: NaN };
    const o = { give: [], take: [{ def: SOAP, count: 1 }], gold: 24 };
    assert.equal(commitBlocker(npc, o, ctx), null);
  });

  test('commitBlocker works with no ctx argument at all', () => {
    const o = { give: [{ def: SOAP, count: 2 }], take: [], gold: 0 };
    assert.equal(commitBlocker(PUCK, o), null);
  });

  test('every refusal uses THEY or THEIR, matching the voice used elsewhere in the feature', () => {
    // main.js: "Their mood warms". Task 14: "They take it, and remember."
    const hostile = { ...PUCK, disposition: -80 };
    const untracked = { type: 'Violencian' };
    assert.equal(
      commitBlocker(hostile, { give: [], take: [{ def: BANDAGE, count: 1 }], gold: 0 }, ctx),
      "THEY WON'T DEAL"
    );
    assert.equal(
      commitBlocker(PUCK, { give: [], take: [{ def: BANDAGE, count: 20 }], gold: 0 }, ctx),
      "THEY WON'T TAKE ANOTHER BAD DEAL"
    );
    assert.equal(
      commitBlocker(untracked, { give: [], take: [{ def: BANDAGE, count: 1 }], gold: 0 }, ctx),
      "THEY CAN'T BE SHORTCHANGED"
    );
    assert.equal(
      commitBlocker(PUCK, { give: [{ def: SOAP, count: 2 }], take: [], gold: -18 }, { ...ctx, npcGold: 5 }),
      "THEIR TILL IS 13 GP SHORT"
    );
  });

  test('a gold crumb below 1 does not read as staged', () => {
    // The guard must see the same truncated value every check below it does --
    // otherwise a fraction passes as staged while every later check sees a
    // truncated zero, and the commit button fires on nothing.
    assert.equal(commitBlocker(PUCK, { give: [], take: [], gold: 0.4 }, ctx), 'NOTHING STAGED');
    assert.equal(commitBlocker(PUCK, { give: [], take: [], gold: 0.9 }, { playerGold: 0 }), 'NOTHING STAGED');
  });
});
