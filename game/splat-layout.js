// splat-layout.js — where hit splats sit, and how big their badge is.
//
// A splat is a pill sized to its number (the old round badge was sized for the
// retired 8px bitmap font and was mostly padding). Splats on one target are
// laid out by HOW MANY are showing, RuneScape-style: a lone splat sits in the
// centre, and the spots spread only as more arrive — two stack, three make a
// triangle, four take the compass points. They never fly: a flying badge
// ~36px wide that travelled 14-22px overlapped its neighbours whatever the fan.
// When the count changes, the renderer glides each splat to its new spot.
//
// Pure: no DOM. Tested in tests/cascade.test.js (the no-overlap invariant).

export const SPLAT_H = 12;          // pill height, px — the 12px VT323 line
export const SPLAT_PAD_X = 3;       // px between the number and the pill's ends

// Spots by how many splats are showing, in the order they arrived. Spaced so no
// two resting pills touch, crits included, up to four characters ("-999") — the
// invariant tests/cascade.test.js pins. (The brief pop on impact may still
// brush a neighbour; it settles in a few frames.) Past four, they cycle the
// four-splat spots.
export const SPLAT_LAYOUTS = [
    [],
    [{ x: 0, y: 0 }],                                                    // centre
    [{ x: 0, y: -8 }, { x: 0, y: 8 }],                                   // stacked
    [{ x: 0, y: -9 }, { x: -16, y: 8 }, { x: 16, y: 8 }],                // triangle
    [{ x: 0, y: -15 }, { x: 16, y: 0 }, { x: 0, y: 15 }, { x: -16, y: 0 }], // N, E, S, W
];

// The spot for the `index`-th of `count` splats showing on one target.
export function splatSpot(index, count) {
    const layout = SPLAT_LAYOUTS[Math.min(Math.max(count, 1), 4)];
    return layout[index % layout.length];
}

// The pill for a number `textW` px wide: never narrower than it is tall, so a
// one-digit hit is a round dot rather than a sliver. A crit is 1.2x.
export function splatPill(textW, crit = false) {
    const k = crit ? 1.2 : 1;
    const h = SPLAT_H * k;
    const w = Math.max(textW + SPLAT_PAD_X * 2, SPLAT_H) * k;
    return { w, h };
}

// Assign every splat its spot: group by tile, order each group by arrival, and
// look the spot up by the group's size. Returns a Map splat -> { x, y }.
export function layoutSplats(splats) {
    const groups = new Map();
    for (const s of splats) {
        const key = `${s.tileX},${s.tileY}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(s);
    }
    const spots = new Map();
    for (const group of groups.values()) {
        group.sort((a, b) => a.bornAt - b.bornAt);
        group.forEach((s, i) => spots.set(s, splatSpot(i, group.length)));
    }
    return spots;
}

// Glide a splat's drawn position toward its spot. Exponential ease, so it is
// frame-rate independent; a new splat (no position yet) starts on its spot.
export const SPLAT_GLIDE_MS = 45;   // time constant: ~90% of the way in ~100 ms
export function glideToward(current, target, dtMs, tau = SPLAT_GLIDE_MS) {
    if (!current) return { x: target.x, y: target.y };
    const k = 1 - Math.exp(-Math.max(0, dtMs) / tau);
    return { x: current.x + (target.x - current.x) * k, y: current.y + (target.y - current.y) * k };
}
