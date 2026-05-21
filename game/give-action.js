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

// Tuning constant — controls how much disposition each unit of `values`
// shifts. Currently 5 (so values:{soap:8} means soap gives +40 disposition).
// Balance knob; revisit after first playtest.
export const SHIFT_MULTIPLIER = 5;

// ── previewGive ─────────────────────────────────────────────────────────────
//
// Pure: returns what *would* happen if `item` were given to `recipient`,
// without mutating anything. Used by Phase B's hover-preview UI to show
// the player the consequence before they commit.

export function previewGive(item, recipient) {
    const itemId = item?.id;
    const valueWeight = recipient.values?.[itemId] ?? 0;
    const shift = valueWeight * SHIFT_MULTIPLIER;
    const current = recipient.disposition ?? 0;
    const newDisposition = current + shift;
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
    // bribery trivializing combat.
    if (recipient.bribeable === false) {
        return {
            accepted: false,
            flipped: false,
            log: `[The ${recipient.type} ignores your offering.]`,
        };
    }

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
            // Remove HOSTILE from the behavior whitelist. The FSM dispatch
            // in enemies.js will then route this NPC through npc.js, which
            // sees no HOSTILE and leaves them in IDLE. They stop attacking
            // by virtue of the whitelist alone — no FSM code change needed.
            //
            // Edge case: if the NPC was a legacy chaser (no behavior field
            // at all), give them one now with HOSTILE explicitly absent.
            // They become FSM-controlled from this moment forward.
            //
            // We set fsmState='IDLE' explicitly rather than relying on the
            // lazy init in tickNpcState — this guarantees the post-flip
            // state even when the resulting whitelist is empty (a flipped
            // legacy chaser ends up with behavior=[] after filtering).
            recipient.behavior = (recipient.behavior || ['HOSTILE'])
                .filter(s => s !== 'HOSTILE');
            recipient.state = 'idle';        // reset legacy chase state
            recipient.fsmState = 'IDLE';     // explicit post-flip state
            recipient._lastWanderTurn = 0;   // reset wander cadence
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
