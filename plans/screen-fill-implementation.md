# Screen Fill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Violencetown fills the browser window with world — tile size from one rule, the player always centred, a per-map filler past the edge — with the HUD in a bottom dock and the action wheel on an opaque round dial.

**Architecture:** One pure module, `game/viewport.js`, computes the screen's geometry from the window size and DPR. `layout.js`'s `hudLayout(vp)` places every HUD piece for a viewport. The renderer draws through both and `main.js` hit-tests through both, so drawing and tapping cannot drift apart. Three stages, each ending in a game that works: (1) the viewport goes in and reproduces today's 19×19 square exactly, proven by a draw-call recorder; (2) the screen fills the window and maps get fillers, with the HUD pinned to the corners; (3) the dock and the dial.

**Tech Stack:** Vanilla ES modules, Canvas 2D, no build step. `node --test` for tests. `python dev-server.py 3001` and the Claude desktop Browser pane for in-game checks.

**Spec:** `plans/screen-fill.md` — read it first. Its decisions and numbers are binding; this plan implements them.

---

## Before you start

### What you need to know about this codebase

- **Repo** `C:\Code\violencetown`. Work on the feature branch Task 1 cuts from `dev`. Never `git add -A` — untracked `*-TheDangerrZone*` files exist — add files by name. Never pipe `git add` into anything; chain `git add … && git commit …` so a failed add stops the commit.
- **Tests:** `npm test` runs the suite with `node --test` in about a second. Baseline on dev `689f26b`: **1281 tests, 0 failures**. One file: `node --test tests/<name>.test.js`. Call `node` directly; `npx` fetches a different node.
- **Dev server:** in the desktop app, `preview_start {name: "violencetown"}` (port 3001, from `.claude/launch.json`). Its document root is `game/`, so `game/dev/x.js` is served at `/dev/x.js`. It stamps a per-process cache-buster onto module URLs: **restart it after editing JS** (`preview_stop` then `preview_start`), or the page keeps the old modules.
- **The running game** is `window.__game` (a `Game` from `game/main.js`); its renderer is `__game.renderer`.
- **Browser-pane rules:**
  - Test in a **separate tab** (`tabs_create`, then `navigate` it to `http://localhost:3001/`), never the tab Caelan plays in.
  - Before pressing GAME START in a test tab, run `__game.autosave = () => {}`. GAME START starts a fresh run whose first autosave overwrites the real save.
  - `requestAnimationFrame` never fires in the pane. Anything that animates (walking) needs `window.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 16)` first.
  - Movement keys are read from `e.code`, and the first press in a new direction only turns.
  - `computer {action: "screenshot"}` works; `zoom` does not. To magnify, draw part of `#game-canvas` onto a fixed full-window overlay canvas, screenshot, then remove the overlay.
  - `resize_window {width, height}` emulates a viewport on a tab; reset it with `{preset: "desktop"}` when done.
- **Units.** The renderer draws in *logical px*. A tile is `TILE_PX` = 32 logical px; the art is 16×16, so one art pixel is 2 logical px. Today:
  - the canvas is a 608×608 logical square (`CANVAS_PX`) showing 19×19 tiles (`VIEW_TILES`);
  - it is drawn at a fixed 2× (`SS` in `renderer.js`) into a 1216×1216 backing store;
  - the player's tile always sits at logical (288, 288), which is `half * TILE_PX` with `half = 9`.
- **`game/layout.js`** is the shared geometry module: the renderer draws panels at its rects, and `main.js` hit-tests taps against the same rects.
- **Menus** — the Remoticon (device), offer screen, dialogue, log history, target list, item overlay, inspect panel and ending card — are laid out in the 608×608 space. They keep those layouts; this plan draws them inside a 608×608 box centred on the screen.
- **Source pins.** `tests/offer-wiring.test.js` regex-matches two things in `renderer.js`'s `renderFrame`. Keep the line `if (game.state === 'trade') this._drawOfferScreen(game);` exactly, and keep a line beginning `this._menuPanelRect = CLOSE_PANEL` after the dispatch's first `} finally {`. It also pins `main.js`'s trade routing, `this._tapOffer(pt)`: Task 7 passes `mpt` there, so that regex becomes `this\._tapOffer\(m?pt\)` (found in execution).
- **Tests that lift code from source.** Several tests extract `main.js` methods by name (`liveMethod`), including `_tapOffer` and `_pointInRect`. This plan converts tap points into menu space *before* calling the menu handlers, so those handlers' bodies do not change.
- **Other branches.** `feature/diagonal-prototype` (June 2026, 8-way movement) is unmerged and touches `main.js`. It is Caelan's call; do not merge it or rebase onto it.

### File map

| File | Responsibility | Stage |
|---|---|---|
| `game/viewport.js` (new) | Screen geometry from window size + DPR: scale, tiles on screen, where you stand, the menu box, conversions. Pure, no DOM. | 1 |
| `tests/viewport.test.js` (new) | The rule on six screens, classic parity with today, conversions, the dock. | 1 |
| `game/dev/frame-recorder.js` (new, temporary) | Records what a frame draws and where, for stage 1's proof. Deleted in Task 14. | 1 |
| `game/dev/classic-frames.json` (new, temporary) | The recorder's hashes of today's frames. Deleted in Task 14. | 1 |
| `game/layout.js` | Adds `hudLayout(vp)`, `throwRects(vp)` and an anchor for `xmbBarLayout`; stage 3 adds the dock, the dial and `hitHud`. | 1–3 |
| `game/renderer.js` | Draws through the viewport and the HUD layout; menus in the menu box; stage 3 draws the dock, the opener and the dial. | 1–3 |
| `game/main.js` | `_fitCanvas` through the viewport; taps through the viewport and the HUD layout; stage 3 wires the ✦ opener. | 1–3 |
| `game/map.js`, `game/*-map.json` | The optional `border` filler. | 2 |
| `game/style.css`, `game/index.html` | The canvas fills the window; stage 3 changes the touch layout and moves the version badge. | 2–3 |
| `game/canvas-fit.js`, `tests/canvas-fit.test.js` | Superseded by the viewport; deleted in Task 14. | 2 |
| `CLAUDE.md`, `plans/screen-fill.md` | A note on the new geometry; the spec's status. | 3 |

---

## Stage 1 — the viewport goes in, and nothing moves

Every task in this stage must leave the three recorded frames identical to today's. That is the proof the spec asks for.

### Task 1: Cut the branch and record today's frames

**Files:**
- Create: `game/dev/frame-recorder.js`
- Create: `game/dev/classic-frames.json`

- [ ] **Step 1: Cut the branch and check the baseline**

```bash
cd /c/Code/violencetown
git switch dev && git pull --ff-only && git switch -c feature/screen-fill
npm test 2>&1 | tail -8
```

Expected: `ℹ tests 1281` and `ℹ fail 0`.

- [ ] **Step 2: Write the recorder**

Create `game/dev/frame-recorder.js`:

```js
// frame-recorder.js — stage 1's proof for plans/screen-fill-implementation.md.
//
// Records WHAT the renderer draws and WHERE for one frame of three fixed
// scenes: every drawing call with its arguments, the transform it was drawn
// under and the paint state it was drawn with, on the game canvas and on any
// offscreen canvas the frame touches. How the transform was built (save,
// translate, setTransform) is not recorded, so moving that plumbing around
// does not change a hash; drawing anything anywhere else does.
//
// Development only: nothing in the game imports it. Deleted with the classic
// viewport in Task 14.
//
// Use it in a Browser-pane test tab that has just loaded, had its autosave
// stubbed and pressed GAME START (see Task 1, Step 3). Always a FRESH tab:
// the log strip and quest state carry over between runs in one tab.

const CHUNK = 200;   // log lines per chunk hash, to locate a difference

const DRAW = new Set([
    'fillRect', 'strokeRect', 'clearRect', 'fillText', 'strokeText', 'drawImage', 'putImageData',
    'fill', 'stroke', 'clip', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo',
    'ellipse', 'rect', 'roundRect', 'quadraticCurveTo', 'bezierCurveTo',
]);
const MAKE = new Set(['createRadialGradient', 'createLinearGradient', 'createConicGradient', 'createPattern']);

const r3 = (n) => Math.round(n * 1000) / 1000;

function label(v, names) {
    if (typeof v === 'number') return r3(v);
    if (v == null || typeof v === 'string' || typeof v === 'boolean') return v;
    if (names.has(v)) return names.get(v);
    if (v instanceof HTMLImageElement) return 'img:' + v.src.split('/').pop().split('?')[0];
    if (v instanceof HTMLCanvasElement) return `canvas:${v.width}x${v.height}`;
    if (typeof ImageBitmap !== 'undefined' && v instanceof ImageBitmap) return `bitmap:${v.width}x${v.height}`;
    return v.constructor ? v.constructor.name : typeof v;
}

function recording(ctx, name, log, names) {
    const paint = () => {
        const m = ctx.getTransform();
        return [
            [m.a, m.b, m.c, m.d, m.e, m.f].map(r3).join(' '),
            label(ctx.fillStyle, names), label(ctx.strokeStyle, names), r3(ctx.globalAlpha),
            ctx.globalCompositeOperation, r3(ctx.lineWidth), ctx.font, ctx.textAlign, ctx.textBaseline,
            ctx.getLineDash().map(r3).join(','), ctx.imageSmoothingEnabled,
        ].join('|');
    };
    return new Proxy(ctx, {
        get(target, key) {
            const v = Reflect.get(target, key);
            if (typeof v !== 'function') return v;
            if (DRAW.has(key)) return (...args) => {
                log.push(`${name}.${key}(${args.map((a) => label(a, names)).join(',')}) @ ${paint()}`);
                return v.apply(target, args);
            };
            if (MAKE.has(key)) return (...args) => {
                const made = v.apply(target, args);
                if (!made) return made;
                names.set(made, `${key.slice(6)}(${args.map((a) => label(a, names)).join(',')})`);
                if (typeof made.addColorStop === 'function') {
                    const add = made.addColorStop.bind(made);
                    made.addColorStop = (offset, color) => {
                        names.set(made, `${names.get(made)}[${r3(offset)}:${color}]`);
                        return add(offset, color);
                    };
                }
                return made;
            };
            return v.bind(target);
        },
        set(target, key, value) { target[key] = value; return true; },
    });
}

async function sha256(text) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Settle a scene with 60 unrecorded frames (eases such as the combat arena
// converge), then record one frame. Called with the clock already frozen.
async function frame(game) {
    const r = game.renderer;
    game._idleTick = 0;
    game._animating = false;
    game._damageNumbers = [];
    game._logStripMessages = [
        { text: '[Recorder: a system line]', category: 'system' },
        { text: '[Recorder: a combat line]', category: 'combat' },
    ];
    for (let i = 0; i < 60; i++) r.renderFrame(game);
    r._vignetteGradient = null;   // rebuilt inside the recorded frame, so its geometry is logged
    r._ditherCache = null;        // likewise the threat stipple's pattern
    const log = [];
    const names = new Map();
    const realCtx = r.ctx;
    const realGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        const c = realGetContext.call(this, type, ...rest);
        return (type === '2d' && c && this !== r.canvas) ? recording(c, `off${this.width}x${this.height}`, log, names) : c;
    };
    r.ctx = recording(realCtx, 'main', log, names);
    try { r.renderFrame(game); }
    finally { r.ctx = realCtx; HTMLCanvasElement.prototype.getContext = realGetContext; }
    const chunks = [];
    for (let i = 0; i < log.length; i += CHUNK) chunks.push((await sha256(log.slice(i, i + CHUNK).join('\n'))).slice(0, 16));
    return { summary: { calls: log.length, hash: await sha256(log.join('\n')), chunks }, log };
}

// Records the three scenes. Returns { town, sewer, device } summaries
// ({ calls, hash, chunks }) and leaves the full logs on window.__frameLogs.
export async function recordScenes(game) {
    if (game.state !== 'idle') throw new Error(`recordScenes needs the game IDLE (it is ${game.state}): use a fresh tab`);
    const realNow = performance.now.bind(performance);
    const realRandom = Math.random;
    game.autosave = () => {};          // never write the save from a test tab
    game._worldBeat = () => {};        // freeze the free-roam heartbeat (NPCs, the clock)
    performance.now = () => 1e7;       // freeze every time-driven animation
    Math.random = () => 0.5;           // the renderer's only randomness is screen shake
    const out = {}, logs = {};
    try {
        // 1. Town at dusk: tiles, props, townsfolk, lighting, the HUD.
        game.rng.setState(1234);
        await game._loadMap('town-map.json');
        game._nightLevel = 0.6;
        ({ summary: out.town, log: logs.town } = await frame(game));

        // 2. A Sewer fight with the wheel open: arena, threat stipple, wheel.
        game.rng.setState(1234);
        await game._loadMap('sewer-map.json');
        game._nightLevel = 0;
        const foe = game.enemies.find((e) => e.entity.isAlive() && !e.ambient);
        const spot = [[-2, 0], [2, 0], [0, -2], [0, 2]]
            .map(([dx, dy]) => [foe.x + dx, foe.y + dy])
            .find(([x, y]) => game.map.isWalkable(x, y) && !game.enemies.some((e) => e.x === x && e.y === y));
        game.playerX = spot[0]; game.playerY = spot[1];
        foe.state = 'chasing';
        game._openWheel();
        game._overlayOpenedAt = 0;     // the open animation is long finished
        ({ summary: out.sewer, log: logs.sewer } = await frame(game));
        game._closeWheel();

        // 3. The Remoticon over Town: a menu.
        game.rng.setState(1234);
        await game._loadMap('town-map.json');
        game._openDevice('items');
        ({ summary: out.device, log: logs.device } = await frame(game));
        game._closeDevice();
    } finally {
        performance.now = realNow;
        Math.random = realRandom;
    }
    window.__frameLogs = logs;
    return out;
}

// Records the scenes again and compares them with classic-frames.json. Each
// scene reports 'match', or the first 200-call chunk that differs with that
// chunk's lines from this run, to show where to look.
export async function compareScenes(game) {
    const want = await (await fetch('/dev/classic-frames.json', { cache: 'no-store' })).json();
    const got = await recordScenes(game);
    const report = {};
    for (const name of ['town', 'sewer', 'device']) {
        const a = want[name], b = got[name];
        if (a.hash === b.hash) { report[name] = 'match'; continue; }
        let at = a.chunks.findIndex((c, i) => c !== b.chunks[i]);
        if (at < 0) at = Math.min(a.chunks.length, b.chunks.length);
        report[name] = { calls: { want: a.calls, got: b.calls }, chunk: at, lines: window.__frameLogs[name].slice(at * CHUNK, (at + 1) * CHUNK) };
    }
    return report;
}
```

- [ ] **Step 3: Record today's frames, twice**

Restart the dev server (`preview_stop`, then `preview_start {name: "violencetown"}`). Open a new tab (`tabs_create`), `navigate` it to `http://localhost:3001/`, and run this in that tab with the JavaScript tool:

```js
for (let i = 0; i < 40 && !(window.__game?.renderer?.sprites && window.__game.renderer.font); i++) await new Promise((r) => setTimeout(r, 250));
__game.autosave = () => {};
document.getElementById('splash-go').click();
await new Promise((r) => setTimeout(r, 500));
const { recordScenes } = await import('/dev/frame-recorder.js');
JSON.stringify(await recordScenes(__game))
```

Expected: a JSON object with `town`, `sewer` and `device`, each holding `calls` (in the thousands), a 64-character `hash` and a `chunks` array.

Then reload the tab (`navigate` to the same URL) and run the same snippet again. **The three hashes must be identical to the first run.** If they differ, something in a scene is not frozen: stop and find it before continuing (compare `window.__frameLogs` between the runs).

- [ ] **Step 4: Save the hashes**

Create `game/dev/classic-frames.json` with the second run's output plus the base commit, in this shape (values from your run):

```json
{
  "base": "689f26b",
  "town":   { "calls": 0, "hash": "…", "chunks": ["…"] },
  "sewer":  { "calls": 0, "hash": "…", "chunks": ["…"] },
  "device": { "calls": 0, "hash": "…", "chunks": ["…"] }
}
```

Confirm the comparison helper reads it. In a fresh tab (reload), run:

```js
for (let i = 0; i < 40 && !(window.__game?.renderer?.sprites && window.__game.renderer.font); i++) await new Promise((r) => setTimeout(r, 250));
__game.autosave = () => {};
document.getElementById('splash-go').click();
await new Promise((r) => setTimeout(r, 500));
const { compareScenes } = await import('/dev/frame-recorder.js');
JSON.stringify(await compareScenes(__game))
```

Expected: `{"town":"match","sewer":"match","device":"match"}`. **Every later stage-1 task ends by running this exact snippet (the "frame check") in a freshly loaded tab after restarting the dev server.**

- [ ] **Step 5: Commit**

```bash
git add game/dev/frame-recorder.js game/dev/classic-frames.json && git commit -m "dev(screen-fill): record what today's frames draw, to prove the viewport changes nothing"
```

### Task 2: The viewport module

**Files:**
- Create: `game/viewport.js`
- Test: `tests/viewport.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/viewport.test.js`:

```js
// viewport.test.js — the screen's geometry (plans/screen-fill.md).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    computeViewport, CLASSIC, MIN_TILES, ART_PX, MENU_SIZE,
    tileToScreen, screenToTile, offView, clientToScreen, toMenu, snapPx,
} from '../game/viewport.js';
import { pickCanvasCss } from '../game/canvas-fit.js';

// The six screens the spec's table is measured on: CSS size and DPR, then the
// tile size in screen px and the tiles on screen the rule must give.
const SCREENS = {
    "Caelan's monitor": { cssW: 3440, cssH: 1440, dpr: 1, tile: 64, cols: 53.75,  rows: 22.5 },
    '1080p':            { cssW: 1920, cssH: 1080, dpr: 1, tile: 48, cols: 40,     rows: 22.5 },
    '1440p':            { cssW: 2560, cssH: 1440, dpr: 1, tile: 64, cols: 40,     rows: 22.5 },
    'laptop':           { cssW: 1440, cssH: 900,  dpr: 2, tile: 80, cols: 36,     rows: 22.5 },
    'phone upright':    { cssW: 390,  cssH: 844,  dpr: 3, tile: 48, cols: 24.375, rows: 52.75 },
    'phone sideways':   { cssW: 844,  cssH: 390,  dpr: 3, tile: 48, cols: 52.75,  rows: 24.375 },
};
const at = (s, extra = {}) => computeViewport({ cssW: s.cssW, cssH: s.cssH, dpr: s.dpr, ...extra });

describe('classic: the square the game draws today', () => {
    test('is 608 logical px and 19x19 tiles, drawn at 2x into a 1216 backing store', () => {
        assert.equal(CLASSIC.w, 608); assert.equal(CLASSIC.h, 608);
        assert.equal(CLASSIC.cols, 19); assert.equal(CLASSIC.rows, 19);
        assert.equal(CLASSIC.backingW, 1216); assert.equal(CLASSIC.backingH, 1216);
        assert.equal(CLASSIC.scale, 2);
    });

    test("puts the player's tile at (288, 288) and sees nine tiles each way", () => {
        assert.deepEqual(CLASSIC.origin, { x: 288, y: 288 });
        assert.deepEqual(CLASSIC.span, { iMin: -9, iMax: 9, jMin: -9, jMax: 9 });
    });

    test('draws menus where they have always been, with no dock and a 1px scroll step', () => {
        assert.deepEqual(CLASSIC.menu, { x: 0, y: 0, w: 608, h: 608 });
        assert.equal(CLASSIC.dockH, 0);
        assert.equal(CLASSIC.snap, 1);
    });

    test('sizes the square exactly as _fitCanvas did', () => {
        for (const [w, h, dpr] of [[1920, 1080, 1], [3440, 1440, 1], [1400, 900, 1.5], [390, 844, 3]]) {
            const vp = computeViewport({ mode: 'classic', cssW: w, cssH: h, dpr });
            const want = pickCanvasCss(Math.min(h - 16, w - 16, 1024), dpr);
            assert.equal(vp.cssW, want);
            assert.equal(vp.cssH, want);
        }
    });
});

describe('fill: one rule picks the tile size', () => {
    for (const [name, s] of Object.entries(SCREENS)) {
        test(`${name}: ${s.tile}px tiles, ${s.cols} x ${s.rows} on screen`, () => {
            const vp = at(s);
            assert.equal(vp.k * 16, s.tile);
            assert.equal(vp.cols, s.cols);
            assert.equal(vp.rows, s.rows);
        });
    }

    test('fits at least MIN_TILES along the short side, at the largest whole scale that does', () => {
        for (const dpr of [1, 1.25, 1.5, 2, 3]) {
            for (let w = 360; w <= 3840; w += 97) {
                for (let h = 360; h <= 2160; h += 131) {
                    const vp = computeViewport({ cssW: w, cssH: h, dpr });
                    const short = Math.min(vp.backingW, vp.backingH);
                    assert.ok(Number.isInteger(vp.k) && vp.k >= 1, `k=${vp.k}`);
                    assert.ok(short / (16 * vp.k) >= MIN_TILES, `${w}x${h}@${dpr}: too few tiles`);
                    assert.ok(short / (16 * (vp.k + 1)) < MIN_TILES, `${w}x${h}@${dpr}: a bigger scale fits`);
                }
            }
        }
    });

    test('the backing store matches the canvas one to one (no resampling)', () => {
        for (const s of Object.values(SCREENS)) {
            const vp = at(s);
            assert.equal(vp.cssW * s.dpr, vp.backingW);
            assert.equal(vp.cssH * s.dpr, vp.backingH);
        }
    });

    test('art pixels land on whole backing px: the origin, the menu box and the scroll step', () => {
        for (const dpr of [1, 1.25, 1.5, 2, 3]) {
            for (let w = 360; w <= 3840; w += 113) {
                const vp = computeViewport({ cssW: w, cssH: Math.round(w * 0.6), dpr });
                for (const v of [vp.origin.x, vp.origin.y, vp.menu.x, vp.menu.y]) {
                    assert.ok(Number.isInteger(v * vp.scale), `${v} logical px is ${v * vp.scale} backing px`);
                }
                assert.ok(Number.isInteger(vp.snap * vp.scale), `snap ${vp.snap} at scale ${vp.scale}`);
            }
        }
    });

    test('you stand at the centre of the world area', () => {
        const vp = at(SCREENS['1080p']);           // 1280 x 720 logical
        assert.deepEqual(vp.origin, { x: 624, y: 344 });
        assert.deepEqual(vp.span, { iMin: -20, iMax: 20, jMin: -11, jMax: 11 });
    });

    test('a dock shrinks the world area and lifts you to its centre', () => {
        const dock = { oneRow: 100, twoRows: 196, minOneRowW: 1000 };
        const wide = at(SCREENS['1080p'], { dock });
        assert.equal(wide.dockRows, 1);
        assert.equal(wide.dockH, 100);
        assert.deepEqual(wide.world, { x: 0, y: 0, w: 1280, h: 620 });
        assert.equal(wide.origin.y, 294);
        const tall = at(SCREENS['phone upright'], { dock });
        assert.equal(tall.portrait, true);
        assert.equal(tall.dockRows, 2);
        assert.equal(tall.dockH, 196);
        // Wider than tall, but under minOneRowW logical px: two rows as well.
        const squarish = computeViewport({ cssW: 1100, cssH: 1000, dpr: 1, dock });
        assert.equal(squarish.portrait, false);
        assert.equal(squarish.dockRows, 2);
        assert.equal(CLASSIC.dockRows, 0);
    });

    test('the menu box is centred and fully on screen', () => {
        for (const s of Object.values(SCREENS)) {
            const vp = at(s);
            assert.equal(vp.menu.w, MENU_SIZE);
            assert.equal(vp.menu.h, MENU_SIZE);
            assert.ok(vp.menu.x >= 0 && vp.menu.x + MENU_SIZE <= vp.w, `menu off screen across on ${s.cssW}x${s.cssH}`);
            assert.ok(vp.menu.y >= 0 && vp.menu.y + MENU_SIZE <= vp.h, `menu off screen down on ${s.cssW}x${s.cssH}`);
            assert.ok(Math.abs(vp.menu.x + MENU_SIZE / 2 - vp.w / 2) <= ART_PX);
        }
    });

    test('a nonsense dpr falls back to 1', () => {
        const one = computeViewport({ cssW: 1920, cssH: 1080, dpr: 1 });
        assert.deepEqual(computeViewport({ cssW: 1920, cssH: 1080, dpr: 0 }), one);
        assert.deepEqual(computeViewport({ cssW: 1920, cssH: 1080, dpr: NaN }), one);
    });
});

describe('conversions', () => {
    const views = [CLASSIC, at(SCREENS['1080p']), at(SCREENS['phone upright'])];

    test('screenToTile inverts tileToScreen, mid-scroll too', () => {
        for (const vp of views) {
            for (const [sx, sy] of [[0, 0], [12, -20], [-31, 5]]) {
                for (let dx = -8; dx <= 8; dx++) for (let dy = -6; dy <= 6; dy++) {
                    const p = tileToScreen(vp, 50 + dx, 40 + dy, 50, 40, sx, sy);
                    const back = screenToTile(vp, { x: p.x + 5, y: p.y + 27 }, 50, 40, sx, sy);
                    assert.deepEqual(back, { x: 50 + dx, y: 40 + dy });
                }
            }
        }
    });

    test('classic screenToTile is the old _screenToTile arithmetic', () => {
        const old = (pt, px, py, sx, sy) => ({ x: Math.floor((pt.x + sx) / 32 - 9 + px), y: Math.floor((pt.y + sy) / 32 - 9 + py) });
        for (let x = 0; x < 608; x += 7) for (let y = 0; y < 608; y += 11) {
            assert.deepEqual(screenToTile(CLASSIC, { x, y }, 16, 12, 3, -4), old({ x, y }, 16, 12, 3, -4));
        }
    });

    test("classic offView is the old passes' culls", () => {
        // renderer.js culled with `vx < -m || vx > VIEW_TILES + m - 1`, vx = dx + 9.
        for (const m of [1, 2, 3, 4]) {
            for (let d = -16; d <= 16; d++) {
                const vx = d + 9;
                const old = vx < -m || vx > 19 + m - 1;
                assert.equal(offView(CLASSIC, d, 0, m), old, `m=${m} dx=${d}`);
                assert.equal(offView(CLASSIC, 0, d, m), old, `m=${m} dy=${d}`);
            }
        }
    });

    test('clientToScreen maps the drawn rect onto the logical screen', () => {
        const vp = at(SCREENS['1080p']);
        const rect = { left: 10, top: 20, width: 1920, height: 1080 };
        assert.deepEqual(clientToScreen(vp, 10, 20, rect), { x: 0, y: 0 });
        assert.deepEqual(clientToScreen(vp, 1930, 1100, rect), { x: 1280, y: 720 });
        assert.equal(clientToScreen(vp, 5, 5, { left: 0, top: 0, width: 0, height: 0 }), null);
    });

    test("toMenu moves a screen point into the menu box's own space", () => {
        const vp = at(SCREENS['1080p']);
        assert.deepEqual(toMenu(vp, { x: vp.menu.x + 10, y: vp.menu.y + 20 }), { x: 10, y: 20 });
        assert.deepEqual(toMenu(CLASSIC, { x: 10, y: 20 }), { x: 10, y: 20 });
        assert.equal(toMenu(vp, null), null);
    });

    test("snapPx rounds to the viewport's step", () => {
        assert.equal(snapPx(CLASSIC, 3.4), 3);
        const odd = at(SCREENS['1080p']);          // k = 3, so scale is 1.5
        assert.equal(odd.snap, 2);
        assert.equal(snapPx(odd, 3.4), 4);
        assert.equal(snapPx(odd, 2.9), 2);
    });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test tests/viewport.test.js`
Expected: FAIL — `Cannot find module '…/game/viewport.js'`.

- [ ] **Step 3: Write the module**

Create `game/viewport.js`:

```js
// viewport.js — the screen: how big it is in pixels and in tiles, where the
// world shows through, where you stand on it, and where menus go.
//
// The one source of truth for screen geometry (plans/screen-fill.md). The
// renderer draws with it and main.js hit-tests with it, so a tap lands where
// the thing was drawn: the contract layout.js keeps for panels. Pure: no DOM,
// no game state, node-testable like perception.js.
//
// Units. A logical px is what the renderer draws in: a tile is TILE_PX (32)
// logical px and one art pixel (the art is 16x16) is 2. `scale` is the canvas
// transform, backing-store px per logical px. `k` is backing-store px per art
// pixel; pixel art stays crisp only while k is a whole number.

import { TILE_PX, CANVAS_PX } from './data.js';
import { pickCanvasCss } from './canvas-fit.js';

export const ART_PX = TILE_PX / 16;    // logical px per art pixel: 2
export const MIN_TILES = 20;           // the rule: at least this many tiles along the short side
export const MENU_SIZE = CANVAS_PX;    // menus keep their 608x608 layouts, in a centred box

const CLASSIC_SS = 2;                  // the old fixed supersample: 1216 backing px for 608 logical
const CLASSIC_CAP = 1024;              // the old CSS cap on the square

// Round a logical coordinate to whole art pixels, which land on whole
// backing-store px at every k.
const toArt = (v) => ART_PX * Math.round(v / ART_PX);

// `mode: 'classic'` reproduces the pre-viewport 19x19 square exactly (stage 1
// of the build; removed in stage 2). `mode: 'fill'` fills cssW x cssH with as
// many tiles as fit at the largest whole scale that still shows MIN_TILES
// along the short side. `dock` ({ oneRow, twoRows, minOneRowW }, logical px)
// is the strip along the bottom the world does not show through: one row on
// a wide screen, two rows on an upright one or one narrower than minOneRowW.
export function computeViewport({ mode = 'fill', cssW, cssH, dpr = 1, dock = null } = {}) {
    const d = (Number.isFinite(dpr) && dpr > 0) ? dpr : 1;
    let cssOut, backingW, backingH, scale;
    if (mode === 'classic') {
        const side = pickCanvasCss(Math.min(cssH - 16, cssW - 16, CLASSIC_CAP), d);
        cssOut = { w: side, h: side };
        backingW = backingH = CANVAS_PX * CLASSIC_SS;
        scale = CLASSIC_SS;
    } else {
        backingW = Math.max(1, Math.floor(cssW * d));
        backingH = Math.max(1, Math.floor(cssH * d));
        cssOut = { w: backingW / d, h: backingH / d };
        const k = Math.max(1, Math.floor(Math.min(backingW, backingH) / (16 * MIN_TILES)));
        scale = k / ART_PX;
    }
    const w = backingW / scale, h = backingH / scale;
    const portrait = h > w;
    const dockRows = (mode === 'classic' || !dock) ? 0 : (portrait || w < dock.minOneRowW) ? 2 : 1;
    const dockH = dockRows === 2 ? dock.twoRows : dockRows === 1 ? dock.oneRow : 0;
    const world = { x: 0, y: 0, w, h: h - dockH };
    const origin = {
        x: toArt(world.x + world.w / 2 - TILE_PX / 2),
        y: toArt(world.y + world.h / 2 - TILE_PX / 2),
    };
    return Object.freeze({
        mode, cssW: cssOut.w, cssH: cssOut.h, backingW, backingH,
        scale, k: scale * ART_PX, w, h, cols: w / TILE_PX, rows: h / TILE_PX,
        world, origin, dockH, dockRows, portrait,
        // The tiles, relative to yours, that are at least partly on screen.
        span: {
            iMin: -Math.ceil(origin.x / TILE_PX), iMax: Math.ceil((w - origin.x) / TILE_PX) - 1,
            jMin: -Math.ceil(origin.y / TILE_PX), jMax: Math.ceil((h - origin.y) / TILE_PX) - 1,
        },
        menu: {
            x: Math.max(0, toArt((w - MENU_SIZE) / 2)),
            y: Math.max(0, toArt((h - MENU_SIZE) / 2)),
            w: MENU_SIZE, h: MENU_SIZE,
        },
        // A logical offset that is a multiple of this lands on whole backing px.
        snap: Number.isInteger(scale) ? 1 : ART_PX,
        // Logical px per CSS px, to size page elements that overlay the canvas.
        logicalPerCss: (backingW / cssOut.w) / scale,
    });
}

// The classic square, for anything that draws before main hands the renderer
// a viewport (and for tests that build renderers by hand).
export const CLASSIC = computeViewport({ mode: 'classic', cssW: 1040, cssH: 1040, dpr: 1 });

// Where tile (tx, ty) lands on screen, logical px, for a camera on (px, py)
// that has scrolled (sx, sy) logical px partway through a step.
export function tileToScreen(vp, tx, ty, px, py, sx = 0, sy = 0) {
    return { x: vp.origin.x + (tx - px) * TILE_PX - sx, y: vp.origin.y + (ty - py) * TILE_PX - sy };
}

// The tile under a screen point: the inverse of tileToScreen.
export function screenToTile(vp, pt, px, py, sx = 0, sy = 0) {
    return {
        x: px + Math.floor((pt.x + sx - vp.origin.x) / TILE_PX),
        y: py + Math.floor((pt.y + sy - vp.origin.y) / TILE_PX),
    };
}

// Is the tile (dx, dy) from yours more than `m` tiles off screen? The
// renderer's per-pass cull; `m` is the margin a pass leaves for overhang.
export function offView(vp, dx, dy, m) {
    return dx < vp.span.iMin - m || dx > vp.span.iMax + m || dy < vp.span.jMin - m || dy > vp.span.jMax + m;
}

// A pointer's client coordinates to screen logical px, through the canvas's
// drawn rect. Null before the canvas has laid out.
export function clientToScreen(vp, clientX, clientY, rect) {
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    return { x: (clientX - rect.left) * (vp.w / rect.width), y: (clientY - rect.top) * (vp.h / rect.height) };
}

// A screen point to the menu box's own 608x608 space, where menu layouts live.
export function toMenu(vp, pt) {
    return pt && { x: pt.x - vp.menu.x, y: pt.y - vp.menu.y };
}

// Round a logical offset (camera scroll, screen shake) to the viewport's step.
export function snapPx(vp, v) {
    return Math.round(v / vp.snap) * vp.snap;
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test tests/viewport.test.js`
Expected: every test passes (`ℹ fail 0`).

Then run the whole suite: `npm test 2>&1 | tail -8`. Expected: `ℹ fail 0`, and the count grows by this file's tests.

- [ ] **Step 5: Commit**

```bash
git add game/viewport.js tests/viewport.test.js && git commit -m "feat(viewport): one module for the screen's geometry, with today's square as its classic mode"
```

### Task 3: The HUD layout for a viewport (classic)

`hudLayout(vp)` becomes the one answer to "where does each HUD piece sit". In this stage it only knows the classic square, and returns today's fixed positions. `throwRects(vp)` puts the throw prompt around the player's tile, and `xmbBarLayout` gains an anchor.

**Files:**
- Modify: `game/layout.js` (imports at the top; `THROW_RECTS` block ~line 52; `xmbBarLayout` ~line 84; `xmbBarPanelRect` ~line 107; `hudInteractiveRects` ~line 121; after `QUESTLOG_RECT` ~line 160)
- Test: `tests/hud-layout.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/hud-layout.test.js`:

```js
import { hudLayout, throwRects, THROW_RECTS, RADIAL_CENTER_X, RADIAL_CENTER_Y, xmbBarLayout, XMB_ANCHOR_CLASSIC } from '../game/layout.js';
import { CLASSIC, computeViewport } from '../game/viewport.js';

describe('hudLayout (classic) is the old square', () => {
    test('every piece sits where the fixed constants put it', () => {
        const hud = hudLayout(CLASSIC);
        assert.deepEqual(hud.hp, { x: 6, y: 6 });
        assert.equal(hud.buffsRight, 602);
        assert.equal(hud.buffsTop, 6);
        assert.deepEqual(hud.log, { ...QUESTLOG_RECT, lines: 2 });
        assert.deepEqual(hud.bar, { cx: 304, bottom: 588 });
        assert.deepEqual(hud.wheel, { cx: RADIAL_CENTER_X, cy: RADIAL_CENTER_Y });
        assert.equal(hud.strip, 608);
    });

    test('throwRects(classic) are THROW_RECTS', () => {
        assert.deepEqual(throwRects(CLASSIC), THROW_RECTS);
    });

    test("throwRects follow the player's tile", () => {
        const vp = computeViewport({ cssW: 1920, cssH: 1080, dpr: 1 });
        const r = throwRects(vp);
        const cx = vp.origin.x + 16, cy = vp.origin.y + 16;
        assert.equal(r.up.x + r.up.w / 2, cx);
        assert.equal(r.left.y + r.left.h / 2, cy);
        assert.ok(r.up.y + r.up.h <= cy - 16 && r.down.y >= cy + 16, 'the targets clear the player tile');
    });

    test('xmbBarLayout moves with its anchor', () => {
        const bar = { columns: [{ key: 'throw', label: 'THROW', items: [{ itemDef: { id: 'rock' }, count: 1 }] }] };
        const a = xmbBarLayout(bar), b = xmbBarLayout(bar, { cx: 1000, bottom: 700 });
        assert.deepEqual(xmbBarLayout(bar, XMB_ANCHOR_CLASSIC), a);
        assert.equal(b.chips[0].x - a.chips[0].x, 1000 - 304);
        assert.equal(b.current.y - a.current.y, 700 - 588);
    });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test tests/hud-layout.test.js`
Expected: FAIL — `hudLayout` (and `throwRects`, `XMB_ANCHOR_CLASSIC`) are not exported from `layout.js`.

- [ ] **Step 3: Implement**

In `game/layout.js`, below the existing `import { unlockedSlots, adjacentPairs, HANDS } from './rings.js';` line, add:

```js
import { TILE_PX } from './data.js';
import { CLASSIC } from './viewport.js';   // (screen-fill) the default viewport for the HUD helpers
```

Directly after the `THROW_RECTS` object, add:

```js
// The throw prompt's four targets around the player's tile, wherever the
// viewport puts it. THROW_RECTS are the same targets around the old square's
// centre (304, 304), so classic returns them unchanged.
export function throwRects(vp = CLASSIC) {
    const dx = vp.origin.x + TILE_PX / 2 - CANVAS_INTERNAL_PX / 2;
    const dy = vp.origin.y + TILE_PX / 2 - CANVAS_INTERNAL_PX / 2;
    const at = (r) => ({ x: r.x + dx, y: r.y + dy, w: r.w, h: r.h });
    return { up: at(THROW_RECTS.up), down: at(THROW_RECTS.down), left: at(THROW_RECTS.left), right: at(THROW_RECTS.right) };
}
```

Replace the head of `xmbBarLayout`:

```js
export function xmbBarLayout(bar) {
    const cols = (bar && bar.columns) || [];
    const cx = CANVAS_INTERNAL_PX / 2;
    const bottom = HOTBAR_OY + HOTBAR_SLOT_H;                 // 588 — align with old hotbar bottom
```

with:

```js
// `anchor` is where hudLayout puts the bar: its centre x, and the bottom of
// its current-item cell. The default is the old square's (304, 588).
export const XMB_ANCHOR_CLASSIC = Object.freeze({ cx: CANVAS_INTERNAL_PX / 2, bottom: HOTBAR_OY + HOTBAR_SLOT_H });
export function xmbBarLayout(bar, anchor = XMB_ANCHOR_CLASSIC) {
    const cols = (bar && bar.columns) || [];
    const cx = anchor.cx;
    const bottom = anchor.bottom;
```

Replace the whole of `xmbBarPanelRect`:

```js
export function xmbBarPanelRect(n = 3) {
  const chipW = 96, gap = 6, stride = chipW + gap;   // 102
  const totalChips = n * stride - gap;               // n=3 -> 300
  const left = 304 - totalChips / 2 - 10;            // n=3 -> 144
  const right = 304 + totalChips / 2 + 10;           // n=3 -> 464
  const top = 510, bottom = 592;                     // chipY-6 .. current-bottom+10
  return { x: left, y: top, w: right - left, h: bottom - top };
}
```

with:

```js
export function xmbBarPanelRect(n = 3, anchor = XMB_ANCHOR_CLASSIC) {
  const chipW = 96, gap = 6, stride = chipW + gap;   // 102
  const totalChips = n * stride - gap;               // n=3 -> 300
  const left = anchor.cx - totalChips / 2 - 10;      // n=3, classic -> 144
  const right = anchor.cx + totalChips / 2 + 10;     // n=3, classic -> 464
  const top = anchor.bottom - 78;                    // chipY - 6: classic 510
  const bottom = anchor.bottom + 4;                  // the panel's bottom edge: classic 592
  return { x: left, y: top, w: right - left, h: bottom - top };
}
```

Replace the whole of `hudInteractiveRects`:

```js
export function hudInteractiveRects(state) {
  const rects = [];
  if (state === 'idle') {
    rects.push({ name: 'questlog', rect: QUESTLOG_RECT });
    rects.push({ name: 'xmb', rect: xmbBarPanelRect(3) });
  }
  return rects;
}
```

with:

```js
export function hudInteractiveRects(state, vp = CLASSIC) {
  const rects = [];
  if (state === 'idle') {
    const hud = hudLayout(vp);
    rects.push({ name: 'questlog', rect: hud.log });
    rects.push({ name: 'xmb', rect: xmbBarPanelRect(3, hud.bar) });
  }
  return rects;
}
```

Directly after the `QUESTLOG_RECT` line (`export const QUESTLOG_RECT = { x: 6, y: 436, w: 340, h: 62 };`), add:

```js
// ── The HUD, placed for a viewport (plans/screen-fill.md) ──
// Where every HUD piece sits on a given screen: the renderer draws there and
// main.js hit-tests there, the same contract as the rects in this file. Stage
// 1 of the build knows only the classic square, and reproduces it exactly.
export function hudLayout(vp = CLASSIC) {
    return {
        hp: { x: 6, y: 6 },                                   // the HP panel's top-left (170 x 90)
        buffsRight: CANVAS_INTERNAL_PX - 6, buffsTop: 6,      // the buff bar hangs from its top-right corner
        log: { ...QUESTLOG_RECT, lines: 2 },                  // the quest log, and how many feed lines it shows
        bar: XMB_ANCHOR_CLASSIC,                              // the item bar's anchor (xmbBarLayout)
        wheel: { cx: RADIAL_CENTER_X, cy: RADIAL_CENTER_Y },  // the wheel's hub
        strip: CANVAS_INTERNAL_PX,                            // the bottom hint strips rest on this y
    };
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test tests/hud-layout.test.js tests/xmb-layout.test.js`
Expected: all pass, including the old non-overlap invariant and `xmbBarPanelRect` worst-case test.

Run: `npm test 2>&1 | tail -8`
Expected: `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add game/layout.js tests/hud-layout.test.js && git commit -m "feat(layout): hudLayout places the HUD for a viewport; classic is today's positions"
```

### Task 4: The renderer takes a viewport (frame, lighting, menus)

The renderer gets `setViewport` / `_view()` / `_hud()` / `_fillScreen()`, and the frame-wide passes switch over: the transform, the clear, scroll and shake snapping, darkness, lighting, the arena, the vignette, the menu box and the menu scrims. With the classic viewport every number is today's, so the frame check must still match.

**Files:**
- Modify: `game/renderer.js`

- [ ] **Step 1: Imports and the supersample constant**

Replace:

```js
import { TILE_PX, VIEW_TILES, CANVAS_PX, SAFE_SLOTS } from './data.js';

// Supersample factor: render the canvas at SS x the internal 608 resolution so
// the (anti-aliased) VT323 text stays sharp under the pixel-art upscale rather
// than being blown up soft. All drawing stays in 608 coords via a base
// ctx.setTransform(SS,…) at the top of each frame; tap input maps via
// CANVAS_INTERNAL_PX (608) independently, so it's unaffected.
const SS = 2;
```

with:

```js
import { TILE_PX, VIEW_TILES, CANVAS_PX, SAFE_SLOTS } from './data.js';
import { CLASSIC, offView, snapPx } from './viewport.js';   // (screen-fill) the screen's geometry

// The splash canvas's supersample: its 320x220 card is drawn at 2x so the
// VT323 text stays sharp. The game canvas's transform comes from the viewport
// (setViewport / renderFrame).
const SS = 2;
```

In the `import { … } from './layout.js';` block, change the line `xmbBarLayout,                                                            // (XMB) usable-bar geometry` to:

```js
    xmbBarLayout, hudLayout, throwRects,                                     // (XMB) usable-bar geometry; (screen-fill) the HUD + throw targets for a viewport
```

- [ ] **Step 2: The constructor, and the viewport helpers**

Replace the constructor:

```js
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx    = canvas.getContext('2d');
        canvas.width  = CANVAS_PX * SS;
        canvas.height = CANVAS_PX * SS;
        this.ctx.imageSmoothingEnabled = false;

        this.half    = (VIEW_TILES - 1) / 2;
        this.sprites = null;
        this.zone    = 'TOWN';
    }
```

with:

```js
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx    = canvas.getContext('2d');
        this.viewport = null;              // main._fitCanvas hands one over via setViewport
        canvas.width  = CLASSIC.backingW;
        canvas.height = CLASSIC.backingH;
        this.ctx.imageSmoothingEnabled = false;

        this.half    = (VIEW_TILES - 1) / 2;   // retired in Task 5
        this.sprites = null;
        this.zone    = 'TOWN';
    }

    // (screen-fill) The screen's geometry, from game/viewport.js. main._fitCanvas
    // hands it over on boot, on resize and on a DPR change. Resizing the backing
    // store clears the canvas and resets its state, so it only happens on a change.
    setViewport(vp) {
        this.viewport = vp;
        if (this.canvas.width !== vp.backingW)  this.canvas.width  = vp.backingW;
        if (this.canvas.height !== vp.backingH) this.canvas.height = vp.backingH;
        this._vignetteGradient = null;     // it is sized to the screen
    }

    // The viewport in force: the one main set, or the classic square for a
    // renderer that never had one (tests build renderers with Object.create).
    _view() { return this.viewport || CLASSIC; }

    // Where the HUD pieces sit for the viewport in force (layout.js hudLayout),
    // recomputed only when the viewport changes.
    _hud() {
        const vp = this._view();
        if (this._hudFor !== vp) { this._hudFor = vp; this._hudCache = hudLayout(vp); }
        return this._hudCache;
    }

    // Fill the whole screen with the current fillStyle, whatever translate the
    // caller is under: menus draw inside the centred menu box, and their scrims
    // must still cover everything.
    _fillScreen(ctx) {
        const vp = this._view();
        ctx.save();
        ctx.setTransform(vp.scale, 0, 0, vp.scale, 0, 0);
        ctx.fillRect(0, 0, vp.w, vp.h);
        ctx.restore();
    }
```

- [ ] **Step 3: renderFrame — transform, clear, scroll and shake**

In `renderFrame`, replace:

```js
    renderFrame(game) {
        const { ctx } = this;
        ctx.setTransform(SS, 0, 0, SS, 0, 0);   // supersample: draw in 608 coords at SS density
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, CANVAS_PX, CANVAS_PX);
```

with:

```js
    renderFrame(game) {
        const { ctx } = this;
        const vp = this._view();
        ctx.setTransform(vp.scale, 0, 0, vp.scale, 0, 0);   // draw in logical px at the viewport's scale
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, vp.w, vp.h);
```

Replace:

```js
            this._scrollX = Math.round((game._animToX - game._animFromX) * t * TILE_PX);
            this._scrollY = Math.round((game._animToY - game._animFromY) * t * TILE_PX);
```

with:

```js
            // (screen-fill) "Whole pixels" means whole backing px: snapPx rounds to
            // 1 logical px at integer scales and to one art pixel at k = 3, 5, …
            this._scrollX = snapPx(vp, (game._animToX - game._animFromX) * t * TILE_PX);
            this._scrollY = snapPx(vp, (game._animToY - game._animFromY) * t * TILE_PX);
```

Replace:

```js
            shakeX = Math.round((Math.random() - 0.5) * mag * 2); // whole-pixel shake
            shakeY = Math.round((Math.random() - 0.5) * mag * 2); // (avoid sub-pixel seams)
```

with:

```js
            shakeX = snapPx(vp, (Math.random() - 0.5) * mag * 2); // whole-pixel shake
            shakeY = snapPx(vp, (Math.random() - 0.5) * mag * 2); // (avoid sub-pixel seams)
```

- [ ] **Step 4: renderFrame — menus in the menu box**

Above the class (next to `tileRef`), add:

```js
// (screen-fill) The states whose panels are laid out in the 608x608 menu
// space. They draw inside the viewport's centred menu box. The wheel and the
// throw prompt are not menus: they draw at their own screen positions.
const MENU_BOX_STATES = new Set(['item_overlay', 'target_list', 'ending', 'log_modal', 'trade', 'dialogue', 'inspect', 'device']);
```

In `renderFrame`, replace the modal dispatch and its `finally` block:

```js
        try {
            if (game.state === 'item_overlay')    this._drawItemOverlay(game);
            if (game.state === 'radial_menu')     this._drawRadialMenu(game);
            if (game.state === 'target_list')     this._drawTargetList(game);
            if (game.state === 'item_throw_dir')  this._drawThrowPrompt(game);
            if (game.state === 'ending') this._drawEndingOverlay(game);
            if (game.state === 'log_modal') this._drawLogModal(game);
            if (game.state === 'trade') this._drawOfferScreen(game);
            if (game.state === 'dialogue') this._drawDialogueModal(game);
            if (game.state === 'inspect') this._drawInspectPanel(game);
            if (game.state === 'device') this._drawDevice(game);
        } finally {
```

with:

```js
        // The menu box only moves the origin; a translate and its inverse, not a
        // save/restore, so a menu's paint state carries on exactly as it did.
        const box = vp.menu;
        const inBox = MENU_BOX_STATES.has(game.state);
        try {
            if (inBox) ctx.translate(box.x, box.y);
            if (game.state === 'item_overlay')    this._drawItemOverlay(game);
            if (game.state === 'radial_menu')     this._drawRadialMenu(game);
            if (game.state === 'target_list')     this._drawTargetList(game);
            if (game.state === 'item_throw_dir')  this._drawThrowPrompt(game);
            if (game.state === 'ending') this._drawEndingOverlay(game);
            if (game.state === 'log_modal') this._drawLogModal(game);
            if (game.state === 'trade') this._drawOfferScreen(game);
            if (game.state === 'dialogue') this._drawDialogueModal(game);
            if (game.state === 'inspect') this._drawInspectPanel(game);
            if (game.state === 'device') this._drawDevice(game);
        } finally {
            if (inBox) ctx.translate(-box.x, -box.y);
```

(Found in execution: a `ctx.save()`/`ctx.restore()` pair here stops a menu's paint state — its last `textAlign` — carrying into the next frame, which the frame check catches as a difference in the Remoticon scene. It is invisible in a left-to-right canvas, but stage 1 changes nothing, so the box is a plain translate.)

And in that same `finally`, replace:

```js
            this._menuPanelRect = CLOSE_PANEL;
            this._closeBtnRect = CLOSE_PANEL ? closeButtonRect(CLOSE_PANEL) : null;
```

with:

```js
            // Stashed in SCREEN px: the panel was drawn inside the menu box, and
            // main hit-tests the ✕ and tap-outside against the screen.
            this._menuPanelRect = CLOSE_PANEL && { x: CLOSE_PANEL.x + box.x, y: CLOSE_PANEL.y + box.y, w: CLOSE_PANEL.w, h: CLOSE_PANEL.h };
            this._closeBtnRect = this._menuPanelRect ? closeButtonRect(this._menuPanelRect) : null;
```

- [ ] **Step 5: Menu scrims fill the whole screen**

Each menu draw starts with a scrim `ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX)`, which inside the menu box would only cover the box. Make each call `this._fillScreen(ctx)` instead, keeping the `fillStyle` line before it. The nine sites (line numbers from dev `689f26b`):

| Function | Line | Current |
|---|---|---|
| `_drawDevice` | ~1893 | `ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);` |
| `_drawItemOverlay` | ~2186 | inside its one-line `ctx.save(); ctx.fillStyle = …; … ctx.restore();` |
| `_drawTargetList` | ~2226 | inside its one-line `ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.5)'; … ctx.restore();` |
| `_drawInspectPanel` | ~2361 | `ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);` |
| `_drawEndingOverlay` | ~3039 | `ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);` |
| `_drawLogModal` | ~3085 | `ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);` |
| `_drawOfferScreen` | ~3224 | `ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);` |
| `_drawDialogueModal` | ~3674 | `ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);` |
| `_drawEquipmentModal` (unhosted branch) | ~3804 | `ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);` |

In each, replace only `ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);` with `this._fillScreen(ctx);`. For example, `_drawTargetList`'s line becomes:

```js
        ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.5)'; this._fillScreen(ctx); ctx.restore();
```

Leave every other `CANVAS_PX` inside those menus alone (`CANVAS_PX / 2`, `(CANVAS_PX - w) / 2`): inside the box they mean "the middle of the menu box", which is what they should mean.

- [ ] **Step 6: Darkness, lighting, arena, vignette**

In `_drawDarkness`, replace:

```js
        const { ctx } = this;
        const cx = CANVAS_PX / 2, cy = CANVAS_PX / 2;
```

with:

```js
        const { ctx } = this;
        const vp = this._view();
        const cx = vp.origin.x + TILE_PX / 2, cy = vp.origin.y + TILE_PX / 2;   // the player's centre
```

and in the same function replace `ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);` with `ctx.fillRect(0, 0, vp.w, vp.h);`.

In `_drawLighting`, replace:

```js
        const lm = (this._lightCanvas ??= document.createElement('canvas'));
        if (lm.width !== CANVAS_PX) { lm.width = CANVAS_PX; lm.height = CANVAS_PX; }
```

with:

```js
        const vp = this._view();
        const lw = Math.ceil(vp.w), lh = Math.ceil(vp.h);   // the lightmap is screen-sized, in logical px
        const lm = (this._lightCanvas ??= document.createElement('canvas'));
        if (lm.width !== lw || lm.height !== lh) { lm.width = lw; lm.height = lh; }
```

and in the same function replace `lctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);` with `lctx.fillRect(0, 0, lw, lh);`.

Replace `_collectLights` from its first line through the `lights.push({` line:

```js
    _collectLights(game) {
        const { half } = this;
        const lights = [{
            x: half * TILE_PX + TILE_PX / 2,
            y: half * TILE_PX + TILE_PX / 2,
            radius: TILE_PX * 3.2, r: 255, g: 236, b: 200,
        }];
        for (const L of (game.map?.lights || [])) {
            const vx = L.x - game.playerX + half;
            const vy = L.y - game.playerY + half;
            if (vx < -4 || vx > VIEW_TILES + 3 || vy < -4 || vy > VIEW_TILES + 3) continue;
            lights.push({
                x: vx * TILE_PX - this._scrollX + TILE_PX / 2,
                y: vy * TILE_PX - this._scrollY + TILE_PX / 2,
```

with:

```js
    _collectLights(game) {
        const vp = this._view();
        const lights = [{
            x: vp.origin.x + TILE_PX / 2,
            y: vp.origin.y + TILE_PX / 2,
            radius: TILE_PX * 3.2, r: 255, g: 236, b: 200,
        }];
        for (const L of (game.map?.lights || [])) {
            const dx = L.x - game.playerX, dy = L.y - game.playerY;
            if (offView(vp, dx, dy, 4)) continue;
            lights.push({
                x: vp.origin.x + dx * TILE_PX - this._scrollX + TILE_PX / 2,
                y: vp.origin.y + dy * TILE_PX - this._scrollY + TILE_PX / 2,
```

In `_drawArena`, replace:

```js
        const am = (this._arenaCanvas ??= document.createElement('canvas'));
        if (am.width !== CANVAS_PX) { am.width = CANVAS_PX; am.height = CANVAS_PX; }
```

with:

```js
        const vp = this._view();
        const aw = Math.ceil(vp.w), ah = Math.ceil(vp.h);
        const am = (this._arenaCanvas ??= document.createElement('canvas'));
        if (am.width !== aw || am.height !== ah) { am.width = aw; am.height = ah; }
```

replace both `actx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);` lines in `_drawArena` with `actx.fillRect(0, 0, aw, ah);`, and replace:

```js
        const cx = this.half * TILE_PX + TILE_PX / 2;
        const cy = this.half * TILE_PX + TILE_PX / 2;
```

with:

```js
        const cx = vp.origin.x + TILE_PX / 2;
        const cy = vp.origin.y + TILE_PX / 2;
```

Replace the body of `_drawVignette`:

```js
    _drawVignette() {
        const { ctx } = this;
        const s = CANVAS_PX;
        // Cache the gradient — CANVAS_PX is fixed, so it never changes, and
        // rebuilding it every frame (60/s in combat) churned the GC.
        if (!this._vignetteGradient) {
            const g = ctx.createRadialGradient(s/2, s/2, s * 0.35, s/2, s/2, s * 0.55);
```

with:

```js
    _drawVignette() {
        const { ctx } = this;
        const vp = this._view();
        const s = Math.max(vp.w, vp.h);
        // Cache the gradient; setViewport drops it when the screen changes size.
        // Rebuilding it every frame (60/s in combat) churned the GC.
        if (!this._vignetteGradient) {
            const g = ctx.createRadialGradient(vp.w / 2, vp.h / 2, s * 0.35, vp.w / 2, vp.h / 2, s * 0.55);
```

and at the end of `_drawVignette` replace `ctx.fillRect(0, 0, s, s);` with `ctx.fillRect(0, 0, vp.w, vp.h);`.

In `flash()` (just below `_drawVignette`), replace `this.ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);` with `this._fillScreen(this.ctx);`.

- [ ] **Step 7: Tests, then the frame check**

Run: `npm test 2>&1 | tail -8`
Expected: `ℹ fail 0`.

Restart the dev server, open a fresh test tab at `http://localhost:3001/`, and run the frame check from Task 1, Step 4.
Expected: `{"town":"match","sewer":"match","device":"match"}`. If a scene reports a chunk, read its `lines`: each is `canvas.method(args) @ transform|paint`, and the method, coordinates and sprite names tell you which pass drew it. Fix the pass until all three match.

- [ ] **Step 8: Commit**

```bash
git add game/renderer.js && git commit -m "refactor(render): frame, lighting and menus draw through the viewport; classic draws the same frame"
```

### Task 5: The world passes draw through the viewport

Every world-space pass used `half` (the view's centre tile) and `VIEW_TILES` (its width). They switch to the viewport: a tile `(dx, dy)` from yours draws at `vp.origin + (dx, dy) * TILE_PX`, and culls with `offView(vp, dx, dy, m)`. With the classic viewport `origin` is (288, 288) and the span is ±9, which is exactly `half` and `VIEW_TILES`.

**Files:**
- Modify: `game/renderer.js`

- [ ] **Step 1: Tiles**

In `_drawTiles`, replace:

```js
        const { ctx, half, sprites } = this;
        const pad = 2;
```

with:

```js
        const { ctx, sprites } = this;
        const vp = this._view();
        const pad = 2;
```

and replace:

```js
        for (let vy = -pad; vy < VIEW_TILES + pad; vy++) {
            for (let vx = -pad; vx < VIEW_TILES + pad; vx++) {
                const wx = game.playerX - half + vx;
                const wy = game.playerY - half + vy;
                const px = vx * TILE_PX - this._scrollX;
                const py = vy * TILE_PX - this._scrollY;
```

with:

```js
        for (let j = vp.span.jMin - pad; j <= vp.span.jMax + pad; j++) {
            for (let i = vp.span.iMin - pad; i <= vp.span.iMax + pad; i++) {
                const wx = game.playerX + i;
                const wy = game.playerY + j;
                const px = vp.origin.x + i * TILE_PX - this._scrollX;
                const py = vp.origin.y + j * TILE_PX - this._scrollY;
```

- [ ] **Step 2: Zone exits**

In `_drawTransitions`, replace `const { ctx, half } = this;` with:

```js
        const { ctx } = this;
        const vp = this._view();
```

replace:

```js
            const vx = t.x - game.playerX + half;
            const vy = t.y - game.playerY + half;
            // Cheap off-canvas cull (mirror the container/item pass margins).
            if (vx < -2 || vx > VIEW_TILES + 1 || vy < -2 || vy > VIEW_TILES + 1) continue;
            const px = vx * TILE_PX - this._scrollX;
            const py = vy * TILE_PX - this._scrollY;
```

with:

```js
            const dx = t.x - game.playerX, dy = t.y - game.playerY;
            // Cheap off-canvas cull (mirror the container/item pass margins).
            if (offView(vp, dx, dy, 2)) continue;
            const px = vp.origin.x + dx * TILE_PX - this._scrollX;
            const py = vp.origin.y + dy * TILE_PX - this._scrollY;
```

and replace the hint strip:

```js
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(0, CANVAS_PX - 24, CANVAS_PX, 24);
            // Plain ASCII only — the bitmap font (32-126) renders anything else
            // as '?', so use a hyphen separator, not an em dash.
            const hint = `EXIT - ${String(hintLabel).toUpperCase()}`;
            this.font.drawText(ctx, hint, CANVAS_PX / 2, CANVAS_PX - 16,
                { color: UI.gold, scale: 1, align: 'center', shadow: '#000' });
```

with:

```js
            const strip = this._hud().strip;   // the hint strips rest on the HUD's strip line
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(0, strip - 24, vp.w, 24);
            // Plain ASCII only — the bitmap font (32-126) renders anything else
            // as '?', so use a hyphen separator, not an em dash.
            const hint = `EXIT - ${String(hintLabel).toUpperCase()}`;
            this.font.drawText(ctx, hint, vp.w / 2, strip - 16,
                { color: UI.gold, scale: 1, align: 'center', shadow: '#000' });
```

- [ ] **Step 3: Containers and ground items**

In `_drawContainers`, replace:

```js
        const { ctx, half, sprites } = this;
        for (const c of game.containers) {
            const vx = c.x - game.playerX + half;
            const vy = c.y - game.playerY + half;
            if (vx < -2 || vx > VIEW_TILES + 1 || vy < -2 || vy > VIEW_TILES + 1) continue;
            const px = vx * TILE_PX - this._scrollX;
            const py = vy * TILE_PX - this._scrollY;
```

with:

```js
        const { ctx, sprites } = this;
        const vp = this._view();
        for (const c of game.containers) {
            const dx = c.x - game.playerX, dy = c.y - game.playerY;
            if (offView(vp, dx, dy, 2)) continue;
            const px = vp.origin.x + dx * TILE_PX - this._scrollX;
            const py = vp.origin.y + dy * TILE_PX - this._scrollY;
```

In `_drawGroundItems`, replace:

```js
        const { ctx, half, sprites } = this;
        for (const item of game.groundItems) {
            const vx = item.x - game.playerX + half;
            const vy = item.y - game.playerY + half;
            if (vx < -2 || vx > VIEW_TILES + 1 || vy < -2 || vy > VIEW_TILES + 1) continue;
            const px = vx * TILE_PX - this._scrollX;
            const py = vy * TILE_PX - this._scrollY;
```

with:

```js
        const { ctx, sprites } = this;
        const vp = this._view();
        for (const item of game.groundItems) {
            const dx = item.x - game.playerX, dy = item.y - game.playerY;
            if (offView(vp, dx, dy, 2)) continue;
            const px = vp.origin.x + dx * TILE_PX - this._scrollX;
            const py = vp.origin.y + dy * TILE_PX - this._scrollY;
```

- [ ] **Step 4: Actors and props**

In `_drawActors`, replace `const { half } = this;` with `const vp = this._view();`.

Replace the enemy position block:

```js
            const vx = ex - game.playerX + half;
            const vy = ey - game.playerY + half;
            if (vx < -2 || vx > VIEW_TILES + 1 || vy < -2 || vy > VIEW_TILES + 1) continue;
```

with:

```js
            const dx = ex - game.playerX, dy = ey - game.playerY;
            if (offView(vp, dx, dy, 2)) continue;
```

and a few lines below it replace:

```js
            const px = vx * TILE_PX - this._scrollX + offsetX;
            const py = vy * TILE_PX - this._scrollY + offsetY;
```

with:

```js
            const px = vp.origin.x + dx * TILE_PX - this._scrollX + offsetX;
            const py = vp.origin.y + dy * TILE_PX - this._scrollY + offsetY;
```

Replace the prop block:

```js
            const vx = p.x - game.playerX + half;
            const vy = p.y - game.playerY + half;
            if (vx < -3 || vx > VIEW_TILES + 2 || vy < -3 || vy > VIEW_TILES + 2) continue;
            const px = vx * TILE_PX - this._scrollX;
            const py = vy * TILE_PX - this._scrollY;
```

with:

```js
            const dx = p.x - game.playerX, dy = p.y - game.playerY;
            if (offView(vp, dx, dy, 3)) continue;
            const px = vp.origin.x + dx * TILE_PX - this._scrollX;
            const py = vp.origin.y + dy * TILE_PX - this._scrollY;
```

- [ ] **Step 5: The jammed door, damage numbers and hit-splats**

In `_drawJammedDoor`, replace:

```js
        const { ctx, half } = this;
        const vx = j.x - game.playerX + half;
        const vy = j.y - game.playerY + half;
        if (vx < -1 || vx > VIEW_TILES || vy < -1 || vy > VIEW_TILES) return;
        const px = vx * TILE_PX - this._scrollX;
        const py = vy * TILE_PX - this._scrollY;
```

with:

```js
        const { ctx } = this;
        const vp = this._view();
        const dx = j.x - game.playerX, dy = j.y - game.playerY;
        if (offView(vp, dx, dy, 1)) return;
        const px = vp.origin.x + dx * TILE_PX - this._scrollX;
        const py = vp.origin.y + dy * TILE_PX - this._scrollY;
```

In `_drawDamageNumbers`, replace `const { ctx, half } = this;` with:

```js
        const { ctx } = this;
        const vp = this._view();
```

replace:

```js
            const vx = dn.tileX - game.playerX + half;
            const vy = dn.tileY - game.playerY + half;
```

with:

```js
            const dx = dn.tileX - game.playerX, dy = dn.tileY - game.playerY;
```

and replace:

```js
            const px = vx * TILE_PX + TILE_PX / 2 - this._scrollX + dn.vx * t;
            const py = vy * TILE_PX + TILE_PX / 4 - this._scrollY + dn.vy * t - slotOffset;
```

with:

```js
            const px = vp.origin.x + dx * TILE_PX + TILE_PX / 2 - this._scrollX + dn.vx * t;
            const py = vp.origin.y + dy * TILE_PX + TILE_PX / 4 - this._scrollY + dn.vy * t - slotOffset;
```

In `_drawHitSplat`, replace:

```js
        const { ctx, half, sprites } = this;
```

with:

```js
        const { ctx, sprites } = this;
        const vp = this._view();
```

and replace:

```js
        const bx = (dn.tileX - game.playerX + half) * TILE_PX + TILE_PX / 2 - this._scrollX;
        const by = (dn.tileY - game.playerY + half) * TILE_PX + TILE_PX / 4 - this._scrollY;
```

with:

```js
        const bx = vp.origin.x + (dn.tileX - game.playerX) * TILE_PX + TILE_PX / 2 - this._scrollX;
        const by = vp.origin.y + (dn.tileY - game.playerY) * TILE_PX + TILE_PX / 4 - this._scrollY;
```

- [ ] **Step 6: The player and the aim reticle**

In `_playerScreenPos`, replace:

```js
        const { half } = this;
```

with:

```js
        const { origin } = this._view();
```

replace `const groundPy = half * TILE_PX + offsetY;` with `const groundPy = origin.y + offsetY;`, and replace `return { ppx: half * TILE_PX + offsetX, ppy: groundPy - lift, groundPy };` with `return { ppx: origin.x + offsetX, ppy: groundPy - lift, groundPy };`. Update the function's comment line "fixed at the view center" to "fixed at the viewport's origin (the centre of the world area)".

In `_drawReticle`, replace:

```js
        const { ctx, half } = this;
        const toScreen = (tx, ty) => ({
            x: (tx - game.playerX + half) * TILE_PX - this._scrollX,
            y: (ty - game.playerY + half) * TILE_PX - this._scrollY,
        });
```

with:

```js
        const { ctx } = this;
        const vp = this._view();
        const toScreen = (tx, ty) => ({
            x: vp.origin.x + (tx - game.playerX) * TILE_PX - this._scrollX,
            y: vp.origin.y + (ty - game.playerY) * TILE_PX - this._scrollY,
        });
```

- [ ] **Step 7: The threat overlay**

In `_drawThreatOverlay`, replace `const { ctx, half, sprites } = this;` with:

```js
        const { ctx, sprites } = this;
        const vp = this._view();
```

Replace the cache test and field build:

```js
            if (this._threatTurn !== game.turn || this._threatFieldPhase !== phase || this._threatCount !== field.length) {
                this._threatTurn = game.turn;
                this._threatFieldPhase = phase;
                this._threatCount = field.length;
                this._threatField = new Map();
                for (let vy = 0; vy < VIEW_TILES; vy++) {
                    for (let vx = 0; vx < VIEW_TILES; vx++) {
                        const tx = game.playerX - half + vx;
                        const ty = game.playerY - half + vy;
```

with:

```js
            // The viewport is part of the key: a resize changes which tiles are in view.
            if (this._threatTurn !== game.turn || this._threatFieldPhase !== phase || this._threatCount !== field.length || this._threatVp !== vp) {
                this._threatTurn = game.turn;
                this._threatFieldPhase = phase;
                this._threatCount = field.length;
                this._threatVp = vp;
                this._threatField = new Map();
                for (let j = vp.span.jMin; j <= vp.span.jMax; j++) {
                    for (let i = vp.span.iMin; i <= vp.span.iMax; i++) {
                        const tx = game.playerX + i;
                        const ty = game.playerY + j;
```

Replace the paint loop's head:

```js
            for (let vy = 0; vy < VIEW_TILES; vy++) {
                for (let vx = 0; vx < VIEW_TILES; vx++) {
                    const tx = game.playerX - half + vx;
                    const ty = game.playerY - half + vy;
```

with:

```js
            for (let j = vp.span.jMin; j <= vp.span.jMax; j++) {
                for (let i = vp.span.iMin; i <= vp.span.iMax; i++) {
                    const tx = game.playerX + i;
                    const ty = game.playerY + j;
```

and its fill `ctx.fillRect(vx * TILE_PX, vy * TILE_PX, TILE_PX, TILE_PX);` with:

```js
                    ctx.fillRect(vp.origin.x + i * TILE_PX, vp.origin.y + j * TILE_PX, TILE_PX, TILE_PX);
```

In the long comment above that loop, replace the words "keeping the fillRect arguments grid-aligned (a multiple of the tile size, itself a multiple of the pattern's 8px period)" with "keeping the fillRect arguments grid-aligned (the viewport's fixed origin plus a multiple of the tile size, which is itself a multiple of the pattern's 8px period)".

Replace the combat vignette's geometry:

```js
            const vcx = half * TILE_PX + TILE_PX / 2;
            const vcy = half * TILE_PX + TILE_PX / 2;
            const vr = Math.hypot(CANVAS_PX / 2, CANVAS_PX / 2);   // reaches the corners
```

with:

```js
            const vcx = vp.origin.x + TILE_PX / 2;
            const vcy = vp.origin.y + TILE_PX / 2;
            const vr = Math.hypot(vp.w / 2, vp.h / 2);   // reaches the corners
```

and the fill below it, `ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);`, with `ctx.fillRect(0, 0, vp.w, vp.h);`.

Replace the watcher position and cull:

```js
            const sx = (w.x - game.playerX + half) * TILE_PX - this._scrollX;
            const sy = (w.y - game.playerY + half) * TILE_PX - this._scrollY;
            if (sx < -TILE_PX || sx > CANVAS_PX || sy < -TILE_PX || sy > CANVAS_PX) continue;
```

with:

```js
            const sx = vp.origin.x + (w.x - game.playerX) * TILE_PX - this._scrollX;
            const sy = vp.origin.y + (w.y - game.playerY) * TILE_PX - this._scrollY;
            if (sx < -TILE_PX || sx > vp.w || sy < -TILE_PX || sy > vp.h) continue;
```

and the thread's end:

```js
                const px = half * TILE_PX + TILE_PX / 2 - this._scrollX;
                const py = half * TILE_PX + TILE_PX / 2 - this._scrollY;
```

with:

```js
                const px = vp.origin.x + TILE_PX / 2 - this._scrollX;
                const py = vp.origin.y + TILE_PX / 2 - this._scrollY;
```

- [ ] **Step 8: The throw prompt**

Replace the top of `_drawThrowPrompt`:

```js
    _drawThrowPrompt(game) {
        const { ctx, half } = this;
        const cx = half * TILE_PX + TILE_PX / 2;
        const cy = half * TILE_PX + TILE_PX / 2;

        // ASCII arrows (the bitmap font is plain ASCII). ^ v < > read as
        // direction immediately and stay crisp at scale 2.
        const dirs = [
            { x: THROW_RECTS.up.x,    y: THROW_RECTS.up.y,    l: '^' },
            { x: THROW_RECTS.down.x,  y: THROW_RECTS.down.y,  l: 'V' },
            { x: THROW_RECTS.left.x,  y: THROW_RECTS.left.y,  l: '<' },
            { x: THROW_RECTS.right.x, y: THROW_RECTS.right.y, l: '>' },
        ];
```

with:

```js
    _drawThrowPrompt(game) {
        const { ctx } = this;
        const R = throwRects(this._view());   // around the player's tile (layout.js)

        // ASCII arrows (the bitmap font is plain ASCII). ^ v < > read as
        // direction immediately and stay crisp at scale 2.
        const dirs = [
            { x: R.up.x,    y: R.up.y,    l: '^' },
            { x: R.down.x,  y: R.down.y,  l: 'V' },
            { x: R.left.x,  y: R.left.y,  l: '<' },
            { x: R.right.x, y: R.right.y, l: '>' },
        ];
```

- [ ] **Step 9: Retire `half` and `VIEW_TILES` from the renderer**

Delete the constructor line `this.half    = (VIEW_TILES - 1) / 2;   // retired in Task 5`. Change the data import to `import { TILE_PX, CANVAS_PX, SAFE_SLOTS } from './data.js';`, and delete `THROW_RECTS,` from the layout import.

Check nothing still uses them:

```bash
grep -nE "VIEW_TILES|\bhalf\b|THROW_RECTS" game/renderer.js
```

Expected: only the `_wheelTile(r0, r1, mid, half, …)` parameter and its uses inside `_wheelTile`, where `half` is an angle, plus comments.

In `tests/grapple.test.js`, the swing-arc renderer is built with `{ half: 9 }`; change that line to `const r = Object.create(Renderer.prototype);` (it now uses the classic viewport by default).

- [ ] **Step 10: Tests, then the frame check**

Run: `npm test 2>&1 | tail -8`
Expected: `ℹ fail 0` — `tests/tile-render.test.js` and `tests/grapple.test.js` pass unchanged in behaviour, because a renderer with no viewport draws the classic square.

Restart the dev server; in a fresh test tab, run the frame check.
Expected: `{"town":"match","sewer":"match","device":"match"}`.

- [ ] **Step 11: Commit**

```bash
git add game/renderer.js tests/grapple.test.js && git commit -m "refactor(render): the world draws around the viewport's origin, not a fixed centre tile"
```

### Task 6: The HUD pieces and the wheel draw where hudLayout puts them

**Files:**
- Modify: `game/renderer.js`

- [ ] **Step 1: HP panel, buffs, quest log, item bar**

In `_drawHPPanel`, replace `const x = 6, y = 6, w = 170, h = 90;` with:

```js
        const { x, y } = this._hud().hp;
        const w = 170, h = 90;
```

In `_drawBuffBar`, replace `const px = CANVAS_PX - totalW - 6, py = 6;` with:

```js
        const hud = this._hud();
        const px = hud.buffsRight - totalW, py = hud.buffsTop;
```

In `_drawQuestLog`, replace `const R = QUESTLOG_RECT;` with `const R = this._hud().log;`, and replace `const visible = messages.slice(-2);` with:

```js
        const visible = messages.slice(-(R.lines || 2));   // the dock's log shows three (stage 3)
```

In `_drawXmbBar`, replace `const lay = xmbBarLayout(bar);` with `const lay = xmbBarLayout(bar, this._hud().bar);`.

- [ ] **Step 2: The wheel**

In `_wheelTile`, replace:

```js
        const { ctx } = this, cx = RADIAL_CENTER_X, cy = RADIAL_CENTER_Y;
```

with:

```js
        const { ctx } = this, { cx, cy } = this._hud().wheel;
```

In `_drawWheel`, replace:

```js
        const cx = RADIAL_CENTER_X, cy = RADIAL_CENTER_Y, TOP = -Math.PI / 2;
        // (Slice 2) Full-screen AIM/CONFIRM/threat text re-centres on the SCREEN
        // (CC), not the wheel hub — the wheel moved to a bottom-right anchor, but
        // these strips are full-width takeovers that must stay screen-centred.
        const CC = CANVAS_PX / 2;
```

with:

```js
        const { cx, cy } = this._hud().wheel, TOP = -Math.PI / 2;
        // (Slice 2) Full-screen AIM/CONFIRM/threat text re-centres on the SCREEN
        // (CC across, CY down), not the wheel hub — the wheel sits at its own
        // anchor, but these strips are full-width takeovers that stay screen-centred.
        const vp = this._view();
        const CC = vp.w / 2, CY = vp.h / 2;
        const strip = this._hud().strip;
```

Then, still in `_drawWheel`:

- AIM hint — replace `ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, CANVAS_PX - 24, CANVAS_PX, 24); ctx.restore();` with `ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, strip - 24, vp.w, 24); ctx.restore();`, and in the next line replace `CC, CANVAS_PX - 16` with `CC, strip - 16`.
- CONFIRM — replace `ctx.save(); ctx.fillStyle = 'rgba(48,0,0,0.55)'; ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX); ctx.restore();` with `ctx.save(); ctx.fillStyle = 'rgba(48,0,0,0.55)'; ctx.fillRect(0, 0, vp.w, vp.h); ctx.restore();`, and in the four `drawText` lines below it replace `CC - 42`, `CC - 8`, `CC + 12` and `CC + 38` (the **second** argument, the y) with `CY - 42`, `CY - 8`, `CY + 12` and `CY + 38`. The first argument stays `CC`.
- Scrim — replace `ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);` (after `ctx.fillStyle = combat ? 'rgba(38,4,4,0.4)' : 'rgba(0,0,0,0.32)';`) with `ctx.fillRect(0, 0, vp.w, vp.h);`.
- Combat wash — replace:

  ```js
            const rg = ctx.createRadialGradient(cx, cy, CANVAS_PX * 0.34, cx, cy, CANVAS_PX * 0.72);
  ```

  with:

  ```js
            const S = Math.max(vp.w, vp.h);
            const rg = ctx.createRadialGradient(cx, cy, S * 0.34, cx, cy, S * 0.72);
  ```

  and the line `ctx.fillStyle = rg; ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);` with `ctx.fillStyle = rg; ctx.fillRect(0, 0, vp.w, vp.h);`.
- Combat banner — replace `ctx.save(); ctx.fillStyle = 'rgba(40,0,0,0.6)'; ctx.fillRect(0, CANVAS_PX - 26, CANVAS_PX, 26); ctx.restore();` with `ctx.save(); ctx.fillStyle = 'rgba(40,0,0,0.6)'; ctx.fillRect(0, strip - 26, vp.w, 26); ctx.restore();`, and in the next line replace `CC, CANVAS_PX - 16` with `CC, strip - 16`.

- [ ] **Step 3: Retire the fixed HUD constants from the renderer**

Delete `QUESTLOG_RECT,` from the `QUESTLOG_RECT, LOG_MODAL_RECT, TARGET_LIST_RECT, TARGET_LIST_ROW_H,` import line, and `RADIAL_CENTER_X, RADIAL_CENTER_Y,` from the `RADIAL_CENTER_X, RADIAL_CENTER_Y, WHEEL_HUB_R, WHEEL_TILE_GAP, wheelRingR,` import line.

Check what is left:

```bash
grep -nE "RADIAL_CENTER|QUESTLOG_RECT|CANVAS_PX" game/renderer.js
```

Expected: `QUESTLOG_RECT` only in comments; no `RADIAL_CENTER`; `CANVAS_PX` only inside menu draws (`_drawDevice`, `_drawInspectPanel`, `_drawEndingOverlay`, `_drawLogModal`, `_drawEquipmentModal`) as `CANVAS_PX / 2` or `(CANVAS_PX - w) / 2` — nothing that sizes the screen.

- [ ] **Step 4: Tests, then the frame check**

Run: `npm test 2>&1 | tail -8`
Expected: `ℹ fail 0`.

Restart the dev server; in a fresh test tab, run the frame check.
Expected: `{"town":"match","sewer":"match","device":"match"}`.

- [ ] **Step 5: Commit**

```bash
git add game/renderer.js && git commit -m "refactor(render): the HUD and the wheel draw where hudLayout puts them"
```

### Task 7: main.js sizes the canvas and reads taps through the viewport

`_fitCanvas` builds the viewport (still classic) and hands it to the renderer. Taps become screen points through the viewport; menus get their points converted into menu-box space *at the dispatcher*, so no menu handler changes; the HUD taps read `hudLayout`.

**Files:**
- Modify: `game/main.js`

- [ ] **Step 1: Imports**

Replace `import { pickCanvasCss } from './canvas-fit.js';` with:

```js
import { computeViewport, screenToTile, clientToScreen, toMenu } from './viewport.js';   // (screen-fill) the screen's geometry
```

In the `from './layout.js'` import block, replace the line `CANVAS_INTERNAL_PX, HIT_SLOP, THROW_RECTS,` with `HIT_SLOP, throwRects,`, and the line `RADIAL_CENTER_X, RADIAL_CENTER_Y, WHEEL_HUB_R, wheelRingR, QUESTLOG_RECT, LOG_MODAL_RECT, targetListRowRect, itemOverlayRowRect,` with `WHEEL_HUB_R, wheelRingR, LOG_MODAL_RECT, targetListRowRect, itemOverlayRowRect,`.

- [ ] **Step 2: `_fitCanvas`**

Replace the method and its comment:

```js
    // Size the canvas so one art pixel is a whole number of device pixels.
    // Called on boot, on resize, and when the window moves between displays of
    // different DPR (a browser zoom does the same thing).
    _fitCanvas() {
        const canvas = this.renderer?.canvas;
        if (!canvas) return;
        const avail = Math.min(window.innerHeight - 16, window.innerWidth - 16, 1024);
        const css = pickCanvasCss(avail, window.devicePixelRatio);
        canvas.style.width  = `${css}px`;
        canvas.style.height = `${css}px`;
    }
```

with:

```js
    // Size the canvas for the window through the viewport (game/viewport.js),
    // and hand the viewport to the renderer, which draws with it. Called on
    // boot, on resize, and when the window moves between displays of different
    // DPR (a browser zoom does the same thing).
    _fitCanvas() {
        const canvas = this.renderer?.canvas;
        if (!canvas) return;
        const vp = computeViewport({ mode: 'classic', cssW: window.innerWidth, cssH: window.innerHeight, dpr: window.devicePixelRatio });
        this.renderer.setViewport(vp);
        canvas.style.width  = `${vp.cssW}px`;
        canvas.style.height = `${vp.cssH}px`;
    }
```

- [ ] **Step 3: Screen points and tiles**

Replace `_canvasLocalCoords` and its comment:

```js
    // Convert a pointer event's clientX/clientY into the canvas's internal
    // 608×608 coordinate space. The canvas is CSS-scaled to fit the viewport
    // (aspect-ratio:1, height:100% on desktop, viewport-bounded on mobile),
    // so we scale by the bounding rect ratio. Returns null if the canvas
    // hasn't laid out yet (extremely rare; defensive).
    _canvasLocalCoords(e, canvas) {
        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return null;
        return {
            x: (e.clientX - rect.left) * (CANVAS_INTERNAL_PX / rect.width),
            y: (e.clientY - rect.top)  * (CANVAS_INTERNAL_PX / rect.height),
        };
    }
```

with:

```js
    // A pointer event → the screen's logical coordinates: the canvas's drawn
    // rect maps onto the viewport's w x h. Null if the canvas hasn't laid out
    // yet (extremely rare; defensive).
    _canvasLocalCoords(e, canvas) {
        return clientToScreen(this._vp(), e.clientX, e.clientY, canvas.getBoundingClientRect());
    }

    // (screen-fill) The viewport in force and the HUD laid out for it: the
    // renderer's own objects, so a hit-test reads exactly what was drawn.
    _vp()  { return this.renderer._view(); }
    _hud() { return this.renderer._hud(); }
```

Replace `_screenToTile` and its comment:

```js
    // 608-space canvas point → world tile (camera inverse; tiles are
    // 608/(2·half+1) px, player centred at 304, scroll ~0 while idle).
    _screenToTile(pt) {
        const half = (this.renderer && this.renderer.half) || 9;
        const TILE = 608 / (2 * half + 1);
        const sx = (this.renderer && this.renderer._scrollX) || 0;
        const sy = (this.renderer && this.renderer._scrollY) || 0;
        return {
            x: Math.floor((pt.x + sx) / TILE - half + this.playerX),
            y: Math.floor((pt.y + sy) / TILE - half + this.playerY),
        };
    }
```

with:

```js
    // Screen point → world tile: the viewport's inverse of where tiles are
    // drawn, folding in the camera's mid-step scroll.
    _screenToTile(pt) {
        const sx = (this.renderer && this.renderer._scrollX) || 0;
        const sy = (this.renderer && this.renderer._scrollY) || 0;
        return screenToTile(this._vp(), pt, this.playerX, this.playerY, sx, sy);
    }
```

- [ ] **Step 4: The tap dispatcher**

In `_onCanvasPointerDown`, directly after:

```js
        const pt = this._canvasLocalCoords(e, canvas);
        if (!pt) return;
        e.preventDefault();
```

add:

```js
        // (screen-fill) Menus are laid out in the 608x608 menu space and drawn in
        // the viewport's centred menu box: their handlers get points in that space.
        const mpt = toMenu(this._vp(), pt);
```

Then, in the same method:

- Replace `const _dx = pt.x - RADIAL_CENTER_X, _dy = pt.y - RADIAL_CENTER_Y;` with:

  ```js
            const _wc = this._hud().wheel;
            const _dx = pt.x - _wc.cx, _dy = pt.y - _wc.cy;
  ```

- Replace `if (this.state === STATE.LOG_MODAL) { this._tapLogModal(pt); return; }` with `if (this.state === STATE.LOG_MODAL) { this._tapLogModal(mpt); return; }`.
- Replace `if (this.state === STATE.TRADE) { this._tapOffer(pt); return; }` with `if (this.state === STATE.TRADE) { this._tapOffer(mpt); return; }`.
- In the dialogue branch, replace `if (this.renderer._dialogueScrollable && optsR && this._pointInRect(pt, optsR)) {` with `if (this.renderer._dialogueScrollable && optsR && this._pointInRect(mpt, optsR)) {`, replace `this._dlgDrag = { startY: pt.y, lastY: pt.y, downPt: pt, moved: false };` with `this._dlgDrag = { startY: pt.y, lastY: pt.y, downPt: mpt, moved: false };` (the drag measures screen-y deltas; the pick point is menu space), and replace `this._tapDialogue(pt); return;` with `this._tapDialogue(mpt); return;`.
- Replace `if (this.state === STATE.DEVICE) { this._tapDevice(pt); return; }` with `if (this.state === STATE.DEVICE) { this._tapDevice(mpt); return; }`.
- In the target-list branch replace `this._tapTargetList(pt);` with `this._tapTargetList(mpt);`, and in the item-overlay branch replace `this._tapItemOverlay(pt);` with `this._tapItemOverlay(mpt);`.
- Replace `if (this.state === STATE.IDLE && this._pointInRect(pt, QUESTLOG_RECT, HIT_SLOP)) {` with `if (this.state === STATE.IDLE && this._pointInRect(pt, this._hud().log, HIT_SLOP)) {`.
- Replace the last line, `if (this.state === STATE.ITEM_SELECTED) this._tapHotbar(pt);`, with `if (this.state === STATE.ITEM_SELECTED) this._tapHotbar(mpt);` (the legacy flat hotbar was laid out in the 608 space).

`_tapThrowPrompt(pt)`, `_tapRadialMenu(pt)` and `_tapXmbBar(pt)` keep the screen point.

- [ ] **Step 5: Throw targets, the wheel and the item bar**

In `_tapThrowPrompt`, replace:

```js
        for (const dir of ['up', 'right', 'down', 'left']) {
            if (this._pointInRect(pt, THROW_RECTS[dir], HIT_SLOP)) {
```

with:

```js
        const R = throwRects(this._vp());   // around the player's tile, as drawn
        for (const dir of ['up', 'right', 'down', 'left']) {
            if (this._pointInRect(pt, R[dir], HIT_SLOP)) {
```

In `_tapRadialMenu`, replace `const dx = pt.x - RADIAL_CENTER_X, dy = pt.y - RADIAL_CENTER_Y;` with:

```js
        const wc = this._hud().wheel;
        const dx = pt.x - wc.cx, dy = pt.y - wc.cy;
```

In `_tapXmbBar`, replace `const lay = xmbBarLayout(bar);` with `const lay = xmbBarLayout(bar, this._hud().bar);`.

Check nothing in `main.js` still reads the retired constants:

```bash
grep -nE "CANVAS_INTERNAL_PX|THROW_RECTS|RADIAL_CENTER|QUESTLOG_RECT|pickCanvasCss|renderer\.half" game/main.js
```

Expected: no output.

- [ ] **Step 6: Tests**

Run: `npm test 2>&1 | tail -8`
Expected: `ℹ fail 0`.

- [ ] **Step 7: Check the taps in the browser**

Restart the dev server. In a fresh test tab, run the frame check first (expected: all `match`). Then reload, and run:

```js
for (let i = 0; i < 40 && !(window.__game?.renderer?.sprites && window.__game.renderer.font); i++) await new Promise((r) => setTimeout(r, 250));
__game.autosave = () => {};
window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
document.getElementById('splash-go').click();
await new Promise((r) => setTimeout(r, 500));
const g = __game, c = document.getElementById('game-canvas');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// Tap the canvas at a SCREEN logical point, the way a finger would.
const tapAt = (sx, sy) => {
    const r = c.getBoundingClientRect(), vp = g.renderer._view();
    const o = { clientX: r.left + sx * r.width / vp.w, clientY: r.top + sy * r.height / vp.h, bubbles: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1 };
    c.dispatchEvent(new PointerEvent('pointerdown', o));
    c.dispatchEvent(new PointerEvent('pointerup', o));
};
const out = {};
// 1. The quest log opens the log history; a tap outside its panel closes it.
const L = g.renderer._hud().log;
tapAt(L.x + 20, L.y + 20); await wait(150); out.logOpens = g.state;
tapAt(2, 2); await wait(150); out.logCloses = g.state;
// 2. The Remoticon's ✕ closes it.
g._openDevice('items'); g._render(); await wait(150);
const b = g.renderer._closeBtnRect; tapAt(b.x + b.w / 2, b.y + b.h / 2); await wait(150); out.deviceX = g.state;
// 3. The wheel: a tap in the top quadrant drills; a far tap closes it.
g._openWheel(); await wait(150);
const W = g.renderer._hud().wheel; tapAt(W.cx, W.cy - 42); await wait(200); out.wheelDrills = g.wheel.path.length;
tapAt(2, 2); await wait(150); out.wheelCloses = g.state;
// 4. Tap-to-move lands on the tapped tile.
const vp = g.renderer._view();
const t = [3, -3, 2, -2].map((d) => ({ x: g.playerX + d, y: g.playerY })).find((p) => g.map.isWalkable(p.x, p.y) && !g._targetAt(p.x, p.y));
tapAt(vp.origin.x + (t.x - g.playerX) * 32 + 16, vp.origin.y + 16);
await wait(2500); out.walked = { to: t, at: { x: g.playerX, y: g.playerY } };
JSON.stringify(out)
```

Expected: `logOpens` is `"log_modal"`, `logCloses` is `"idle"`, `deviceX` is `"idle"`, `wheelDrills` is `2`, `wheelCloses` is `"idle"`, and `walked.at` equals `walked.to`.

- [ ] **Step 8: Commit**

```bash
git add game/main.js && git commit -m "refactor(input): taps become screen points through the viewport; menus get menu-box points"
```

### Task 8: Stage 1 checkpoint

- [ ] **Step 1: Everything green**

Run: `npm test 2>&1 | tail -8` — expected `ℹ fail 0`.
Restart the dev server; run the frame check in a fresh tab — expected all three `match`.

- [ ] **Step 2: Nothing moved, by eye**

In a fresh test tab (autosave stubbed, GAME START), screenshot Town; open the wheel and screenshot; open the Remoticon and screenshot. They must look exactly like the game on `dev`.

- [ ] **Step 3: Push and report**

```bash
git push -u origin feature/screen-fill
```

Tell Caelan stage 1 is in: the viewport draws every frame identically to today (three recorded scenes match their pre-refactor hashes), and nothing on screen has changed yet.

---

## Stage 2 — the screen fills, and the world gets fillers

### Task 9: hudLayout pins the HUD to the corners of a filled screen

**Files:**
- Modify: `game/layout.js` (the `hudLayout` added in Task 3)
- Test: `tests/hud-layout.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/hud-layout.test.js` (it already imports `rectsOverlap`, `expandRect`, `HIT_SLOP`, `xmbBarPanelRect` and `hudInteractiveRects`):

```js
describe('hudLayout (fill): pinned to the corners', () => {
    const screens = {
        '1080p': computeViewport({ cssW: 1920, cssH: 1080, dpr: 1 }),
        "Caelan's ultrawide": computeViewport({ cssW: 3440, cssH: 1440, dpr: 1 }),
        'phone upright': computeViewport({ cssW: 390, cssH: 844, dpr: 3 }),
    };
    const WHEEL_REACH = 126;   // the open wheel's widest reach from its hub
    const wheelBox = (hud) => ({ x: hud.wheel.cx - WHEEL_REACH, y: hud.wheel.cy - WHEEL_REACH, w: 2 * WHEEL_REACH, h: 2 * WHEEL_REACH });
    const onScreen = (r, vp) => r.x >= 0 && r.y >= 0 && r.x + r.w <= vp.w && r.y + r.h <= vp.h;

    for (const [name, vp] of Object.entries(screens)) {
        test(`${name}: no two idle panels overlap under HIT_SLOP`, () => {
            const rects = hudInteractiveRects('idle', vp);
            for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
                assert.ok(!rectsOverlap(expandRect(rects[i].rect, HIT_SLOP), expandRect(rects[j].rect, HIT_SLOP)),
                    `${rects[i].name} and ${rects[j].name} overlap`);
            }
        });

        test(`${name}: every piece is on screen`, () => {
            const hud = hudLayout(vp);
            assert.ok(onScreen({ ...hud.hp, w: 170, h: 90 }, vp), 'HP panel');
            assert.ok(onScreen(hud.log, vp), 'quest log');
            assert.ok(onScreen(xmbBarPanelRect(3, hud.bar), vp), 'item bar');
            assert.ok(onScreen(wheelBox(hud), vp), 'the open wheel');
        });

        test(`${name}: the item bar is centred, and the open wheel stays off it`, () => {
            const hud = hudLayout(vp);
            assert.equal(hud.bar.cx, vp.w / 2);
            assert.ok(!rectsOverlap(wheelBox(hud), xmbBarPanelRect(3, hud.bar)));
        });

        test(`${name}: the buff bar stops short of the page buttons`, () => {
            const hud = hudLayout(vp);
            assert.ok(hud.buffsRight <= vp.w - 6 - 60 * vp.logicalPerCss);
            assert.equal(hud.strip, vp.h);
        });
    }

    test('on a wide screen the log and the item bar share one line', () => {
        const hud = hudLayout(screens['1080p']);
        assert.equal(hud.log.y + hud.log.h, xmbBarPanelRect(3, hud.bar).y + xmbBarPanelRect(3, hud.bar).h);
    });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test tests/hud-layout.test.js`
Expected: FAIL — the fill screens get the classic positions (the item bar at x 304, not centred).

- [ ] **Step 3: Implement**

In `game/layout.js`, replace the `hudLayout` function added in Task 3 (from its `// ── The HUD, placed for a viewport` comment to its closing brace) with:

```js
// ── The HUD, placed for a viewport (plans/screen-fill.md) ──
// Where every HUD piece sits on a given screen: the renderer draws there and
// main.js hit-tests there, the same contract as the rects in this file.
const HUD_M = 6;               // margin from the screen's edge, logical px
const HUD_GAP = 12;            // between stacked panels: two HIT_SLOPs, so tap zones never touch
const PAGE_BUTTONS_CSS = 60;   // the ☰ ▤ page buttons' column, top-right: right 8 + width up to 44 + gap 8 (CSS px)
const WHEEL_REACH = 126;       // the open wheel's widest reach from its hub, with the open overshoot
const BAR_HALF = 160;          // the item bar's widest half-width: three chips (300) / 2 + 10
const BAR_ABOVE = 78;          // the bar's panel runs from 78 above its anchor's bottom …
const BAR_BELOW = 4;           // … to 4 below it (xmbBarPanelRect)

export function hudLayout(vp = CLASSIC) {
    if (vp.mode === 'classic') {
        return {
            hp: { x: 6, y: 6 },                                   // the HP panel's top-left (170 x 90)
            buffsRight: CANVAS_INTERNAL_PX - 6, buffsTop: 6,      // the buff bar hangs from its top-right corner
            log: { ...QUESTLOG_RECT, lines: 2 },                  // the quest log, and how many feed lines it shows
            bar: XMB_ANCHOR_CLASSIC,                              // the item bar's anchor (xmbBarLayout)
            wheel: { cx: RADIAL_CENTER_X, cy: RADIAL_CENTER_Y },  // the wheel's hub
            strip: CANVAS_INTERNAL_PX,                            // the bottom hint strips rest on this y
        };
    }
    return cornersLayout(vp);
}

// The HUD pinned to the screen's corners and edges: HP top-left, the buffs
// top-right beside the page buttons, the log bottom-left and the item bar
// bottom-centre on one line, the wheel opening bottom-right. A narrow screen
// stacks the log above the bar and lifts the wheel above the bar's row.
function cornersLayout(vp) {
    const { w, h } = vp;
    const cx = w / 2;
    const barBottom = h - 16 - BAR_BELOW;              // the bar's panel ends 16 px up, as in the old square
    const barTop = barBottom - BAR_ABOVE;
    const sideBySide = HUD_M + QUESTLOG_RECT.w + HUD_GAP <= cx - BAR_HALF;
    const logBottom = sideBySide ? h - 16 : barTop - HUD_GAP;
    const log = { x: HUD_M, y: logBottom - QUESTLOG_RECT.h, w: QUESTLOG_RECT.w, h: QUESTLOG_RECT.h, lines: 2 };
    const wheelBeside = w - HUD_M - 2 * WHEEL_REACH >= cx + BAR_HALF + HUD_GAP;
    const wheel = { cx: w - HUD_M - WHEEL_REACH, cy: (wheelBeside ? h - 16 : barTop - HUD_GAP) - WHEEL_REACH };
    return {
        hp: { x: HUD_M, y: HUD_M },
        buffsRight: w - HUD_M - Math.ceil(PAGE_BUTTONS_CSS * vp.logicalPerCss), buffsTop: HUD_M,
        log, bar: { cx, bottom: barBottom }, wheel, strip: h,
    };
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test tests/hud-layout.test.js`
Expected: all pass, the classic tests included.

Run: `npm test 2>&1 | tail -8` — expected `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add game/layout.js tests/hud-layout.test.js && git commit -m "feat(layout): on a filled screen the HUD pins to the corners; the log and the bar share a line"
```

### Task 10: The canvas fills the window

**Files:**
- Modify: `game/main.js` (`_fitCanvas`; the splash's `start` and `continueGame`)
- Modify: `game/style.css` (`#game-layout`, `#game-canvas`, and the touch media query's `#game-layout`)

- [ ] **Step 1: Measure today's frame first**

Before changing anything, record the baseline the spec's speed check compares against. In a test tab, `resize_window {width: 3440, height: 1440}`, reload, stub the autosave, press GAME START, and run:

```js
const g = __game, R = g.renderer;
g._worldBeat = () => {};
const time = (n = 120) => { const t0 = performance.now(); for (let i = 0; i < n; i++) R.renderFrame(g); return +((performance.now() - t0) / n).toFixed(2); };
g._nightLevel = 0.7; const townNight = time();
await g._loadMap('sewer-map.json');
const foe = g.enemies.find((e) => e.entity.isAlive() && !e.ambient); foe.state = 'chasing';
g.playerX = foe.x - 2; g.playerY = foe.y; g._nightLevel = 0; g._openWheel(); g._overlayOpenedAt = 0;
const sewerFight = time();
JSON.stringify({ townNight, sewerFight, canvas: [R.canvas.width, R.canvas.height] })
```

Write the two numbers (ms per frame) into this task's commit message in Step 6. Reset the tab with `resize_window {preset: "desktop"}`.

> **Execution fix (2026-09-13): time the full frame too, and gate on it.** The snippet above
> times only *issuing* the drawing on the main thread. Chrome rasterizes on the GPU afterwards,
> and skips any frame whose pixels the next frame's full clear covers before anything reads them,
> so the loop never pays for the pixels — the cost that grows with the screen. Reading the game
> canvas back each frame is no fix: after a few `getImageData` calls Chrome moves a default canvas
> to software drawing, and every later number in that page load is wrong (it read 21–54 ms). Nor is
> a readback per frame on a GPU canvas: that waits for the next 120 Hz tick (8.33 ms whatever the
> scene). What works: draw on a twin canvas Chrome keeps on the GPU, copy each frame into a small
> GPU "sink" (the copy forces that frame to be rasterized), and read the sink once after N frames.
> Run it in a fresh page load, before anything reads the game canvas:
>
> ```js
> const g = __game, R = g.renderer;
> const M = document.createElement('canvas'); M.width = R.canvas.width; M.height = R.canvas.height;
> const mctx = M.getContext('2d', { willReadFrequently: false }); mctx.imageSmoothingEnabled = false;
> const sink = document.createElement('canvas'); sink.width = 512; sink.height = 512;
> const sctx = sink.getContext('2d', { willReadFrequently: false });
> const real = { canvas: R.canvas, ctx: R.ctx };
> const fullFrame = (n = 60) => {
>     R.canvas = M; R.ctx = mctx; R._vignetteGradient = null;
>     try {
>         for (let i = 0; i < 10; i++) { R.renderFrame(g); sctx.drawImage(M, 0, 0, 64, 64); }
>         sctx.getImageData(0, 0, 1, 1);
>         const t0 = performance.now();
>         for (let i = 0; i < n; i++) { R.renderFrame(g); sctx.drawImage(M, (i % 8) * 64, 0, 64, 64); }
>         sctx.getImageData(0, 0, 1, 1);
>         return +((performance.now() - t0) / n).toFixed(2);
>     } finally { R.canvas = real.canvas; R.ctx = real.ctx; R._vignetteGradient = null; }
> };
> ```
>
> Check it measures the GPU: a frame of 40 big blurred shadows took 0.01 ms to issue and 0.64 ms
> through `fullFrame`. Baseline at 3440×1440 (today's 1216² square, RTX 4080 SUPER, median of
> three): **full frame** Town at night 1.38 ms, Town by day 1.38 ms, Sewer fight 1.95 ms;
> **issue only** 0.5–1.1 ms and 0.6–1.4 ms across two page loads.

- [ ] **Step 2: `_fitCanvas` fills the layout box**

Replace `_fitCanvas` (the Task 7 version) with:

```js
    // Size the canvas for the window through the viewport (game/viewport.js),
    // and hand the viewport to the renderer, which draws with it. The canvas
    // fills #game-layout: the window, less the touch-control band style.css
    // reserves on phones. Called on boot, on resize, on a DPR change, and when
    // the game appears (#game-wrapper is hidden behind the splash until then,
    // so it measures 0 x 0 before that).
    _fitCanvas() {
        const canvas = this.renderer?.canvas;
        const box = document.getElementById('game-layout')?.getBoundingClientRect();
        if (!canvas || !box || box.width < 1 || box.height < 1) return;
        const vp = computeViewport({ cssW: box.width, cssH: box.height, dpr: window.devicePixelRatio });
        this.renderer.setViewport(vp);
        canvas.style.width  = `${vp.cssW}px`;
        canvas.style.height = `${vp.cssH}px`;
        if (this.state !== STATE.SPLASH) this._render();
    }
```

In `_bindSplash`, `start` and `continueGame` both run `wrapper.classList.remove('hidden');`. Directly after each of those two lines, add:

```js
            this._fitCanvas();            // (screen-fill) measure the now-visible layout box
```

- [ ] **Step 3: CSS — the canvas fills the layout box**

In `game/style.css`, replace:

```css
#game-layout {
    display: flex;
    align-items: stretch;
    gap: 0;
    height: min(calc(100vh - 16px), calc(100vw - 16px));
    max-height: 1024px;
}
```

with:

```css
/* (screen-fill) The layout box is the whole wrapper; main._fitCanvas measures
   it and sizes the canvas to fill it (game/viewport.js). */
#game-layout {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    overflow: hidden;
}
```

In `#game-canvas`, delete the line `aspect-ratio: 1;`, and replace its comment:

```css
    /* Width/height are set from JS (game/canvas-fit.js) so that cssPx * dpr
       lands on a whole number of art pixels. A CSS-driven fluid size resamples
       the fixed 1216px backing store at a fractional ratio, which under
       crisp-edges makes neighbouring art pixels 3 and 4 device px wide. */
```

with:

```css
    /* Width/height are set from JS (main._fitCanvas via game/viewport.js): the
       canvas fills #game-layout, and its backing store matches the screen's
       real pixels one to one, so art pixels stay whole at every size. */
```

`100vh` on iOS Safari includes the strip under the URL bar, so the canvas would run under it. In the `body` rule and in `#game-wrapper`, add `height: 100dvh;` directly after each `height: 100vh;` line (browsers without `dvh` keep the `vh` line).

In the `@media (pointer: coarse), (max-width: 700px)` block, replace:

```css
    #game-layout {
        height: min(100vw, calc(100vh - 184px - env(safe-area-inset-bottom)));
        max-height: 100vw;
    }
```

with:

```css
    #game-layout {
        height: 100%;   /* the wrapper's padding still reserves the touch band (until stage 3) */
    }
```

- [ ] **Step 4: Switch the viewport to fill**

This happened in Step 2: `computeViewport` defaults to `mode: 'fill'`. Confirm nothing else asks for classic:

```bash
grep -n "mode: 'classic'" game/*.js
```

Expected: only the `CLASSIC` constant in `game/viewport.js`.

Run: `npm test 2>&1 | tail -8` — expected `ℹ fail 0`.

- [ ] **Step 5: Look at it, at three sizes**

Restart the dev server. In a test tab (autosave stubbed, GAME START), for each of `resize_window {width: 1920, height: 1080}`, `{width: 3440, height: 1440}` and `{preset: "mobile"}`, reload, start, and:

1. Screenshot. Town fills the screen edge to edge; you stand in the middle; HP is top-left, the log bottom-left, the item bar bottom-centre. Past the map's edge is the void for now (fillers are Task 12).
2. Check the tiles and sizes:

   ```js
   const vp = __game.renderer._view();
   JSON.stringify({ tile: vp.k * 16, cols: vp.cols, rows: vp.rows, backing: [vp.backingW, vp.backingH], css: [vp.cssW, vp.cssH] })
   ```

   Expected at 1920×1080: `tile` 48, `cols` 40, `rows` 22.5; at 3440×1440: 64, 53.75, 22.5.
3. Seams mid-step at an odd scale (1920×1080 gives k = 3). Render one frame partway through a step and count see-through pixels:

   ```js
   const g = __game, c = g.renderer.canvas;
   Object.assign(g, { _animating: true, _animFromX: g.playerX - 1, _animFromY: g.playerY, _animToX: g.playerX, _animToY: g.playerY, _animProgress: 0.37 });
   g.renderer.renderFrame(g);
   const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
   let holes = 0; for (let i = 3; i < d.length; i += 4) if (d[i] < 255) holes++;
   g._animating = false;
   holes
   ```

   Expected: `0`.
4. Menus: open the Remoticon (`__game._openDevice('items')`) — it sits in the middle of the screen, and its ✕ closes it when tapped (reuse `tapAt` from Task 7, Step 7).
5. Rerun the tap checks from Task 7, Step 7. The same expectations hold.

Reset the tab with `resize_window {preset: "desktop"}`.

- [ ] **Step 6: Commit**

```bash
git add game/main.js game/style.css && git commit -m "feat(screen): the canvas fills the window at the rule's tile size (baseline frame at 3440x1440: town-night <N> ms, sewer-fight <N> ms)"
```

Put the Step 1 numbers where the message says `<N>`.

### Task 11: Menu-space scrolling on the offer screen

The offer screen's mouse-wheel handler calls `this._screenToCanvas`, which does not exist, so it always scrolls your column. With menus in a box, it needs a menu-space point anyway.

**Files:**
- Modify: `game/main.js` (the canvas `wheel` listener, ~line 1478)

- [ ] **Step 1: Fix it**

Replace:

```js
                const pt = this._screenToCanvas ? this._screenToCanvas(e) : null;
```

with:

```js
                const pt = toMenu(this._vp(), this._canvasLocalCoords(e, canvas));   // offerLayout is menu space
```

- [ ] **Step 2: Check it in the browser**

Restart the dev server. In a test tab (autosave stubbed, GAME START), trade with a shopkeeper who stocks more than one screen of items (walk into one in Town, or open the offer from the target list). Put the pointer over their column and scroll: their column scrolls; over yours, yours does.

- [ ] **Step 3: Commit**

```bash
git add game/main.js && git commit -m "fix(offer): the mouse wheel scrolls the column under the pointer"
```

### Task 12: Past the map's edge, each map names a filler

**Files:**
- Modify: `game/map.js` (the `GameMap` constructor)
- Modify: `game/renderer.js` (`_drawTiles`' off-map branch; `_drawActors`; the `data.js` import)
- Modify: `game/town-map.json`, `carnival-map.json`, `downtown-map.json`, `graveyard-map.json`, `wilderness-map.json`, `sewer-map.json`, `factory-map.json`, `canyon-map.json`
- Test: `tests/tile-render.test.js`, `tests/tile-coverage.test.js`

- [ ] **Step 1: Write the failing tests**

In `tests/tile-render.test.js`, give `paint` a fifth parameter for extra map fields. Replace:

```js
function paint(width, tiles, px, py) {
```

with:

```js
function paint(width, tiles, px, py, extra = {}) {
```

and in its body replace:

```js
    const map = new GameMap({ width, height: tiles.length / width, spawn: { x: 0, y: 0 }, tiles }, 'test');
```

with:

```js
    const map = new GameMap({ width, height: tiles.length / width, spawn: { x: 0, y: 0 }, tiles, ...extra }, 'test');
```

Change its sprites import to `import { OUTLINED_SPRITES, TILE_SPRITE_MAP, TOWN_TILE_SPRITE_MAP, PROP_SPRITES } from '../game/sprites.js';`, then add these tests inside `describe('_drawTiles', …)`:

```js
    test('off the map, a map that names a filler draws it instead of the void', () => {
        const F = TILES.FLOOR.id, G = TILES.GRASS.id;
        const at = paint(3, [F, F, F, F, F, F, F, F, F], 1, 1, { border: { tile: G } });
        const grass = TOWN_TILE_SPRITE_MAP[G];
        assert.deepEqual(at(-1, -1), [{ sheet: grass.sheet, col: grass.col, row: grass.row }]);
        assert.deepEqual(at(5, 2), [{ sheet: grass.sheet, col: grass.col, row: grass.row }]);
    });

    test('a wall filler paints its own colour under its brick, as a wall on the map does', () => {
        const F = TILES.FLOOR.id, W = TILES.WALL.id;
        const at = paint(3, [F, F, F, F, F, F, F, F, F], 1, 1, { border: { tile: W } });
        assert.deepEqual(at(-1, -1), [
            { fill: TILES.WALL.fallbackColor },
            { sheet: TILE_SPRITE_MAP[W].sheet, col: TILE_SPRITE_MAP[W].col, row: TILE_SPRITE_MAP[W].row },
        ]);
    });
```

and this test inside `describe('_drawActors', …)`:

```js
    test('off the map, a filler prop stands on every cell within reach, without a shadow', () => {
        const drawn = [], shadows = [];
        const r = Object.assign(Object.create(Renderer.prototype), {
            ctx: {}, _scrollX: 0, _scrollY: 0, sprites: {},
            _playerScreenPos: () => ({ ppx: 0, ppy: 0, groundPy: 0 }),
            _drawPlayerSprite() {}, _drawEnemySprite() {},
            _drawPropSprite(def, px, py) { drawn.push({ def, px, py }); },
            _drawGroundShadow(cx, cy) { shadows.push([cx, cy]); },
        });
        const map = {
            propSpawns: [], border: { tile: TILES.GRASS.id, prop: 'tree' },
            isInBounds: (x, y) => x >= 0 && y >= 0 && x < 5 && y < 5,
        };
        r._drawActors({ playerX: 2, playerY: 2, enemies: [], map });
        const { span } = r._view();
        const reach = (span.iMax - span.iMin + 7) * (span.jMax - span.jMin + 7);   // the span plus props' 3-tile margin
        assert.equal(drawn.length, reach - 25, 'a tree on every off-map cell in reach, and none on the 5x5 map');
        assert.ok(drawn.every((d) => d.def === PROP_SPRITES.tree));
        assert.equal(shadows.length, 1, "only the player's own shadow");
    });
```

In `tests/tile-coverage.test.js`, change the sprites import to `import { TILE_SPRITE_MAP, TOWN_TILE_SPRITE_MAP, ZONE_TILE_SPRITE_MAP, SHEETS, PROP_SPRITES } from '../game/sprites.js';` and add inside `describe('tile coverage', …)`:

```js
    test("every map's filler is real art", () => {
        const bad = [];
        for (const file of mapFiles) {
            const b = loadMap(file).border;
            if (!b) continue;
            if (!(b.tile in allTileMaps)) bad.push(`${file}: border tile ${b.tile} has no sprite`);
            if (b.prop && !PROP_SPRITES[b.prop]) bad.push(`${file}: border prop '${b.prop}' has no art`);
        }
        assert.deepEqual(bad, [], bad.join('\n'));
    });

    test('the fillers are the table in plans/screen-fill.md (change the two together)', () => {
        const want = {
            'town-map.json':       { tile: 13, prop: 'tree' },
            'carnival-map.json':   { tile: 13, prop: 'tree' },
            'downtown-map.json':   { tile: 13, prop: 'tree' },
            'graveyard-map.json':  { tile: 52, prop: 'tree' },
            'wilderness-map.json': { tile: 52, prop: 'tree' },
            'sewer-map.json':      { tile: 0 },
            'factory-map.json':    { tile: 41 },
            'canyon-map.json':     { tile: 0 },
        };
        for (const file of mapFiles) assert.deepEqual(loadMap(file).border ?? null, want[file] ?? null, file);
    });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test tests/tile-render.test.js tests/tile-coverage.test.js`
Expected: FAIL — the off-map cells still paint the void; no tree props are drawn; no map has a `border` yet.

- [ ] **Step 3: The map keeps its filler**

In `game/map.js`, in the `GameMap` constructor, directly after `this.zoneName = mapData.zoneName || 'UNKNOWN';`, add:

```js
        // (screen-fill) What the world shows past the map's edge: { tile, prop? },
        // or null for the void. Drawing only — off the map is never walkable.
        this.border  = mapData.border || null;
```

- [ ] **Step 4: The renderer draws it**

In `game/renderer.js`, change the data import to `import { TILE_PX, CANVAS_PX, SAFE_SLOTS, TILE_BY_ID } from './data.js';`.

In `_drawTiles`, replace:

```js
                const id = game.map.getTile(wx, wy);
                const def = game.map.getTileDef(wx, wy);

                // Off the map there is nothing: paint the void. getTile reports
                // WALL (id 0) out there so the edge stays unwalkable, but WALL
                // has real brick art now (the Sewer's walls) and drawing it
                // would ring every zone in dungeon brick.
                if (!game.map.isInBounds(wx, wy)) {
                    ctx.fillStyle = def.fallbackColor;
                    ctx.fillRect(px, py, TILE_PX, TILE_PX);
                    continue;
                }
```

with:

```js
                let id = game.map.getTile(wx, wy);
                let def = game.map.getTileDef(wx, wy);

                // Off the map: the map's filler if it names one (the Pokémon
                // trick: past the edge the world carries on, so it never visibly
                // ends), else the void. getTile reports WALL (id 0) out there so
                // the edge stays unwalkable either way. Without a filler, WALL's
                // own brick is not drawn, or every zone would be ringed in
                // dungeon brick.
                if (!game.map.isInBounds(wx, wy)) {
                    const border = game.map.border;
                    if (!border) {
                        ctx.fillStyle = def.fallbackColor;
                        ctx.fillRect(px, py, TILE_PX, TILE_PX);
                        continue;
                    }
                    id = border.tile;
                    def = TILE_BY_ID[id] || def;
                }
```

In `_drawActors`, directly after the map-props loop (the `for (const p of (game.map?.propSpawns || [])) { … }` block), add:

```js
        // The map's filler prop (a forest's trees) on every off-map cell within
        // reach, with the same 3-tile overhang margin as map props. No ground
        // shadows for these: a forest of them would be hundreds of gradients a
        // frame, and a wall of trees does not need them.
        const fillerProp = game.map?.border?.prop ? PROP_SPRITES[game.map.border.prop] : null;
        if (fillerProp) {
            for (let j = vp.span.jMin - 3; j <= vp.span.jMax + 3; j++) {
                for (let i = vp.span.iMin - 3; i <= vp.span.iMax + 3; i++) {
                    if (game.map.isInBounds(game.playerX + i, game.playerY + j)) continue;
                    const px = vp.origin.x + i * TILE_PX - this._scrollX;
                    const py = vp.origin.y + j * TILE_PX - this._scrollY;
                    actors.push({ kind: 'prop', def: fillerProp, px, py, feetY: py + TILE_PX, filler: true });
                }
            }
        }
```

and in the shadow loop just below, replace:

```js
            else if (a.def.shadow !== false) this._drawGroundShadow(a.px + TILE_PX / 2, a.py + TILE_PX - 3, 0.32, a.def.shadowRx ?? 12, a.def.shadowRy ?? 4.5);
```

with:

```js
            else if (a.def.shadow !== false && !a.filler) this._drawGroundShadow(a.px + TILE_PX / 2, a.py + TILE_PX - 3, 0.32, a.def.shadowRx ?? 12, a.def.shadowRy ?? 4.5);
```

- [ ] **Step 5: Give the maps their fillers**

The map files are CRLF and hand-formatted, so add each `border` line with a script that keeps both. Run from the repo root:

```bash
node --input-type=module <<'EOF'
import { readFileSync, writeFileSync } from 'node:fs';
// The table in plans/screen-fill.md. Interiors (bank, casino, diner, borgir) keep the void.
const BORDERS = {
    'town-map.json':       { tile: 13, prop: 'tree' },
    'carnival-map.json':   { tile: 13, prop: 'tree' },
    'downtown-map.json':   { tile: 13, prop: 'tree' },
    'graveyard-map.json':  { tile: 52, prop: 'tree' },
    'wilderness-map.json': { tile: 52, prop: 'tree' },
    'sewer-map.json':      { tile: 0 },
    'factory-map.json':    { tile: 41 },
    'canyon-map.json':     { tile: 0 },
};
for (const [file, border] of Object.entries(BORDERS)) {
    const path = `game/${file}`;
    const text = readFileSync(path, 'utf8');
    if (text.includes('"border"')) throw new Error(`${file} already has a border`);
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const m = text.match(/^([ \t]*)"zoneName": .*$/m);
    if (!m) throw new Error(`${file}: no zoneName line`);
    const body = Object.entries(border).map(([k, v]) => `"${k}": ${JSON.stringify(v)}`).join(', ');
    const at = text.indexOf(m[0]) + m[0].length;
    writeFileSync(path, text.slice(0, at) + eol + `${m[1]}"border": { ${body} },` + text.slice(at));
    console.log(`${file}: ${m[1]}"border": { ${body} },`);
}
EOF
git diff --stat -- game/*-map.json
```

Expected: eight lines printed, and the diff shows `1 +` for each of the eight files (one inserted line; nothing else changed).

- [ ] **Step 6: Run the tests to see them pass**

Run: `node --test tests/tile-render.test.js tests/tile-coverage.test.js`
Expected: all pass.

Run: `npm test 2>&1 | tail -8` — expected `ℹ fail 0`.

- [ ] **Step 7: Look at it**

Restart the dev server. In a test tab at `resize_window {width: 3440, height: 1440}` (autosave stubbed, GAME START), walk or teleport (`__game.playerX = 32; __game._render()`) to Town's east edge: a forest of trees fills past the edge, with no void. Load the Sewer (`await __game._loadMap('sewer-map.json')`): brick past its edges. Load the Diner (`await __game._loadMap('diner-map.json')`): black past its walls. Screenshot each. Reset with `resize_window {preset: "desktop"}`.

- [ ] **Step 8: Commit**

```bash
git add game/map.js game/renderer.js game/town-map.json game/carnival-map.json game/downtown-map.json game/graveyard-map.json game/wilderness-map.json game/sewer-map.json game/factory-map.json game/canyon-map.json tests/tile-render.test.js tests/tile-coverage.test.js && git commit -m "feat(zones): past a map's edge the world carries on — each map names a filler"
```

### Task 13: The speed check

The spec's gate: at 3440×1440, a frame of Town at night and of a Sewer fight must each render in under 16 ms on Caelan's machine.

- [ ] **Step 1: Measure**

Restart the dev server. In a test tab, `resize_window {width: 3440, height: 1440}`, reload, stub the autosave, press GAME START, and run the timing snippet from Task 10, Step 1 again. It now measures the filled screen with the fillers. Stand at Town's east edge first (`__game.playerX = 32`), where the forest adds the most props. Reset with `resize_window {preset: "desktop"}`.

(Execution fix: run `fullFrame` from Task 10 Step 1's note on the same scenes, in the same fresh page load and before anything reads the game canvas. The gate below is the full frame; report the issue time beside it.)

- [ ] **Step 2: Decide**

- **Both under 16 ms:** write both numbers, next to Task 10's baseline, into `plans/screen-fill.md` under a new `## Measured` heading at the end, and commit:

  ```bash
  git add plans/screen-fill.md && git commit -m "plan(screen-fill): the filled screen renders in <N> ms (town at night) and <N> ms (sewer fight) at 3440x1440"
  ```

- **Either at 16 ms or over:** stop. Do not start stage 3. Report both numbers and the baseline to Caelan. The spec names the fallbacks — cache the tile layer between camera moves, and draw the lighting and arena passes at half resolution — and they get their own plan.

### Task 14: Retire the classic viewport

Stage 1's scaffolding goes: the classic mode, `canvas-fit.js` and the recorder. A renderer that has not been given a viewport (in tests) now draws on a default 1080p screen.

**Files:**
- Modify: `game/viewport.js`, `game/layout.js`, `game/renderer.js`
- Modify: `tests/viewport.test.js`, `tests/hud-layout.test.js`, `tests/tile-render.test.js`
- Delete: `game/canvas-fit.js`, `tests/canvas-fit.test.js`, `game/dev/frame-recorder.js`, `game/dev/classic-frames.json`

- [ ] **Step 1: viewport.js loses classic**

In `game/viewport.js`:

- Delete `import { pickCanvasCss } from './canvas-fit.js';`, and the `CLASSIC_SS` and `CLASSIC_CAP` constants.
- Replace the comment above `computeViewport` and its opening, from `// \`mode: 'classic'\` reproduces …` through the end of the `if (mode === 'classic') { … } else { … }` block, with:

  ```js
  // Fill cssW x cssH with as many tiles as fit, at the largest whole scale that
  // still shows MIN_TILES along the short side. `dock` ({ landscape, portrait },
  // logical px) is the strip along the bottom the world does not show through.
  export function computeViewport({ cssW, cssH, dpr = 1, dock = null } = {}) {
      const d = (Number.isFinite(dpr) && dpr > 0) ? dpr : 1;
      const backingW = Math.max(1, Math.floor(cssW * d));
      const backingH = Math.max(1, Math.floor(cssH * d));
      const cssOut = { w: backingW / d, h: backingH / d };
      const k = Math.max(1, Math.floor(Math.min(backingW, backingH) / (16 * MIN_TILES)));
      const scale = k / ART_PX;
  ```

- Replace `const dockRows = (mode === 'classic' || !dock) ? 0 : (portrait || w < dock.minOneRowW) ? 2 : 1;` with `const dockRows = !dock ? 0 : (portrait || w < dock.minOneRowW) ? 2 : 1;`.
- In the returned object, replace `mode, cssW: cssOut.w,` with `cssW: cssOut.w,`.
- Replace the `CLASSIC` constant and its comment with:

  ```js
  // The screen a renderer draws on before main hands it a viewport, and in
  // tests that build renderers by hand: a 1080p monitor.
  export const DEFAULT_VIEW = computeViewport({ cssW: 1920, cssH: 1080, dpr: 1 });
  ```

- [ ] **Step 2: layout.js and renderer.js follow**

In `game/layout.js`:

- Change the viewport import to `import { DEFAULT_VIEW } from './viewport.js';`.
- Replace every `vp = CLASSIC` default parameter with `vp = DEFAULT_VIEW` (in `throwRects`, `hudInteractiveRects` and `hudLayout`).
- In `hudLayout`, delete the `if (vp.mode === 'classic') { … }` block, so its body is `return cornersLayout(vp);`.
- Replace the comment above the hudLayout constants with:

  ```js
  // ── The HUD, placed for a viewport (plans/screen-fill.md) ──
  // Where every HUD piece sits on a given screen: the renderer draws there and
  // main.js hit-tests there, the same contract as the rects in this file.
  ```

In `game/renderer.js`:

- Change `import { CLASSIC, offView, snapPx } from './viewport.js';` to `import { DEFAULT_VIEW, offView, snapPx } from './viewport.js';`.
- In the constructor, replace `CLASSIC.backingW` and `CLASSIC.backingH` with `DEFAULT_VIEW.backingW` and `DEFAULT_VIEW.backingH`.
- Replace `_view() { return this.viewport || CLASSIC; }` and its comment with:

  ```js
      // The viewport in force: the one main set, or the default screen for a
      // renderer that never had one (tests build renderers with Object.create).
      _view() { return this.viewport || DEFAULT_VIEW; }
  ```

- [ ] **Step 3: The tests follow**

In `tests/viewport.test.js`:

- Change the imports to:

  ```js
  import {
      computeViewport, DEFAULT_VIEW, MIN_TILES, ART_PX, MENU_SIZE,
      tileToScreen, screenToTile, offView, clientToScreen, toMenu, snapPx,
  } from '../game/viewport.js';
  ```

  and delete the `pickCanvasCss` import.
- Delete the whole `describe('classic: the square the game draws today', …)` block, the two tests `'classic screenToTile is the old _screenToTile arithmetic'` and `"classic offView is the old passes' culls"`, and the line `assert.equal(CLASSIC.dockRows, 0);` in the dock test.
- In `describe('conversions', …)`, replace `const views = [CLASSIC, at(SCREENS['1080p']), at(SCREENS['phone upright'])];` with `const views = [DEFAULT_VIEW, at(SCREENS["Caelan's monitor"]), at(SCREENS['phone upright'])];`.
- In the `toMenu` test, replace `assert.deepEqual(toMenu(CLASSIC, { x: 10, y: 20 }), { x: 10, y: 20 });` with `assert.deepEqual(toMenu(DEFAULT_VIEW, { x: DEFAULT_VIEW.menu.x, y: DEFAULT_VIEW.menu.y }), { x: 0, y: 0 });`.
- In the `snapPx` test, replace `assert.equal(snapPx(CLASSIC, 3.4), 3);` with:

  ```js
          const even = at(SCREENS["Caelan's monitor"]);   // k = 4, so scale is 2
          assert.equal(even.snap, 1);
          assert.equal(snapPx(even, 3.4), 3);
  ```

- Add this test at the end of `describe('conversions', …)`, so the culling rule stays pinned now that the classic comparison is gone:

  ```js
      test('offView keeps a margin of m tiles past the span on every side', () => {
          const vp = at(SCREENS['1080p']);
          for (const m of [1, 2, 3, 4]) {
              assert.equal(offView(vp, vp.span.iMin - m, 0, m), false);
              assert.equal(offView(vp, vp.span.iMin - m - 1, 0, m), true);
              assert.equal(offView(vp, vp.span.iMax + m, 0, m), false);
              assert.equal(offView(vp, vp.span.iMax + m + 1, 0, m), true);
              assert.equal(offView(vp, 0, vp.span.jMax + m + 1, m), true);
          }
      });
  ```

In `tests/hud-layout.test.js`:

- Change `import { CLASSIC, computeViewport } from '../game/viewport.js';` to `import { computeViewport } from '../game/viewport.js';`.
- Delete the tests `'every piece sits where the fixed constants put it'` and `'throwRects(classic) are THROW_RECTS'`, and rename the block `describe('hudLayout (classic) is the old square', …)` to `describe('throw targets and the item bar anchor', …)`.

In `tests/tile-render.test.js`:

- Add `import { DEFAULT_VIEW } from '../game/viewport.js';` below the other imports, and delete `const HALF = 9;`.
- In `paint`, replace `const cellOf = (x, y) => [x / TILE_PX - HALF + px, y / TILE_PX - HALF + py].join(',');` with:

  ```js
      // A renderer with no viewport draws on DEFAULT_VIEW: your tile's top-left is its origin.
      const { origin } = DEFAULT_VIEW;
      const cellOf = (x, y) => [(x - origin.x) / TILE_PX + px, (y - origin.y) / TILE_PX + py].join(',');
  ```

- In `paint`'s renderer, replace `ctx, half: HALF, _scrollX: 0, _scrollY: 0,` with `ctx, _scrollX: 0, _scrollY: 0,`.
- In `drawOne`'s renderer, replace `ctx: {}, half: HALF, _scrollX: 0, _scrollY: 0, sprites: {},` with `ctx: {}, _scrollX: 0, _scrollY: 0, sprites: {},`, and `_playerScreenPos: () => ({ ppx: HALF * TILE_PX, ppy: HALF * TILE_PX }),` with `_playerScreenPos: () => ({ ppx: 0, ppy: 0, groundPy: 0 }),`.

- [ ] **Step 4: Delete the scaffolding**

```bash
git rm -q game/canvas-fit.js tests/canvas-fit.test.js game/dev/frame-recorder.js game/dev/classic-frames.json
grep -rnE "canvas-fit|pickCanvasCss|\bCLASSIC\b|mode: 'classic'|frame-recorder" game tests --include=*.js --include=*.css --include=*.html | grep -v TheDangerrZone
```

Expected: no output from the grep. (If `game/style.css` still names `canvas-fit.js` in a comment, reword that comment to name `game/viewport.js`.)

- [ ] **Step 5: Tests**

Run: `npm test 2>&1 | tail -8`
Expected: `ℹ fail 0`. The count drops by the deleted classic and canvas-fit tests.

- [ ] **Step 6: Commit**

```bash
git add game/viewport.js game/layout.js game/renderer.js tests/viewport.test.js tests/hud-layout.test.js tests/tile-render.test.js && git commit -m "refactor(viewport): retire the classic square and canvas-fit; stage 1's scaffolding goes"
```

### Task 15: Stage 2 checkpoint

- [ ] **Step 1: Everything green**

Run: `npm test 2>&1 | tail -8` — expected `ℹ fail 0`.

- [ ] **Step 2: Play it, at three sizes**

Restart the dev server. In a test tab (autosave stubbed, GAME START), at `resize_window {width: 1920, height: 1080}`, `{width: 3440, height: 1440}` and `{preset: "mobile"}`, each after a reload:

1. Screenshot Town; walk to its edge and screenshot the forest.
2. Rerun Task 7's tap checks (log, Remoticon ✕, wheel, tap-to-move). The same expectations hold.
3. Open a menu (the Remoticon) and screenshot it: it sits in the middle of the screen, over the world.
4. Start a fight in the Sewer and open the wheel: it opens bottom-right, clear of the item bar.

Reset with `resize_window {preset: "desktop"}`.

- [ ] **Step 3: Push and report**

```bash
git push
```

Tell Caelan stage 2 is in: the game fills the window at the rule's tile size, and a forest (or brick, or black) carries on past every map's edge. Include the speed numbers from Task 13. Then show him the game: front the test tab at his monitor's size (`tabs_select`).

---

## Stage 3 — the dock and the dial

### Task 16: The dock's geometry

**Files:**
- Modify: `game/layout.js` (next to `hudLayout`)
- Test: `tests/hud-layout.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/hud-layout.test.js`:

```js
import { DOCK, DIAL_MAX_R, dialRadius, wheelTopMarks, hitHud } from '../game/layout.js';

describe('the dock', () => {
    const withDock = (cssW, cssH, dpr) => computeViewport({ cssW, cssH, dpr, dock: DOCK });
    const screens = {
        '1080p': withDock(1920, 1080, 1),
        "Caelan's ultrawide": withDock(3440, 1440, 1),
        'phone upright': withDock(390, 844, 3),
        'a squarish window': withDock(1100, 1000, 1),
    };

    for (const [name, vp] of Object.entries(screens)) {
        test(`${name}: the log, the item bar and the opener never overlap under HIT_SLOP`, () => {
            const rects = hudInteractiveRects('idle', vp);
            assert.deepEqual(rects.map((r) => r.name), ['questlog', 'xmb', 'opener']);
            for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
                assert.ok(!rectsOverlap(expandRect(rects[i].rect, HIT_SLOP), expandRect(rects[j].rect, HIT_SLOP)),
                    `${rects[i].name} and ${rects[j].name} overlap`);
            }
        });

        test(`${name}: they all sit inside the dock, and the hint strips rest on its top edge`, () => {
            const hud = hudLayout(vp);
            const inDock = (r) => r.x >= 0 && r.x + r.w <= vp.w && r.y >= hud.dock.y && r.y + r.h <= vp.h;
            assert.ok(inDock(hud.log), 'log');
            assert.ok(inDock(xmbBarPanelRect(3, hud.bar)), 'item bar');
            assert.ok(inDock(hud.opener), 'opener');
            assert.equal(hud.dock.y, vp.h - vp.dockH);
            assert.equal(hud.strip, hud.dock.y);
        });

        test(`${name}: the biggest dial fits across the screen, and the deepest BACK tile ends in the dock`, () => {
            const hud = hudLayout(vp);
            assert.ok(hud.wheel.cx - DIAL_MAX_R >= 0 && hud.wheel.cx + DIAL_MAX_R <= vp.w);
            assert.ok(hud.wheel.cy + 120 <= vp.h - 8 && hud.wheel.cy + 120 >= hud.dock.y);
        });
    }

    test('one row on a wide screen: the log reaches to the item bar', () => {
        const vp = screens['1080p'], hud = hudLayout(vp);
        assert.equal(vp.dockRows, 1);
        assert.equal(hud.log.lines, 3);
        assert.equal(hud.log.x + hud.log.w + 12, xmbBarPanelRect(3, hud.bar).x);
    });

    test('two rows on an upright phone: the log spans the screen', () => {
        const vp = screens['phone upright'], hud = hudLayout(vp);
        assert.equal(vp.dockRows, 2);
        assert.equal(hud.log.w, vp.w - 16);
    });

    test('the dial covers the wheel at every depth, with room for FIRE at a leaf', () => {
        // The real wheel's measured reach above its hub (plans/screen-fill.md): 103, 135, 135.
        assert.equal(dialRadius(1, true), 88 + 14 + 12);
        assert.equal(dialRadius(2, true), 120 + 14 + 12);
        assert.equal(dialRadius(3, false), 120 + 30 + 12);
        assert.ok(dialRadius(1, true) > 103 && dialRadius(2, true) > 135 && dialRadius(3, false) > 135);
        assert.equal(DIAL_MAX_R, dialRadius(3, false));
    });

    test('the FIRE cue never sits under the pointer', () => {
        for (let r = 50; r <= 160; r++) {
            const m = wheelTopMarks(r);
            assert.ok(m.cueTop - 12 >= m.pointerTop, `outermost ring ${r}`);
        }
    });

    test('hitHud finds the opener and the log, and nothing in the world', () => {
        const hud = hudLayout(screens['1080p']);
        const mid = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
        assert.equal(hitHud(hud, mid(hud.opener)), 'opener');
        assert.equal(hitHud(hud, mid(hud.log)), 'log');
        assert.equal(hitHud(hud, { x: 640, y: 300 }), null);
    });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test tests/hud-layout.test.js`
Expected: FAIL — `DOCK` (and the dial helpers and `hitHud`) are not exported.

- [ ] **Step 3: Implement**

In `game/layout.js`, directly after `cornersLayout`, add:

```js
// ── The dock (stage 3 of plans/screen-fill.md) ──
// A full-width strip along the bottom: the log on the left, the item bar in
// the middle, the wheel's ✦ opener on the right. On an upright or narrow
// screen it has two rows: the log above, the item bar and the opener below.
// The world stops at its top edge: main passes DOCK to computeViewport.
export const DOCK = Object.freeze({ oneRow: 100, twoRows: 196, minOneRowW: 1000 });
const DOCK_PAD = 8;                     // between the dock's edges and its pieces
const LOG_H3 = 84;                      // header + objective + three 12px message lines + 12px padding top and bottom
const OPENER = 72;                      // the ✦ button
const BAR_H = BAR_ABOVE + BAR_BELOW;    // the item bar's panel: 82
const WHEEL_DOWN_MAX = 120;             // the BACK tile's reach below the hub at the deepest ring, wheelRingR(2)[1]
const DIAL_MARGIN = 12;

// The two marks above the wheel, as offsets above its hub: the flapper pointer
// just past the outermost ring, and — at a leaf, which draws no preview ring —
// the "▲ FIRE" cue above the pointer, so the pointer never covers it. Each
// mark is about 12px tall.
export function wheelTopMarks(outerMost) {
    return { pointerTop: outerMost + 14, cueTop: outerMost + 30 };
}

// The dial the wheel sits on, sized for the wheel as it is drawn: with
// children to preview, the outermost ring is the preview ring and the pointer
// tops it; at a leaf, the FIRE cue tops the active ring.
export function dialRadius(depth, hasKids) {
    const marks = wheelTopMarks(wheelRingR(hasKids ? depth : depth - 1)[1]);
    return (hasKids ? marks.pointerTop : marks.cueTop) + DIAL_MARGIN;
}
export const DIAL_MAX_R = dialRadius(3, false);   // a leaf at the deepest ring: 162

function dockLayout(vp) {
    const { w, h } = vp;
    const cx = w / 2;
    const dock = { x: 0, y: h - vp.dockH, w, h: vp.dockH, rows: vp.dockRows };
    // The wheel's hub never moves as the wheel deepens: far enough in from the
    // right for the biggest dial, low enough that the deepest BACK tile ends
    // just inside the dock.
    const wheel = { cx: w - DOCK_PAD - DIAL_MAX_R, cy: h - DOCK_PAD - WHEEL_DOWN_MAX - 1 };
    let log, barBottom, openerY;
    if (dock.rows === 2) {
        log = { x: DOCK_PAD, y: dock.y + DOCK_PAD, w: w - 2 * DOCK_PAD, h: LOG_H3, lines: 3 };
        const rowTop = log.y + log.h + HUD_GAP;           // the second row: the item bar and the opener
        barBottom = rowTop + BAR_ABOVE;
        openerY = rowTop + (BAR_H - OPENER) / 2;
    } else {
        barBottom = dock.y + (dock.h - BAR_H) / 2 + BAR_ABOVE;
        log = { x: DOCK_PAD, y: dock.y + DOCK_PAD, w: cx - BAR_HALF - HUD_GAP - DOCK_PAD, h: LOG_H3, lines: 3 };
        openerY = dock.y + (dock.h - OPENER) / 2;
    }
    // Under the hub where it fits; otherwise just clear of the item bar.
    const openerX = Math.min(Math.max(wheel.cx - OPENER / 2, cx + BAR_HALF + HUD_GAP), w - DOCK_PAD - OPENER);
    return {
        hp: { x: HUD_M, y: HUD_M },
        buffsRight: w - HUD_M - Math.ceil(PAGE_BUTTONS_CSS * vp.logicalPerCss), buffsTop: HUD_M,
        log, bar: { cx, bottom: barBottom }, wheel, strip: dock.y,
        dock, opener: { x: openerX, y: openerY, w: OPENER, h: OPENER },
        dialRadius,
    };
}

// Which HUD piece an IDLE tap lands on, the opener or the log, or null. One
// function, so main.js routes taps by the rects the renderer draws. (The item
// bar keeps its own chip-level test in main._tapXmbBar.)
export function hitHud(hud, pt, slop = HIT_SLOP) {
    const inR = (r) => r && pt.x >= r.x - slop && pt.x <= r.x + r.w + slop && pt.y >= r.y - slop && pt.y <= r.y + r.h + slop;
    if (inR(hud.opener)) return 'opener';
    if (inR(hud.log)) return 'log';
    return null;
}
```

Change `hudLayout`'s body (after Task 14 it is `return cornersLayout(vp);`) to:

```js
    return vp.dockRows ? dockLayout(vp) : cornersLayout(vp);
```

and in `hudInteractiveRects`, directly after `rects.push({ name: 'xmb', rect: xmbBarPanelRect(3, hud.bar) });`, add:

```js
    if (hud.opener) rects.push({ name: 'opener', rect: hud.opener });
```

In `cornersLayout`'s returned object, change `log, bar: { cx, bottom: barBottom }, wheel, strip: h,` to `log, bar: { cx, bottom: barBottom }, wheel, strip: h, dialRadius,` so every HUD layout can size the wheel's dial (a renderer with no dock, in a test, still draws one).

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test tests/hud-layout.test.js`
Expected: all pass.

Run: `npm test 2>&1 | tail -8` — expected `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add game/layout.js tests/hud-layout.test.js && git commit -m "feat(layout): the dock — log, item bar and opener along the bottom, and the dial the wheel sits on"
```

### Task 17: Draw the dock, with the log and the opener in it

**Files:**
- Modify: `game/main.js` (`_fitCanvas`; the layout import)
- Modify: `game/renderer.js` (new `_drawDock`, `_drawOpener`; `renderFrame`'s HUD calls)

- [ ] **Step 1: The viewport gets the dock**

In `game/main.js`, add `DOCK,` to the `from './layout.js'` import block (for example on the `HIT_SLOP, throwRects,` line, making it `HIT_SLOP, throwRects, DOCK,`). In `_fitCanvas`, replace:

```js
        const vp = computeViewport({ cssW: box.width, cssH: box.height, dpr: window.devicePixelRatio });
```

with:

```js
        const vp = computeViewport({ cssW: box.width, cssH: box.height, dpr: window.devicePixelRatio, dock: DOCK });
```

- [ ] **Step 2: The renderer draws the dock and the opener**

In `game/renderer.js`, add these two methods directly above `_drawHPPanel`:

```js
    // (screen-fill) The dock: the strip along the bottom that the log, the item
    // bar and the wheel's opener sit in. Drawn a little wider and taller than
    // the screen, so only its top edge's chrome shows.
    _drawDock() {
        const dock = this._hud().dock;
        if (!dock) return;
        drawPanelSmall(this.ctx, dock.x - 8, dock.y, dock.w + 16, dock.h + 8, this.uiSheet);
    }

    // The wheel's opener: a ✦ button in the dock, where the dial will rise from.
    // Hidden while the wheel is open; the dial takes its place.
    _drawOpener(game) {
        const o = this._hud().opener;
        if (!o || game.state === 'radial_menu') return;
        drawPanelSmall(this.ctx, o.x, o.y, o.w, o.h, this.uiSheet);
        if (this.font) this.font.drawText(this.ctx, '✦', o.x + o.w / 2, o.y + o.h / 2 - 16, { color: UI.gold, scale: 2.4, align: 'center' });
    }
```

In `renderFrame`, replace:

```js
        this._drawHPPanel(game);
        this._drawBuffBar(game);
        this._drawQuestLog(game);
        this._drawXmbBar(game);
```

with:

```js
        this._drawDock();
        this._drawHPPanel(game);
        this._drawBuffBar(game);
        this._drawQuestLog(game);
        this._drawXmbBar(game);
        this._drawOpener(game);
```

The log already draws three lines (`R.lines` is 3 in the dock) and fits its text to its own width (`maxChars` is computed from `R.w`). The item bar sits at `hud.bar`, and the hint strips rest on `hud.strip`, the dock's top edge.

- [ ] **Step 3: Tests**

Run: `npm test 2>&1 | tail -8` — expected `ℹ fail 0`.

- [ ] **Step 4: Look at it**

Restart the dev server. In a test tab (autosave stubbed, GAME START), at `resize_window {width: 1920, height: 1080}`, then `{width: 3440, height: 1440}`, then `{preset: "mobile"}`, each after a reload:

1. Screenshot. The dock runs along the bottom. The log is on its left with three message lines, the item bar in the middle, the ✦ on the right. On the phone, the log's row sits above the bar-and-✦ row. The world stops at the dock's top edge, and you stand in the middle of what is left.
2. Fill the log with long lines and check they are not cut short on the wide screens:

   ```js
   const g = __game;
   g._logStripMessages = [
       { text: '[Trade: You gave Soap for Rock and the vendor seems pleased with the deal]', category: 'system' },
       { text: '[You shove Violencian so hard they spin around twice and fall over]', category: 'combat' },
       { text: '[Picked up [Soap]]', category: 'pickup' },
   ];
   g._render();
   ```

   Screenshot the log. At 1920×1080, the first line runs to about 55 characters before the `~`; at 3440×1440, all three lines show whole.
3. If the ✦ glyph is visibly off-centre in its button, adjust the `- 16` in `_drawOpener` until it is centred, and note the value you chose.

Reset with `resize_window {preset: "desktop"}`.

- [ ] **Step 5: Commit**

```bash
git add game/main.js game/renderer.js && git commit -m "feat(hud): the dock — the log gets three wide lines, and the wheel's opener sits beside the item bar"
```

### Task 18: The wheel sits on its dial

**Files:**
- Modify: `game/renderer.js` (`_drawWheel`; new `_drawDial`; the layout import)

- [ ] **Step 1: Import the dial helper**

In the renderer's `from './layout.js'` import, change the Task 4 line to:

```js
    xmbBarLayout, hudLayout, throwRects, wheelTopMarks,                      // (XMB) usable-bar geometry; (screen-fill) the HUD, throw targets, the marks above the wheel
```

- [ ] **Step 2: No scrim; the dial instead**

In `_drawWheel`, replace the sunburst's scrim block:

```js
        // ── Sunburst ──
        // (§12.5) When a fight is live, re-skin the backdrop: a red-ward wash + a
        // soft rim vignette. Subtle — wedge colours stay untouched for legibility.
        const combat = isCombatActive(game);
        ctx.save();
        // Lighter scrim — the compact corner wheel doesn't need to black out the
        // scene behind it; keep the world readable while the wheel is open.
        ctx.fillStyle = combat ? 'rgba(38,4,4,0.4)' : 'rgba(0,0,0,0.32)';
        ctx.fillRect(0, 0, vp.w, vp.h);
        if (combat) {
            const S = Math.max(vp.w, vp.h);
            const rg = ctx.createRadialGradient(cx, cy, S * 0.34, cx, cy, S * 0.72);
            rg.addColorStop(0, 'rgba(150,20,20,0)');
            rg.addColorStop(1, 'rgba(140,12,12,0.30)');
            ctx.fillStyle = rg; ctx.fillRect(0, 0, vp.w, vp.h);
        }
        ctx.restore();
```

with:

```js
        // ── Sunburst ──
        // (screen-fill) The wheel sits on its dial, never on the world: there is no
        // full-screen scrim, so the fight stays visible while you choose. In a
        // fight the dial's rim goes red (the old red wash, moved onto the dial).
        const combat = isCombatActive(game);
```

Move the children lookup up. Delete the line `const kids = previewChildren(w);` from step 3 (the preview arc), and add it directly above the scale block, so that part reads:

```js
        const kids = previewChildren(w);   // the highlight's children, if any: they size the dial and fill the preview arc

        // Everything below the wash scales about the centre (the open/drill pop).
        ctx.save();
        if (scale !== 1) { ctx.translate(cx, cy); ctx.scale(scale, scale); ctx.translate(-cx, -cy); }

        // 0) The dial, inside the same transform, so it pops with the wheel.
        this._drawDial(cx, cy, this._hud().dialRadius(depth, kids.length > 0), combat);
```

- [ ] **Step 3: The FIRE cue clears the pointer**

In step 3 of `_drawWheel`, replace:

```js
            this.font.drawText(ctx, '▲ FIRE', cx, cy - activeBand[1] - 16, { color: UI.gold, scale: 1, align: 'center', shadow: '#000' });
```

with:

```js
            // Above the pointer, which sits just past the ring (wheelTopMarks): drawn
            // at the old -16 it lay under the pointer and could not be read.
            this.font.drawText(ctx, '▲ FIRE', cx, cy - wheelTopMarks(outerMost).cueTop, { color: UI.gold, scale: 1, align: 'center', shadow: '#000' });
```

and in step 6, replace:

```js
        ctx.translate(cx, cy - outerMost - 14);            // pivot just outside the outermost element
```

with:

```js
        ctx.translate(cx, cy - wheelTopMarks(outerMost).pointerTop);   // pivot just outside the outermost element
```

- [ ] **Step 4: Draw the dial**

Add this method directly after `_drawWheel`:

```js
    // (screen-fill) The wheel's dial: an opaque disc in the dock's colours for
    // the wheel to draw on, so it reads the same over any ground. A gold rim,
    // red in a fight.
    _drawDial(cx, cy, r, combat) {
        const { ctx } = this;
        ctx.save();
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = '#1c160e'; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = combat ? '#c8443a' : '#8b7340'; ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, r - 5, 0, Math.PI * 2);
        ctx.lineWidth = 1; ctx.strokeStyle = combat ? 'rgba(232,70,47,0.45)' : 'rgba(212,185,106,0.35)'; ctx.stroke();
        ctx.restore();
    }
```

- [ ] **Step 5: Outside the dial closes the wheel**

The spec asks that the dial's taps use the same radius as its drawing. In `game/main.js`, add `previewChildren,` to the `from './wheel-model.js'` import (making its last line `orderedTargetVerbs, isCombatActive, defaultVerb, previewChildren,`). In `_onCanvasPointerDown`, replace:

```js
            const _cull = wheelRingR(this.wheel.path.length)[1] + HIT_SLOP + 12;
```

with:

```js
            // (screen-fill) A tap outside the dial closes the wheel: the radius the
            // dial is drawn at (layout.js dialRadius), plus slop.
            const _cull = this._hud().dialRadius(this.wheel.path.length, previewChildren(this.wheel).length > 0) + HIT_SLOP;
```

(`_tapRadialMenu` still ignores a tap on the dial's empty rim beyond the rings, rather than misfiring a quadrant.)

- [ ] **Step 6: Tests**

Run: `npm test 2>&1 | tail -8` — expected `ℹ fail 0`.

- [ ] **Step 7: Look at it, at every depth**

Restart the dev server. In a test tab at `resize_window {width: 3440, height: 1440}` (autosave stubbed, GAME START):

1. Open the wheel (`__game._openWheel()`). Screenshot: the dial rises out of the dock with the wheel on it. The world is not darkened.
2. Drill: `__game._wheelDrill(); __game._render();` to reach a category, and again to reach a leaf (for example Fight › Melee › Hit). Screenshot each depth. The dial grows with each ring and the wheel stays inside it. At the leaf, "▲ FIRE" sits clear above the ▼ pointer.
3. Start a fight in the Sewer (`await __game._loadMap('sewer-map.json')`, then set a nearby enemy's `state = 'chasing'`) and open the wheel: the dial's rim is red, and the combat banner sits on the dock's top edge.

4. With the wheel open at the root, tap just inside the dial's rim, beyond the rings: the wheel stays open. Tap well outside the dial: it closes.

Reset with `resize_window {preset: "desktop"}`.

- [ ] **Step 8: Commit**

```bash
git add game/renderer.js game/main.js && git commit -m "feat(wheel): the wheel sits on an opaque dial instead of a scrim over the world; FIRE clears the pointer"
```

### Task 19: The dock's ✦ opens the wheel; the page around the canvas catches up

**Files:**
- Modify: `game/main.js` (the layout import; `_onCanvasPointerDown`; `endPress` in the canvas tap binding; the `#action-btn` binding in `init`; `_fitCanvas`)
- Modify: `game/index.html`, `game/style.css`
- Test: `tests/screen-page.test.js` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/screen-page.test.js`:

```js
// screen-page.test.js — the page around the canvas, once the dock holds the
// wheel's opener (plans/screen-fill.md, section 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../game/index.html', import.meta.url), 'utf8');
const css  = readFileSync(new URL('../game/style.css', import.meta.url), 'utf8');
const main = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');

test("the touch ACTION button is gone: the dock's ✦ opens the wheel", () => {
    assert.ok(!/id="action-btn"/.test(html), 'index.html still has #action-btn');
    assert.ok(!/#action-btn/.test(css), 'style.css still styles #action-btn');
    assert.ok(!/action-btn/.test(main), 'main.js still binds #action-btn');
});

test('the version badge lives in the ☰ menu sheet', () => {
    const at = html.indexOf('id="menu-sheet-panel"');
    const panel = html.slice(at, html.indexOf('</div>', at));
    assert.ok(panel.includes('id="version-badge"'), 'the badge is not inside #menu-sheet-panel');
});

test('no band under the canvas is reserved for touch controls', () => {
    assert.ok(!/184px/.test(css), 'style.css still reserves the 184px touch band');
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test tests/screen-page.test.js`
Expected: FAIL on all three.

- [ ] **Step 3: main.js — the ✦ opens the wheel**

Add `hitHud,` to the `from './layout.js'` import (making the line `HIT_SLOP, throwRects, DOCK, hitHud,`).

In `_onCanvasPointerDown`, replace:

```js
        if (this.state === STATE.IDLE && this._pointInRect(pt, this._hud().log, HIT_SLOP)) {
            this._openLogModal();
            return;
        }
```

with:

```js
        // (screen-fill) The dock's pieces, by the rects the renderer drew them at:
        // the ✦ opens the wheel (in HOLD mode, lifting the finger closes it again),
        // and the log opens the full history.
        if (this.state === STATE.IDLE) {
            const hit = hitHud(this._hud(), pt);
            if (hit === 'opener') { this._openerHeld = true; this._wheelOpenerDown(); return; }
            if (hit === 'log') { this._openLogModal(); return; }
        }
```

In the canvas tap binding, replace:

```js
        const endPress = (e) => {
            cancelPress();
```

with:

```js
        const endPress = (e) => {
            cancelPress();
            if (this._openerHeld) { this._openerHeld = false; this._wheelOpenerUp(); }   // (screen-fill) the dock's ✦, released
```

In `init`, delete the whole `#action-btn` block, from `// (sunburst wheel) Touch ACTION button: open the wheel when idle; while` through the closing `}` of the `if (actionBtn) { … releaseWheel … }` block, and put this in its place:

```js
        // (screen-fill) The touch ACTION button retired: the dock's ✦ opens the
        // wheel on every device (_onCanvasPointerDown), and a tap in the wheel's
        // top quadrant drills, as it always has.
```

At the end of `_fitCanvas`, directly before `if (this.state !== STATE.SPLASH) this._render();`, add:

```js
        // The first-run hint is a page element: keep it just above the dock.
        document.documentElement.style.setProperty('--dock-css-h', `${(vp.dockH * vp.scale) / (vp.backingW / vp.cssW)}px`);
```

- [ ] **Step 4: index.html**

Delete:

```html
        <!-- (pointer model) The on-screen d-pad is gone — tap the world to move,
             tap a target to act, long-press for the full options. Only the action-
             wheel opener remains on touch (the ☰ menu is above). -->
        <div id="touch-controls">
            <button id="action-btn" class="tc-btn" aria-label="action wheel">✦</button>
        </div>
```

Delete the line `<div id="version-badge" aria-label="game version"></div>` from where it sits after `#remoticon-btn`, and add it as the last child of `#menu-sheet-panel`, directly after its CLOSE button:

```html
                <button class="menu-item menu-item-close" data-action="close">CLOSE</button>
                <div id="version-badge" aria-label="game version"></div>
```

- [ ] **Step 5: style.css**

In `#game-wrapper`, add a last declaration:

```css
    /* (screen-fill) Keep the canvas clear of a phone's notch and home bar
       (index.html sets viewport-fit=cover). */
    padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
```

Replace the whole `#version-badge` rule (under `/* --- Version badge (always visible) --- */`, and that comment) with:

```css
/* --- Version badge: the ☰ menu's footer. Its old bottom-right corner is
   under the wheel's dial now. --- */
#version-badge {
    margin-top: 10px;
    text-align: center;
    color: #8b7340;
    font-family: 'Courier New', monospace;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1px;
    pointer-events: none;
}
```

Delete the desktop rule `#touch-controls { display: none; }` and its `/* --- Touch controls --- */` heading (keep the `.tc-btn` rules below it: `#remoticon-btn` uses them).

In `#first-run-hint`, replace `left: 50%; bottom: 14%;` with `left: 50%; bottom: calc(var(--dock-css-h, 0px) + 16px);`.

In the `@media (pointer: coarse), (max-width: 700px)` block:

- Replace the `#game-wrapper { … }` rule (with its comments about the sparse dead-band and the 184px reservation) with:

  ```css
      #game-wrapper {
          align-items: center;
      }
  ```

- Delete the `#version-badge { top: 8px; left: 8px; bottom: auto; right: auto; }` rule and its comment.
- Delete the `#touch-controls { … }`, `#action-btn { … }` and `#action-btn:active { … }` rules and their comments.
- Replace the `#menu-btn { … }` rule (the one with `position: fixed;` and `bottom: calc(… + 104px)`) with:

  ```css
      /* (screen-fill) Top-right, as on desktop: the bottom-right corner is the
         dock's now. 44px, Apple's minimum touch target. */
      #menu-btn {
          position: fixed;
          top: max(8px, env(safe-area-inset-top)); bottom: auto;
          right: max(8px, env(safe-area-inset-right)); left: auto;
          width: 44px; height: 44px;
          background: url(assets/ui/ctrl_menu.png) center / contain no-repeat;
          border: none; box-shadow: none; border-radius: 50%;
          color: transparent; font-size: 0;
          filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.6));
          z-index: 21;
      }
  ```

- Replace the `#remoticon-btn { … }` rule in the same block (the one with `bottom: calc(… + 184px)`) and its comment with:

  ```css
      /* The Remoticon opener, under the ☰ (phones have no Tab key). */
      #remoticon-btn {
          position: fixed;
          top: calc(max(8px, env(safe-area-inset-top)) + 52px); bottom: auto;
          right: max(8px, env(safe-area-inset-right)); left: auto;
          width: 44px; height: 44px;
          border-radius: 50%;
          font-size: 22px;
          z-index: 21;
      }
  ```

- [ ] **Step 6: Run the tests**

Run: `node --test tests/screen-page.test.js` — expected all pass.
Run: `npm test 2>&1 | tail -8` — expected `ℹ fail 0`.

- [ ] **Step 7: Check it in the browser**

Restart the dev server. In a test tab at `resize_window {width: 1920, height: 1080}` (autosave stubbed, GAME START), reuse `tapAt` from Task 7, Step 7:

```js
const o = __game.renderer._hud().opener;
tapAt(o.x + o.w / 2, o.y + o.h / 2); await new Promise((r) => setTimeout(r, 200));
const opened = __game.state;
const W = __game.renderer._hud().wheel;
tapAt(W.cx, W.cy); await new Promise((r) => setTimeout(r, 200));   // the hub backs out, closing at the root
JSON.stringify({ opened, afterHub: __game.state })
```

Expected: `opened` is `"radial_menu"` and `afterHub` is `"idle"`. Then open the ☰ menu (click `#menu-btn`): the version number sits at the bottom of the sheet.

Now `resize_window {preset: "mobile"}` and reload: no ✦ button floats over the corner; ☰ and ▤ sit top-right; the dock's two rows sit at the very bottom, clear of the home bar; tapping the dock's ✦ opens the wheel. Reset with `resize_window {preset: "desktop"}`.

- [ ] **Step 8: Commit**

```bash
git add game/main.js game/index.html game/style.css tests/screen-page.test.js && git commit -m "feat(hud): the dock's ✦ opens the wheel everywhere; the touch button, the reserved band and the corner badge go"
```

### Task 20: Stage 3 checkpoint, and hand-off

- [ ] **Step 1: Everything green, and the naming rule**

```bash
npm test 2>&1 | tail -8
git grep -iE 'violence[ _-]+town' -- ':!CLAUDE.md' ':!plans/item-hotbar-xmb-implementation.md'
```

Expected: `ℹ fail 0`, and no output from the grep.

- [ ] **Step 2: Play it**

Restart the dev server. In a test tab (autosave stubbed, GAME START, the rAF shim installed), at `resize_window {width: 3440, height: 1440}`, then `{width: 1920, height: 1080}`, then `{preset: "mobile"}`:

1. Walk around Town and to its edge (forest). Screenshot.
2. Tap a tile to walk there; tap the log for the history; open and close the Remoticon.
3. Start a fight in the Sewer: open the wheel from the ✦, drill to a leaf, fire at an enemy (the reticle, the hit-splat, the combat banner on the dock's edge). Screenshot the wheel on its dial.
4. Open a trade, and a dialogue: both sit in the middle of the screen, and their taps land.

Reset with `resize_window {preset: "desktop"}`.

- [ ] **Step 3: The docs catch up**

In `plans/screen-fill.md`, change the `**Status:**` line to:

```markdown
**Status:** Built on `feature/screen-fill` (stages 1–3, 2026-09); awaiting Caelan's merge call.
```

In `CLAUDE.md`, add this bullet at the end of the `## Recent infrastructure (since v0.8.0)` list:

```markdown
- **The screen is a viewport, not a fixed square** (plans/screen-fill.md). `game/viewport.js`
  (`computeViewport`) sizes the canvas to the window: tile size from one rule (at least 20 tiles on
  the short side, whole-pixel scales only), the player always centred in the world area above the
  dock. `layout.js` `hudLayout(vp)` places every HUD piece; the renderer draws and `main.js`
  hit-tests through both. Menus keep their 608×608 layouts inside the viewport's centred menu box.
  Never assume a fixed 19×19 view or a 608 screen.
```

- [ ] **Step 4: Commit and push**

```bash
git add plans/screen-fill.md CLAUDE.md && git commit -m "plan(screen-fill): built; CLAUDE.md learns the screen is a viewport"
git push
```

- [ ] **Step 5: Hand off**

Use superpowers:finishing-a-development-branch. The merge to `dev` is Caelan's call. Report what changed on screen, the speed numbers from Task 13, and anything left for him: the per-zone fillers are his to change (the table in `plans/screen-fill.md`, and its pin in `tests/tile-coverage.test.js`), and the queued follow-on pieces (fight-area fog, hit-splat art, who gets pulled into a fight) are next.

