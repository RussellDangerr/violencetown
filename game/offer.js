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
    // A non-finite disposition already fails safe on its own inside goodwillFor:
    // room = Math.max(0, ceil - NaN) is NaN, and `pts < NaN` is always false, so
    // the loop runs zero iterations — the headroom cap kills that jackpot
    // independently. This sanitization is defence in depth, not the sole
    // barrier: every OTHER disposition read in this module (offerBalance's
    // pricing included) would otherwise go NaN too.
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
//
// Argument order is deliberate, not inconsistent. goodwillFor(surplus, npc) and
// resentmentFor(deficit, npc) put npc LAST — "N gold's worth of this, for this
// person." offerBalance(npc, offer) and splitGoodwill(npc, …) put npc FIRST —
// "for this npc, evaluate this basket." Two consistent sentence shapes, not
// one inconsistency; don't "fix" it into a single order.

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
    // Unreachable via goodwillFor — every ceil it passes in comes from
    // dispositionCeil, which never returns below 100, so span is always
    // positive there. But goodwillCostPerPoint is EXPORTED, and Tasks 9-11
    // call it directly to draw the curve; (0, 0), (0, -100) and (0, NaN) all
    // reach this branch from a direct caller and price at the maximum, 5
    // GP/point. Live for them, not a dead path.
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
    // gift can never project more points than that meter has room for. This
    // is also what makes an unconditional iteration ceiling unnecessary: cost
    // is never below 1 GP/point, so iterations can never outrun the surplus
    // either, and room itself is always finite.
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
        // All of it — so the refusal is the whole amount gold could have bought.
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
