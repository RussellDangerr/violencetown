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
    // A non-finite disposition would make goodwillCostPerPoint return NaN, and since
    // `pool < NaN` is always false the goodwill loop would run to its guard and
    // pay out the MAXIMUM instead of zero. Fail to neutral, not to jackpot.
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

// ── The curves ───────────────────────────────────────────────────────────────

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
    // Unreachable by construction — dispositionCeil never returns below 100, so
    // span is always positive. Kept as a divide-by-zero guard, not a live path.
    if (!(span > 0)) return 1;
    return Math.max(0, Math.min(1, (d - DISPOSITION_MIN) / span));
}

// GP per point of goodwill. Rises as they warm to you: pleasing someone who
// already likes you costs more. 1 GP/pt at the floor, 5 at the ceiling.
export function goodwillCostPerPoint(d, ceil) {
    return 1 + 4 * progress(d, ceil);
}

// How many points a surplus buys. Awarded one at a time so the rising cost
// applies across the climb, and rounded DOWN — you only get points you have
// fully paid for. (Resentment rounds the other way; see resentmentFor.)
export function goodwillFor(surplus, npc) {
    if (!(surplus > 0)) return 0;
    const ceil = dispositionCeil(npc);
    const d0 = dispositionOf(npc);
    // Capped at the headroom to the ceiling, not an arbitrary iteration count —
    // goodwill can never move an NPC past the top of their own meter, so a gift
    // can never project more points than that meter has room for.
    const room = Math.max(0, ceil - d0);
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
    return pts;
}
