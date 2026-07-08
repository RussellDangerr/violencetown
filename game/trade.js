// trade.js — shop / barter pricing, driven by the AGGRO (disposition) meter.
//
// Slice 1 of the trade system: pure, deterministic pricing + bribery math.
// No game mutation here — main.js does the buying/selling/bribing and calls
// these to get prices. Gold == value 1:1 (items carry `baseValue`); there is
// no weight mechanic. Prices key off the trader's `disposition` (-100..+100)
// bucketed into 8 "AGGRO levels" every 25 points. Below the TRADE_FLOOR a
// trader simply won't deal — you have to bribe them up first.
//
// (Roadmap, later slices: drag-to-swap equipment barter, NPC loadouts +
// stat-gear, item drop rates, recovery-on-death. Not here.)
//
// This module only READS disposition to price things; it is MOVED by gifts,
// bribes, and dialogue over in give-action.js — two halves of one spine.

export const TRADE_FLOOR = -50;   // disposition below this == "won't deal"
export const BRIBE_STEP  = 5;     // disposition gained per bribe tap

// Disposition band → price multipliers (buy = what the player pays as a
// multiple of baseValue; sell = what the player receives). Friendlier traders
// charge less and pay more; there is always a buy/sell spread so flipping items
// back and forth is never free money. `null` band == won't trade.
const BANDS = [
    { min:  75, mood: 'adoring',  face: 'beam',    buy: 1.0,  sell: 0.70 },
    { min:  50, mood: 'warm',     face: 'happy',   buy: 1.2,  sell: 0.60 },
    { min:  25, mood: 'friendly', face: 'content', buy: 1.4,  sell: 0.55 },
    { min:   0, mood: 'neutral',  face: 'neutral', buy: 1.6,  sell: 0.50 },
    { min: -25, mood: 'wary',     face: 'wary',    buy: 1.9,  sell: 0.45 },
    { min: -50, mood: 'hostile',  face: 'angry',   buy: 2.4,  sell: 0.40 },
];

// The band for a disposition value, or null if below the trade floor.
export function band(disposition) {
    const d = disposition ?? 0;
    if (d < TRADE_FLOOR) return null;
    for (const b of BANDS) if (d >= b.min) return b;
    return null;
}

// Will this trader deal at all right now?
export function canTrade(disposition) {
    return band(disposition) !== null;
}

// Mood readout for the AGGRO smiley + label (works even below the floor).
export function mood(disposition) {
    const b = band(disposition);
    if (b) return { mood: b.mood, face: b.face };
    return { mood: "won't deal", face: 'refuse' };
}

// Price the player PAYS to buy `item` from a trader at `disposition`. Min 1.
export function buyPrice(item, disposition) {
    const b = band(disposition);
    if (!b || !item) return null;
    return Math.max(1, Math.ceil((item.baseValue || 0) * b.buy));
}

// Price the player RECEIVES selling `item` to a trader at `disposition`.
// Worthless items (baseValue 0, e.g. quest items) and quest items don't sell.
export function sellPrice(item, disposition) {
    const b = band(disposition);
    if (!b || !item || item.questItem || !item.baseValue) return null;
    return Math.max(1, Math.floor(item.baseValue * b.sell));
}

// Gold cost to nudge disposition up by one BRIBE_STEP from `disposition`.
// Per-point rate rises across the step so a fat wallet can't trivialize fights:
// ~1 GP/point while they still dislike you (calming is cheap), ~2 GP/point once
// you're buying loyalty above neutral. (Per the gold-weighting research.)
export function bribeStepCost(disposition) {
    let cost = 0;
    const d0 = disposition ?? 0;
    for (let p = 0; p < BRIBE_STEP; p++) {
        cost += (d0 + p) < 0 ? 1 : 2;
    }
    return cost;
}

// ── The transaction spine ────────────────────────────────────────────────────
//
// transferGold is the SINGLE choke-point for gold moving between two holders — a
// "holder" is anything with a numeric `gold` (the player Game, or an NPC). Buy,
// sell, bribe, and dialogue costs all route through here instead of poking
// `game.gold` (and, before now, never touching the NPC's side). It strictly
// CONSERVES gold: it returns false and moves nothing if `from` can't cover the
// amount. That makes gold auditable and opens future hooks — a vendor's till
// running dry, an NPC that pays you back, taxes — all in one place. `reason` is
// advisory (for logging / future hooks).
export function transferGold(from, to, amount, reason = '') {
    if (!from || !to || !(amount > 0)) return false;
    if ((from.gold ?? 0) < amount) return false;
    from.gold = (from.gold ?? 0) - amount;
    to.gold   = (to.gold ?? 0) + amount;
    return true;
}
