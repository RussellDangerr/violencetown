# Fight Fog (F1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fight stops being a spotlight. Everything the fighters can't see sits under fog, and each fight opens with one of three entrances, picked by how it started.

**Architecture:** Two pure modules:
- `game/fight-area.js` says who is in the fight, what they perceive, and how far out each unseen tile is.
- `game/fight-entrance.js` picks the entrance and holds the timeline and the fog's look.

`main.js` checks the fight's start and end on every `_render()` and stamps `game._fightOn`, `_fightStart` and `_fightEndedAt`. The renderer reads only those fields: it draws the fog in the spotlight's old slot and the entrance over the finished frame.

**Tech Stack:** Vanilla ES modules on a 2D canvas, with no build step. `node --test` covers the pure modules, and the renderer and `main.js` through stand-ins. The Claude app's Browser pane checks real window sizes. Headless Chrome plus Python/PIL make the review clips.

**Spec:** `plans/fight-fog.md` (dev, `46e707f`), approved by Caelan 2026-09-14.

---

## How to run this plan

- **Branch:** `feature/fight-fog`, off `dev` (Task 0). Push the branch. The merge to `dev` is Caelan's call.
- **Stages.** Caelan runs builds inline, one task at a time, and says "go" at each checkpoint:
  - **Stage 1, Tasks 1–8:** the two modules, the fog in the game, and a capture page for review clips. Checkpoint: clips of the fog in a real fight.
  - **Stage 2, Tasks 9–10:** the entrance. Checkpoint: a clip of each entrance.
  - **Stage 3, Tasks 11–13:** checks at three sizes, the speed, the write-up, and the push.
- **After any JS edit the browser will load,** restart the dev server: `preview_stop`, then `preview_start {name: "violencetown"}`. The restart also reloads the `seed` tab to the title screen.
  - Test in `tab-1`, never in `seed`.
  - Stub `__game.autosave = () => {}` before GAME START.
  - GAME START races the page load. Wait for `__game.map`, then click `#splash-go` in a loop until `__game.state === 'idle'`.
- **Tests:** `node --test tests/<file>` runs one file; `npm test` runs them all. Call `node` directly: `npx` fetches a different node.
- **Commits:** `git add <named files> && git commit …`.
  - Never `git add -A`, and never pipe `git add`.
  - End every message with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **The lab** (`game/_design-fight-fog.html`, local only) patches `R._drawArena` and reads `_arenaLevel`, and Task 5 removes both. From Task 5 on, the lab only runs from the before-build worktree that Task 12 sets up.
- **Out of scope:** everything under the spec's *Out of scope*. That means no sound, no boss entrance, no hit types, and no change to what enemies perceive or how they chase.

## Files

| File | What changes |
|---|---|
| Create `game/fight-area.js` | `FIGHT_MARGIN`, `fighters(enemies)`, `fightArea(map, fighters, bounds)`, `areaAt(area, x, y)` |
| Create `game/fight-entrance.js` | The timeline and look constants, `ENTRANCES`, `fightStartKind`, `entranceFor`, `entranceAt`, `fogReveal`, `fogDepth`, `fogOut`, `fightFxActive`, `tileJitter` |
| Modify `game/renderer.js` | Imports. The fog takes `_drawArena`'s slot in `renderFrame`, and the entrance draws last. New `dropFightFog`, `_offscreen`, `_fightAreaFor`, `_drawFightFog`, `_buildFogMask`. The combat vignette goes, and the threat field stands down in fights. `bodyOnly` on `_drawEnemySprite` and `_drawPlayerSprite`. New `_drawEntrance`, `_drawImpact`, `_silhouettes` |
| Modify `game/main.js` | Imports. `_render` calls a new `_trackFight`. `combatAttack` stamps `_struckAt`. `_loadMap` drops the fog. `_hasActiveEffects` swaps the arena ease for `fightFxActive` |
| Create `tests/fight-area.test.js` | Tasks 1–2 |
| Create `tests/fight-entrance.test.js` | Tasks 3–4 |
| Create `tests/fight-fog-render.test.js` | Tasks 5, 6, 9 and 10 |
| Create `tests/fight-start.test.js` | Task 7 |
| Modify `CLAUDE.md`, `plans/fight-fog.md` | Task 13 |
| Local only, never committed | `game/_design-fight-capture.html` (gitignored under `game/_design-*.html`); `fight-capture.js` and `make_fight_gif.py` in the session scratchpad |

---

## Task 0: Preflight

- [ ] **Step 1: Branch from a clean, current dev**

```bash
cd C:/Code/violencetown && git status --short && git checkout dev && git pull --ff-only && git checkout -b feature/fight-fog
```

Expected: nothing from `git status --short`, then `Switched to a new branch 'feature/fight-fog'`.

- [ ] **Step 2: Check unmerged branches for overlap**

```bash
cd C:/Code/violencetown && git branch --no-merged dev
```

Expected: `feature/diagonal-prototype` and `plan`, both known. The June prototype is Caelan's to leave alone, and `plan` is the parking branch. If anything else appears, run `git diff dev <branch> --stat`. Flag any overlap with `game/main.js` or `game/renderer.js` to Caelan before Task 5.

- [ ] **Step 3: Record the test baseline**

```bash
cd C:/Code/violencetown && npm test 2>&1 | tail -8
```

Expected: `# fail 0`. Note the `# pass` count; each task below adds to it.

---

## Task 1: Who is in the fight (`fighters`)

**Files:** Create `game/fight-area.js`, `tests/fight-area.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/fight-area.test.js`:

```js
// fight-area.test.js — who is in a fight, and what they can see (plans/fight-fog.md §1).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fighters } from '../game/fight-area.js';

const alive = () => ({ isAlive: () => true });
const dead = () => ({ isAlive: () => false });
// An enemy at (10,10) facing south, with sight 8.
const foe = (state, over = {}) => ({ state, entity: alive(), sightRange: 8, x: 10, y: 10, _lastDx: 0, _lastDy: 1, ...over });

describe('fighters', () => {
    test('an enemy hunting you is in the fight, chasing or searching', () => {
        assert.equal(fighters([foe('chasing')]).length, 1);
        assert.equal(fighters([foe('searching')]).length, 1);
    });

    test('nobody calm, suspicious or walking home is', () => {
        for (const s of ['idle', 'suspicious', 'returning', undefined]) {
            assert.equal(fighters([foe(s)]).length, 0, `${s} should not be a fighter`);
        }
    });

    test('nor the dead, the ambient, allies or the eyeless', () => {
        assert.equal(fighters([foe('chasing', { entity: dead() })]).length, 0);
        assert.equal(fighters([foe('chasing', { ambient: true })]).length, 0);
        assert.equal(fighters([foe('chasing', { _ally: true })]).length, 0);
        assert.equal(fighters([foe('chasing', { sightRange: 0 })]).length, 0);
    });

    test('no enemies at all is an empty fight, not a crash', () => {
        assert.deepEqual(fighters(undefined), []);
        assert.deepEqual(fighters([null]), []);
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test tests/fight-area.test.js`

Expected: FAIL, `Cannot find module` … `game/fight-area.js`.

- [ ] **Step 3: Write the module**

Create `game/fight-area.js`:

```js
// fight-area.js — who is in a fight, and what they can see (plans/fight-fog.md §1).
//
// A fight's area is every tile at least one fighter perceives: the same
// perceives() the chase AI and the threat overlay ask, so standing outside it
// genuinely means none of them can see you there. The renderer draws the fog
// from it; F3 (who gets pulled into a fight) will read it too.
//
// Pure: game data in, numbers out. Node-testable like perception.js.

import { isHunting } from './ai.js';

// How many tiles past the view's edge the area reaches, so the fog's blur and
// a step's scroll never show where it stops.
export const FIGHT_MARGIN = 3;

// The enemies in the fight: the ones isCombatActive counts (alive, not
// ambient, hunting you), less allies and anyone without eyes — the threat
// overlay's watcher filter. A fight is on while this is non-empty.
export function fighters(enemies) {
    return (enemies || []).filter(e =>
        !!e && !e.ambient && !e._ally && isHunting(e)
        && !!e.entity?.isAlive?.() && (e.sightRange || 0) > 0);
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `node --test tests/fight-area.test.js`

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
cd C:/Code/violencetown && git add game/fight-area.js tests/fight-area.test.js && git commit -F - <<'EOF'
feat(fight-fog): fight-area.js — who is in a fight

The enemies isCombatActive counts (alive, not ambient, hunting), less allies
and anyone without eyes: the threat overlay's watcher filter. A fight is on
while there is at least one.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## Task 2: What they can see, and how far out the rest is (`fightArea`)

**Files:** Modify `game/fight-area.js`, `tests/fight-area.test.js`

- [ ] **Step 1: Write the failing tests**

In `tests/fight-area.test.js`, change the import line to:

```js
import { fighters, fightArea, areaAt } from '../game/fight-area.js';
```

Then append:

```js
// Open floor everywhere, or a '#' grid (as tests/perception.test.js builds them).
const openMap = () => ({ isWalkable: () => true });
function gridMap(rows) {
    const H = rows.length, W = rows[0].length;
    return { isWalkable: (x, y) => x >= 0 && y >= 0 && x < W && y < H && rows[y][x] !== '#' };
}
const around = (x, y, r) => ({ x0: x - r, y0: y - r, x1: x + r, y1: y + r });
const seen = (area, x, y) => areaAt(area, x, y).seen;

describe('fightArea', () => {
    test('the three tiles behind a fighter are fog; its own tile and the ground ahead are not', () => {
        const a = fightArea(openMap(), [foe('chasing')], around(10, 10, 12));   // at (10,10), facing south
        for (const [x, y] of [[9, 9], [10, 9], [11, 9]]) assert.equal(seen(a, x, y), false, `(${x},${y}) is behind it`);
        assert.equal(seen(a, 10, 10), true, 'a fighter never stands in its own fog');
        assert.equal(seen(a, 10, 14), true, 'straight ahead, in range');
    });

    test('PERIPHERAL counts as seen', () => {
        const a = fightArea(openMap(), [foe('chasing')], around(10, 10, 12));
        assert.equal(seen(a, 14, 10), true, 'the flank, within ceil(8 / 2)');
        assert.equal(seen(a, 15, 10), false, 'the flank, beyond it');
    });

    test('a wall casts fog', () => {
        const rows = ['.....', '.....', '..#..', '.....', '.....'];
        const a = fightArea(gridMap(rows), [foe('chasing', { x: 2, y: 0 })], { x0: 0, y0: 0, x1: 4, y1: 4 });
        assert.equal(seen(a, 2, 1), true);
        assert.equal(seen(a, 2, 3), false, 'behind the wall');
    });

    test("two fighters' sight combines", () => {
        const south = foe('chasing');
        const north = foe('chasing', { x: 10, y: 6, _lastDx: 0, _lastDy: -1 });
        const alone = fightArea(openMap(), [south], around(10, 10, 12));
        const both = fightArea(openMap(), [south, north], around(10, 10, 12));
        assert.equal(seen(alone, 10, 3), false, 'behind the first one');
        assert.equal(seen(both, 10, 3), true, 'the second one sees it');
    });

    test('night shrinks the area', () => {
        const day = fightArea(openMap(), [foe('chasing')], around(10, 10, 12));
        const night = fightArea(openMap(), [foe('chasing', { _nightLevel: 1 })], around(10, 10, 12));
        assert.equal(seen(day, 10, 17), true, 'sight 8 by day');
        assert.equal(seen(night, 10, 17), false, '40% less at full dark: sight 5');
        assert.equal(seen(night, 10, 15), true);
    });

    test('each fogged tile knows its Chebyshev steps from their sight', () => {
        const a = fightArea(openMap(), [foe('chasing')], around(10, 10, 12));
        assert.equal(areaAt(a, 10, 10).dist, 0);
        assert.equal(areaAt(a, 10, 9).dist, 1, 'right behind it');
        assert.equal(areaAt(a, 10, 7).dist, 3);
        assert.equal(areaAt(a, 4, 7).dist, 3, 'three king-moves from (6,10), though five by Manhattan');
    });

    test('it is kept in world coordinates', () => {
        const b = around(10, 10, 12);
        const a = fightArea(openMap(), [foe('chasing')], b);
        assert.deepEqual([a.x0, a.y0, a.w, a.h], [b.x0, b.y0, 25, 25]);
        assert.equal(areaAt(a, 100, 100).inside, false);
    });

    test('with nobody to see, nothing is seen and nothing has a distance', () => {
        const a = fightArea(openMap(), [], around(10, 10, 2));
        assert.equal(areaAt(a, 10, 10).seen, false);
        assert.equal(areaAt(a, 10, 10).dist, -1);
    });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test tests/fight-area.test.js`

Expected: FAIL, `does not provide an export named 'areaAt'`.

- [ ] **Step 3: Write `fightArea` and `areaAt`**

In `game/fight-area.js`, add the perception import under the existing one:

```js
import { isHunting } from './ai.js';
import { perceives, VERDICT } from './perception.js';
```

Then append:

```js
// The area over `bounds` ({ x0, y0, x1, y1 }, inclusive, world tiles). Returns
// { x0, y0, w, h, seen, dist }, indexed k = (y - y0) * w + (x - x0):
//   seen[k] is 1 where a fighter perceives the tile (DIRECT or PERIPHERAL);
//   dist[k] is 0 there, the Chebyshev steps to the nearest seen tile
//   elsewhere, and -1 everywhere when nothing in bounds is seen.
export function fightArea(map, fs, bounds) {
    const { x0, y0 } = bounds;
    const w = bounds.x1 - x0 + 1, h = bounds.y1 - y0 + 1;
    const seen = new Uint8Array(w * h);
    const dist = new Int16Array(w * h).fill(-1);
    const queue = [];
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const tx = x0 + x, ty = y0 + y;
            if (fs.some(f => perceives(map, f, tx, ty) !== VERDICT.NONE)) {
                const k = y * w + x;
                seen[k] = 1; dist[k] = 0; queue.push(k);
            }
        }
    }
    // Breadth-first outward from what they see; eight-way steps make it Chebyshev.
    for (let head = 0; head < queue.length; head++) {
        const k = queue[head], x = k % w, y = (k - x) / w;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                const nk = ny * w + nx;
                if (dist[nk] !== -1) continue;
                dist[nk] = dist[k] + 1;
                queue.push(nk);
            }
        }
    }
    return { x0, y0, w, h, seen, dist };
}

// One tile of an area, in world coordinates. Outside it reads as unseen, with
// no distance.
export function areaAt(area, x, y) {
    const i = x - area.x0, j = y - area.y0;
    if (i < 0 || j < 0 || i >= area.w || j >= area.h) return { inside: false, seen: false, dist: -1 };
    const k = j * area.w + i;
    return { inside: true, seen: area.seen[k] === 1, dist: area.dist[k] };
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `node --test tests/fight-area.test.js`

Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
cd C:/Code/violencetown && git add game/fight-area.js tests/fight-area.test.js && git commit -F - <<'EOF'
feat(fight-fog): fightArea — what the fighters can see, and how far out the rest is

Every tile a fighter perceives (DIRECT or PERIPHERAL, the AI's own answer),
and each unseen tile's Chebyshev steps from their sight, in world
coordinates so a fading fog stays on the ground.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## Task 3: Which entrance (`fightStartKind`, `entranceFor`)

**Files:** Create `game/fight-entrance.js`, `tests/fight-entrance.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/fight-entrance.test.js`:

```js
// fight-entrance.test.js — how a fight arrives (plans/fight-fog.md §2).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ENTRANCES, NO_REPLAY_MS, fightStartKind, entranceFor } from '../game/fight-entrance.js';

const f = (state, over = {}) => ({ state, ...over });

describe('how the fight started', () => {
    test('you struck first: you hit one of them this turn', () => {
        assert.equal(fightStartKind([f('chasing', { _struckAt: 7 })], 7), 'struck');
    });
    test('or the turn before, since a blow lands before the world beat that turns them', () => {
        assert.equal(fightStartKind([f('searching', { _struckAt: 6 })], 7), 'struck');
    });
    test('an older hit does not count', () => {
        assert.equal(fightStartKind([f('chasing', { _struckAt: 5 })], 7), 'spotted');
    });
    test('they spotted you: someone is chasing and you hit nobody', () => {
        assert.equal(fightStartKind([f('searching'), f('chasing')], 7), 'spotted');
    });
    test('it grew out of a search: they are only searching', () => {
        assert.equal(fightStartKind([f('searching'), f('searching')], 7), 'search');
    });
    test('a first strike outranks a sighting', () => {
        assert.equal(fightStartKind([f('chasing'), f('chasing', { _struckAt: 7 })], 7), 'struck');
    });
});

describe('which entrance', () => {
    test('each start gets its own', () => {
        assert.equal(entranceFor('struck', null, 10_000), ENTRANCES.struck);
        assert.equal(entranceFor('spotted', null, 10_000), ENTRANCES.spotted);
        assert.equal(entranceFor('search', null, 10_000), ENTRANCES.search);
    });
    test('the three differ in look, punch and how the fog arrives', () => {
        const { struck, spotted, search } = ENTRANCES;
        assert.deepEqual([struck.impact, spotted.impact, search.impact], ['bw', 'redblack', 'flash']);
        assert.deepEqual([struck.zoom, spotted.zoom, search.zoom], [1.08, 1.16, 1]);
        assert.deepEqual([struck.roll, spotted.roll, search.roll], ['out', 'in', 'out']);
        assert.deepEqual([struck.silhouette, spotted.silhouette, search.silhouette], [2.5, 4, 0]);
    });
    test('no second entrance when the last fight ended under 3 s ago', () => {
        assert.equal(entranceFor('spotted', 10_000, 10_000 + NO_REPLAY_MS - 1), null);
        assert.equal(entranceFor('spotted', 10_000, 10_000 + NO_REPLAY_MS), ENTRANCES.spotted);
    });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test tests/fight-entrance.test.js`

Expected: FAIL, `Cannot find module` … `game/fight-entrance.js`.

- [ ] **Step 3: Write the module**

Create `game/fight-entrance.js`:

```js
// fight-entrance.js — how a fight arrives, and how its fog rolls in and out
// (plans/fight-fog.md §2).
//
// Three entrances, picked by how the fight started — you struck first, they
// spotted you, or it grew out of a search — each an impact frame, a zoom punch
// and a way for the fog to arrive. This module is the choice and the timeline;
// the renderer draws them. Pure: numbers in, numbers out.

// ── The timeline, in ms from the moment the fight began ─────────────────────
export const IMPACT_MS          = 110;    // the impact frame
export const ZOOM_IN_MS         = 80;     // the punch lands...
export const ZOOM_OUT_MS        = 280;    // ...and has settled by 360
export const ROLL_STEP_MS       = 34;     // per step of order, as the smoke rolls
export const ROLL_JITTER_MS     = 70;     // each tile's own scatter, so the edge reads as smoke
export const TILE_FADE_MS       = 150;    // each tile's own fade-in
export const ROLL_LAST_START_MS = 820;    // a big screen's step shrinks so its last tile starts by here
export const FOG_IN_MS          = 1000;   // all of the above is done inside this
export const QUIET_FADE_MS      = 300;    // reduce motion, or a fight resumed inside NO_REPLAY_MS
export const FOG_OUT_MS         = 520;    // the fog clearing when the fight ends
export const NO_REPLAY_MS       = 3000;   // a fight that restarts this soon gets no second entrance

// ── The fog's look ──────────────────────────────────────────────────────────
export const FOG_TINT       = 'rgb(58,62,84)';   // the cool dark the world multiplies toward
export const FOG_DENSITY    = 0.62;              // its strength at full depth
export const FOG_NEAR       = 0.4;               // depth at the edge of their sight...
export const FOG_FAR_TILES  = 7;                 // ...reaching full this many tiles further out
export const FOG_BLUR_TILES = 1.2;               // how soft its edge is

// ── The three entrances ─────────────────────────────────────────────────────
// impact: the impact frame's look. silhouette: how far you and the fighters
// are blown up about the fight's middle (0 = no silhouettes). zoom: the
// punch's peak. roll: whether the fog rolls out from their sight or closes in
// from the screen's edges.
export const ENTRANCES = Object.freeze({
    struck:  Object.freeze({ kind: 'struck',  impact: 'bw',       silhouette: 2.5, zoom: 1.08, roll: 'out' }),
    spotted: Object.freeze({ kind: 'spotted', impact: 'redblack', silhouette: 4,   zoom: 1.16, roll: 'in' }),
    search:  Object.freeze({ kind: 'search',  impact: 'flash',    silhouette: 0,   zoom: 1,    roll: 'out' }),
});

// How the fight started, read off its fighters at the moment it began. You
// struck first if you hit one of them this turn or the last: a blow lands
// before the world beat that turns them (main.js combatAttack stamps
// _struckAt). Otherwise they spotted you if any is chasing; otherwise it grew
// out of a search.
export function fightStartKind(fs, turn) {
    if (fs.some(f => f._struckAt != null && f._struckAt >= turn - 1)) return 'struck';
    if (fs.some(f => f.state === 'chasing')) return 'spotted';
    return 'search';
}

// The entrance a fight beginning at `now` gets, or none when the last fight
// ended under NO_REPLAY_MS ago, as when an enemy loses you and finds you again.
export function entranceFor(kind, lastEndedAt, now) {
    if (lastEndedAt != null && now - lastEndedAt < NO_REPLAY_MS) return null;
    return ENTRANCES[kind] ?? null;
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `node --test tests/fight-entrance.test.js`

Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
cd C:/Code/violencetown && git add game/fight-entrance.js tests/fight-entrance.test.js && git commit -F - <<'EOF'
feat(fight-fog): fight-entrance.js — which entrance a fight gets

Struck first (you hit a fighter this turn or the last), spotted (someone is
chasing), or grown out of a search, each with its own entrance; none when
the last fight ended under 3 s ago.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## Task 4: The timeline and the fog's depth

**Files:** Modify `game/fight-entrance.js`, `tests/fight-entrance.test.js`

- [ ] **Step 1: Write the failing tests**

In `tests/fight-entrance.test.js`, add a second import line under the first:

```js
import { IMPACT_MS, ZOOM_IN_MS, ZOOM_OUT_MS, TILE_FADE_MS, FOG_IN_MS, QUIET_FADE_MS, FOG_OUT_MS, FOG_NEAR,
         entranceAt, fogReveal, fogDepth, fogOut, fightFxActive, tileJitter } from '../game/fight-entrance.js';
```

Then append:

```js
describe('the entrance timeline', () => {
    test('the impact frame holds for IMPACT_MS', () => {
        assert.equal(entranceAt(ENTRANCES.struck, 0).impact, true);
        assert.equal(entranceAt(ENTRANCES.struck, IMPACT_MS - 1).impact, true);
        assert.equal(entranceAt(ENTRANCES.struck, IMPACT_MS).impact, false);
    });
    test('the zoom punches to its peak, then settles by 360 ms', () => {
        assert.equal(entranceAt(ENTRANCES.spotted, 0).zoom, 1);
        assert.ok(Math.abs(entranceAt(ENTRANCES.spotted, ZOOM_IN_MS).zoom - 1.16) < 1e-9);
        assert.equal(entranceAt(ENTRANCES.spotted, ZOOM_IN_MS + ZOOM_OUT_MS).zoom, 1);
        assert.ok(entranceAt(ENTRANCES.struck, ZOOM_IN_MS).zoom < entranceAt(ENTRANCES.spotted, ZOOM_IN_MS).zoom);
    });
    test('the white flash has no zoom', () => {
        for (const ms of [0, 40, 80, 200]) assert.equal(entranceAt(ENTRANCES.search, ms).zoom, 1);
    });
    test('reduce motion drops the impact and the zoom', () => {
        const at = entranceAt(ENTRANCES.spotted, 50, { reduceMotion: true });
        assert.equal(at.impact, false);
        assert.equal(at.zoom, 1);
    });
    test('no entrance draws nothing', () => {
        assert.deepEqual(entranceAt(null, 50), { impact: false, impactT: 1, zoom: 1 });
    });
});

describe('the fog rolling in', () => {
    test('a tile waits out the impact, then fades in over TILE_FADE_MS', () => {
        assert.equal(fogReveal(0, 10, IMPACT_MS, 0), 0);
        assert.equal(fogReveal(0, 10, IMPACT_MS + TILE_FADE_MS / 2, 0), 0.5);
        assert.equal(fogReveal(0, 10, IMPACT_MS + TILE_FADE_MS, 0), 1);
    });
    test('further out arrives later, 34 ms a step', () => {
        assert.equal(fogReveal(3, 10, IMPACT_MS + 3 * 34, 0), 0);
        assert.equal(fogReveal(3, 10, IMPACT_MS + 3 * 34 + TILE_FADE_MS, 0), 1);
    });
    test('on a screen too big for 34 ms steps, the last tile is still in inside a second', () => {
        for (const maxOrder of [10, 27, 60]) {
            assert.equal(fogReveal(maxOrder, maxOrder, FOG_IN_MS - 1, 0.999), 1, `maxOrder ${maxOrder}`);
        }
    });
    test('quiet fades every tile together over 300 ms', () => {
        assert.equal(fogReveal(0, 40, QUIET_FADE_MS / 2, 0.9, { quiet: true }), 0.5);
        assert.equal(fogReveal(40, 40, QUIET_FADE_MS / 2, 0, { quiet: true }), 0.5);
        assert.equal(fogReveal(40, 40, QUIET_FADE_MS, 0, { quiet: true }), 1);
    });
});

describe('how deep the fog lies', () => {
    test('none on what they see', () => assert.equal(fogDepth(0), 0));
    test('light at the edge of their sight, full seven tiles further out', () => {
        assert.equal(fogDepth(1), FOG_NEAR);
        assert.ok(Math.abs(fogDepth(8) - 1) < 1e-12);
        assert.ok(Math.abs(fogDepth(30) - 1) < 1e-12);
        assert.ok(fogDepth(4) > fogDepth(2));
    });
});

describe('the fog clearing', () => {
    test('full when the fight ends, gone FOG_OUT_MS later', () => {
        assert.equal(fogOut(0), 1);
        assert.equal(fogOut(FOG_OUT_MS), 0);
        assert.ok(fogOut(FOG_OUT_MS / 4) > fogOut(FOG_OUT_MS / 2));
    });
});

describe('keeping the render loop alive', () => {
    test('through the arrival', () => {
        assert.equal(fightFxActive(true, { at: 1000 }, null, 1000 + FOG_IN_MS - 1), true);
        assert.equal(fightFxActive(true, { at: 1000 }, null, 1000 + FOG_IN_MS), false);
    });
    test('through the clearing', () => {
        assert.equal(fightFxActive(false, { at: 0 }, 5000, 5000 + FOG_OUT_MS - 1), true);
        assert.equal(fightFxActive(false, { at: 0 }, 5000, 5000 + FOG_OUT_MS), false);
    });
    test('and not before any fight', () => {
        assert.equal(fightFxActive(false, null, null, 5000), false);
    });
});

describe('the smoke scatter', () => {
    test('is in 0..1 and the same every frame', () => {
        for (const [x, y] of [[0, 0], [3, -7], [120, 44]]) {
            const j = tileJitter(x, y);
            assert.ok(j >= 0 && j < 1);
            assert.equal(tileJitter(x, y), j);
        }
        assert.notEqual(tileJitter(1, 0), tileJitter(0, 1));
    });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test tests/fight-entrance.test.js`

Expected: FAIL, `does not provide an export named 'entranceAt'`.

- [ ] **Step 3: Write the timeline**

Append to `game/fight-entrance.js`:

```js
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
const easeInOut = (t) => { t = clamp01(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };

// What `ms` into an entrance draws: whether the impact frame is up (and how
// far through it), and the zoom factor. Reduce motion drops both.
export function entranceAt(entrance, ms, { reduceMotion = false } = {}) {
    if (!entrance || reduceMotion || !(ms >= 0)) return { impact: false, impactT: 1, zoom: 1 };
    const lift = entrance.zoom - 1;
    let zoom = 1;
    if (lift > 0 && ms < ZOOM_IN_MS) zoom = 1 + lift * easeOut(ms / ZOOM_IN_MS);
    else if (lift > 0 && ms < ZOOM_IN_MS + ZOOM_OUT_MS) zoom = 1 + lift * (1 - easeInOut((ms - ZOOM_IN_MS) / ZOOM_OUT_MS));
    return { impact: ms < IMPACT_MS, impactT: clamp01(ms / IMPACT_MS), zoom };
}

// How far one fogged tile has faded in, 0..1, `ms` into the fight. `order` is
// its place in the roll (steps from their sight when rolling out, from the
// screen's edge when closing in), `maxOrder` the largest in play, `jitter` its
// own 0..1 scatter. Quiet (reduce motion, or no entrance) fades every tile
// together.
export function fogReveal(order, maxOrder, ms, jitter, { quiet = false } = {}) {
    if (quiet) return clamp01(ms / QUIET_FADE_MS);
    const room = ROLL_LAST_START_MS - IMPACT_MS - ROLL_JITTER_MS;
    const step = maxOrder > 0 ? Math.min(ROLL_STEP_MS, room / maxOrder) : ROLL_STEP_MS;
    const start = IMPACT_MS + order * step + jitter * ROLL_JITTER_MS;
    return clamp01((ms - start) / TILE_FADE_MS);
}

// How deep the fog lies on a tile `dist` steps from their sight (0 = seen).
export function fogDepth(dist) {
    if (!(dist > 0)) return 0;
    return FOG_NEAR + (1 - FOG_NEAR) * Math.min(1, (dist - 1) / FOG_FAR_TILES);
}

// The fog's strength `ms` after the fight ended: 1, easing to 0 by FOG_OUT_MS.
export function fogOut(ms) {
    return 1 - easeInOut(ms / FOG_OUT_MS);
}

// Whether the fight's fog or entrance is still moving. main.js keeps the
// render loop alive while it is.
export function fightFxActive(on, start, endedAt, now) {
    if (on) return !!start && now - start.at < FOG_IN_MS;
    return endedAt != null && now - endedAt < FOG_OUT_MS;
}

// A tile's own 0..1 scatter, the same every frame.
export function tileJitter(x, y) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `node --test tests/fight-entrance.test.js`

Expected: PASS, 25 tests.

- [ ] **Step 5: Commit**

```bash
cd C:/Code/violencetown && git add game/fight-entrance.js tests/fight-entrance.test.js && git commit -F - <<'EOF'
feat(fight-fog): the entrance's timeline and the fog's depth

The impact frame, the zoom punch, each tile's place in the roll (the step
shrinks on a big screen so the roll always ends inside a second), the depth
from 0.4 to full over seven tiles, the fade out, and when the render loop
must keep running.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## Task 5: The fog replaces the spotlight

**Files:** Modify `game/renderer.js`. Create `tests/fight-fog-render.test.js`.

- [ ] **Step 1: Write the failing tests**

Create `tests/fight-fog-render.test.js`. The header holds every helper later tasks use as well:

```js
// fight-fog-render.test.js — what the renderer draws for a fight (plans/fight-fog.md).
//
// renderer.js imports cleanly under node (tests/tile-render.test.js), so a
// recording canvas stands in for the real one: every call lands in a list with
// the paint state it was made under, and offscreen canvases come from a stub
// _offscreen. No DOM, no screenshot.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Renderer } from '../game/renderer.js';
import { TILE_PX } from '../game/data.js';
import { ENTRANCES, FOG_DENSITY, FOG_OUT_MS, IMPACT_MS, ZOOM_IN_MS, ZOOM_OUT_MS } from '../game/fight-entrance.js';
import * as Settings from '../game/settings.js';

// settings.js persists to localStorage, which node lacks.
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const rendererSrc = readFileSync(fileURLToPath(new URL('../game/renderer.js', import.meta.url)), 'utf8');
const renderFrameBody = (() => {
    const at = rendererSrc.indexOf('    renderFrame(game) {');
    return rendererSrc.slice(at, rendererSrc.indexOf('\n    }\n', at));
})();

// A 2D context that records: each method call lands in `calls` with the alpha,
// composite op and fill style it was made under.
function recorder() {
    const calls = [];
    const state = { globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: null, strokeStyle: null, filter: 'none' };
    const ctx = new Proxy(state, {
        get(t, k) {
            if (k in t) return t[k];
            if (k === 'createImageData') return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
            return (...a) => {
                calls.push({ fn: k, a, alpha: t.globalAlpha, op: t.globalCompositeOperation, fill: t.fillStyle });
                if (k === 'createRadialGradient' || k === 'createLinearGradient') return { addColorStop() {} };
            };
        },
        set(t, k, v) { t[k] = v; return true; },
    });
    return { ctx, calls };
}

// A renderer with a recording screen and recording offscreen canvases.
function rig(over = {}) {
    const main = recorder(), off = {};
    const r = Object.assign(Object.create(Renderer.prototype), {
        ctx: main.ctx, canvas: { width: 1920, height: 1080 },
        _scrollX: 0, _scrollY: 0, _shakeX: 0, _shakeY: 0, zone: 'TOWN',
        sprites: new Proxy({}, { get: () => ({ loaded: true, drawFrame: () => true }) }),
        _offscreen(name, w, h) {
            const c = (off[name] ??= { rec: recorder(), width: 0, height: 0, getContext() { return this.rec.ctx; } });
            c.width = w; c.height = h;
            return c;
        },
        ...over,
    });
    return { r, main, off };
}

const openMap = () => ({ isWalkable: () => true, isInBounds: () => true, zoneName: 'TOWN' });
// A fighter two tiles east of you, facing you.
const fighter = (over = {}) => ({ state: 'chasing', type: 'Rat', entity: { isAlive: () => true, hp: 10, maxHp: 10 },
    sightRange: 8, x: 12, y: 10, _lastDx: -1, _lastDy: 0, ...over });
function fightGame(over = {}) {
    return {
        map: openMap(), playerX: 10, playerY: 10, turn: 3, enemies: [fighter()], facing: 'down', _idleTick: 0,
        _fightOn: true, _fightStart: { kind: 'spotted', at: performance.now() - 5000, entrance: ENTRANCES.spotted },
        _fightEndedAt: null, ...over,
    };
}
const draws = (rec) => rec.calls.filter(c => c.fn === 'drawImage');

describe('the fight fog', () => {
    test('a fight lays one soft shadow, multiplied, at full density once it has rolled in', () => {
        const { r, main } = rig();
        r._drawFightFog(fightGame());
        const d = draws(main);
        assert.equal(d.length, 1);
        assert.equal(d[0].op, 'multiply');
        assert.ok(Math.abs(d[0].alpha - FOG_DENSITY) < 1e-9, `alpha ${d[0].alpha}`);
    });

    test("the mask is dark where they can't see and clear where they can", () => {
        const { r, off } = rig();
        r._drawFightFog(fightGame());
        const put = off.fogMask.rec.calls.find(c => c.fn === 'putImageData');
        const { area } = r._fog;
        const alphaAt = (x, y) => put.a[0].data[((y - area.y0) * area.w + (x - area.x0)) * 4 + 3];
        assert.equal(alphaAt(12, 10), 0, "the fighter's own tile");
        assert.equal(alphaAt(10, 10), 0, 'you, in front of it');
        assert.ok(alphaAt(14, 10) > 0, 'behind it');
    });

    test('the area is only recomputed when something it reads changes', () => {
        const { r } = rig();
        const g = fightGame();
        r._drawFightFog(g);
        const first = r._fog;
        r._drawFightFog(g);
        assert.equal(r._fog, first, 'nothing moved');
        g.enemies[0]._lastDx = 1;                                  // it turns round
        r._drawFightFog(g);
        assert.notEqual(r._fog, first);
    });

    test('while the fog rolls in the mask is rebuilt every frame; once it is in, never', () => {
        const { r, off } = rig();
        const g = fightGame({ _fightStart: { kind: 'spotted', at: performance.now() - 200, entrance: ENTRANCES.spotted } });
        r._drawFightFog(g); r._drawFightFog(g);
        const builds = () => off.fogMask.rec.calls.filter(c => c.fn === 'putImageData').length;
        assert.equal(builds(), 2);
        g._fightStart.at = performance.now() - 5000;
        r._drawFightFog(g); r._drawFightFog(g);
        assert.equal(builds(), 3, 'one settled build, then none');
    });

    test('the Wilderness keeps its own blackout', () => {
        const { r, main } = rig({ zone: 'WILDERNESS' });
        r._drawFightFog(fightGame());
        assert.equal(draws(main).length, 0);
    });

    test('when the fight ends the fog fades, then lets go of the area', () => {
        const { r, main } = rig();
        const g = fightGame();
        r._drawFightFog(g);
        Object.assign(g, { _fightOn: false, _fightEndedAt: performance.now() - FOG_OUT_MS / 2 });
        r._drawFightFog(g);
        const fading = draws(main)[1];
        assert.ok(fading.alpha > 0 && fading.alpha < FOG_DENSITY, `alpha ${fading.alpha}`);
        g._fightEndedAt = performance.now() - FOG_OUT_MS - 1;
        r._drawFightFog(g);
        assert.equal(draws(main).length, 2, 'no third draw');
        assert.equal(r._fog, null);
    });

    test('while it fades it stays on the ground, not on you', () => {
        const { r, main } = rig();
        const g = fightGame();
        r._drawFightFog(g);
        Object.assign(g, { _fightOn: false, _fightEndedAt: performance.now() - 50 });
        r._drawFightFog(g);
        g.playerX += 1;                                            // you step east
        r._drawFightFog(g);
        const [, before, after] = draws(main);
        assert.equal(after.a[1], before.a[1] - TILE_PX, 'the shadow slides one tile west on screen');
    });

    test('a zone change, a death or a restart drops it at once', () => {
        const { r, main } = rig();
        const g = fightGame();
        r._drawFightFog(g);
        r.dropFightFog();
        Object.assign(g, { _fightOn: false, _fightEndedAt: performance.now() });
        r._drawFightFog(g);
        assert.equal(draws(main).length, 1);
    });

    test('no fight, no fog', () => {
        const { r, main } = rig();
        r._drawFightFog(fightGame({ _fightOn: false, _fightStart: null }));
        assert.equal(draws(main).length, 0);
    });

    test("it sits in the spotlight's old slot: after the night grade, before the zone-exit markers", () => {
        const at = (s) => renderFrameBody.indexOf(s);
        assert.ok(at('this._drawLighting(game);') < at('this._drawFightFog(game);'));
        assert.ok(at('this._drawFightFog(game);') < at('this._drawTransitions(game);'));
    });

    test('the spotlight and its vignette are gone', () => {
        assert.ok(!rendererSrc.includes('_drawArena'), '_drawArena');
        assert.ok(!rendererSrc.includes('_arenaLevel'), '_arenaLevel');
    });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test tests/fight-fog-render.test.js`

Expected: FAIL. The first tests say `r._drawFightFog is not a function`, and the last one says `_drawArena`.

- [ ] **Step 3: Import the two modules**

In `game/renderer.js`, find:

```js
import { isHunting } from './ai.js'; // one spelling of "actively hunting the player"
```

Add below it:

```js
import { fighters, fightArea, FIGHT_MARGIN } from './fight-area.js';        // (fight-fog) who is in the fight, and what they can see
import { fogReveal, fogDepth, fogOut, tileJitter, FOG_TINT, FOG_DENSITY, FOG_BLUR_TILES,
         FOG_FAR_TILES, FOG_IN_MS, FOG_OUT_MS } from './fight-entrance.js'; // (fight-fog) the fog's timeline and look
```

- [ ] **Step 4: Put the fog in the spotlight's slot in `renderFrame`**

Find this block in `renderFrame`:

```js
        // Combat arena (lit aggro-radius). Eased in/out so the fight blooms a lit
        // stage with the world dimming/cooling around it, releasing when the
        // encounter clears. Drawn after day/night so it composes (the player aura
        // still lights the arena at night), before the HUD so HP/clock stay legible.
        const arenaTarget = (game._inCombat && game._inCombat()) ? 1 : 0;
        const aCur = this._arenaLevel ?? 0;
        this._arenaLevel = Math.abs(arenaTarget - aCur) < 0.01 ? arenaTarget : aCur + (arenaTarget - aCur) * 0.15;
        this._drawArena(game);
```

Replace it with:

```js
        // (fight-fog) The fight as fog of war: a soft shadow over what the
        // fighters can't see, in the slot the spotlight arena held — after the
        // day/night grade so the two compose, before the zone-exit markers and
        // the HUD so both stay legible (plans/fight-fog.md §1).
        this._drawFightFog(game);
```

Then correct the three comments that still name the arena:

- Replace `after the lighting/arena dim` with `after the lighting/fog dim`.
- Replace `day/night + arena + Wilderness` with `day/night + fight fog + Wilderness`. This appears twice, so use `replace_all`.

- [ ] **Step 5: Replace `_drawArena` with the fog**

Delete the whole block from the line `    // ── Combat arena (lit aggro-radius) ──────────────────────────────────────` through the closing brace of `_drawArena(game) { … }`, the `    }` that follows `ctx.drawImage(am, 0, 0);` and `ctx.restore();`. Put this in its place:

```js
    // ── The fight as fog of war (plans/fight-fog.md §1) ─────────────────────
    //
    // While a fight is on (main.js _trackFight sets game._fightOn), every tile
    // none of the fighters can see takes a soft cool shadow that deepens with
    // distance from their sight: fight-area.js's field, written into a
    // one-pixel-per-tile mask, blown up with smoothing, blurred by about a
    // tile, tinted and multiplied over the world. It arrives the way the
    // fight's entrance says — rolling out from their sight, or closing in from
    // the screen's edges — and fades when the fight ends, holding the last area
    // in world tiles so it stays on the ground while you walk away. The
    // Wilderness keeps its own blackout.

    // Forget the fight's fog at once: a zone change, a death or a restart.
    dropFightFog() { this._fog = null; }

    // A reusable offscreen canvas of the given size (the seam tests stub).
    _offscreen(name, w, h) {
        const key = `_off_${name}`;
        const c = (this[key] ??= document.createElement('canvas'));
        if (c.width !== w) c.width = w;
        if (c.height !== h) c.height = h;
        return c;
    }

    // The fight area for this frame. Recomputed only when something it reads
    // has changed: the zone, the turn, where you stand, the view, and each
    // fighter's tile, facing and night level.
    _fightAreaFor(game, vp) {
        const fs = fighters(game.enemies);
        const key = [game.map?.zoneName, game.turn, game.playerX, game.playerY,
            vp.span.iMin, vp.span.iMax, vp.span.jMin, vp.span.jMax,
            ...fs.map(f => `${f.x},${f.y},${f._lastDx ?? 0},${f._lastDy ?? 0},${f._nightLevel ?? 0}`)].join('|');
        if (this._fog?.key === key) return this._fog;
        const m = FIGHT_MARGIN;
        const area = fightArea(game.map, fs, {
            x0: game.playerX + vp.span.iMin - m, y0: game.playerY + vp.span.jMin - m,
            x1: game.playerX + vp.span.iMax + m, y1: game.playerY + vp.span.jMax + m,
        });
        return { key, area, soft: null, settled: false };
    }

    _drawFightFog(game) {
        if (this.zone === 'WILDERNESS') return;
        const now = performance.now();
        const vp = this._view();
        let exit = 1;
        if (game._fightOn) {
            this._fog = this._fightAreaFor(game, vp);
        } else {
            const since = now - (game._fightEndedAt ?? -Infinity);
            if (!this._fog || !(since < FOG_OUT_MS)) { this._fog = null; return; }
            exit = fogOut(since);
        }
        const fog = this._fog;

        // The mask changes every frame only while the fog rolls in; after that
        // it is rebuilt once per new area.
        const sinceStart = game._fightStart ? now - game._fightStart.at : Infinity;
        const rolling = !!game._fightOn && sinceStart < FOG_IN_MS;
        if (rolling || !fog.settled) {
            this._buildFogMask(game, fog, vp, sinceStart);
            fog.settled = !rolling;
        }

        const { area } = fog;
        const { ctx } = this;
        ctx.save();
        ctx.translate((this._shakeX || 0) - this._scrollX, (this._shakeY || 0) - this._scrollY);
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = FOG_DENSITY * exit;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(fog.soft,
            vp.origin.x + (area.x0 - game.playerX) * TILE_PX,
            vp.origin.y + (area.y0 - game.playerY) * TILE_PX,
            area.w * TILE_PX, area.h * TILE_PX);
        ctx.restore();
    }

    // Each fogged tile's strength (its depth, times how far it has faded in)
    // into the one-pixel-per-tile mask; then the mask blown up, blurred and
    // tinted into fog.soft, the shadow _drawFightFog lays down.
    _buildFogMask(game, fog, vp, sinceStart) {
        const { area } = fog;
        const entrance = game._fightStart?.entrance ?? null;
        const quiet = !entrance || !!Settings.get('reduceMotion');
        const closing = entrance?.roll === 'in';
        // Steps from the screen's edge, for fog that closes in from it.
        const edge = (tx, ty) => {
            const i = tx - game.playerX, j = ty - game.playerY;
            return Math.max(0, Math.min(i - vp.span.iMin, vp.span.iMax - i, j - vp.span.jMin, vp.span.jMax - j));
        };
        const distAt = (k) => (area.dist[k] < 0 ? FOG_FAR_TILES + 1 : area.dist[k]);
        const orderAt = (k) => {
            const x = k % area.w, y = (k - x) / area.w;
            return closing ? edge(area.x0 + x, area.y0 + y) : distAt(k);
        };
        let maxOrder = 0;
        if (!quiet) for (let k = 0; k < area.seen.length; k++) if (!area.seen[k]) maxOrder = Math.max(maxOrder, orderAt(k));

        const mask = this._offscreen('fogMask', area.w, area.h);
        const mctx = mask.getContext('2d');
        const img = mctx.createImageData(area.w, area.h);
        for (let k = 0; k < area.seen.length; k++) {
            if (area.seen[k]) continue;
            const x = k % area.w, y = (k - x) / area.w;
            const reveal = fogReveal(orderAt(k), maxOrder, sinceStart, tileJitter(area.x0 + x, area.y0 + y), { quiet });
            img.data[k * 4 + 3] = Math.round(255 * fogDepth(distAt(k)) * reveal);
        }
        mctx.putImageData(img, 0, 0);

        const PX = 8;   // the blur's working resolution, in px per tile
        const soft = this._offscreen('fogSoft', area.w * PX, area.h * PX);
        const sctx = soft.getContext('2d');
        sctx.setTransform(1, 0, 0, 1, 0, 0);
        sctx.globalCompositeOperation = 'source-over';
        sctx.clearRect(0, 0, soft.width, soft.height);
        sctx.imageSmoothingEnabled = true;
        sctx.imageSmoothingQuality = 'high';
        sctx.filter = `blur(${FOG_BLUR_TILES * PX}px)`;
        sctx.drawImage(mask, 0, 0, soft.width, soft.height);
        sctx.filter = 'none';
        sctx.globalCompositeOperation = 'source-in';   // tint what the mask kept
        sctx.fillStyle = FOG_TINT;
        sctx.fillRect(0, 0, soft.width, soft.height);
        sctx.globalCompositeOperation = 'source-over';
        fog.soft = soft;
    }
```

- [ ] **Step 6: Remove the combat vignette**

In `_drawThreatOverlay`, find:

```js
        // Combat vignette — rides the SAME _arenaLevel ramp _drawArena uses
        // (main.js drives it toward 1 in combat and 0 otherwise; no second timer
        // here). Framing, not information: a plain radial edge-darken, additive
        // to whichever phase applied above, carrying no per-tile data.
        const arenaLevel = this._arenaLevel ?? 0;
        if (arenaLevel > 0.001) {
            const vcx = vp.origin.x + TILE_PX / 2;
            const vcy = vp.origin.y + TILE_PX / 2;
            const vr = Math.hypot(vp.w / 2, vp.h / 2);   // reaches the corners
            const grd = ctx.createRadialGradient(vcx, vcy, 0, vcx, vcy, vr);
            grd.addColorStop(0, 'rgba(0,0,0,0)');
            grd.addColorStop(1, `rgba(0,0,0,${0.35 * arenaLevel})`);
            ctx.save();
            ctx.fillStyle = grd;
            ctx.fillRect(0, 0, vp.w, vp.h);
            ctx.restore();
        }
```

Replace it with:

```js
        // (fight-fog) The combat vignette that used to frame a fight here is
        // retired: the fight's fog is the frame now (plans/fight-fog.md §1).
```

- [ ] **Step 7: Run the tests and watch them pass**

Run: `node --test tests/fight-fog-render.test.js`

Expected: PASS, 11 tests.

Then run: `npm test 2>&1 | tail -8`

Expected: `# fail 0`.

- [ ] **Step 8: Commit**

```bash
cd C:/Code/violencetown && git add game/renderer.js tests/fight-fog-render.test.js && git commit -F - <<'EOF'
feat(fight-fog): the fog of war replaces the spotlight

In the spotlight's slot, a soft cool shadow over every tile the fighters
can't see, deepening with distance, rolling in the way the entrance says
and fading when the fight ends. The combat vignette retires with the
spotlight. Nothing sets game._fightOn yet, so fights draw neither until
main.js does (next).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## Task 6: The threat field stands down in fights

**Files:** Modify `game/renderer.js`, `tests/fight-fog-render.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/fight-fog-render.test.js`:

```js
describe('the threat overlay in a fight', () => {
    function overlay(game) {
        const { r, main } = rig({ sprites: {}, _ditherPattern: (colour) => `stipple ${colour}` });
        r._drawThreatOverlay({ map: openMap(), playerX: 10, playerY: 10, turn: 1, wheel: null,
            _inCombat: () => !!game._fightOn, ...game });
        return main.calls;
    }
    const stippled = (calls) => calls.filter(c => c.fn === 'fillRect' && String(c.fill).startsWith('stipple'));

    test('a fight draws no stipple and no vignette', () => {
        const calls = overlay({ enemies: [fighter()], _fightOn: true });
        assert.equal(stippled(calls).length, 0);
        assert.equal(calls.filter(c => c.fn === 'createRadialGradient').length, 0);
    });

    test('and keeps the facing chevron and the "sees you" thread', () => {
        const calls = overlay({ enemies: [fighter()], _fightOn: true });
        assert.ok(calls.filter(c => c.fn === 'stroke').length >= 2, 'the chevron and the thread');
        assert.ok(calls.some(c => c.fn === 'setLineDash'), 'the thread is dashed');
    });

    test('outside a fight the stipple draws as it always did', () => {
        // Suspicious and facing away: it has no sight of you, so the phase is HAZE.
        const calls = overlay({ enemies: [fighter({ state: 'suspicious', _lastDx: 1 })], _fightOn: false });
        assert.ok(stippled(calls).length > 0);
        assert.ok(stippled(calls).every(c => c.fill === 'stipple rgb(2,2,8)'), 'HAZE: the dark stipple on safe ground');
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test tests/fight-fog-render.test.js`

Expected: FAIL on `a fight draws no stipple and no vignette`, because the red ALARM stipple still draws. The other two tests pass; they guard what must stay.

- [ ] **Step 3: Gate the field on the fight**

In `_drawThreatOverlay`, find the only occurrence of:

```js
        if (phase !== PHASE.QUIET) {
```

Replace it with:

```js
        // (fight-fog) In a fight the fog shows what they can't see, so the
        // field's stipple stands down; the chevrons, marks and thread below
        // still draw (plans/fight-fog.md §1).
        if (phase !== PHASE.QUIET && !game._fightOn) {
```

In the comment above `_drawThreatOverlay`, replace `multiply pass, a combat-arena dim and the Wilderness blackout; a fourth` with `multiply pass, the fight fog and the Wilderness blackout; a fourth`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `node --test tests/fight-fog-render.test.js`

Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
cd C:/Code/violencetown && git add game/renderer.js tests/fight-fog-render.test.js && git commit -F - <<'EOF'
feat(fight-fog): in a fight the threat field's stipple stands down

The fog shows what they can't see, so ALARM's red and HAZE's dark stipple
stop while a fight is on. The facing chevrons, the ? and ! marks and the
"sees you" thread keep drawing; outside fights nothing changes.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## Task 7: `main.js` notices the fight's start and end

**Files:** Modify `game/main.js`. Create `tests/fight-start.test.js`.

- [ ] **Step 1: Write the failing tests**

Create `tests/fight-start.test.js`:

```js
// fight-start.test.js — main.js notices a fight's edges, and stamps how it began
// (plans/fight-fog.md §2).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fighters } from '../game/fight-area.js';
import { fightStartKind, entranceFor, ENTRANCES } from '../game/fight-entrance.js';
import { Enemy } from '../game/enemies.js';
import { tickNpcState } from '../game/npc.js';
import { emitNoise, NOISE } from '../game/perception.js';

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');

// A method lifted out of main.js and run against a stand-in `this`, as
// tests/hunting-state.test.js does.
function liveMethod(name, params, freeVars = {}) {
    const signature = `${name}(${params}) {`;
    const at = mainSrc.indexOf(signature);
    assert.ok(at > 0, `${name}(${params}) not found in main.js`);
    const closeAt = mainSrc.indexOf('\n    }', at);
    const body = mainSrc.slice(at + name.length, closeAt + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
}
const methodBody = (signature) => {
    const at = mainSrc.indexOf(signature);
    assert.ok(at > 0, `${signature} not found in main.js`);
    return mainSrc.slice(at, mainSrc.indexOf('\n    }', at));
};

const STATE = { DEAD: 'dead', IDLE: 'idle' };
const trackFight = liveMethod('_trackFight', '', { fighters, fightStartKind, entranceFor, STATE });

function world(enemies, over = {}) {
    const g = {
        enemies, turn: 7, state: STATE.IDLE, loops: 0, dropped: 0,
        _ensureParticleLoop() { this.loops++; },
        renderer: { dropFightFog: () => { g.dropped++; } },
        ...over,
    };
    return g;
}
const foe = (state, over = {}) => ({ state, entity: { isAlive: () => true }, sightRange: 8, x: 5, y: 5, ...over });

describe("a fight's edges", () => {
    test('the first fighter starts it: how, when, and which entrance', () => {
        const g = world([foe('chasing')]);
        trackFight.call(g);
        assert.equal(g._fightOn, true);
        assert.equal(g._fightStart.kind, 'spotted');
        assert.equal(g._fightStart.entrance, ENTRANCES.spotted);
        assert.equal(typeof g._fightStart.at, 'number');
        assert.ok(g.loops > 0, 'the render loop starts, so the entrance plays');
    });

    test('it stamps once, not every frame', () => {
        const g = world([foe('chasing')]);
        trackFight.call(g);
        const first = g._fightStart;
        trackFight.call(g);
        assert.equal(g._fightStart, first);
    });

    test('the last one leaving ends it, and notes when', () => {
        const g = world([foe('chasing')]);
        trackFight.call(g);
        g.enemies[0].state = 'returning';
        trackFight.call(g);
        assert.equal(g._fightOn, false);
        assert.equal(typeof g._fightEndedAt, 'number');
        assert.equal(g.dropped, 0, 'an ordinary end fades');
    });

    test('a fight that restarts inside 3 s gets no second entrance', () => {
        const g = world([foe('chasing')]);
        trackFight.call(g);
        g.enemies[0].state = 'returning';
        trackFight.call(g);
        g.enemies[0].state = 'chasing';
        trackFight.call(g);
        assert.equal(g._fightOn, true);
        assert.equal(g._fightStart.entrance, null);
    });

    test('dying ends it at once, without the fade', () => {
        const g = world([foe('chasing')]);
        trackFight.call(g);
        g.state = STATE.DEAD;
        trackFight.call(g);
        assert.equal(g._fightOn, false);
        assert.equal(g.dropped, 1);
    });
});

describe('each way a fight starts stamps the right kind', () => {
    const start = (g) => { trackFight.call(g); return g._fightStart.kind; };

    test('a sighting: they spotted you', () => {
        assert.equal(start(world([foe('chasing')])), 'spotted');
    });

    test('hitting someone who is not hostile: combatAttack notes the blow, _onEntityHarmed turns them', () => {
        const npc = foe('idle');
        const g = world([npc]);
        npc._struckAt = g.turn;      // what combatAttack does
        npc.state = 'chasing';       // what _onEntityHarmed does
        assert.equal(start(g), 'struck');
    });

    test('hitting a hostile enemy from its blind spot: the noise turns it, its own turn makes it search', () => {
        const g = { playerX: 5, playerY: 1, enemies: [], containers: [], turn: 7, _MOVE_MS: 150,
            map: { isWalkable: (x, y) => x >= 0 && y >= 0 && x < 11 && y < 5 },
            rng: { pick: (a) => a[0], float: () => 0.5 }, applyDamageToPlayer() {} };
        const e = new Enemy({ id: 'h1', type: 'Rat', x: 5, y: 2, sightRange: 8, facing: 'S' });   // you are behind it
        assert.equal(e.allegiance, 'hostile');
        g.enemies.push(e);
        e._struckAt = g.turn;                                  // the blow (combatAttack)
        emitNoise([e], g.playerX, g.playerY, NOISE.melee);     // fighting is loud
        assert.equal(e.state, 'suspicious');
        g.turn++;                                              // the world beat
        tickNpcState(g, e, g.turn);
        assert.equal(e.state, 'searching', 'you are in its blind spot');
        assert.equal(start(world(g.enemies, { turn: g.turn })), 'struck');
    });

    test('a conversation that sours: they turn on you, but you hit nobody', () => {
        assert.equal(start(world([foe('chasing', { _struckAt: null })])), 'spotted');
    });

    test('a search: suspicion grew into one', () => {
        assert.equal(start(world([foe('searching')])), 'search');
    });
});

describe('main.js wiring', () => {
    test('every frame checks the fight before drawing it', () => {
        const body = methodBody('    _render() {');
        const track = body.indexOf('this._trackFight();');
        assert.ok(track >= 0 && track < body.indexOf('this.renderer.renderFrame(this);'));
    });

    test('combatAttack notes the turn of every blow that lands', () => {
        const body = methodBody('    combatAttack(enemyObj, damage, opts = {}) {');
        const stamp = body.indexOf('enemyObj._struckAt = this.turn;');
        assert.ok(stamp > body.indexOf('const result = attack('), 'after the blow lands');
    });

    test('a zone change drops the fog', () => {
        assert.match(methodBody('    async _loadMap(url, spawnX, spawnY) {'), /this\.renderer\.dropFightFog\(\);/);
    });

    test("the render loop runs while the fog or the entrance moves; the spotlight's ease is gone", () => {
        assert.match(methodBody('    _hasActiveEffects() {'),
            /fightFxActive\(this\._fightOn, this\._fightStart, this\._fightEndedAt, now\)/);
        assert.ok(!mainSrc.includes('_arenaLevel'));
    });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test tests/fight-start.test.js`

Expected: FAIL, `_trackFight() not found in main.js`. The whole file errors at load.

- [ ] **Step 3: Import the modules**

In `game/main.js`, find:

```js
import * as Settings from './settings.js'; // [settings] options/accessibility store
```

Add below it:

```js
import { fighters } from './fight-area.js';                                      // (fight-fog) who is in the fight
import { fightStartKind, entranceFor, fightFxActive } from './fight-entrance.js'; // (fight-fog) how it began, and how long its fog moves
```

- [ ] **Step 4: Check the fight before every frame**

Find:

```js
    _render() {
        this.renderer.renderFrame(this);
    }
```

Replace it with:

```js
    _render() {
        this._trackFight();
        this.renderer.renderFrame(this);
    }

    // (fight-fog) A fight's two edges, checked before every frame is drawn
    // (plans/fight-fog.md). The first fighter stamps how the fight began, and
    // so which entrance it gets; the last one leaving notes when, for the
    // fog's fade and the 3-second no-replay rule. Dying ends it without the
    // fade.
    _trackFight() {
        const fs = this.state === STATE.DEAD ? [] : fighters(this.enemies);
        const on = fs.length > 0;
        if (on === !!this._fightOn) return;
        this._fightOn = on;
        const now = performance.now();
        if (on) {
            const kind = fightStartKind(fs, this.turn);
            this._fightStart = { kind, at: now, entrance: entranceFor(kind, this._fightEndedAt ?? null, now) };
        } else {
            this._fightEndedAt = now;
            if (this.state === STATE.DEAD) this.renderer.dropFightFog();
        }
        this._ensureParticleLoop();
    }
```

- [ ] **Step 5: Note each blow's turn in `combatAttack`**

Find:

```js
        const result = attack(playerEntity, enemyObj.entity, finalDmg);
```

Add below it:

```js

        // (fight-fog) Note the turn of the blow: a fight that begins this turn
        // or the next opens on "you struck first" (fight-entrance.js).
        enemyObj._struckAt = this.turn;
```

- [ ] **Step 6: Drop the fog on a zone change**

In `_loadMap`, find:

```js
        this._openBridgeIfCarFixed();
        this._render();
    }
```

Replace it with:

```js
        this._openBridgeIfCarFixed();
        // (fight-fog) Whatever fog was up belongs to the map you left.
        this.renderer.dropFightFog();
        this._render();
    }
```

A restart and a save restore both reach `_loadMap`, so this covers them too.

- [ ] **Step 7: Keep the loop alive for the fog, not the arena**

In `_hasActiveEffects`, find:

```js
        // Combat arena bloom/release is mid-ease — keep the loop alive so the
        // lit-stage transition animates smoothly instead of stepping on the idle
        // tick. (renderer owns _arenaLevel; target is 1 in combat, 0 otherwise.)
        const r = this.renderer;
        if (r && r._arenaLevel != null) {
            const target = this._inCombat() ? 1 : 0;
            if (Math.abs(r._arenaLevel - target) > 0.01) return true;
        }
```

Replace it with:

```js
        // (fight-fog) The fight's fog rolling in or clearing, and its entrance.
        if (fightFxActive(this._fightOn, this._fightStart, this._fightEndedAt, now)) return true;
```

`now` is already declared at the top of `_hasActiveEffects`.

- [ ] **Step 8: Run the tests and watch them pass**

Run: `node --test tests/fight-start.test.js`

Expected: PASS, 14 tests.

Then run: `npm test 2>&1 | tail -8`

Expected: `# fail 0`.

- [ ] **Step 9: Smoke-test it in the browser**

Restart the dev server and open `tab-1` at `http://localhost:3001`. Stub autosave and get past GAME START, as in *How to run this plan*. Then run with `javascript_tool`:

```js
const g = __game;
await g._loadMap('sewer-map.json');
const e = g.enemies.find((x) => x.entity.isAlive() && x.allegiance === 'hostile' && (x.sightRange || 0) > 0);
g.playerX = e.x - 3; g.playerY = e.y; e._lastDx = -1; e._lastDy = 0;
e.state = 'chasing';
g._render();
({ on: g._fightOn, kind: g._fightStart?.kind, fog: !!g.renderer._fog })
```

Expected: `{ on: true, kind: 'spotted', fog: true }`.

Wait a second, then take a screenshot. It should show the soft shadow behind the fighter and around the edges, with no spotlight circle, no red stipple and no black vignette. `read_console_messages {onlyErrors: true}` should be empty.

- [ ] **Step 10: Commit**

```bash
cd C:/Code/violencetown && git add game/main.js tests/fight-start.test.js && git commit -F - <<'EOF'
feat(fight-fog): main.js notices a fight's edges and how it began

_trackFight runs before every frame: the first fighter stamps _fightStart
(struck, spotted or search, and its entrance, none within 3 s of the last
fight); the last one leaving stamps _fightEndedAt. combatAttack notes each
blow's turn, a zone change or a death drops the fog at once, and the render
loop runs while the fog moves instead of while the arena eased.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## Task 8: A local capture page for review clips (Stage 1 checkpoint)

Caelan reviews from his phone, so each checkpoint sends clips. This page lives only on this machine: `.gitignore:88` covers `game/_design-*.html`, and nothing in this task is committed.

**Files:**
- Create `game/_design-fight-capture.html` (generated; gitignored).
- Create `<scratchpad>/fight-capture.js` and `<scratchpad>/make_fight_gif.py`, where `<scratchpad>` is the session's scratchpad directory.

- [ ] **Step 1: Write the capture script**

Create `<scratchpad>/fight-capture.js`:

```js
// The real game boots underneath. ?kind=spotted|struck|search stages that
// start in the Sewer through the game's own paths, freezes the page's clock,
// and renders the fight's first 1.5 s frame by frame into <pre id="fight-frames">
// for headless Chrome's --dump-dom.
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 160 && !(window.__game?.renderer?.sprites && window.__game.renderer.font && window.__game.map); i++) await wait(250);
const g = window.__game, canvas = g.renderer.canvas;
g.autosave = () => {};
for (let i = 0; i < 40 && g.state === 'splash'; i++) { document.querySelector('#splash-go')?.click(); await wait(250); }

const kind = new URLSearchParams(location.search).get('kind') || 'spotted';
await g._loadMap('sewer-map.json');
g._deAggroAll();
// A hostile with open ground three tiles west of it and two tiles east.
const free = (x, y) => g.map.isWalkable(x, y) && !g._targetAt(x, y);
const e = g.enemies.find((x) => x.entity.isAlive() && !x.ambient && x.allegiance === 'hostile' && (x.sightRange || 0) > 0
    && [-3, -2, -1, 1, 2].every((dx) => free(x.x + dx, x.y)));
e._lastDx = -1; e._lastDy = 0;                                  // it faces west
g.playerX = e.x + { spotted: -3, struck: 1, search: 2 }[kind];  // in front of it, or behind it
g.playerY = e.y;

const realNow = performance.now.bind(performance);
let T = realNow() + 100000;
performance.now = () => T;
g._fightEndedAt = null;
for (let i = 0; i < 5; i++) g._render();
const frames = [];
const grab = (ms) => frames.push({ ms, png: canvas.toDataURL('image/png') });
grab(800);                                                      // the calm moment before
if (kind === 'struck') g.combatAttack(e, 1);                    // a blow from its blind spot
if (kind === 'search') { e.state = 'suspicious'; e._lastSeenX = g.playerX; e._lastSeenY = g.playerY; }
g._advanceWorld();                                              // the world beat that starts it
g._render();
const T0 = g._fightStart?.at ?? T;
for (let t = 0; t <= 1080; t += 40) { T = T0 + t; g._render(); grab(40); }
T = T0 + 1500; g._render(); grab(2000);
performance.now = realNow;
const pre = document.createElement('pre');
pre.id = 'fight-frames'; pre.style.display = 'none';
pre.textContent = JSON.stringify({ kind, started: g._fightStart?.kind ?? null, frames });
document.body.appendChild(pre);
document.title = 'captured';
```

- [ ] **Step 2: Generate the page from `index.html`**

```bash
cd C:/Code/violencetown && SP="<scratchpad>" python - <<'EOF'
import os, re, pathlib
root = pathlib.Path('game')
page = (root / 'index.html').read_text(encoding='utf-8')
page = page.replace('<title>Violencetown</title>', '<title>Violencetown — fight capture</title>')
page = re.sub(r'\s*<!-- PWA offline shell.*?</script>', '', page, flags=re.S)   # no service worker
script = (pathlib.Path(os.environ['SP']) / 'fight-capture.js').read_text(encoding='utf-8')
page = page.replace('</body>', f'<script type="module">\n{script}\n</script>\n</body>')
(root / '_design-fight-capture.html').write_text(page, encoding='utf-8')
print('written', len(page))
EOF
git status --short
```

Expected: `written <n>`, and `git status --short` prints nothing: the page is ignored.

- [ ] **Step 3: Write the GIF maker**

Create `<scratchpad>/make_fight_gif.py`:

```python
# Turn a --dump-dom of _design-fight-capture.html into a GIF plus a strip of
# four stills (calm, impact, rolling, settled).
import base64, html, io, json, re, sys
from PIL import Image

dump, out = sys.argv[1], sys.argv[2]
text = open(dump, encoding='utf-8', errors='ignore').read()
m = list(re.finditer(r'<pre id="fight-frames"[^>]*>(\{.*?)</pre>', text, re.S))[-1]
data = json.loads(html.unescape(m.group(1)))
imgs, durs = [], []
for f in data['frames']:
    im = Image.open(io.BytesIO(base64.b64decode(f['png'].split(',', 1)[1]))).convert('RGB')
    im = im.resize((im.width // 2, im.height // 2), Image.NEAREST)   # 2 px per art pixel -> 1
    imgs.append(im)
    durs.append(max(20, int(f['ms'])))
# One palette for every frame, so colours do not flicker frame to frame.
picks = [imgs[0], imgs[2], imgs[len(imgs) // 3], imgs[-1]]
sheet = Image.new('RGB', (picks[0].width, picks[0].height * len(picks)))
for n, im in enumerate(picks):
    sheet.paste(im, (0, n * im.height))
pal = sheet.quantize(colors=255, method=Image.Quantize.MEDIANCUT)
q = [im.quantize(palette=pal, dither=Image.Dither.NONE) for im in imgs]
q[0].save(out, save_all=True, append_images=q[1:], duration=durs, loop=0, optimize=False, disposal=1)
sheet.save(out.replace('.gif', '-stills.png'))
print(out, data['kind'], 'started as', data['started'], len(q), 'frames', imgs[0].size, sum(durs), 'ms')
```

- [ ] **Step 4: Capture all three starts**

The dev server must be running on 3001.

```bash
SP="<scratchpad>"; mkdir -p "$SP/fight-capture" && cd "$SP/fight-capture" && for k in spotted struck search; do timeout 150 "/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --hide-scrollbars --no-first-run --no-default-browser-check --user-data-dir="$SP/fight-capture/chrome-profile" --window-size=1300,800 --force-device-scale-factor=1 --virtual-time-budget=60000 --dump-dom "http://localhost:3001/_design-fight-capture.html?kind=$k" > "dump-$k.html" 2>/dev/null; python "$SP/make_fight_gif.py" "dump-$k.html" "fight-$k.gif"; done
```

Expected, three lines:
- `fight-spotted.gif spotted started as spotted 30 frames …`
- `fight-struck.gif struck started as struck …`
- `fight-search.gif search started as search …`

`started as` must equal the kind. That confirms the start detection on the game's real paths. If it doesn't match, stop and debug before the checkpoint.

- [ ] **Step 5: Look at the stills yourself**

Read each `fight-<kind>-stills.png`.

Expected:
- No spotlight circle, red stipple or black vignette anywhere.
- The shadow arrives over the frames: rolling out from their sight for struck and search, closing in from the edges for spotted.
- In the last still, the shadow lies behind the fighter and deepens toward the screen's edges.

There is no impact frame or zoom yet; Stage 2 adds those.

- [ ] **Step 6: CHECKPOINT — Stage 1**

Send Caelan the three GIFs with `SendUserFile`. Tell him: the fog is in; the entrance comes next; the GIFs show the fog arriving and settling in a real Sewer fight, one per way a fight can start. Wait for his "go" before Task 9.

---

## Task 9: Body-only sprite draws, for the silhouettes

**Files:** Modify `game/renderer.js`, `tests/fight-fog-render.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/fight-fog-render.test.js`:

```js
describe('body-only sprites, for the silhouettes', () => {
    function drawn(who, bodyOnly) {
        const frames = [];
        const { r, main } = rig({ sprites: new Proxy({}, { get: () => ({ loaded: true, drawFrame: (...a) => { frames.push(a); return true; } }) }) });
        const now = performance.now();
        const game = fightGame({ _playerHitFlashUntil: now + 500 });
        if (who === 'enemy') {
            const e = fighter({ entity: { isAlive: () => true, hp: 5, maxHp: 10 }, _hitFlashUntil: now + 500,
                buffs: [{ name: 'Blind', type: 'debuff' }], disposition: -10, gold: 150 });
            r._drawEnemySprite(game, e, 64, 32, now, { bodyOnly });
        } else {
            r._drawPlayerSprite(game, 0, 0, now, { bodyOnly });
        }
        return { frames: frames.length, fills: main.calls.filter(c => c.fn === 'fillRect' || c.fn === 'fill').length };
    }

    test('an enemy drawn body-only is the sprite alone: no flash, bar, badges, face or pips', () => {
        assert.deepEqual(drawn('enemy', true), { frames: 1, fills: 0 });
        assert.ok(drawn('enemy', false).fills > 0, 'the full draw has them');
    });

    test('so is the player', () => {
        assert.deepEqual(drawn('player', true), { frames: 1, fills: 0 });
        assert.ok(drawn('player', false).fills > 0, 'the full draw has the hit flash');
    });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test tests/fight-fog-render.test.js`

Expected: FAIL on both new tests, because `fills` is above 0 when `bodyOnly` is ignored.

- [ ] **Step 3: Add `bodyOnly` to the enemy draw**

Change the signature from `    _drawEnemySprite(game, e, px, py, now) {` to:

```js
    _drawEnemySprite(game, e, px, py, now, { bodyOnly = false } = {}) {
```

Then find, in the same method:

```js
                ctx.fillRect(px + 6, py + 6, TILE_PX - 12, TILE_PX - 12);
            }
        });

        if (isAlive) {
```

Replace it with:

```js
                ctx.fillRect(px + 6, py + 6, TILE_PX - 12, TILE_PX - 12);
            }
        });

        // (fight-fog) The entrance's silhouettes want the body alone: every
        // overlay below is a filled shape that would silhouette as a box.
        if (bodyOnly) return;

        if (isAlive) {
```

- [ ] **Step 4: Add `bodyOnly` to the player draw**

Change the signature from `    _drawPlayerSprite(game, ppx, ppy, now) {` to:

```js
    _drawPlayerSprite(game, ppx, ppy, now, { bodyOnly = false } = {}) {
```

Then find, in the same method:

```js
        // Hit-flash overlay — red tint when the player just took damage.
```

Put this directly above it:

```js
        if (bodyOnly) return;   // (fight-fog) the silhouettes' body-only draw

```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `node --test tests/fight-fog-render.test.js`

Expected: PASS, 16 tests.

- [ ] **Step 6: Commit**

```bash
cd C:/Code/violencetown && git add game/renderer.js tests/fight-fog-render.test.js && git commit -F - <<'EOF'
feat(fight-fog): body-only sprite draws, for the entrance's silhouettes

_drawEnemySprite and _drawPlayerSprite take { bodyOnly } and stop after the
body: the hit flash, health bar, badges, mood face and pips are filled
shapes that would silhouette as boxes, and a first strike begins on exactly
the turn of a hit.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## Task 10: The entrance (Stage 2 checkpoint)

**Files:** Modify `game/renderer.js`, `tests/fight-fog-render.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/fight-fog-render.test.js`:

```js
describe('the entrance', () => {
    const at = (entrance, ms, over = {}) => fightGame({ _fightStart: { kind: entrance.kind, at: performance.now() - ms, entrance }, ...over });
    const filled = (rec, colour) => rec.calls.some(c => (c.fn === 'fillRect' || c.fn === 'fill') && c.fill === colour);

    test('struck: a cream close-up, you and them in black', () => {
        const { r, main, off } = rig();
        r._drawEntrance(at(ENTRANCES.struck, 30));
        assert.ok(filled(main, '#efe6d2'), 'the cream screen');
        assert.ok(off.entranceSil.rec.calls.some(c => c.fn === 'fillRect' && c.op === 'source-in'), 'the silhouettes, filled solid');
        assert.ok(draws(main).some(c => c.a[0] === off.entranceSil), 'blown up over the cream');
    });

    test('spotted: a red screen and a white slash', () => {
        const { r, main } = rig();
        r._drawEntrance(at(ENTRANCES.spotted, 30));
        assert.ok(filled(main, '#c8242b'), 'the red screen');
        assert.ok(filled(main, '#fff4e0'), 'the slash');
    });

    test('search: a white flash, no silhouettes, no zoom', () => {
        const { r, main, off } = rig();
        r._drawEntrance(at(ENTRANCES.search, 30));
        assert.ok(filled(main, '#fff8e8'));
        assert.equal(off.entranceSil, undefined);
        assert.equal(off.entranceSnap, undefined);
    });

    test('after the impact the frame punches in about you', () => {
        const { r, main, off } = rig();
        r._drawEntrance(at(ENTRANCES.spotted, IMPACT_MS + 20));
        const punch = draws(main).find(c => c.a[0] === off.entranceSnap);
        assert.ok(punch, 'the zoomed copy of the frame');
        assert.ok(punch.a[3] > 1920, `wider than the screen: ${punch.a[3]}`);
        assert.ok(!filled(main, '#c8242b'), 'the impact frame is over');
    });

    test('it is all over by 360 ms', () => {
        const { r, main } = rig();
        r._drawEntrance(at(ENTRANCES.spotted, ZOOM_IN_MS + ZOOM_OUT_MS + 1));
        assert.equal(main.calls.length, 0);
    });

    test('no entrance, or no fight, draws nothing', () => {
        const { r, main } = rig();
        r._drawEntrance(fightGame({ _fightStart: { kind: 'spotted', at: performance.now() - 30, entrance: null } }));
        r._drawEntrance(at(ENTRANCES.spotted, 30, { _fightOn: false }));
        assert.equal(main.calls.length, 0);
    });

    test('reduce motion draws nothing', () => {
        Settings.set('reduceMotion', true);
        try {
            const { r, main } = rig();
            r._drawEntrance(at(ENTRANCES.spotted, 30));
            assert.equal(main.calls.length, 0);
        } finally {
            Settings.set('reduceMotion', false);
        }
    });

    test('the Wilderness still gets its entrance; only the fog is skipped there', () => {
        const { r, main } = rig({ zone: 'WILDERNESS' });
        r._drawEntrance(at(ENTRANCES.spotted, 30));
        assert.ok(filled(main, '#c8242b'));
    });

    test('renderFrame draws it last, over the HUD and any menu', () => {
        const last = renderFrameBody.lastIndexOf('this._drawEntrance(game);');
        assert.ok(last > renderFrameBody.indexOf('this._drawDock();'));
        assert.ok(last > renderFrameBody.indexOf('this._drawCloseButton('));
    });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test tests/fight-fog-render.test.js`

Expected: FAIL, `r._drawEntrance is not a function`, and the last test fails its first assertion.

- [ ] **Step 3: Import `entranceAt`**

In `game/renderer.js`, change the fight-entrance import (from Task 5) to:

```js
import { entranceAt, fogReveal, fogDepth, fogOut, tileJitter, FOG_TINT, FOG_DENSITY, FOG_BLUR_TILES,
         FOG_FAR_TILES, FOG_IN_MS, FOG_OUT_MS } from './fight-entrance.js'; // (fight-fog) the entrance, and the fog's timeline and look
```

- [ ] **Step 4: Draw the entrance last in `renderFrame`**

Find the end of `renderFrame`:

```js
            if (this._closeBtnRect) this._drawCloseButton(this.ctx, this._closeBtnRect);
        }
    }
```

Replace it with:

```js
            if (this._closeBtnRect) this._drawCloseButton(this.ctx, this._closeBtnRect);
        }

        // (fight-fog) A fight's entrance — the impact frame, then the zoom
        // punch — over the whole finished frame, HUD and menus included
        // (plans/fight-fog.md §2).
        this._drawEntrance(game);
    }
```

- [ ] **Step 5: Write the entrance**

Add these methods directly after `_buildFogMask`:

```js
    // ── The fight's entrance (plans/fight-fog.md §2) ─────────────────────────
    //
    // For IMPACT_MS the screen goes to an impact frame: a cream close-up or a
    // red slash with you and the fighters as black silhouettes, or a plain
    // white flash. Meanwhile the whole frame punches in about you and settles.
    // Presentation only: input is never held for it.
    _drawEntrance(game) {
        const start = game._fightStart;
        if (!game._fightOn || !start?.entrance) return;
        const now = performance.now();
        const at = entranceAt(start.entrance, now - start.at, { reduceMotion: !!Settings.get('reduceMotion') });
        if (!at.impact && at.zoom === 1) return;
        const { ctx, canvas } = this;
        const vp = this._view();
        const W = canvas.width, H = canvas.height;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);   // backing px from here
        if (at.impact) this._drawImpact(game, start.entrance, at.impactT, vp, W, H, now);
        if (at.zoom > 1) {
            const snap = this._offscreen('entranceSnap', W, H);
            const sctx = snap.getContext('2d');
            sctx.setTransform(1, 0, 0, 1, 0, 0);
            sctx.clearRect(0, 0, W, H);
            sctx.drawImage(canvas, 0, 0);
            const cx = (vp.origin.x + TILE_PX / 2) * vp.scale, cy = (vp.origin.y + TILE_PX / 2) * vp.scale;
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(snap, cx - cx * at.zoom, cy - cy * at.zoom, W * at.zoom, H * at.zoom);
        }
        ctx.restore();
    }

    // The impact frame, in backing px. `t` is how far through it we are, 0..1.
    _drawImpact(game, entrance, t, vp, W, H, now) {
        const { ctx } = this;
        if (entrance.impact === 'flash') {
            ctx.globalAlpha = 1 - t;
            ctx.fillStyle = '#fff8e8';
            ctx.fillRect(0, 0, W, H);
            ctx.globalAlpha = 1;
            return;
        }
        const fs = fighters(game.enemies);
        const sil = this._silhouettes(game, fs, vp, W, H, now);
        ctx.fillStyle = entrance.impact === 'bw' ? '#efe6d2' : '#c8242b';
        ctx.fillRect(0, 0, W, H);
        // The fight's middle: you and everyone in it.
        const pts = [[game.playerX, game.playerY], ...fs.map(f => [f.x, f.y])];
        const mean = (i) => pts.reduce((s, p) => s + p[i], 0) / pts.length;
        const mx = (vp.origin.x + TILE_PX / 2 + (mean(0) - game.playerX) * TILE_PX) * vp.scale;
        const my = (vp.origin.y + TILE_PX / 2 + (mean(1) - game.playerY) * TILE_PX) * vp.scale;
        if (entrance.impact === 'redblack') {   // a white slash through the fight
            ctx.fillStyle = '#fff4e0';
            ctx.beginPath();
            ctx.moveTo(0, my + H * 0.20); ctx.lineTo(W, my - H * 0.34);
            ctx.lineTo(W, my - H * 0.25); ctx.lineTo(0, my + H * 0.29);
            ctx.closePath();
            ctx.fill();
        }
        const F = entrance.silhouette;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(sil, mx - mx * F, my - my * F, W * F, H * F);
    }

    // You and the fighters as solid black shapes on a clear canvas, from the
    // real sprites drawn body-only.
    _silhouettes(game, fs, vp, W, H, now) {
        const sil = this._offscreen('entranceSil', W, H);
        const sctx = sil.getContext('2d');
        sctx.setTransform(1, 0, 0, 1, 0, 0);
        sctx.globalCompositeOperation = 'source-over';
        sctx.clearRect(0, 0, W, H);
        sctx.setTransform(vp.scale, 0, 0, vp.scale, 0, 0);
        sctx.imageSmoothingEnabled = false;
        const screen = this.ctx;
        this.ctx = sctx;
        try {
            for (const f of fs) {
                const px = vp.origin.x + (f.x - game.playerX) * TILE_PX - this._scrollX;
                const py = vp.origin.y + (f.y - game.playerY) * TILE_PX - this._scrollY;
                this._drawEnemySprite(game, f, px, py, now, { bodyOnly: true });
            }
            const { ppx, ppy } = this._playerScreenPos(game, now);
            this._drawPlayerSprite(game, ppx, ppy, now, { bodyOnly: true });
        } finally {
            this.ctx = screen;
        }
        sctx.setTransform(1, 0, 0, 1, 0, 0);
        sctx.globalCompositeOperation = 'source-in';
        sctx.fillStyle = '#120e0a';
        sctx.fillRect(0, 0, W, H);
        sctx.globalCompositeOperation = 'source-over';
        return sil;
    }
```

- [ ] **Step 6: Run the tests and watch them pass**

Run: `node --test tests/fight-fog-render.test.js`

Expected: PASS, 25 tests.

Then run: `npm test 2>&1 | tail -8`

Expected: `# fail 0`.

- [ ] **Step 7: Commit**

```bash
cd C:/Code/violencetown && git add game/renderer.js tests/fight-fog-render.test.js && git commit -F - <<'EOF'
feat(fight-fog): the entrance — an impact frame and a zoom punch, by how the fight began

You struck first: a cream close-up with you and them as black silhouettes.
They spotted you: a red screen with a white slash. It grew out of a search:
a white flash. Then the whole frame punches in about you and settles by
360 ms. Reduce motion skips both; input is never held.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 8: Re-capture the three clips**

Restart the dev server. Re-run Task 8 Step 4's capture loop; the page needs no change.

Expected: three lines as before, each `started as` its own kind.

Read each `-stills.png`. The second still, 40 ms in, is the impact frame:
- struck: cream with black silhouettes;
- spotted: red with a white slash and bigger silhouettes;
- search: a white flash.

- [ ] **Step 9: CHECKPOINT — Stage 2**

Send Caelan the three GIFs with `SendUserFile`. Tell him: each fight now opens by how it started, and the fog follows. Wait for his "go" before Stage 3.

---

## Task 11: Browser checks at three sizes

**Files:** none changed, unless a check fails.

- [ ] **Step 1: Load the helper**

Restart the dev server and open `tab-1`. Run `resize_window {width: 3440, height: 1440}`, then get past GAME START. Then run with `javascript_tool`:

```js
(() => {
    const g = __game; g.autosave = () => {};
    window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);   // the pane's rAF can stall
    const realNow = performance.now.bind(performance);
    let T = realNow();
    performance.now = () => T;                     // one exact moment per still
    const free = (x, y) => g.map.isWalkable(x, y) && !g._targetAt(x, y);
    const hostile = () => g.enemies.find((x) => x.entity.isAlive() && !x.ambient && x.allegiance === 'hostile'
        && (x.sightRange || 0) > 0 && [-3, -2, -1, 1, 2].every((dx) => free(x.x + dx, x.y)));
    window.__fx = {
        async scene(kind) {
            if (g.map.zoneName !== 'SEWER') await g._loadMap('sewer-map.json');
            g._deAggroAll(); g._render();
            g._fightEndedAt = null;
            const e = hostile();
            e._lastDx = -1; e._lastDy = 0;
            g.playerX = e.x + { spotted: -3, struck: 1, search: 2 }[kind]; g.playerY = e.y;
            g._render();
            if (kind === 'struck') g.combatAttack(e, 1);
            if (kind === 'search') { e.state = 'suspicious'; e._lastSeenX = g.playerX; e._lastSeenY = g.playerY; }
            g._advanceWorld();
            g._render();
            return g._fightStart?.kind;
        },
        at(ms) { T = g._fightStart.at + ms; g._render(); return { on: g._fightOn, fog: !!g.renderer._fog }; },
        endAt(ms) { T = g._fightEndedAt + ms; g._render(); return { on: g._fightOn, fog: !!g.renderer._fog }; },
        end() { g._deAggroAll(); g._render(); return g._fightOn; },
        behind() {
            const f = g.enemies.find((x) => x.state === 'chasing' || x.state === 'searching');
            const fx = Math.sign(f._lastDx || 0), fy = Math.sign(f._lastDy || 0) || (fx ? 0 : 1);
            g.playerX = f.x - fx; g.playerY = f.y - fy; g._render();
            const a = g.renderer._fog.area, k = (g.playerY - a.y0) * a.w + (g.playerX - a.x0);
            return { seen: a.seen[k] === 1, dist: a.dist[k] };
        },
    };
    return 'ready';
})()
```

Expected: `'ready'`.

- [ ] **Step 2: Each entrance at 3440×1440**

For each kind, run `await __fx.scene('<kind>')` and expect the kind back. Then run `__fx.at(ms)` at each moment below, wait a second, and screenshot after each:

| Kind | Moments (ms) |
|---|---|
| `spotted` | 50, 150, 500, 1200 |
| `struck` | 50, 150, 500, 1200 |
| `search` | 50, 500, 1200 |

Expected at each moment:
- **50 ms:** the entrance's impact frame, filling the whole window.
- **150 ms:** the world, zoomed in about you (spotted and struck only).
- **500 ms:** the fog partway in: closing in from the edges for spotted, rolling out from their sight for struck and search.
- **1200 ms:** settled. A soft shadow behind the fighter, deepening toward the edges and never black. No spotlight circle, no stipple on the ground, no black vignette.
- At every moment the facing chevron, the mark over its head and the dashed thread still draw (when the fighter holds you in sight).

- [ ] **Step 3: Stepping behind a fighter puts you in the fog**

Run `await __fx.scene('spotted'); __fx.at(1200); __fx.behind()`.

Expected: `{ seen: false, dist: 1 }` or more. The screenshot shows you under the shadow's rim.

- [ ] **Step 4: The fog clears when the fight ends, and stays on the ground while you walk**

Run `__fx.end()`. Expected: `false`.

Run `__fx.endAt(260)` and screenshot. Expected: the shadow half gone.

Record the area's origin:

```js
const a0 = __game.renderer._fog.area.x0; __game.playerX += 1; __fx.endAt(300); [a0, __game.renderer._fog.area.x0]
```

Expected: the two numbers are equal, and the screenshot shows the shadow shifted one tile against the screen, on the same ground.

Run `__fx.endAt(600)`. Expected: `{ on: false, fog: false }`.

- [ ] **Step 5: Leaving the zone mid-fight clears the fog at once**

```js
await __fx.scene('spotted'); __fx.at(1200); await __game._loadMap('town-map.json'); __game._render(); [__game._fightOn, __game.renderer._fog]
```

Expected: `[false, null]`, and the screenshot shows Town with no fog.

- [ ] **Step 6: Reduce motion**

```js
document.getElementById('opt-reduce-motion').click(); await __fx.scene('spotted'); __fx.at(50)
```

Screenshot: no impact frame and no zoom.

Run `__fx.at(150)` and screenshot: the fog half in, evenly everywhere.

Run `document.getElementById('opt-reduce-motion').click()` to turn it back off.

- [ ] **Step 7: A second fight inside 3 s gets no entrance**

```js
await __fx.scene('spotted'); __fx.at(1200); __fx.end(); __fx.endAt(1000);
const e = __game.enemies.find((x) => x.allegiance === 'hostile' && x.entity.isAlive());
e.state = 'chasing'; __game._render(); __game._fightStart.entrance
```

Expected: `null`. Then run `__fx.at(50)` and screenshot: no impact frame, only the fog fading back in.

- [ ] **Step 8: The same at 1920×1080 and on a phone**

Run `resize_window {width: 1920, height: 1080}`. Reload the tab, get past GAME START, re-run Step 1's helper, then repeat Step 2's `spotted` row (50, 150, 1200) and Step 3.

Run `resize_window {preset: "mobile"}`. Reload (a phone-width load re-runs the device checks), then repeat the same.

Expected, at both sizes:
- the impact frame and zoom fill the canvas;
- the fog covers the whole world area, to the screen's edges and under the dock;
- you stay under the shadow when behind a fighter.

- [ ] **Step 9: The real input path, once**

At 1920×1080, with real time restored (reload the tab, no helper), load the Sewer. Walk up behind a fungus that faces away, and strike it the way a player would: bump into it, then use the wheel's attack.

Expected: the black-and-white close-up plays. If a start ever reads as the wrong kind, stop and debug `fightStartKind`'s inputs (`_struckAt`, `turn`) before going on.

- [ ] **Step 10: A clean console, then reset**

Run `read_console_messages {onlyErrors: true}`. Expected: empty.

Run `resize_window {preset: "desktop"}`.

Nothing is committed in this task. If a check failed, fix the fault with a failing test first, commit the fix, and redo the check.

---

## Task 12: Speed at 3440×1440

**Files:** `plans/fight-fog.md` gets the numbers in Task 13. `.claude/launch.json` is gitignored and changes here only temporarily.

- [ ] **Step 1: Serve dev beside the branch**

```bash
cd C:/Code/violencetown && git worktree add --detach .claude/worktrees/fight-fog-before dev
```

Add this configuration to `.claude/launch.json`'s `configurations` array:

```json
    {
      "name": "vt-before",
      "runtimeExecutable": "python",
      "runtimeArgs": ["C:\\Code\\violencetown\\.claude\\worktrees\\fight-fog-before\\dev-server.py", "3008"],
      "port": 3008
    }
```

Start both servers with `preview_start {name: "violencetown"}` and `preview_start {name: "vt-before"}`. Resize each tab with `resize_window {width: 3440, height: 1440, tabId}`, then reload each so both are fresh page loads. Nothing may read the game canvas before timing. Get past GAME START in each.

- [ ] **Step 2: Load the timing harness in each tab**

Run this in each tab with `javascript_tool`. It is the twin-canvas method from `plans/screen-fill-implementation.md` Task 10's note, plus a GPU yardstick and a scene that doesn't freeze the clock:

```js
const g = __game, R = g.renderer; g.autosave = () => {};
const M = document.createElement('canvas'); M.width = R.canvas.width; M.height = R.canvas.height;
const mctx = M.getContext('2d', { willReadFrequently: false }); mctx.imageSmoothingEnabled = false;
const sink = document.createElement('canvas'); sink.width = 512; sink.height = 512;
const sctx = sink.getContext('2d', { willReadFrequently: false });
const real = { canvas: R.canvas, ctx: R.ctx };
const timed = (n, draw) => {
    R.canvas = M; R.ctx = mctx; R._vignetteGradient = null;
    try {
        for (let i = 0; i < 10; i++) { draw(); sctx.drawImage(M, 0, 0, 64, 64); }
        sctx.getImageData(0, 0, 1, 1);
        const t0 = performance.now();
        for (let i = 0; i < n; i++) { draw(); sctx.drawImage(M, (i % 8) * 64, 0, 64, 64); }
        sctx.getImageData(0, 0, 1, 1);
        return +((performance.now() - t0) / n).toFixed(2);
    } finally { R.canvas = real.canvas; R.ctx = real.ctx; R._vignetteGradient = null; }
};
// A GPU yardstick that never touches the game: 40 big blurred shadows.
window.yardstick = () => timed(60, () => {
    mctx.clearRect(0, 0, M.width, M.height);
    for (let i = 0; i < 40; i++) {
        mctx.save(); mctx.shadowBlur = 40; mctx.shadowColor = 'rgba(0,0,0,0.5)'; mctx.fillStyle = '#884';
        mctx.fillRect((i * 97) % (M.width - 200), (i * 53) % (M.height - 200), 200, 200); mctx.restore();
    }
});
window.frame = (before = () => {}) => timed(60, () => { before(); R.renderFrame(g); });
window.median = (f) => { const v = [f(), f(), f()].sort((a, b) => a - b); return v[1]; };
await g._loadMap('sewer-map.json');
const e = g.enemies.find((x) => x.entity.isAlive() && !x.ambient && x.allegiance === 'hostile' && (x.sightRange || 0) > 0
    && [-3, -2, -1].every((dx) => g.map.isWalkable(x.x + dx, x.y) && !g._targetAt(x.x + dx, x.y)));
g.playerX = e.x - 3; g.playerY = e.y; e._lastDx = -1; e._lastDy = 0; e.state = 'chasing';
for (let i = 0; i < 30; i++) g._render();   // dev: the arena finishes easing in; the branch: the fight is stamped
({ dpr: devicePixelRatio, canvas: [R.canvas.width, R.canvas.height] })
```

Expected: both tabs report the same `dpr` and `canvas`, `[3440, 1440]` at DPR 1. If they differ, fix the tab sizes before timing.

- [ ] **Step 3: Time both, alternating**

In each tab, one after the other, twice, run:

```js
[median(yardstick), median(() => frame())]
```

On the branch, set the fight as long settled first: `g._fightStart.at = performance.now() - 5000`.

Then, on the branch only:

```js
({
    rolling:  median(() => frame(() => { g._fightStart.at = performance.now() - 500; })),
    entrance: median(() => frame(() => { g._fightStart.at = performance.now() - 50; })),
    fogOn:    (() => { g._fightStart.at = performance.now() - 5000; return median(() => frame()); })(),
    fogOff:   (() => { const d = R._drawFightFog; R._drawFightFog = () => {}; try { return median(() => frame()); } finally { R._drawFightFog = d; } })(),
})
```

Write down every number. The yardstick shows how busy the GPU is; only the comparison between the tabs, taken close together, means anything. If the yardstick reads more than half again its earlier value, the machine is busy. Say so in the write-up and trust the in-page on/off pair over the cross-tab pair.

- [ ] **Step 4: Tear down**

Run `preview_stop` on the vt-before server. Then:

```bash
cd C:/Code/violencetown && git worktree remove .claude/worktrees/fight-fog-before
```

Remove the `vt-before` entry from `.claude/launch.json`, and run `resize_window {preset: "desktop"}` on the remaining tab.

---

## Task 13: Write it down, push, hand over

**Files:** Modify `plans/fight-fog.md`, `CLAUDE.md`

- [ ] **Step 1: The spec records what was built and measured**

In `plans/fight-fog.md`, replace the line `**Status:** Design (approved section by section, 2026-09-14).` with:

```markdown
**Status:** Built on `feature/fight-fog` (<today's date>), awaiting Caelan's merge call. Plan: `plans/fight-fog-implementation.md`.
```

Add a `## Measured` section above `## Out of scope`, with Task 12's numbers:

```markdown
## Measured

A Sewer fight frame at 3440×1440, DPR <dpr>, <date>: the twin-canvas method
(`plans/screen-fill-implementation.md`, Task 10's note), median of three, ms per frame. Before is
`dev` served from a worktree beside the branch, timed alternately.

| | Before: the spotlight | After: the fog |
|---|---|---|
| GPU yardstick (40 blurred shadows, no game) | <ms> | <ms> |
| The fight, settled | <ms> | <ms> |
| The fog rolling in (its mask rebuilt every frame) | — | <ms> |
| The entrance's heaviest frame (impact and zoom) | — | <ms> |
| In one page: fog drawn / skipped | — | <ms> / <ms> |

<One or two sentences on what the numbers say, including whether the yardstick showed a busy machine.>
```

- [ ] **Step 2: CLAUDE.md learns the fight is fog**

In `CLAUDE.md` under `## Recent infrastructure (since v0.8.0)`, after the viewport bullet, add:

```markdown
- **A fight is fog of war, not a spotlight** (plans/fight-fog.md). `game/fight-area.js` says who
  is in the fight and what they can see; `main.js _trackFight` stamps `game._fightOn`,
  `_fightStart` (how it began, and its entrance) and `_fightEndedAt` before every frame; the
  renderer draws the fog (`_drawFightFog`) and the entrance (`_drawEntrance`) from those alone,
  timed by `game/fight-entrance.js`. `_drawArena` and `_arenaLevel` are gone.
```

- [ ] **Step 3: The whole suite and the naming rule**

```bash
cd C:/Code/violencetown && npm test 2>&1 | tail -8 && git grep -iE 'violence[ _-]+town' -- ':!CLAUDE.md' ':!plans/item-hotbar-xmb-implementation.md'
```

Expected: `# fail 0`, and a `# pass` count 76 above Task 0's baseline: 12 + 25 + 25 + 14 across the four new files. The `git grep` prints nothing.

- [ ] **Step 4: Commit and push the branch**

```bash
cd C:/Code/violencetown && git add plans/fight-fog.md CLAUDE.md && git commit -F - <<'EOF'
plan(fight-fog): built — the spec records its speed; CLAUDE.md learns a fight is fog

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
git push -u origin feature/fight-fog
```

- [ ] **Step 5: Update the memory's resume note**

Update `violencetown-current-work.md`: F1 is built on `feature/fight-fog` and pushed, awaiting Caelan's merge call; Task 12's headline numbers; next in his order is the quest-1 autoplay spec.

- [ ] **Step 6: Hand over**

Tell Caelan what was built and measured, and link the final GIFs from Task 10 Step 8. The merge to `dev` is his call. When he makes it, follow CLAUDE.md: merge, restart the server, load the game, run a Sewer fight, check the console, and only then commit the merge.
