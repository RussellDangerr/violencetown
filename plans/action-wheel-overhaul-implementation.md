# Action Wheel Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace bump-to-attack and the two-level Omnitrix wheel with an open-anywhere three-ring action composer (action × item × direction) that is fast by default (auto-aim + double-tap repeat) and deep when you want it.

**Architecture:** Extract the wheel's pure state/logic into a NEW dependency-free module `game/action-wheel.js` (unit-tested under `node:test`). `main.js` drives it (open, input, fire-routing); `renderer.js` reads it (draws three rings); `layout.js` owns the geometry (single source for draw + hit-test). Combat resolvers (`combatAttack`, `resolveThrow`, `applyGive`) are reused unchanged.

**Tech Stack:** Vanilla JS ES modules, zero deps, HTML5 canvas. Unit tests via `node:test` (already wired in `package.json`). Canvas/input layers are verified in-browser (dev server + `window.__game`) — they cannot be honestly unit-tested, so the plan **TDDs the pure model and browser-verifies the rest.** Each non-pure task ends with a concrete in-browser check.

**Spec:** [action-wheel-overhaul.md](action-wheel-overhaul.md). Confirmed decisions: OPEN = **Space** (universal act button); **Use** stays on the hotbar (1–9); verb set = current six (Attack/Skill/Throw/Give/Run/Defend); **all throwing routes through the wheel**.

**Branches:** implement on `dev`; this plan lives on `plan`.

---

## File structure

| File | Responsibility |
|---|---|
| **NEW** `game/action-wheel.js` | Pure wheel model: action list, per-action ring config, compass, state object, `moveGrip`/`spinRing`/`compose`/`autoAimDir`. No DOM. Single source of wheel logic. |
| **NEW** `tests/action-wheel.test.js` | `node:test` coverage of the model. |
| **MOD** `game/main.js` | Remove bump-to-attack; add OPEN (Space) + double-tap-repeat; drive the wheel for input; route fire→resolvers via aim; absorb the throw-direction picker; rework `_tapRadialMenu` for 3 rings + compass d-pad. Delete obsolete inner/sub-wheel input methods. |
| **MOD** `game/renderer.js` | Rewrite `_drawRadialMenu` to draw three rings + contextual dimming + held-ring highlight + static center, reading `action-wheel` state. |
| **MOD** `game/layout.js` | Add the third ring radius band + the four compass-arc hit zones. |

Keep the `STATE.RADIAL_MENU` state value (`'radial_menu'`) — it now means "the three-ring wheel is open," minimizing churn in the renderer dispatch and save logic.

---

## Task 1: `action-wheel.js` — pure model (TDD)

**Files:**
- Create: `game/action-wheel.js`
- Create: `tests/action-wheel.test.js`

- [ ] **Step 1: Write the failing tests** — `tests/action-wheel.test.js`

```js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  WHEEL_ACTIONS, ACTION_RINGS, CARDINALS, DIR_VEC, RING_ACTION, RING_ITEM, RING_AIM,
  createWheelState, currentAction, ringsFor, moveGrip, spinRing, compose, autoAimDir,
} from '../game/action-wheel.js';

describe('action-wheel model', () => {
  test('the six verbs are present in order', () => {
    assert.deepEqual(WHEEL_ACTIONS, ['Attack', 'Skill', 'Throw', 'Give', 'Defend', 'Run']);
  });

  test('ring config marks which rings each action uses', () => {
    assert.deepEqual(ringsFor('Throw'),  { item: true,  aim: true });
    assert.deepEqual(ringsFor('Attack'), { item: false, aim: true });
    assert.deepEqual(ringsFor('Defend'), { item: false, aim: false });
  });

  test('a fresh wheel defaults to Attack, grip on the action ring, aim East', () => {
    const w = createWheelState();
    assert.equal(currentAction(w), 'Attack');
    assert.equal(w.grip, RING_ACTION);
    assert.equal(w.aim, 'E');
  });

  test('spinning the action ring wraps through all six verbs', () => {
    const w = createWheelState();
    spinRing(w, -1, []); // Attack -> Run (wrap left)
    assert.equal(currentAction(w), 'Run');
    spinRing(w, 1, []);  // back to Attack
    assert.equal(currentAction(w), 'Attack');
  });

  test('moveGrip skips rings the current action does not use', () => {
    const w = createWheelState(); // Attack: aim yes, item no
    moveGrip(w, 1); // action -> (skip item) -> aim
    assert.equal(w.grip, RING_AIM);
    spinRing(w, 2, []); // Attack -> Throw (now item+aim)
    assert.equal(currentAction(w), 'Throw');
    w.grip = RING_ACTION;
    moveGrip(w, 1); // action -> item (Throw uses it)
    assert.equal(w.grip, RING_ITEM);
  });

  test('switching to an action that drops the held ring clamps the grip back', () => {
    const w = createWheelState();
    w.actionIndex = WHEEL_ACTIONS.indexOf('Throw');
    w.grip = RING_ITEM;
    spinRing(w, 2, []); // Throw -> Defend (no item, no aim)
    assert.equal(currentAction(w), 'Defend');
    assert.equal(w.grip, RING_ACTION, 'grip clamps off the now-dimmed item ring');
  });

  test('spinning the item ring cycles the provided valid slots', () => {
    const w = createWheelState();
    w.actionIndex = WHEEL_ACTIONS.indexOf('Throw');
    w.grip = RING_ITEM;
    spinRing(w, 1, [1, 4, 7]); // first spin lands on the first valid slot
    assert.ok([1, 4, 7].includes(w.itemSlot));
    const first = w.itemSlot;
    spinRing(w, 1, [1, 4, 7]);
    assert.notEqual(w.itemSlot, first);
  });

  test('spinning the aim ring rotates the compass clockwise', () => {
    const w = createWheelState(); // E
    w.grip = RING_AIM;
    spinRing(w, 1, []); assert.equal(w.aim, 'S');
    spinRing(w, 1, []); assert.equal(w.aim, 'W');
    spinRing(w, 1, []); assert.equal(w.aim, 'N');
    spinRing(w, 1, []); assert.equal(w.aim, 'E');
  });

  test('compose returns the live action/item/aim selection', () => {
    const w = createWheelState();
    w.actionIndex = WHEEL_ACTIONS.indexOf('Throw');
    w.itemSlot = 3; w.aim = 'N';
    assert.deepEqual(compose(w), { action: 'Throw', itemSlot: 3, aim: 'N' });
  });

  test('autoAimDir picks the dominant cardinal toward the nearest target', () => {
    // target 3 east, 1 north -> E dominates
    assert.equal(autoAimDir(5, 5, [{ x: 8, y: 4 }]), 'E');
    // nearer target wins
    assert.equal(autoAimDir(5, 5, [{ x: 8, y: 5 }, { x: 5, y: 6 }]), 'S');
    // no targets -> null
    assert.equal(autoAimDir(5, 5, []), null);
  });

  test('DIR_VEC maps each cardinal to a unit step', () => {
    assert.deepEqual(DIR_VEC.N, { dx: 0, dy: -1 });
    assert.deepEqual(DIR_VEC.E, { dx: 1, dy: 0 });
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `node --test tests/action-wheel.test.js`
Expected: FAIL — `Cannot find module '../game/action-wheel.js'`.

- [ ] **Step 3: Implement `game/action-wheel.js`**

```js
// action-wheel.js — pure model for the three-ring action wheel.
//
// No DOM, no canvas: main.js drives it (open/input/fire), renderer.js reads it
// (draw), tests exercise it directly. The wheel composes one ACTION, one ITEM,
// and one DIRECTION; each action lights only the rings it uses (the rest dim).

export const WHEEL_ACTIONS = ['Attack', 'Skill', 'Throw', 'Give', 'Defend', 'Run'];

// Which rings each action uses. item = needs an inventory item; aim = needs a
// cardinal direction. Rings not used are dimmed and skipped by the grip.
export const ACTION_RINGS = {
  Attack: { item: false, aim: true  },
  Skill:  { item: false, aim: false }, // placeholder until skills land
  Throw:  { item: true,  aim: true  },
  Give:   { item: true,  aim: true  },
  Defend: { item: false, aim: false }, // self
  Run:    { item: false, aim: true  },
};

export const CARDINALS = ['N', 'E', 'S', 'W'];          // clockwise from top
export const DIR_VEC = {
  N: { dx: 0, dy: -1 }, E: { dx: 1, dy: 0 },
  S: { dx: 0, dy: 1 },  W: { dx: -1, dy: 0 },
};

// Grip positions, inner -> outer.
export const RING_ACTION = 0, RING_ITEM = 1, RING_AIM = 2;

export function createWheelState() {
  return {
    actionIndex: 0,    // into WHEEL_ACTIONS
    itemSlot: -1,      // inventory slot for the chosen item (-1 = none)
    aim: 'E',          // one of CARDINALS
    grip: RING_ACTION, // which ring the keyboard is holding
    lastFired: null,   // { action, itemSlot, aim } for express double-tap repeat
  };
}

export function currentAction(w) { return WHEEL_ACTIONS[w.actionIndex]; }
export function ringsFor(action) { return ACTION_RINGS[action] || { item: false, aim: false }; }

// The grip's legal ring order for the current action (skips dimmed rings).
function gripOrder(w) {
  const r = ringsFor(currentAction(w));
  const order = [RING_ACTION];
  if (r.item) order.push(RING_ITEM);
  if (r.aim) order.push(RING_AIM);
  return order;
}

// Move the grip inward/outward (delta -1/+1), clamped to rings the action uses.
export function moveGrip(w, delta) {
  const order = gripOrder(w);
  let i = order.indexOf(w.grip);
  if (i === -1) i = 0;
  i = Math.max(0, Math.min(order.length - 1, i + delta));
  w.grip = order[i];
  return w.grip;
}

// Spin the held ring one slice. validItemSlots = inventory slot indices valid for
// the current action (caller computes from inventory + useType + questItem).
export function spinRing(w, delta, validItemSlots) {
  if (w.grip === RING_ACTION) {
    const n = WHEEL_ACTIONS.length;
    w.actionIndex = (w.actionIndex + delta + n) % n;
    // Clamp the grip if the new action no longer uses the held ring.
    if (!gripOrder(w).includes(w.grip)) w.grip = RING_ACTION;
  } else if (w.grip === RING_ITEM) {
    const slots = validItemSlots || [];
    if (slots.length === 0) { w.itemSlot = -1; return; }
    let i = slots.indexOf(w.itemSlot);
    if (i === -1) i = (delta > 0 ? -1 : 0); // first spin lands on slot 0 / last
    w.itemSlot = slots[(i + delta + slots.length) % slots.length];
  } else if (w.grip === RING_AIM) {
    const i = CARDINALS.indexOf(w.aim);
    w.aim = CARDINALS[(i + delta + CARDINALS.length) % CARDINALS.length];
  }
}

// The current selection as a fire descriptor.
export function compose(w) {
  return { action: currentAction(w), itemSlot: w.itemSlot, aim: w.aim };
}

// Nearest-target cardinal for auto-aim. targets = [{x,y}, ...] candidate tiles;
// returns a cardinal string or null. Pure given the candidate list + player pos.
export function autoAimDir(playerX, playerY, targets) {
  let best = null, bestD = Infinity;
  for (const t of (targets || [])) {
    const dx = t.x - playerX, dy = t.y - playerY;
    const d = Math.abs(dx) + Math.abs(dy);
    if (d === 0 || d >= bestD) continue;
    best = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : (dy > 0 ? 'S' : 'N');
    bestD = d;
  }
  return best;
}
```

- [ ] **Step 4: Run, verify it passes**

Run: `node --test tests/action-wheel.test.js`
Expected: PASS — all assertions green.

- [ ] **Step 5: Commit**

```bash
git add game/action-wheel.js tests/action-wheel.test.js
git commit -m "feat(wheel): pure three-ring action-wheel model + tests"
```

---

## Task 2: Remove bump-to-attack (`main.js`)

**Files:** Modify `game/main.js` — `_doMove`.

- [ ] **Step 1:** In `_doMove`, find the hostile-enemy branch that currently calls `this._openRadialMenu(enemy)` (it opens the wheel on bump). Replace the whole "bump a hostile opens the wheel" block with a **silent no-op** (`return;` — no turn, no movement), exactly like bumping a wall. Leave intact: the non-hostile NPC silent-bump, the container/car/barricade interactions, and the walkability check.
- [ ] **Step 2 (verify in-browser):** `python dev-server.py 3001`, open the game, start a run, walk into a hostile rat. Confirm via `window.__game`: `state` stays `'idle'`, `turn` does not increment, the player does not enter the rat's tile, and no wheel appears. Walking into a wall and the car still behave as before.
- [ ] **Step 3: Commit** — `git commit -am "feat(wheel): retire bump-to-attack (walking into a hostile is now a no-op)"`

---

## Task 3: OPEN the wheel anywhere + seed defaults + auto-aim (`main.js`)

**Files:** Modify `game/main.js`. Import from `./action-wheel.js`. Add an `this.wheel = createWheelState()` field in the constructor (replacing the scattered `radialInnerIndex/radialSubIndex/radialDrilled` fields, which this overhaul removes).

- [ ] **Step 1:** In the IDLE keydown handler, make **Space** call a new `_openWheel()` instead of its current wait/overlay behavior (the wait behavior moves to Task 11). Add the touch ACTION button: in `index.html` add a `#action-btn` near `#menu-btn`; bind its `pointerdown` to `_openWheel()`.
- [ ] **Step 2:** Implement `_openWheel()`:
  - Seed `this.wheel.grip = RING_ACTION` (keep persisted `actionIndex`/`itemSlot`).
  - Compute hostiles in range (reuse the alive+hostile filter used by `_adjacentHostiles`, but unbounded distance for auto-aim candidates) as `[{x,y}]`; set `this.wheel.aim = autoAimDir(playerX, playerY, hostiles) || facingToCardinal(this.facing)`.
  - `this.state = STATE.RADIAL_MENU`; play `audio.playSfx('menu-open')`; `_ensureParticleLoop()`; `_render()`.
  - Add a tiny `facingToCardinal(facing)` helper (`'up'→'N'`, `'right'→'E'`, `'down'→'S'`, `'left'→'W'`).
- [ ] **Step 3 (verify in-browser):** With a rat to the east, press Space. Confirm `window.__game.state === 'radial_menu'`, `window.__game.wheel.aim === 'E'`, and the wheel renders (Task 8). With no enemies, `aim` equals the player's facing cardinal.
- [ ] **Step 4: Commit** — `git commit -am "feat(wheel): open the wheel anywhere (Space / action button), pre-aimed"`

---

## Task 4: Three-ring navigation input (`main.js`)

**Files:** Modify `game/main.js` — the `STATE.RADIAL_MENU` branch of the keydown handler. Delete the obsolete `_radialRotate`, `_radialConfirm`, `_fireSubAction`, `_radialSubItems` two-level methods; replace with model-driven input.

- [ ] **Step 1:** Add `_wheelValidItemSlots()` → returns inventory slot indices valid for the current action: for `Throw`, non-quest items (`!questItem`); for `Give`, any non-quest item; else `[]`. (Mirror the existing radial Throw/Give filters.)
- [ ] **Step 2:** Rewrite the `RADIAL_MENU` keydown branch:
  - `ArrowUp/KeyW` → `moveGrip(this.wheel, -1)` (toward inner). `ArrowDown/KeyS` → `moveGrip(this.wheel, +1)`.
  - `ArrowLeft/KeyA` → `spinRing(this.wheel, -1, this._wheelValidItemSlots())`. `ArrowRight/KeyD` → `spinRing(this.wheel, +1, ...)`.
  - `Space` → `_fireWheel()` (Task 5). `Escape` → `_closeWheel()` (set IDLE, `audio.playSfx('menu-cancel')`, render).
  - Each handled key: `e.preventDefault()`, `audio.playSfx('menu-open')`-style tick on spin, `_render()`.
- [ ] **Step 3 (verify in-browser):** Open the wheel; via `preview_eval` dispatch arrow keydowns and assert `window.__game.wheel` transitions (grip moves, action/item/aim change, dimmed rings skipped). `Escape` returns `state` to `'idle'`.
- [ ] **Step 4: Commit** — `git commit -am "feat(wheel): three-ring keyboard navigation (grip + spin), drop the sub-wheel"`

---

## Task 5: Fire routing (`main.js`)

**Files:** Modify `game/main.js`. Reuse `combatAttack`, `resolveThrow` (items.js), `applyGive`, `addBuff`.

- [ ] **Step 1:** Implement `_fireWheel()`:
  - `const { action, itemSlot, aim } = compose(this.wheel); const v = DIR_VEC[aim];`
  - **Attack:** find an alive hostile at the adjacent tile `(playerX+v.dx, playerY+v.dy)`. If present → `combatAttack(enemy, weapon.damage)`, set `state=IDLE`, `_advanceWorld()`. If absent → log `[Nothing to hit that way]`, **do not consume a turn**, keep the wheel open.
  - **Throw:** if `itemSlot<0` or empty → log `[Nothing to throw]`, no turn. Else `this.selectedSlot = itemSlot; this._doThrow(v);` (existing `_doThrow` already calls `resolveThrow` + consumes + advances).
  - **Give:** target the NPC at the adjacent tile in `aim`; if present → `_doGive(npc)` (existing). Else log `[No one there]`, no turn.
  - **Defend:** `addBuff('guard','Guard',2,'buff')`, log, `state=IDLE`, `_advanceWorld()`.
  - **Run:** attempt to move one tile `aim`; if walkable+unoccupied move + advance, else log `[Can't run that way]` + advance (run always costs the turn, per combat-ui-layers.md).
  - **Skill:** log `[No skills yet]`, no turn (placeholder).
  - On any fire that consumes a turn, set `this.wheel.lastFired = { action, itemSlot, aim }` first (for Task 6).
- [ ] **Step 2 (verify in-browser):** With a rat east, open wheel → Space → confirm the rat takes damage and `turn` advances. Spin to Throw + a Rock + aim east → Space → rat takes throw damage, rock consumed. Defend → `guard` buff present. Run with a clear west tile → player moves west.
- [ ] **Step 3: Commit** — `git commit -am "feat(wheel): compose-and-fire routing to the existing combat resolvers"`

---

## Task 6: Double-tap repeat (`main.js`)

**Files:** Modify `game/main.js`.

- [ ] **Step 1:** In the IDLE Space handler, before `_openWheel()`: track `this._lastOpenAt` (a `performance.now()` timestamp). If `now - this._lastOpenAt < 250` AND `this.wheel.lastFired` is still valid (target alive for Attack/Give; item present for Throw), call a new `_repeatLastAction()` that re-runs `_fireWheel()`-style routing on `wheel.lastFired` **without** setting `state=RADIAL_MENU` (no wheel drawn). Otherwise `_openWheel()`. Always update `this._lastOpenAt = now`.
- [ ] **Step 2 (verify in-browser):** With a rat east, double-tap Space quickly → the rat is hit twice with the wheel never visibly opening (`state` stays `idle` between, two `turn` increments). A slow Space → Space opens the wheel then fires (one increment).
- [ ] **Step 3: Commit** — `git commit -am "feat(wheel): double-tap Open = express-repeat last action"`

---

## Task 7: `layout.js` three-ring geometry + compass hit zones

**Files:** Modify `game/layout.js`.

- [ ] **Step 1:** Replace the two-band radial constants with three bands (kept center at 304,304):
  ```js
  export const RADIAL_CENTER_X = 304, RADIAL_CENTER_Y = 304;
  export const RING_HUB_R   = 22;             // dead-center hub (composition readout)
  export const RING_ACTION_R = [26, 64];      // [inner, outer] radii — action ring
  export const RING_ITEM_R   = [66, 100];     // item ring
  export const RING_AIM_R    = [102, 132];    // direction compass ring
  ```
- [ ] **Step 2:** Add a pure helper `wheelHitTest(localX, localY)` → `{ ring, slice }` (ring ∈ action/item/aim/hub/outside; slice = index within that ring by angle). Action ring: 6 slices; aim ring: 4 cardinal arcs (N centered at top). Export it; both `renderer` and `main._tapRadialMenu` use it (single source). Add 3-4 `node:test` cases for `wheelHitTest` (a point at the top of the aim band → `{ring:'aim', slice: N-index}`; a point in the hub → `{ring:'hub'}`; a far point → `{ring:'outside'}`).
- [ ] **Step 3 (verify):** `node --test tests/action-wheel.test.js` (extend with the `wheelHitTest` cases, or a new `tests/wheel-geometry.test.js`) → PASS.
- [ ] **Step 4: Commit** — `git commit -am "feat(wheel): three-ring geometry + compass hit-test in layout.js (tested)"`

---

## Task 8: Renderer — draw three rings (`renderer.js`)

**Files:** Modify `game/renderer.js` — rewrite `_drawRadialMenu(game)` (dispatched from `state==='radial_menu'`).

- [ ] **Step 1:** Read `game.wheel`, `currentAction`, `ringsFor`, the `RING_*_R` bands, and `CARDINALS`. Draw, outer→inner:
  - **Aim ring** (compass): 4 cardinal arcs labelled N/E/S/W; the `wheel.aim` arc highlighted cyan with an outward arrow. Dim (dashed, low alpha) when `!ringsFor(action).aim`.
  - **Item ring:** slices for `_wheelValidItemSlots()` items (name + count); the `wheel.itemSlot` slice highlighted. Dim when `!ringsFor(action).item`.
  - **Action ring:** the six verbs; `wheel.actionIndex` slice highlighted.
  - **Held-ring emphasis:** draw the ring matching `wheel.grip` at full brightness/cyan stroke; the others gold; dimmed rings dashed ~15% alpha.
  - **Hub:** static center text = the live composition (`THROW × ROCK × →E`, or just the verb for self-actions). Reuse the bitmap font helper.
  - Reuse the existing eased-rotation/label-upright helpers where useful; a fixed-layout (non-rotating) compass is fine for the aim ring since its slices are absolute directions.
- [ ] **Step 2 (verify in-browser, screenshot):** Open the wheel on Throw → screenshot shows three rings, item+aim lit, action highlighted, hub reads the composition. Switch to Defend → item+aim rings visibly dim. The held ring (move grip) shows the cyan emphasis.
- [ ] **Step 3: Commit** — `git commit -am "feat(wheel): render three rings with contextual dimming + held-ring highlight"`

---

## Task 9: Touch — `_tapRadialMenu` for three rings + compass d-pad (`main.js`)

**Files:** Modify `game/main.js` — `_tapRadialMenu(pt)`.

- [ ] **Step 1:** Convert the tap to wheel-local coords (existing `_canvasLocalCoords`), call `wheelHitTest`. On `{ring:'action', slice}` → set `wheel.actionIndex = slice` (clamp grip). `{ring:'item', slice}` → set `wheel.itemSlot` to the slot for that slice (from `_wheelValidItemSlots()`), only if the item ring is active. `{ring:'aim', slice}` → set `wheel.aim = CARDINALS[slice]` (the compass d-pad), only if aim is active. `{ring:'hub'}` → `_fireWheel()`. `{ring:'outside'}` → `_closeWheel()`. Tapping a dimmed ring = no-op.
- [ ] **Step 2 (verify in-browser):** Resize to mobile; via `preview_eval` dispatch `pointerdown`s at the east aim arc → `wheel.aim==='E'`; at an action slice → action changes; at the hub → fires.
- [ ] **Step 3: Commit** — `git commit -am "feat(wheel): touch — tap any ring slice; compass ring doubles as a d-pad"`

---

## Task 10: Absorb the throw-direction picker + hotbar throw routing (`main.js`)

**Files:** Modify `game/main.js`, `game/index.html` help text.

- [ ] **Step 1:** Remove the standalone `STATE.ITEM_THROW_DIR` flow as a *separate* prompt (its `_doThrow(dir)` resolver stays — Task 5 calls it with `DIR_VEC[aim]`). In the hotbar item overlay (`_openItemOverlay`/`_pickOverlay`), drop the `Throw` option (per confirmed decision: all throwing via the wheel). Keep `Use` (eat/drink/apply), `Give`, `Smash` as-is for now.
- [ ] **Step 2:** Update the in-game help (`index.html` #help-modal) and any "tap to throw" hints to describe the wheel.
- [ ] **Step 3 (verify in-browser):** The hotbar overlay no longer offers Throw; throwing works only via the wheel; Use still heals from the hotbar.
- [ ] **Step 4: Commit** — `git commit -am "feat(wheel): route all throwing through the wheel; hotbar keeps Use/Give"`

---

## Task 11: Polish — audio, animation budgets, the "wait" reshuffle (`main.js`)

**Files:** Modify `game/main.js`.

- [ ] **Step 1 (wait):** Since Space now opens the wheel, restore "wait a turn": when the wheel is open with **no valid action available** (e.g. no targets and the verb needs one), pressing Space logs `[Wait]` and `_advanceWorld()`. Additionally bind `KeyT` (or `Period`) in IDLE as an explicit quick-wait. (Pick one; document it in help.)
- [ ] **Step 2 (audio):** Confirm hooks fire: `menu-open` on `_openWheel`; a soft tick (`menu-confirm` at low volume, or a new `wheel-tick` recipe in `audio.js`) on each spin/grip move; `menu-confirm` on fire; `menu-cancel` on Esc.
- [ ] **Step 3 (animation):** Ensure spin uses the eased rotation (≤120ms) and open ≤80ms; input registers on keydown mid-animation (no buffering) — mirror the existing `_uiAnimating` gate but never block a queued keypress.
- [ ] **Step 4 (verify in-browser):** Audio plays on open/spin/fire/cancel (console shows no errors; you hear it with speakers). Mashing keys during the open animation never drops inputs.
- [ ] **Step 5: Commit** — `git commit -am "polish(wheel): audio ticks, snappy anim budgets, restore quick-wait"`

---

## Task 12: Full playthrough verification (the "Done when" scenario)

**Files:** none (verification + cleanup).

- [ ] **Step 1:** `node --test` → the `action-wheel` (+ geometry) suites are green.
- [ ] **Step 2 (in-browser):** Drive the spec's "Done when" scenario: rat one tile east → Space, Space (hit) → double-tap Space (hit again) → Space, grip to Item, spin to Rock, grip to Aim (east) → Space (rock down the line) → Space, spin to Defend (item+aim dim) → Esc, Esc to walking. Confirm no accidental fights from walking, every verb fires, and it feels snappy. Screenshot the wheel for the PR.
- [ ] **Step 3:** Update `plans/action-wheel-overhaul.md` Status to "Gate 4 — shipped", and `ROADMAP.md` if appropriate.
- [ ] **Step 4: Commit + open PR** — `git commit -am "test(wheel): playthrough verification + status"`, then a PR from `dev` summarizing the overhaul.

---

## Self-review (against the spec)

- **Spec coverage:** drop bump (T2) ✓ · open-anywhere button (T3) ✓ · three rings action/item/aim (T1, T8) ✓ · compass direction (T1, T7, T8) ✓ · navigation grip+spin (T4) / touch (T9) ✓ · contextual dimming (T1 config, T8 draw) ✓ · smart auto-aim (T1, T3) ✓ · double-tap repeat (T6) ✓ · fire→resolvers (T5) ✓ · snappiness/audio (T11) ✓ · all-throw-via-wheel (T10) ✓ · edge cases: no-target whiff (T5), empty item ring (T5), invalid repeat (T6) ✓.
- **Open spec items deferred (as agreed):** Inspect / mid-combat commerce (not in scope); persisting loadout across sessions (session-only).
- **Type/name consistency:** `wheel` state object + `WHEEL_ACTIONS/ACTION_RINGS/CARDINALS/DIR_VEC/RING_*` exports used identically across T1, T3–T9; `wheelHitTest` shared by T7/T8/T9; `_openWheel`/`_fireWheel`/`_closeWheel`/`_wheelValidItemSlots` named consistently.
