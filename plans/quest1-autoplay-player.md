# Quest-1 Autoplay — Stages 4-6 Implementation Plan (the player, the record, watch mode)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The standard fighter plays quest 1 end to end on its own — or fails in a way that names why — and every run is scored against a committed golden, watchable at a chosen speed, and capturable as a GIF.

**Architecture:** `route.js` is the only file that knows quest 1 (stage id → goals named by id). `player.js` is the standard fighter as a pure function: a plain *view* of the game plus the current goals in, one action out. `run.js` builds the view from the live game, executes the action through real keys (E to hit, the wheel for diagonals and eating, arrows to walk and to bump barricades), scores each stage, and paces the virtual clock for watching. The runner gains `--check` / `--write` against `tools/autoplay-golden.json`, `--speed`, and `--gif`.

**Tech Stack:** as stages 1-3 — vanilla ES modules, `node --test`, Node 24 built-ins, the installed Chrome — plus Python 3 + Pillow 12 (already installed) to stitch GIF frames.

**Spec:** `plans/quest1-autoplay.md`, build stages 4-6, all rulings taken as recommended. Builds on `plans/quest1-autoplay-implementation.md` (stages 1-3, on `feature/quest1-autoplay`). Same branch.

---

## Facts this plan relies on (verified 2026-09-21 — by code reading, then measured where it matters)

**Keys (read from main.js, then used in the stage-3 runs):**
- **E hits a hostile you face.** It runs `defaultVerb`: take an item on that tile, else `hit` a hostile. `hit` is `combatAttack` + `_advanceWorld` — one key, one turn (`main.js` ~1361, ~3160). E on a *diagonal* is impossible (E reads the faced tile, 4 directions).
- **The wheel** (default `wheelOpenMode: 'tap-toggle'`): Space opens it (state `radial_menu`); KeyD cycles the ring; Space drills in, and on a leaf either fires or starts aiming; Space commits the aim; Escape backs out a level. The ring reopens at the index it was last left at, so navigate by `selectedNode(g.wheel).key`, never by position. Hit auto-aims at the nearest hostile in reach, including diagonals. **Trap:** a Space in `idle` within 250 ms of the previous one *repeats the last action* (`main.js` ~1329). On the virtual clock an instant action takes 0 ms, so always idle ≥ 260 ms before opening the wheel.
- **Treat > Eat** eats `game.barSlot('eat')`; with no food it is greyed and a drill only bumps.
- **Walking:** zone changes are automatic one step after entering a `transitions` tile; pickups are automatic on stepping; walking into a *faced* hostile hits it; **walking into a barricade (tile 23) bumps it** (2 bumps a cell, a turn each, then it is floor).
- **The car:** any tile of its 2×2 block (tile 19) resolves to the `car` examinable (`_targetAt`). E from an open tile beside it examines it, or — holding the converter — installs it and force-completes `fix_car`. Examine opens the inspect panel (state `inspect`); Escape closes it.
- **Death** needs no key: state `dead`, then a 500 ms timer runs `_resolveDefeat`. A boss defeat resets the boss to full HP and wakes the player at the map's safe cell with full HP.
- **A finished quest** is pushed onto `questEngine.state.completed` (`quests.js:240`).

**Quest 1's fight (measured in the running game, 2026-09-21):**
- The wooden sword deals **4** to the Wererat (10 − armor 6). Measured 100 → 96 → 92 …
- Hit from the side, the Wererat stayed `suspicious` for 12 turns: it **never attacked and never healed**. The damage the player took, 10 a turn, came from the Red Fungus at (16,7) joining in. The player fell with the boss at 52.
- So whether the standard fighter can finish is **not known in advance**, and this plan does not try to engineer it. The player plays the ruled profile; the run reports what happened. If it cannot finish, that is the eval's first finding (spec §8), and tuning the fight or the profile is Caelan's ruling.

**The sewer** (20×20, read off the running game): the main hall is rows 9-11, x 1-18. The Fungus King stands at (15,10) and the Wererat at (17,10). There are 2 bandages at (8,10) and rocks at (2,10). The escape's portcullis drops at (13,10) and its barricade fills (1,9)-(1,11). The only exit is (0,10), and only from (1,10).

## File structure

| File | Responsibility |
|---|---|
| `game/autoplay/route.js` (create) | `ROUTES.fix_car`: stage id → goals, by id. |
| `game/autoplay/player.js` (create) | `decide(view, goals, knobs)`, `goalDone`, `currentGoal`, `KNOBS`. Pure. |
| `game/autoplay/run.js` (replace) | The view, the action executors, the route loop and its score, watch pacing, stop and hand-back. |
| `game/autoplay/boot.js` (modify) | The `speed` option. |
| `tools/autoplay.mjs` (modify) | `--speed`, `--check`, `--write`, `--gif`. |
| `tools/frames_to_gif.py` (create) | Stitch PNG frames into a GIF. |
| `tools/autoplay-golden.json` (create, by `--write`) | The committed baseline. |
| `package.json` (modify) | `autoplay:check`, `autoplay:write`. |
| `tests/autoplay-route.test.js`, `tests/autoplay-player.test.js` (create) | The route's ids exist; the player's every rule. |

---

### Task 1: The route

**Files:**
- Create: `game/autoplay/route.js`
- Test: `tests/autoplay-route.test.js`

- [ ] **Step 1: Write the failing test**

```js
// autoplay-route.test.js — quest 1 as goals, and every id they name is real.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { QUESTS } from '../game/quests.js';
import { ITEMS } from '../game/items.js';
import { ROUTES } from '../game/autoplay/route.js';

const map = (f) => JSON.parse(readFileSync(new URL(`../game/${f}`, import.meta.url), 'utf8'));
const goals = Object.values(ROUTES.fix_car).flat();

describe('the quest-1 route', () => {
    test('every stage of fix_car has goals, and no goal names a stage that is not there', () => {
        assert.deepEqual(Object.keys(ROUTES.fix_car), QUESTS.fix_car.stages.map((s) => s.id));
    });

    test('every map a goal names exists', () => {
        for (const g of goals) {
            const f = g.map || g.reach;
            if (f) assert.ok(existsSync(new URL(`../game/${f}`, import.meta.url)), `${f} is not in game/`);
        }
    });

    test('town and sewer connect both ways — the player only travels to neighbouring maps', () => {
        assert.ok(map('town-map.json').transitions.some((t) => t.toMap === 'sewer-map.json'));
        assert.ok(map('sewer-map.json').transitions.some((t) => t.toMap === 'town-map.json'));
    });

    test('every id a goal names exists where it says', () => {
        for (const g of goals) {
            if (g.use) assert.ok(map(g.map).examinables.some((e) => e.id === g.use), `no examinable ${g.use} in ${g.map}`);
            if (g.kill) assert.ok(map(g.map).enemies.some((e) => e.tag === g.kill), `no enemy tagged ${g.kill} in ${g.map}`);
            if (g.take) assert.ok(ITEMS[g.take], `no item ${g.take}`);
        }
    });
});
```

- [ ] **Step 2: Run it to see it fail** — `node --test tests/autoplay-route.test.js` → FAIL, module not found.

- [ ] **Step 3: Write route.js**

```js
// route.js — quest 1 as goals, named by id (plans/quest1-autoplay.md §4 B).
// The only file that knows quest 1. Each fix_car stage maps to goals worked in
// order; player.js decides how, from live map data, so a map edit moves the
// route with it. The quest engine advancing a stage is what ends its goals.
//
//   use    walk to an open tile beside the examinable, face it, press E
//   kill   hit the enemy with this tag until it is gone
//   take   walk onto the item — pickups are automatic
//   reach  walk into the transition to that map

export const ROUTES = {
    fix_car: {
        examine_car:       [{ use: 'car', map: 'town-map.json' }],
        recover_converter: [{ kill: 'wererat_boss', map: 'sewer-map.json' }, { take: 'catalytic_converter', map: 'sewer-map.json' }],
        escape_sewer:      [{ reach: 'town-map.json' }],
        return_to_car:     [{ use: 'car', map: 'town-map.json' }],
    },
};
```

- [ ] **Step 4: Run it to see it pass** — PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add game/autoplay/route.js tests/autoplay-route.test.js
git commit -m "feat(autoplay): quest 1 as goals named by id — the one file that knows the quest"
```

---

### Task 2: The standard fighter

**Files:**
- Create: `game/autoplay/player.js`
- Test: `tests/autoplay-player.test.js`

- [ ] **Step 1: Write the failing test**

```js
// autoplay-player.test.js — the standard fighter's rules, one at a time.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { decide, goalDone, BARRICADE } from '../game/autoplay/player.js';

// A game as the player sees it. Rows: '.' open, '#' wall, 'B' barricade.
function view({ rows, player, enemies = [], items = [], hp = 100, maxHp = 100, canEat = false,
                mapUrl = 'town-map.json', transitions = [], inventory = [], targets = {} }) {
    return {
        mapUrl, width: rows[0].length, height: rows.length, player, hp, maxHp, canEat,
        isWalkable: (x, y) => rows[y]?.[x] === '.',
        tileAt: (x, y) => (rows[y]?.[x] === 'B' ? BARRICADE : rows[y]?.[x] === '.' ? 1 : 0),
        transitions, enemies, items, inventory,
        targetIdAt: (x, y) => targets[`${x},${y}`] ?? null,
    };
}
const open = ['.....', '.....', '.....'];
const far = [{ reach: 'nowhere.json' }];   // a goal that keeps the fighter busy elsewhere

describe('the standard fighter', () => {
    test('eats below the heal threshold when it has food', () => {
        assert.equal(decide(view({ rows: open, player: { x: 0, y: 0 }, hp: 39, canEat: true }), far).kind, 'eat');
    });
    test('does not try to eat with nothing to eat', () => {
        assert.notEqual(decide(view({ rows: open, player: { x: 0, y: 0 }, hp: 10 }), far).kind, 'eat');
    });
    test('does not eat above the threshold', () => {
        assert.notEqual(decide(view({ rows: open, player: { x: 0, y: 0 }, hp: 41, canEat: true }), far).kind, 'eat');
    });

    test('hits an adjacent hostile, facing it', () => {
        const a = decide(view({ rows: open, player: { x: 1, y: 1 }, enemies: [{ x: 2, y: 1, hp: 50, hostile: true, tag: null }] }), far);
        assert.deepEqual(a, { kind: 'attack', at: { x: 2, y: 1 }, dir: 'right' });
    });
    test('a diagonal hostile is hit through the wheel (no facing)', () => {
        const a = decide(view({ rows: open, player: { x: 1, y: 1 }, enemies: [{ x: 2, y: 2, hp: 50, hostile: true, tag: null }] }), far);
        assert.equal(a.kind, 'attack');
        assert.equal(a.dir, null);
    });
    test('walks past an adjacent neutral', () => {
        const a = decide(view({ rows: open, player: { x: 1, y: 1 }, enemies: [{ x: 2, y: 1, hp: 50, hostile: false, tag: null }] }), far);
        assert.notEqual(a.kind, 'attack');
    });
    test('the quarry comes first, however healthy', () => {
        const enemies = [{ x: 0, y: 1, hp: 10, hostile: true, tag: null }, { x: 2, y: 1, hp: 90, hostile: true, tag: 'wererat_boss' }];
        const a = decide(view({ rows: open, player: { x: 1, y: 1 }, enemies, mapUrl: 'sewer-map.json' }), [{ kill: 'wererat_boss', map: 'sewer-map.json' }]);
        assert.deepEqual(a.at, { x: 2, y: 1 });
    });
    test('otherwise the weakest adjacent hostile', () => {
        const enemies = [{ x: 0, y: 1, hp: 90, hostile: true, tag: null }, { x: 2, y: 1, hp: 30, hostile: true, tag: null }];
        assert.deepEqual(decide(view({ rows: open, player: { x: 1, y: 1 }, enemies }), far).at, { x: 2, y: 1 });
    });

    test('on the wrong map it heads for the way there', () => {
        const a = decide(view({ rows: open, player: { x: 2, y: 1 }, mapUrl: 'sewer-map.json',
            transitions: [{ x: 0, y: 1, toMap: 'town-map.json' }] }), [{ use: 'car', map: 'town-map.json' }]);
        assert.deepEqual(a, { kind: 'step', dir: 'left' });
    });
    test('kill: walks to stand beside the quarry', () => {
        const a = decide(view({ rows: open, player: { x: 0, y: 1 }, mapUrl: 'sewer-map.json',
            enemies: [{ x: 4, y: 1, hp: 100, hostile: false, tag: 'wererat_boss' }] }), [{ kill: 'wererat_boss', map: 'sewer-map.json' }]);
        assert.deepEqual(a, { kind: 'step', dir: 'right' });
    });
    test('take: walks onto the item', () => {
        const a = decide(view({ rows: open, player: { x: 1, y: 0 }, mapUrl: 'sewer-map.json',
            items: [{ type: 'catalytic_converter', x: 1, y: 2 }] }), [{ take: 'catalytic_converter', map: 'sewer-map.json' }]);
        assert.deepEqual(a, { kind: 'step', dir: 'down' });
    });
    test('use: beside the target it uses it, facing it', () => {
        const rows = ['#.#', '...'];
        const a = decide(view({ rows, player: { x: 1, y: 1 }, targets: { '1,0': 'car' } }), [{ use: 'car', map: 'town-map.json' }]);
        assert.deepEqual(a, { kind: 'use', dir: 'up' });
    });
    test('use: elsewhere it walks to the nearest place to use it from', () => {
        const rows = ['###', '...'];
        const a = decide(view({ rows, player: { x: 0, y: 1 }, targets: { '1,0': 'car' } }), [{ use: 'car', map: 'town-map.json' }]);
        assert.deepEqual(a, { kind: 'step', dir: 'right' });
    });
    test('a barricade in the way is walked into, not around', () => {
        const a = decide(view({ rows: ['.B.'], player: { x: 0, y: 0 }, mapUrl: 'sewer-map.json',
            transitions: [{ x: 2, y: 0, toMap: 'town-map.json' }] }), [{ reach: 'town-map.json' }]);
        assert.deepEqual(a, { kind: 'step', dir: 'right' });
    });
    test('boxed in, it waits and says why', () => {
        const a = decide(view({ rows: ['...'], player: { x: 0, y: 0 }, mapUrl: 'sewer-map.json',
            enemies: [{ x: 1, y: 0, hp: 100, hostile: false, tag: null }],
            transitions: [{ x: 2, y: 0, toMap: 'town-map.json' }] }), [{ reach: 'town-map.json' }]);
        assert.equal(a.kind, 'wait');
        assert.match(a.why, /town-map\.json/);
    });
});

describe('when a goal is met', () => {
    const boss = { x: 1, y: 1, hp: 100, hostile: true, tag: 'wererat_boss' };
    const kill = { kill: 'wererat_boss', map: 'sewer-map.json' };
    test('kill: only on its own map, and only once the quarry is gone', () => {
        assert.equal(goalDone(view({ rows: open, player: { x: 0, y: 0 }, mapUrl: 'town-map.json' }), kill), false);
        assert.equal(goalDone(view({ rows: open, player: { x: 0, y: 0 }, mapUrl: 'sewer-map.json', enemies: [boss] }), kill), false);
        assert.equal(goalDone(view({ rows: open, player: { x: 0, y: 0 }, mapUrl: 'sewer-map.json' }), kill), true);
    });
    test('take: once it is carried', () => {
        const take = { take: 'catalytic_converter', map: 'sewer-map.json' };
        assert.equal(goalDone(view({ rows: open, player: { x: 0, y: 0 } }), take), false);
        assert.equal(goalDone(view({ rows: open, player: { x: 0, y: 0 }, inventory: ['catalytic_converter'] }), take), true);
    });
    test('reach: on arrival', () => {
        assert.equal(goalDone(view({ rows: open, player: { x: 0, y: 0 }, mapUrl: 'town-map.json' }), { reach: 'town-map.json' }), true);
    });
    test('use: never by itself — the quest moving on ends it', () => {
        assert.equal(goalDone(view({ rows: open, player: { x: 0, y: 0 } }), { use: 'car', map: 'town-map.json' }), false);
    });
});
```

- [ ] **Step 2: Run it to see it fail** — `node --test tests/autoplay-player.test.js` → FAIL, module not found.

- [ ] **Step 3: Write player.js**

```js
// player.js — the standard fighter (plans/quest1-autoplay.md §7, ruling Q1-2).
// One decision per call, from a plain view of the game:
//   1. below the heal threshold, with food: eat
//   2. a hostile beside you (or the quarry): hit it — the quarry first,
//      otherwise the weakest
//   3. otherwise work the current goal: get to its map, then use / kill / take
//      / reach it
// Pure — run.js builds the view from the live game — so every rule is tested
// in node.

import { pathTo } from './path.js';

export const KNOBS = { healBelow: 0.4 };
export const BARRICADE = 23;   // sewer-setpiece.js: two bumps and it is floor

const STEP = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const dirTo = (from, to) =>
    Object.keys(STEP).find((d) => from.x + STEP[d][0] === to.x && from.y + STEP[d][1] === to.y) || null;
const around = (p) => Object.entries(STEP).map(([dir, [dx, dy]]) => ({ x: p.x + dx, y: p.y + dy, dir }));

export function goalDone(view, goal) {
    if (goal.kill) return view.mapUrl === goal.map && !view.enemies.some((e) => e.tag === goal.kill);
    if (goal.take) return view.inventory.includes(goal.take);
    if (goal.reach) return view.mapUrl === goal.reach;
    return false;   // `use` ends when the quest engine moves on
}

export const currentGoal = (view, goals) => goals.find((g) => !goalDone(view, g)) || null;

export function decide(view, goals, knobs = KNOBS) {
    if (view.hp < knobs.healBelow * view.maxHp && view.canEat) return { kind: 'eat' };

    const goal = currentGoal(view, goals);
    const quarry = goal && goal.kill;
    const beside = view.enemies.filter((e) => cheb(e, view.player) === 1 && (e.hostile || (quarry && e.tag === quarry)));
    if (beside.length) {
        const t = beside.find((e) => quarry && e.tag === quarry) || beside.reduce((a, b) => (b.hp < a.hp ? b : a));
        return { kind: 'attack', at: { x: t.x, y: t.y }, dir: dirTo(view.player, t) };
    }
    if (!goal) return { kind: 'wait', why: 'every goal of this stage is met, and the quest has not moved on' };

    const where = goal.reach || goal.map;
    if (where && view.mapUrl !== where) {
        return toward(view, view.transitions.filter((t) => t.toMap === where), `the way to ${where}`);
    }
    if (goal.kill) {
        const t = view.enemies.find((e) => e.tag === goal.kill);
        return toward(view, around(t), `the ${goal.kill}`);
    }
    if (goal.take) {
        return toward(view, view.items.filter((i) => i.type === goal.take), goal.take);
    }
    if (goal.use) {
        const stands = standsFor(view, goal.use);
        const here = stands.find((s) => s.x === view.player.x && s.y === view.player.y);
        if (here) return { kind: 'use', dir: here.dir };
        return toward(view, stands, goal.use);
    }
    return { kind: 'wait', why: `a goal this player does not know: ${JSON.stringify(goal)}` };
}

// Open tiles with a side neighbour that is `id` — where E reaches it.
function standsFor(view, id) {
    const out = [];
    for (let y = 0; y < view.height; y++) {
        for (let x = 0; x < view.width; x++) {
            if (!view.isWalkable(x, y)) continue;
            for (const n of around({ x, y })) {
                if (view.targetIdAt(n.x, n.y) === id) out.push({ x, y, dir: n.dir });
            }
        }
    }
    return out;
}

// One step along the shortest open path to any of `tiles`. Characters block;
// barricades do not — walking into one is how it breaks.
function toward(view, tiles, what) {
    const occupied = (x, y) => view.enemies.some((e) => e.x === x && e.y === y);
    const isOpen = (x, y) => (view.isWalkable(x, y) || view.tileAt(x, y) === BARRICADE) && !occupied(x, y);
    let best = null;
    for (const t of tiles) {
        const p = pathTo(isOpen, view.player, t);
        if (p && (!best || p.length < best.length)) best = p;
    }
    if (!best) return { kind: 'wait', why: `no way to ${what} from ${view.player.x},${view.player.y}` };
    if (!best.length) return { kind: 'wait', why: `at ${what}, and nothing happened` };
    return { kind: 'step', dir: best[0] };
}
```

- [ ] **Step 4: Run it to see it pass** — PASS, 19 tests.

- [ ] **Step 5: Mutation-check** — temporarily drop the quarry preference, making the line `const t = beside.reduce((a, b) => (b.hp < a.hp ? b : a));`. The "quarry comes first" test must fail. Restore it and confirm the file passes.

- [ ] **Step 6: Commit**

```bash
git add game/autoplay/player.js tests/autoplay-player.test.js
git commit -m "feat(autoplay): the standard fighter — heal low, hit what is beside you, then the goal"
```

---

### Task 3: The driver plays a route

**Files:**
- Replace: `game/autoplay/run.js`
- Modify: `game/autoplay/boot.js` (the `speed` option)

- [ ] **Step 1: The speed option** — in `boot.js`'s `opts`, after `jitter`, add:

```js
        speed: params.has('speed') ? Math.max(0, Number(params.get('speed')) || 0) : 1,
```

and extend the header comment's option list with:

```js
//   &speed=4                      watch at 4x; speed=0 is as fast as the machine
//                                 allows (the runner's default). A person opening
//                                 ?autoplay gets 1x.
```

and, so the headless runner is not paced at the new 1x default, in `tools/autoplay.mjs` `runOnce` after `if (o.jitter) q.set('jitter', '1');` add `q.set('speed', '0');` (Task 4 turns it into an option).

- [ ] **Step 2: Replace run.js** with:

```js
// run.js — the autoplay driver (plans/quest1-autoplay.md §5.1). Loaded by
// boot.js only under ?autoplay. Plays a script against the real game — real
// key events into the real input handler — on the virtual clock, and returns a
// report. A script is a fixed list of ops (`car`, stage 3) or a route the
// standard fighter plays until the quest completes (`quest`).

import { FRAME_MS } from './clock.js';
import { pathTo, DIR_CODES } from './path.js';
import { fingerprint } from './fingerprint.js';
import { decide, KNOBS } from './player.js';
import { ROUTES } from './route.js';
import { QUESTS } from '../quests.js';
import { isHostile } from '../ai.js';
import { selectedNode, activeRing } from '../wheel-model.js';

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
    // All of quest 1, played by the standard fighter.
    quest: { route: 'fix_car' },
};

const KEY = { KeyE: 'e', KeyT: 't', KeyD: 'd', Space: ' ' };
const REPEAT_GAP_MS = 260;      // a Space within 250 ms of the last one repeats the last action (main.js ~1329)
const BEAT_MS = 200;            // game time after every action — identical watched or headless
const STAGE_TURN_BUDGET = 400;
const MAX_WAITS = 60;
const MAX_DEATHS = 3;

export async function run(ap) {
    const t0 = ap.real.now();
    const vt0 = ap.clock ? ap.clock.now() : null;
    const g = await waitForGame(ap);
    const d = driver(ap, g);
    const watching = ap.opts.speed > 0;
    const label = watching ? showLabel(`AUTOPLAY · seed ${ap.opts.seed} · x${ap.opts.speed} · any key or tap stops it`) : null;
    const stop = (e) => {
        if (!e.isTrusted) return;
        ap.stopRequested = true;
        e.preventDefault();
        e.stopImmediatePropagation();
    };
    if (watching) { window.addEventListener('keydown', stop, true); window.addEventListener('pointerdown', stop, true); }

    let outcome = { finished: false, failure: null, stages: [] };
    const script = SCRIPTS[ap.opts.script];
    try {
        if (!script) throw new Error(`no script named "${ap.opts.script}"`);
        document.getElementById('splash-go').click();
        await d.settle();
        await g._fullReset({ seed: ap.opts.seed });
        await d.settle();
        outcome = script.route ? await d.playRoute(script.route) : await d.playOps(script);
    } catch (e) {
        outcome = { ...outcome, failure: String((e && e.stack) || e) };
    }

    const errors = [...ap.errors];
    const report = {
        ok: outcome.finished && !outcome.failure && errors.length === 0,
        finished: outcome.finished,
        reason: outcome.failure ?? (errors.length ? 'errors on the page' : null),
        seed: ap.opts.seed, script: ap.opts.script, clock: ap.opts.clock,
        fingerprint: fingerprint(g),
        turn: g.turn,
        deaths: d.deaths(),
        quest: { id: g.questEngine.state.activeId, stage: g.questEngine.state.stageIndex },
        at: { map: g._mapUrl, x: g.playerX, y: g.playerY },
        stages: outcome.stages,
        virtualMs: ap.clock ? ap.clock.now() - vt0 : null,
        realMs: Math.round(ap.real.now() - t0),
        errors,
    };
    if (watching) {
        window.removeEventListener('keydown', stop, true);
        window.removeEventListener('pointerdown', stop, true);
        label.textContent = report.finished ? `AUTOPLAY · quest 1 done in ${report.turn} turns` : `AUTOPLAY · ${report.reason}`;
        ap.real.setTimeout(() => label.remove(), 6000);
        handBack(ap);
    }
    return report;
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

// The game as the player sees it — plain data and lookups, so player.js
// stays pure.
function view(g) {
    const m = g.map;
    return {
        mapUrl: g._mapUrl, width: m.width, height: m.height,
        player: { x: g.playerX, y: g.playerY },
        hp: g.playerHp, maxHp: g.playerMaxHp,
        canEat: g.barSlot('eat') >= 0,
        isWalkable: (x, y) => m.isWalkable(x, y),
        tileAt: (x, y) => m.getTile(x, y),
        transitions: (m.transitions || []).map((t) => ({ x: t.x, y: t.y, toMap: t.toMap })),
        enemies: g.enemies.filter((e) => e.entity.isAlive())
            .map((e) => ({ x: e.x, y: e.y, hp: e.entity.hp, hostile: isHostile(e), tag: e.tag || null })),
        items: g.groundItems.map((i) => ({ type: i.type, x: i.x, y: i.y })),
        inventory: g.inventory.filter(Boolean).map((s) => s.itemDef.id),
        targetIdAt: (x, y) => g._targetAt(x, y)?.examinable?.id ?? null,
    };
}

function driver(ap, g) {
    // A real macrotask with no 4 ms clamp: long enough for every promise the
    // last callback started to settle, short enough to run thousands a second.
    const channel = new MessageChannel();
    const macrotask = () => new Promise((r) => { channel.port1.onmessage = () => r(); channel.port2.postMessage(0); });
    const realSleep = (ms) => new Promise((r) => ap.real.setTimeout(r, ms));
    let deaths = 0;

    // Game time never moves while a request is in flight. Watching, each
    // frame of game time also takes FRAME_MS / speed of real time.
    const quiesce = async () => { do { await macrotask(); } while (ap.inflight() > 0); };
    const tick = async () => {
        if (!ap.clock) await realSleep(FRAME_MS);
        else {
            if (ap.opts.speed > 0) await realSleep(FRAME_MS / ap.opts.speed);
            ap.clock.advance(FRAME_MS);
        }
        await quiesce();
    };
    const busy = () => g._animating || g._turnTimer || ap.inflight() > 0 || g.state === 'resolving' || g.state === 'dead';

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
    async function press(code) {
        key('keydown', code);
        key('keyup', code);
        if (g.state === 'dead') deaths++;   // _die runs inside the turn the key started
        await settle();
    }
    async function idle(ms) { for (let t = 0; t < ms; t += FRAME_MS) await tick(); await settle(); }

    // From a standstill a tap toward a new facing only turns (main.js
    // _beginMoveOrTurn), so facing is its own press.
    async function face(dir) {
        if (g.facing !== dir) await press(DIR_CODES[dir]);
        return g.facing === dir ? null : `could not face ${dir}`;
    }

    // Open the wheel and fire the leaf at `keys` (e.g. ['treat', 'eat']),
    // choosing each ring's slice by name — the ring reopens wherever it was
    // last left, and can be padded, so positions mean nothing.
    async function wheel(keys) {
        await idle(REPEAT_GAP_MS);
        await press('Space');
        if (g.state !== 'radial_menu') return 'the wheel did not open';
        for (const want of keys) {
            const size = activeRing(g.wheel).length || 1;
            for (let n = 0; n < size && selectedNode(g.wheel)?.key !== want; n++) await press('KeyD');
            if (selectedNode(g.wheel)?.key !== want) { await closeWheel(); return `no "${want}" on the wheel`; }
            await press('Space');   // drill in; on a leaf this fires, or starts aiming
            if (g.state !== 'radial_menu') return null;
        }
        if (g.wheel.aiming) await press('Space');   // commit the auto-aimed reticle
        if (g.state === 'radial_menu') { await closeWheel(); return `${keys.join(' > ')} would not fire`; }
        return null;
    }
    async function closeWheel() { for (let n = 0; n < 6 && g.state === 'radial_menu'; n++) await press('Escape'); }

    const leftIdle = () => (g.state === 'idle' ? null : `left the game in state "${g.state}"`);

    async function act(a) {
        if (a.kind === 'eat') return wheel(['treat', 'eat']);
        if (a.kind === 'attack') {
            if (!a.dir) return wheel(['fight', 'melee', 'hit']);
            const turned = await face(a.dir);
            if (turned) return turned;
            await press('KeyE');
            return null;
        }
        if (a.kind === 'step') {
            const turned = await face(a.dir);
            if (turned) return turned;
            await press(DIR_CODES[a.dir]);
            return leftIdle();
        }
        if (a.kind === 'use') {
            const turned = await face(a.dir);
            if (turned) return turned;
            await press('KeyE');
            if (g.state === 'inspect') await press('Escape');
            return leftIdle();
        }
        if (a.kind === 'wait') { await press('KeyT'); return null; }
        return `an action this driver does not know: ${a.kind}`;
    }

    // The standard fighter plays `name` until the quest completes, a stage runs
    // out of turns, the player dies MAX_DEATHS times, or it is stopped. Each
    // stage is scored as it is played.
    async function playRoute(name) {
        const quest = QUESTS[name], route = ROUTES[name], q = g.questEngine;
        const stages = [];
        let cur = null, waits = 0;
        const close = () => { if (cur) { cur.turns = g.turn - cur.startTurn; cur.gold = g.gold - cur.startGold; } };
        const result = (failure) => {
            close();
            for (const s of stages) { delete s.startTurn; delete s.startGold; }
            return { finished: !failure, failure, stages };
        };
        for (;;) {
            if (ap.stopRequested) return result('stopped by the player');
            if ((q.state.completed || []).includes(name)) return result(null);
            if (q.state.activeId !== name) return result(`quest ${name} is not active (active: ${q.state.activeId})`);
            const stageId = quest.stages[q.state.stageIndex]?.id;
            if (!cur || cur.id !== stageId) {
                close();
                cur = { id: stageId, turns: 0, hpLost: 0, healed: 0, eats: 0, attacks: 0, deaths: 0, gold: 0, startTurn: g.turn, startGold: g.gold };
                stages.push(cur);
                waits = 0;
            }
            if (g.turn - cur.startTurn > STAGE_TURN_BUDGET) return result(`${stageId}: unfinished after ${STAGE_TURN_BUDGET} turns`);
            if (deaths >= MAX_DEATHS) return result(`${stageId}: died ${deaths} times, last to ${killer()}`);
            const goals = route[stageId];
            if (!goals) return result(`no route for stage ${stageId}`);

            const a = decide(view(g), goals, KNOBS);
            if (a.kind === 'wait' && ++waits > MAX_WAITS) return result(`${stageId}: stuck — ${a.why}`);
            if (a.kind !== 'wait') waits = 0;
            const hp = g.playerHp, died = deaths;
            const failure = await act(a);
            if (failure) return result(`${stageId}: ${failure}`);
            if (deaths > died) { cur.deaths += deaths - died; cur.hpLost += hp; }
            else if (g.playerHp < hp) cur.hpLost += hp - g.playerHp;
            else cur.healed += g.playerHp - hp;
            if (a.kind === 'eat') cur.eats++;
            if (a.kind === 'attack') cur.attacks++;
            await idle(BEAT_MS);
        }
    }
    const killer = () => {
        const k = g._lastDefeatedBy;
        return (k && (k.type || k.name || k.cause)) || 'something';
    };

    // Stage 3's fixed scripts.
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
    async function playOps(script) {
        for (const o of script.ops) {
            if (ap.opts.jitter) await realSleep(Math.floor(Math.random() * 400));
            const failure = await op(o);
            if (failure) return { finished: false, failure, stages: [] };
        }
        const miss = script.expect(g);
        return { finished: !miss, failure: miss, stages: [] };
    }

    return { settle, playRoute, playOps, deaths: () => deaths };
}

function showLabel(text) {
    const el = document.createElement('div');
    el.id = 'autoplay-label';
    el.textContent = text;
    Object.assign(el.style, {
        position: 'fixed', top: '8px', left: '50%', transform: 'translateX(-50%)', zIndex: '9999',
        padding: '4px 10px', font: '18px VT323, monospace', color: '#fff3d0',
        background: 'rgba(20, 12, 8, 0.85)', border: '1px solid #cba43c', pointerEvents: 'none',
    });
    document.body.appendChild(el);
    return el;
}

// After a watched run, give the player the game: let the virtual clock follow
// real time from here on, so it plays like any other page.
function handBack(ap) {
    if (!ap.clock) return;
    let last = ap.real.now();
    const pump = () => {
        const now = ap.real.now();
        ap.clock.advance(now - last);
        last = now;
        ap.real.setTimeout(pump, 16);
    };
    pump();
}
```

- [ ] **Step 3: The car script still replays** — `node tools/autoplay.mjs --repeat=3 --jitter` must still print one fingerprint, and it must be `68ed5a69`: the ops path is unchanged, so its end state must not move. (If the fingerprint moved, something in the refactor changed game time — find it before going on.)

- [ ] **Step 4: Play quest 1** — `node tools/autoplay.mjs --script=quest --json`. Read the report:
  - `finished: true` → go to Task 4.
  - `finished: false` → `reason` names the stage and why. Tell apart **a driver bug** (a key sequence that did not do what the view says it should: e.g. `no "eat" on the wheel`, `left the game in state "dialogue"`, `stuck — no way to …` beside an obvious path) from **the game's answer** (`died 3 times, last to Wererat`; `unfinished after 400 turns` while attacking). Fix driver bugs in `run.js` or `player.js` — any fix to a *decision* gets a failing test in `tests/autoplay-player.test.js` first — and re-run. Record the game's answers as they are; do not tune the game or the profile to force a finish. That ruling is Caelan's (spec §8).
  - For any failure, confirm it by replaying the same seed in the Browser pane: `http://localhost:<port>/?autoplay&seed=1&script=quest&speed=0`, then read `await window.__autoplay.done` and `window.__game._logHistory.slice(-30)`.

- [ ] **Step 5: The quest run replays** — `node tools/autoplay.mjs --script=quest --repeat=3 --jitter` → one fingerprint, exit 0 or 1 (1 only if unfinished — the same way each time).

- [ ] **Step 6: Commit**

```bash
git add game/autoplay/run.js game/autoplay/boot.js
git commit -m "feat(autoplay): the driver plays a route — quest 1 by the standard fighter, scored by stage"
```

---

### Task 4: The record — golden and check

**Files:**
- Modify: `tools/autoplay.mjs`
- Modify: `package.json`
- Create: `tools/autoplay-golden.json` (written by the tool)

- [ ] **Step 1: Options** — in `parseArgs`, the defaults become

```js
    const o = { seed: 1, script: 'car', repeat: 1, jitter: false, clock: 'virtual', json: false, timeout: 120000,
                speed: 0, check: false, write: false, gif: null, frameMs: 250 };
```

and the three branches become

```js
        if (['seed', 'repeat', 'timeout', 'speed', 'frameMs'].includes(k)) o[k] = Number(v);
        else if (k === 'script' || k === 'clock' || k === 'gif') o[k] = v;
        else if (k === 'jitter' || k === 'json' || k === 'check' || k === 'write') o[k] = true;
```

After `const o = parseArgs(...)` add:

```js
const GOLDEN = path.resolve(ROOT, '..', 'tools', 'autoplay-golden.json');
if (o.check || o.write) {
    o.script = 'quest';
    if (o.check) o.seed = JSON.parse(readFileSync(GOLDEN, 'utf8')).seed;
}
```

- [ ] **Step 2: Pass speed** — in `runOnce`, change Task 3's `q.set('speed', '0');` to `q.set('speed', String(o.speed));`.

- [ ] **Step 3: The summary and the comparison** — above `const o = parseArgs(...)` add:

```js
// What the golden keeps of a run: whether it finished, where it ended, and
// each stage's score.
const summary = (r) => ({
    script: r.script, seed: r.seed, finished: !!r.finished, reason: r.finished ? null : r.reason,
    fingerprint: r.fingerprint, turn: r.turn, deaths: r.deaths, stages: r.stages || [],
});

// Every leaf that differs, as "path: was -> now".
function drift(want, got, at = '') {
    if (typeof want !== 'object' || want === null || typeof got !== 'object' || got === null) {
        return JSON.stringify(want) === JSON.stringify(got) ? [] : [`${at || '(root)'}: ${JSON.stringify(want)} -> ${JSON.stringify(got)}`];
    }
    const keys = new Set([...Object.keys(want), ...Object.keys(got)]);
    return [...keys].flatMap((k) => drift(want[k], got[k], at ? `${at}.${k}` : k));
}
```

and change the `import { existsSync, readFileSync } from 'node:fs';` line to

```js
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
```

- [ ] **Step 4: Write and check** — after the `if (o.json) … else if (runs.length > 1) {…}` block, before `code = …`, add:

```js
    if (o.write) {
        writeFileSync(GOLDEN, JSON.stringify(summary(runs[0]), null, 2) + '\n');
        console.log(`wrote ${path.relative(process.cwd(), GOLDEN)}`);
    }
    let checkFailed = false;
    if (o.check) {
        const want = JSON.parse(readFileSync(GOLDEN, 'utf8'));
        const got = summary(runs[0]);
        const diffs = drift(want, got);
        if (diffs.length) { console.log('DRIFT from the autoplay golden:'); for (const d of diffs) console.log(`  ${d}`); }
        else console.log('autoplay golden matches — no drift');
        if (!got.finished) console.log(`NOT FINISHED: ${got.reason}`);
        checkFailed = diffs.length > 0 || !got.finished;
    }
```

and change `code = runs.some((r) => !r.ok) ? 1 : disagree ? 2 : 0;` to

```js
    code = runs.some((r) => !r.ok) || checkFailed ? 1 : disagree ? 2 : 0;
```

- [ ] **Step 5: Stage lines** — in `line(i, r)`, append each stage when present, so a quest run reads at a glance:

```js
function line(i, r) {
    const where = r.quest ? `quest ${r.quest.id}#${r.quest.stage} at ${r.at.map} ${r.at.x},${r.at.y}` : '';
    const time = r.virtualMs != null ? `virtual ${r.virtualMs} ms, real ${r.realMs} ms` : `real ${r.realMs} ms`;
    const head = `run ${i + 1}: ${r.ok ? 'ok  ' : 'FAIL'} seed ${r.seed} ${r.script} · ${where} · turn ${r.turn} · ${time} · ${r.fingerprint}`;
    const stages = (r.stages || []).map((s) =>
        `\n  ${s.id.padEnd(18)} ${String(s.turns).padStart(4)} turns · -${s.hpLost} hp · +${s.healed} hp · ${s.eats} eats · ${s.attacks} hits · ${s.deaths} deaths · ${s.gold >= 0 ? '+' : ''}${s.gold} gp`);
    const why = r.ok ? '' : `\n  ${r.reason}${(r.errors || []).length ? '\n  ' + r.errors.join('\n  ') : ''}`;
    return head + stages.join('') + why;
}
```

- [ ] **Step 6: Scripts** — in `package.json` after `"autoplay"` add:

```json
    "autoplay:check": "node tools/autoplay.mjs --check",
    "autoplay:write": "node tools/autoplay.mjs --write",
```

- [ ] **Step 7: Write the golden, then check it** — `npm run autoplay:write`, then `npm run autoplay:check` → `autoplay golden matches — no drift`, and exit 0 if the fighter finished (1 with `NOT FINISHED: …` if not — that is the eval's first finding, recorded honestly in the golden).

- [ ] **Step 8: Prove the check can fail** — temporarily change `KNOBS.healBelow` in `player.js` to `0.9`, run `npm run autoplay:check`: it must print `DRIFT` (eats and turns move). Restore, and it must match again.

- [ ] **Step 9: Commit**

```bash
git add tools/autoplay.mjs package.json tools/autoplay-golden.json
git commit -m "feat(autoplay): the record — a golden per stage, and a check that shows drift"
```

---

### Task 5: Watch mode, checked in the pane

**Files:** none new — `run.js` already paces, labels, stops and hands back.

- [ ] **Step 1: Watch it** — dev server on a fresh port, open `http://localhost:<port>/?autoplay&script=quest&seed=1&speed=4` in the Browser pane. If the pane is hidden (`document.visibilityState === 'hidden'`), the run still plays (the clock is ours), so check it by state rather than by eye: poll `window.__game.turn` a few times a second apart — it must climb — and `document.getElementById('autoplay-label').textContent` must read `AUTOPLAY · seed 1 · x4 · …`.
- [ ] **Step 2: The same run** — `await window.__autoplay.done` must end on the same fingerprint as the headless `--script=quest` run (the golden's). Watched and headless are one timeline.
- [ ] **Step 3: Stop** — reload the watch URL; mid-run, a trusted key must stop it. The pane's own `computer` key action sends trusted input; if the pane is hidden and it cannot, record that this step was checked only by reading the code (`e.isTrusted` guard), and say so in the report — do not claim it.
- [ ] **Step 4: Hand-back** — after the run ends, `window.__game.turn` must still advance on a real key and the idle bob must keep animating (the clock now follows real time): take two screenshots a second apart and compare, or read `window.__autoplay.clock.now()` twice a second apart — it must advance by about a second.
- [ ] **Step 5: Commit** — nothing to commit unless a fix was needed; if so, commit it with what it fixed.

---

### Task 6: A GIF for review away from the screen

**Files:**
- Create: `tools/frames_to_gif.py`
- Modify: `tools/autoplay.mjs`

- [ ] **Step 1: The stitcher**

```python
"""frames_to_gif.py — stitch the autoplay runner's PNG frames into a GIF.

    python tools/frames_to_gif.py <frames-dir> <out.gif> [frame-ms]

Frames are halved to 640 px wide with nearest-neighbour, so the pixel art
stays crisp and the file stays small enough to send to a phone.
"""
import sys
from pathlib import Path
from PIL import Image

src, out = Path(sys.argv[1]), sys.argv[2]
ms = int(sys.argv[3]) if len(sys.argv) > 3 else 250
paths = sorted(src.glob('*.png'))
if not paths:
    sys.exit(f'no frames in {src}')
frames = []
for p in paths:
    im = Image.open(p).convert('RGB')
    w = 640
    frames.append(im.resize((w, round(im.height * w / im.width)), Image.NEAREST).quantize(colors=128))
frames[0].save(out, save_all=True, append_images=frames[1:], duration=ms, loop=0, optimize=True)
print(f'{out}: {len(frames)} frames')
```

- [ ] **Step 2: Capture while it plays** — in `tools/autoplay.mjs` (`spawnSync`, `mkdtemp`, `rm`, `tmpdir` and, since Task 4, `writeFileSync` are already imported), in `runOnce` replace the `const out = await Promise.race(...)` line with:

```js
    const frames = [];
    let capturing = !!o.gif;
    const capture = (async () => {
        while (capturing) {
            const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }).catch(() => null);
            if (shot) frames.push(Buffer.from(shot.data, 'base64'));
            await sleep(o.frameMs);
        }
    })();
    const out = await Promise.race([evaluation, sleep(o.timeout).then(() => null)]);
    capturing = false;
    await capture;
    if (o.gif && frames.length) {
        const dir = await mkdtemp(path.join(tmpdir(), 'vt-frames-'));
        frames.forEach((f, i) => writeFileSync(path.join(dir, `f${String(i).padStart(5, '0')}.png`), f));
        const py = spawnSync('python', [path.resolve(ROOT, '..', 'tools', 'frames_to_gif.py'), dir, o.gif, String(o.frameMs)], { encoding: 'utf8' });
        process.stderr.write(py.stdout || py.stderr || '');
        await rm(dir, { recursive: true, force: true });
    }
```

(The run must be watchable-paced for frames to mean anything: `--gif` without `--speed` is a run too fast to see. Document it in the header: `--gif=out.gif --speed=4`.)

- [ ] **Step 3: Make one** — `node tools/autoplay.mjs --script=quest --speed=4 --gif=<scratchpad>/quest1.gif`. Open it (Read renders images) and confirm it shows the player walking to the car, the sewer, the fight, and how it ended. Send it to Caelan.

- [ ] **Step 4: Commit**

```bash
git add tools/frames_to_gif.py tools/autoplay.mjs
git commit -m "feat(autoplay): --gif — a run you can review from a phone"
```

---

### Task 7: Finish

- [ ] **Step 1: Gates** — `npm test`, `npm run -s balance:check`, the naming grep, `npm run autoplay:check` (its exit is the eval's verdict, reported as-is).
- [ ] **Step 2: Normal play untouched** — re-run the scratch normal-play check (headless, no `?autoplay`): START + taps walk, native timers, no errors.
- [ ] **Step 3: Docs** — `plans/quest1-autoplay.md` §6: stages 4-6 built, with the quest run's per-stage table and verdict; §8: the Wererat question answered by measurement. `plans/roadmap-2026-09.md` Q1 row: built, awaiting merge, the verdict. README: a short design note ("### The autoplay") — the portfolio angle: a zero-dependency deterministic headless eval, and why the clock had to be owned.
- [ ] **Step 4: Push** — `git push`. The merge to `dev` is Caelan's call; the live watch mode ships with the next release, also his call.
