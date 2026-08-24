# Perception, Stealth, and Thieve — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every NPC a front and a back, an awareness ladder, and ears — then put a Thieve verb
on top that succeeds silently from a blind spot and costs you the neighbourhood when it doesn't.

**Architecture:** Two new pure leaf modules (`perception.js`, `theft.js`) hold all the math so it is
node-testable; `npc.js`, `renderer.js`, `main.js`, `give-action.js` and `enemies.js` become thin
callers. Perception has ONE authoritative entry point — `perceives(map, watcher, tx, ty)` — used by
both the chase AI and the threat overlay, so the two can never disagree about what an enemy sees.

**Tech Stack:** Vanilla ES modules, no build step. `node --test` (Node v24.18.0). HTML5 Canvas 2D.
Dev server: `python dev-server.py 3001`.

**Spec:** `plans/stealth-perception-and-thieve.md`
**Branch:** `feature/stealth-perception` (worktree at `.claude/worktrees/stealth-perception`, off
`dev` at `83bb440`).
**Baseline before Task 1:** `npm test` → 404 tests, 87 suites, 0 fail, ~376ms.

---

## Progress — updated 2026-08-24

**Every genuinely file-disjoint task is done.** `npm test` -> **492 tests, 108 suites, 0 fail.**
Balance golden unchanged throughout.

| Task | State | Commit |
|---|---|---|
| 1 — `perception.js`: facing + the three-zone verdict | **done**, 18 tests | `f9f2d6a` |
| 4 — the awareness ladder (`nextAwareness`) | **done**, 14 tests | `479a475` |
| 6 (pure half) — `emitNoise` + the `NOISE` table | **done**, 15 tests | `33d1439` |
| 8 — `theft.js`: weight, buffer, the three takes | **done**, 33 tests | `dbeee5e` |
| 2 — `enemies.js` ctor fields + save contract | **done**, 8 tests | `6ba4446` |
| 3 — `npc.js` sight check onto `perceives` | **done**, verified live | `1fd8429` |
| 5 — `npc.js` ladder wiring | **done**, verified live | `13de300` |

Verified in the browser on `:3002` (this worktree's own server; the primary checkout owns 3001):
the 3/2/3 split holds against the real map on a real spawned enemy for all eight facings; a player
in any rear tile leaves the enemy idle across four beats; a player on the flank accrues one beat,
turns the enemy on the second without moving it, and is spotted on the third.

### Blocked — every remaining task edits a file the offer screen is rewriting

`feature/unified-offer-screen` is at Task 11 of 20 and **not merged to `dev`**. Its remaining tasks
touch `main.js` (15 refs), `renderer.js` (10), `layout.js` (7), `trade.js` (3), `pathing.js` (2),
`give-action.js` (2, and specifically about *turning hostile*), `wheel-model.js` (1).

- Task 6 (wiring half) — retire `rockClatter` from `ai.js`, add `main.js` call sites.
  `ai.js` is clear, but its only caller is `main.js`, so the two move together.
  **`NOISE.throwImpact` is pinned to 8 by a test so that retirement preserves the rock exactly.**
- Task 7 — `renderer.js` threat overlay
- Tasks 9–13 — `wheel-model.js`, `give-action.js`, `trade.js`, `main.js`

**On resuming:** `git fetch && git rebase dev`, then `git diff dev...HEAD --stat` before writing a
line, and re-read `applyDispositionDelta` (its clamp changes — see the note in Task 11).

### One design consequence found in play, for Caelan

Every neutral townsperson in Town is authored **`sightRange: 0`** — they perceive literally nothing,
and only actual hostiles have cones. That is fine for the AI (they were never meant to chase), but
it decides something the spec left implicit: since `isHidden` is "nobody holds DIRECT on you",
**a crowded town square counts as hidden**, and you can pick a pocket in front of a dozen witnesses.
Either that is correct (they are scenery) or shopkeepers and townsfolk want a small real
`sightRange` before Thieve ships. Worth a ruling at Task 12, not before.

---

## Working directory

**Every command in this plan runs from the worktree, not the primary checkout:**

```bash
cd "C:/Code/violencetown/.claude/worktrees/stealth-perception"
```

The primary checkout `C:/Code/violencetown` is on `feature/unified-offer-screen` and is **being used
by another live session**. Never `git checkout`, `git switch`, `git reset`, or `git stash` there.

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `game/perception.js` | **create** | Facing, the three-zone perception verdict, awareness transitions, noise. Pure; imports only `utils.js` + `pathing.js`. |
| `game/theft.js` | **create** | Steal weight, notice buffer, which branches are available, what each take removes. Pure; never touches gold. |
| `game/npc.js` | modify | Sight check swaps to `perceives`; the ladder's new states |
| `game/enemies.js` | modify | `facing`, `equipped`, `thievable`, `hearingRange`, `_awareBeats`, `_sweepBeats` + save contract |
| `game/ai.js` | modify | `rockClatter` deleted (becomes `emitNoise`) |
| `game/main.js` | modify | Noise call sites; the Thieve resolver; `_robbed`; paranoia |
| `game/renderer.js` | modify | `_drawAggroOverlay` → `_drawThreatOverlay`; facing chevron; awareness pip |
| `game/wheel-model.js` | modify | The Thieve subtree |
| `game/give-action.js` | modify | `applyHostileFlip`, `reactToTransaction('theft')` |
| `game/save.js` | modify | `_robbed` persistence + validation |
| `tests/perception.test.js` | **create** | The 3/2/3 split, ranges, LOS, fallbacks |
| `tests/awareness.test.js` | **create** | Every ladder transition |
| `tests/noise.test.js` | **create** | Promotion radius; the not-redirected rule |
| `tests/theft.test.js` | **create** | Branches, limits, removal |
| `tests/notice.test.js` | **create** | Weight table, buffer, clean-theft-is-silent |
| `tests/paranoia.test.js` | **create** | Radius, exemptions, band alignment, fires only on failure |

---

## Task 1: `perception.js` — facing and the three-zone verdict

**Files:**
- Create: `game/perception.js`
- Test: `tests/perception.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/perception.test.js`:

```js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { VERDICT, FACING_VECTORS, facingOf, perceives } from '../game/perception.js';

// Open floor everywhere unless a '#' grid says otherwise (mirrors pathing.test.js).
function openMap() {
  return { isWalkable: () => true };
}
function gridMap(rows) {
  const H = rows.length, W = rows[0].length;
  return { isWalkable: (x, y) => x >= 0 && y >= 0 && x < W && y < H && rows[y][x] !== '#' };
}
function watcher(x, y, fx, fy, sightRange = 8) {
  return { x, y, _lastDx: fx, _lastDy: fy, sightRange };
}

const RING8 = [[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];

describe('the 3/2/3 adjacent split', () => {
  // THE load-bearing property: for every one of the eight facings, the eight
  // adjacent tiles split into exactly 3 cone / 2 peripheral / 3 blind. The whole
  // design rests on "the three tiles behind them are the blind spot".
  for (const [name, [fx, fy]] of Object.entries(FACING_VECTORS)) {
    test(`facing ${name} → 3 DIRECT, 2 PERIPHERAL, 3 NONE`, () => {
      const map = openMap();
      const w = watcher(10, 10, fx, fy);
      const counts = { DIRECT: 0, PERIPHERAL: 0, NONE: 0 };
      for (const [dx, dy] of RING8) counts[perceives(map, w, 10 + dx, 10 + dy)]++;
      assert.deepEqual(counts, { DIRECT: 3, PERIPHERAL: 2, NONE: 3 },
        `facing ${name} split was ${JSON.stringify(counts)}`);
    });
  }
});

test('the tile directly behind is always blind, at range 1 and at range 5', () => {
  const map = openMap();
  const w = watcher(10, 10, 0, 1);              // facing south
  assert.equal(perceives(map, w, 10, 9), VERDICT.NONE);
  assert.equal(perceives(map, w, 10, 5), VERDICT.NONE);
});

test('peripheral is SHORTER range than the cone', () => {
  const map = openMap();
  const w = watcher(0, 0, 0, 1, 8);             // facing south, sight 8, periphery 4
  assert.equal(perceives(map, w, 0, 8), VERDICT.DIRECT);      // straight ahead, at range
  assert.equal(perceives(map, w, 4, 0), VERDICT.PERIPHERAL);  // flank, within ceil(8/2)
  assert.equal(perceives(map, w, 5, 0), VERDICT.NONE);        // flank, beyond it
});

test('beyond sightRange is NONE even dead ahead', () => {
  const map = openMap();
  const w = watcher(0, 0, 0, 1, 3);
  assert.equal(perceives(map, w, 0, 3), VERDICT.DIRECT);
  assert.equal(perceives(map, w, 0, 4), VERDICT.NONE);
});

test('a wall blocks the cone', () => {
  const map = gridMap(['.....', '..#..', '.....']);
  const w = watcher(2, 0, 0, 1, 8);             // facing south through the wall at (2,1)
  assert.equal(perceives(map, w, 2, 2), VERDICT.NONE);
});

test('sightRange 0 perceives nothing but its own tile', () => {
  const map = openMap();
  const w = watcher(5, 5, 0, 1, 0);
  assert.equal(perceives(map, w, 5, 6), VERDICT.NONE);
  assert.equal(perceives(map, w, 5, 5), VERDICT.DIRECT);
});

test('facingOf falls back to south when the enemy has never moved', () => {
  assert.deepEqual(facingOf({ _lastDx: 0, _lastDy: 0 }), { fx: 0, fy: 1 });
  assert.deepEqual(facingOf({}), { fx: 0, fy: 1 });
  assert.deepEqual(facingOf({ _lastDx: -1, _lastDy: 0 }), { fx: -1, fy: 0 });
});

test('a null watcher perceives nothing', () => {
  assert.equal(perceives(openMap(), null, 1, 1), VERDICT.NONE);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test tests/perception.test.js
```

Expected: FAIL — `Cannot find module '../game/perception.js'`.

- [ ] **Step 3: Write the implementation**

Create `game/perception.js`:

```js
// perception.js — who can see what.
//
// The ONE authoritative answer to "can this watcher perceive this tile", shared
// by the chase AI (npc.js) and the threat overlay (renderer.js) so the two can
// never disagree — the disagreement the old READ-ONLY aggro overlay existed to
// avoid. Pure leaf module: imports only utils.js + pathing.js, so it is
// node-testable in isolation the way ai.js / pathing.js / rings.js are.
//
// Three zones, measured from the watcher's facing:
//   cone       ±45°, full sightRange              → DIRECT (spotted)
//   periphery  ±90°, ceil(sightRange / 2)         → PERIPHERAL (accrues suspicion)
//   rear       anything behind                    → NONE (blind at any range)
//
// The property the whole design rests on: for ALL EIGHT facings, cardinal and
// diagonal alike, the eight adjacent tiles split identically into 3 cone /
// 2 peripheral / 3 blind. So the entire player-facing rule is "the three tiles
// behind them are the blind spot" — no exceptions to memorise.

import { chebyshev } from './utils.js';
import { hasLineOfSight } from './pathing.js';

export const VERDICT = { DIRECT: 'DIRECT', PERIPHERAL: 'PERIPHERAL', NONE: 'NONE' };

export const CONE_COS         = Math.cos(Math.PI / 4);  // ±45° → a 90° wedge
export const PERIPH_COS       = 0;                      // ±90°
export const PERIPH_RANGE_DIV = 2;                      // periphery = ceil(sight / 2)

// Float slack. cos for a diagonal offset computes to 0.7071067811865475 while
// Math.cos(PI/4) is 0.7071067811865476 — one ULP apart, and WITHOUT this epsilon
// the two diagonal front tiles fall out of the cone and the 3/2/3 property
// silently breaks. The all-facings test above is what catches that.
const EPS = 1e-9;

// Authored spawn facing → the same vector pair stepEntity stamps. Screen coords:
// y grows downward, so N is -1 (matches wheel-model.js's RING8 "clockwise from N").
export const FACING_VECTORS = {
    N: [0, -1], NE: [1, -1], E: [1, 0], SE: [1, 1],
    S: [0, 1], SW: [-1, 1], W: [-1, 0], NW: [-1, -1],
};

// Facing as a vector. Enemies stamp _lastDx/_lastDy on every step (pathing.js
// stepEntity) and the pair is persisted; one that has never moved reads (0,0),
// which is not a direction — those face south, toward the camera.
export function facingOf(watcher) {
    const fx = watcher?._lastDx ?? 0;
    const fy = watcher?._lastDy ?? 0;
    if (fx === 0 && fy === 0) return { fx: 0, fy: 1 };
    return { fx, fy };
}

// The verdict for one watcher against one tile.
export function perceives(map, watcher, tx, ty) {
    if (!watcher) return VERDICT.NONE;

    const dx = tx - watcher.x;
    const dy = ty - watcher.y;
    if (dx === 0 && dy === 0) return VERDICT.DIRECT;   // its own tile, trivially

    const sight = watcher.sightRange ?? 0;
    if (sight <= 0) return VERDICT.NONE;

    const dist = chebyshev(watcher.x, watcher.y, tx, ty);
    if (dist > sight) return VERDICT.NONE;

    const { fx, fy } = facingOf(watcher);
    const cos = (fx * dx + fy * dy) / (Math.hypot(fx, fy) * Math.hypot(dx, dy));

    // Behind: blind at any range, and cheap to reject before the LOS walk.
    if (cos < PERIPH_COS - EPS) return VERDICT.NONE;
    if (!hasLineOfSight(map, watcher.x, watcher.y, tx, ty)) return VERDICT.NONE;
    if (cos >= CONE_COS - EPS) return VERDICT.DIRECT;
    return dist <= Math.ceil(sight / PERIPH_RANGE_DIV) ? VERDICT.PERIPHERAL : VERDICT.NONE;
}

// Every watcher in `watchers` that holds DIRECT on (x,y). The "am I hidden"
// predicate is `spotters(...).length === 0`.
export function spotters(map, watchers, x, y) {
    return (watchers || []).filter(w => perceives(map, w, x, y) === VERDICT.DIRECT);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node --test tests/perception.test.js
```

Expected: PASS, all tests. Then the full suite:

```bash
npm test
```

Expected: 404 + 15 new = **419 tests, 0 fail.**

- [ ] **Step 5: Commit**

```bash
git add game/perception.js tests/perception.test.js
git commit -m "perception: a cone, a peripheral arc, and three blind tiles behind"
```

---

## Task 2: Authored spawn facing on `Enemy`

**Files:**
- Modify: `game/enemies.js` (constructor param list, field assignment, `toSave`)
- Test: `tests/perception.test.js` (append)

- [ ] **Step 1: Write the failing test**

Append to `tests/perception.test.js`:

```js
import { Enemy } from '../game/enemies.js';

test('authored facing seeds the facing stamp', () => {
  const e = new Enemy({ id: 'e1', type: 'guard', x: 3, y: 3, facing: 'W' });
  assert.deepEqual(facingOf(e), { fx: -1, fy: 0 });
});

test('a restored live facing WINS over the authored one', () => {
  // fromSave does `new Enemy(s)` with the persisted _lastDx/_lastDy. If authored
  // facing overwrote those, reloading would re-point an enemy that had turned.
  const e = new Enemy({ id: 'e1', type: 'guard', x: 3, y: 3, facing: 'W', _lastDx: 0, _lastDy: -1 });
  assert.deepEqual(facingOf(e), { fx: 0, fy: -1 });
});

test('no authored facing and no movement → south', () => {
  const e = new Enemy({ id: 'e1', type: 'guard', x: 3, y: 3 });
  assert.deepEqual(facingOf(e), { fx: 0, fy: 1 });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test tests/perception.test.js
```

Expected: FAIL — `authored facing seeds the facing stamp` gets `{ fx: 0, fy: 1 }`.

- [ ] **Step 3: Write the implementation**

In `game/enemies.js`, add the import at the top of the file, beside the existing imports:

```js
import { FACING_VECTORS } from './perception.js';
```

> **Merge note.** `feature/unified-offer-screen` changes one line in this same block — `import
> { ITEMS } from './items.js'` becomes `import { resolveItemDef } from './item-registry.js'`. Adding
> a new line beside it is a one-hunk conflict at worst; keep both.

Add to the constructor's destructured parameter list, immediately after the `_spunTurns = 0,` entry:

```js
        // (perception) Authored spawn facing — 'N'|'NE'|'E'|'SE'|'S'|'SW'|'W'|'NW'.
        // Seeds _lastDx/_lastDy so an enemy that has never taken a step still has
        // a front and a back. Not persisted: _lastDx/_lastDy already are, and they
        // are the live truth once the enemy moves.
        facing = null,
        // (perception) Optional per-enemy hearing BONUS on top of a sound's own
        // loudness. 0 means "normal ears"; a watchdog might carry 3.
        hearingRange = null,
        // (theft) Worn gear whose removal actually moves armor/damage — distinct
        // from `loadout`, which is things this enemy would USE. Authored; the
        // wheel's Gear branch greys out until an enemy declares one.
        equipped = null,
        // (theft) Theft opt-out, mirroring `bribeable`. For quest-critical NPCs.
        // Bribery-immune and theft-immune are separate concerns.
        thievable = null,
```

and in the constructor body, beside `this.hearingRange = hearingRange;`:

```js
        this.equipped  = equipped;
        this.thievable = thievable;
```

and in `toSave()`, beside `loadout: this.loadout,`:

```js
            equipped: this.equipped, thievable: this.thievable,
```

In the constructor body, immediately AFTER the existing `this._lastDx = _lastDx;` / `this._lastDy = _lastDy;` pair, add:

```js
        // Authored facing seeds the stamp ONLY when there is no live facing to
        // preserve. fromSave reconstructs via `new Enemy(s)` carrying the persisted
        // _lastDx/_lastDy, so an unconditional assignment here would re-point every
        // enemy that had since turned, on every reload.
        if (facing && this._lastDx === 0 && this._lastDy === 0) {
            const v = FACING_VECTORS[facing];
            if (v) { this._lastDx = v[0]; this._lastDy = v[1]; }
        }
        this.hearingRange = hearingRange;
```

In `toSave()`, add `hearingRange` to the returned object beside `sightRange`:

```js
            damage: this.damage, sightRange: this.sightRange, hearingRange: this.hearingRange,
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
node --test tests/perception.test.js && npm test
```

Expected: PASS. **422 tests, 0 fail.**

- [ ] **Step 5: Commit**

```bash
git add game/enemies.js tests/perception.test.js
git commit -m "enemies: authored spawn facing, without clobbering a restored one"
```

---

## Task 3: Swap the chase AI onto `perceives`

**Files:**
- Modify: `game/npc.js:141-150` (the `canSeePlayer` block), imports at `game/npc.js:22`

**Behaviour change, intentional:** today's check is `manhattan(...) <= sightRange`; `perceives` uses
Chebyshev. Manhattan is the stricter metric on diagonals, so sight widens slightly diagonally. This
is correct — movement is 8-way and the overlay already draws sight as a circle. Re-run the balance
harness afterward and treat any golden movement as a finding.

- [ ] **Step 1: Run the balance golden to capture the pre-change state**

```bash
npm run balance:check
```

Expected: PASS / no diff. Note the output; it is the comparison point for Step 5.

- [ ] **Step 2: Change the import line**

In `game/npc.js`, replace this line:

```js
import { getGreedyStep, stepEntity, hasLineOfSight } from './pathing.js';
```

with:

```js
import { getGreedyStep, stepEntity } from './pathing.js';
import { perceives, VERDICT } from './perception.js';
```

`hasLineOfSight` is dropped because the block below was its only consumer in this file.

- [ ] **Step 3: Replace the sight check**

In the `case STATE.HOSTILE:` block, replace:

```js
            const canSeePlayer = dist <= npc.sightRange &&
                hasLineOfSight(game.map, npc.x, npc.y, game.playerX, game.playerY);
```

with:

```js
            // (perception) ONE source of truth, shared with the threat overlay.
            // DIRECT is the cone — the only verdict that counts as "sees you".
            // PERIPHERAL feeds the suspicion ladder instead (Task 5).
            const verdict = perceives(game.map, npc, game.playerX, game.playerY);
            const canSeePlayer = verdict === VERDICT.DIRECT;
```

- [ ] **Step 4: Verify the suite still passes**

```bash
npm test
```

Expected: **422 tests, 0 fail.** If `tests/ai.test.js` fails, the fixture enemies have no
`_lastDx/_lastDy` and now face south by default — fix the *fixture* to declare a facing, never the
module.

- [ ] **Step 5: Re-run the balance golden and record the delta**

```bash
npm run balance:check
```

If the golden moves, inspect the diff. Blind spots changing effective threat is expected and is a
finding worth writing down; write the new golden only after reading it:

```bash
npm run balance:write
```

- [ ] **Step 6: Verify in the browser**

```bash
npm start
```

Open `http://localhost:3001/`. Walk up behind a sewer enemy from its rear three tiles — it must not
aggro. Walk into its face — it must aggro exactly as before. Check the console for zero errors.

- [ ] **Step 7: Commit**

```bash
git add game/npc.js tools/balance-golden.txt
git commit -m "npc: the chase reads the perception cone, not a bare radius"
```

---

## Task 4: The awareness ladder — pure transitions

**Files:**
- Modify: `game/perception.js` (append)
- Test: `tests/awareness.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/awareness.test.js`:

```js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { VERDICT, nextAwareness, SUSPICION_BEATS, CALM_BEATS } from '../game/perception.js';

function npc(over = {}) {
  return { state: 'idle', _awareBeats: 0, _sweepBeats: 0, _lastSeenX: null, _lastSeenY: null, ...over };
}

test('DIRECT from idle → chasing, immediately', () => {
  const r = nextAwareness(npc(), VERDICT.DIRECT, { x: 4, y: 7 });
  assert.equal(r.state, 'chasing');
  assert.deepEqual(r.lastSeen, { x: 4, y: 7 });
});

test('one peripheral beat is NOT enough', () => {
  const n = npc();
  const r = nextAwareness(n, VERDICT.PERIPHERAL, { x: 4, y: 7 });
  assert.equal(r.state, 'idle');
  assert.equal(r.awareBeats, 1);
});

test(`${SUSPICION_BEATS} peripheral beats → suspicious, and it TURNS to look`, () => {
  let n = npc();
  let r;
  for (let i = 0; i < SUSPICION_BEATS; i++) {
    r = nextAwareness(n, VERDICT.PERIPHERAL, { x: 4, y: 7 });
    n = { ...n, state: r.state, _awareBeats: r.awareBeats };
  }
  assert.equal(r.state, 'suspicious');
  assert.deepEqual(r.faceTo, { x: 4, y: 7 }, 'must turn toward the disturbance');
});

test('suspicious + DIRECT → chasing', () => {
  const r = nextAwareness(npc({ state: 'suspicious' }), VERDICT.DIRECT, { x: 1, y: 1 });
  assert.equal(r.state, 'chasing');
});

test('suspicious with nothing to see → searching on the next beat', () => {
  const r = nextAwareness(npc({ state: 'suspicious', _awareBeats: 0 }), VERDICT.NONE, { x: 1, y: 1 });
  assert.equal(r.state, 'searching');
});

test(`searching that goes quiet for ${CALM_BEATS} beats → returning`, () => {
  let n = npc({ state: 'searching', _sweepBeats: CALM_BEATS - 1 });
  const r = nextAwareness(n, VERDICT.NONE, { x: 1, y: 1 });
  assert.equal(r.state, 'returning');
});

test('chasing + lost sight → searching, keeping the last-seen mark', () => {
  const n = npc({ state: 'chasing', _lastSeenX: 9, _lastSeenY: 9 });
  const r = nextAwareness(n, VERDICT.NONE, { x: 1, y: 1 });
  assert.equal(r.state, 'searching');
  assert.equal(r.lastSeen, undefined, 'a lost chase must NOT refresh last-seen');
});

test('a live sighting always refreshes last-seen', () => {
  const r = nextAwareness(npc({ state: 'chasing' }), VERDICT.DIRECT, { x: 2, y: 3 });
  assert.deepEqual(r.lastSeen, { x: 2, y: 3 });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test tests/awareness.test.js
```

Expected: FAIL — `nextAwareness is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `game/perception.js`:

```js
// ── The awareness ladder ────────────────────────────────────────────────────
//
// idle → suspicious → searching → chasing → returning → idle
//
// This is a RENAME, not a new state axis. Enemies already carry `fsmState`
// (IDLE/WANDER/WORKING/HOSTILE/ALLIED) and a legacy `state`
// (idle/chasing/returning); a third variable would be exactly the ballooning
// plans/systems-audit-2026-08.md warns about. So the ladder extends `state` —
// and most of it already existed unnamed, since a blind chaser already pursued
// _lastSeenX/Y and gave up on arrival. That was searching without a name.

export const SUSPICION_BEATS   = 2;  // consecutive PERIPHERAL beats → suspicious
export const CALM_BEATS        = 6;  // sweeping this long with nothing → returning
export const BLIND_SWEEP_BEATS = 8;  // a robbed victim with NO last-seen sweeps longer

// Pure: reads the npc, returns the transition. The caller applies it.
// Returns { state, awareBeats, sweepBeats, faceTo?, lastSeen? }.
export function nextAwareness(npc, verdict, playerPos) {
    const state = npc.state ?? 'idle';
    const awareBeats = npc._awareBeats ?? 0;
    const sweepBeats = npc._sweepBeats ?? 0;

    // A live sighting outranks every other transition, from any state.
    if (verdict === VERDICT.DIRECT) {
        return { state: 'chasing', awareBeats: 0, sweepBeats: 0, lastSeen: { ...playerPos } };
    }

    if (verdict === VERDICT.PERIPHERAL) {
        const beats = awareBeats + 1;
        if (state === 'idle' && beats >= SUSPICION_BEATS) {
            // Turn to look — and DON'T advance. This beat is the window in which
            // the player ducks back behind the corner; it is why a peripheral
            // glance is not a death sentence.
            return { state: 'suspicious', awareBeats: 0, sweepBeats: 0, faceTo: { ...playerPos } };
        }
        return { state, awareBeats: beats, sweepBeats };
    }

    // verdict === NONE
    switch (state) {
        case 'suspicious':
            return { state: 'searching', awareBeats: 0, sweepBeats: 0 };
        case 'chasing':
            // Lost contact. Becomes a search of the LAST-SEEN tile — deliberately
            // NOT refreshed here, so a blind chaser never tracks through a wall.
            return { state: 'searching', awareBeats: 0, sweepBeats: 0 };
        case 'searching': {
            const beats = sweepBeats + 1;
            const limit = (npc._lastSeenX == null) ? BLIND_SWEEP_BEATS : CALM_BEATS;
            if (beats >= limit) return { state: 'returning', awareBeats: 0, sweepBeats: 0 };
            return { state, awareBeats: 0, sweepBeats: beats };
        }
        default:
            return { state, awareBeats: 0, sweepBeats };
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
node --test tests/awareness.test.js && npm test
```

Expected: PASS. **430 tests, 0 fail.**

- [ ] **Step 5: Commit**

```bash
git add game/perception.js tests/awareness.test.js
git commit -m "perception: name the ladder that npc.js was already half-running"
```

---

## Task 5: Wire the ladder into `npc.js`

**Files:**
- Modify: `game/npc.js` (the `case STATE.HOSTILE:` block)
- Modify: `game/enemies.js` (`_awareBeats` / `_sweepBeats` fields + `toSave`)

- [ ] **Step 1: Add the two counters to `Enemy`**

In `game/enemies.js`, in the constructor's destructured parameters, immediately after the `facing` /
`hearingRange` entries added in Task 2:

```js
        // (perception ladder) Runtime counters. Persisted so a save taken mid-hunt
        // reloads mid-hunt instead of resetting the NPC to calm.
        _awareBeats = 0,
        _sweepBeats = 0,
```

In the constructor body, after `this.hearingRange = hearingRange;`:

```js
        this._awareBeats = _awareBeats;
        this._sweepBeats = _sweepBeats;
```

In `toSave()`, beside `state: this.state,`:

```js
            awareBeats: this._awareBeats, sweepBeats: this._sweepBeats,
```

In `save.js`'s `hydrateEnemy` (find where `state` is read back onto the enemy) add the mirror
assignments:

```js
    if (s.awareBeats != null) e._awareBeats = s.awareBeats;
    if (s.sweepBeats != null) e._sweepBeats = s.sweepBeats;
```

- [ ] **Step 2: Apply the transition in the FSM**

In `game/npc.js`, in `case STATE.HOSTILE:`, replace the block that currently reads:

```js
            if (canSeePlayer) {
                npc._lostSightTurns = 0;
                npc._lastSeenX = game.playerX;   // (PD-1) refresh the last-seen mark
                npc._lastSeenY = game.playerY;   // only while the player is actually in view
                if (npc.state === 'idle' || npc.state === 'returning') {
                    const reacquire = npc.state === 'idle';
                    npc.state = 'chasing';
                    if (reacquire) messages.push({
                        text: `[${npc.entity.name} spotted you!]`,
                        sourceEnemy: npc,
                        category: 'spotted',
                    });
                }
            }
```

with:

```js
            // (perception ladder) One pure transition, applied here. The old
            // inline "spotted you" promotion is folded in — nextAwareness returns
            // 'chasing' on any DIRECT verdict, from any state.
            const before = npc.state;
            const t = nextAwareness(npc, verdict, { x: game.playerX, y: game.playerY });
            npc.state       = t.state;
            npc._awareBeats = t.awareBeats;
            npc._sweepBeats = t.sweepBeats;
            if (t.lastSeen) { npc._lastSeenX = t.lastSeen.x; npc._lastSeenY = t.lastSeen.y; }
            if (t.faceTo)   { npc._lastDx = Math.sign(t.faceTo.x - npc.x);
                              npc._lastDy = Math.sign(t.faceTo.y - npc.y); }
            if (canSeePlayer) npc._lostSightTurns = 0;

            if (npc.state === 'chasing' && (before === 'idle' || before === 'returning')) {
                messages.push({
                    text: `[${npc.entity.name} spotted you!]`,
                    sourceEnemy: npc,
                    category: 'spotted',
                });
            }
            if (npc.state === 'suspicious' && before !== 'suspicious') {
                messages.push({
                    text: `[${npc.entity.name} looks your way...]`,
                    sourceEnemy: npc,
                    category: 'spotted',
                });
                break;   // turning to look IS the turn — no move, no attack
            }
            if (npc.state === 'suspicious') break;
```

Add `nextAwareness` to the perception import at the top of `npc.js`:

```js
import { perceives, nextAwareness, VERDICT } from './perception.js';
```

- [ ] **Step 3: Let `searching` run the existing last-seen pursuit**

Directly below, the existing guard reads:

```js
            if (npc.state !== 'chasing') break;
```

Replace it with:

```js
            if (npc.state !== 'chasing' && npc.state !== 'searching') break;
```

The existing `chaseTarget` block below already pursues `_lastSeenX/Y` when blind, which is exactly
what `searching` should do — it now simply has a name. Its `npc.state = 'returning'` on arrival
stays correct.

- [ ] **Step 4: Run the suite**

```bash
npm test
```

Expected: **430 tests, 0 fail.**

- [ ] **Step 5: Verify in the browser**

```bash
npm start
```

Stand at an enemy's flank for two turns without entering its cone. It should log
`[... looks your way...]`, turn toward you, and not move that turn. Step into its rear before it
turns and it should lose interest. Console: zero errors.

- [ ] **Step 6: Commit**

```bash
git add game/npc.js game/enemies.js game/save.js
git commit -m "npc: suspicious and searching are states now, not implications"
```

---

## Task 6: Noise — `emitNoise` replaces `rockClatter`

**Files:**
- Modify: `game/perception.js` (append), `game/ai.js` (delete `rockClatter`), `game/main.js`
- Test: `tests/noise.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/noise.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emitNoise, NOISE } from '../game/perception.js';

function npc(over = {}) {
  return { x: 0, y: 0, state: 'idle', _lastSeenX: null, _lastSeenY: null,
           entity: { isAlive: () => true }, ...over };
}

test('a sound inside the radius promotes idle → suspicious and sets last-seen', () => {
  const a = npc({ x: 3, y: 0 });
  emitNoise([a], 0, 0, 4);
  assert.equal(a.state, 'suspicious');
  assert.deepEqual([a._lastSeenX, a._lastSeenY], [0, 0]);
});

test('a sound outside the radius does nothing', () => {
  const a = npc({ x: 9, y: 0 });
  emitNoise([a], 0, 0, 4);
  assert.equal(a.state, 'idle');
  assert.equal(a._lastSeenX, null);
});

test('hearingRange is a BONUS on top of loudness', () => {
  const a = npc({ x: 6, y: 0, hearingRange: 3 });
  emitNoise([a], 0, 0, 4);
  assert.equal(a.state, 'suspicious');
});

test('an enemy already chasing is NOT redirected', () => {
  // The verbatim rockClatter rule: a rock distracts, it does not rescue you
  // from a fight you already started. This is a regression test for that.
  const a = npc({ x: 1, y: 0, state: 'chasing', _lastSeenX: 5, _lastSeenY: 5 });
  emitNoise([a], 0, 0, 8);
  assert.equal(a.state, 'chasing');
  assert.deepEqual([a._lastSeenX, a._lastSeenY], [5, 5]);
});

test('a dead enemy hears nothing', () => {
  const a = npc({ x: 1, y: 0, entity: { isAlive: () => false } });
  emitNoise([a], 0, 0, 8);
  assert.equal(a.state, 'idle');
});

test('loudness 0 is silent even at point blank', () => {
  const a = npc({ x: 0, y: 1 });
  emitNoise([a], 0, 0, NOISE.theft);
  assert.equal(a.state, 'idle');
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test tests/noise.test.js
```

Expected: FAIL — `emitNoise is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `game/perception.js`:

```js
// ── Noise ───────────────────────────────────────────────────────────────────
//
// Generalises ai.js's rockClatter, which its own comment called "the game's first
// stealth affordance". Same rule, now the general case: a sound sets a FALSE
// last-seen without the maker ever having been seen. An enemy already chasing is
// NOT redirected — a rock distracts, it does not rescue you from a fight you
// already started.
//
// Sound ignores walls in v1. It goes around corners, which is both truthful and
// the forgiving direction for the AI: noise cannot see through a wall to find
// you, it can only mislocate attention.

export const NOISE = {
    step:         1,   // effectively silent; present so it is tunable
    door:         4,   // a door, the pipe-jam
    cast:         5,
    melee:        6,   // fighting is loud; a brawl draws a crowd
    throwImpact:  8,   // preserves the rock's old `sightRange ?? 8` reach
    theft:        0,   // silent BY DEFINITION — only the victim ever reacts
};

export function emitNoise(watchers, x, y, loudness) {
    if (!(loudness > 0)) return;
    for (const w of watchers || []) {
        if (!w || !w.entity?.isAlive?.()) continue;
        if (w.state !== 'idle' && w.state !== 'suspicious') continue;
        if (chebyshev(w.x, w.y, x, y) > loudness + (w.hearingRange ?? 0)) continue;
        w._lastSeenX = x;
        w._lastSeenY = y;
        w.state = 'suspicious';
        w._awareBeats = 0;
        w._sweepBeats = 0;
    }
}
```

- [ ] **Step 4: Delete `rockClatter` from `ai.js`**

In `game/ai.js`, delete the entire `rockClatter` function and its comment block (the last ~15 lines
of the file, from `// The rock's clatter —` through the closing `}`).

- [ ] **Step 5: Repoint the caller in `main.js`**

Find `_rockClatter` in `game/main.js` (around line 2546, in the post-throw handler). Replace its body
with a call into the new module. Add to the imports at the top of `main.js`:

```js
import { emitNoise, NOISE } from './perception.js';
```

and replace the `rockClatter(...)` call inside `_rockClatter` with:

```js
        emitNoise(this.enemies, x, y, NOISE.throwImpact);
```

Remove `rockClatter` from the `./ai.js` import list in `main.js`.

- [ ] **Step 6: Add the other noise sites**

In `game/main.js`, in `combatAttack` (immediately after the damage is applied), add:

```js
        emitNoise(this.enemies, this.playerX, this.playerY, NOISE.melee);
```

In the `case 'castSpell':` resolver, immediately after the MP is spent, add:

```js
                emitNoise(this.enemies, this.playerX, this.playerY, NOISE.cast);
```

- [ ] **Step 7: Run the suite**

```bash
npm test
```

Expected: **436 tests, 0 fail.** If `tests/ai.test.js` imported `rockClatter`, move those cases into
`tests/noise.test.js` rather than restoring the function.

- [ ] **Step 8: Verify in the browser**

```bash
npm start
```

Throw a rock past an idle enemy — it must investigate the landing tile exactly as before. Swing at
nothing next to a second enemy — it should turn suspicious.

- [ ] **Step 9: Commit**

```bash
git add game/perception.js game/ai.js game/main.js tests/noise.test.js tests/ai.test.js
git commit -m "noise: the rock's clatter was the general case all along"
```

---

## Task 7: The threat overlay

**Files:**
- Modify: `game/renderer.js` (`_drawAggroOverlay` → `_drawThreatOverlay`), `game/settings.js`

- [ ] **Step 1: Add the treatment setting**

In `game/settings.js`, add to the defaults object:

```js
    threatStyle: 'shadow',   // 'shadow' = stipple the SAFE tiles | 'danger' = tint the WATCHED ones
```

- [ ] **Step 2: Replace the overlay**

In `game/renderer.js`, replace the whole `_drawAggroOverlay(game)` method with:

```js
    // ── Threat overlay ───────────────────────────────────────────────────────
    //
    // Replaces the old READ-ONLY aggro overlay. This one is not an approximation:
    // it calls the SAME perceives() the chase AI calls, so what you see is what
    // they see. Three channels so the dither is never the sole signal:
    //   1. the threat field (a Bayer stipple — see below)
    //   2. a facing chevron on each enemy
    //   3. an awareness pip: · calm  ? suspicious  ! searching  !! chasing
    //
    // A STIPPLE, not a translucent fill. The screen already carries a day/night
    // multiply pass, a combat-arena dim, and the Wilderness blackout; a fourth
    // smooth alpha layer is how you get mud. An ordered dither composites over
    // all of them without shifting their tone, and reads as deliberately retro.
    //
    // Rebuilt once per world beat — nothing's perception changes between beats,
    // and the player's render-side slide does not invalidate it.
    _drawThreatOverlay(game) {
        const { ctx, half } = this;
        const style = (typeof Settings !== 'undefined' && Settings.get)
            ? (Settings.get('threatStyle') || 'shadow') : 'shadow';

        const watchers = game.enemies.filter(e =>
            e.entity?.isAlive?.() && !e._ally && (e.sightRange || 0) > 0);

        // Cache the field on the world beat.
        if (this._threatTurn !== game.turn || this._threatCount !== watchers.length) {
            this._threatTurn = game.turn;
            this._threatCount = watchers.length;
            this._threatField = new Map();
            for (let vy = 0; vy < VIEW_TILES; vy++) {
                for (let vx = 0; vx < VIEW_TILES; vx++) {
                    const tx = game.playerX - half + vx;
                    const ty = game.playerY - half + vy;
                    let worst = VERDICT.NONE;
                    for (const w of watchers) {
                        const v = perceives(game.map, w, tx, ty);
                        if (v === VERDICT.DIRECT) { worst = v; break; }
                        if (v === VERDICT.PERIPHERAL) worst = v;
                    }
                    this._threatField.set(`${tx},${ty}`, worst);
                }
            }
        }

        // 4x4 Bayer matrix, normalised 0..15 — the stipple's threshold pattern.
        const BAYER = [0,8,2,10, 12,4,14,6, 3,11,1,9, 15,7,13,5];

        ctx.save();
        for (let vy = 0; vy < VIEW_TILES; vy++) {
            for (let vx = 0; vx < VIEW_TILES; vx++) {
                const tx = game.playerX - half + vx;
                const ty = game.playerY - half + vy;
                const v = this._threatField.get(`${tx},${ty}`) ?? VERDICT.NONE;

                // Which tiles get painted, and in what, depends on the treatment.
                let color = null, density = 0;
                if (style === 'shadow') {
                    if (v !== VERDICT.NONE) continue;              // safe tiles are the dark ones
                    color = '2,2,8'; density = 10;
                } else {
                    if (v === VERDICT.NONE) continue;              // watched tiles are the tinted ones
                    color = v === VERDICT.DIRECT ? '204,68,34' : '212,185,106';
                    density = v === VERDICT.DIRECT ? 10 : 5;
                }

                const px = vx * TILE_PX - this._scrollX;
                const py = vy * TILE_PX - this._scrollY;
                ctx.fillStyle = `rgba(${color},0.55)`;
                // One 4x4 Bayer cell tiled across the tile; `density` of the 16
                // sub-cells are filled, so the pattern is stable and never crawls.
                const S = TILE_PX / 4;
                for (let i = 0; i < 16; i++) {
                    if (BAYER[i] >= density) continue;
                    ctx.fillRect(px + (i % 4) * S, py + Math.floor(i / 4) * S, S, S);
                }
            }
        }
        ctx.restore();

        // Channels 2 and 3 — per enemy, so the field is never the only signal.
        const PIP = { idle: '\u00b7', suspicious: '?', searching: '!', chasing: '!!', returning: '\u00b7' };
        for (const w of watchers) {
            const sx = (w.x - game.playerX + half) * TILE_PX - this._scrollX;
            const sy = (w.y - game.playerY + half) * TILE_PX - this._scrollY;
            if (sx < -TILE_PX || sx > CANVAS_PX || sy < -TILE_PX || sy > CANVAS_PX) continue;

            const { fx, fy } = facingOf(w);
            const len = Math.hypot(fx, fy) || 1;
            ctx.save();
            ctx.strokeStyle = 'rgba(212,185,106,0.75)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(sx + TILE_PX / 2, sy + TILE_PX / 2);
            ctx.lineTo(sx + TILE_PX / 2 + (fx / len) * TILE_PX * 0.45,
                       sy + TILE_PX / 2 + (fy / len) * TILE_PX * 0.45);
            ctx.stroke();
            ctx.restore();

            // Text goes through the renderer's own loaded font instance
            // (`this.font.drawText`), the way every other label in this file does.
            const pip = PIP[w.state] || '\u00b7';
            if (pip !== '\u00b7' && this.font) {
                this.font.drawText(ctx, pip, sx + TILE_PX / 2 - 2, sy - 6, { scale: 1 });
            }
        }
    }
```

Add to the imports at the top of `renderer.js`, replacing the `hasLineOfSight` import if it has no
other consumer:

```js
import { perceives, facingOf, VERDICT } from './perception.js';
```

> **Merge note.** This import block is the single point where this plan and
> `feature/unified-offer-screen` collide: their Tasks 9–11 widen the same block (adding `MODAL_RECT`,
> `offerLayout` from `layout.js` and `band` from `trade.js`) while replacing `_drawTradeModal` with
> `_drawOfferScreen`. Different functions, one shared hunk. Whichever branch merges second takes both
> sets of imports — do not drop either side, and re-run the game after resolving, because a dropped
> import here is exactly the silent-but-fatal failure CLAUDE.md's merge-hygiene section describes.

- [ ] **Step 3: Repoint the call site**

At `renderer.js:361`, change:

```js
        this._drawAggroOverlay(game);
```

to:

```js
        this._drawThreatOverlay(game);
```

- [ ] **Step 4: Verify in the browser**

```bash
npm start
```

Check all four: the stipple appears; it does not turn the map to mud over the day/night grade or in
a fight; the chevron points where the enemy is walking; the pip changes to `?` when it turns to
look. Then flip the treatment from the console and compare:

```js
window.__game && Settings.set('threatStyle', 'danger')
```

- [ ] **Step 5: Run the suite**

```bash
npm test
```

Expected: **436 tests, 0 fail.**

- [ ] **Step 6: Commit**

```bash
git add game/renderer.js game/settings.js
git commit -m "renderer: draw what they actually see, in both treatments"
```

---

## Task 8: `theft.js` — weight, buffer, and what comes off

**Files:**
- Create: `game/theft.js`
- Test: `tests/theft.test.js`, `tests/notice.test.js`

This task is **file-disjoint** from `feature/unified-offer-screen` and runs before the gate below.

- [ ] **Step 1: Write the failing tests**

Create `tests/notice.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VERDICT } from '../game/perception.js';
import { coinWeight, itemWeight, gearWeight, noticeBuffer, isClean,
         STEAL_BASE, NOTICE_BASE } from '../game/theft.js';

test('coin weight is one point per 25 GP', () => {
  assert.equal(coinWeight(50), 2);
  assert.equal(coinWeight(100), 4);
  assert.equal(coinWeight(1), 1);
  assert.equal(coinWeight(0), 0);
});

test('item weight floors at 1 so a rock is cheap but never free', () => {
  assert.equal(itemWeight({ baseValue: 3 }), 1);
  assert.equal(itemWeight({ baseValue: 30 }), 2);
  assert.equal(itemWeight({}), 1);
});

test('gear weight is the stat swing, and is always heavy', () => {
  assert.equal(gearWeight({ damage: 12 }), 12);   // the crowbar
  assert.equal(gearWeight({ armor: 4 }), 8);      // the traffic cone
  assert.equal(gearWeight({ baseValue: 2 }), 3);  // floor
});

test('a flank halves the buffer, floored at 1', () => {
  assert.equal(noticeBuffer({}, VERDICT.NONE), NOTICE_BASE);
  assert.equal(noticeBuffer({}, VERDICT.PERIPHERAL), 1);
  assert.equal(noticeBuffer({ noticeBuffer: 5 }, VERDICT.NONE), NOTICE_BASE + 5);
});

test('50 GP from a blind spot is clean; going back for another is not', () => {
  const buf = noticeBuffer({}, VERDICT.NONE);              // 3
  assert.equal(isClean(0, coinWeight(STEAL_BASE), buf), true);   // 0 + 2 <= 3
  assert.equal(isClean(2, coinWeight(STEAL_BASE), buf), false);  // 2 + 2 >  3
});

test('the crowbar is noticed by anyone, always', () => {
  assert.equal(isClean(0, gearWeight({ damage: 12 }), noticeBuffer({}, VERDICT.NONE)), false);
});
```

Create `tests/theft.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stealLimit, coinTake, kitTake, gearTake, STEAL_BASE } from '../game/theft.js';

test('steal limit is 50 plus passives', () => {
  assert.equal(stealLimit({}), STEAL_BASE);
  assert.equal(stealLimit({ stealLimit: 50 }), 100);
});

test('coinTake is capped by the limit and by their actual wallet', () => {
  assert.equal(coinTake({ gold: 500 }, 50), 50);
  assert.equal(coinTake({ gold: 20 }, 50), 20);
  assert.equal(coinTake({ gold: 0 }, 50), 0);
});

test('kitTake removes the highest-value item and returns it', () => {
  const victim = { loadout: ['rock', 'crowbar'] };
  const resolve = (id) => ({ id, baseValue: id === 'crowbar' ? 40 : 3 });
  const got = kitTake(victim, resolve);
  assert.equal(got.id, 'crowbar');
  assert.deepEqual(victim.loadout, ['rock'], 'the stolen item must be gone');
});

test('kitTake skips entries that resolve to nothing', () => {
  const victim = { loadout: ['ghost', 'rock'] };
  const resolve = (id) => (id === 'rock' ? { id: 'rock', baseValue: 3 } : null);
  assert.equal(kitTake(victim, resolve).id, 'rock');
});

test('kitTake on an empty loadout returns null', () => {
  assert.equal(kitTake({ loadout: [] }, () => null), null);
});

test('gearTake removes the piece AND its stats, clamped into the Law 3 band', () => {
  const victim = { equipped: ['cone'], entity: { armor: 6 }, damage: 20 };
  const got = gearTake(victim, () => ({ id: 'cone', armor: 4, damage: 0 }));
  assert.equal(got.id, 'cone');
  assert.equal(victim.entity.armor, 2);
  assert.deepEqual(victim.equipped, []);
});

test('gearTake never drives armor below the Law 3 floor', () => {
  const victim = { equipped: ['cone'], entity: { armor: -88 }, damage: 5 };
  gearTake(victim, () => ({ id: 'cone', armor: 4 }));
  assert.equal(victim.entity.armor, -90);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
node --test tests/notice.test.js tests/theft.test.js
```

Expected: FAIL — `Cannot find module '../game/theft.js'`.

- [ ] **Step 3: Write the implementation**

Create `game/theft.js`:

```js
// theft.js — the pure arithmetic behind the Thieve verb.
//
// Succeeding and being NOTICED are two different questions. A theft from a blind
// spot always succeeds; whether the victim notices is decided here, by the WEIGHT
// of what you took against a buffer that never refills. Under the buffer nothing
// happens at all — no disposition change, no hostility, they never know. The -100
// is the price of being noticed, not the price of stealing.
//
// This module never touches gold. It reports the amount and main.js moves it via
// trade.js's transferGold, so the single-choke-point invariant survives and a
// theft stays auditable beside every buy, sell and bribe.

import { VERDICT } from './perception.js';

export const STEAL_BASE         = 50;   // GP ceiling on a Coin take, before passives
export const NOTICE_BASE        = 3;    // weight a victim fails to notice, before passives
export const PERIPHERAL_PENALTY = 0.5;  // buffer multiplier when robbed from their flank
export const COIN_PER_WEIGHT    = 25;
export const VALUE_PER_WEIGHT   = 25;

// ── The two perk axes ───────────────────────────────────────────────────────
// They pull against each other on purpose: a limit perk alone makes you take
// 100 GP — weight 4 against a base buffer of 3 — and get caught for it. Wanting
// both is a build. `passives` is rings.js's aggregatePassives output.
export function stealLimit(passives)   { return STEAL_BASE  + (passives?.stealLimit   ?? 0); }
export function baseNotice(passives)   { return NOTICE_BASE + (passives?.noticeBuffer ?? 0); }

// ── Weight: what a take costs you ───────────────────────────────────────────
export function coinWeight(gp)   { return Math.ceil((gp ?? 0) / COIN_PER_WEIGHT); }
export function itemWeight(def)  { return Math.max(1, Math.ceil((def?.baseValue ?? 0) / VALUE_PER_WEIGHT)); }

// Gear is deliberately heavy because it is the ACTION-ECONOMY take: you are not
// moving an icon, you are moving their combat numbers onto your side of the
// fight. Lifting a crowbar (damage 12) can never be quiet.
export function gearWeight(def) {
    return Math.max(3, (def?.armor ?? 0) * 2 + (def?.damage ?? 0));
}

// ── Buffer: what a victim fails to notice ───────────────────────────────────
export function noticeBuffer(passives, verdict) {
    const base = baseNotice(passives);
    if (verdict === VERDICT.PERIPHERAL) return Math.max(1, Math.floor(base * PERIPHERAL_PENALTY));
    return base;
}

// `taken` is the victim's accumulated weightTaken, which NEVER decreases — that
// is what makes the second pocket riskier than the first, permanently.
export function isClean(taken, weight, buffer) {
    return (taken + weight) <= buffer;
}

// ── The takes ───────────────────────────────────────────────────────────────
export function coinTake(victim, limit) {
    return Math.min(victim?.gold ?? 0, limit);
}

// Highest baseValue, ties broken by authored order — deterministic, never
// random, so the player can predict what a pocket yields. `resolve` is an
// id -> def function (main.js passes resolveLoadout's resolver); entries that
// resolve to nothing are skipped rather than stolen as ghosts.
export function kitTake(victim, resolve) {
    const ids = victim?.loadout ?? [];
    let bestIdx = -1, bestDef = null;
    for (let i = 0; i < ids.length; i++) {
        const def = resolve(ids[i]);
        if (!def) continue;
        if (!bestDef || (def.baseValue ?? 0) > (bestDef.baseValue ?? 0)) { bestIdx = i; bestDef = def; }
    }
    if (bestIdx < 0) return null;
    victim.loadout = ids.filter((_, i) => i !== bestIdx);
    return bestDef;
}

// Removing gear moves their real numbers. Armor is clamped into Law 3's
// [-90, +10] band so a theft can never author an illegal entity.
export function gearTake(victim, resolve) {
    const ids = victim?.equipped ?? [];
    let bestIdx = -1, bestDef = null;
    for (let i = 0; i < ids.length; i++) {
        const def = resolve(ids[i]);
        if (!def) continue;
        if (!bestDef || gearWeight(def) > gearWeight(bestDef)) { bestIdx = i; bestDef = def; }
    }
    if (bestIdx < 0) return null;
    victim.equipped = ids.filter((_, i) => i !== bestIdx);
    if (victim.entity) {
        victim.entity.armor = Math.max(-90, Math.min(10, victim.entity.armor - (bestDef.armor ?? 0)));
    }
    victim.damage = Math.max(0, (victim.damage ?? 0) - (bestDef.damage ?? 0));
    return bestDef;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
node --test tests/notice.test.js tests/theft.test.js && npm test
```

Expected: PASS. **449 tests, 0 fail.**

- [ ] **Step 5: Commit**

```bash
git add game/theft.js tests/theft.test.js tests/notice.test.js
git commit -m "theft: weight against a buffer, and gear costs what it swings"
```

---

# Coordinating with `feature/unified-offer-screen` — measured, not assumed

**Revised 2026-08-23 after reading that branch's actual diff.** The hard gate that stood here was
written against what their *plan* said it would touch. The diff says otherwise, and the difference
matters: **there is no gate.** Tasks 9–13 proceed in order with the rest.

### What they have actually changed (74 commits, `dev..feature/unified-offer-screen`)

| File | Their change |
|---|---|
| `game/offer.js` | **new**, 251 lines — basket, balance, `resolveOffer`, `stage`/`unstage`, `commitBlocker` |
| `game/disposition-curves.js` | **new**, 227 lines — goodwill / resentment curves |
| `game/item-registry.js` | **new**, 29 lines — `resolveItemDef`, `ALL_ITEM_IDS`, `WEAPON_ONLY_IDS` |
| `game/weapons.js` | +17 — every weapon gains `category`, `baseValue`, `description` |
| `game/layout.js` | +106 — `offerLayout()` |
| `game/main.js` | **+25 only** — `_resolveItemDef` delegates to the registry; three bare `ITEMS[id]` lookups fixed |
| `game/enemies.js` | **+8 only** — the `ITEMS` import becomes `resolveItemDef` |
| `game/content-validate.js` | +15 |

### The four files I feared, and their real status

| File | Feared | Actual | Their remaining Tasks 8–20 |
|---|---|---|---|
| `give-action.js` | high | **untouched — API byte-identical to `dev`** | two mentions, both prose comments |
| `trade.js` | moderate | **untouched** | imported by `offer.js`, never modified |
| `wheel-model.js` | low | **untouched** | one mention, inside a `grep` command |
| `renderer.js` | low | **untouched so far** | **Tasks 9–11, 15 replace `_drawTradeModal`** |

So `applyHostileFlip` (Task 10), `BANDS_STEP` (Task 11) and the Thieve subtree (Task 9) have **zero
conflict surface** and need no sequencing whatsoever.

### The two places that DO still collide

1. **`renderer.js`** — their Tasks 9–11 build `_drawOfferScreen` in place of `_drawTradeModal`
   (2772–2919); my Task 7 replaces `_drawAggroOverlay` (2533). Different functions, but **both widen
   the import block at the top of the file.** Expect a one-hunk import conflict and nothing else.
2. **`main.js`** — their Tasks 12–17 rework opening/closing, hit-testing, commit, and **delete the
   old trade path**; my Tasks 6 and 12 add noise call sites (~2546, `combatAttack`) and the Thieve
   resolver (~3340). Different regions; their landed 25-line diff touches none of mine.

Neither is a reason to wait. Whichever branch merges second resolves an import hunk.

### Three things their branch teaches this plan

- **`ITEMS[id]` is a bug, and `resolveItemDef` is the fix.** Weapons live in `WEAPONS`, not `ITEMS`,
  so a bare `ITEMS[id]` lookup **cannot resolve a weapon** — and stolen Gear is overwhelmingly
  weapons. Task 12 therefore resolves through `this._resolveItemDef(id)`, the *Game method*, which
  exists on **both** `dev` (inline `WEAPONS[id] || ITEMS[id]`) and their branch (delegating to the
  registry). That single choice is merge-proof in both directions and needs no rewrite either way.
- **Weapons now carry `baseValue`** (wooden sword 6, ray gun 45). `gearWeight` reads `armor`/`damage`
  and is unaffected; `itemWeight` gets richer after their merge and degrades to its floor of 1
  before it. No branch-order dependency.
- **They independently landed on 25 as the resentment unit** (`RESENT_MAX_PER_OFFER = 25`,
  `RESENT_FLOOR = -25`) — the same band spacing this plan ties paranoia to. See the note in Task 11
  on why theft deliberately punches through their floor.

---

## Task 9: The Thieve subtree on the wheel

**Files:**
- Modify: `game/wheel-model.js` (the `trick` children array)
- Test: `tests/wheel-model.test.js` (append)

- [ ] **Step 1: Write the failing test**

Append to `tests/wheel-model.test.js`:

```js
import { ROOT } from '../game/wheel-model.js';

test('Thieve sits under Trick, beside Bribe and Trade, with three children', () => {
  const trick = ROOT.children.find(c => c.key === 'trick');
  const thieve = trick.children.find(c => c.key === 'thieve');
  assert.ok(thieve, 'Thieve must exist under Trick');
  assert.deepEqual(thieve.children.map(c => c.key), ['coin', 'kit', 'gear']);
});

test('Thieve is unavailable when the game reports you are not hidden', () => {
  const trick = ROOT.children.find(c => c.key === 'trick');
  const thieve = trick.children.find(c => c.key === 'thieve');
  assert.equal(thieve.available({ isHidden: () => false }), false);
  assert.equal(thieve.available({ isHidden: () => true }), true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test tests/wheel-model.test.js
```

Expected: FAIL — `Thieve must exist under Trick`.

- [ ] **Step 3: Write the implementation**

In `game/wheel-model.js`, inside the `trick` node's `children` array, directly after the `trade`
entry, add:

```js
    // (perception/theft) Thieve — a transaction with the sign flipped, so it
    // belongs beside Bribe and Trade rather than under Fight. Greys out entirely
    // unless you are hidden; the three children grey out individually on what the
    // victim actually carries. Availability is asked of the Game so wheel-model
    // stays pure and free of perception imports.
    { key: 'thieve', label: 'Thieve', aimType: 'adjacent', color: '#cba43c', text: '#2a1f06',
      available: (g) => (g.isHidden ? g.isHidden() : false),
      children: [
        { key: 'coin', label: 'Coin', aimType: 'adjacent', resolver: 'thieveCoin',
          available: (g) => (g.canThieve ? g.canThieve('coin') : false) },
        { key: 'kit',  label: 'Kit',  aimType: 'adjacent', resolver: 'thieveKit',
          available: (g) => (g.canThieve ? g.canThieve('kit') : false) },
        { key: 'gear', label: 'Gear', aimType: 'adjacent', resolver: 'thieveGear',
          available: (g) => (g.canThieve ? g.canThieve('gear') : false) },
      ] },
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
node --test tests/wheel-model.test.js && npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add game/wheel-model.js tests/wheel-model.test.js
git commit -m "wheel: Thieve, beside Bribe and Trade where it belongs"
```

---

## Task 10: `applyHostileFlip` — the missing downward path

**Files:**
- Modify: `game/give-action.js`
- Test: `tests/give-action.test.js` (append)

**Read `give-action.js` first.** If the offer screen consolidated the flip logic, put
`applyHostileFlip` beside its consolidated sibling and reuse whatever shared helper `applyFlip` now
delegates to. The behaviour below is fixed; only its placement is negotiable.

- [ ] **Step 1: Write the failing test**

Append to `tests/give-action.test.js`:

```js
import { applyHostileFlip } from '../game/give-action.js';

test('a noticed theft flips them hostile at the floor', () => {
  const npc = { disposition: 20, allegiance: 'neutral', fsmState: 'IDLE', state: 'idle' };
  applyHostileFlip(npc);
  assert.equal(npc.disposition, -100);
  assert.equal(npc.allegiance, 'hostile');
  assert.equal(npc.fsmState, 'HOSTILE');
});

test('robbing your own bribed ally turns them', () => {
  const npc = { disposition: 80, allegiance: 'ally', _ally: true, fsmState: 'ALLIED' };
  applyHostileFlip(npc);
  assert.equal(npc._ally, false);
  assert.equal(npc.allegiance, 'hostile');
});

test('_wasFlipped is left alone so a bribe can still buy them back', () => {
  const npc = { disposition: 0, _wasFlipped: false };
  applyHostileFlip(npc);
  assert.equal(npc._wasFlipped, false);
});

test('the victim is set searching with NO last-seen — robbed, not identified', () => {
  const npc = { disposition: 0, _lastSeenX: 4, _lastSeenY: 4 };
  applyHostileFlip(npc);
  assert.equal(npc.state, 'searching');
  assert.equal(npc._lastSeenX, null);
  assert.equal(npc._lastSeenY, null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test tests/give-action.test.js
```

Expected: FAIL — `applyHostileFlip is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `game/give-action.js`, directly below `applyFlip`:

```js
// ── applyHostileFlip ────────────────────────────────────────────────────────
//
// The mirror of applyFlip, which handles only the UPWARD becomeAlly /
// offerDiscount cases. Until now there was no downward path anywhere in the
// codebase; a noticed theft is the first thing that needs one.
//
// Two deliberate omissions:
//   _wasFlipped is NOT set — a later bribe crossing their threshold can still buy
//   them back. From -100 that is expensive, and it should be.
//   last-seen is CLEARED — they learn they were robbed, not by whom or from
//   where. Being noticed costs you a permanent enemy, not your position.
export function applyHostileFlip(recipient) {
    if (!recipient) return;
    recipient.disposition = -100;
    recipient.allegiance  = 'hostile';
    recipient.fsmState    = 'HOSTILE';
    recipient._ally       = false;
    recipient.state       = 'searching';
    recipient._lastSeenX  = null;
    recipient._lastSeenY  = null;
    recipient._sweepBeats = 0;
    recipient._awareBeats = 0;
}
```

In `reactToTransaction`, add the fourth case to the switch:

```js
        case 'theft': applyHostileFlip(npc); return { flipped: true };
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
node --test tests/give-action.test.js && npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add game/give-action.js tests/give-action.test.js
git commit -m "give-action: the spine finally has a downward flip"
```

---

## Task 11: Paranoia — what a failed search leaves behind

**Files:**
- Modify: `game/give-action.js` (append), `game/npc.js` (the search-failure branch)
- Test: `tests/paranoia.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/paranoia.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spreadParanoia, PARANOIA_DELTA, PARANOIA_RADIUS } from '../game/give-action.js';
import { BANDS_STEP } from '../game/trade.js';

function npc(x, y, over = {}) {
  return { x, y, disposition: 0, entity: { isAlive: () => true }, ...over };
}

test('-25 is exactly one trade band, not a flavour number', () => {
  assert.equal(Math.abs(PARANOIA_DELTA), BANDS_STEP);
});

test('everyone in radius takes the hit', () => {
  const near = npc(3, 0), far = npc(20, 0);
  spreadParanoia([near, far], { x: 0, y: 0 });
  assert.equal(near.disposition, PARANOIA_DELTA);
  assert.equal(far.disposition, 0);
});

test('the victim and your allies are exempt', () => {
  const victim = npc(1, 0), ally = npc(2, 0, { _ally: true });
  spreadParanoia([victim, ally], { x: 0, y: 0 }, victim);
  assert.equal(victim.disposition, 0, 'the victim is already at -100; do not double-hit');
  assert.equal(ally.disposition, 0, 'loyalty is locked, same as the decay rule');
});

test('it stacks, and clamps at the floor', () => {
  const a = npc(1, 0, { disposition: -90 });
  spreadParanoia([a], { x: 0, y: 0 });
  assert.equal(a.disposition, -100);
});

test('a dead bystander hears no rumour', () => {
  const a = npc(1, 0, { entity: { isAlive: () => false } });
  spreadParanoia([a], { x: 0, y: 0 });
  assert.equal(a.disposition, 0);
});
```

- [ ] **Step 2: Export the band step from `trade.js`**

In `game/trade.js`, directly above the `BANDS` array, add:

```js
// The band spacing, exported so the paranoia delta can be TIED to it rather than
// coincidentally equal to it: one failed search moves a merchant down exactly one
// price tier, and that stays true if these bands are ever re-spaced.
export const BANDS_STEP = 25;
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
node --test tests/paranoia.test.js
```

Expected: FAIL — `spreadParanoia is not a function`.

- [ ] **Step 4: Write the implementation**

Append to `game/give-action.js`:

```js
import { BANDS_STEP } from './trade.js';

// ── Paranoia ────────────────────────────────────────────────────────────────
//
// A search that ends without a culprit does not simply reset. The victim tells
// people, and the immediate area gets warier of EVERYONE.
//
// The delta is one full trade.js band, so a failed search moves every merchant in
// earshot down exactly one price tier — legible the instant you try to buy
// something, with no new UI. The existing decay (1 point per ~20s of free-roam)
// walks it back in about eight minutes, so a district cools off on its own.
//
// Why this does not read as the goofy CRPG version: nobody identifies you and
// nobody points. It is social, not omniscient. And it fires ONLY on a search that
// fails — get caught and it stays between the two of you; get away with it and
// the chill spreads.
// Note for whoever merges this beside feature/unified-offer-screen: that branch's
// disposition-curves.js caps a bad DEAL at RESENT_FLOOR = -25 and
// RESENT_MAX_PER_OFFER = 25 — the same unit, arrived at independently. Theft and
// its paranoia deliberately punch through that floor and can stack to -100,
// because a crime is not a bad deal: haggling badly should never be able to make
// an enemy, and robbing someone should. Keep the two floors distinct on purpose.
export const PARANOIA_DELTA  = -BANDS_STEP;
export const PARANOIA_RADIUS = 6;

export function spreadParanoia(npcs, origin, victim = null) {
    for (const n of npcs || []) {
        if (!n || n === victim) continue;
        if (!n.entity?.isAlive?.()) continue;
        if (n._ally) continue;                       // loyalty is locked, same as the decay rule
        if (Math.max(Math.abs(n.x - origin.x), Math.abs(n.y - origin.y)) > PARANOIA_RADIUS) continue;
        applyDispositionDelta(n, PARANOIA_DELTA);    // reuses the clamp + upward-flip guard
    }
}
```

> **Re-read `applyDispositionDelta` after rebasing — do not assume its contract.** (Caelan,
> 2026-08-24.) The offer-screen branch changes its clamp from a flat `[-100, 100]` to
> `[-100, dispositionCeil(npc)]`. For every authored NPC except the Fungus King that ceiling is
> exactly 100, so paranoia's behaviour is unchanged in practice — but the comment above says "reuses
> the clamp", and after the rebase that clamp is a different function. Verify, then keep or reword
> the comment. `applyHostileFlip` sets `disposition = -100` directly and is unaffected either way.

- [ ] **Step 5: Fire it when a robbed victim's blind sweep ends**

In `game/npc.js`, in the `case STATE.HOSTILE:` block, at the point where the transition sets
`returning`, add the paranoia hook:

```js
            // (theft) A robbed victim's sweep that found nobody spreads the chill.
            // Gated on _robbedSweep so an ordinary lost-trail disengage never fires it.
            if (npc.state === 'returning' && npc._robbedSweep) {
                npc._robbedSweep = false;
                spreadParanoia(game.enemies, { x: npc.x, y: npc.y }, npc);
                messages.push({
                    text: `[${npc.entity.name} gives up looking. People are watching you now.]`,
                    sourceEnemy: npc,
                    category: 'deaggro',
                });
            }
```

Add the import to `npc.js`:

```js
import { spreadParanoia } from './give-action.js';
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
node --test tests/paranoia.test.js && npm test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add game/give-action.js game/trade.js game/npc.js tests/paranoia.test.js
git commit -m "paranoia: a failed search costs the street one price band"
```

---

## Task 12: The Thieve resolver and `_robbed` persistence

**Files:**
- Modify: `game/main.js` (resolver cases, `isHidden`, `canThieve`, `_robbed`), `game/save.js`,
  `game/enemies.js` (`spawnEnemy`)
- Test: `tests/save-roundtrip.test.js` (append)

- [ ] **Step 1: Write the failing test**

Append to `tests/save-roundtrip.test.js`. The helpers already in that file are `installGlobals()`,
`makeFakeMap()`, `makePopulatedGame()` and `makeBlankGame()` — use those names, and follow how the
existing tests in the file drive save → load (read one before writing this):

```js
// save.js's real API is serialize / migrate / loadInto — and loadInto is ASYNC.
test('_robbed survives a save/load round trip', async () => {
  installGlobals();
  const game = makePopulatedGame();
  game._robbed = { e7: { gold: 50, items: ['rock'], weightTaken: 2, noticed: false } };
  const raw = JSON.parse(JSON.stringify(serialize(game)));
  const restored = makeBlankGame();
  await loadIntoReal(restored, migrate(raw));
  assert.deepEqual(restored._robbed.e7, { gold: 50, items: ['rock'], weightTaken: 2, noticed: false });
});

test('a robbed spawn comes back light, and a noticed one comes back hostile', () => {
  const clean = spawnEnemy({ id: 'e7', type: 'guard', x: 1, y: 1, gold: 200, loadout: ['rock'] },
    new Set(), { e7: { gold: 50, items: ['rock'], weightTaken: 2, noticed: false } });
  assert.equal(clean.gold, 150, 'only what was taken is gone — not the whole wallet');
  assert.deepEqual(clean.loadout, []);
  assert.notEqual(clean.allegiance, 'hostile', 'a CLEAN theft leaves no social trace');

  const caught = spawnEnemy({ id: 'e8', type: 'guard', x: 1, y: 1, gold: 200 },
    new Set(), { e8: { gold: 50, items: [], weightTaken: 4, noticed: true } });
  assert.equal(caught.allegiance, 'hostile');
  assert.equal(caught.disposition, -100);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test tests/save-roundtrip.test.js
```

Expected: FAIL — `spawnEnemy` takes two arguments; `_robbed` is undefined after restore.

- [ ] **Step 3: Apply `_robbed` in `spawnEnemy`**

In `game/enemies.js`, change the signature and add the application. **Do not reuse `muggedIds`** —
it zeroes the whole wallet and wipes the whole loadout, so a 50 GP theft off a 200 GP enemy would
silently delete the other 150.

```js
export function spawnEnemy(spawnDef, muggedIds, robbed = null) {
    const e = new Enemy(spawnDef);
    if (muggedIds?.has(e.id)) { e.gold = 0; e.loadout = []; }

    // (theft) A robbed enemy re-hydrates from map JSON on every _loadMap, so
    // without this the theft — and the -100 — would undo themselves on zone
    // re-entry. Subtractive, unlike the mugged case: only what was taken is gone.
    const r = robbed?.[e.id];
    if (r) {
        e.gold = Math.max(0, (e.gold ?? 0) - (r.gold ?? 0));
        if (r.items?.length) e.loadout = (e.loadout ?? []).filter(id => !r.items.includes(id));
        if (r.noticed) {
            e.disposition = -100;
            e.allegiance  = 'hostile';
            e.fsmState    = 'HOSTILE';
            e._ally       = false;
        }
    }
    return e;
}
```

In `game/main.js:590`, pass it through:

```js
        for (const s of this.map.enemySpawns) this.enemies.push(spawnEnemy(s, this._muggedIds, this._robbed));
```

And initialise it beside `_muggedIds` at `main.js:374`:

```js
        this._robbed = {};   // (theft) enemyId -> { gold, items, weightTaken, noticed }
```

- [ ] **Step 4: Persist it**

In `game/save.js`, beside the `muggedIds` line (~102):

```js
            robbed: game._robbed ?? {},
```

In the validator beside the `muggedIds` check (~166):

```js
    if (!r.world.robbed || typeof r.world.robbed !== 'object') r.world.robbed = {};
```

And in the restore, beside `game._muggedIds` (~236):

```js
    game._robbed = raw.world.robbed ?? {};
```

- [ ] **Step 5: Add the Game-side predicates the wheel asks for**

In `game/main.js`, beside `_adjacentHostiles()`:

```js
    // (theft) Are you unseen right now? Nobody — victim included — holds DIRECT
    // on your tile. This is what makes "there are no witnesses" true by
    // construction rather than by assertion.
    isHidden() {
        return spotters(this.map, this.enemies.filter(e => e.entity.isAlive() && !e._ally),
                        this.playerX, this.playerY).length === 0;
    }

    // (theft) The victim on an aimed tile, or null. Takes the tile as an argument
    // because `aimTile` is a LOCAL destructured from compose() inside _fireWheel —
    // it is not readable off `this.wheel`.
    _thieveTarget(aimTile) {
        if (!aimTile) return null;
        const v = this.enemies.find(e => e.entity.isAlive() && e.x === aimTile.x && e.y === aimTile.y);
        if (!v || v.thievable === false) return null;
        return v;
    }

    // (theft) Does ANY adjacent victim have something in this branch? The wheel's
    // `available` predicates run at render time, before an adjacent aim is
    // committed, so this deliberately asks "is there anyone nearby I could take a
    // `branch` from" rather than depending on reticle timing.
    canThieve(branch) {
        return this.enemies.some(e => {
            if (!e.entity.isAlive() || e.thievable === false) return false;
            if (cheb(e.x, e.y, this.playerX, this.playerY) !== 1) return false;
            if (branch === 'coin') return (e.gold ?? 0) > 0;
            if (branch === 'kit')  return (e.loadout ?? []).length > 0;
            if (branch === 'gear') return (e.equipped ?? []).length > 0;
            return false;
        });
    }
```

- [ ] **Step 6: Add the three resolver cases**

In `game/main.js`, in the wheel resolver switch (beside `case 'bribe':`), add:

```js
            case 'thieveCoin': case 'thieveKit': case 'thieveGear': {
                const victim = this._thieveTarget(aimTile);
                if (!victim) { this._log('[Nobody to lift from there]'); break; }

                const verdict  = perceives(this.map, victim, this.playerX, this.playerY);
                const passives = this.ringMods ?? {};   // set by _refreshGrantedSkills via aggregatePassives
                const rec = (this._robbed[victim.id] ||= { gold: 0, items: [], weightTaken: 0, noticed: false });

                let weight = 0, took = null, gp = 0, restore = null;
                if (node.resolver === 'thieveCoin') {
                    gp = coinTake(victim, stealLimit(passives));
                    if (gp <= 0) { this._log('[Their pockets are empty]'); break; }
                    weight = coinWeight(gp);
                } else {
                    // MERGE-PROOF, and a bug fix: a bare ITEMS[id] cannot resolve a
                    // WEAPON, and stolen Gear is overwhelmingly weapons. The Game
                    // method does WEAPONS-then-ITEMS on dev and delegates to
                    // item-registry.js on feature/unified-offer-screen — correct
                    // either side of that merge, with no rewrite.
                    const resolve = (id) => this._resolveItemDef(id);
                    const isKit = node.resolver === 'thieveKit';
                    took = isKit ? kitTake(victim, resolve) : gearTake(victim, resolve);
                    if (!took) { this._log('[Nothing there to take]'); break; }
                    weight = isKit ? itemWeight(took) : gearWeight(took);
                    // kitTake/gearTake ALREADY removed it. If the bag turns out to
                    // be full we must put it back, or a full bag silently destroys
                    // the item and (for gear) permanently debuffs the victim.
                    restore = isKit
                        ? () => { victim.loadout.push(took.id); }
                        : () => {
                            victim.equipped.push(took.id);
                            if (victim.entity) victim.entity.armor += (took.armor ?? 0);
                            victim.damage = (victim.damage ?? 0) + (took.damage ?? 0);
                          };
                }

                if (took && !this._addToInventory(took)) {
                    restore();
                    this._log('[Your bag is full.]');
                    break;                       // no turn spent, nothing taken, nothing noticed
                }

                const clean = isClean(rec.weightTaken, weight, noticeBuffer(passives, verdict));
                rec.weightTaken += weight;

                if (gp > 0) { transferGold(victim, this, gp, 'theft'); rec.gold += gp; this._log(`[Lifted ${gp} GP.]`, 'pickup'); }
                if (took)   { rec.items.push(took.id); this._log(`[Lifted the ${took.name}.]`, 'pickup'); }

                if (clean) {
                    // A clean theft is GENUINELY clean — no disposition, no
                    // hostility, no search, no log line about them. They never know.
                } else {
                    rec.noticed = true;
                    victim._robbedSweep = true;            // arms the paranoia hook (Task 11)
                    reactToTransaction(victim, 'theft', { item: took, gold: gp });
                    this._log(`[${victim.name ?? victim.type} feels the weight change.]`, 'combat');
                }
                this._advanceWorld();
                break;
            }
```

**Extend** the perception import Task 6 already added to `main.js` (do not add a second import
statement from the same module), and add the theft one:

```js
import { emitNoise, NOISE, perceives, spotters } from './perception.js';
import { coinTake, kitTake, gearTake, coinWeight, itemWeight, gearWeight,
         noticeBuffer, isClean, stealLimit } from './theft.js';
```

`cheb` (used by `canThieve`) is already defined at `main.js:59`; `ITEMS`, `transferGold` and
`reactToTransaction` are already imported. No other new imports are needed.

- [ ] **Step 7: Run the suite**

```bash
npm test
```

Expected: PASS, 0 fail.

- [ ] **Step 8: Verify the whole loop in the browser**

```bash
npm start
```

Walk into an enemy's rear three tiles. Thieve → Coin. Expect: gold moves, **no** mood change, **no**
aggro. Thieve again — expect the second take to be noticed, the enemy to go hostile and sweep
*without* walking at you, and after ~8 beats a paranoia line plus every nearby nameplate's mood face
dropping one notch. Leave the zone and return: the gold stays gone and the hostility persists.
Then test the combo — shove an enemy, then Thieve. Console: zero errors.

- [ ] **Step 9: Commit**

```bash
git add game/main.js game/save.js game/enemies.js tests/save-roundtrip.test.js
git commit -m "thieve: lift it clean and nothing happens at all"
```

---

## Task 13: Phase 6 polish

**Files:**
- Modify: `game/perception.js`, `game/main.js`, `game/audio.js`

- [ ] **Step 1: Night shrinks sight**

In `game/perception.js`, change `perceives`'s sight read to accept an optional night level:

```js
    const night = watcher._nightLevel ?? 0;
    const sight = Math.max(0, Math.round((watcher.sightRange ?? 0) * (1 - 0.4 * night)));
```

and stamp `_nightLevel` onto each enemy in `_worldBeat`:

```js
        for (const e of this.enemies) e._nightLevel = this._nightLevel ?? 0;
```

Verify with the existing day clock that a guard's cone visibly shortens at night.

- [ ] **Step 2: The `blind` debuff shortens perception**

Poke already applies a `blind` debuff that halves an enemy's outgoing damage. Making it also halve
what they *see* costs one line and is the spec's cheapest edge. In `game/perception.js`, in
`perceives`, after the night calculation:

```js
    // (edge) A blinded enemy sees half as far. Poke has applied this debuff since
    // the combat-feel pass; until now it only halved their damage.
    const eff = watcher.hasBuff?.('blind') ? Math.floor(sight / 2) : sight;
```

and use `eff` in place of `sight` for both the range test and the peripheral divisor. Add to
`tests/perception.test.js`:

```js
test('a blinded watcher sees half as far', () => {
  const map = openMap();
  const w = { x: 0, y: 0, _lastDx: 0, _lastDy: 1, sightRange: 8, hasBuff: (id) => id === 'blind' };
  assert.equal(perceives(map, w, 0, 4), VERDICT.DIRECT);
  assert.equal(perceives(map, w, 0, 5), VERDICT.NONE);
});
```

- [ ] **Step 3: Author one enemy with `equipped`**

Pick a sewer fighter in `game/sewer-map.json` and give it real gear so the Gear branch stops greying
out:

```json
"equipped": ["crowbar"]
```

Confirm in-browser that stealing it drops that enemy's damage in the very next exchange.

- [ ] **Step 4: Audio + first-time hint**

Add a theft sfx call beside the existing `audio.playSfx('...')` sites in the resolver, and a
one-shot hint the first time the player stands in an enemy's blind spot, following the existing
first-run-hint pattern in `main.js`.

- [ ] **Step 5: Full verification and commit**

```bash
npm test && npm run balance:check
git add -A && git commit -m "stealth: night, gear, and the tells"
```

---

## Definition of done

- [ ] `npm test` green, no skipped tests. Expect ~460 total.
- [ ] `npm run balance:check` — clean, or the golden rewritten with the delta understood.
- [ ] In-browser, zero console errors, all six phase checks above performed.
- [ ] Branch pushed. **The merge-to-`dev` call is Caelan's**, per his standing rule.
- [ ] `plans/stealth-perception-and-thieve.md` open question 1 resolved: one dither treatment
      chosen at the screen, the loser's branch deleted from `_drawThreatOverlay`.
