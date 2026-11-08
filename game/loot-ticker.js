// loot-ticker.js — a vertical slot-machine reel that rolls through what a kill gave
// (plans/fx3c-slot-machine-loot-reel.md, FX3c).
//
// Pure show, like the burst (loot-burst.js): by the time a reel starts, every item
// is already in the bag. Nothing here touches game state or the seeded RNG, and
// nothing waits on it. The renderer asks which lines are where at a given moment;
// main's effect loop asks whether a reel is still alive; any key clears it.
//
// One line per kind of item: its icon and name, its rarity (the Common..Legendary
// ladder, in its colour), the count, and its gold value (the item's base value).
// The strip rolls up through a window three lines tall, one item after another,
// then the last line holds and the panel fades. A one-item kill is one line with
// nothing to roll.

import { itemTier } from './items.js';

export const TICKER = Object.freeze({
    IN_MS: 120,            // fade in
    MAX_ITEM_MS: 420,      // the slowest an item rolls past (a short list)
    MIN_ITEM_MS: 110,      // the fastest (a long list stays readable)
    ROLL_BUDGET_MS: 2400,  // about how long the whole roll takes before the last line holds
    ROLL_FRAC: 0.6,        // the share of an item's time spent moving; the rest it sits still
    HOLD_MS: 900,          // the last line stays this long
    OUT_MS: 300,           // fade out
    WINDOW_ROWS: 3,        // lines in view when there is more than one
    DIM: 0.55,             // how much a line one row off-centre fades
});

// One line for an item def: everything the reel shows, taken from the game as it is.
export function reelEntry(def) {
    const tier = itemTier(def);
    return {
        id: def.id, icon: def.icon, name: def.name,
        tierName: tier.name, color: tier.color,
        count: 1, value: def.baseValue ?? 0,
    };
}

// A kill's item defs folded into lines, in the order they came: two of one item are
// one line with a count.
export function reelEntries(defs) {
    const out = [], at = new Map();
    for (const def of defs || []) {
        if (!def) continue;
        const seen = at.get(def.id);
        if (seen) seen.count++;
        else { const e = reelEntry(def); at.set(def.id, e); out.push(e); }
    }
    return out;
}

// How long each item takes to roll past when the reel has n lines: a long list rolls
// faster, down to a floor.
export function itemMs(n) {
    if (n < 1) return TICKER.MAX_ITEM_MS;
    return Math.min(TICKER.MAX_ITEM_MS, Math.max(TICKER.MIN_ITEM_MS, TICKER.ROLL_BUDGET_MS / n));
}

// Lines in view: one item is one line, more is a three-line window.
export function windowRows(n) { return n > 1 ? TICKER.WINDOW_ROWS : n; }

export function makeReel(entries, now) {
    return { entries: entries.map(e => ({ ...e })), bornAt: now };
}

// From the first line centred to the end: the roll, the hold, the fade.
export function reelDuration(n) {
    return n > 0 ? (n - 1) * itemMs(n) + TICKER.HOLD_MS + TICKER.OUT_MS : 0;
}

export function reelDone(reel, now) {
    return !reel || now - reel.bornAt >= reelDuration(reel.entries.length);
}

// The reel if it is still rolling at `now`, else null.
export function liveReel(reel, now) {
    return reelDone(reel, now) ? null : reel;
}

// How far down the strip the window has rolled at `t` ms in: 0 is the first line
// centred, n - 1 the last. It moves for ROLL_FRAC of each item's time, eased, and
// sits still for the rest.
export function rollPosition(n, t) {
    if (n <= 1 || t <= 0) return 0;
    const ms = itemMs(n);
    const q = t / ms, k = Math.floor(q);
    if (k >= n - 1) return n - 1;
    const f = q - k, still = 1 - TICKER.ROLL_FRAC;
    const m = f <= still ? 0 : (f - still) / TICKER.ROLL_FRAC;
    return k + m * m * (3 - 2 * m);
}

// What to draw at `now`: { alpha, s, rows: [{ entry, offset, weight }] } or null.
// `offset` is the line's distance from the centre in rows (negative is above); the
// renderer places it at centre + offset * row height. `weight` is 1 in the centre and
// fades toward the edges.
export function reelFrame(reel, now) {
    if (reelDone(reel, now)) return null;
    const n = reel.entries.length, t = now - reel.bornAt, total = reelDuration(n);
    const s = rollPosition(n, t);
    const alpha = Math.min(1, t / TICKER.IN_MS) * Math.min(1, (total - t) / TICKER.OUT_MS);
    const rows = [];
    for (let i = 0; i < n; i++) {
        const offset = i - s;
        if (Math.abs(offset) > 1.5) continue;
        rows.push({ entry: reel.entries[i], offset, weight: 1 - TICKER.DIM * Math.min(1, Math.abs(offset)) });
    }
    return { alpha: Math.max(0, alpha), s, rows };
}

// A kill while a reel is still rolling: what the old reel had not finished with
// joins the new items, and one reel starts again, so a crowd does not flicker.
export function extendReel(old, entries, now) {
    if (reelDone(old, now)) return makeReel(entries, now);
    const t = now - old.bornAt;
    const from = Math.floor(rollPosition(old.entries.length, t));
    const merged = [];
    for (const e of [...old.entries.slice(from), ...entries]) {
        const same = merged.find(m => m.id === e.id);
        if (same) same.count += e.count;
        else merged.push({ ...e });
    }
    return makeReel(merged, now);
}
