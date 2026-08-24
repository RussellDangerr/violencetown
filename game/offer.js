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

// ── The curves ───────────────────────────────────────────────────────────────
//
// Argument order: goodwillFor/resentmentFor take npc last;
// offerBalance/splitGoodwill take npc first — two sentence shapes, not
// an inconsistency.

export const DISPOSITION_MIN = -100;
const EPSILON = 1e-9;   // float-drift tolerance on the last point

// Every disposition read in this module funnels through here, so a missing
// npc (or a missing `disposition` on one) prices as neutral instead of
// throwing.
export function dispositionOf(npc) {
    const d = (npc && npc.disposition) ?? 0;
    // Sanitized here so every OTHER disposition read in this module
    // (offerBalance's pricing included) doesn't have to guard against NaN
    // separately.
    return Number.isFinite(d) ? d : 0;
}

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
//
// `cap` is a second, independent stopping point below the ceiling's own
// `room` — splitGoodwill uses it for the flip threshold, which can refuse
// gold before the ceiling would. The loop always climbs all the way to
// `room` regardless of `cap`; it snapshots pool/pts the moment `pts`
// reaches `cap`, so `points`/`spent`/`unspent` report the capped prefix
// while `refusedByCap` (points bought after the snapshot, i.e. what the
// same money would have bought past the cap) falls out of that one walk.
// The `cappedPool === null` check appears twice — here, and again after the
// loop. The one here is a no-op on its own (`pts` climbs by exactly 1 each
// pass, so it can equal a fixed `effectiveCap` at most once); the one after
// the loop is not — every call using the default `cap = Infinity` relies on
// it entirely, since `pts` never equals `Infinity` and this one never fires
// for them. They stand or fall together, not one at a time.
export function goodwillFor(surplus, npc, cap = Infinity) {
    // No valid surplus means nothing was ever staged to spend — 0 unspent,
    // not the raw (possibly negative or NaN) input echoed back.
    if (!(surplus > 0)) return { points: 0, spent: 0, unspent: 0, refusedByCap: 0 };
    const ceil = dispositionCeil(npc);
    const d0 = dispositionOf(npc);
    // Capped at the headroom to the ceiling, not an arbitrary iteration count —
    // goodwill can never move an NPC past the top of their own meter, so a
    // gift can never project more points than that meter has room for.
    // Floored: a fractional d0 (e.g. 99.5 against ceil 100) gives room 0.5,
    // and `pts < room` would still admit one point, breaching the ceiling.
    const room = Math.floor(Math.max(0, ceil - d0));
    // Same floor/clamp dispositionCeil applies to its own input: a fractional
    // or negative cap (a fractional flipThreshold; a threshold already
    // crossed) must not mint a fractional point or go below "capped at zero".
    const effectiveCap = Number.isFinite(cap) ? Math.max(0, Math.floor(cap)) : Infinity;
    let pool = surplus, pts = 0;
    let cappedPool = null, cappedPts = null;
    while (pts < room) {
        if (pts === effectiveCap && cappedPool === null) { cappedPool = pool; cappedPts = pts; }
        const c = goodwillCostPerPoint(d0 + pts, ceil);
        // EPSILON absorbs float drift on the last point of an exact-payment
        // surplus (e.g. 81 GP for 25 points at 3+k/50 each) — without it the
        // running subtraction can land a hair under the true cost and refuse
        // a point the player fully paid for.
        if (pool + EPSILON < c) break;
        pool -= c; pts++;
    }
    // The snapshot is never taken above when the cap doesn't bind (room or
    // pool exhaustion arrives first) — falls back to the walk's own end.
    if (cappedPool === null) { cappedPool = pool; cappedPts = pts; }
    return {
        points: cappedPts,
        spent: surplus - cappedPool,
        unspent: Math.max(0, cappedPool),
        refusedByCap: Math.max(0, pts - cappedPts),
    };
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

    // The cap itself may be fractional or negative (a fractional
    // flipThreshold; a threshold already crossed) — goodwillFor floors and
    // floors-at-zero the same way dispositionCeil does for its own input.
    const cap = Number.isFinite(goldCeiling) ? goldCeiling - afterItems : Infinity;
    const goldCurve = goodwillFor(gold, { ...npc, disposition: afterItems }, cap);

    return {
        points: items.points + goldCurve.points,
        fromItems: items.points,
        fromGold: goldCurve.points,
        itemsSpent: items.spent,
        goldSpent: goldCurve.spent,
        // Points gold wanted to buy but the flip ceiling refused — distinct
        // from goldCurve.unspent, which is "no room left to feel"; this is
        // "gold can't carry him across his own threshold". They want
        // different log lines.
        goldRefusedPoints: goldCurve.refusedByCap,
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
    const cap = Number.isFinite(max) ? Math.max(0, Math.floor(max)) : Infinity;
    const o = offer || emptyOffer();
    const list = (o[side] || []).map(e => ({ ...e }));
    const hit = list.find(e => sameEntry(e, entry));
    if (hit) hit.count = Math.min(hit.count + 1, cap);
    else list.push({ ...entry, count: Math.min(1, cap) });
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

    // The floor gates TAKING, not giving — a hostile NPC is a puzzle, not a wall.
    // You can always gift or bribe your way back up to where he'll deal, in the
    // same sitting. (Options narrowed, never removed.) Checked before the till,
    // so a hostile NPC always hears the reason he can act on, not the one he can't.
    const takingSomething = (o.take || []).length > 0 || gold < 0;
    if (takingSomething && !canTrade(dispositionOf(npc))) return "HE WON'T DEAL";

    const owedToPlayer = Math.max(0, -gold);
    const npcGold = ctx.npcGold ?? 0;
    if (owedToPlayer > npcGold) return `HIS TILL IS ${owedToPlayer - npcGold} GP SHORT`;

    if (offerBalance(npc, o).balance < 0) {
        const noResentment = !npc || npc.disposition == null || npc._container || ctx.isContainer;
        if (noResentment) return "HE CAN'T BE SHORTCHANGED";
        if (resolveOffer(npc, o).patienceExceeded) return "HE WON'T TAKE ANOTHER BAD DEAL";
    }
    return null;
}
