// offer.js — the basket behind the unified offer screen.
//
// Trade and give are the SAME function: there is one verb, "make an offer".
// The player stages items into two trays plus gold, and the signed balance
// decides what the exchange means — a purchase, a sale, a gift, a bribe, or a
// bad deal. Any imbalance moves disposition: surplus buys goodwill, a shortfall
// costs it.
//
// PURE. Imports trade.js and disposition-curves.js (both pure), takes item DEFS rather than ids so
// it never needs the item registry, and mutates nothing. main.js owns inventory,
// gold transfer and logging; this module owns the arithmetic.
//
// The disposition this module PROJECTS is the same value trade.js READS to price
// buy/sell and give-action.js MOVES on a gift — three faces of one spine.
//
// Design: plans/unified-offer-screen.md §4. Geometry: layout.js offerLayout().

import { buyPrice, canTrade, sellPrice, TRADE_FLOOR } from './trade.js';
import { dispositionOf, resentmentFor, splitGoodwill } from './disposition-curves.js';

// A fresh, empty basket.
export function emptyOffer() {
    return { give: [], take: [], gold: 0 };
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
        // A container's own stock is never priced -- loot is free, matching
        // main.js's Container "buy" shim (0 GP, no disposition/price gate).
        // Gold moving out of a container's till is unaffected; only its ITEM
        // stock prices at zero, so give-side pricing into a container (a
        // separate loop above) is untouched.
        const unit = (npc && npc._container) ? 0 : (buyPrice(t.def, d) || 0);
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
//
// The return shape is spelled out field by field rather than inheriting
// offerBalance's via `{...bal}`, so its size is a decision, not a byproduct of
// the balance calculation growing a field. givenValue/takenValue/giftValue/
// givenItemsValue are cut entirely — nothing here reads them, and a caller
// wanting tray totals calls offerBalance, which is exported and tested on
// its own.
//
// itemUnspent and goldUnspent are reported separately rather than summed,
// because they are different in KIND, not just in source: itemUnspent is
// market value of a gift the NPC had no room left to appreciate; goldUnspent
// is real money that bought nothing.
export function resolveOffer(npc, offer) {
    const o = offer || emptyOffer();
    const bal = offerBalance(npc, o);
    const d0 = dispositionOf(npc);
    const goldGiven = Math.max(0, Math.trunc(o.gold || 0));

    if (bal.balance === 0) {
        return {
            balance: bal.balance, points: 0, fromItems: 0, fromGold: 0, projected: d0,
            shortfall: 0, itemUnspent: 0, goldUnspent: 0, goldRefusedPoints: 0,
            patienceExceeded: false,
        };
    }

    if (bal.balance > 0) {
        // Gold pays the bill first; what's left over is the surplus. The item
        // share of it is amplified by the average weight of what was given, so
        // generosity is weighted and settlement never is.
        const goldSurplus = Math.max(0, goldGiven - bal.takenValue);
        const itemSurplus = Math.max(0, bal.balance - goldSurplus);
        const avgWeight = bal.givenItemsValue > 0 ? bal.giftValue / bal.givenItemsValue : 1;
        const g = splitGoodwill(npc, { itemValue: itemSurplus * avgWeight, gold: goldSurplus });

        // itemsSpent is denominated in the same giftWeight-inflated units as
        // itemValue above; divide back out so itemUnspent lands in the same
        // real-GP unit as goldUnspent and shortfall. Clamped independently —
        // either half's own subtraction can drift a hair negative on its own.
        const itemUnspent = Math.max(0, itemSurplus - g.itemsSpent / avgWeight);
        const goldUnspent = Math.max(0, goldSurplus - g.goldSpent);

        return {
            balance: bal.balance, points: g.points, fromItems: g.fromItems, fromGold: g.fromGold,
            projected: d0 + g.points, shortfall: 0,
            itemUnspent, goldUnspent, goldRefusedPoints: g.goldRefusedPoints,
            patienceExceeded: false,
        };
    }

    // A deficit is not a refusal: `patienceExceeded` is one input to Task 6's
    // commitBlocker, not the same thing as it.
    const r = resentmentFor(-bal.balance, npc);
    return {
        balance: bal.balance, points: r.points, fromItems: 0, fromGold: 0,
        projected: d0 + r.points, shortfall: r.shortfall,
        itemUnspent: 0, goldUnspent: 0, goldRefusedPoints: 0,
        patienceExceeded: r.shortfall > 0,
    };
}

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

// `max` mirrors goodwillFor's cap idiom: a second, independent ceiling (the
// real stack size, or a container's remaining stock) supplied by the caller.
// Undefined for every call site until Task 13 has a real number to pass, so
// today's callers are unaffected -- Infinity never binds.
export function stage(offer, side, entry, max = Infinity) {
    side = side === 'take' ? 'take' : 'give';
    const cap = Number.isFinite(max) ? Math.max(0, Math.floor(max)) : Infinity;
    const o = offer || emptyOffer();
    const list = (o[side] || []).map(e => ({ ...e }));
    const hit = list.find(e => sameEntry(e, entry));
    if (hit) {
        if (hit.count >= cap) return o;
        hit.count += 1;
    } else {
        if (cap < 1) return o;
        list.push({ ...entry, count: 1 });
    }
    return { ...o, [side]: list };
}

export function unstage(offer, side, index) {
    side = side === 'take' ? 'take' : 'give';
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
    // Truncated for the same reason offerBalance truncates its own gold: a drag
    // handle can leave a fraction on the tray, and it must not reach the button's
    // own arithmetic either -- unitCount's comment names the same source. Hoisted
    // above `staged` itself: a sub-1 crumb must not read as something staged when
    // every check below sees a truncated zero and waves the whole commit through.
    const gold = Math.trunc(o.gold || 0);
    const staged = (o.give || []).length + (o.take || []).length + (gold ? 1 : 0);
    if (!staged) return 'NOTHING STAGED';

    const playerGold = ctx.playerGold ?? 0;
    if (gold > playerGold) return `YOU'RE ${gold - playerGold} GP SHORT`;

    // The floor gates TAKING, not giving — a hostile NPC is a puzzle, not a wall.
    // You can always gift or bribe your way back up to where they'll deal, in the
    // same sitting. (Options narrowed, never removed.) Checked before the till,
    // so a hostile NPC always hears the reason they can act on, not the one they can't.
    const takingSomething = (o.take || []).length > 0 || gold < 0;
    if (takingSomething && !canTrade(dispositionOf(npc))) return "THEY WON'T DEAL";

    const owedToPlayer = Math.max(0, -gold);
    const npcGold = ctx.npcGold ?? 0;
    if (owedToPlayer > npcGold) return `THEIR TILL IS ${owedToPlayer - npcGold} GP SHORT`;

    if (offerBalance(npc, o).balance < 0) {
        const noResentment = !npc || npc.disposition == null || npc._container || ctx.isContainer;
        if (noResentment) return "THEY CAN'T BE SHORTCHANGED";
        if (resolveOffer(npc, o).patienceExceeded) return "THEY WON'T TAKE ANOTHER BAD DEAL";
    }
    return null;
}
