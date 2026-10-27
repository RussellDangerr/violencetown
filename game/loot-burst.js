// loot-burst.js — a kill's loot bursts out of the body and flies to you
// (plans/fx3-auto-loot-burst.md, FX3b).
//
// Pure show: by the time a burst starts, every item in it is already in the bag
// (main.js _takeKillLoot). Nothing here touches game state or the seeded RNG,
// and nothing waits on it, so it can never hold a turn or block a key. The
// renderer asks where each item is at a given moment; main's effect loop asks
// whether any burst is still in the air.
//
// One item's life, from its own start (items leave STAGGER_MS apart):
//   pop   POP_MS   out of the body to RADIUS tiles away, on a hop of HOP tiles
//   hang  HANG_MS  still, at that spot
//   fly   FLY_MS   into the player, speeding up as it goes, then gone
// Items spread evenly round the body, the first straight up.

export const BURST = Object.freeze({
    STAGGER_MS: 60,
    POP_MS: 240,
    HANG_MS: 140,
    FLY_MS: 260,
    RADIUS: 1.1,   // tiles from the body's centre
    HOP: 0.6,      // tiles of lift at the top of the pop
    START_SCALE: 0.5,
    END_SCALE: 0.6,
});

const ITEM_MS = BURST.POP_MS + BURST.HANG_MS + BURST.FLY_MS;

// A burst from the body at tile (x, y) of `items` (item defs or ids), born at `now`.
export function makeBurst(x, y, items, now) {
    return { x, y, items: items.map(it => (typeof it === 'string' ? { id: it } : it)), bornAt: now };
}

// How long a burst of n items lasts, first pop to last landing.
export function burstDuration(n) {
    return n > 0 ? (n - 1) * BURST.STAGGER_MS + ITEM_MS : 0;
}

export function burstDone(burst, now) {
    return now - burst.bornAt >= burstDuration(burst.items.length);
}

// Bursts still in the air at `now`.
export function liveBursts(bursts, now) {
    return (bursts || []).filter(b => !burstDone(b, now));
}

// The direction item i of n leaves the body in: evenly round, the first up.
export function burstAngle(i, n) {
    return -Math.PI / 2 + (n > 0 ? (i * 2 * Math.PI) / n : 0);
}

// Where every item in the air is at `now`, in the same units as `body` and
// `player` (the renderer passes screen pixels; `tile` is pixels per tile).
// Items not yet out and items already landed are left out.
// Returns [{ item, x, y, scale, phase }], with x, y the icon's centre.
export function burstFrame(burst, now, body, player, tile, { flat = false } = {}) {
    const out = [];
    const n = burst.items.length;
    for (let i = 0; i < n; i++) {
        const a = now - burst.bornAt - i * BURST.STAGGER_MS;
        if (a < 0 || a >= ITEM_MS) continue;
        const ang = burstAngle(i, n);
        const ox = body.x + Math.cos(ang) * BURST.RADIUS * tile;
        const oy = body.y + Math.sin(ang) * BURST.RADIUS * tile;
        let x, y, scale, phase;
        if (a < BURST.POP_MS) {
            const p = a / BURST.POP_MS;
            const e = 1 - (1 - p) * (1 - p);                       // ease out
            const lift = flat ? 0 : Math.sin(Math.PI * p) * BURST.HOP * tile;
            x = body.x + (ox - body.x) * e;
            y = body.y + (oy - body.y) * e - lift;
            scale = BURST.START_SCALE + (1 - BURST.START_SCALE) * e;
            phase = 'pop';
        } else if (a < BURST.POP_MS + BURST.HANG_MS) {
            x = ox; y = oy; scale = 1; phase = 'hang';
        } else {
            const q = (a - BURST.POP_MS - BURST.HANG_MS) / BURST.FLY_MS;
            const e = q * q;                                       // ease in
            x = ox + (player.x - ox) * e;
            y = oy + (player.y - oy) * e;
            scale = 1 + (BURST.END_SCALE - 1) * e;
            phase = 'fly';
        }
        out.push({ item: burst.items[i], x, y, scale, phase });
    }
    return out;
}
