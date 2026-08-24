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
    const d = (npc && npc.disposition) ?? 0;
    // Sanitized here so every OTHER disposition read in this module
    // (offerBalance's pricing included) doesn't have to guard against NaN
    // separately.
    return Number.isFinite(d) ? d : 0;
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

// ── The projection ───────────────────────────────────────────────────────────
//
// One call, everything the screen needs. Both the renderer (to draw the meter's
// ghost segment and the ledger) and main.js (to commit) go through here, so what
// the player was shown and what actually happens can never diverge.

// The GP cost of exactly `n` points bought in order starting at d0 — the same
// running total goodwillFor's own loop accumulates internally, replayed here
// so a point count splitGoodwill has already resolved (some possibly refused
// by the flip ceiling) can be priced without re-deciding how many there are.
function costOfPoints(d0, ceil, n) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += goodwillCostPerPoint(d0 + i, ceil);
    return sum;
}

export function resolveOffer(npc, offer) {
    const o = offer || emptyOffer();
    const bal = offerBalance(npc, o);
    const d0 = dispositionOf(npc);
    const goldGiven = Math.max(0, Math.trunc(o.gold || 0));

    if (bal.balance === 0) {
        return { ...bal, points: 0, fromItems: 0, fromGold: 0, projected: d0,
                 shortfall: 0, unspent: 0, goldRefusedPoints: 0, refused: false };
    }

    if (bal.balance > 0) {
        // Gold pays the bill first; what's left over is the surplus. The item
        // share of it is amplified by the average weight of what was given, so
        // generosity is weighted and settlement never is.
        const goldSurplus = Math.max(0, goldGiven - bal.takenValue);
        const itemSurplus = Math.max(0, bal.balance - goldSurplus);
        const avgWeight = bal.givenItemsValue > 0 ? bal.giftValue / bal.givenItemsValue : 1;
        const g = splitGoodwill(npc, { itemValue: itemSurplus * avgWeight, gold: goldSurplus });

        // Recomputed rather than taken from splitGoodwill's own `unspent`: this
        // divides the item half back out of its giftWeight-inflated units and
        // sums only the cost of points that actually landed (not the flip
        // ceiling's refused ones), so both halves land in the same real-GP
        // unit as `shortfall`. Pinned in tests/offer.test.js, "the three
        // accounting seams".
        const ceil = dispositionCeil(npc);
        const afterItems = d0 + g.fromItems;
        const itemsCost = costOfPoints(d0, ceil, g.fromItems);
        const goldCost = costOfPoints(afterItems, ceil, g.fromGold);
        const unspent = Math.max(0,
            (itemSurplus - itemsCost / avgWeight) + (goldSurplus - goldCost));

        return { ...bal, points: g.points, fromItems: g.fromItems, fromGold: g.fromGold,
                 projected: d0 + g.points, shortfall: 0, unspent,
                 goldRefusedPoints: g.goldRefusedPoints, refused: false };
    }

    const r = resentmentFor(-bal.balance, npc);
    return { ...bal, points: r.points, fromItems: 0, fromGold: 0,
             projected: d0 + r.points, shortfall: r.shortfall,
             unspent: 0, goldRefusedPoints: 0, refused: r.shortfall > 0 };
}

// ── The curves ───────────────────────────────────────────────────────────────
//
// Argument order: goodwillFor/resentmentFor take npc last;
// offerBalance/splitGoodwill take npc first — two sentence shapes, not
// an inconsistency.

export const DISPOSITION_MIN = -100;
const EPSILON = 1e-9;   // float-drift tolerance on the last point

// The top of this NPC's meter — and the denominator of both curves. At least
// 100, but a high flipThreshold raises it (the Fungus King is authored 200, and
// clamping him to 100 would make him permanently unflippable).
//
// `?? 30` is the default previewGive and applyDispositionDelta already use
// (give-action.js) — it must not silently disagree with the flip logic.
export function dispositionCeil(npc) {
    const t = (npc && npc.flipThreshold) ?? 30;
    // Sanitized for the same reason dispositionOf is: a non-finite ceiling makes
    // this NaN, which becomes NaN meter geometry downstream, and an Infinite one
    // pins the curve at its cheapest rate — the jackpot through the other door.
    return Math.max(100, Number.isFinite(t) ? t : 30);
}

function progress(d, ceil) {
    const span = ceil - DISPOSITION_MIN;
    // Unreachable via dispositionCeil, but both cost functions are
    // exported for Tasks 9-11's curve draw; the degenerate span must
    // price at the worst case for the player either way — goodwill's
    // own max (5), resentment's own min (1).
    if (!(span > 0)) return 1;
    return Math.max(0, Math.min(1, (d - DISPOSITION_MIN) / span));
}

// GP per point of goodwill. Rises as they warm to you: pleasing someone who
// already likes you costs more. 1 GP/pt at the floor, 5 at the ceiling.
export function goodwillCostPerPoint(d, ceil) {
    return 1 + 4 * progress(d, ceil);
}

// How many points a surplus buys, and how much of it could not be spent.
// Awarded one at a time so the rising cost applies across the climb, and
// rounded DOWN — you only get points you have fully paid for.
//
// Mirrors resentmentFor's { points, shortfall }: this is { points, unspent }
// because goodwill can run out of ROOM (the NPC hits their ceiling) the same
// way resentment runs out of WILLINGNESS (the NPC won't go any lower). Both
// leave gold on the table, and the caller needs to know THAT it happened —
// gifting someone already at their ceiling is worth exactly 0 points, and
// without `unspent` there is no way to tell that apart from a bug and no way
// to write the honest line ("already as fond of you as he can be") instead
// of a bare +0 that looks broken.
export function goodwillFor(surplus, npc) {
    // No valid surplus means nothing was ever staged to spend — 0 unspent,
    // not the raw (possibly negative or NaN) input echoed back.
    if (!(surplus > 0)) return { points: 0, unspent: 0 };
    const ceil = dispositionCeil(npc);
    const d0 = dispositionOf(npc);
    // Capped at the headroom to the ceiling, not an arbitrary iteration count —
    // goodwill can never move an NPC past the top of their own meter, so a
    // gift can never project more points than that meter has room for.
    // Floored: a fractional d0 (e.g. 99.5 against ceil 100) gives room 0.5,
    // and `pts < room` would still admit one point, breaching the ceiling.
    const room = Math.floor(Math.max(0, ceil - d0));
    let pool = surplus, pts = 0;
    while (pts < room) {
        const c = goodwillCostPerPoint(d0 + pts, ceil);
        // EPSILON absorbs float drift on the last point of an exact-payment
        // surplus (e.g. 81 GP for 25 points at 3+k/50 each) — without it the
        // running subtraction can land a hair under the true cost and refuse
        // a point the player fully paid for.
        if (pool + EPSILON < c) break;
        pool -= c; pts++;
    }
    return { points: pts, unspent: Math.max(0, pool) };
}

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
// bribeable:false is folded in as the degenerate ceiling: right where the
// gifts left them, so gold moves nobody. _bribeTarget respects the flag today,
// _bribeVendor never checks it, so the Ghost Fungus is bribeable through the
// trade window. She won't stay the only caller: every chest's _openContainer
// shim (main.js) is bribeable:false, disposition:100, and once Tasks 12-17
// route container offers through here, chests are the dominant caller of this
// branch, not the Fungus.
export function splitGoodwill(npc, { itemValue = 0, gold = 0 } = {}) {
    const d0 = dispositionOf(npc);
    const items = goodwillFor(itemValue, npc);
    const afterItems = d0 + items.points;

    const rawThreshold = (npc && npc.flipThreshold) ?? 30;
    const threshold = Number.isFinite(rawThreshold) ? rawThreshold : 30;

    // Where gold may climb to. Someone who refuses bribes is the degenerate
    // ceiling: right where the gifts left them, so gold moves nobody.
    const goldCeiling =
        (npc && npc.bribeable === false) ? afterItems
        : afterItems < threshold         ? threshold - 1
        : Infinity;

    const goldCurve = goodwillFor(gold, { ...npc, disposition: afterItems });
    // Floored: a fractional flipThreshold still passes Number.isFinite, so
    // without this an authored 60.5 would mint fractional points of goodwill
    // that eventually land on npc.disposition itself.
    const allowed = Number.isFinite(goldCeiling)
        ? Math.max(0, Math.min(Math.floor(goldCeiling - afterItems), goldCurve.points))
        : goldCurve.points;

    return {
        points: items.points + allowed,
        fromItems: items.points,
        fromGold: allowed,
        unspent: items.unspent + goldCurve.unspent,
        // Points gold wanted to buy but the flip ceiling refused. Distinct from
        // `unspent` — that is "no room left to feel", this is "gold can't carry
        // him across his own threshold". They want different log lines.
        goldRefusedPoints: Math.max(0, goldCurve.points - allowed),
    };
}

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
export function resentmentCostPerPoint(d, ceil) {
    return 5 - 4 * progress(d, ceil);
}

// What a deficit costs. Returns { points, shortfall } where points is NEGATIVE
// and shortfall is the GP the NPC's remaining patience could not absorb —
// anything above zero means they will not take the deal at all.
//
// Rounds UP against the player: any remaining shortfall, however small, costs
// one more whole point. Goodwill rounds DOWN — both directions round in the NPC's favour.
export function resentmentFor(deficit, npc) {
    if (!(deficit > 0)) return { points: 0, shortfall: 0 };
    const d0 = dispositionOf(npc);
    if (d0 <= RESENT_FLOOR) return { points: 0, shortfall: deficit };

    const ceil = dispositionCeil(npc);
    // Floored for the same reason goodwillFor's room is: a fractional d0
    // (e.g. -24.5 against RESENT_FLOOR -25) gives room 0.5, and `pts < room`
    // would still admit one point, breaching the floor.
    const room = Math.floor(Math.min(RESENT_MAX_PER_OFFER, d0 - RESENT_FLOOR));
    let pool = deficit, pts = 0;
    // Both the loop test and the final shortfall need EPSILON: float dust from
    // the running subtraction lands on EITHER side of zero depending on which
    // exit fires (room cap vs. pool exhaustion), so guarding only one still
    // misreads the other. Both cases are pinned in tests/offer.test.js.
    while (pool > EPSILON && pts < room) {
        pool -= resentmentCostPerPoint(d0 - pts, ceil);
        pts++;
    }
    // `-pts || 0` instead of a bare `-pts`: at pts=0 this is -0, not 0 — same
    // value under ===, but Object.is/JSON-adjacent code could tell, and there
    // is nothing gained by exposing it here.
    return { points: -pts || 0, shortfall: pool > EPSILON ? pool : 0 };
}

