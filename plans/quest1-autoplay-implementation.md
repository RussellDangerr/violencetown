# Quest-1 Autoplay — Stages 1-3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replayable, headless runs of the real game — a virtual clock, a seed seam, isolation from the player's storage, an in-page driver that plays a script through real key events, and a zero-dependency Node runner that drives the installed Chrome — proved by quest 1's first stage completing, and by the same seed giving the same end state however long the page took.

**Architecture:** `game/autoplay/boot.js` loads before `main.js`; without `?autoplay` it does nothing. With it, it replaces the page's timers with a virtual clock, swaps localStorage for memory, fences `fetch`, and hands off to `run.js`, which clicks START, reseeds through `_fullReset({ seed })`, and plays a script. `tools/autoplay.mjs` serves `game/`, launches Chrome over the DevTools protocol using Node's built-in `WebSocket`, and compares fingerprints across runs.

**Tech Stack:** Vanilla ES modules (the game's own), `node --test`, Node 24 built-ins (`http`, `child_process`, `WebSocket`, `fetch`), the installed Google Chrome. No dependencies.

**Spec:** `plans/quest1-autoplay.md` (all seven rulings taken as recommended, 2026-09-21). This plan is the spec's build stages **1-3**. Stages 4-6 (the player, the record, watch mode) get their own plan once this lands, because they depend on what the runner measures here — see the last section.

---

## Facts this plan relies on (verified 2026-09-21)

- **Keys:** the game listens on `document` (`main.js` ~991-1757). A synthetic `KeyboardEvent` dispatched on `document` is handled like a real one; nothing checks `isTrusted`. Arrow codes walk (`DIRS`, `main.js` ~154). From a standstill, a press toward a **new** facing only turns (a 70 ms `_turnTimer` then walks only if the key is still held); a press toward the **current** facing steps at once (`_beginMoveOrTurn`, ~2474). So a keydown+keyup pair toward a new facing = turn; toward the current facing = one step.
- **The car:** examinable `car` at (24,6) sits in a wall block; no tile beside it is walkable. From **(24,8) facing up**, E examines it and `fix_car` goes from stage 0 to stage 1 — measured in the running game. E opens the inspect panel (`state === 'inspect'`); Escape closes it.
- **States** are strings: `'splash'`, `'idle'`, `'inspect'`, `'resolving'` (`STATE`, `main.js` ~96).
- **Randomness:** all game state draws from `game.rng`; `Math.random` touches only audio and screen shake. Map loading consumes no RNG. Ambient wander does (`npc.js` ~686), on the 500 ms `setInterval` heartbeat — which is why a seed alone does not replay (measured: RNG 42 → unchanged at 0.6 s, two different states at 3 s and 6 s).
- **I/O:** the only `fetch` in the game is `map.js` `loadMap` (`fetch` then `resp.json()`); sprites and the font load at init.
- **Boot:** `main.js` boots on `DOMContentLoaded` (or at once). `init()` ends with `this._idleTick = 0`, two `setInterval`s, and no further awaits after `_loadMap`.
- **Splash:** `#splash-go` starts a new game on click.
- **Storage:** the save (`save.js`), settings (`settings.js`, `violencetown.settings`) and seen-hints (`main.js` `readSeenHints`) use `localStorage.getItem/setItem/removeItem` only. Settings default to `muted: true`.
- **Service worker:** registered from an inline script in `index.html` on `load`; network-first, runtime-cached, so new modules need no precache entry.
- **Chrome** is at `C:/Program Files/Google/Chrome/Application/chrome.exe`. Node is v24 (global `WebSocket`, `fetch`, `Response`).

## File structure

| File | Responsibility |
|---|---|
| `game/autoplay/clock.js` (create) | The virtual clock. Pure. |
| `game/autoplay/path.js` (create) | 4-way BFS to a tile, returning directions. Pure. |
| `game/autoplay/isolate.js` (create) | `memoryStorage()` and `fencedFetch()`. Pure factories. |
| `game/autoplay/fingerprint.js` (create) | `hash32`, `runState`, `fingerprint` of a game. |
| `game/autoplay/boot.js` (create) | The hook: parse `?autoplay`, install clock + isolation, hand off to `run.js`. |
| `game/autoplay/run.js` (create) | The in-page driver and the stage-3 script. |
| `tools/autoplay.mjs` (create) | Headless runner: static server + Chrome over CDP + report. |
| `game/main.js` (modify `_fullReset`) | `_fullReset({ seed } = {})` seeds the RNG. |
| `game/index.html` (modify) | Load `autoplay/boot.js` before `main.js`; skip the service worker under `?autoplay`. |
| `package.json` (modify) | `"autoplay": "node tools/autoplay.mjs"`. |
| `tests/autoplay-*.test.js` (create) | One file per pure module, plus boot/index wiring. |
| `tests/restart.test.js`, `tests/offer-wiring.test.js` (modify) | They match `_fullReset`'s signature by text. |

## Setup

- [ ] **Branch:** `git switch dev && git pull --ff-only && git switch -c feature/quest1-autoplay`. Run `git branch --no-merged dev` first — only `plan` should be listed (CLAUDE.md: check for unmerged branches before touching `main.js`).
- [ ] **Baseline:** `npm test` — record the count (1656 / 293 / 0 on 2026-09-21; re-measure, don't quote).

---

### Task 1: The virtual clock

**Files:**
- Create: `game/autoplay/clock.js`
- Test: `tests/autoplay-clock.test.js`

- [ ] **Step 1: Write the failing test**

```js
// autoplay-clock.test.js — the autoplay's virtual clock (plans/quest1-autoplay.md §3).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createClock, FRAME_MS } from '../game/autoplay/clock.js';

describe('the virtual clock', () => {
    test('time moves only when advanced', () => {
        const c = createClock({ start: 1000 });
        assert.equal(c.now(), 1000);
        c.advance(250);
        assert.equal(c.now(), 1250);
    });

    test('a timeout fires once, at its time and not before', () => {
        const c = createClock({ start: 0 });
        const at = [];
        c.setTimeout(() => at.push(c.now()), 100);
        c.advance(99);
        assert.deepEqual(at, []);
        c.advance(1);
        assert.deepEqual(at, [100]);
        c.advance(500);
        assert.deepEqual(at, [100]);
    });

    test('an interval fires every period until cleared', () => {
        const c = createClock({ start: 0 });
        const at = [];
        const id = c.setInterval(() => at.push(c.now()), 500);
        c.advance(1600);
        assert.deepEqual(at, [500, 1000, 1500]);
        c.clearInterval(id);
        c.advance(1000);
        assert.deepEqual(at, [500, 1000, 1500]);
    });

    test('clearTimeout also clears an interval, as in a browser', () => {
        const c = createClock({ start: 0 });
        let n = 0;
        const id = c.setInterval(() => n++, 10);
        c.clearTimeout(id);
        c.advance(100);
        assert.equal(n, 0);
    });

    test('timeouts due at the same instant fire in the order they were set', () => {
        const c = createClock({ start: 0 });
        const order = [];
        c.setTimeout(() => order.push('a'), 50);
        c.setTimeout(() => order.push('b'), 50);
        c.setTimeout(() => order.push('c'), 10);
        c.advance(50);
        assert.deepEqual(order, ['c', 'a', 'b']);
    });

    test('a timeout set from a callback fires in the same advance if it falls inside it', () => {
        const c = createClock({ start: 0 });
        const at = [];
        c.setTimeout(() => { at.push(c.now()); c.setTimeout(() => at.push(c.now()), 30); }, 20);
        c.advance(100);
        assert.deepEqual(at, [20, 50]);
    });

    test('animation frames run on frame boundaries, one frame per request', () => {
        const c = createClock({ start: 0 });
        const at = [];
        const loop = (t) => { at.push(t); if (at.length < 3) c.requestAnimationFrame(loop); };
        c.requestAnimationFrame(loop);
        c.advance(FRAME_MS * 5);
        assert.deepEqual(at, [FRAME_MS, FRAME_MS * 2, FRAME_MS * 3]);
    });

    test('a cancelled frame never runs', () => {
        const c = createClock({ start: 0 });
        let ran = false;
        const id = c.requestAnimationFrame(() => { ran = true; });
        c.cancelAnimationFrame(id);
        c.advance(100);
        assert.equal(ran, false);
    });

    test("the game's 150 ms step settles inside 160 ms", () => {
        const c = createClock({ start: 10000 });
        const begin = c.now();
        let done = false;
        const tick = (t) => { if (t - begin >= 150) done = true; else c.requestAnimationFrame(tick); };
        c.requestAnimationFrame(tick);
        c.advance(160);
        assert.equal(done, true);
    });

    test('a throwing callback is reported and the rest still run', () => {
        const errors = [];
        const c = createClock({ start: 0, onError: (e) => errors.push(e.message) });
        const ran = [];
        c.setTimeout(() => { throw new Error('bad frame'); }, 10);
        c.setTimeout(() => ran.push('next'), 10);
        c.advance(10);
        assert.deepEqual(errors, ['bad frame']);
        assert.deepEqual(ran, ['next']);
    });

    test('a timer that reschedules itself at the same instant fails loudly instead of hanging', () => {
        const c = createClock({ start: 0 });
        const spin = () => c.setTimeout(spin, 0);
        c.setTimeout(spin, 0);
        assert.throws(() => c.advance(1), /rescheduling itself/);
    });

    test('the methods work unbound, the way window.setTimeout is called', () => {
        const c = createClock({ start: 0 });
        const { setTimeout: later, now } = c;
        let hit = false;
        later(() => { hit = true; }, 5);
        c.advance(5);
        assert.equal(hit, true);
        assert.equal(now(), 5);
    });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test tests/autoplay-clock.test.js`
Expected: FAIL — `Cannot find module '.../game/autoplay/clock.js'`.

- [ ] **Step 3: Write the clock**

```js
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
```

- [ ] **Step 4: Run it to see it pass**

Run: `node --test tests/autoplay-clock.test.js`
Expected: PASS, 12 tests.

- [ ] **Step 5: Mutation-check** — the repo's rule is that a test is trusted once it has caught a broken version. Temporarily change `if (t.at > limit) continue;` to `if (t.at >= limit) continue;` and run the file: the ordering and timeout tests must fail. Restore it and confirm the file passes again.

- [ ] **Step 6: Commit**

```bash
git add game/autoplay/clock.js tests/autoplay-clock.test.js
git commit -m "feat(autoplay): the virtual clock — time moves only when the autoplay says"
```

---

### Task 2: The 4-way path

**Files:**
- Create: `game/autoplay/path.js`
- Test: `tests/autoplay-path.test.js`

- [ ] **Step 1: Write the failing test**

```js
// autoplay-path.test.js — how the autoplay gets from here to there.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathTo, DIR_CODES } from '../game/autoplay/path.js';

const grid = (rows) => (x, y) => rows[y] !== undefined && rows[y][x] === '.';
const STEP = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
function walk(from, dirs) {
    const tiles = [];
    let { x, y } = from;
    for (const d of dirs) { x += STEP[d][0]; y += STEP[d][1]; tiles.push([x, y]); }
    return tiles;
}

describe('the autoplay path', () => {
    test('already there is an empty path', () => {
        assert.deepEqual(pathTo(grid(['.']), { x: 0, y: 0 }, { x: 0, y: 0 }), []);
    });

    test('a straight corridor', () => {
        assert.deepEqual(pathTo(grid(['....']), { x: 0, y: 0 }, { x: 3, y: 0 }), ['right', 'right', 'right']);
    });

    test('it goes around a wall, on open tiles only, and ends at the goal', () => {
        const rows = ['...', '.#.', '...'];
        const dirs = pathTo(grid(rows), { x: 0, y: 1 }, { x: 2, y: 1 });
        assert.equal(dirs.length, 4);
        const tiles = walk({ x: 0, y: 1 }, dirs);
        for (const [x, y] of tiles) assert.equal(rows[y][x], '.', `stepped onto ${x},${y}`);
        assert.deepEqual(tiles.at(-1), [2, 1]);
    });

    test('unreachable is null', () => {
        assert.equal(pathTo(grid(['.#.']), { x: 0, y: 0 }, { x: 2, y: 0 }), null);
    });

    test('a closed goal is unreachable, not stepped onto', () => {
        assert.equal(pathTo(grid(['.#']), { x: 0, y: 0 }, { x: 1, y: 0 }), null);
    });

    test('ties break the same way every time: up, down, left, right', () => {
        assert.deepEqual(pathTo(grid(['..', '..']), { x: 0, y: 0 }, { x: 1, y: 1 }), ['down', 'right']);
    });

    test('every direction is a key the game walks on', () => {
        const mainSrc = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
        for (const code of Object.values(DIR_CODES)) {
            assert.match(mainSrc, new RegExp(`'${code}':\\s*\\{ dx`), `${code} is not in main.js DIRS`);
        }
    });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test tests/autoplay-path.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the path**

```js
// path.js — how the autoplay gets from here to there. A 4-way breadth-first
// search, because the player moves by key taps and a diagonal step needs two
// keys held at once. Pure: the caller says which tiles are open.

export const DIR_CODES = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
const STEPS = [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]];

// The directions to walk from `from` to `to`: [] when already there, null when
// no route exists. `isOpen(x, y)` decides every tile except `from`.
export function pathTo(isOpen, from, to, { maxNodes = 20000 } = {}) {
    if (from.x === to.x && from.y === to.y) return [];
    const key = (x, y) => `${x},${y}`;
    const prev = new Map([[key(from.x, from.y), null]]);
    const queue = [from];
    for (let head = 0; head < queue.length && head < maxNodes; head++) {
        const cur = queue[head];
        for (const [dir, dx, dy] of STEPS) {
            const x = cur.x + dx, y = cur.y + dy, k = key(x, y);
            if (prev.has(k) || !isOpen(x, y)) continue;
            prev.set(k, { from: cur, dir });
            if (x === to.x && y === to.y) {
                const dirs = [];
                for (let s = prev.get(k); s; s = prev.get(key(s.from.x, s.from.y))) dirs.push(s.dir);
                return dirs.reverse();
            }
            queue.push({ x, y });
        }
    }
    return null;
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `node --test tests/autoplay-path.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add game/autoplay/path.js tests/autoplay-path.test.js
git commit -m "feat(autoplay): a 4-way path — the player moves by taps, and a diagonal needs two keys"
```

---

### Task 3: Isolation — memory storage and a counted fetch

**Files:**
- Create: `game/autoplay/isolate.js`
- Test: `tests/autoplay-isolate.test.js`

- [ ] **Step 1: Write the failing test**

```js
// autoplay-isolate.test.js — what keeps a run away from a real player's game.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage, fencedFetch } from '../game/autoplay/isolate.js';

describe('memory storage', () => {
    test('a missing key reads null, like localStorage', () => {
        assert.equal(memoryStorage().getItem('violencetown.save'), null);
    });
    test('values round-trip as strings', () => {
        const s = memoryStorage();
        s.setItem('k', 42);
        assert.equal(s.getItem('k'), '42');
    });
    test('remove, clear, key and length behave', () => {
        const s = memoryStorage();
        s.setItem('a', '1'); s.setItem('b', '2');
        assert.equal(s.length, 2);
        assert.equal(s.key(0), 'a');
        s.removeItem('a');
        assert.equal(s.getItem('a'), null);
        s.clear();
        assert.equal(s.length, 0);
        assert.equal(s.key(0), null);
    });
    test('two stores never share', () => {
        const a = memoryStorage(), b = memoryStorage();
        a.setItem('k', 'v');
        assert.equal(b.getItem('k'), null);
    });
});

describe('the counted fetch', () => {
    test('a request counts until its whole body has arrived', async () => {
        let release;
        const slow = async () => new Response(new ReadableStream({
            start(c) { release = () => { c.enqueue(new TextEncoder().encode('{"a":1}')); c.close(); }; },
        }));
        const f = fencedFetch(slow);
        const pending = f.fetch('town-map.json');
        await new Promise((r) => setTimeout(r, 0));
        assert.equal(f.inflight(), 1, 'the headers are in but the body is not');
        release();
        const res = await pending;
        assert.equal(f.inflight(), 0);
        assert.deepEqual(await res.json(), { a: 1 });
    });
    test('a failed request stops counting', async () => {
        const f = fencedFetch(() => Promise.reject(new Error('offline')));
        await assert.rejects(f.fetch('x'), /offline/);
        assert.equal(f.inflight(), 0);
    });
    test('status and ok survive the copy', async () => {
        const f = fencedFetch(async () => new Response('nope', { status: 404, statusText: 'Not Found' }));
        const res = await f.fetch('x');
        assert.equal(res.status, 404);
        assert.equal(res.ok, false);
        assert.equal(res.statusText, 'Not Found');
    });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test tests/autoplay-isolate.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write isolate.js**

```js
// isolate.js — what keeps an autoplay run away from a real player's game
// (plans/quest1-autoplay.md §5.4). Pure factories; boot.js installs them.

// An in-memory stand-in for localStorage. The save, the settings and the
// seen-hints list all live in localStorage, so a run on the real one could
// overwrite a player's save — and would read their settings, which would make
// two runs of one seed differ by whose browser ran them.
export function memoryStorage() {
    const m = new Map();
    return {
        getItem: (k) => (m.has(String(k)) ? m.get(String(k)) : null),
        setItem: (k, v) => { m.set(String(k), String(v)); },
        removeItem: (k) => { m.delete(String(k)); },
        clear: () => { m.clear(); },
        key: (i) => [...m.keys()][i] ?? null,
        get length() { return m.size; },
    };
}

// fetch, counted: inflight() is how many requests are still loading, and a
// response is handed back only once its whole body has arrived. The autoplay
// freezes game time while anything is in flight, so a map load takes the same
// virtual time on a fast machine and a slow one.
const NULL_BODY = new Set([101, 204, 205, 304]);

export function fencedFetch(fetchImpl) {
    let n = 0;
    return {
        inflight: () => n,
        fetch: async (...args) => {
            n++;
            try {
                const res = await fetchImpl(...args);
                const body = NULL_BODY.has(res.status) ? null : await res.arrayBuffer();
                return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
            } finally {
                n--;
            }
        },
    };
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `node --test tests/autoplay-isolate.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add game/autoplay/isolate.js tests/autoplay-isolate.test.js
git commit -m "feat(autoplay): isolation — memory storage, and a fetch that counts until the body lands"
```

---

### Task 4: The fingerprint

**Files:**
- Create: `game/autoplay/fingerprint.js`
- Test: `tests/autoplay-fingerprint.test.js`

- [ ] **Step 1: Write the failing test**

```js
// autoplay-fingerprint.test.js — one short hash of where a run ended.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { hash32, runState, fingerprint } from '../game/autoplay/fingerprint.js';

// Enough of a Game for save.js serialize() to read.
const game = (over = {}) => ({ equipment: {}, turn: 3, rng: { getState: () => 42 }, _dayClockMs: 1500, worldTick: 3, ...over });

describe('the run fingerprint', () => {
    test('hash32 is 32-bit FNV-1a', () => {
        assert.equal(hash32(''), '811c9dc5');
        assert.equal(hash32('a'), 'e40c292c');
        assert.equal(hash32('foobar'), 'bf9cf968');
    });
    test('when the save was written is not part of the run', () => {
        assert.equal('savedAt' in runState(game()).save, false);
    });
    test('the same state gives the same fingerprint', () => {
        assert.equal(fingerprint(game()), fingerprint(game()));
    });
    test('one RNG step apart is a different run', () => {
        assert.notEqual(fingerprint(game()), fingerprint(game({ rng: { getState: () => 43 } })));
    });
    test('the world clocks a save leaves out are part of the run', () => {
        assert.notEqual(fingerprint(game()), fingerprint(game({ _dayClockMs: 2000 })));
        assert.notEqual(fingerprint(game()), fingerprint(game({ worldTick: 4 })));
    });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test tests/autoplay-fingerprint.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write fingerprint.js**

```js
// fingerprint.js — one short hash of where a run ended. Two runs share a
// fingerprint exactly when their saves and world clocks agree, which is what
// "the same seed replays the same run" means in practice.

import { serialize } from '../save.js';

// FNV-1a, 32-bit, as 8 hex digits.
export function hash32(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
}

// Everything a save carries except when it was written, plus the two world
// clocks a save leaves out.
export function runState(game) {
    const save = serialize(game);
    delete save.savedAt;
    return { save, dayClockMs: game._dayClockMs ?? null, worldTick: game.worldTick ?? null };
}

export const fingerprint = (game) => hash32(JSON.stringify(runState(game)));
```

- [ ] **Step 4: Run it to see it pass**

Run: `node --test tests/autoplay-fingerprint.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add game/autoplay/fingerprint.js tests/autoplay-fingerprint.test.js
git commit -m "feat(autoplay): the run fingerprint — a save's worth of state, hashed"
```

---

### Task 5: The seed seam in `_fullReset`

**Files:**
- Modify: `game/main.js` — `async _fullReset() {` (~5055) and its `this.rng = new RNG();`
- Modify: `tests/restart.test.js` (the `liveMethod` signature), `tests/offer-wiring.test.js:2015` (a regex on the signature)
- Test: `tests/restart.test.js`

- [ ] **Step 1: Write the failing test** — append inside `describe('RESTART begins a brand-new game', ...)` in `tests/restart.test.js`:

```js
    test('a seeded RESTART starts the RNG at that seed', async () => {
        const g = await lateRun();
        await g._fullReset({ seed: 42 });
        assert.equal(g.rng.getState(), 42);
    });

    test('an unseeded RESTART still reseeds at random', async () => {
        const a = await lateRun(), b = await lateRun();
        await a._fullReset();
        await b._fullReset();
        assert.notEqual(a.rng.getState(), b.rng.getState());
    });
```

and change the lift at the top of the file from

```js
const fullReset = liveMethod('_fullReset() {', {
```

to

```js
const fullReset = liveMethod('_fullReset({ seed } = {}) {', {
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test tests/restart.test.js`
Expected: FAIL — `_fullReset({ seed } = {}) { not found in main.js`.

- [ ] **Step 3: Add the seam** — in `game/main.js`:

```js
    async _fullReset() {
```
becomes
```js
    async _fullReset({ seed } = {}) {
```

and

```js
        // RESTART begins a brand-new game: drop the save and reseed the RNG so
        // the new run is independent of the old one.
        clearSave();
        this.rng = new RNG();
```
becomes
```js
        // RESTART begins a brand-new game: drop the save and reseed the RNG so
        // the new run is independent of the old one. The autoplay passes a seed
        // so a run replays exactly (plans/quest1-autoplay.md §5.3).
        clearSave();
        this.rng = new RNG(seed);
```

(`new RNG(undefined)` takes the constructor's default, a random seed — so every existing caller is unchanged.)

- [ ] **Step 4: Keep the offer test matching** — in `tests/offer-wiring.test.js`, change

```js
        assert.ok(/_fullReset\(\) \{[\s\S]{0,600}?this\._closeOffer\(\);/.test(mainSrc),
```
to
```js
        assert.ok(/_fullReset\([^)]*\) \{[\s\S]{0,600}?this\._closeOffer\(\);/.test(mainSrc),
```

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS — baseline + 2 (the two new restart tests) + the tests from Tasks 1-4.

- [ ] **Step 6: Commit**

```bash
git add game/main.js tests/restart.test.js tests/offer-wiring.test.js
git commit -m "feat(restart): _fullReset takes a seed — the autoplay's one seam into the game"
```

---

### Task 6: The boot hook, and loading it first

**Files:**
- Create: `game/autoplay/boot.js`
- Modify: `game/index.html` (the `main.js` script tag; the service-worker registration)
- Test: `tests/autoplay-boot.test.js`

- [ ] **Step 1: Write the failing test**

```js
// autoplay-boot.test.js — the hook must cost a normal player nothing, and must
// load before the game or the game starts on the wall clock.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../game/index.html', import.meta.url), 'utf8');

describe('the autoplay hook', () => {
    test('index.html loads boot.js as a module, before main.js', () => {
        const boot = html.indexOf('<script type="module" src="autoplay/boot.js"></script>');
        const main = html.indexOf('<script type="module" src="main.js"></script>');
        assert.ok(boot > 0, 'boot.js is not loaded');
        assert.ok(boot < main, 'boot.js loads after main.js — the game would start on the wall clock');
    });

    test('an autoplay run does not register the service worker', () => {
        assert.match(html, /'serviceWorker' in navigator && !new URLSearchParams\(location\.search\)\.has\('autoplay'\)/);
    });

    test('without ?autoplay it installs nothing', async () => {
        const before = globalThis.setTimeout;
        await import('../game/autoplay/boot.js');
        assert.equal(globalThis.__autoplay, undefined);
        assert.equal(globalThis.setTimeout, before);
    });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test tests/autoplay-boot.test.js`
Expected: FAIL — boot.js not loaded / module not found.

- [ ] **Step 3: Write boot.js**

```js
// boot.js — the autoplay's hook (plans/quest1-autoplay.md §5.1). index.html
// loads it before main.js. Without ?autoplay in the URL it does nothing at all;
// with it, it swaps in the virtual clock, walls the run off from the player's
// storage, counts network requests, then hands off to run.js.
//
//   ?autoplay&seed=1&script=car   virtual clock, as fast as the machine allows
//   &clock=real                   the wall clock instead — the control that shows
//                                 why the virtual one is needed
//   &jitter                       random REAL pauses between actions; must not
//                                 change a virtual-clock run at all

import { createClock } from './clock.js';
import { memoryStorage, fencedFetch } from './isolate.js';

const params = new URLSearchParams(globalThis.location?.search ?? '');
if (params.has('autoplay')) install(params);

function install(params) {
    const opts = {
        seed: Number(params.get('seed') ?? 1) >>> 0,
        script: params.get('script') || 'car',
        clock: params.get('clock') === 'real' ? 'real' : 'virtual',
        jitter: params.has('jitter'),
    };
    const real = { now: performance.now.bind(performance), setTimeout: window.setTimeout.bind(window) };

    const errors = [];
    const note = (e) => errors.push(String((e && e.stack) || e));
    window.addEventListener('error', (e) => note(e.error || e.message));
    window.addEventListener('unhandledrejection', (e) => note(e.reason));

    const store = memoryStorage();
    for (const m of ['getItem', 'setItem', 'removeItem', 'clear', 'key']) {
        Storage.prototype[m] = function (...a) { return store[m](...a); };
    }
    Object.defineProperty(Storage.prototype, 'length', { get: () => store.length, configurable: true });

    const fence = fencedFetch(window.fetch.bind(window));
    window.fetch = fence.fetch;

    let clock = null;
    if (opts.clock === 'virtual') {
        clock = createClock({ onError: (e) => { note(e); console.error(e); } });
        Object.assign(window, {
            setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
            setInterval: clock.setInterval, clearInterval: clock.clearInterval,
            requestAnimationFrame: clock.requestAnimationFrame, cancelAnimationFrame: clock.cancelAnimationFrame,
        });
        Object.defineProperty(performance, 'now', { value: clock.now, configurable: true });
    }

    let finish;
    const done = new Promise((r) => { finish = r; });
    window.__autoplay = { opts, real, clock, errors, inflight: fence.inflight, done };

    const runUrl = new URL('./run.js', import.meta.url);
    runUrl.search = new URL(import.meta.url).search;   // keep the dev server's cache-buster
    import(runUrl.href)
        .then((m) => m.run(window.__autoplay))
        .catch((e) => ({ ok: false, reason: String((e && e.stack) || e), errors }))
        .then(finish);
}
```

- [ ] **Step 4: Wire index.html** — immediately above `<script type="module" src="main.js"></script>` add:

```html
    <!-- The autoplay's hook (plans/quest1-autoplay.md). Does nothing without
         ?autoplay; with it, it must run before main.js starts the clock. -->
    <script type="module" src="autoplay/boot.js"></script>
```

and change the service-worker guard from

```js
        if ('serviceWorker' in navigator) {
```
to
```js
        if ('serviceWorker' in navigator && !new URLSearchParams(location.search).has('autoplay')) {
```

- [ ] **Step 5: Run it to see it pass**

Run: `node --test tests/autoplay-boot.test.js`
Expected: PASS, 3 tests.

- [ ] **Step 6: Check a normal load is untouched** — start `python dev-server.py 3004` (background), load `http://localhost:3004/` in the Browser pane, and confirm in the console: `window.__autoplay === undefined`, `typeof window.__game.map === 'object'`, and no errors other than the pane's known service-worker message. Then press START and walk a few steps.

- [ ] **Step 7: Commit**

```bash
git add game/autoplay/boot.js game/index.html tests/autoplay-boot.test.js
git commit -m "feat(autoplay): the boot hook — nothing without ?autoplay, the virtual clock with it"
```

---

### Task 7: The in-page driver and the stage-3 script

**Files:**
- Create: `game/autoplay/run.js`

No node test: `run.js` drives the DOM and a live `Game`, and the runner in Task 8 is its test. Its pure parts (clock, path, fingerprint) are already covered.

- [ ] **Step 1: Write run.js**

```js
// run.js — the autoplay driver (plans/quest1-autoplay.md §5.1). Loaded by
// boot.js only under ?autoplay. Plays a script against the real game — real
// key events into the real input handler — on the virtual clock, and returns a
// report. Stage 3's scripts are fixed lists; stage 4 replaces them with the
// goal table.

import { FRAME_MS } from './clock.js';
import { pathTo, DIR_CODES } from './path.js';
import { fingerprint } from './fingerprint.js';

export const SCRIPTS = {
    // Quest 1's first stage. The car sits in a wall block with no open tile
    // beside it; (24,8) facing up is where E reaches it (measured 2026-09-21).
    // The idle is deliberate: three seconds of the free-roam heartbeat moving
    // the townsfolk is exactly what broke seeded replays.
    car: {
        ops: [{ walkTo: { x: 24, y: 8 } }, { idle: 3000 }, { face: 'up' }, { press: 'KeyE' }, { press: 'Escape' }],
        expect: (g) => (g.questEngine.state.activeId === 'fix_car' && g.questEngine.state.stageIndex >= 1)
            ? null : 'quest 1 is still waiting on examine_car',
    },
};

const KEY = { KeyE: 'e', KeyT: 't' };

export async function run(ap) {
    const t0 = ap.real.now();
    const vt0 = ap.clock ? ap.clock.now() : null;
    const g = await waitForGame(ap);
    const d = driver(ap, g);
    const report = (ok, reason = null) => {
        const errors = [...ap.errors];
        return {
            ok: ok && errors.length === 0,
            reason: reason ?? (errors.length ? 'errors on the page' : null),
            seed: ap.opts.seed, script: ap.opts.script, clock: ap.opts.clock,
            fingerprint: fingerprint(g),
            turn: g.turn,
            quest: { id: g.questEngine.state.activeId, stage: g.questEngine.state.stageIndex },
            at: { map: g._mapUrl, x: g.playerX, y: g.playerY },
            virtualMs: ap.clock ? ap.clock.now() - vt0 : null,
            realMs: Math.round(ap.real.now() - t0),
            errors,
        };
    };
    const script = SCRIPTS[ap.opts.script];
    if (!script) return report(false, `no script named "${ap.opts.script}"`);
    try {
        document.getElementById('splash-go').click();
        await d.settle();
        await g._fullReset({ seed: ap.opts.seed });
        await d.settle();
        for (const op of script.ops) {
            if (ap.opts.jitter) await d.realSleep(Math.floor(Math.random() * 400));
            const failure = await d.op(op);
            if (failure) return report(false, failure);
        }
        const miss = script.expect(g);
        return report(!miss, miss);
    } catch (e) {
        return report(false, String((e && e.stack) || e));
    }
}

// The game is ready once init() has run to its end: the map is loaded and
// _idleTick, set after every binding, exists. Polled on the REAL clock — game
// time must not move while the page loads, or the heartbeat's phase would
// depend on how fast the files arrived.
async function waitForGame(ap) {
    const until = ap.real.now() + 30000;
    for (;;) {
        const g = window.__game;
        if (g && g.map && g._idleTick !== undefined && g.state === 'splash' && document.getElementById('splash-go')) return g;
        if (ap.real.now() > until) throw new Error('the game never finished loading');
        await new Promise((r) => ap.real.setTimeout(r, 20));
    }
}

function driver(ap, g) {
    // A real macrotask with no 4 ms clamp: long enough for every promise the
    // last callback started to settle, short enough to run thousands a second.
    const channel = new MessageChannel();
    const macrotask = () => new Promise((r) => { channel.port1.onmessage = () => r(); channel.port2.postMessage(0); });
    const realSleep = (ms) => new Promise((r) => ap.real.setTimeout(r, ms));

    // Game time never moves while a request is in flight.
    const quiesce = async () => { do { await macrotask(); } while (ap.inflight() > 0); };
    const tick = async () => {
        if (ap.clock) ap.clock.advance(FRAME_MS); else await realSleep(FRAME_MS);
        await quiesce();
    };
    const busy = () => g._animating || g._turnTimer || ap.inflight() > 0 || g.state === 'resolving';

    async function settle(maxMs = 5000) {
        await quiesce();
        for (let t = 0; busy(); t += FRAME_MS) {
            if (t > maxMs) throw new Error(`the game stayed busy for ${maxMs} ms (state "${g.state}")`);
            await tick();
        }
    }
    function key(type, code) {
        document.dispatchEvent(new KeyboardEvent(type, { code, key: KEY[code] ?? code, bubbles: true, cancelable: true }));
    }
    async function press(code) { key('keydown', code); key('keyup', code); await settle(); }
    async function idle(ms) { for (let t = 0; t < ms; t += FRAME_MS) await tick(); await settle(); }

    // From a standstill a tap toward a new facing only turns (main.js
    // _beginMoveOrTurn), so facing is its own press.
    async function face(dir) {
        if (g.facing !== dir) await press(DIR_CODES[dir]);
        return g.facing === dir ? null : `could not face ${dir}`;
    }

    // Walking into someone opens their verb list rather than stepping, so the
    // path treats every living character as a wall — recomputed every step,
    // because the townsfolk wander.
    const occupied = (x, y) => g.enemies.some((e) => e.entity.isAlive() && e.x === x && e.y === y);
    const isOpen = (x, y) => g.map.isWalkable(x, y) && !occupied(x, y);
    async function walkTo(to, maxSteps = 200) {
        for (let n = 0; n < maxSteps; n++) {
            if (g.playerX === to.x && g.playerY === to.y) return null;
            const path = pathTo(isOpen, { x: g.playerX, y: g.playerY }, to);
            if (!path) { await press('KeyT'); continue; }   // hemmed in by passers-by: wait a turn
            const turned = await face(path[0]);
            if (turned) return turned;
            await press(DIR_CODES[path[0]]);
            if (g.state !== 'idle') return `a step ${path[0]} left the game in state "${g.state}"`;
        }
        return `did not reach ${to.x},${to.y} in ${maxSteps} steps (stopped at ${g.playerX},${g.playerY})`;
    }

    async function op(o) {
        if (o.walkTo) return walkTo(o.walkTo);
        if (o.face) return face(o.face);
        if (o.press) { await press(o.press); return null; }
        if (o.idle) { await idle(o.idle); return null; }
        return `unknown op ${JSON.stringify(o)}`;
    }

    return { settle, realSleep, op };
}
```

- [ ] **Step 2: Run it in the Browser pane** — with the Task 6 server on 3004, open `http://localhost:3004/?autoplay&seed=1` in a fresh tab and read the result with the javascript tool:

```js
await window.__autoplay.done
```

Expected: `ok: true`, `quest: { id: 'fix_car', stage: 1 }`, `at: { map: 'town-map.json', x: 24, y: 8 }`, `errors: []`, a `virtualMs` of several seconds and a `realMs` well under it. If `ok` is false, the `reason` names the op that failed — fix `run.js`, restart the dev server (fresh modules), reload.

- [ ] **Step 3: Check it left the pane's real storage alone** — in a tab on `http://localhost:3004/` *without* `?autoplay`, run `localStorage.getItem('violencetown.save')`; it must be whatever it was before the run (normally `null` on this port), not an autoplay save.

- [ ] **Step 4: Commit**

```bash
git add game/autoplay/run.js
git commit -m "feat(autoplay): the in-page driver — real keys, virtual time, and quest 1's first stage"
```

---

### Task 8: The headless runner

**Files:**
- Create: `tools/autoplay.mjs`
- Modify: `package.json` (`scripts`)

- [ ] **Step 1: Write the runner**

```js
#!/usr/bin/env node
// autoplay.mjs — run the autoplay headless (plans/quest1-autoplay.md §5.1).
//
//   node tools/autoplay.mjs [--seed=1] [--script=car] [--repeat=1] [--jitter] [--clock=real] [--json] [--timeout=120000]
//
// Serves game/ itself, drives the installed Chrome over the DevTools protocol
// (Node's built-in WebSocket — no dependencies), and prints one line per run.
// With --repeat, every run of the seed must end in the same state.
// Exit: 0 ok · 1 a run failed · 2 runs of one seed disagreed · 3 no Chrome.

import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'game');
const MIME = {
    '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
    '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.webmanifest': 'application/manifest+json',
    '.ico': 'image/x-icon', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs(argv) {
    const o = { seed: 1, script: 'car', repeat: 1, jitter: false, clock: 'virtual', json: false, timeout: 120000 };
    for (const a of argv) {
        const [k, v] = a.replace(/^--/, '').split('=');
        if (k === 'seed' || k === 'repeat' || k === 'timeout') o[k] = Number(v);
        else if (k === 'script' || k === 'clock') o[k] = v;
        else if (k === 'jitter' || k === 'json') o[k] = true;
        else throw new Error(`unknown option ${a}`);
    }
    return o;
}

function serve() {
    const server = http.createServer(async (req, res) => {
        let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        if (rel.endsWith('/')) rel += 'index.html';
        const file = path.join(ROOT, rel);
        if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
        try {
            const body = await readFile(file);
            res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
            res.end(body);
        } catch {
            res.writeHead(404).end();
        }
    });
    return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

const CHROMES = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean);

async function launchChrome() {
    const exe = CHROMES.find((p) => existsSync(p));
    if (!exe) return null;
    const profile = await mkdtemp(path.join(tmpdir(), 'vt-autoplay-'));
    const proc = spawn(exe, [
        '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
        '--no-first-run', '--no-default-browser-check', '--mute-audio', '--window-size=1280,900', 'about:blank',
    ], { stdio: 'ignore' });
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; i < 300; i++) {
        const port = existsSync(portFile) ? Number(readFileSync(portFile, 'utf8').split('\n')[0]) : 0;
        if (port > 0) return { proc, profile, port };
        await sleep(50);
    }
    killTree(proc);
    throw new Error('Chrome never opened its DevTools port');
}

// Chrome is a process tree; on Windows, killing the parent leaves children
// holding the profile directory open.
function killTree(proc) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
    else proc.kill('SIGKILL');
}

async function connect(port) {
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = targets.find((t) => t.type === 'page');
    if (!page) throw new Error('Chrome has no page to drive');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    let id = 0;
    const waiting = new Map();
    const listeners = new Set();
    ws.onmessage = (m) => {
        const msg = JSON.parse(m.data);
        if (msg.id && waiting.has(msg.id)) {
            const { resolve, reject } = waiting.get(msg.id);
            waiting.delete(msg.id);
            if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
        } else {
            for (const l of listeners) l(msg);
        }
    };
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const i = ++id;
        waiting.set(i, { resolve, reject });
        ws.send(JSON.stringify({ id: i, method, params }));
    });
    const once = (method) => new Promise((resolve) => {
        const l = (m) => { if (m.method === method) { listeners.delete(l); resolve(m.params); } };
        listeners.add(l);
    });
    return { send, once, on: (l) => listeners.add(l), close: () => ws.close() };
}

async function runOnce(cdp, base, o) {
    const q = new URLSearchParams({ autoplay: '1', seed: String(o.seed), script: o.script });
    if (o.clock === 'real') q.set('clock', 'real');
    if (o.jitter) q.set('jitter', '1');
    const loaded = cdp.once('Page.loadEventFired');
    await cdp.send('Page.navigate', { url: `${base}/?${q}` });
    await loaded;
    const evaluation = cdp.send('Runtime.evaluate', {
        expression: 'window.__autoplay ? window.__autoplay.done : { ok: false, reason: "boot.js never installed" }',
        awaitPromise: true, returnByValue: true,
    });
    const out = await Promise.race([evaluation, sleep(o.timeout).then(() => null)]);
    if (!out) return { ok: false, reason: `no result in ${o.timeout} ms` };
    if (out.exceptionDetails) return { ok: false, reason: out.exceptionDetails.text };
    return out.result.value;
}

function line(i, r) {
    const where = r.quest ? `quest ${r.quest.id}#${r.quest.stage} at ${r.at.map} ${r.at.x},${r.at.y}` : '';
    const time = r.virtualMs != null ? `virtual ${r.virtualMs} ms, real ${r.realMs} ms` : `real ${r.realMs} ms`;
    return `run ${i + 1}: ${r.ok ? 'ok  ' : 'FAIL'} seed ${r.seed} ${r.script} · ${where} · turn ${r.turn} · ${time} · ${r.fingerprint}`
        + (r.ok ? '' : `\n  ${r.reason}${(r.errors || []).length ? '\n  ' + r.errors.join('\n  ') : ''}`);
}

const o = parseArgs(process.argv.slice(2));
const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
const chrome = await launchChrome();
if (!chrome) {
    console.error('autoplay: no Chrome found — set CHROME_PATH');
    server.close();
    process.exit(3);
}

let code = 0;
try {
    const cdp = await connect(chrome.port);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    const consoleErrors = [];
    cdp.on((m) => {
        if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
            consoleErrors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
        }
    });
    const runs = [];
    for (let i = 0; i < o.repeat; i++) {
        consoleErrors.length = 0;
        const r = await runOnce(cdp, base, o);
        if (consoleErrors.length) { r.ok = false; r.reason = r.reason || 'console errors'; r.errors = [...(r.errors || []), ...consoleErrors]; }
        runs.push(r);
        if (!o.json) console.log(line(i, r));
    }
    const prints = new Set(runs.map((r) => r.fingerprint));
    const disagree = runs.length > 1 && prints.size > 1;
    if (o.json) console.log(JSON.stringify({ options: o, runs, deterministic: !disagree }, null, 2));
    else if (runs.length > 1) {
        console.log(disagree
            ? `NONDETERMINISTIC: ${prints.size} different end states from seed ${o.seed}`
            : `deterministic: ${runs.length} runs, one end state (${[...prints][0]})`);
    }
    code = runs.some((r) => !r.ok) ? 1 : disagree ? 2 : 0;
    cdp.close();
} finally {
    killTree(chrome.proc);
    server.close();
    await rm(chrome.profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
}
process.exit(code);
```

- [ ] **Step 2: Add the npm script** — in `package.json` `"scripts"`, after `"balance:cards"`:

```json
    "autoplay": "node tools/autoplay.mjs",
```

- [ ] **Step 3: One run**

Run: `node tools/autoplay.mjs`
Expected: one line, `run 1: ok   seed 1 car · quest fix_car#1 at town-map.json 24,8 · ...`, exit code 0. Record the `virtual` and `real` times — they are the first measurement of headless frame cost (spec §8).

- [ ] **Step 4: Commit**

```bash
git add tools/autoplay.mjs package.json
git commit -m "feat(autoplay): the headless runner — Chrome over the DevTools protocol, no dependencies"
```

---

### Task 9: Prove determinism — and prove the check can fail

**Files:**
- Modify: `plans/quest1-autoplay.md` (§8 — replace the unknowns this settles with the measurements)

- [ ] **Step 1: The claim** — same seed, three runs, random real-time pauses between every action:

Run: `node tools/autoplay.mjs --repeat=3 --jitter`
Expected: three `ok` lines with one fingerprint, then `deterministic: 3 runs, one end state (...)`, exit 0.

- [ ] **Step 2: The control** — the same, on the wall clock:

Run: `node tools/autoplay.mjs --repeat=3 --jitter --clock=real`
Expected: `NONDETERMINISTIC: ...`, exit 2. **If the control agrees with itself, the check in Step 1 proves nothing** (the repo's lesson: a check that finds nothing passes). Then lengthen the script's `idle` until the wall-clock runs disagree, and re-run Step 1.

- [ ] **Step 3: Different seeds differ** — `node tools/autoplay.mjs --seed=2` must print a different fingerprint from seed 1 (the townsfolk wander differently), still `ok`.

- [ ] **Step 4: Record it** — in `plans/quest1-autoplay.md` §8, replace the "Headless frame cost" and "Overriding localStorage" bullets with what Tasks 7-9 measured (virtual vs real ms per run; that `Storage.prototype` override held; the control's result), and add a line to §6 stage 2 and 3: built, with the commit.

- [ ] **Step 5: Commit**

```bash
git add plans/quest1-autoplay.md
git commit -m "plan(autoplay): stages 1-3 measured — one seed, one end state; the wall clock, three"
```

---

### Task 10: Finish the branch

- [ ] **Step 1: Full gates** — `npm test` (baseline + every new test, 0 failures), `npm run -s balance:check` (no drift), the CLAUDE.md naming grep (zero lines).
- [ ] **Step 2: A normal game still plays** — fresh dev server on a new port, load `/` without `?autoplay`, START, walk, examine the car, check the console. The hook must be invisible.
- [ ] **Step 3: Push the branch** — `git push -u origin feature/quest1-autoplay`. The merge to `dev` is Caelan's call.
- [ ] **Step 4: Resume note** — record the branch tip, the measurements and the next plan in memory.

---

## Next plan (stages 4-6), written after this one lands

Stage 3 answers what that plan needs: how long a virtual turn costs in real time, whether every action settles cleanly through `settle()`, and whether key input holds up across a map transition. It will cover:

- **Stage 4 — the player.** `game/autoplay/route.js` (the `fix_car` stage → goal table, named by id: examinable `car`, the Sewer transition, enemy tag `wererat_boss`, item `catalytic_converter`, the barricade, `interact_car`) with a node test that every stage has a goal and every id exists in the maps. `player.js` skills: cross-map walking via `transitions`, fighting through the wheel by key path (`fight.melee.hit`), healing below 40% HP via `treat.eat`, pickups, bumping the barricade. First real question: can the standard fighter beat the Wererat.
- **Stage 5 — the record.** Per-stage turns, HP lost, heals, gold, fights, deaths; `tools/autoplay-golden.json`; `npm run autoplay:check`.
- **Stage 6 — watch mode.** A speed multiplier pacing the virtual clock against real time, an `AUTOPLAY · seed · xN` label, stop on a trusted key, GIF capture; then live behind `?autoplay` per ruling Q1-3.
