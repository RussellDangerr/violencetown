// rng.js — Mulberry32 seeded PRNG.
//
// One RNG instance (game.rng) is the single source of randomness for
// gameplay, so a run is reproducible from its seed and — critically for
// save/load — resumable. Mulberry32's internal state advances on every draw;
// the save persists getState() and restores via setState(), so a reloaded
// run continues the SAME stream rather than replaying from the original seed.
//
// Purely-visual, per-frame randomness (e.g. the renderer's screen-shake
// offset) intentionally stays on Math.random — it doesn't affect game state,
// so determinism there buys nothing.

// A fresh 32-bit seed. Uses crypto when available, else a time/Math.random mix.
export function randomSeed() {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        return crypto.getRandomValues(new Uint32Array(1))[0] >>> 0;
    }
    return (Date.now() ^ (Math.random() * 0x100000000)) >>> 0;
}

export class RNG {
    constructor(seed = randomSeed()) {
        this._s = seed >>> 0;
    }

    // Float in [0, 1). Advances the internal state (Mulberry32).
    float() {
        this._s = (this._s + 0x6D2B79F5) >>> 0;
        let t = this._s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    // Integer in [0, maxExclusive). Drop-in for Math.floor(Math.random()*n).
    int(maxExclusive) {
        return Math.floor(this.float() * maxExclusive);
    }

    // Integer in [min, maxInclusive].
    range(min, maxInclusive) {
        return min + this.int(maxInclusive - min + 1);
    }

    // Uniform pick from a non-empty array (undefined if empty/null).
    pick(arr) {
        if (!arr || arr.length === 0) return undefined;
        return arr[this.int(arr.length)];
    }

    // Persist/restore the live state so reloads resume the same stream.
    getState() { return this._s >>> 0; }
    setState(s) { this._s = s >>> 0; }
}
