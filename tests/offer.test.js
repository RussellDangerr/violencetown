import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { emptyOffer, offerBalance, settledGold, dispositionCeil, goodwillCostPerPoint, goodwillFor, splitGoodwill, RESENT_MAX_PER_OFFER, RESENT_FLOOR, resentmentCostPerPoint, resentmentFor, resolveOffer, stage, unstage, commitBlocker } from '../game/offer.js';

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

describe('the goodwill curve', () => {
  test('the ceiling is at least 100, and rises for a high threshold', () => {
    assert.equal(dispositionCeil(PUCK), 100, 'flipThreshold 0 must not drag the ceiling down');
    assert.equal(dispositionCeil(KING), 200);
    assert.equal(dispositionCeil({}), 100, 'a missing flipThreshold defaults to 30, so max(100,30)');
  });

  test('a point costs 1 GP at the floor and 5 GP at the ceiling', () => {
    assert.equal(goodwillCostPerPoint(-100, 100), 1);
    assert.equal(goodwillCostPerPoint(100, 100), 5);
    assert.equal(goodwillCostPerPoint(0, 100), 3, 'halfway');
  });

  test('cost rises monotonically with disposition', () => {
    let prev = -Infinity;
    for (let d = -100; d <= 100; d += 5) {
      const c = goodwillCostPerPoint(d, 100);
      assert.ok(c >= prev, `cost fell at d=${d}`);
      prev = c;
    }
  });

  test('the curve clamps outside its range instead of running away', () => {
    assert.equal(goodwillCostPerPoint(-500, 100), 1);
    assert.equal(goodwillCostPerPoint(500, 100), 5);
  });

  test('goodwill is deterministic — same input, same output, every time', () => {
    const a = goodwillFor(72, PUCK), b = goodwillFor(72, PUCK);
    assert.deepEqual(a, b, 'two separate calls must return equal-shaped objects, not just equal points');
    assert.equal(a.points, 16, 'the spec worked example: 72 GP of surplus on Puck at +60');
  });

  test('goodwill rounds DOWN — you only get points you fully paid for', () => {
    assert.equal(goodwillFor(0, PUCK).points, 0);
    const one = goodwillFor(1, PUCK);
    assert.equal(one.points, 0, 'a point costs 4.2 GP at +60; 1 GP buys none');
    assert.equal(one.unspent, 1, 'the whole 1 GP goes unspent — it never affords even one point');
  });

  test('goodwill is monotonic in the surplus', () => {
    let prev = -1;
    for (let gp = 0; gp <= 200; gp += 7) {
      const pts = goodwillFor(gp, PUCK).points;
      assert.ok(pts >= prev, `points fell at ${gp} GP`);
      prev = pts;
    }
  });

  test('affection is cheap early — the Fungus King at -80 buys points for about 1 GP', () => {
    assert.equal(goodwillFor(10, KING).points, 7);
  });

  test('a negative or nonsense surplus buys nothing', () => {
    const negative = goodwillFor(-50, PUCK), nan = goodwillFor(NaN, PUCK);
    assert.equal(negative.points, 0);
    assert.equal(negative.unspent, 0, 'no valid surplus means nothing to report as left over');
    assert.equal(nan.points, 0);
    assert.equal(nan.unspent, 0, 'unspent must not leak the NaN input back out');
  });

  test('a non-finite disposition fails to neutral, not to a jackpot', () => {
    // "Neutral" means the funnel treats it exactly like a MISSING disposition
    // (dispositionOf already maps that to 0) — not a special zero-points case.
    // At neutral (0) a point costs 3 GP, so 5 GP still buys exactly one, same
    // as goodwillFor(5, {}). What the guard kills is the pre-fix jackpot: 400.
    assert.deepEqual(goodwillFor(5, { disposition: NaN }), goodwillFor(5, {}),
      'NaN must be treated identically to a missing disposition, not specially');
    assert.equal(goodwillFor(5, { disposition: NaN }).points, 1);
    assert.equal(goodwillFor(5, { disposition: Infinity }).points, 1);
  });

  test('offerBalance also stays finite with a NaN disposition — the sanitization is at the funnel', () => {
    const b = offerBalance({ disposition: NaN }, { give: [{ def: SOAP, count: 1 }], take: [], gold: 0 });
    assert.ok(Number.isFinite(b.balance), 'a NaN disposition must not leak NaN into the balance');
  });

  test('a surplus that exactly pays for N points buys N, not N-1', () => {
    // cost(k) = 3 + k/50 at neutral; sum k=0..24 is 81 exactly.
    const r = goodwillFor(81, { disposition: 0, flipThreshold: 30 });
    assert.equal(r.points, 25);
    assert.equal(r.unspent, 0, 'an exact payment leaves nothing behind, once EPSILON absorbs the drift');
  });

  test('goodwill can never exceed the headroom to the ceiling', () => {
    const r = goodwillFor(100000, PUCK);   // +60 on a 100 ceiling: 40 points of headroom
    assert.equal(r.points, 40);
    assert.ok(r.unspent > 99000, 'almost all of a huge overpayment must come back as unspent, not vanish');
  });

  test('a garbage flipThreshold falls back to the default ceiling', () => {
    for (const t of [NaN, Infinity, -Infinity, 'abc', {}]) {
      assert.equal(dispositionCeil({ flipThreshold: t }), 100, `ceiling leaked on ${String(t)}`);
    }
  });

  test('a binding cap prices unspent from the capped prefix, not the uncapped walk', () => {
    // The Ghost Fungus at -50, capped at exactly the 109 points splitGoodwill's
    // own gold leg allows: the curve would spend 100000 - 99476.50 = 523.50 GP
    // if it climbed the full 150-point walk to the ceiling, but only 335.72 of
    // that pays for the 109 points the cap actually admits. Measuring unspent
    // from the FINAL (uncapped) pool instead of the snapshot at the cap passes
    // every other test in this file and reports 99476.50 here instead — the
    // 187.78 GP difference is exactly the "gold in neither field" bug this
    // module exists to close.
    const ghostAt50 = { type: 'Ghost Fungus', disposition: -50, flipThreshold: 60, values: { bandage: 8 } };
    const r = goodwillFor(100000, ghostAt50, 109);
    assert.equal(r.points, 109);
    assert.ok(Math.abs(r.unspent - 99664.28) < 1e-9);
  });

  describe('unspent — the mirror of resentmentFor\'s shortfall', () => {
    test('a comfortable surplus on a warm NPC leaves most of it spent, a little unspent', () => {
      // Puck +60, headroom to 100 is 40 points; filling it costs ~183.6 GP.
      const r = goodwillFor(200, PUCK);
      assert.equal(r.points, 40, 'capped at headroom, same as the 100000-GP case');
      assert.ok(r.unspent > 10 && r.unspent < 20,
        'the 16.4 GP that overshoots the ceiling must be reported, not discarded');
    });

    test('a hostile NPC with a raised ceiling has more room, so less is wasted', () => {
      // The Fungus King: -80 disposition, flipThreshold 200 -> 280 points of headroom.
      const r = goodwillFor(1920, KING);
      assert.equal(r.points, 280);
      assert.ok(r.unspent > 1000, 'even 1920 GP cannot fill 280 points of headroom on its own');
    });

    test('an NPC already at their own ceiling can never be pleased further — everything is unspent', () => {
      const contentAlly = { disposition: 100, flipThreshold: 0 };   // already at the max
      const r = goodwillFor(10, contentAlly);
      assert.equal(r.points, 0, 'no room left to buy, no matter the price');
      assert.equal(r.unspent, 10, 'the entire gift is reported back, not silently swallowed as +0');
    });

    test('a fractional disposition never breaches the ceiling via a rounded-up room', () => {
      // d0=99.5 against ceil 100 gives room 0.5 before Math.floor; `pts <
      // room` would still admit one point, landing at 100.5 -- above the
      // ceiling the room calculation exists to enforce.
      const r = goodwillFor(1e9, { disposition: 99.5, flipThreshold: 0 });
      assert.equal(r.points, 0, 'half a point of headroom must round down to zero, not up to one');
    });
  });
});

const GHOST = { type: 'Ghost Fungus', disposition: -50, flipThreshold: 60, bribeable: false, values: { bandage: 8 } };
const BOSS  = { type: 'Wererat' };   // no disposition, no flipThreshold, no bribeable — as authored

describe('the gold ceiling', () => {
  test('items and gold each contribute, and the total is their sum', () => {
    const r = splitGoodwill(PUCK, { itemValue: 36, gold: 30 });
    assert.equal(r.points, r.fromItems + r.fromGold);
    assert.equal(typeof r.itemsSpent, 'number', 'itemsSpent must be carried through from goodwillFor');
    assert.equal(typeof r.goldSpent, 'number', 'goldSpent must be carried through from goodwillFor');
    assert.ok(r.fromItems > 0 && r.fromGold > 0);
  });

  test('gold cannot carry an NPC across an uncrossed flip threshold', () => {
    // bribeable:true — otherwise the bribeable:false branch short-circuits and
    // this passes for the wrong reason.
    const bribable = { ...GHOST, bribeable: true };
    const r = splitGoodwill(bribable, { itemValue: 0, gold: 100000 });
    assert.equal(bribable.disposition + r.points, bribable.flipThreshold - 1,
      'gold must stop exactly one point short of the threshold');
  });

  test('60 GP of bribes can no longer flip the sewer boss', () => {
    // The old live bug: 60 GP at a flat 5 GP/point bought +30, enough to flip
    // him. The Wererat has no bribeable flag, no flipThreshold and no
    // disposition, so threshold defaults to 30 and the rising curve means
    // 60 GP buys only 18 points now — nowhere near 30.
    assert.equal(splitGoodwill(BOSS, { gold: 60 }).points, 18);
    // Even unlimited gold caps at 29 — one short of the flip, never 30.
    assert.equal(splitGoodwill(BOSS, { gold: 100000 }).points, 29);
  });

  test('items are NOT capped by the gold ceiling — gifts stay the clever path', () => {
    const r = splitGoodwill({ ...GHOST, bribeable: true }, { itemValue: 100000, gold: 0 });
    assert.ok(GHOST.disposition + r.points > GHOST.flipThreshold,
      'a generous enough gift must be able to cross the threshold');
  });

  test('an NPC already at or above their threshold is not frozen out of gold', () => {
    // Puck sits at +60 with flipThreshold 0 — already past it.
    const r = splitGoodwill(PUCK, { itemValue: 0, gold: 200 });
    assert.ok(r.fromGold > 0, 'gold must still work on an already-flipped NPC');
  });

  test('bribeable:false means gold buys no affection at all', () => {
    const r = splitGoodwill(GHOST, { itemValue: 0, gold: 100000 });
    assert.equal(r.fromGold, 0);
  });

  test('...but bribeable:false still lets gifts land', () => {
    const r = splitGoodwill(GHOST, { itemValue: 200, gold: 0 });
    assert.ok(r.fromItems > 0);
  });

  test('goldRefusedPoints is a number on both branches, never a boolean', () => {
    // The bribeable:false branch — a stray `gold > 0` here reads as `true`,
    // which is `1` in a numeric context: "1 point refused" on the one NPC
    // where every point was refused.
    const refused = splitGoodwill(GHOST, { itemValue: 0, gold: 100000 });
    assert.equal(typeof refused.goldRefusedPoints, 'number');

    // The flip-ceiling branch.
    const capped = splitGoodwill({ ...GHOST, bribeable: true }, { itemValue: 0, gold: 100000 });
    assert.equal(typeof capped.goldRefusedPoints, 'number');
  });

  test('the refused count is measured AFTER the gift has moved them', () => {
    const withGift = splitGoodwill(GHOST, { itemValue: 200, gold: 100000 });
    assert.equal(withGift.fromItems, 73, 'a 200-value gift lifts the Fungus from -50 to +23');
    assert.equal(withGift.goldRefusedPoints, 77,
      'from +23 the same gold asks for 77 points, not the 150 it asks for from -50');
    assert.equal(splitGoodwill(GHOST, { itemValue: 0, gold: 100000 }).goldRefusedPoints, 150);
  });

  test('a refusing partner still accounts for the gold — chests included', () => {
    // The chest shim is bribeable:false, disposition:100 (main.js _openContainer),
    // so once Tasks 12-17 land it, not the Ghost Fungus, is this branch's usual
    // caller. Staging gold into a chest must spend none of it, not swallow it.
    const chest = { type: 'Chest', disposition: 100, bribeable: false };
    const r = splitGoodwill(chest, { itemValue: 0, gold: 500 });
    assert.equal(r.points, 0);
    assert.equal(r.goldSpent, 0, 'nothing was spent — the chest is already at its ceiling');
  });

  test('itemsSpent and goldSpent both carry a nonzero value', () => {
    const r = splitGoodwill({ ...GHOST, bribeable: true }, { itemValue: 200, gold: 100000 });
    assert.ok(r.itemsSpent > 0 && r.goldSpent > 0,
      'both halves must actually spend something, not just the gift half alone');
  });

  test('the ceiling reports exactly what it refused', () => {
    const r = splitGoodwill({ ...GHOST, bribeable: true }, { itemValue: 0, gold: 100000 });
    assert.equal(r.fromGold, 109);
    assert.equal(r.goldRefusedPoints, 41, 'the curve wanted 150; the flip ceiling allowed 109');
  });

  test('an NPC sitting EXACTLY on their threshold is not frozen out of gold', () => {
    // The "at" half of "at or above" — the Puck case only covers "above".
    const r = splitGoodwill({ disposition: 60, flipThreshold: 60 }, { gold: 500 });
    assert.equal(r.fromGold, 40);
  });

  test('a fractional flipThreshold does not mint fractional disposition', () => {
    // Without Math.floor this is { fromGold: 109.5, points: 109.5,
    // goldRefusedPoints: 40.5 } — fractional GP-bought points that would
    // eventually land on npc.disposition itself. 60.5 still passes
    // Number.isFinite, so this is reachable from map JSON alone.
    const r = splitGoodwill({ disposition: -50, flipThreshold: 60.5 }, { gold: 100000 });
    assert.equal(r.fromGold, 109);
    assert.equal(r.points, 109);
    assert.equal(r.goldRefusedPoints, 41);
    assert.ok(Number.isInteger(r.fromGold) && Number.isInteger(r.points));
  });

  test('a garbage flipThreshold falls back to the default 30 — gold stops at 29', () => {
    // Same input class dispositionOf and dispositionCeil already sanitize
    // (see "a garbage flipThreshold falls back to the default ceiling" above);
    // this is the threshold's own door, in splitGoodwill.
    for (const t of [NaN, Infinity, -Infinity, 'abc', {}]) {
      const r = splitGoodwill({ type: 'Test', flipThreshold: t }, { itemValue: 0, gold: 100000 });
      assert.equal(r.points, 29, `flipThreshold ${String(t)} must fall back to the default ceiling`);
    }
  });

  test('gold never COSTS disposition — the floor cannot round below zero', () => {
    // afterItems 60 against a 60.5 threshold: ceiling 59.5, floor(-0.5) is -1.
    // Without Math.max(0, ...) this returns points: -1 — paying him makes him
    // like you less. Reachable from a fractional flipThreshold in map JSON.
    const r = splitGoodwill({ disposition: 60, flipThreshold: 60.5 }, { gold: 500 });
    assert.equal(r.fromGold, 0);
    assert.equal(r.points, 0, 'gold that cannot buy a point buys zero, never a negative one');
  });
});

describe('resentment — bad deals are a move, not an error', () => {
  test('the bounds are the specced constants', () => {
    assert.equal(RESENT_MAX_PER_OFFER, 25);
    assert.equal(RESENT_FLOOR, -25);
  });

  test('the resentment curve is the goodwill curve mirrored', () => {
    // These five points are where 4*progress(d,100) is exactly representable
    // in binary, so exact equality holds here but is not a general claim —
    // e.g. d=-97 differs by 1 ulp. Harmless: resentmentFor only ever feeds
    // this an integer d0-pts and never compares the two curves against each
    // other, so a 1-ulp gap never surfaces. If Tasks 9-11 ever chart the two
    // curves against each other directly, widen this to a tolerance.
    for (const d of [-100, -50, 0, 50, 100]) {
      assert.equal(resentmentCostPerPoint(d, 100), 6 - goodwillCostPerPoint(d, 100),
        `curves are not mirrored at d=${d}`);
    }
  });

  test('betrayal is cheaper than affection when they like you', () => {
    assert.ok(resentmentCostPerPoint(60, 100) < goodwillCostPerPoint(60, 100));
  });

  test('and dearer than affection when they do not', () => {
    assert.ok(resentmentCostPerPoint(-80, 100) > goodwillCostPerPoint(-80, 100));
  });

  test('the spec worked example: a 29 GP shortfall costs Puck 15 points', () => {
    const r = resentmentFor(29, PUCK);
    assert.equal(r.points, -15);
    assert.equal(r.shortfall, 0, 'the deal is absorbed, not refused');
  });

  test('resentment rounds UP — any shortfall costs at least one whole point', () => {
    const r = resentmentFor(0.5, PUCK);
    assert.equal(r.points, -1);
    assert.equal(r.shortfall, 0);
  });

  test('dropping Puck the full 25 points costs 51 GP', () => {
    let gp = 0;
    for (let i = 0; i < 25; i++) gp += resentmentCostPerPoint(60 - i, 100);
    assert.equal(Math.round(gp), 51);
  });

  test('paying the spec-exact 51 GP is accepted, not refused on float dust', () => {
    // The 25-point cap binds here BEFORE pool ever crosses zero — summing
    // the 25 real costs leaves ~1.02e-14 of float drift sitting in pool when
    // the room cap ends the loop. Math.max(0, pool) alone read that dust as
    // a live shortfall and refused the exact payment named above; a caller
    // (Task 5) must be able to spend precisely the number this file quotes.
    const r = resentmentFor(51, PUCK);
    assert.equal(r.points, -25);
    assert.equal(r.shortfall, 0, 'paying exactly the quoted price must not be refused');
  });

  test('an exact mid-loop payment does not take a bonus point off float dust', () => {
    // At disposition -18, five points cost exactly 17.00 GP — but the same
    // drift that undercounts the 51 GP case above can also land pool a hair
    // ABOVE zero instead of below, and a bare `pool > 0` reads that as still
    // owing, taking a 6th point nobody paid for.
    const r = resentmentFor(17, { disposition: -18 });
    assert.equal(r.points, -5, 'exactly-paid points must not spill into an extra one');
    assert.equal(r.shortfall, 0);
  });

  test('an exact single-point payment stops there — the boundary itself', () => {
    // resentmentCostPerPoint(50, 100) is exactly 2 (no float drift at all here),
    // so this pins the loop's own continuation test directly: `pool > 0`
    // widened to `pool >= 0` re-enters the loop on the leftover zero and
    // charges a second point (-2) nobody paid for.
    assert.equal(resentmentCostPerPoint(50, 100), 2);
    const r = resentmentFor(2, { disposition: 50 });
    assert.equal(r.points, -1);
    assert.equal(r.shortfall, 0);
  });

  test('the ceiling comes from dispositionCeil, not a hardcoded 100', () => {
    // Same disposition as Puck (60) but the Fungus King's raised ceiling
    // (flipThreshold 200) makes every point DEARER, not cheaper —
    // resentmentCostPerPoint(60, 200) is ~2.87 against Puck's 1.80, because +60
    // is only 53% up the 300-wide meter (-100 to 200) and he is still braced.
    // So the identical 29 GP shortfall buys fewer points here, not more: 10
    // against Puck's 15 — a hardcoded ceil of 100 would silently give -15,
    // same as Puck, and nothing in this file would catch it.
    const warmKing = { ...KING, disposition: 60 };
    const r = resentmentFor(29, warmKing);
    assert.equal(r.points, -10);
    assert.equal(r.shortfall, 0);
  });

  test('one offer can never cost more than RESENT_MAX_PER_OFFER', () => {
    const r = resentmentFor(1e9, PUCK);
    assert.equal(r.points, -RESENT_MAX_PER_OFFER);
    assert.ok(r.shortfall > 0, 'the unabsorbed remainder must be reported');
  });

  test('no amount of bad dealing goes below the floor', () => {
    const nearFloor = { ...PUCK, disposition: RESENT_FLOOR + 3 };
    const r = resentmentFor(1e9, nearFloor);
    assert.equal(r.points, -3, 'only the three points of headroom are available');
    assert.ok(nearFloor.disposition + r.points >= RESENT_FLOOR);
  });

  test('an NPC already at the floor absorbs nothing, so the lever closes', () => {
    const r = resentmentFor(1e9, { ...PUCK, disposition: RESENT_FLOOR });
    assert.equal(r.points, 0);
    assert.ok(r.shortfall > 0, 'the whole deficit is unabsorbed — the deal must be refused');
  });

  test('an NPC below the floor also absorbs nothing', () => {
    const r = resentmentFor(50, { ...PUCK, disposition: -80 });
    assert.equal(r.points, 0);
  });

  test('a zero or negative deficit costs nothing', () => {
    assert.equal(resentmentFor(0, PUCK).points, 0);
    assert.equal(resentmentFor(-10, PUCK).points, 0);
  });

  test('a sub-EPSILON deficit returns positive zero, not negative zero', () => {
    // deficit > 0 but too small to buy even one point exits the loop at
    // pts=0; a bare `-pts` there is -0. node:assert/strict's equal is
    // Object.is underneath, so this is not cosmetic: assert.equal(-0, 0)
    // actually throws in this suite, and a future test built the ordinary
    // way (assert.equal(result.points, 0)) would fail on it by surprise.
    const r = resentmentFor(1e-15, { disposition: 0 });
    assert.equal(r.points, 0);
    assert.ok(!Object.is(r.points, -0), 'points must not be negative zero');
  });

  test('resentmentFor never mutates the npc it is handed', () => {
    // A fresh local fixture, not the shared PUCK: nine earlier tests have
    // already run PUCK through this function, so an idempotent mutation
    // would already be present in the fixture before this snapshot -- and
    // structuredClone alone doesn't help, since by then the contamination
    // is in PUCK itself, not just in the shallow copy of it.
    const npc = { type: 'Puck', disposition: 60, flipThreshold: 0, values: { soap: 4 } };
    const before = structuredClone(npc);
    resentmentFor(200, npc);
    assert.deepEqual(npc, before);
  });

  test('a degenerate span prices at the worst case for the player, both directions', () => {
    // ceil=0 is NOT degenerate: span = 0 - DISPOSITION_MIN = 100 > 0, so this
    // would take the normal clamped path and land on 5/1 anyway, proving
    // nothing about the guard. ceil = DISPOSITION_MIN (-100) makes span
    // exactly 0, which is the branch that must price at the worst case for
    // the player either way -- goodwill's own max (5), resentment's own
    // min (1). Mutating that branch's `return 1` to `return 0` flips both.
    assert.equal(goodwillCostPerPoint(0, -100), 5);
    assert.equal(resentmentCostPerPoint(0, -100), 1);
  });

  test('a non-finite disposition prices as neutral here too, not as a refusal', () => {
    // Unlike goodwill, a raw (unsanitized) disposition read here would go to
    // room = NaN -> zero iterations -> { points: -0, shortfall: deficit }, i.e.
    // the deal refused outright, not merely priced at 0 points.
    assert.deepEqual(resentmentFor(29, { disposition: NaN }), resentmentFor(29, {}));
  });

  test('a partial shortfall reports what is left, not the whole deficit', () => {
    // Puck absorbs 25 points for ~51 GP; 60 GP leaves ~9 unabsorbed, not 60.
    // The true residue is 9.000000000000004 -- shortfall is a raw float,
    // never rounded -- so this needs the same EPSILON-scale tolerance the
    // fix itself uses, not exact equality.
    const r = resentmentFor(60, PUCK);
    assert.equal(r.points, -25);
    assert.ok(Math.abs(r.shortfall - 9) < 1e-9, `shortfall was ${r.shortfall}`);
  });

  test('a fractional disposition never breaches the floor via a rounded-up room', () => {
    // d0=-24.5 gives room 0.5 before Math.floor; `pts < room` would still
    // admit one point, landing at -25.5 -- half a point below RESENT_FLOOR.
    // Not reachable from disposition alone today, but splitGoodwill already
    // carries the identical Math.floor for the mirrored ceiling hazard.
    const r = resentmentFor(1e9, { disposition: RESENT_FLOOR + 0.5 });
    assert.equal(r.points, 0, 'half a point of headroom must round down to zero, not up to one');
  });
});

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
    // real deficit even though the till itself can easily cover it.
    const chest = { type: 'Chest', disposition: 100, _container: true };
    const o = { give: [], take: [], gold: -10 };
    assert.match(commitBlocker(chest, o, { ...ctx, npcGold: 50, isContainer: true }), /CAN'T BE SHORTCHANGED/);
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
});
