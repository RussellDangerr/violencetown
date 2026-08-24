// disposition-curves.js — the goodwill and resentment cost curves.
//
// What a staged offer's imbalance does to an NPC's disposition: a surplus
// buys goodwill along a rising curve; a deficit costs resentment along its
// mirror. offer.js is the only caller — its dispositionOf/splitGoodwill/
// resentmentFor imports are the sole edge back into the basket side.
//
// PURE. Imports nothing, mutates nothing.
//
// Design: plans/unified-offer-screen.md §4.

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
