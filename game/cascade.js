// cascade.js — the enemy phase, played back one actor at a time.
//
// plans/turn-model.md, reading C step 1. The logic already runs in sequence:
// resolveEnemyTurns is a loop, and each enemy acts on the world the one before
// it left. What the player saw was one beat — every blow's splat, flash and
// shake on the same frame. Here each actor's effects are held while the enemy
// phase resolves, then played back in the order the actors went, BEAT_MS apart,
// so the order reads. Moves are not held: slides still play together.
//
// Playback only. Nothing here changes what happened, only when it is shown,
// and a key press plays everything still held at once (flush), so the player
// never waits on it (combat-ui-layers.md: never make the player wait for an
// animation).
//
// Pure: no DOM, no game. main.js passes the clock in.

export const CASCADE_BEAT_MS = 130;

// An attacker's lunge toward whoever it hit, played on its beat so the player
// can see who landed the blow: out LUNGE_TILES and back, over LUNGE_MS.
export const LUNGE_MS = 120;
export const LUNGE_TILES = 0.3;

// How far along its lunge an actor is drawn, in tiles toward its target, at
// `now`: a half-sine out and back, 0 before and after.
export function lungeOffset(lungeAt, now, ms = LUNGE_MS, tiles = LUNGE_TILES) {
    if (lungeAt == null) return 0;
    const t = (now - lungeAt) / ms;
    if (t <= 0 || t >= 1) return 0;
    return Math.sin(Math.PI * t) * tiles;
}

export function createCascade({ beatMs = CASCADE_BEAT_MS } = {}) {
    let recording = false;
    let order = [];            // actors, in the order they went this phase
    let groups = new Map();    // actor -> [{ fn, hp }]
    let queue = [];            // committed: [{ at, fn, hp }], sorted by `at`
    let heldHp = 0;            // damage already dealt to the player, not yet shown

    const runAll = (items) => { for (const it of items) { heldHp -= it.hp; it.fn(); } };

    return {
        beatMs,

        // Start recording an enemy phase. Anything still held from the last one
        // plays now — a new phase never lands on top of an unshown one.
        begin() {
            this.flush();
            recording = true;
            order = [];
            groups = new Map();
        },

        recording() { return recording; },

        // The actor whose turn is starting. Sets the playback order; an actor
        // that ends up showing nothing takes no beat.
        mark(actor) {
            if (recording && !order.includes(actor)) order.push(actor);
        },

        // Hold `fn` (an effect) for `actor`'s beat. `hp` is damage the player has
        // already taken that this effect shows, so the HP bar can wait for it.
        // Returns false when not recording — the caller then runs `fn` itself.
        defer(actor, fn, { hp = 0 } = {}) {
            if (!recording) return false;
            this.mark(actor);
            if (!groups.has(actor)) groups.set(actor, []);
            groups.get(actor).push({ fn, hp });
            heldHp += hp;
            return true;
        },

        // Stop recording and lay the held effects out on the clock: the first
        // actor with something to show plays at `now`, each next one a beat later.
        commit(now) {
            recording = false;
            let slot = 0;
            for (const actor of order) {
                const items = groups.get(actor);
                if (!items) continue;
                for (const it of items) queue.push({ at: now + slot * beatMs, ...it });
                slot++;
            }
            groups = new Map();
            order = [];
        },

        // Play whatever is due. Called every frame by the effects loop.
        tick(now) {
            const due = [];
            while (queue.length && queue[0].at <= now) due.push(queue.shift());
            runAll(due);
            return due.length;
        },

        // Play everything still held, now.
        flush() {
            const all = queue;
            queue = [];
            runAll(all);
            return all.length;
        },

        pending() { return queue.length > 0 || recording; },

        // Damage dealt but not yet shown — the HP bar adds this back.
        heldPlayerHp() { return heldHp; },
    };
}
