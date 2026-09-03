// give-action.js — Disposition shift + flip resolution for the Give action.
//
// Phase A: bribery-as-neutralization. A given item shifts the recipient's
// disposition by `values[item.id] × SHIFT_MULTIPLIER`. When disposition
// crosses `flipThreshold`, the recipient's `onFlip` behavior fires —
// typically removing HOSTILE from their behavior whitelist (becomeAlly) or
// setting a discount flag (offerDiscount).
//
// Phase B (future): active ally behavior, hover-preview UI, bribed-ally
// counter-bribery, etc. See plans/give-action-feature.md for the phased
// rollout and plans/give-action-and-disposition.md for the design pitch.
//
// All functions here are isolated from world state except for the
// recipient instance they mutate. main.js handles inventory consumption,
// UI flow, and log emission; this module handles the disposition math.
//
// The disposition this module MOVES is the same value trade.js READS to price
// buy / sell / bribe — two halves of one transaction spine.

import { isHostile, isSewerDweller } from './ai.js';
import { poitionBuff } from './items.js';
import { DISPOSITION_MIN, dispositionCeil } from './disposition-curves.js';   // one ceiling, three writers
import { BANDS_STEP } from './trade.js';   // paranoia is priced in whole trade bands

// Tuning constant — controls how much disposition each unit of `values`
// shifts. Currently 5 (so values:{soap:8} means soap gives +40 disposition).
// Balance knob; revisit after first playtest.
export const SHIFT_MULTIPLIER = 5;

// Poisoning-as-a-social-attack (Task 17) base disposition penalty. Added on
// top of the `values`-weighted credit the item would otherwise have earned,
// so the total hit ALWAYS exceeds that credit — feeding someone poison can
// never be a net-positive way to raise their opinion of you, even for an item
// they don't personally value (weight 0 → the base penalty alone still bites).
const SEWER_FARE_PENALTY_BASE = 40;

// ── previewGive ─────────────────────────────────────────────────────────────
//
// Pure: returns what *would* happen if `item` were given to `recipient`,
// without mutating anything. Used by Phase B's hover-preview UI to show
// the player the consequence before they commit.

// Every write to `disposition` in this file goes through here.
//
// The ceiling is the NPC's OWN, not a flat 100. The Fungus King is authored
// `disposition: -80, flipThreshold: 200`, so a flat clamp made him permanently
// unflippable -- he could never reach his own threshold, which is exactly the
// outcome the meter's per-NPC range was introduced to prevent. dispositionCeil
// is max(100, flipThreshold ?? 30), so for every other NPC in the game it is
// exactly 100 and nothing changes.
//
// previewGive was UNCLAMPED before this, so an ordinary NPC could be gifted
// past 100 into a range no band, no meter and no flip test could see.
function clampDisposition(recipient, value) {
    return Math.max(DISPOSITION_MIN, Math.min(dispositionCeil(recipient), value));
}

export function previewGive(item, recipient) {
    const itemId = item?.id;
    const valueWeight = recipient.values?.[itemId] ?? 0;
    const shift = valueWeight * SHIFT_MULTIPLIER;
    const current = recipient.disposition ?? 0;
    const newDisposition = clampDisposition(recipient, current + shift);
    const threshold = recipient.flipThreshold ?? 30;
    const wasAtOrAboveThreshold = current >= threshold;
    const wouldFlip = newDisposition >= threshold && !wasAtOrAboveThreshold;
    return {
        shift,
        currentDisposition: current,
        newDisposition,
        threshold,
        wouldFlip,
    };
}

// ── applyGive ───────────────────────────────────────────────────────────────
//
// Mutates `recipient`: updates disposition, sets _wasFlipped, calls
// applyFlip if the threshold was crossed. Returns:
//   { accepted: bool, flipped: bool, log: string }
//
// accepted=false means the recipient refused (bribeable:false). Caller
// should NOT consume the item in that case — the player tried to bribe
// but the offer was rejected.
//
// accepted=true, flipped=true means the disposition crossed the threshold
// on this gift and onFlip behavior fired (e.g., HOSTILE removed).
//
// accepted=true, flipped=false means the gift was accepted and disposition
// shifted, but the recipient hasn't crossed the threshold (yet).

export function applyGive(item, recipient) {
    // Bribery-immune NPCs (zealots, bosses, named cultists) reject all
    // offerings. The Gate-1 doc justifies this as the brake against
    // bribery trivializing combat. Sewer fare is no exception — a refused
    // offering never reaches the eater's mouth, so it doesn't poison OR heal.
    if (recipient.bribeable === false) {
        return {
            accepted: false,
            flipped: false,
            log: `[The ${recipient.type} ignores your offering.]`,
        };
    }

    // (Task 17) Sewer fare given to a person is a social attack, not a gift —
    // same transaction spine, opposite sign. Routed here (rather than as a
    // parallel seam beside applyGive) so gifts/bribes/poisonings can never
    // silently diverge on the bribery-immune check above.
    if (item && item.sewerFare) return applySewerFareGive(item, recipient);

    const preview = previewGive(item, recipient);

    // Apply the shift
    recipient.disposition = preview.newDisposition;

    // Did this crossing trigger the flip? Only the *first* crossing fires
    // onFlip — subsequent gives past the threshold are just loyalty boosts.
    const isFlipping = preview.wouldFlip && !recipient._wasFlipped;

    if (isFlipping) {
        recipient._wasFlipped = true;
        applyFlip(recipient);
        return {
            accepted: true,
            flipped: true,
            log: flipLogLine(item, recipient),
        };
    }

    return {
        accepted: true,
        flipped: false,
        log: `[The ${recipient.type} pockets the ${item.name}. Disposition +${preview.shift}.]`,
    };
}

// ── applySewerFareEffect ─────────────────────────────────────────────────────
//
// Delivers a sewerFare item's damage/heal directly to `recipient` — a hand-fed
// dose, not a thrown splash, so it lands at FULL magnitude (no half-turns, no
// half-damage the way resolveThrow's 3x3 burst discounts a near-miss). Mirrors
// resolveThrow's isDot branch (game/items.js) for `poition` items, both riding
// the shared poitionBuff helper, so the two paths can't drift on the sign-flip
// rule; `damage` items (mystery_meat) are applied
// as a direct HP delta instead of through Game.combatAttack — that pipeline
// (Entity.takeDamage's `Math.max(1, dmg - armor)` floor, elemental/backstab/
// hit-splat/kill-event machinery) is built for positive combat damage only
// (see the KNOWN LIMITATION note in items.js's resolveThrow), but a hand-fed
// gift never goes through combatAttack in the first place, so that limitation
// doesn't apply here — a flat damage/heal number is all this needs.
function applySewerFareEffect(item, recipient, dwellerFriendly) {
    if (item.poition) {
        // poitionBuff's `flip` does the sign inversion — see its doc comment
        // in items.js. dwellerFriendly IS the flip here: medicine for a sewer-
        // dweller, poison for anyone else.
        const buff = poitionBuff(item.poition, dwellerFriendly);
        const list = recipient.buffs || (recipient.buffs = []);
        const existing = list.find(b => b.id === buff.id);
        if (existing) {
            existing.turns = buff.turns; // a direct feeding is the whole dose — no half-turns to reconcile
            existing.dmg = Math.abs(buff.dmg) > Math.abs(existing.dmg ?? 0) ? buff.dmg : existing.dmg;
        } else {
            list.push({ id: buff.id, turns: buff.turns, dmg: buff.dmg });
        }
    } else if (typeof item.damage === 'number') {
        const ent = recipient.entity;
        if (!ent) return;
        const delta = dwellerFriendly ? item.damage : -item.damage;
        ent.hp = Math.max(0, Math.min(ent.maxHp, ent.hp + delta));
        if (ent.hp <= 0) { ent.hp = 0; ent.alive = false; }
    }
}

// ── applySewerFareGive ───────────────────────────────────────────────────────
//
// (Task 17) Sewer fare given to a sewer-dweller is medicine — the ordinary
// gift math applies unchanged (species just decides which way the item's own
// effect points, above). Given to anyone else, it's a social attack: the
// effect lands as poison AND the disposition hit is engineered to always
// exceed the credit the same gift would otherwise have earned (never a
// net-positive way to raise their opinion of you), scaled worse the more they
// wanted the item (their own `values` weight — the betrayal is proportional
// to the want). Whether the betrayal is big enough to turn them hostile keys
// off the same `flipThreshold` a normal gift uses to flip to ally, just
// mirrored downward.
function applySewerFareGive(item, recipient) {
    const dwellerFriendly = isSewerDweller(recipient);
    applySewerFareEffect(item, recipient, dwellerFriendly);

    if (dwellerFriendly) {
        const preview = previewGive(item, recipient);
        recipient.disposition = preview.newDisposition;
        const isFlipping = preview.wouldFlip && !recipient._wasFlipped;
        if (isFlipping) {
            recipient._wasFlipped = true;
            applyFlip(recipient);
            return { accepted: true, flipped: true, log: flipLogLine(item, recipient) };
        }
        return {
            accepted: true,
            flipped: false,
            log: `[The ${recipient.type} savors the ${item.name} — down here, it's medicine. Disposition +${preview.shift}.]`,
        };
    }

    const weight = recipient.values?.[item.id] ?? 0;
    const wouldBeCredit = weight * SHIFT_MULTIPLIER;
    const penalty = -(SEWER_FARE_PENALTY_BASE + wouldBeCredit);
    const current = recipient.disposition ?? 0;
    const newDisposition = clampDisposition(recipient, current + penalty);
    recipient.disposition = newDisposition;

    const threshold = recipient.flipThreshold ?? 30;
    const turnsHostile = newDisposition <= -threshold && !isHostile(recipient);

    if (turnsHostile) {
        // Mirrors main.js's _onEntityHarmed reaction bus (the same "you just
        // hurt a non-hostile, they turn on you" beat) without needing `game` —
        // give-action.js stays isolated to the recipient it mutates.
        recipient.allegiance = 'hostile';
        recipient.fsmState = 'HOSTILE';
        recipient.state = 'chasing';
        recipient._ally = false;
        // Clear the STOCK with the flag. The offer screen lists npc.stock
        // without gating on npc.vendor, so a de-vendored NPC who keeps their
        // stock keeps a browsable till they no longer have.
        if (recipient.vendor) { recipient.vendor = false; recipient.stock = null; }
        if (recipient.ambient) recipient.ambient = false;
        return {
            accepted: true,
            flipped: true,
            log: `[The ${recipient.type} realizes what you fed it — and comes at you!]`,
        };
    }

    return {
        accepted: true,
        flipped: false,
        log: `[The ${recipient.type} eats the ${item.name}... something's wrong. Disposition ${penalty}.]`,
    };
}

// ── applyDispositionDelta ───────────────────────────────────────────────────
//
// Dialogue-side disposition shift: nudge `recipient`'s disposition by a flat
// `delta` (a conversation choice, not a gift), clamped to the recipient's own
// ceiling. Fires the same flip-to-ally threshold logic as applyGive when
// crossed upward.
// Returns { newDisposition, flipped }.

export function applyDispositionDelta(recipient, delta) {
    const current = recipient.disposition ?? 0;
    recipient.disposition = clampDisposition(recipient, current + (delta || 0));
    const threshold = recipient.flipThreshold ?? 30;
    const flipped = recipient.disposition >= threshold && !recipient._wasFlipped;
    if (flipped) { recipient._wasFlipped = true; applyFlip(recipient); }
    return { newDisposition: recipient.disposition, flipped };
}

// ── reactToTransaction ──────────────────────────────────────────────────────
//
// (transaction spine) One seam for "the target reacts to a transaction I just
// made with them." It records the transaction in the NPC's `giftLog` (a stub for
// future barter/memory — "what did the player hand me, and when?") and then
// applies the disposition consequence, delegating to the existing math:
//   - GIVE  weights the shift by the item's `values` (applyGive)
//   - BRIBE is a flat delta (applyDispositionDelta)
// Both fire the shared flip-to-ally/discount logic. buy/sell don't shift
// disposition today (they're gated by canTrade), so they just log. Returns
// whatever the underlying handler returns (GIVE's {accepted, flipped, log}).
export function reactToTransaction(npc, type, payload = {}) {
    if (!npc) return null;
    if (Array.isArray(npc.giftLog)) {
        npc.giftLog.push({ type, itemId: payload.item?.id ?? null, gold: payload.gold ?? null });
    }
    switch (type) {
        case 'give':  return applyGive(payload.item, npc);
        case 'bribe': return applyDispositionDelta(npc, payload.delta ?? 0);
        // (theft) The only transaction that moves disposition DOWNWARD in one
        // step rather than by a weighted shift — being robbed is not a bad deal,
        // it is a betrayal.
        case 'theft': applyHostileFlip(npc); return { flipped: true };
        default:      return null;
    }
}

// ── Paranoia ────────────────────────────────────────────────────────────────
//
// A search that ends without a culprit does not simply reset. The victim tells
// people, and the immediate area gets warier of EVERYONE.
//
// The delta is one full trade band, so a failed search moves every merchant in
// earshot down exactly one price tier — legible the instant you try to buy
// something, with no new UI at all. The existing decay walks it back over a few
// minutes of free-roam, so a district cools off on its own.
//
// Why this is not the goofy CRPG version where the whole map psychically knows:
// nobody identifies you and nobody points. It is social, not omniscient. And it
// fires ONLY on a search that FAILS — get caught and it stays between the two of
// you; get away with it and the chill spreads.
//
// On the two floors, which are deliberately different: disposition-curves caps a
// bad DEAL at RESENT_FLOOR, because haggling badly should never be able to make
// an enemy. Theft and its paranoia punch straight through that and can stack to
// DISPOSITION_MIN, because a crime is not a bad deal.
export const PARANOIA_DELTA  = -BANDS_STEP;
export const PARANOIA_RADIUS = 6;

export function spreadParanoia(npcs, origin, victim = null) {
    if (!origin) return;
    for (const n of npcs || []) {
        if (!n || n === victim) continue;            // already at the floor; do not double-hit
        if (!n.entity?.isAlive?.()) continue;
        if (n._ally) continue;                       // loyalty is locked, same as the decay rule
        if (Math.max(Math.abs(n.x - origin.x), Math.abs(n.y - origin.y)) > PARANOIA_RADIUS) continue;
        // applyDispositionDelta, so this inherits the one clamp. Note the clamp is
        // now per-NPC — [DISPOSITION_MIN, dispositionCeil(npc)] since the offer
        // screen — but only its CEILING varies, and paranoia only ever moves
        // downward, so every NPC still bottoms out at the same floor. Verified
        // rather than assumed, because the spec warned this contract had changed.
        applyDispositionDelta(n, PARANOIA_DELTA);
    }
}

// ── applyHostileFlip ────────────────────────────────────────────────────────
//
// The mirror of applyFlip, which handles only the UPWARD becomeAlly /
// offerDiscount cases. Until now nothing in the codebase turned anyone AGAINST
// you — every path led up. A noticed theft is the first thing that needs the
// other direction.
//
// Two deliberate omissions, both load-bearing:
//
//   `_wasFlipped` is NOT set, so a later bribe crossing their threshold can
//   still buy them back. From the floor that is expensive, and it should be —
//   but a permanently unforgiving enemy is a dead end, not a cost.
//
//   The last-seen is CLEARED rather than set to the player. They learn they were
//   robbed, not by whom or from where. Being noticed costs you a permanent
//   enemy; it does not hand them your position. That empty last-seen is also
//   what makes the victim the ONLY producer of a searcher with no lead, which is
//   what BLIND_SWEEP_BEATS in perception.js was written for and has been waiting
//   on since it shipped.
// The PERMANENT half of turning against you: the four fields that outlive the
// moment and have to survive a save. Split out because spawnEnemy re-applies
// exactly this when a robbed victim re-hydrates from map JSON on zone re-entry —
// and must NOT re-apply the searching state, since the sweep already happened.
// One spelling, so the two cannot drift.
export function makeHostile(recipient) {
    if (!recipient) return;
    // DISPOSITION_MIN, not a literal -100 — give-action already imports the
    // constant for clampDisposition, and a fourth spelling of the floor is how
    // the ceiling ended up disagreeing with itself before the offer screen.
    recipient.disposition = DISPOSITION_MIN;
    recipient.allegiance  = 'hostile';
    recipient.fsmState    = 'HOSTILE';
    recipient._ally       = false;
}

export function applyHostileFlip(recipient) {
    if (!recipient) return;
    makeHostile(recipient);
    recipient.state       = 'searching';
    recipient._lastSeenX  = null;
    recipient._lastSeenY  = null;
    recipient._sweepBeats = 0;
    recipient._awareBeats = 0;
}

// ── applyFlip ───────────────────────────────────────────────────────────────
//
// Dispatches on the recipient's `onFlip` value. Each onFlip mode is a
// different *consequence* of crossing the disposition threshold —
// becomeAlly turns off hostility, offerDiscount sets the merchant flag,
// etc. New onFlip modes are added here as new gameplay verbs ship.

function applyFlip(recipient) {
    // Default missing onFlip to 'becomeAlly' — the most common outcome
    // for a combat NPC who's been bribed enough to switch sides. Carrion
    // explicitly opts into offerDiscount; bribery-immune NPCs never reach
    // this code because applyGive returned early. Anything else defaults
    // to becomeAlly so the give action has an observable effect even for
    // map data that pre-dates the give-action feature.
    const onFlip = recipient.onFlip || 'becomeAlly';
    switch (onFlip) {
        case 'becomeAlly':
            // (AGGRO behavior bands) Crossing the flip threshold turns this NPC
            // into a fighting ALLY, not just a pacified bystander. Setting
            // allegiance='ally' + fsmState='ALLIED' routes them into the ALLIED
            // FSM state (npc.js → game._allyTakeTurn), which hunts the player's
            // hostiles, attacks them, and leash-follows the player when there's
            // no one to fight. `_ally` marks them so the player's own attacks
            // re-flip them back to hostile (friendly fire has a cost) and so
            // allies never target each other. Works uniformly whether the NPC
            // was a born-hostile chaser or an FSM worker.
            recipient._ally = true;
            recipient.allegiance = 'ally';   // authoritative — routes to the ALLIED FSM state
            recipient.state = 'idle';        // clear legacy chase state
            recipient.fsmState = 'ALLIED';   // explicit post-flip state
            recipient._lastWanderTurn = 0;
            break;

        case 'offerDiscount':
            // Merchant-side flip — set the discount flag. Future merchant
            // UI (when Carrion's trade screen exists) will check this.
            recipient._discountMode = true;
            // No FSM change — these NPCs were never hostile to begin with.
            break;

        default:
            // Unknown onFlip mode — log a dev warning once and proceed
            // without doing anything special. Disposition still went up;
            // the NPC just won't have any other observable change.
            if (!recipient._warnedUnknownOnFlip) {
                console.warn(`[give-action] Unknown onFlip "${recipient.onFlip}" on ${recipient.id}`);
                recipient._warnedUnknownOnFlip = true;
            }
    }
}

// ── flipLogLine ─────────────────────────────────────────────────────────────
//
// Picks the right log line based on the recipient's onFlip mode. Each
// flip mode gets its own flavor message — the cosmology-and-arc.md
// canon-doc's "bureaucratic procedure for absurd content" rule applies
// here: a fungus who stops snarling reads as a *labor relations* shift,
// not as supernatural charm.

function flipLogLine(item, recipient) {
    // Same default as applyFlip — missing onFlip reads as becomeAlly.
    switch (recipient.onFlip || 'becomeAlly') {
        case 'becomeAlly':
            return `[The ${recipient.type} pockets the ${item.name} — they stop snarling at you.]`;
        case 'offerDiscount':
            return `[${recipient.type} accepts the ${item.name}. "...much obliged. I'll work you a deal next time."]`;
        default:
            return `[The ${recipient.type} pockets the ${item.name}. Something in them shifts.]`;
    }
}
