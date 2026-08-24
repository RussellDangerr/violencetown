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

import { buyPrice, sellPrice, TRADE_FLOOR } from './trade.js';

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
        const n = Math.max(0, Math.trunc(g.count ?? 1));
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
        const n = Math.max(0, Math.trunc(t.count ?? 1));
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
    return -z.balance;
}
