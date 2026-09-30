// splat-layout.js — where hit splats sit, and how big their badge is.
//
// A splat is a pill sized to its number (the old round badge was sized for the
// retired 8px bitmap font and was mostly padding). Splats on one target take
// FIXED spots, RuneScape-style — centre, above, lower-left, lower-right — rather
// than flying outward: a flying badge ~36px wide that travelled 14-22px
// overlapped its neighbours whatever the fan, and heals ignored the fan
// entirely. Main picks the lowest free spot; the renderer draws it here.
//
// Pure: no DOM. Tested in tests/cascade.test.js (the no-overlap invariant).

export const SPLAT_H = 12;          // pill height, px — the 12px VT323 line
export const SPLAT_PAD_X = 3;       // px between the number and the pill's ends

// Offsets from the target's splat anchor, by slot. Past the fourth, they cycle.
// Spaced so no two resting pills touch, crits included, up to four characters
// ("-999") — the invariant tests/cascade.test.js pins. (The brief pop on impact
// may still brush a neighbour; it settles in a few frames.)
export const SPLAT_SLOTS = [
    { x: 0, y: 0 },       // centre
    { x: 0, y: -16 },     // above
    { x: -16, y: 15 },    // lower-left
    { x: 16, y: 15 },     // lower-right
];

export function splatSlotOffset(slot) {
    return SPLAT_SLOTS[((slot % SPLAT_SLOTS.length) + SPLAT_SLOTS.length) % SPLAT_SLOTS.length];
}

// The pill for a number `textW` px wide: never narrower than it is tall, so a
// one-digit hit is a round dot rather than a sliver. A crit is 1.2x.
export function splatPill(textW, crit = false) {
    const k = crit ? 1.2 : 1;
    const h = SPLAT_H * k;
    const w = Math.max(textW + SPLAT_PAD_X * 2, SPLAT_H) * k;
    return { w, h };
}

// The lowest slot not already held by a splat still on screen.
export function freeSplatSlot(taken) {
    let slot = 0;
    while (taken.has(slot)) slot++;
    return slot;
}
