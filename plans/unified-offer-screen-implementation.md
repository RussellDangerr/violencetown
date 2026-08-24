# The Unified Offer Screen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the trade window with one screen where buying, selling, giving and bribing are a
single verb — *make an offer* — and the NPC's disposition, every item's value, and every item's
description are all legible at once.

**Architecture:** A new pure module `game/offer.js` owns the basket model and all the disposition
math, importing only `game/trade.js` (itself pure). A new pure `offerLayout()` in `game/layout.js`
returns every rect. `renderer.js` draws from that layout; `main.js` hit-tests against the *same*
layout — the invariant `layout.js`'s header already enforces. Nothing new is persisted.

**Tech Stack:** Vanilla ES modules, HTML5 canvas 2D, no build step, no framework. `node --test` for
the pure modules. **Node is installed here** (v24.18.0 / npm 11.16.0) — every failing test in this
plan can actually be run and seen to fail.

**Design spec:** `plans/unified-offer-screen.md`. Read §4 and §5 before Task 1.

**Branch:** `feature/unified-offer-screen`, already created off `dev` (`83bb440`).

---

## Before you start

- [ ] **Confirm the baseline is green**

```bash
cd C:/Code/violencetown && npm test 2>&1 | tail -8
```

Expected: `pass 404`, `fail 0`. If it is not 404/0, stop and find out why before changing anything.

---

## House rules this codebase enforces

Violating any of these will fail review even if the tests pass.

1. **`layout.js` is the single source of geometry.** A pure function takes a container rect (plus
   read-only state) and returns plain rects in the fixed 608×608 space. The renderer imports it to
   draw; `main.js` imports the *same* function to hit-test. Neither stores geometry.
2. **`layout.js` must stay importable by a bare `node:test` process** — no DOM, no game-logic
   imports. Its only import today is `./rings.js` (pure).
3. **Indentation is inconsistent on purpose — match your neighbour.** In `layout.js` the
   device/trade/equip block uses **4 spaces**; `rectsOverlap`, `expandRect`, `targetListRowRect`,
   `inspectorPanelRect`, `gearOptionRects` use **2**. Test files use 2.
4. **`layout.js` and the test files use CRLF line endings.** Match them, or the diff rewrites the
   whole file.
5. **A content-aware layout function null-guards everything it reads off `game`**, the way
   `deviceRingsLayout(bodyRect, game)` does (`(game && game.ringTier) || 0`). That is what lets a
   node test call it with a hand-built stub.
6. **Never use the `/8` wrap idiom.** `_wrapText` measures in characters and every call site outside
   `_drawDialogueModal` divides pixels by a hardcoded 8 — a fossil of the retired 8×8 bitmap atlas.
   The real VT323 advance is `scale × 4.8`. Measure with `this.font.measure('X', scale)`.
7. **Log lines are bracketed sentences in house voice** — `[The Violet Fungus pockets the soap.
   Disposition +40.]`, never `Offer committed.`
7a. **Rejected alternatives go in the commit message, not the source.** A code comment says what the
   code does and why the number is that number. It does **not** re-argue a review round, pre-empt an
   objection, or prove that some other approach would have been worse — `git blame` finds the commit
   message, and a test proves the behaviour executably. This rule exists because `game/offer.js`
   reached 1.5 comment lines per line of code, with a quarter of that prose addressed to reviewers
   rather than readers, and the ratio rose at every review round. If a fix needs seventeen lines of
   justification, the justification belongs in the commit and the comment should point at the test
   that pins it.
8. **Naming:** Violencetown is one word; citizens are Violencians; `poition` is deliberate;
   `defence` is British. Before merging, this must return zero lines:

```bash
cd C:/Code/violencetown && git grep -iE 'violence[ _-]+town' -- ':!CLAUDE.md' ':!plans/item-hotbar-xmb-implementation.md'
```

---

## File structure

| File | Responsibility | Task |
| --- | --- | --- |
| `game/offer.js` | **New, pure.** Basket model, balance, goodwill curve, resentment curve, commit blockers. Imports only `trade.js`. | 1–6 |
| `tests/offer.test.js` | **New.** Every rule in spec §4. | 1–6 |
| `game/weapons.js` | Weapons gain `baseValue` / `description` / `category` so they can be priced and described. | 7 |
| `game/main.js` | `_takeItemAt` stops silently deleting unresolvable ground items; the whole offer-screen wiring; the old trade path deleted. | 7, 12–17 |
| `game/layout.js` | `MODAL_RECT` + `offerLayout()`; the `TRADE_*` grid constants deleted. | 8, 15 |
| `tests/offer-layout.test.js` | **New.** Containment, the two-part overlap invariant, the gutter constraint. | 8 |
| `game/renderer.js` | `_drawOfferScreen` replaces `_drawTradeModal` + `_drawTradeCell`. | 9–11, 15 |
| `tests/trade.test.js` | **New.** Backfills the pricing coverage that does not exist today. | 18 |
| `plans/economy-merchants.md`, `plans/give-action-feature.md` | Supersede headers. | 19 |

---

## Task 1: `game/offer.js` — the basket and its balance

**Files:**
- Create: `game/offer.js`
- Create: `tests/offer.test.js`

The offer carries item **defs**, not ids, so this module never needs the item registry and stays
trivially unit-testable.

```js
offer = {
  give: [{ def, count, slot }],                  // slot = index into game.inventory
  take: [{ def, count, source, index }],         // source: 'stock' | 'buyback' | 'contents'
  gold: 0,                                       // SIGNED: >0 player pays, <0 NPC pays out
}
```

**Gold is one signed field, not two.** Positive is gold the player hands over; negative is gold the
NPC pays out. Without the negative half the model cannot express a sale — which is the most common
thing a player does in a shop. A sale is `give: [2 soap], gold: -18`; a purchase is `gold: +30,
take: [bandage]`. Same field, same arithmetic, opposite sign.

- [ ] **Step 1: Write the failing test**

Create `tests/offer.test.js`:

```js
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
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
cd C:/Code/violencetown && node --test tests/offer.test.js
```

Expected: FAIL — `Cannot find module '.../game/offer.js'`.

- [ ] **Step 3: Write the minimal implementation**

Create `game/offer.js`:

```js
// offer.js — the basket behind the unified offer screen.
//
// Trade and give are the SAME function: there is one verb, "make an offer".
// The player stages items into two trays plus gold, and the signed balance
// decides what the exchange means — a purchase, a sale, a gift, a bribe, or a
// bad deal. Any imbalance moves disposition: surplus buys goodwill, a shortfall
// costs it.
//
// PURE. Imports only trade.js (itself pure), takes item DEFS rather than ids so
// it never needs the item registry, and mutates nothing. main.js owns inventory,
// gold transfer and logging; this module owns the arithmetic.
//
// The disposition this module PROJECTS is the same value trade.js READS to price
// buy/sell and give-action.js MOVES on a gift — three faces of one spine.
//
// Design: plans/unified-offer-screen.md §4. Geometry: layout.js offerLayout().

import { buyPrice, canTrade, sellPrice, TRADE_FLOOR } from './trade.js';

// A fresh, empty basket.
export function emptyOffer() {
    return { give: [], take: [], gold: 0 };
}

// Every disposition read in this module funnels through here, so a missing
// npc (or a missing `disposition` on one) prices as neutral instead of
// throwing.
function dispositionOf(npc) {
    return (npc && npc.disposition) ?? 0;
}

// A count is a whole, non-negative number of units. Fractions from a drag
// handle and NaN from an empty quantity field must not reach the settlement.
function unitCount(c) {
    const n = Math.trunc(c ?? 1);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
}

// The weight an NPC puts on an item beyond its market price. An authored
// `values` entry multiplies the item's worth as a gift; an item they have no
// opinion about still counts at face value, which is what makes the give tray
// meaningful on the five merchants with no `values` block authored at all.
//
// An authored `values: { x: 0 }` also floors to 1 here — give-action.js:43
// reads that same authored 0 as "no opinion", so the two modules agree. No
// map JSON authors a zero today; this comment is so the next author who adds
// one doesn't get a gift that silently prices at nothing.
export function giftWeight(npc, def) {
    if (!npc || !def) return 1;
    const w = npc.values && npc.values[def.id];
    return (typeof w === 'number' && w > 0) ? w : 1;
}

// The signed balance of a staged offer, from the NPC's point of view.
//   balance > 0  surplus  — they come out ahead, and it buys goodwill
//   balance = 0  a straight trade — disposition unmoved
//   balance < 0  deficit  — a bad deal they will take while thinking less of you
export function offerBalance(npc, offer) {
    const d = dispositionOf(npc);
    const o = offer || emptyOffer();
    const gold = Math.trunc(o.gold || 0);
    // Signed gold sits on whichever side it belongs to: positive is the player
    // paying, negative is the NPC paying out. Two trays, one field.
    //
    // MARKET value and GIFT value are separate. The `values` weight is affection,
    // not money — Puck pays 9 GP for soap he sells at 18, and his soap:4 must not
    // make him pay 72. Weighting the settlement would let the player mint gold out
    // of an NPC's fondness. The weight enters only in resolveOffer, on the surplus.
    let givenValue = Math.max(0, gold);
    let giftValue  = 0;   // gold carries no gift weight, so it never enters here
    let givenItemsValue = 0;
    for (const g of o.give || []) {
        const n = unitCount(g.count);
        // sellPrice is null below TRADE_FLOOR, which would price a gift at zero
        // and make "gift your way back up to where he'll deal" impossible. Fall
        // back to the hostile band so a gift is always worth SOMETHING. Taking
        // stays band-gated — buyPrice keeps its null, and commitBlocker refuses.
        const market = (sellPrice(g.def, d) ?? sellPrice(g.def, TRADE_FLOOR) ?? 0) * n;
        givenItemsValue += market;
        givenValue += market;
        giftValue  += market * giftWeight(npc, g.def);
    }
    let takenValue = Math.max(0, -gold);
    for (const t of o.take || []) {
        const n = unitCount(t.count);
        const unit = buyPrice(t.def, d) || 0;
        takenValue += unit * n;
    }
    return { givenValue, takenValue, balance: givenValue - takenValue, giftValue, givenItemsValue };
}

// The gold that would zero the balance for the currently staged items — what the
// screen drops into a tray for you the moment you stage something. Positive means
// the player owes; negative means the NPC does. The player then drags it off zero
// deliberately, which is the whole interaction.
export function settledGold(npc, offer) {
    const z = offerBalance(npc, { ...(offer || emptyOffer()), gold: 0 });
    const g = -z.balance;
    // Below the floor he won't pay out, so don't quote a payout the commit
    // blocker will only refuse. A gift stages at zero and stays a gift.
    return (g < 0 && !canTrade(dispositionOf(npc))) ? 0 : g;
}
```

> **Shipped shape (after review).** The block above is what actually landed, not the first draft.
> Task 1's quality review moved four things and it is worth knowing why before you extend this file:
> gift pricing falls back to the hostile band below `TRADE_FLOOR` (otherwise gifting a hostile NPC
> prices at zero and the "gift your way back up" path is arithmetically impossible); `giftValue` no
> longer folds gold in; `itemsGiven` became `givenItemsValue` because it holds a GP total, not a
> count; and `settledGold` clamps a payout to 0 when the NPC won't deal, so a gift doesn't auto-fill
> a tray the commit blocker would then refuse. `dispositionOf` and `unitCount` are shared helpers —
> use them rather than re-deriving. The test file grew from 12 tests to 17 over the same review.

- [ ] **Step 4: Run the test and watch it pass**

```bash
cd C:/Code/violencetown && node --test tests/offer.test.js
```

Expected: **0 failures**, and no previously-passing test now failing. The exact count is deliberately not gated: each task's review round adds tests, so a predicted number goes stale the moment it is written. `fail 0` plus a non-decreasing count is the gate.)

Note the last test: `buyPrice` returns `null` below `TRADE_FLOOR`, and `|| 0` turns that into 0 —
which is why the `band` import is present but unused so far. Task 5 uses it for the refusal reason.

- [ ] **Step 5: Commit**

```bash
cd C:/Code/violencetown && git add game/offer.js tests/offer.test.js && git commit -m "feat(offer): the signed balance — surplus, straight trade, or bad deal

One verb, one number. Taken items price at buyPrice, given items at
sellPrice, and gold is a single SIGNED field so the NPC can pay out —
without the negative half the model cannot express a sale, which is the
most common thing a player does in a shop. The sign of the difference is
the whole model.

Market value and gift value are tracked separately. The values weight is
affection, not money: Puck pays 9 GP for soap he sells at 18, and his
soap:4 must not make him pay 72 — weighting the settlement would let the
player mint gold out of an NPC's fondness. The weight enters only when a
surplus becomes goodwill.

settledGold is what the screen drops into a tray the moment you stage
something; dragging the balance off zero is the deliberate act.

Pure: imports only trade.js, takes item defs rather than ids, mutates
nothing.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: The goodwill curve

> **On the appended tests below:** ES module `import` statements hoist, so appending one mid-file
> works — but don't. Add the new names to the **existing** `import { … } from '../game/offer.js'`
> at the top of the file, then append only the `describe` block.

**Files:**
- Modify: `game/offer.js`
- Modify: `tests/offer.test.js`

Spec §4.2. Cheap early, dearer as they warm to you. Deterministic, no RNG. **The denominator is
`CEIL = max(100, flipThreshold ?? 30)`, not the threshold** — Puck is authored `flipThreshold: 0`, so
the threshold form would pin him at maximum cost forever.

- [ ] **Step 1: Write the failing test**

Append to `tests/offer.test.js`:

```js
import { dispositionCeil, costPerPoint, goodwillFor } from '../game/offer.js';

const KING = { type: 'Fungus King', disposition: -80, flipThreshold: 200, values: { soap: 20 } };

describe('the goodwill curve', () => {
  test('the ceiling is at least 100, and rises for a high threshold', () => {
    assert.equal(dispositionCeil(PUCK), 100, 'flipThreshold 0 must not drag the ceiling down');
    assert.equal(dispositionCeil(KING), 200);
    assert.equal(dispositionCeil({}), 100, 'a missing flipThreshold defaults to 30, so max(100,30)');
  });

  test('a point costs 1 GP at the floor and 5 GP at the ceiling', () => {
    assert.equal(costPerPoint(-100, 100), 1);
    assert.equal(costPerPoint(100, 100), 5);
    assert.equal(costPerPoint(0, 100), 3, 'halfway');
  });

  test('cost rises monotonically with disposition', () => {
    let prev = -Infinity;
    for (let d = -100; d <= 100; d += 5) {
      const c = costPerPoint(d, 100);
      assert.ok(c >= prev, `cost fell at d=${d}`);
      prev = c;
    }
  });

  test('the curve clamps outside its range instead of running away', () => {
    assert.equal(costPerPoint(-500, 100), 1);
    assert.equal(costPerPoint(500, 100), 5);
  });

  test('goodwill is deterministic — same input, same output, every time', () => {
    const a = goodwillFor(72, PUCK), b = goodwillFor(72, PUCK);
    assert.equal(a, b);
    assert.equal(a, 16, 'the spec worked example: 72 GP of surplus on Puck at +60');
  });

  test('goodwill rounds DOWN — you only get points you fully paid for', () => {
    assert.equal(goodwillFor(0, PUCK), 0);
    assert.equal(goodwillFor(1, PUCK), 0, 'a point costs 4.2 GP at +60; 1 GP buys none');
  });

  test('goodwill is monotonic in the surplus', () => {
    let prev = -1;
    for (let gp = 0; gp <= 200; gp += 7) {
      const pts = goodwillFor(gp, PUCK);
      assert.ok(pts >= prev, `points fell at ${gp} GP`);
      prev = pts;
    }
  });

  test('affection is cheap early — the Fungus King at -80 buys points for about 1 GP', () => {
    assert.ok(goodwillFor(10, KING) >= 7, 'ten gold should buy most of ten points down there');
  });

  test('a negative or nonsense surplus buys nothing', () => {
    assert.equal(goodwillFor(-50, PUCK), 0);
    assert.equal(goodwillFor(NaN, PUCK), 0);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
cd C:/Code/violencetown && node --test tests/offer.test.js
```

Expected: FAIL — `The requested module '../game/offer.js' does not provide an export named
'dispositionCeil'`.

- [ ] **Step 3: Write the minimal implementation**

Append to `game/offer.js`:

```js
// ── The curves ───────────────────────────────────────────────────────────────

export const DISPOSITION_MIN = -100;
const GUARD_ITERATIONS = 400;          // runaway guard; no real offer approaches it

// The top of this NPC's meter — and the denominator of both curves. At least
// 100, but a high flipThreshold raises it (the Fungus King is authored 200, and
// clamping him to 100 would make him permanently unflippable).
//
// `?? 30` is the default previewGive and applyDispositionDelta already use
// (give-action.js) — it must not silently disagree with the flip logic.
export function dispositionCeil(npc) {
    return Math.max(100, (npc && npc.flipThreshold) ?? 30);
}

function progress(d, ceil) {
    const span = ceil - DISPOSITION_MIN;
    if (!(span > 0)) return 1;
    return Math.max(0, Math.min(1, (d - DISPOSITION_MIN) / span));
}

// GP per point of goodwill. Rises as they warm to you: pleasing someone who
// already likes you costs more. 1 GP/pt at the floor, 5 at the ceiling.
export function costPerPoint(d, ceil) {
    return 1 + 4 * progress(d, ceil);
}

// How many points a surplus buys. Awarded one at a time so the rising cost
// applies across the climb, and rounded DOWN — you only get points you have
// fully paid for. (Resentment rounds the other way; see resentmentFor.)
export function goodwillFor(surplus, npc) {
    if (!(surplus > 0)) return 0;
    const ceil = dispositionCeil(npc);
    const d0 = dispositionOf(npc);
    let pool = surplus, pts = 0;
    while (pts < GUARD_ITERATIONS) {
        const c = costPerPoint(d0 + pts, ceil);
        if (pool < c) break;
        pool -= c; pts++;
    }
    return pts;
}
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
cd C:/Code/violencetown && node --test tests/offer.test.js
```

Expected: **0 failures**, and no previously-passing test now failing. The exact count is deliberately not gated: each task's review round adds tests, so a predicted number goes stale the moment it is written. `fail 0` plus a non-decreasing count is the gate.

- [ ] **Step 5: Commit**

```bash
cd C:/Code/violencetown && git add game/offer.js tests/offer.test.js && git commit -m "feat(offer): the goodwill curve — cheap early, dearer as they warm

Per the 2026-06-09 Outward research: 1 GP/pt at the floor rising to 5 at
the ceiling, deterministic, no RNG, rounded down so you only get points
you fully paid for.

The denominator is max(100, flipThreshold ?? 30), NOT the threshold.
Puck is authored flipThreshold: 0, so the threshold form clamps his
progress to 1 above zero disposition and pins him at maximum cost
forever. The ceiling form means 'affection gets harder the more they
already like you', which holds for every NPC, and it makes the meter's
display range and the curve's range one number.

?? 30 matches previewGive and applyDispositionDelta rather than
inventing a second default.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: The gold ceiling, and who gold does not work on

**Files:**
- Modify: `game/offer.js`
- Modify: `tests/offer.test.js`

Spec §4.3 and §4.5. Gold may never carry an NPC **across** an uncrossed `flipThreshold`; items may.
And `bribeable: false` means gold buys no affection at all — closing a live hole where
`_bribeVendor` never checks the flag even though `_bribeTarget` does.

> **Task 2 changed `goodwillFor`'s contract.** It now returns `{ points, unspent }`, mirroring
> `resentmentFor`'s `{ points, shortfall }` — `unspent` is surplus the NPC had no headroom left to
> feel. Read `.points` where you need the number, and carry `unspent` through so Task 5 can write the
> honest line when a gift buys nothing. Note also that `assert.equal` under `node:assert/strict` is
> reference equality for objects — use `assert.deepEqual` when comparing whole results.

- [ ] **Step 1: Write the failing test**

Append to `tests/offer.test.js`:

```js
import { splitGoodwill } from '../game/offer.js';

const GHOST = { type: 'Ghost Fungus', disposition: -50, flipThreshold: 60, bribeable: false, values: { bandage: 8 } };
const BOSS  = { type: 'Wererat' };   // no disposition, no flipThreshold, no bribeable — as authored

describe('the gold ceiling', () => {
  test('items and gold each contribute, and the total is their sum', () => {
    const r = splitGoodwill(PUCK, { itemValue: 36, gold: 30 });
    assert.equal(r.points, r.fromItems + r.fromGold);
    assert.equal(typeof r.unspent, 'number', 'unspent must be carried through from goodwillFor');
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
    // The Wererat has no bribeable flag, no flipThreshold and no disposition,
    // so T defaults to 30 and gold stops at 29 — short of the flip.
    const r = splitGoodwill(BOSS, { itemValue: 0, gold: 100000 });
    assert.ok(r.points <= 29, `gold bought ${r.points} points on an unauthored NPC`);
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
});
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
cd C:/Code/violencetown && node --test tests/offer.test.js
```

Expected: FAIL — no export named `splitGoodwill`.

- [ ] **Step 3: Write the minimal implementation**

Append to `game/offer.js`:

```js
// Goodwill, split by where it came from, because gold and gifts are bounded
// differently. Items climb the curve first (they are the clever path and are
// uncapped); gold climbs what is left, and may never carry an NPC ACROSS an
// uncrossed flipThreshold.
//
// This replaces the gold-weighting memo's proposed +30 per-encounter cap: it
// needs no persisted state and no bookkeeping, and it closes a hole the numeric
// cap would not — the Wererat boss has no bribeable flag, no flipThreshold and
// no disposition, so six +5 bribes at 10 GP each currently flip the sewer boss
// into an ally for 60 GP.
//
// bribeable:false zeroes the gold half outright. _bribeTarget respects that flag
// today but _bribeVendor never checks it, so the Ghost Fungus — the only NPC in
// the game authored bribeable:false — is bribeable through the trade window.
export function splitGoodwill(npc, { itemValue = 0, gold = 0 } = {}) {
    const d0 = dispositionOf(npc);
    // goodwillFor returns { points, unspent } as of Task 2 — surplus the NPC had
    // no headroom left to feel. Carry it through so resolveOffer can say so.
    const items = goodwillFor(itemValue, npc);

    if (npc && npc.bribeable === false) {
        // Gifts still land on someone who refuses bribes; only the gold is refused.
        // All of it — the refusal is the whole amount gold ASKED for. Not what it
        // could have bought: some of those points would have been ceiling-denied
        // anyway, so "could have bought" would overstate it on the only NPC this
        // branch ever fires for.
        const refused = goodwillFor(gold, { ...npc, disposition: d0 + items.points }).points;
        return { points: items.points, fromItems: items.points, fromGold: 0,
                 unspent: items.unspent, goldRefusedPoints: refused };
    }

    const rawT = (npc && npc.flipThreshold) ?? 30;
    // The third numeric door into this module, guarded like the other two.
    // An Infinity threshold would otherwise read as "no ceiling" and hand the
    // most unflippable NPC the freest gold — the intent exactly inverted.
    const threshold = Number.isFinite(rawT) ? rawT : 30;
    const afterItems = d0 + items.points;
    // Gold stops one point short of an uncrossed threshold. If they are already
    // at or above it there is no flip left to protect, so gold is unbounded.
    const goldCeiling = afterItems < threshold ? threshold - 1 : Infinity;

    const raw = goodwillFor(gold, { ...npc, disposition: afterItems });
    const allowed = goldCeiling === Infinity
        ? raw.points
        : Math.max(0, Math.min(raw.points, goldCeiling - afterItems));

    return {
        points: items.points + allowed,
        fromItems: items.points,
        fromGold: allowed,
        unspent: items.unspent + raw.unspent,
        // Points gold wanted to buy but the flip ceiling refused. Distinct from
        // `unspent` — that is "no room left to feel", this is "gold can't carry
        // him across his own threshold". They want different log lines. Suffixed
        // (unlike `unspent`/`shortfall`) because it has zero consumers to disturb —
        // the asymmetry itself signals "this one is points, not GP".
        goldRefusedPoints: Math.max(0, raw.points - allowed),
    };
}
```

> **Shipped shape (after review).** The block above is what landed. Two things moved during review and
> both matter to anyone extending it: `flipThreshold` is sanitized with `Number.isFinite` (an
> `Infinity` threshold otherwise reads as "no ceiling" and hands the most unflippable NPC the freest
> gold), and the field is `goldRefusedPoints` — numeric on **both** branches, suffixed because it is
> denominated in points while its neighbour `unspent` is denominated in GP.

- [ ] **Step 4: Run the test and watch it pass**

```bash
cd C:/Code/violencetown && node --test tests/offer.test.js
```

Expected: **0 failures**, and no previously-passing test now failing. The exact count is deliberately not gated: each task's review round adds tests, so a predicted number goes stale the moment it is written. `fail 0` plus a non-decreasing count is the gate.

- [ ] **Step 5: Commit**

```bash
cd C:/Code/violencetown && git add game/offer.js tests/offer.test.js && git commit -m "feat(offer): gold buys you to the doorstep, never through it

Gold-sourced goodwill may never carry an NPC across an uncrossed
flipThreshold; item-sourced goodwill may. That is a structural ceiling
rather than the gold-weighting memo's proposed +30 per-encounter cap: no
persisted state, no bookkeeping, and it encodes the memo's actual intent
('gifts stay the cheap clever path, raw gold is the pricey universal
one') more directly than a number.

It also closes a live exploit the numeric cap would not. The Wererat
boss has no bribeable flag, no flipThreshold and no disposition, so six
+5 bribes at 10 GP flip the sewer boss into an ally for 60 GP. T now
defaults to 30 and gold stops at 29.

And bribeable:false finally means something on this path. _bribeTarget
respects the flag; _bribeVendor never checks it, so the Ghost Fungus —
the only NPC in the game authored bribeable:false — is bribeable through
the trade window today. Gifts still land on them; only gold is refused.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Resentment — the bad deal

**Files:**
- Modify: `game/offer.js`
- Modify: `tests/offer.test.js`

Spec §4.4. The mirror of Task 2. Bounded twice — at most 25 points per offer, never below −25 — and
it rounds **up** against the player, where goodwill rounds down.

- [ ] **Step 1: Write the failing test**

Append to `tests/offer.test.js`:

```js
import { RESENT_MAX_PER_OFFER, RESENT_FLOOR, goodwillCostPerPoint, resentCostPerPoint, resentmentFor } from '../game/offer.js';

describe('resentment — bad deals are a move, not an error', () => {
  test('the bounds are the specced constants', () => {
    assert.equal(RESENT_MAX_PER_OFFER, 25);
    assert.equal(RESENT_FLOOR, -25);
  });

  test('the resentment curve is the goodwill curve mirrored', () => {
    for (const d of [-100, -50, 0, 50, 100]) {
      assert.equal(resentCostPerPoint(d, 100), 6 - goodwillCostPerPoint(d, 100),
        `curves are not mirrored at d=${d}`);
    }
  });

  test('betrayal is cheaper than affection when they like you', () => {
    assert.ok(resentCostPerPoint(60, 100) < goodwillCostPerPoint(60, 100));
  });

  test('and dearer than affection when they do not', () => {
    assert.ok(resentCostPerPoint(-80, 100) > goodwillCostPerPoint(-80, 100));
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
    for (let i = 0; i < 25; i++) gp += resentCostPerPoint(60 - i, 100);
    assert.equal(Math.round(gp), 51);
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

  test('resentmentFor never mutates the npc it is handed', () => {
    const before = { ...PUCK };
    resentmentFor(200, PUCK);
    assert.deepEqual(PUCK, before);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
cd C:/Code/violencetown && node --test tests/offer.test.js
```

Expected: FAIL — no export named `RESENT_MAX_PER_OFFER`.


> **Non-finite guard — inherit it, do not re-open it.** Task 2's review found that a `NaN`
> disposition made `goodwillFor` run to its iteration cap and pay out the *maximum* goodwill
> instead of zero, because `pool < NaN` is always false. `dispositionOf` now sanitizes non-finite
> values to 0, and the loop breaks on a non-finite cost. `resentmentFor` below has the same loop
> shape and the same hazard.

- [ ] **Step 3: Write the minimal implementation**

Append to `game/offer.js`:

```js
// ── Resentment: the bad deal ─────────────────────────────────────────────────
//
// A negative balance is NOT a refusal. It is an offer the NPC will take while
// thinking less of you, which is what makes the balance a two-way lever rather
// than a wall.

export const RESENT_MAX_PER_OFFER = 25;   // one offer's worst possible damage
export const RESENT_FLOOR = -25;          // bad dealing never drags anyone below this

// GP of shortfall per point of resentment — costPerPoint mirrored. It costs LESS
// to disappoint someone who already likes you and MORE to offend someone who
// already doesn't, because they are braced for it. That asymmetry is the design:
// betrayal runs ~2.3x cheaper than affection at Puck's +60, while at the bottom
// the system self-stabilises instead of spiralling.
export function resentCostPerPoint(d, ceil) {
    return 5 - 4 * progress(d, ceil);
}

// What a deficit costs. Returns { points, shortfall } where points is NEGATIVE
// and shortfall is the GP the NPC's remaining patience could not absorb —
// anything above zero means they will not take the deal at all.
//
// Rounds UP against the player: any remaining shortfall, however small, costs
// one more whole point. Goodwill rounds DOWN. Both directions round in the NPC's
// favour. Rounding down here instead refuses almost every bad deal over a
// fractional remainder.
export function resentmentFor(deficit, npc) {
    if (!(deficit > 0)) return { points: 0, shortfall: 0 };
    const d0 = dispositionOf(npc);
    if (d0 <= RESENT_FLOOR) return { points: 0, shortfall: deficit };

    const ceil = dispositionCeil(npc);
    const room = Math.min(RESENT_MAX_PER_OFFER, d0 - RESENT_FLOOR);
    let pool = deficit, pts = 0;
    while (pool > 0 && pts < room) {
        pool -= resentCostPerPoint(d0 - pts, ceil);
        pts++;
    }
    return { points: -pts, shortfall: Math.max(0, pool) };
}
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
cd C:/Code/violencetown && node --test tests/offer.test.js
```

Expected: **0 failures**, and no previously-passing test now failing. The exact count is deliberately not gated: each task's review round adds tests, so a predicted number goes stale the moment it is written. `fail 0` plus a non-decreasing count is the gate.

- [ ] **Step 5: Commit**

```bash
cd C:/Code/violencetown && git add game/offer.js tests/offer.test.js && git commit -m "feat(offer): bad deals — a deficit is a choice, not a refusal

The mirror of the goodwill curve: 5 GP/pt at the floor falling to 1 at
the ceiling, so it costs less to disappoint someone who already likes
you and more to offend someone who already doesn't. Betrayal runs ~2.3x
cheaper than affection at Puck's +60; at the bottom it inverts and the
system self-stabilises instead of spiralling.

Bounded twice, and the bounds close the loop on each other: at most 25
points per offer, never below -25 total. At the floor there is no
resentment left to absorb a deficit, so the lowball lever stops being
offered rather than becoming a free lunch. -25 sits above TRADE_FLOOR of
-50, so a bad dealer is never locked out of a shop.

Rounds UP against the player where goodwill rounds down — both in the
NPC's favour. Rounding down instead refuses almost every bad deal over a
fractional remainder: a -29 GP lowball absorbs 14 points at ~27 GP and
then bounces on the leftover 2.

Verified figures: 29 GP shortfall costs Puck 15 points; dropping him the
full 25 costs 51 GP.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: `resolveOffer` — the whole projection in one call

**Files:**
- Modify: `game/offer.js`
- Modify: `tests/offer.test.js`

The single function the renderer and `main.js` both call. Everything the screen shows — the balance,
the projected disposition, the meter's ghost segment, the ledger warning — comes out of here, so what
the player was shown and what actually happens cannot diverge.

> **Return-shape note from Task 1's review.** `offerBalance` returns `givenItemsValue` (a GP total,
> renamed from `itemsGiven` because the old name read as a count) and a `giftValue` that does **not**
> fold gold in. So `avgWeight` is a plain `giftValue / givenItemsValue` — an earlier draft added the
> gold in one place only to subtract it back out in the other. Use `dispositionOf(npc)` rather than
> repeating `(npc && npc.disposition) ?? 0`.

**Surplus attribution.** Gold in the tray pays the bill first; whatever is left is the surplus. The
item share of that surplus is amplified by the average weight of the items given
(`giftValue / itemsGiven`), so the weighting applies to generosity and never to settlement.

> **Two accounting seams Task 3's review left for you. Neither is optional.**
>
> **1. `unspent` arrives in two different currencies.** You pass
> `itemValue: itemSurplus * avgWeight` (gift-*weighted* value) and `gold: goldSurplus` (plain GP), so
> `splitGoodwill` sums an `unspent` whose two halves are denominated differently. The result is
> neither GP nor weighted units, while the field is documented as the mirror of `shortfall`, which is
> GP. If a log line ever prints it as gold it will be wrong whenever a gift is involved. Either
> divide the item half back out by `avgWeight` before reporting, or rename what you forward so the
> unit is honest.
>
> **2. Gold spent on ceiling-refused points vanishes.** For `{ gold: 100000 }` on a bribeable Fungus:
> 335.72 GP bought the 109 allowed points, 99476.5 comes back as `unspent`, and **187.78 GP is in
> neither field** — it is what the curve charged for the 41 points the ceiling then refused. Sharpest
> right at the doorstep: `{ disposition: 59, flipThreshold: 60 }` with `gold: 500` yields
> `points: 0, unspent: 312.22`, so the player handed over 500 GP, got nothing, and the honest line can
> only account for 312 of it. Decide whether `resolveOffer` reports that third bucket or folds it into
> `unspent`; do not leave it unaccounted.
>
> **3. `goldRefusedPoints` currently has no consumer.** `resolveOffer` as drafted drops it, and no
> later task reads it. It is the only field that can say "he took your gold and it moved him nothing
> because it cannot carry him across his own threshold" — a distinct situation from "no room left to
> feel". Forward it, or delete it from `splitGoodwill` entirely. Three review rounds have now argued
> about a field nothing reads; end that here.

- [ ] **Step 1: Write the failing test**

Add `resolveOffer` to the existing `../game/offer.js` import, then append:

```js
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
    assert.equal(r.refused, false);
  });

  test('a lowball bigger than his patience is refused', () => {
    const r = resolveOffer(PUCK, { give: [], take: [{ def: BANDAGE, count: 20 }], gold: 0 });
    assert.equal(r.points, -RESENT_MAX_PER_OFFER);
    assert.equal(r.refused, true);
    assert.ok(r.shortfall > 0);
  });

  test('an empty offer is inert', () => {
    const r = resolveOffer(PUCK, emptyOffer());
    assert.equal(r.points, 0);
    assert.equal(r.refused, false);
  });

  test('resolveOffer mutates neither the npc nor the offer', () => {
    const npc = { ...PUCK };
    const offer = { give: [{ def: SOAP, count: 2 }], take: [], gold: 0 };
    const snapshot = JSON.stringify({ npc, offer });
    resolveOffer(npc, offer);
    assert.equal(JSON.stringify({ npc, offer }), snapshot);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
cd C:/Code/violencetown && node --test tests/offer.test.js
```

Expected: FAIL — `does not provide an export named 'resolveOffer'`.

- [ ] **Step 3: Write the minimal implementation**

Append to `game/offer.js`:

```js
// ── The projection ───────────────────────────────────────────────────────────
//
// One call, everything the screen needs. Both the renderer (to draw the meter's
// ghost segment and the ledger) and main.js (to commit) go through here, so what
// the player was shown and what actually happens can never diverge.
export function resolveOffer(npc, offer) {
    const o = offer || emptyOffer();
    const bal = offerBalance(npc, o);
    const d0 = dispositionOf(npc);
    const goldGiven = Math.max(0, Math.trunc(o.gold || 0));

    if (bal.balance === 0) {
        return { ...bal, points: 0, fromItems: 0, fromGold: 0, projected: d0, shortfall: 0, refused: false };
    }

    if (bal.balance > 0) {
        // Gold pays the bill first; what's left over is the surplus. The item
        // share of it is amplified by the average weight of what was given, so
        // generosity is weighted and settlement never is.
        const goldSurplus = Math.max(0, goldGiven - bal.takenValue);
        const itemSurplus = Math.max(0, bal.balance - goldSurplus);
        const avgWeight = bal.givenItemsValue > 0 ? bal.giftValue / bal.givenItemsValue : 1;
        const g = splitGoodwill(npc, { itemValue: itemSurplus * avgWeight, gold: goldSurplus });
        // `unspent` is goodwill's mirror of resentment's `shortfall`: surplus the NPC
        // had no room left to feel. Without it, gifting someone who already adores
        // you shows +0 and looks broken, with no way to write the honest line.
        return { ...bal, points: g.points, fromItems: g.fromItems, fromGold: g.fromGold,
                 projected: d0 + g.points, shortfall: 0, unspent: g.unspent,
                 goldRefusedPoints: g.goldRefusedPoints, refused: false };
    }

    const r = resentmentFor(-bal.balance, npc);
    return { ...bal, points: r.points, fromItems: 0, fromGold: 0,
             projected: d0 + r.points, shortfall: r.shortfall, refused: r.shortfall > 0 };
}
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
cd C:/Code/violencetown && node --test tests/offer.test.js
```

Expected: **0 failures**, and no previously-passing test now failing. The exact count is deliberately not gated: each task's review round adds tests, so a predicted number goes stale the moment it is written. `fail 0` plus a non-decreasing count is the gate.

- [ ] **Step 5: Commit**

```bash
cd C:/Code/violencetown && git add game/offer.js tests/offer.test.js
git commit -m "feat(offer): resolveOffer, one call for the whole projection"
```

Use this as the commit body (paste after the subject line):

```
Both the renderer (meter ghost segment, ledger) and main.js (the commit)
go through this, so what the player was shown and what actually happens
cannot diverge.

Surplus attribution: gold pays the bill first, what remains is the
surplus, and the item share of it is amplified by the average weight of
what was given. That keeps the values weight on generosity and off
settlement -- selling soap at the asking price moves nothing, handing
the same soap over free moves +16.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Task 6: Staging, and the reasons an offer cannot be made

**Files:**
- Modify: `game/offer.js`
- Modify: `tests/offer.test.js`

Every refusal is a stated sentence, never a silent no-op. Spec §5.4 and §4.5.

- [ ] **Step 1: Write the failing test**

Add `stage`, `unstage` and `commitBlocker` to the import, then append:

```js
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

  test('...but the give tray still works below the floor, so he can be won round', () => {
    const hostile = { ...PUCK, disposition: -80 };
    const o = { give: [{ def: SOAP, count: 2 }], take: [], gold: 0 };
    assert.equal(commitBlocker(hostile, o, ctx), null);
  });

  test('an unabsorbable lowball is refused with a reason', () => {
    const o = { give: [], take: [{ def: BANDAGE, count: 20 }], gold: 0 };
    assert.match(commitBlocker(PUCK, o, ctx), /WON'T TAKE ANOTHER BAD DEAL/);
  });

  test('an untracked NPC cannot be shortchanged', () => {
    const untracked = { type: 'Violencian' };   // disposition undefined, not 0
    const o = { give: [], take: [{ def: BANDAGE, count: 1 }], gold: 0 };
    assert.match(commitBlocker(untracked, o, ctx), /CAN'T BE SHORTCHANGED/);
  });

  test('a container cannot be shortchanged either', () => {
    const chest = { type: 'Chest', disposition: 100, _container: true };
    const o = { give: [], take: [{ def: BANDAGE, count: 1 }], gold: 0 };
    assert.match(commitBlocker(chest, o, { ...ctx, isContainer: true }), /CAN'T BE SHORTCHANGED/);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
cd C:/Code/violencetown && node --test tests/offer.test.js
```

Expected: FAIL — `does not provide an export named 'stage'`.

- [ ] **Step 3: Write the minimal implementation**

First widen the `trade.js` import at the top of `game/offer.js`:

```js
import { band, buyPrice, sellPrice, canTrade } from './trade.js';
```

Then append:

```js
// ── Staging ──────────────────────────────────────────────────────────────────
//
// Immutable: every call returns a NEW offer, so the screen re-derives from the
// return value and a stale reference can never draw a stale basket.
//
// Entries key off their SOURCE, not their item id, so the same item sitting in
// two bag slots stages as two entries and un-staging one leaves the other alone.
function sameEntry(a, b) {
    if (a.def !== b.def) return false;
    if ('slot' in b) return a.slot === b.slot;
    return a.source === b.source && a.index === b.index;
}

export function stage(offer, side, entry) {
    const o = offer || emptyOffer();
    const list = (o[side] || []).map(e => ({ ...e }));
    const hit = list.find(e => sameEntry(e, entry));
    if (hit) hit.count += 1;
    else list.push({ ...entry, count: 1 });
    return { ...o, [side]: list };
}

export function unstage(offer, side, index) {
    const o = offer || emptyOffer();
    const list = (o[side] || []).map(e => ({ ...e }));
    const e = list[index];
    if (!e) return o;
    e.count -= 1;
    if (e.count <= 0) list.splice(index, 1);
    return { ...o, [side]: list };
}

// ── Refusals ─────────────────────────────────────────────────────────────────
//
// null when the offer can be made, else a short uppercase sentence the ledger
// bar shows on the disabled button. Never a silent no-op: the player is always
// told why, and always before an item is spent.
//
// Order matters — the most fundamental reason wins, so the message stays true.
export function commitBlocker(npc, offer, ctx = {}) {
    const o = offer || emptyOffer();
    const staged = (o.give || []).length + (o.take || []).length + (o.gold ? 1 : 0);
    if (!staged) return 'NOTHING STAGED';

    const gold = o.gold || 0;
    const playerGold = ctx.playerGold ?? 0;
    if (gold > playerGold) return `YOU'RE ${gold - playerGold} GP SHORT`;

    const owedToPlayer = Math.max(0, -gold);
    const npcGold = ctx.npcGold ?? 0;
    if (owedToPlayer > npcGold) return `HIS TILL IS ${owedToPlayer - npcGold} GP SHORT`;

    // The floor gates TAKING, not giving — a hostile NPC is a puzzle, not a wall.
    // You can always gift or bribe your way back up to where he'll deal, in the
    // same sitting. (Options narrowed, never removed.)
    const takingSomething = (o.take || []).length > 0 || gold < 0;
    if (takingSomething && !canTrade(dispositionOf(npc))) return "HE WON'T DEAL";

    if (offerBalance(npc, o).balance < 0) {
        const noResentment = !npc || npc.disposition == null || npc._container || ctx.isContainer;
        if (noResentment) return "HE CAN'T BE SHORTCHANGED";
        if (resolveOffer(npc, o).refused) return "HE WON'T TAKE ANOTHER BAD DEAL";
    }
    return null;
}
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
cd C:/Code/violencetown && node --test tests/offer.test.js
```

Expected: **0 failures**, and no previously-passing test now failing. The exact count is deliberately not gated: each task's review round adds tests, so a predicted number goes stale the moment it is written. `fail 0` plus a non-decreasing count is the gate.

- [ ] **Step 5: Run the whole suite — nothing else may have moved**

```bash
cd C:/Code/violencetown && npm test 2>&1 | tail -8
```

Expected: **`fail 0`**, and the total no lower than the previous task's. The 404-test baseline predates this branch; everything above it is this file.

- [ ] **Step 6: Commit**

```bash
cd C:/Code/violencetown && git add game/offer.js tests/offer.test.js
git commit -m "feat(offer): immutable staging, and a stated reason for every refusal"
```

Body:

```
Staging returns a new offer every time, so the screen re-derives from
the return value and a stale reference cannot draw a stale basket.
Entries key off their SOURCE rather than their item id, so the same item
in two bag slots stages twice and un-staging one leaves the other.

commitBlocker returns null or a short sentence for the disabled button.
Never a silent no-op -- the player is always told why, always before an
item is spent. The trade floor gates TAKING but not giving, so a hostile
NPC is a puzzle rather than a wall: you can gift your way back up to
where he will deal, in the same sitting.

The NPC's till is checked before commit rather than discovered during
it; transferGold returning false must never surface mid-transaction.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

---

## Task 6a: Split `offer.js` at the curves seam

**Files:**
- Create: `game/disposition-curves.js`
- Modify: `game/offer.js`, `tests/offer.test.js`

**Do this immediately after Task 6 and before Task 9.** The timing is the whole point, and it is not
arbitrary.

`game/offer.js` holds two responsibilities with a one-way dependency between them: *what is this
basket worth* (`emptyOffer`, `unitCount`, `giftWeight`, `offerBalance`, `settledGold`, plus Tasks 5–6)
and *what does an imbalance do to a relationship* (`progress`, both cost curves, `goodwillFor`,
`splitGoodwill`, `resentmentFor`). The only edge between them is `dispositionOf`. The `// ── The
curves ──` banner already marks the seam.

**Why not now:** Tasks 5 and 6 both append to this file, and CLAUDE.md forbids restructuring a core
file that unmerged work is about to rewrite.

**Why not later:** today `offer.js` has exactly **one** importer — the test file, one import line.
Tasks 7 and 8 touch `weapons.js`/`main.js` and `layout.js`, neither of which imports it, so waiting
for them buys nothing. But Tasks 9–11 add `renderer.js` import sites for `goodwillCostPerPoint` and
`resentmentCostPerPoint`. Split before those exist and they get written against the final layout;
split after and you rewrite them. **The window between Task 6 and Task 9 is the cheapest this split
will ever be, and it only gets more expensive.**

- [ ] **Step 1: Check for overlapping unmerged work first** — it is still a core-file restructure.

```bash
cd C:/Code/violencetown && git branch --no-merged dev
```

- [ ] **Step 2: Move the curves block** — everything from the `// ── The curves ──` banner through
`resentmentFor` — into `game/disposition-curves.js`, plus `dispositionOf` (the single shared edge)
and `DISPOSITION_MIN`. The new module imports nothing.

- [ ] **Step 3: `offer.js` imports what it needs** from `./disposition-curves.js` and re-exports
nothing it does not use.

- [ ] **Step 4: Split the test file to match**, keeping each describe block with the module it tests.

- [ ] **Step 5: Run the suite.** Behaviour-preserving: `fail 0`, count unchanged.

- [ ] **Step 6: Commit** as a pure move, so the diff reads as a rename rather than a rewrite.

---

## Task 7: Weapons become first-class tradeable items

**Files:**
- Modify: `game/weapons.js`
- Modify: `game/main.js` (`_takeItemAt`, around line 2924)
- Create: `tests/weapons-tradeable.test.js`

Spec §9 items 3 and 4. The five `WEAPONS` entries carry no `baseValue`, `description`, `category` or
`tier`, so `sellPrice` returns `null` for every one and `buyPrice` returns 1 GP. On a screen where
every row shows a value and a description, that is not survivable.

Fixing it kills a live bug in passing: `_takeItemAt` does `ITEMS[gi.type]` and, on a miss, **splices
the item off the floor and returns with no log.** Three weapons are authored as ground items —
`lion_whip` (circus), `fearmur` (graveyard), `gator_tail` (sewer) — so taking any of them destroys
it silently today.

- [ ] **Step 1: Write the failing test**

Create `tests/weapons-tradeable.test.js`:

```js
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
```

That last one is a source-shape assertion rather than a behavioural one, because `_takeItemAt` is a
`Game` method needing a live world. `tests/content-integrity.test.js` already establishes the
read-the-file-off-disk pattern in this suite, so this is in-house style rather than a new one.

- [ ] **Step 2: Run it and watch it fail**

```bash
cd C:/Code/violencetown && node --test tests/weapons-tradeable.test.js
```

Expected: FAIL on both describes — `wooden_sword has no baseValue`, and the bare-lookup assertion.

- [ ] **Step 3: Give every weapon the missing fields**

Open `game/weapons.js`. Add `baseValue` and `description` to each of the five entries, keeping every
existing field untouched. Pick each `baseValue` to sit sensibly against `VALUE_TIERS`' derived
cutoffs (3 / 9 / 24 / 59 → grey / green / blue / purple / orange) given that weapon's `damage`: a
starter blade should read common-to-uncommon, a boss drop epic.

```js
    wooden_sword: {
        // ...every existing field unchanged...
        baseValue: 8,
        description: 'A practice blade, all splinters and optimism. Swings true enough.',
    },
```

For the descriptions: read three existing `ITEMS` descriptions first and match the voice — physical
detail plus a wry closing line, 50–160 characters. Describe the object in hand only; do not invent
lore about places or characters.

- [ ] **Step 4: Fix `_takeItemAt`**

In `game/main.js`, inside `_takeItemAt`, replace the bare lookup and its silent early return:

```js
        const itemDef = ITEMS[gi.type];
        if (!itemDef) { this.groundItems.splice(idx, 1); return; }
```

with a resolving lookup that refuses to delete what it cannot identify:

```js
        // Resolve through _resolveItemDef so WEAPONS are found too. The old bare
        // ITEMS[gi.type] silently spliced anything it couldn't resolve off the
        // floor with no log — which destroyed the lion_whip, the fearmur and the
        // gator_tail on contact. Leave an unresolvable item where it lies, and say so.
        const itemDef = this._resolveItemDef(gi.type);
        if (!itemDef) {
            this._log(`[Whatever that is, it won't come loose.]`);
            return;
        }
```

- [ ] **Step 5: Run the test and the suite, and watch both pass**

```bash
cd C:/Code/violencetown && node --test tests/weapons-tradeable.test.js && npm test 2>&1 | tail -6
```

Expected: the file PASSes 5 tests; the suite reports `fail 0`.

- [ ] **Step 6: Verify in the browser that the whip survives being picked up**

Start the dev server, then in the console drive the game to the circus and take the `lion_whip`.
Confirm it enters the bag rather than vanishing.

```bash
python C:\Code\violencetown\dev-server.py 3001
```

- [ ] **Step 7: Commit**

```bash
cd C:/Code/violencetown && git add game/weapons.js game/main.js tests/weapons-tradeable.test.js
git commit -m "fix: weapons are real items -- priced, described, no longer deleted"
```

Body:

```
The five WEAPONS entries had no baseValue, description, category or
tier, so sellPrice returned null for every one of them and buyPrice
returned 1 GP. On a screen where every row shows a value and a
description that is not survivable.

Fixing it kills a live bug in passing. _takeItemAt did ITEMS[gi.type]
and, on a miss, spliced the item off the floor and returned with NO LOG
-- so walking up and taking the lion_whip, the fearmur or the gator_tail
destroyed them silently. It now resolves through _resolveItemDef and
leaves anything it cannot identify where it lies, with a line.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Task 8: `offerLayout()` — every rect, once

**Files:**
- Modify: `game/layout.js`
- Create: `tests/offer-layout.test.js`

Spec §5. These numbers are **not guesses** — they come from `game/_design-offer.html`, which renders
this layout at 608×608 against the real VT323 metrics and prints a pass/fail fit report. Every value
below is one the preview verified.

Match the **4-space** indentation of the device/trade/equip block you are adding beside, and the
file's **CRLF** line endings.

### The overlap invariant is per-group, not global

An earlier draft of the spec asserted "no two hit-testable rects overlap once expanded by
`HIT_SLOP`". That is impossible for anything tiled — two adjacent 40px rows expanded by 6 each
necessarily overlap by 12. The correct pair of assertions:

1. **Siblings inside a tiled group** (list rows, tray slots) tile exactly at **zero** slop. Slop
   between siblings would be ambiguous anyway — which row did the tap mean?
2. **Across groups** (a list vs a tray vs the button vs the ✕ chip) nothing overlaps once expanded
   by `HIT_SLOP`. Slop is a group-boundary affordance, not an inter-sibling one.

That in turn forces a real constraint: **the gutter between the two columns must exceed
`2 × HIT_SLOP`.** At an 8px gutter the columns' expanded hit rects met inside the gap and a tap 4px
into the gutter was ambiguous. Hence 264-wide columns with a 16px gutter.

- [ ] **Step 1: Write the failing test**

Create `tests/offer-layout.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MODAL_RECT, HIT_SLOP, offerLayout, closeButtonRect, rectsOverlap, expandRect,
} from '../game/layout.js';

const PANEL = MODAL_RECT;
const inPanel = (r) =>
  r.x >= PANEL.x && r.y >= PANEL.y &&
  r.x + r.w <= PANEL.x + PANEL.w && r.y + r.h <= PANEL.y + PANEL.h;

test('MODAL_RECT is the proven {24,44,560,520} bezel', () => {
  assert.deepEqual(MODAL_RECT, { x: 24, y: 44, w: 560, h: 520 });
});

test('offerLayout survives being called with no game at all', () => {
  const L = offerLayout(PANEL, null);
  assert.ok(L.theirs.length > 0 && L.yours.length > 0);
});

test('every rect offerLayout returns sits inside the panel', () => {
  const L = offerLayout(PANEL, null);
  const all = [
    ...L.theirs, ...L.yours, ...L.giveTray, ...L.takeTray,
    L.meterBar, L.desc, L.button, L.theirsScroll, L.yoursScroll,
  ];
  for (const r of all) assert.ok(inPanel(r), `rect escapes the panel: ${JSON.stringify(r)}`);
});

test('siblings inside a tiled group never overlap at zero slop', () => {
  const L = offerLayout(PANEL, null);
  for (const [name, group] of Object.entries({
    theirs: L.theirs, yours: L.yours, giveTray: L.giveTray, takeTray: L.takeTray,
  })) {
    for (let i = 1; i < group.length; i++) {
      assert.ok(!rectsOverlap(group[i - 1], group[i]), `${name} ${i - 1} and ${i} overlap`);
    }
  }
});

test('no cross-group hit rects overlap once expanded by HIT_SLOP', () => {
  const L = offerLayout(PANEL, null);
  const groups = {
    theirs: L.theirs, yours: L.yours, giveTray: L.giveTray, takeTray: L.takeTray,
    controls: [L.button, closeButtonRect(PANEL)],
  };
  const names = Object.keys(groups);
  for (let a = 0; a < names.length; a++) {
    for (let b = a + 1; b < names.length; b++) {
      for (const ra of groups[names[a]]) {
        for (const rb of groups[names[b]]) {
          assert.ok(!rectsOverlap(expandRect(ra, HIT_SLOP), expandRect(rb, HIT_SLOP)),
            `${names[a]} overlaps ${names[b]} under HIT_SLOP`);
        }
      }
    }
  }
});

test('the gutter between the columns exceeds 2 x HIT_SLOP', () => {
  const L = offerLayout(PANEL, null);
  const leftRight = L.theirs[0].x + L.theirs[0].w;
  const gutter = L.yours[0].x - leftRight;
  assert.ok(gutter > 2 * HIT_SLOP,
    `gutter ${gutter} must exceed ${2 * HIT_SLOP} or taps in the gap are ambiguous`);
});

test('the two lists are the same shape, side by side', () => {
  const L = offerLayout(PANEL, null);
  assert.equal(L.theirs.length, L.yours.length);
  for (let i = 0; i < L.theirs.length; i++) {
    assert.equal(L.theirs[i].y, L.yours[i].y, `row ${i} is not level across the columns`);
    assert.equal(L.theirs[i].w, L.yours[i].w);
  }
});

test('the lists sit below the meter and above the trays', () => {
  const L = offerLayout(PANEL, null);
  assert.ok(L.theirs[0].y > L.meterBar.y + L.meterBar.h, 'lists collide with the meter');
  const lastRow = L.theirs[L.theirs.length - 1];
  assert.ok(L.giveTray[0].y >= lastRow.y + lastRow.h, 'trays collide with the lists');
});

test('the description strip sits below the trays and above the ledger', () => {
  const L = offerLayout(PANEL, null);
  const lastSlot = L.giveTray[L.giveTray.length - 1];
  assert.ok(L.desc.y >= lastSlot.y + lastSlot.h, 'description collides with the trays');
  assert.ok(L.ledgerY >= L.desc.y + L.desc.h, 'ledger collides with the description');
});

test('the hint line clears the panel bottom', () => {
  const L = offerLayout(PANEL, null);
  assert.ok(L.hintY + 12 <= PANEL.y + PANEL.h, 'the key legend hangs off the panel');
});

test('the tab strip is absent — this screen has no tabs', () => {
  const L = offerLayout(PANEL, null);
  assert.equal(L.tabs, undefined, 'trade and give are one function; there is nothing to tab between');
});

test('scroll thumbs sit at the inner right edge of their own column', () => {
  const L = offerLayout(PANEL, null);
  assert.ok(L.theirsScroll.x > L.theirs[0].x, 'thumb is not inside its column');
  assert.ok(L.theirsScroll.x + L.theirsScroll.w <= L.theirs[0].x + L.theirs[0].w + 0.5);
  assert.ok(L.yoursScroll.x + L.yoursScroll.w <= L.yours[0].x + L.yours[0].w + 0.5);
});

test('ROWS_VISIBLE rows of 40px is what the band budget affords', () => {
  const L = offerLayout(PANEL, null);
  assert.equal(L.theirs.length, 6);
  assert.equal(L.theirs[0].h, 40);
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd C:/Code/violencetown && node --test tests/offer-layout.test.js
```

Expected: FAIL — `does not provide an export named 'MODAL_RECT'`.

- [ ] **Step 3: Add `MODAL_RECT` and `offerLayout` to `game/layout.js`**

`LOG_MODAL_RECT`, `TRADE_MODAL_RECT`, `EQUIPMENT_MODAL_RECT` and `DEVICE_RECT` are four separate
literals of the identical `{24,44,560,520}` bezel today. Add the shared constant beside them and
point the existing four at it — a mechanical change no test should notice:

```js
// The one modal bezel. LOG_MODAL_RECT, TRADE_MODAL_RECT, EQUIPMENT_MODAL_RECT and
// DEVICE_RECT were four separate literals of this identical rect; they now alias
// it, so the panel can be retuned in one place.
export const MODAL_RECT = { x: 24, y: 44, w: 560, h: 520 };
```

Then, at the end of the file, add the layout function. Note the second `game` argument and its
defensive null-guards, matching `deviceRingsLayout` — that is what lets a node test call it with
`null`.

```js
// ── The unified offer screen ─────────────────────────────────────────────────
//
// One panel: a header with the disposition meter, two scrolling goods lists, the
// give/take trays, an always-populated description strip, and the ledger bar.
// renderer._drawOfferScreen (draw) and main._tapOffer (hit-test) read this SAME
// function, so a row's tap zone can never drift from where it was painted.
//
// The numbers come from game/_design-offer.html, which renders this at 608x608
// against real VT323 metrics and prints a fit report. Non-overlap is pinned by
// tests/offer-layout.test.js — and note the invariant there is PER-GROUP:
// siblings tile exactly at zero slop, only cross-group rects get HIT_SLOP.
// That forces the column gutter to exceed 2 * HIT_SLOP; at 8px the two columns'
// tap zones met inside the gap.
export const OFFER_ROWS_VISIBLE = 6;
export const OFFER_ROW_H = 40;
export const OFFER_TRAY_SLOTS = 6;

export function offerLayout(panelRect, game) {
    const P = panelRect || MODAL_RECT;
    const px = P.x + 8, pr = P.x + P.w - 8;
    const colW = 264, gutter = 16;          // gutter MUST exceed 2 * HIT_SLOP
    const leftX = px, rightX = px + colW + gutter;

    const listY = 146;
    const rows = (ox) => Array.from({ length: OFFER_ROWS_VISIBLE }, (_, i) => ({
        x: ox, y: listY + i * OFFER_ROW_H, w: colW, h: OFFER_ROW_H,
    }));
    const trayY = 404;
    const tray = (ox) => Array.from({ length: OFFER_TRAY_SLOTS }, (_, i) => ({
        x: ox + i * 42, y: trayY, w: 36, h: 36,
    }));
    const listH = OFFER_ROWS_VISIBLE * OFFER_ROW_H;

    return {
        panel: P,
        meterBar:     { x: px, y: 104, w: 320, h: 12 },
        colHeadY:     138,
        theirs:       rows(leftX),
        yours:        rows(rightX),
        theirsScroll: { x: leftX + colW - 5,  y: listY, w: 3, h: listH },
        yoursScroll:  { x: rightX + colW - 5, y: listY, w: 3, h: listH },
        trayLabelY:   390,
        giveTray:     tray(leftX),
        takeTray:     tray(rightX),
        desc:         { x: px, y: 444, w: pr - px, h: 54 },
        ledgerY:      508,
        button:       { x: 420, y: 506, w: 156, h: 40 },
        hintY:        550,
        close:        closeButtonRect(P),
        rowsVisible:  OFFER_ROWS_VISIBLE,
    };
}
```

- [ ] **Step 4: Run the layout test and watch it pass**

```bash
cd C:/Code/violencetown && node --test tests/offer-layout.test.js
```

Expected: **0 failures**, and no previously-passing test now failing. The exact count is deliberately not gated: each task's review round adds tests, so a predicted number goes stale the moment it is written. `fail 0` plus a non-decreasing count is the gate.

- [ ] **Step 5: Run the whole suite — the `MODAL_RECT` aliasing must be invisible**

```bash
cd C:/Code/violencetown && npm test 2>&1 | tail -8
```

Expected: `fail 0`. `tests/device-layout.test.js` hard-asserts
`deepEqual(DEVICE_RECT, {x:24,y:44,w:560,h:520})` — aliasing keeps that true. If it fails, you
changed a value rather than aliasing one.

- [ ] **Step 6: Commit**

```bash
cd C:/Code/violencetown && git add game/layout.js tests/offer-layout.test.js
git commit -m "feat(layout): offerLayout, and one MODAL_RECT instead of four copies"
```

Body:

```
Every rect the offer screen needs, from one pure function the renderer
draws from and main.js hit-tests against. Geometry verified in
game/_design-offer.html against real VT323 metrics rather than derived
on paper.

The non-overlap invariant is PER-GROUP, not global: siblings in a tiled
group tile exactly at zero slop, and only cross-group rects get the
HIT_SLOP expansion. Stating it globally is impossible -- two adjacent
40px rows expanded by 6 each necessarily overlap by 12. That in turn
forces a real constraint the paper design missed: the gutter between the
columns must exceed 2 * HIT_SLOP, because at 8px the two columns' tap
zones met inside the gap.

LOG_MODAL_RECT, TRADE_MODAL_RECT, EQUIPMENT_MODAL_RECT and DEVICE_RECT
were four separate literals of the identical bezel; they now alias one
MODAL_RECT.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Task 9: `_drawOfferScreen` — panel, header, and the meter

**Files:**
- Modify: `game/renderer.js`

The meter is the centrepiece, and the only part of this screen that is genuinely new. Solid fill is
where they are; a dashed extension is where the staged offer will put them — gold rightward for a
surplus, red leftward for a bad deal; ticks mark the band boundaries; and the multipliers beside it
change live so the player watches prices improve or worsen before committing.

**Display clamp:** the meter clamps its *display* to `dispositionCeil(npc)` per NPC. The Fungus King
is authored `flipThreshold: 200`, and clamping the underlying value to ±100 would make him
permanently unflippable. Display only — the math is untouched.

- [ ] **Step 1: Add the imports**

At the top of `game/renderer.js`, widen the existing `layout.js` import to include `MODAL_RECT` and
`offerLayout`, and the `trade.js` import to include `band`. Add:

```js
import { resolveOffer, dispositionCeil, DISPOSITION_MIN } from './offer.js';
```

- [ ] **Step 2: Write the method**

Add `_drawOfferScreen(game)` to the `Renderer` class, beside the modal draw methods:

```js
    // ── The unified offer screen ─────────────────────────────────────────────
    //
    // One panel for buying, selling, giving and bribing, because they are one
    // verb: make an offer. Geometry comes from layout.offerLayout, which
    // main._tapOffer hit-tests against, so nothing can drift.
    //
    // Text is measured with this.font.measure — NEVER the /8 idiom, which is a
    // fossil of the retired 8x8 atlas and wraps ~40% narrower than the space
    // allows. The real VT323 advance is scale * 4.8.
    _drawOfferScreen(game) {
        const ctx = this.ctx;
        const npc = game._offerNpc;
        if (!npc) return;
        const L = offerLayout(MODAL_RECT, game);
        const R = resolveOffer(npc, game._offer);

        ctx.fillStyle = 'rgba(0,0,0,0.72)';
        ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);
        drawPanelSmall(ctx, L.panel.x, L.panel.y, L.panel.w, L.panel.h, this.uiSheet, 'base');

        this._drawOfferHeader(game, L, R);
        this._drawOfferLists(game, L, R);
        this._drawOfferTrays(game, L, R);
        this._drawOfferDescription(game, L, R);
        this._drawOfferLedger(game, L, R);

        this.font.drawText(ctx, 'TAB SIDE  SPACE STAGE  ENTER OFFER  ESC CLOSE',
            L.panel.x + 8, L.hintY, { color: UI.dim, scale: 1 });
    }

    // Header: mood face, name, the disposition meter, and the player's gold.
    _drawOfferHeader(game, L, R) {
        const ctx = this.ctx;
        const npc = game._offerNpc;
        const d = npc.disposition ?? 0;

        this._drawMoodFace(L.panel.x + 24, L.panel.y + 20, mood(d).face);
        this.font.drawText(ctx, String(npc.type).toUpperCase(),
            L.panel.x + 44, L.panel.y + 10, { color: UI.gold, scale: 2 });
        this.font.drawText(ctx, `GP ${game.gold ?? 0}`,
            L.panel.x + L.panel.w - 44, L.panel.y + 10, { color: UI.gold, scale: 2, align: 'right' });

        // An untracked NPC has no meter to draw — see spec 4.5. Say so plainly
        // rather than inventing a zero they never had.
        if (npc.disposition == null) {
            this.font.drawText(ctx, 'NO OPINION OF YOU EITHER WAY',
                L.meterBar.x, L.meterBar.y, { color: UI.dim, scale: 1 });
            return;
        }

        const ceil = dispositionCeil(npc);
        const mb = L.meterBar;
        const at = (v) => mb.x + ((Math.max(DISPOSITION_MIN, Math.min(ceil, v)) - DISPOSITION_MIN)
                                  / (ceil - DISPOSITION_MIN)) * mb.w;

        drawInset(ctx, mb.x, mb.y, mb.w, mb.h);
        ctx.fillStyle = d >= 50 ? '#79c46a' : d >= 0 ? UI.textLight : UI.hpRed;
        ctx.fillRect(mb.x, mb.y, at(d) - mb.x, mb.h);

        // The projection: gold rightward for a surplus, red leftward for a bad
        // deal. Same affordance, mirrored — the player sees the damage BEFORE
        // committing, never after.
        if (R.points !== 0) {
            const lo = Math.min(at(d), at(R.projected)), hi = Math.max(at(d), at(R.projected));
            const up = R.points > 0;
            ctx.fillStyle = up ? 'rgba(212,185,106,0.5)' : 'rgba(204,68,34,0.45)';
            ctx.fillRect(lo, mb.y, hi - lo, mb.h);
            ctx.strokeStyle = up ? UI.gold : UI.hpRed;
            ctx.lineWidth = 1; ctx.setLineDash([2, 2]);
            ctx.strokeRect(lo, mb.y, hi - lo, mb.h);
            ctx.setLineDash([]);
        }

        ctx.fillStyle = UI.panelBg;
        for (const v of [-50, -25, 0, 25, 50, 75]) ctx.fillRect(at(v), mb.y, 1, mb.h);

        const b0 = band(d), b1 = band(R.projected);
        const sign = (v) => (v > 0 ? `+${v}` : String(v));
        const dirCol = R.points > 0 ? '#79c46a' : R.points < 0 ? UI.hpRed : UI.text;
        const label = R.points !== 0
            ? `${sign(d)} > ${sign(R.projected)} ${(b1 ? b1.mood : "WON'T DEAL").toUpperCase()}`
            : `${sign(d)} ${(b0 ? b0.mood : "WON'T DEAL").toUpperCase()}`;
        this.font.drawText(ctx, label, mb.x + mb.w + 12, mb.y + 1, { color: dirCol, scale: 1 });

        // The payoff: the multipliers the player is actually buying or losing.
        const mulX = mb.x + mb.w + 12 + this.font.measure(label, 1) + 14;
        const mulCol = (b1 === b0) ? UI.dim : dirCol;
        const arrow = (a, b, fmt) => (a === b ? fmt(a) : `${fmt(a)} > ${fmt(b)}`);
        if (b0 && b1) {
            this.font.drawText(ctx, `BUY x${arrow(b0.buy, b1.buy, v => v.toFixed(1))}`,
                mulX, mb.y - 5, { color: mulCol, scale: 1 });
            this.font.drawText(ctx, `SELL x${arrow(b0.sell, b1.sell, v => v.toFixed(2))}`,
                mulX, mb.y + 8, { color: mulCol, scale: 1 });
        }
    }
```

- [ ] **Step 3: Verify in the browser**

There is nothing to unit-test in a draw method; the proof is on screen. Start the server, open the
game, and drive it directly:

```bash
python C:\Code\violencetown\dev-server.py 3001
```

In the console: click `#splash-go`, then find Puck and call `game._openOffer(puck)` (Task 12 adds
it — until then, temporarily call `renderer._drawOfferScreen` against a hand-built
`game._offerNpc` / `game._offer`). Confirm the meter fills to +60, that staging two soap paints a
gold dashed extension to +76, and that the multipliers read `BUY x1.2 > x1.0`.

- [ ] **Step 4: Commit**

```bash
cd C:/Code/violencetown && git add game/renderer.js
git commit -m "feat(renderer): the offer screen's header and disposition meter"
```

---

## Task 10: The two lists, with real scrolling

**Files:**
- Modify: `game/renderer.js`

The current screen reaches **15 of 50** bag slots and has no scroll state anywhere in the game
object. Copy the clip-and-thumb viewport out of `_drawDialogueModal` (`renderer.js:3110-3145`) — the
only scroll implementation in the codebase.

A row is: 3px tier bar at the left edge, 24px icon, name, tier name, price right-aligned. Stack
counts render as `[Soap] x3`. A staged row gets a gold halo and a `staged xN` line.

- [ ] **Step 1: Write the method**

```js
    // The two goods columns. Each is a clipped viewport with a proportional
    // thumb, so all 50 bag slots are reachable — the old grid showed 15 and
    // silently dropped the rest off the bottom of the canvas.
    _drawOfferLists(game, L, R) {
        const ctx = this.ctx;
        const npc = game._offerNpc;
        const d = npc.disposition ?? 0;

        this.font.drawText(ctx, `${String(npc.type).toUpperCase()}'S GOODS`,
            L.theirs[0].x, L.colHeadY, { color: UI.dim, scale: 1 });
        this.font.drawText(ctx, 'YOUR SATCHEL',
            L.yours[0].x, L.colHeadY, { color: UI.dim, scale: 1 });

        const theirs = game._offerTheirsList();
        const yours  = game._offerYoursList();
        this._drawOfferColumn(game, L.theirs, L.theirsScroll, theirs,
            game._offer.scroll.theirs, 'take', (def) => buyPrice(def, d));
        this._drawOfferColumn(game, L.yours, L.yoursScroll, yours,
            game._offer.scroll.yours, 'give', (def) => sellPrice(def, d));
    }

    // One column: `rects` are the visible row slots, `list` is the full backing
    // list, `scroll` is the index of the first visible row.
    _drawOfferColumn(game, rects, thumb, list, scroll, side, priceOf) {
        const ctx = this.ctx;
        for (let i = 0; i < rects.length; i++) {
            const entry = list[scroll + i];
            if (!entry) continue;
            const r = rects[i];
            const def = entry.def;
            const staged = game._stagedCount(side, entry);

            if (staged) {
                ctx.fillStyle = 'rgba(212,185,106,0.12)';
                ctx.fillRect(r.x, r.y, r.w, r.h);
            }
            const tier = VALUE_TIERS.find(v => v.key === itemTier(def)) || VALUE_TIERS[0];
            ctx.fillStyle = tier.color; ctx.fillRect(r.x, r.y, 3, r.h);
            this._drawItemIcon(def, r.x + 10, r.y + 8, 24);

            const name = entry.count > 1 ? `${def.name} x${entry.count}` : def.name;
            this.font.drawText(ctx, name, r.x + 42, r.y + 6, { color: UI.text, scale: 1 });
            this.font.drawText(ctx, tier.name.toLowerCase(), r.x + 42, r.y + 22,
                { color: tier.color, scale: 1 });

            const price = priceOf(def);
            this.font.drawText(ctx, price == null ? '-' : String(price),
                r.x + r.w - 10, r.y + 6, { color: UI.gold, scale: 1, align: 'right' });
            if (staged) {
                this.font.drawText(ctx, `staged x${staged}`, r.x + r.w - 10, r.y + 22,
                    { color: '#79c46a', scale: 1, align: 'right' });
                ctx.strokeStyle = UI.gold; ctx.lineWidth = 1.5;
                ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
            }
        }
        // Proportional thumb — an honest read on how deep the list is.
        if (list.length > rects.length) {
            const frac = rects.length / list.length;
            const travel = thumb.h * (1 - frac);
            const top = thumb.y + travel * (scroll / Math.max(1, list.length - rects.length));
            ctx.fillStyle = 'rgba(139,115,64,0.5)';
            ctx.fillRect(thumb.x, top, thumb.w, Math.max(12, thumb.h * frac));
        }
    }
```

`_drawItemIcon(def, x, y, size)` already exists at `renderer.js:2951` and handles sprite → sword →
coloured letter-box fallback. `VALUE_TIERS` and `itemTier` come from `items.js`; add them to the
existing import.

- [ ] **Step 2: Verify in the browser**

With a bag of 22 stacks, confirm six rows draw, the thumb is short, and scrolling reaches the last
slot. The `_design-offer.html` preview already proves the geometry; this proves the data binding.

- [ ] **Step 3: Commit**

```bash
cd C:/Code/violencetown && git add game/renderer.js
git commit -m "feat(renderer): two scrolling goods lists -- all 50 bag slots reachable"
```

---

## Task 11: Trays, description strip, and the ledger bar

**Files:**
- Modify: `game/renderer.js`

The description strip is **never empty** — with an item selected it carries name, tier, market value,
what the NPC pays, the written description and the goodwill weight; with nothing selected it carries
the NPC's mood line instead of dead space.

- [ ] **Step 1: Write the methods**

```js
    // The staged offer, made unambiguous. Gold rides in whichever tray its sign
    // puts it in — a coin chip, because gold is just another thing you can offer.
    _drawOfferTrays(game, L, R) {
        const ctx = this.ctx;
        const gold = game._offer.gold || 0;
        this.font.drawText(ctx, 'YOU GIVE', L.giveTray[0].x, L.trayLabelY, { color: UI.dim, scale: 1 });
        this.font.drawText(ctx, 'YOU TAKE', L.takeTray[0].x, L.trayLabelY, { color: UI.dim, scale: 1 });

        const slot = (r, filled) => {
            drawInset(ctx, r.x, r.y, r.w, r.h);
            ctx.strokeStyle = filled ? UI.gold : '#3a352c';
            ctx.lineWidth = 1;
            if (!filled) ctx.setLineDash([3, 3]);
            ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
            ctx.setLineDash([]);
        };
        const coin = (r, amount) => {
            slot(r, true);
            ctx.strokeStyle = UI.gold; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.arc(r.x + 18, r.y + 13, 7, 0, Math.PI * 2); ctx.stroke();
            this.font.drawText(ctx, String(amount), r.x + r.w / 2, r.y + 23,
                { color: UI.gold, scale: 1, align: 'center' });
        };
        const fill = (rects, entries, goldHere) => {
            rects.forEach(r => slot(r, false));
            let i = 0;
            for (const e of entries) {
                const r = rects[i++]; if (!r) break;
                slot(r, true);
                this._drawItemIcon(e.def, r.x + 8, r.y + 6, 20);
                if (e.count > 1) this.font.drawText(ctx, `x${e.count}`, r.x + r.w - 3, r.y + 25,
                    { color: UI.gold, scale: 1, align: 'right' });
            }
            if (goldHere > 0 && rects[i]) coin(rects[i], goldHere);
        };
        fill(L.giveTray, game._offer.give, Math.max(0, gold));
        fill(L.takeTray, game._offer.take, Math.max(0, -gold));
    }

    // Never empty. With a selection it is the one place name, tier, value,
    // description and goodwill weight all appear together — the three things the
    // old screen could not show. With no selection it is the NPC's mood line.
    _drawOfferDescription(game, L, R) {
        const ctx = this.ctx;
        const npc = game._offerNpc;
        const d = npc.disposition ?? 0;
        drawInset(ctx, L.desc.x, L.desc.y, L.desc.w, L.desc.h);
        const sel = game._offerSelection();

        if (!sel) {
            const m = mood(d);
            this.font.drawText(ctx, `${String(npc.type).toUpperCase()} IS ${m.mood.toUpperCase()}.`,
                L.desc.x + 10, L.desc.y + 6, { color: UI.gold, scale: 1 });
            this.font.drawText(ctx, 'PICK SOMETHING TO SEE WHAT IT IS WORTH TO HIM.',
                L.desc.x + 10, L.desc.y + 24, { color: UI.dim, scale: 1 });
            return;
        }

        const def = sel.def;
        const tier = VALUE_TIERS.find(v => v.key === itemTier(def)) || VALUE_TIERS[0];
        let x = L.desc.x + 10;
        this.font.drawText(ctx, def.name, x, L.desc.y + 6, { color: UI.gold, scale: 1 });
        x += this.font.measure(def.name, 1) + 14;
        this.font.drawText(ctx, tier.name.toUpperCase(), x, L.desc.y + 6, { color: tier.color, scale: 1 });
        x += this.font.measure(tier.name, 1) + 14;
        const pays = sellPrice(def, d);
        this.font.drawText(ctx,
            `${def.baseValue ?? 0} GP BASE - PAYS ${pays == null ? '-' : pays}`,
            x, L.desc.y + 6, { color: UI.dim, scale: 1 });

        const weight = npc.values && npc.values[def.id];
        if (weight > 1) {
            this.font.drawText(ctx, `VALUES THIS x${weight}`,
                L.desc.x + L.desc.w - 10, L.desc.y + 6, { color: '#79c46a', scale: 1, align: 'right' });
        }

        // Measured wrap. NOT the /8 idiom.
        const maxPx = L.desc.w - 20;
        const words = String(def.description || '').split(/\s+/);
        const lines = []; let cur = '';
        for (const w of words) {
            const t = cur ? `${cur} ${w}` : w;
            if (this.font.measure(t, 1) > maxPx && cur) { lines.push(cur); cur = w; } else cur = t;
        }
        if (cur) lines.push(cur);
        lines.slice(0, 2).forEach((ln, i) =>
            this.font.drawText(ctx, ln, L.desc.x + 10, L.desc.y + 24 + i * 14, { color: UI.text, scale: 1 }));
    }

    // The ledger. A negative balance does NOT disable the button — it arms it
    // with a warning, because taking a bad deal is a legitimate move.
    _drawOfferLedger(game, L, R) {
        const ctx = this.ctx;
        ctx.fillStyle = '#3a352c';
        ctx.fillRect(L.desc.x, L.desc.y + L.desc.h + 8, L.desc.w, 1);

        const nameOf = (e) => `${e.count} x ${e.def.name}`;
        const gold = game._offer.gold || 0;
        const giving = [...game._offer.give.map(nameOf), gold > 0 ? `${gold} GP` : null]
            .filter(Boolean).join('  +  ') || 'NOTHING';
        const taking = [...game._offer.take.map(nameOf), gold < 0 ? `${-gold} GP` : null]
            .filter(Boolean).join('  +  ') || 'NOTHING';

        this.font.drawText(ctx, 'GIVING', L.desc.x, L.ledgerY, { color: UI.dim, scale: 1 });
        this.font.drawText(ctx, giving, L.desc.x + 56, L.ledgerY, { color: UI.text, scale: 1 });
        this.font.drawText(ctx, 'TAKING', L.desc.x, L.ledgerY + 16, { color: UI.dim, scale: 1 });
        this.font.drawText(ctx, taking, L.desc.x + 56, L.ledgerY + 16, { color: UI.text, scale: 1 });

        this.font.drawText(ctx, 'BALANCE', 300, L.ledgerY, { color: UI.dim, scale: 1 });
        const balTxt = R.balance >= 0 ? `+${R.balance} IN HIS FAVOUR` : `${-R.balance} GP SHORT`;
        this.font.drawText(ctx, balTxt, 300, L.ledgerY + 16,
            { color: R.balance >= 0 ? '#79c46a' : UI.hpRed, scale: 1 });
        if (R.points < 0) {
            this.font.drawText(ctx, `${R.points} . HE'LL REMEMBER THIS`, 300, L.ledgerY + 30,
                { color: UI.hpRed, scale: 1 });
        }

        const blocker = game._offerBlocker();
        const b = L.button;
        drawInset(ctx, b.x, b.y, b.w, b.h);
        ctx.strokeStyle = blocker ? UI.dim : UI.gold;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
        this.font.drawText(ctx, blocker || 'MAKE THE OFFER', b.x + b.w / 2, b.y + 14,
            { color: blocker ? UI.dim : UI.gold, scale: 1, align: 'center' });
    }
```

- [ ] **Step 2: Register the screen and retire the old one in the dispatch**

In `renderFrame`'s flat run of state guards (`renderer.js:412-422`), replace:

```js
        if (game.state === 'trade') this._drawTradeModal(game);
```

with:

```js
        if (game.state === 'trade') this._drawOfferScreen(game);
```

And in the `CLOSE_PANEL` table (`renderer.js:430-440`), point `trade` at the shared constant:

```js
            trade:       MODAL_RECT,
```

- [ ] **Step 3: Commit**

```bash
cd C:/Code/violencetown && git add game/renderer.js
git commit -m "feat(renderer): trays, the always-populated description strip, and the ledger"
```

---

## Task 12: Opening and closing the screen

**Files:**
- Modify: `game/main.js`

`STATE.TRADE` keeps its name, so the wheel and Target List resolvers do not move and no save format
changes. The basket lives at `game._offer`, RAM-only, cleared on close.

**Closing always discards the basket.** Nothing is committed until `MAKE THE OFFER` is pressed, so
`Escape` is always safe and never needs a confirm.

> **Guard the gold before it reaches `offerBalance`.** `offerBalance` is the one function in
> `game/offer.js` that does not finite-guard its input — `dispositionOf`, `dispositionCeil` and
> `unitCount` all do. A `gold` of `Infinity` produces `balance: Infinity` and then `unspent: NaN`,
> which would render as `NaN GP` in the ledger. Unreachable until this task wires real gold in, which
> is exactly why it is this task's problem: sanitize where the number enters (`_offer.gold` and the
> staged amount) rather than deep in the pure module.

- [ ] **Step 1: Add the imports and the constructor fields**

At the top of `game/main.js`, add:

```js
import { emptyOffer, resolveOffer, commitBlocker, stage, unstage, settledGold } from './offer.js';
```

and widen the `layout.js` import with `MODAL_RECT, offerLayout`.

In the constructor, beside the existing `_tradeNpc` / `_tradeSell` / `_tradeCursor` block (around
line 283), add:

```js
        this._offerNpc = null;           // the partner whose offer screen is open, or null
        this._offer = null;              // the staged basket — RAM only, never persisted
        this._offerCursor = null;        // keyboard cursor: { side, index }
```

- [ ] **Step 2: Write the open and close methods**

```js
    // Open the offer screen for `npc`. A pure menu — the world does NOT advance,
    // so nearby enemies get no free turns while the player browses.
    //
    // One screen, three shapes: a vendor's stock fills the take side, a chest's
    // contents fill it at price 0 with the give tray disabled, and any other
    // living NPC gets an empty take side with a stated reason. What differs is
    // which trays are live, never which screen you are on.
    _openOffer(npc) {
        if (this.state !== STATE.IDLE) return;
        if (!npc || !npc.entity || !npc.entity.isAlive()) return;
        this._offerNpc = npc;
        this._offer = { ...emptyOffer(), scroll: { theirs: 0, yours: 0 }, selection: null };
        this._offerCursor = { side: 'yours', index: 0 };
        if (npc.vendor && !npc._container) {
            const now = performance.now();
            if (!npc._buyback || (now - npc._buyback.openedAt) >= BUYBACK_MS) {
                npc._buyback = { openedAt: now, entries: {} };
            }
            this._startTradeTimer();
        }
        this.state = STATE.TRADE;
        audio.playSfx('menu-open');
        if (npc._container)   this._log(`[You lift the lid.]`, 'transition');
        else if (npc.vendor)  this._log(`[${npc.type} opens the till. "What'll it be?"]`, 'transition');
        else                  this._log(`[You open your satchel to ${npc.type}.]`, 'transition');
        this._render();
    }

    // Closing DISCARDS the basket. Nothing is committed until the player presses
    // MAKE THE OFFER, so Escape is always safe and never needs a confirm.
    _closeOffer() {
        if (this.state !== STATE.TRADE) return;
        this._stopTradeTimer();
        this.state = STATE.IDLE;
        this._offerNpc = null;
        this._offer = null;
        this._offerCursor = null;
        audio.playSfx('menu-cancel');
        this._render();
        this._resumeHeldWalk();
    }
```

- [ ] **Step 3: Wire the close contract — both halves**

In `_closeCurrentMenu` (`main.js:1670-1689`), change the TRADE case:

```js
            case STATE.TRADE:          this._closeOffer(); return true;
```

The renderer half was already done in Task 11 (`trade: MODAL_RECT` in `CLOSE_PANEL`). Both halves are
required: the switch is the one Cancel hook behind universal `Escape`, the ✕ chip and tap-outside;
the table is what gives the chip a rect to sit in.

- [ ] **Step 4: Point every existing entry point at the new opener**

Grep for `_openTrade(` and replace each call with `_openOffer(`. There are three entry points: the
`[E]` key beside a vendor, the Target List / wheel **Trade** verb, and bumping a container in
`_doMove`. Leave `_openTrade` itself in place for now — Task 15 deletes it.

```bash
cd C:/Code/violencetown && grep -n '_openTrade(' game/main.js game/wheel-model.js
```

Note the `state === STATE.IDLE` gate: the wheel and `_fireTargetVerb` work around it by assigning
`this.state = STATE.IDLE` immediately before calling (`main.js:3312`, `2818`). `_openOffer` keeps the
same gate, so those two call sites keep working unchanged.

**`_openContainer` needs its own edit**, not just a renamed call. It builds a duck-typed shim onto
`this._tradeNpc` and then sets the state itself (`main.js:3736-3756`). Rewrite its tail to build the
same shim and hand it to `_openOffer`:

```js
        const shim = {
            type: container.type,
            vendor: true,
            bribeable: false,
            disposition: 100,      // benign value for any mood()/canTrade() call
            _container: container, // the container OBJECT — every path branches on this
            stock: this._containerStock(container),
            entity: { isAlive: () => true },
        };
        this._openOffer(shim);
```

The shim has **no `id`, no `gold`, no `giftLog`.** Anything reading `_offerNpc.<field>` must tolerate
that — which is why `commitBlocker` treats a container as un-shortchangeable rather than reading a
disposition off it.

- [ ] **Step 5: Verify in the browser**

```bash
python C:\Code\violencetown\dev-server.py 3001
```

Open the game, walk to Puck, press `E`. The screen should open. Press `Escape` — it should close and
return to IDLE. Click the ✕ chip — same. Click outside the panel — same. Check the console is clean.

- [ ] **Step 6: Commit**

```bash
cd C:/Code/violencetown && git add game/main.js
git commit -m "feat(offer): open and close the screen, honouring both halves of the close contract"
```

---

## Task 13: The derived lists, staging, and input

**Files:**
- Modify: `game/main.js`

`_tradeSell` was a **snapshot** taken at open and hand-refreshed by five separate assignments; any
missed refresh drifted the hit-test away from the draw. It is replaced by lists derived every frame,
so draw and hit-test cannot disagree by construction. Unlike `_tradeSellList`, the derived satchel
**keeps `count`**, so a stack of nine rocks is one row reading `[Rock] x9`.

> **Guard the gold before it reaches `offerBalance`.** `offerBalance` is the one function in
> `game/offer.js` that does not finite-guard its input — `dispositionOf`, `dispositionCeil` and
> `unitCount` all do. A `gold` of `Infinity` produces `balance: Infinity` and then `unspent: NaN`,
> which would render as `NaN GP` in the ledger. Unreachable until this task wires real gold in, which
> is exactly why it is this task's problem: sanitize where the number enters (`_offer.gold` and the
> staged amount) rather than deep in the pure module.

- [ ] **Step 1: Write the derivation and selection helpers**

```js
    // ── The offer screen's derived state ─────────────────────────────────────
    //
    // Derived EVERY FRAME from the live inventory rather than snapshotted at
    // open. The old _tradeSell snapshot was refreshed by five separate manual
    // assignments; any missed one drifted the hit-test away from the draw.

    // The partner's side. A vendor's stock has infinite supply; a container's
    // contents are finite; anyone else offers nothing to take.
    _offerTheirsList() {
        const npc = this._offerNpc; if (!npc) return [];
        const out = [];
        if (npc._container) {
            // _container holds the container OBJECT itself, not an id.
            (this._containerStock(npc._container) || []).forEach((id, index) => {
                const def = this._resolveItemDef(id);
                if (def) out.push({ def, count: 1, source: 'contents', index });
            });
            return out;
        }
        (npc.stock || []).forEach((id, index) => {
            const def = this._resolveItemDef(id);
            if (def) out.push({ def, count: 1, source: 'stock', index });
        });
        if (npc.vendor) {
            this._buybackList(npc).forEach((e, index) => {
                const def = this._resolveItemDef(e.itemId);
                if (def) out.push({ def, count: 1, source: 'buyback', index, boughtBack: true });
            });
        }
        return out;
    }

    // The player's side — the whole bag, counts intact.
    _offerYoursList() {
        const out = [];
        for (let i = 0; i < this.inventory.length; i++) {
            const s = this.inventory[i];
            if (s) out.push({ def: s.itemDef, count: s.count, slot: i });
        }
        return out;
    }

    // How many of `entry` are currently staged on `side`.
    _stagedCount(side, entry) {
        const list = (this._offer && this._offer[side === 'give' ? 'give' : 'take']) || [];
        const hit = list.find(e => e.def === entry.def &&
            ('slot' in entry ? e.slot === entry.slot : e.source === entry.source && e.index === entry.index));
        return hit ? hit.count : 0;
    }

    // The item the description strip is describing, or null.
    _offerSelection() {
        const sel = this._offer && this._offer.selection;
        if (!sel) return null;
        const list = sel.side === 'theirs' ? this._offerTheirsList() : this._offerYoursList();
        return list[sel.index] || null;
    }

    _offerBlocker() {
        const npc = this._offerNpc; if (!npc) return 'NOTHING STAGED';
        return commitBlocker(npc, this._offer, {
            playerGold: this.gold ?? 0,
            npcGold: npc.gold ?? 0,
            isContainer: !!npc._container,
        });
    }
```

- [ ] **Step 2: Write the one activation path**

Pointer and keyboard both funnel through this, preserving the explicit rule at `main.js:5520-5522`
that the two can never drift.

**The balance auto-settles as you stage.** Stage a bandage and the screen drops the 30 GP it costs
into the give tray for you; stage two soap and it drops the 18 GP Puck owes you into the take tray.
The player then deliberately drags it off zero. Settling is the default; the imbalance is the
decision.

```js
    // (menu grammar) The one per-row action both a tap and a keyboard Confirm
    // route through, so pointer and keys can never drift.
    _offerActivate(zone, index) {
        const npc = this._offerNpc; if (!npc) return;

        if (zone === 'theirs' || zone === 'yours') {
            const list = zone === 'theirs' ? this._offerTheirsList() : this._offerYoursList();
            const entry = list[index]; if (!entry) return;
            this._offer.selection = { side: zone, index };

            const side = zone === 'theirs' ? 'take' : 'give';
            // A container is take-only; there is no put-into-chest path anywhere
            // in the codebase and adding one is a new mechanic, not a reskin.
            if (side === 'give' && npc._container) {
                this._log(`[The chest isn't interested in what you've got.]`);
                this._render(); return;
            }
            if (side === 'give' && !this._canStageGive(entry)) { this._render(); return; }

            this._offer = { ...stage(this._offer, side, entry), scroll: this._offer.scroll, selection: this._offer.selection };
            this._offer.gold = settledGold(npc, this._offer);
            audio.playSfx('menu-tick');
            this._render(); return;
        }

        if (zone === 'giveTray' || zone === 'takeTray') {
            const side = zone === 'giveTray' ? 'give' : 'take';
            this._offer = { ...unstage(this._offer, side, index), scroll: this._offer.scroll, selection: this._offer.selection };
            this._offer.gold = settledGold(npc, this._offer);
            audio.playSfx('menu-tick');
            this._render(); return;
        }

        if (zone === 'commit') { this._commitOffer(); return; }
    }

    // Quest items may only be staged when the quest actually wants them there —
    // otherwise the row refuses and says why, rather than eating the item.
    _canStageGive(entry) {
        const def = entry.def, npc = this._offerNpc;
        if (def.questItem) {
            const wanted = this.questEngine && this.questEngine.expectsDelivery(def.id, npc.id);
            if (!wanted) { this._log(`[The ${def.name} isn't yours to hand over.]`); return false; }
        }
        if (!def.baseValue && !(npc.values && npc.values[def.id])) {
            this._log(`[${npc.type} wouldn't know what to do with that.]`);
            return false;
        }
        return true;
    }
```

- [ ] **Step 3: Write the pointer routing**

Replace the body of `_tapTrade` (it is renamed in Task 15; for now add `_tapOffer` beside it and
point the pointer handler at it):

```js
    // Touch routing. Rects come from layout.offerLayout — the SAME function the
    // renderer drew from — so a tap always lands where the row actually is.
    _tapOffer(pt) {
        const npc = this._offerNpc;
        if (!npc) { this._closeOffer(); return; }
        const L = offerLayout(MODAL_RECT, this);
        if (!this._pointInRect(pt, L.panel)) { this._closeOffer(); return; }

        if (this._pointInRect(pt, L.button, HIT_SLOP)) { this._offerActivate('commit', 0); return; }

        const scroll = this._offer.scroll;
        for (let i = 0; i < L.theirs.length; i++) {
            if (this._pointInRect(pt, L.theirs[i], HIT_SLOP)) { this._offerActivate('theirs', scroll.theirs + i); return; }
        }
        for (let i = 0; i < L.yours.length; i++) {
            if (this._pointInRect(pt, L.yours[i], HIT_SLOP)) { this._offerActivate('yours', scroll.yours + i); return; }
        }
        for (let i = 0; i < L.giveTray.length; i++) {
            if (this._pointInRect(pt, L.giveTray[i], HIT_SLOP)) { this._offerActivate('giveTray', i); return; }
        }
        for (let i = 0; i < L.takeTray.length; i++) {
            if (this._pointInRect(pt, L.takeTray[i], HIT_SLOP)) { this._offerActivate('takeTray', i); return; }
        }
    }
```

And in `_onCanvasPointerDown` (`main.js:1738`):

```js
        if (this.state === STATE.TRADE) { this._tapOffer(pt); return; }
```

- [ ] **Step 4: Replace the keyboard block**

Swap the whole `STATE.TRADE` keydown block (`main.js:1076-1099`) for this. Note what is deliberately
**not** inherited: the DEVICE's bodies are tap-only, with no keyboard grammar at all. This screen
keeps full parity.

```js
            // ── TRADE: the unified offer screen ──
            // Tab switches side; arrows move and scroll; Space stages or
            // un-stages; Enter commits; E/Esc closes. Every one of them funnels
            // into _offerActivate, the same path a tap takes.
            if (this.state === STATE.TRADE) {
                e.preventDefault();
                if (e.code === 'KeyE' || e.code === 'Escape') { this._closeOffer(); return; }
                if (e.code === 'Enter') { this._offerActivate('commit', 0); return; }

                const c = this._offerCursor || (this._offerCursor = { side: 'yours', index: 0 });
                const listOf = (side) => side === 'theirs' ? this._offerTheirsList() : this._offerYoursList();

                if (e.code === 'Tab') {
                    c.side = c.side === 'theirs' ? 'yours' : 'theirs';
                    c.index = 0;
                    audio.playSfx('menu-tick'); this._render(); return;
                }
                if (e.code === 'ArrowLeft' || e.code === 'KeyA') { c.side = 'theirs'; audio.playSfx('menu-tick'); this._render(); return; }
                if (e.code === 'ArrowRight' || e.code === 'KeyD') { c.side = 'yours'; audio.playSfx('menu-tick'); this._render(); return; }

                const list = listOf(c.side);
                const rows = offerLayout(MODAL_RECT, this).rowsVisible;
                const key = c.side === 'theirs' ? 'theirs' : 'yours';
                if (e.code === 'ArrowUp' || e.code === 'KeyW') {
                    c.index = Math.max(0, c.index - 1);
                    if (c.index < this._offer.scroll[key]) this._offer.scroll[key] = c.index;
                    audio.playSfx('menu-tick'); this._render(); return;
                }
                if (e.code === 'ArrowDown' || e.code === 'KeyS') {
                    c.index = Math.min(Math.max(0, list.length - 1), c.index + 1);
                    if (c.index >= this._offer.scroll[key] + rows) this._offer.scroll[key] = c.index - rows + 1;
                    audio.playSfx('menu-tick'); this._render(); return;
                }
                if (e.code === 'Space') { this._offerActivate(c.side, c.index); return; }
                return;
            }
```

- [ ] **Step 5: Verify in the browser**

Open Puck's screen. Tap a bandage in his column — confirm 30 GP lands in the give tray automatically
and the balance reads settled. Tap two soap in yours — confirm the gold shifts to the take tray.
Tap a staged tray slot — confirm it un-stages and the gold re-settles. Then drive the whole thing
from the keyboard: `Tab`, arrows, `Space`, and confirm the cursor scrolls past row 6 to the bottom of
a 22-stack bag.

- [ ] **Step 6: Commit**

```bash
cd C:/Code/violencetown && git add game/main.js
git commit -m "feat(offer): derived lists, auto-settling stage, and full keyboard parity"
```

Body:

```
The lists are derived every frame from the live inventory rather than
snapshotted at open. The old _tradeSell snapshot was refreshed by five
separate manual assignments and any missed one drifted the hit-test away
from the draw. The derived satchel also keeps count, so a stack of nine
rocks is one row reading [Rock] x9 instead of nine identical cells.

The balance auto-settles as you stage: put a bandage in the take tray
and the 30 GP it costs lands in the give tray for you. The player then
drags it off zero deliberately. Settling is the default; the imbalance
is the decision.

Pointer and keyboard both funnel through _offerActivate, preserving the
rule that the two can never drift. Deliberately NOT inherited: the
DEVICE's bodies are tap-only with no keyboard grammar at all.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Task 14: Committing the offer

**Files:**
- Modify: `game/main.js`

The one place the world actually changes. Order matters: check, then move gold, then move items, then
move disposition, then log. Nothing half-applies.

- [ ] **Step 1: Write the method**

```js
    // Commit the staged offer. The ONE place this screen mutates the world.
    //
    // Order is load-bearing: refuse first, then gold, then items, then
    // disposition, then the log line. transferGold returning false must never be
    // discovered halfway through, which is why _offerBlocker checked both tills
    // before we got here.
    _commitOffer() {
        const npc = this._offerNpc; if (!npc) return;
        const blocker = this._offerBlocker();
        if (blocker) { this._log(`[${blocker}]`); this._render(); return; }

        const R = resolveOffer(npc, this._offer);
        const gold = this._offer.gold || 0;

        if (gold > 0 && !transferGold(this, npc, gold, 'offer')) { this._render(); return; }
        if (gold < 0 && !transferGold(npc, this, -gold, 'offer')) { this._render(); return; }

        // Items out of the bag. Highest slot first so earlier splices cannot
        // shift the indices of the ones still to remove.
        const giving = [...this._offer.give].sort((a, b) => (b.slot ?? 0) - (a.slot ?? 0));
        for (const e of giving) {
            const unit = sellPrice(e.def, npc.disposition ?? 0) || 0;
            for (let n = 0; n < e.count; n++) {
                this._removeFromSlot(e.slot);
                // _buybackRecord takes ONE price per call — the ledger is
                // per-unit LIFO stacks, which is what closed the gold-dup
                // exploit found in pre-prod review. Do not pass a count.
                this._buybackRecord(npc, e.def.id, 'rebuy', unit);
            }
        }

        // Items into the bag. A container's contents are finite and must be
        // spliced; a vendor's stock is infinite and is not.
        for (const e of this._offer.take) {
            const unit = buyPrice(e.def, npc.disposition ?? 0) || 0;
            for (let n = 0; n < e.count; n++) {
                this._addToInventory(e.def);
                if (e.source !== 'contents') this._buybackRecord(npc, e.def.id, 'refund', unit);
            }
            if (e.source === 'contents') this._takeFromContainer(npc, e.index, e.count);
        }

        // Disposition last, so a flip fires against a world that already settled.
        //
        // NOT applyDispositionDelta's raw call: it hard-clamps to [-100, 100],
        // and the Fungus King is authored flipThreshold: 200, so routing through
        // the bare clamp makes him permanently unflippable — the exact outcome
        // the display-only meter clamp was supposed to avoid. See the amendment
        // note below; give-action.js now clamps to the NPC's own ceiling.
        if (R.points !== 0 && npc.disposition != null) {
            applyDispositionDelta(npc, R.points);
        }

        this._logOffer(npc, R);
        this._offer = { ...emptyOffer(), scroll: this._offer.scroll, selection: null };

        // A committed offer can turn the partner hostile — sewer fare does
        // exactly that. Do not leave the player standing in an offer window
        // belonging to someone now chasing them.
        if (isHostile(npc) || !npc.entity || !npc.entity.isAlive()) { this._closeOffer(); return; }

        audio.playSfx('menu-confirm');
        this._render();
    }

    // One bracketed sentence in house voice, naming what actually moved.
    _logOffer(npc, R) {
        const gave = this._offer.give.reduce((n, e) => n + e.count, 0);
        const took = this._offer.take.reduce((n, e) => n + e.count, 0);
        const gold = this._offer.gold || 0;
        const parts = [];
        if (gave) parts.push(`${gave} item${gave > 1 ? 's' : ''}`);
        if (gold > 0) parts.push(`${gold} GP`);
        const back = [];
        if (took) back.push(`${took} item${took > 1 ? 's' : ''}`);
        if (gold < 0) back.push(`${-gold} GP`);

        const deal = back.length
            ? `[You hand ${npc.type} ${parts.join(' and ') || 'nothing'} for ${back.join(' and ')}.`
            : `[You hand ${npc.type} ${parts.join(' and ')}.`;
        const mood = R.points > 0 ? ` Disposition +${R.points}.]`
                   : R.points < 0 ? ` They take it, and remember. Disposition ${R.points}.]`
                   : `]`;
        this._log(deal + mood, 'transition');
    }
```

> **Amendment — the clamp must be the NPC's own ceiling, not a flat ±100.**
> `applyDispositionDelta` (`give-action.js`) clamps to `[-100, 100]`. The Fungus King is authored
> `disposition: -80, flipThreshold: 200`, so under that clamp he can never reach his own threshold
> and is permanently unflippable — which is precisely what the spec's display-only meter clamp was
> introduced to prevent. Spec §5.1 says "the math is untouched"; the flat clamp touches it.
>
> Fix, as part of this task: `give-action.js` imports `dispositionCeil` from `./offer.js` (no cycle —
> `offer.js` imports only `trade.js`) and clamps to `[DISPOSITION_MIN, dispositionCeil(recipient)]`.
> For every NPC except the King that ceiling is exactly 100, so this is a strictly-safe
> generalization: identical behaviour everywhere, and the King becomes reachable. It also makes the
> meter's drawn range and the value's legal range one number, which is what `dispositionCeil`'s own
> comment already claims.
>
> **All three writers, not just one.** `applyDispositionDelta` is only one of three functions that
> write `disposition`. `previewGive`/`applyGive` (`give-action.js:46, 97`) are completely unclamped
> and reachable through `reactToTransaction(npc, 'give', …)`; `applySewerFareGive` (`:193`) clamps to
> a hardcoded flat `[-100, 100]`, which contradicts the King's 200 outright. Extend the ceiling to
> all three, or spec §5.1 promises an invariant the code does not hold.
>
> Add tests proving the King can cross 200 **through each writer**, and that an ordinary NPC still
> stops at 100. Note the King flips on a knife edge: `dispositionCeil` is exactly his `flipThreshold`
> of 200 and the flip test is `>=`, so the headroom cap delivering exactly 280 points from −80 is
> load-bearing. Make that a real assertion, not an approximate one.

- [ ] **Step 2: Add the container-take helper**

`_containerStock` normalizes but nothing removes. Add beside it:

```js
    // Remove `count` of the container's `index`-th entry. A chest's contents are
    // finite, unlike a vendor's infinite stock.
    _takeFromContainer(npc, index, count) {
        const chest = npc._container;    // the container OBJECT, not an id
        if (!chest || !Array.isArray(chest.contents)) return;
        chest.contents.splice(index, count);
        npc.stock = this._containerStock(chest);
    }
```

- [ ] **Step 3: Verify in the browser — the whole loop**

On Puck: stage two soap with nothing taken, confirm the meter projects 60 → 76, commit, and confirm
**his prices actually change afterward** (re-open and check a bandage now costs 25 rather than 30).
Then stage a rock against a bandage, confirm the red retreat and the `-15 . HE'LL REMEMBER THIS`
warning, commit, and confirm his prices got worse.

- [ ] **Step 4: Commit**

```bash
cd C:/Code/violencetown && git add game/main.js
git commit -m "feat(offer): commit -- the one place this screen changes the world"
```

---

## Task 15: Delete the old trade path

**Files:**
- Modify: `game/main.js`, `game/renderer.js`, `game/layout.js`

Nothing here is a behaviour change; it is removing what the previous tasks replaced. Do it as its own
commit so a bisect can tell a deletion from a regression.

- [ ] **Step 1: Delete from `game/main.js`**

`_openTrade`, `_closeTrade`, `_tapTrade`, `_tradeActivate`, `_tradeSlots`, `_clampTradeCursor`,
`_tradeSellList`, `_buyFromVendor`, `_sellToVendor`, `_bribeVendor`, `_offerFromTrade`, and
`_doGive`.

`_doGive` (`main.js:2580-2603`) has had **no callers since Phase 6a** — verify before deleting:

```bash
cd C:/Code/violencetown && grep -n '_doGive\|_openTrade\|_tapTrade\|_tradeActivate\|_tradeSlots\|_clampTradeCursor\|_tradeSellList\|_buyFromVendor\|_sellToVendor\|_bribeVendor\|_offerFromTrade' game/*.js
```

Every remaining hit must be inside the block you are deleting. Keep `_startTradeTimer`,
`_stopTradeTimer`, `_buybackList` and the rest of the buyback ledger — the new screen uses them.
Also drop the now-unused constructor fields `_tradeNpc`, `_tradeSell`, `_tradeCursor`.

`_bribeTarget` (`main.js:2910`) and the wheel bribe resolver (`main.js:3319`) **stay.** They are
out of scope; the duplication is recorded in the spec's §12.

- [ ] **Step 2: Delete from `game/renderer.js`**

`_drawTradeModal` and `_drawTradeCell`, and drop `tradeCellRect` / the `TRADE_*` names from its
`layout.js` import.

- [ ] **Step 3: Delete from `game/layout.js`**

`TRADE_COLS`, `TRADE_CELL_W`, `TRADE_CELL_H`, `TRADE_COL_STRIDE`, `TRADE_ROW_STRIDE`,
`TRADE_BUY_ORIGIN`, `TRADE_SELL_ORIGIN`, `TRADE_BUYBACK_ORIGIN`, `TRADE_BRIBE_RECT` and
`tradeCellRect`. Keep `TRADE_MODAL_RECT` as an alias of `MODAL_RECT` — other code may still name it.

- [ ] **Step 4: Prove nothing dangles**

```bash
cd C:/Code/violencetown && grep -rn 'tradeCellRect\|TRADE_BUY_ORIGIN\|TRADE_SELL_ORIGIN\|TRADE_BUYBACK_ORIGIN\|TRADE_BRIBE_RECT\|TRADE_COLS\|_drawTradeModal\|_drawTradeCell' game/ tests/ | grep -v '_design-'
```

Expected: no output.

- [ ] **Step 5: Run the suite and the game**

```bash
cd C:/Code/violencetown && npm test 2>&1 | tail -6
```

Expected: `fail 0`. Then load the game and open a shop — **a merge or a deletion is done when the
game RUNS, not when the greps come back clean.** Git happily drops a needed import; this project has
been bitten twice.

- [ ] **Step 6: Commit**

```bash
cd C:/Code/violencetown && git add game/main.js game/renderer.js game/layout.js
git commit -m "refactor: delete the trade path the offer screen replaced"
```

Body:

```
Removes _openTrade, _closeTrade, _tapTrade, _tradeActivate, _tradeSlots,
_clampTradeCursor, _tradeSellList, _buyFromVendor, _sellToVendor,
_bribeVendor, _offerFromTrade, _drawTradeModal, _drawTradeCell and the
TRADE_* grid constants.

Also _doGive, which has had no callers since Phase 6a folded Give into
the trade window and was left behind as the only give path that still
spent a turn.

The buyback ledger stays -- the new screen uses it, demoted from the
primary safety net to the second one now that un-staging is the first.
_bribeTarget and the wheel bribe resolver stay too; deduplicating the
three bribe implementations is out of scope.

Verified by running the game, not just by a clean grep.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Task 16: Chests become reachable by tap

**Files:**
- Modify: `game/main.js` (`_targetAt`), `game/pathing.js`

Spec §9 item 5. `_targetAt` has no container case and `pathing.stepFree` treats a container tile as
blocked (`pathing.js:40`), so `findPath` to a chest returns null. **On touch there is currently no
way to open a chest at all** — only bumping it works, which needs a keyboard.

The fix mirrors the car: path to a tile *adjacent* to the chest, then act.

- [ ] **Step 1: Add the container case to `_targetAt`**

Find the existing `_targetAt` resolution chain and add a container branch alongside the item and NPC
branches, returning a target whose default verb opens the offer screen.

- [ ] **Step 2: Route the path to an adjacent tile**

`stepFree` must keep treating the container tile as blocked — the player should not stand *on* a
chest. Instead, resolve the path to the nearest free orthogonal neighbour, the way `_carApproachPath`
already does for the car's four tiles. Reuse that helper's shape rather than inventing a second one.

- [ ] **Step 3: Verify on touch**

Resize the preview to mobile and tap a chest from three tiles away. The player should walk adjacent
and the offer screen should open.

```js
// in the browser console, after resizing to mobile
window.__game.state
```

- [ ] **Step 4: Commit**

```bash
cd C:/Code/violencetown && git add game/main.js game/pathing.js
git commit -m "fix: chests are reachable by tap, not only by bumping them"
```

---

## Task 17: The hostility trap and stranded stock

**Files:**
- Modify: `game/give-action.js`, `game/main.js`

Spec §9 items 6 and 7. Two small, real bugs the new screen would otherwise inherit.

- [ ] **Step 1: Clear stock when an NPC stops being a vendor**

`give-action.js:207` and `main.js:4058` both set `vendor = false` without clearing `stock`, leaving
invisible-but-tappable rows and a cursor parked on a blank rect. At both sites, add:

```js
    recipient.vendor = false;
    recipient.stock = null;      // a de-vendored NPC has no till to browse
```

- [ ] **Step 2: Confirm the screen closes when the partner turns hostile**

Task 14's `_commitOffer` already ends with an `isHostile(npc)` check that closes the screen. Verify
it fires: `applySewerFareGive` turns the recipient hostile and clears `vendor`, and before this work
nothing closed or re-rendered the window.

- [ ] **Step 3: Verify in the browser**

Give a `tunnel_mushroom` (sewer fare) to a non-dweller through the offer screen. The screen must
close and the NPC must start chasing — not leave the player browsing a hostile stranger's satchel.

- [ ] **Step 4: Commit**

```bash
cd C:/Code/violencetown && git add game/give-action.js game/main.js
git commit -m "fix: a de-vendored NPC loses their stock, and turning hostile closes the screen"
```

---

## Task 18: Backfill the pricing tests

**Files:**
- Create: `tests/trade.test.js`

`tests/wallets.test.js` is the only test importing from `trade.js` and it imports only
`transferGold` / `burnGold`. **`band`, `buyPrice`, `sellPrice`, `bribeStepCost`, `canTrade` and
`mood` have zero coverage.** This work is pricing-adjacent and cannot land without a net.

- [ ] **Step 1: Write the tests**

```js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { band, canTrade, mood, buyPrice, sellPrice, bribeStepCost, TRADE_FLOOR, BRIBE_STEP } from '../game/trade.js';

const ITEM = { id: 'x', baseValue: 10 };

describe('trade bands', () => {
  test('there are six bands, not the eight the module header claims', () => {
    const moods = [100, 60, 30, 10, -10, -40].map(d => band(d).mood);
    assert.deepEqual(moods, ['adoring', 'warm', 'friendly', 'neutral', 'wary', 'hostile']);
  });

  test('below the floor there is no band and no deal', () => {
    assert.equal(band(TRADE_FLOOR - 1), null);
    assert.equal(canTrade(TRADE_FLOOR - 1), false);
    assert.equal(canTrade(TRADE_FLOOR), true, 'the floor itself still deals');
  });

  test('a null disposition reads as neutral, not as refusal', () => {
    assert.equal(band(null).mood, 'neutral');
  });

  test('mood works below the floor, where band does not', () => {
    assert.equal(mood(-90).face, 'refuse');
  });
});

describe('pricing', () => {
  test('buy always costs at least as much as sell pays — no arbitrage loop', () => {
    for (let d = TRADE_FLOOR; d <= 100; d += 5) {
      assert.ok(buyPrice(ITEM, d) > sellPrice(ITEM, d), `spread inverted at disposition ${d}`);
    }
  });

  test('friendlier traders charge less and pay more', () => {
    assert.ok(buyPrice(ITEM, 80) < buyPrice(ITEM, 0));
    assert.ok(sellPrice(ITEM, 80) > sellPrice(ITEM, 0));
  });

  test('prices floor at 1, never 0', () => {
    assert.equal(buyPrice({ id: 'z', baseValue: 0 }, 0), 1);
  });

  test('quest items and worthless items do not sell', () => {
    assert.equal(sellPrice({ id: 'q', baseValue: 500, questItem: true }, 0), null);
    assert.equal(sellPrice({ id: 'w', baseValue: 0 }, 0), null);
  });

  test('nothing prices below the floor', () => {
    assert.equal(buyPrice(ITEM, -80), null);
    assert.equal(sellPrice(ITEM, -80), null);
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
});
```

- [ ] **Step 2: Run it**

```bash
cd C:/Code/violencetown && node --test tests/trade.test.js
```

Expected: PASS. If "there are six bands" fails, the band table changed and the spec's §4 needs
re-deriving before anything else.

- [ ] **Step 3: Fix the stale module header while you are here**

`game/trade.js:7` says *"8 AGGRO levels every 25 points"*. The table has **six**. Correct the comment;
do not change the table.

- [ ] **Step 4: Commit**

```bash
cd C:/Code/violencetown && git add tests/trade.test.js game/trade.js
git commit -m "test: backfill the pricing coverage that never existed"
```

---

## Task 19: Reconcile the documentation

**Files:**
- Modify: `plans/economy-merchants.md`, `plans/give-action-feature.md`
- Delete: `game/_design-offer.html` (untracked; just remove the file)

Spec §13. Both dev-side docs describe schemas and UI — `shopInventory`, `buyMultiplier`,
`tradeThreshold`, `ITEM_GIVE_DIR`, Down-to-Give — that **do not exist and were abandoned**, with no
supersede notes. The spec for what actually shipped lives only on the `plan` branch. Left alone, the
next reader rebuilds a deleted verb.

- [ ] **Step 1: Add a supersede header to each**

At the very top of both files:

```markdown
> **SUPERSEDED 2026-08-23** by `plans/unified-offer-screen.md`. The schema and UI described below
> (`shopInventory`, `buyMultiplier`, `tradeThreshold`, `ITEM_GIVE_DIR`, Down-to-Give) were never
> built and have been abandoned. What actually shipped is the unified offer screen. Kept for the
> design reasoning, not as a description of the code.
```

- [ ] **Step 2: Remove the design preview**

`game/_design-offer.html` is gitignored scratch and its job is done — the real screen exists now.

```bash
cd C:/Code/violencetown && rm game/_design-offer.html
```

- [ ] **Step 3: Commit**

```bash
cd C:/Code/violencetown && git add plans/economy-merchants.md plans/give-action-feature.md
git commit -m "docs: mark the abandoned trade and give specs as superseded"
```

---

## Task 20: The verification pass

**Files:** none — this is the gate.

**A change is done when the game RUNS, not when the tests are green.** This project has been bitten
twice by a clean-looking merge that dropped an import.

- [ ] **Step 1: The suite**

```bash
cd C:/Code/violencetown && npm test 2>&1 | tail -8
```

Expected: `fail 0`, and a total well above the 404 baseline.

- [ ] **Step 2: The naming gate**

```bash
cd C:/Code/violencetown && git grep -iE 'violence[ _-]+town' -- ':!CLAUDE.md' ':!plans/item-hotbar-xmb-implementation.md'
```

Expected: zero lines.

- [ ] **Step 3: Drive every partner shape in the browser**

```bash
python C:\Code\violencetown\dev-server.py 3001
```

Console must be clean throughout.

- [ ] **Puck** (vendor with authored `values`) — stage two soap, watch 60 → 76 and `BUY x1.2 > x1.0`,
      commit, re-open and confirm the prices really changed.
- [ ] **A plain Violencian** (no vendor, no `values`) — the take side is empty with a stated reason;
      the give tray still generates goodwill from GP value alone.
- [ ] **A chest** — take-only, give tray disabled, reachable **by tap** and not only by bumping.
- [ ] **Someone below −50** — the lists render, taking is refused with `HE WON'T DEAL`, the give tray
      still works, and gifting up past the floor unlocks trading **in the same sitting**.
- [ ] **The Fungus King** (`flipThreshold: 200`) — the meter renders legibly without clamping his math.
- [ ] **The Ghost Fungus** (`bribeable: false`) — gold in the tray generates no goodwill; gifts still do.
- [ ] **Scroll** — all 50 bag slots reachable; the thumb is proportional at 1 item and at 50.
- [ ] **A bad deal** — the red retreat, the warning, the commit, and worse prices afterward.
- [ ] **An unabsorbable lowball** — refused with `HE WON'T TAKE ANOTHER BAD DEAL`.
- [ ] **Escape mid-basket** — the staged offer is discarded and nothing was spent.

- [ ] **Step 4: Glyph check**

The meter draws `>` and `x` as ASCII deliberately. If you substituted `→` or `×` anywhere, confirm
VT323 actually has the glyph — `_log` normalises Unicode to ASCII but `font.drawText` passes it
straight through, and `_drawCloseButton` draws its ✕ as two strokes precisely because of this doubt.

- [ ] **Step 5: Save round-trip**

Save, reload, and confirm `game._offer` is absent from the save and disposition survived.

```js
JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.includes('violencetown')))).player._offer
```

Expected: `undefined`.

- [ ] **Step 6: Hand back to Caelan**

Per this project's rule, the merge to `dev` is **his call**. Push the branch and stop.

```bash
cd C:/Code/violencetown && git push -u origin feature/unified-offer-screen
```
