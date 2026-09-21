// clock.js — a virtual clock for the autoplay (plans/quest1-autoplay.md §3).
//
// The game runs on the wall clock: a 500 ms setInterval winds the world and
// every step is a requestAnimationFrame slide, so how long a player takes
// changes what the seeded RNG gets spent on. Installed in their place, this
// clock moves only when the autoplay advances it — the same seed and the same
// actions then give the same run, however fast or slow the page is.
//
// Pure: no globals. Every method is a closure, so each can be handed to
// window.* unbound.

export const FRAME_MS = 16;
const MAX_CALLBACKS_PER_ADVANCE = 100000;

export function createClock({ start = 10000, onError = (e) => { throw e; } } = {}) {
    let now = start;
    let nextId = 1;
    let seq = 0;
    const timers = new Map();   // id -> { at, every, fn, args, seq }; timeouts and intervals share ids, as in a browser
    let frames = new Map();     // id -> fn, all run together at the next frame boundary

    const nextFrameAt = () => start + FRAME_MS * (Math.floor((now - start) / FRAME_MS) + 1);

    function call(fn, args) {
        try { fn(...args); } catch (e) { onError(e); }
    }

    // The earliest timer due by `limit`; ties go to the one scheduled first.
    function dueBy(limit) {
        let best = null;
        for (const [id, t] of timers) {
            if (t.at > limit) continue;
            if (!best || t.at < best.t.at || (t.at === best.t.at && t.seq < best.t.seq)) best = { id, t };
        }
        return best;
    }

    return {
        now: () => now,
        setTimeout: (fn, ms = 0, ...args) => {
            const id = nextId++;
            timers.set(id, { at: now + Math.max(0, Number(ms) || 0), every: 0, fn, args, seq: seq++ });
            return id;
        },
        setInterval: (fn, ms = 0, ...args) => {
            const id = nextId++;
            const every = Math.max(1, Number(ms) || 0);
            timers.set(id, { at: now + every, every, fn, args, seq: seq++ });
            return id;
        },
        clearTimeout: (id) => { timers.delete(id); },
        clearInterval: (id) => { timers.delete(id); },
        requestAnimationFrame: (fn) => { const id = nextId++; frames.set(id, fn); return id; },
        cancelAnimationFrame: (id) => { frames.delete(id); },
        pending: () => ({ timers: timers.size, frames: frames.size }),

        // Run everything due in the next `ms`, in time order — timers before a
        // frame that falls on the same instant — then land exactly on now + ms.
        advance(ms) {
            const end = now + Math.max(0, Number(ms) || 0);
            let fired = 0;
            for (;;) {
                if (fired > MAX_CALLBACKS_PER_ADVANCE) {
                    throw new Error(`clock: over ${MAX_CALLBACKS_PER_ADVANCE} callbacks in one advance — a timer is rescheduling itself for the same instant`);
                }
                const frameAt = frames.size ? nextFrameAt() : Infinity;
                const due = dueBy(Math.min(end, frameAt));
                if (due) {
                    now = Math.max(now, due.t.at);
                    if (due.t.every) { due.t.at += due.t.every; due.t.seq = seq++; } else timers.delete(due.id);
                    call(due.t.fn, due.t.args);
                    fired++;
                    continue;
                }
                if (frameAt <= end) {
                    now = frameAt;
                    const batch = frames;
                    frames = new Map();
                    for (const fn of batch.values()) { call(fn, [now]); fired++; }
                    continue;
                }
                break;
            }
            now = end;
            return fired;
        },
    };
}
