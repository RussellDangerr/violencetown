# Combat Wheel Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the grip+spin three-ring wheel with a circular-XMB combat menu — one grammar (`↑` forward · `↓` back · `←→` cycle) over a Fight/Trick/Treat/Flight verb tree, ending in a free targeting reticle — wiring only the actions that already exist.

**Architecture:** A pure **layer machine** in `action-wheel.js` (category → sub-verb → item → aim) drives selection; `main.js` translates keys/touch into machine transitions and routes the composed `(verb, item, aimTile)` to the **existing** resolvers (`combatAttack`, `resolveThrow`, `applyGive`, `resolveUse`, `addBuff('guard')`); `renderer.js` draws the carousel rings and the reticle/trajectory/footprint. Combat math is untouched.

**Tech Stack:** Vanilla ES modules, Canvas 2D, `node --test` for the pure logic (see Testing), `python dev-server.py 3001` + the in-browser loop for UI/input.

**Spec:** `plans/combat-wheel-rework.md` (Fight/Trick/Treat/Flight, real-placement reticle, universal agency, dependencies). Read it before starting.

**Branch:** build on **`feature/combat-wheel`** cut from `dev`. (This plan lives on `plan`; the spec it implements is also on `plan` — merge/read as needed.)

---

## Testing note (important — environment-specific)

- **Pure wheel-state logic** (`action-wheel.js`) is unit-tested with **`node --test tests/action-wheel.test.js`** — extend the existing file. These are the TDD tasks (1–6).
- **Input / render / touch** are not unit-testable; verify with the **in-browser loop**: `python dev-server.py 3001`, drive `window.__game` via the preview tools, sample state / screenshot. Each UI task lists the exact eval to run and the expected result.
- **No Node in some dev sandboxes:** if `node` is unavailable where you execute, the logic tests can't be *run* there — author them anyway (they run in CI / on the desktop) and lean on the in-browser checks as the local gate. Never claim a test passed without running it; say which environment ran it.
- **rAF is paused in a hidden preview tab** — opening the wheel keeps a particle loop pending, so `preview_screenshot` can time out. Capture via `game.renderer.canvas.toDataURL()` or shim `requestAnimationFrame = cb => setTimeout(()=>cb(performance.now()),16)` before driving timed flows. (Documented in the verify-violencetown memory.)

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `game/action-wheel.js` | Pure layer-machine model: verb tree, state, navigation, gating, `compose()` | **Rewrite** (replace grip/spin model) |
| `game/main.js` | RADIAL_MENU input → machine transitions; open/fire/double-tap; reticle mode; route fire → existing resolvers; retire old paths | **Modify** (input section + `_openWheel`/`_fireWheel`/`_spinWheel`/`_tapRadialMenu`) |
| `game/renderer.js` | Draw the carousel rings (+ greyed leaves, center composition, held-ring) and the reticle/trajectory/footprint/target highlight | **Modify** (`_drawWheel`; add `_drawReticle`) |
| `game/layout.js` | Carousel ring radii + touch hit-zones | **Modify** (ring geometry; reticle is world-space, no fixed geometry) |
| `game/data.js` | (only if needed) ensure `item.range` is read; no schema change expected | **Maybe-modify** |
| `tests/action-wheel.test.js` | Unit tests for the layer machine + compose + gating + auto-aim | **Extend** |

**Out of this plan (spec Dependencies — separate passes):** Magic, Ranged, the AoE damage + Cleave/Scatter/Burst, Hide/stealth, the 3-tile dash (Run wires to the existing 1-tile flee for now), the Give→Trade merge (Trade wires to existing give/trade for now), and multi-tile entities (reticle is built tile-set-aware but operates on 1×1 today). These leaves render **greyed/disabled** or wire to the nearest existing behavior, never as placeholders that crash.

---

## Task 0: Branch setup

- [ ] **Step 1: Cut the feature branch from dev**

```bash
git switch dev && git pull --ff-only && git switch -c feature/combat-wheel
```

- [ ] **Step 2: Confirm the test harness is present**

Run: `node --test tests/action-wheel.test.js`
Expected: existing tests PASS (baseline before changes).

---

## Task 1: Verb tree + leaf config (`action-wheel.js`)

**Files:**
- Modify: `game/action-wheel.js`
- Test: `tests/action-wheel.test.js`

The tree is data: four categories, each with ordered sub-verbs; each leaf declares whether it needs an item ring, its aim type, its resolver key, and an `available(game)` predicate (for greying). `aimType`: `'reticle'` (ranged/placement), `'adjacent'` (range-1 target-lock), `'none'` (self / no aim).

- [ ] **Step 1: Write the failing test**

```js
// tests/action-wheel.test.js  (add)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VERB_TREE, leafAt, categoryKeys } from '../game/action-wheel.js';

test('verb tree has the four categories in order', () => {
  assert.deepEqual(categoryKeys(), ['FIGHT', 'TRICK', 'TREAT', 'FLIGHT']);
});

test('Fight→Melee is an adjacent, no-item, combatAttack leaf', () => {
  const melee = leafAt('FIGHT', 0);
  assert.equal(melee.key, 'melee');
  assert.equal(melee.needsItem, false);
  assert.equal(melee.aimType, 'adjacent');
  assert.equal(melee.resolver, 'combatAttack');
});

test('Trick→Throw needs an item and uses the placement reticle', () => {
  const throwLeaf = VERB_TREE.TRICK.subverbs.find(s => s.key === 'throw');
  assert.equal(throwLeaf.needsItem, true);
  assert.equal(throwLeaf.aimType, 'reticle');
  assert.equal(throwLeaf.resolver, 'resolveThrow');
});

test('Treat leaves are self-targeted (aim none) and need an item', () => {
  const eat = VERB_TREE.TREAT.subverbs.find(s => s.key === 'eat');
  assert.equal(eat.aimType, 'none');
  assert.equal(eat.needsItem, true);
  assert.equal(eat.resolver, 'resolveUse');
});

test('Flight→Defend is self, no aim, no item', () => {
  const defend = VERB_TREE.FLIGHT.subverbs.find(s => s.key === 'defend');
  assert.equal(defend.aimType, 'none');
  assert.equal(defend.needsItem, false);
  assert.equal(defend.resolver, 'guard');
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `node --test tests/action-wheel.test.js`
Expected: FAIL ("VERB_TREE is not exported" / undefined).

- [ ] **Step 3: Implement the tree**

```js
// game/action-wheel.js  (top — replaces WHEEL_ACTIONS / ACTION_RINGS / RING_* model)

// Leaf shape: { key, label, needsItem, aimType, resolver, dep?, available(game) }
//   aimType: 'reticle' (free placement), 'adjacent' (range-1 lock), 'none' (self)
//   dep: true  → mechanic ships in a later pass; leaf shows greyed/wired-to-stub
const always = () => true;

export const VERB_TREE = {
  FIGHT: { label: 'FIGHT', subverbs: [
    { key: 'melee',  label: 'Melee',  needsItem: false, aimType: 'adjacent', resolver: 'combatAttack', available: always },
    { key: 'ranged', label: 'Ranged', needsItem: false, aimType: 'reticle',  resolver: 'rangedAttack', dep: true,
      available: (g) => !!g.equipment?.weapon?.ranged },
    { key: 'magic',  label: 'Magic',  needsItem: false, aimType: 'reticle',  resolver: 'castSpell',    dep: true,
      available: (g) => (g.playerMp ?? 0) > 0 && (g.knownSpells?.length ?? 0) > 0 },
  ]},
  TRICK: { label: 'TRICK', subverbs: [
    { key: 'throw', label: 'Throw', needsItem: true,  aimType: 'reticle',  resolver: 'resolveThrow', available: always },
    { key: 'trade', label: 'Trade', needsItem: false, aimType: 'adjacent', resolver: 'trade',        available: always },
  ]},
  TREAT: { label: 'TREAT', subverbs: [
    { key: 'eat',     label: 'Eat',     needsItem: true, aimType: 'none', resolver: 'resolveUse', available: always },
    { key: 'cleanse', label: 'Cleanse', needsItem: true, aimType: 'none', resolver: 'resolveUse', available: always },
  ]},
  FLIGHT: { label: 'FLIGHT', subverbs: [
    { key: 'defend', label: 'Defend', needsItem: false, aimType: 'none',     resolver: 'guard', available: always },
    { key: 'hide',   label: 'Hide',   needsItem: false, aimType: 'none',     resolver: 'hide',  dep: true, available: always },
    { key: 'wait',   label: 'Wait',   needsItem: false, aimType: 'none',     resolver: 'wait',  available: always },
    { key: 'run',    label: 'Run',    needsItem: false, aimType: 'adjacent', resolver: 'run',   available: always },
  ]},
};

export const categoryKeys = () => Object.keys(VERB_TREE);
export const leafAt = (catKey, i) => VERB_TREE[catKey].subverbs[i];
```

- [ ] **Step 4: Run it, verify it passes**

Run: `node --test tests/action-wheel.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add game/action-wheel.js tests/action-wheel.test.js
git commit -m "feat(wheel): Fight/Trick/Treat/Flight verb tree + leaf config"
```

---

## Task 2: `createWheelState` — the layer machine

**Files:** Modify `game/action-wheel.js` · Test `tests/action-wheel.test.js`

State: which layer you're in, the carousel index per layer, the reticle, and `lastFired`. `LAYER` ∈ `CATEGORY | SUBVERB | ITEM | AIM`.

- [ ] **Step 1: Failing test**

```js
import { createWheelState, LAYER } from '../game/action-wheel.js';
test('new wheel starts at the CATEGORY layer on FIGHT', () => {
  const w = createWheelState();
  assert.equal(w.layer, LAYER.CATEGORY);
  assert.equal(w.categoryIndex, 0);
  assert.equal(w.subVerbIndex, 0);
  assert.equal(w.itemIndex, 0);
  assert.equal(w.reticle, null);
  assert.equal(w.lastFired, null);
});
```

- [ ] **Step 2: Run, verify fail.** `node --test tests/action-wheel.test.js` → FAIL.

- [ ] **Step 3: Implement**

```js
// game/action-wheel.js
export const LAYER = { CATEGORY: 0, SUBVERB: 1, ITEM: 2, AIM: 3 };

export function createWheelState() {
  return {
    layer: LAYER.CATEGORY,
    categoryIndex: 0,
    subVerbIndex: 0,
    itemIndex: 0,
    reticle: null,            // {x, y} when in AIM
    lastFired: null,          // {catKey, subKey, itemSlot, aimTile}
  };
}
```

- [ ] **Step 4: Run, verify pass.** PASS.

- [ ] **Step 5: Commit.** `git commit -am "feat(wheel): createWheelState layer machine"`

---

## Task 3: Navigation — `cycle`, `forward`, `back`

**Files:** Modify `game/action-wheel.js` · Test `tests/action-wheel.test.js`

`cycle(w, dir, game)` rotates the current layer's carousel (wrap-around). `forward(w, game)` advances to the next *needed* layer (skips ITEM if the leaf has no item; goes to AIM only if aimType≠'none') and returns `'fire'` when there's nothing left to advance into. `back(w)` pops one layer and returns `'close'` at the top.

- [ ] **Step 1: Failing test**

```js
import { createWheelState, cycle, forward, back, LAYER, currentLeaf } from '../game/action-wheel.js';
const G = { inventory: [], enemies: [], containers: [], equipment: {}, playerMp: 0 };

test('cycle wraps category index', () => {
  const w = createWheelState();
  cycle(w, -1, G);                       // FIGHT -> wrap to FLIGHT
  assert.equal(w.categoryIndex, 3);
  cycle(w, +1, G);                       // back to FIGHT
  assert.equal(w.categoryIndex, 0);
});

test('forward from CATEGORY enters SUBVERB; Defend forward = fire (no item/aim)', () => {
  const w = createWheelState();
  w.categoryIndex = 3;                    // FLIGHT
  forward(w, G); assert.equal(w.layer, LAYER.SUBVERB);
  // FLIGHT subverbs: defend(0) hide(1) wait(2) run(3) — sit on defend
  assert.equal(currentLeaf(w).key, 'defend');
  assert.equal(forward(w, G), 'fire');   // self, no item, no aim → fire
});

test('Melee forward skips ITEM, enters AIM (adjacent)', () => {
  const w = createWheelState();          // FIGHT/Melee
  forward(w, G);                         // -> SUBVERB (melee)
  assert.equal(forward(w, G), undefined);
  assert.equal(w.layer, LAYER.AIM);
});

test('back pops layers and closes at the top', () => {
  const w = createWheelState();
  forward(w, G);                         // SUBVERB
  back(w); assert.equal(w.layer, LAYER.CATEGORY);
  assert.equal(back(w), 'close');
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement**

```js
// game/action-wheel.js
export const currentCategory = (w) => VERB_TREE[categoryKeys()[w.categoryIndex]];
export const currentLeaf = (w) => currentCategory(w).subverbs[w.subVerbIndex];

const wrap = (i, n) => ((i % n) + n) % n;

// items valid for the current leaf (throwables for throw, consumables for treat, etc.)
export function validItemSlots(w, game) {
  const leaf = currentLeaf(w);
  if (!leaf.needsItem) return [];
  return game.inventory
    .map((slot, i) => ({ slot, i }))
    .filter(({ slot }) => slot && itemAllowedForLeaf(slot.itemDef, leaf))
    .map(({ i }) => i);
}
// throw → throwable; eat/cleanse → usable-on-self. Falls back to "any item" if the
// item schema doesn't tag useType, so nothing is silently un-selectable.
function itemAllowedForLeaf(def, leaf) {
  if (leaf.key === 'throw')   return def.useType ? def.useType.includes('throw') : true;
  if (leaf.resolver === 'resolveUse') return def.useType ? def.useType.includes('use') : true;
  return true;
}

export function cycle(w, dir, game) {
  if (w.layer === LAYER.CATEGORY) {
    w.categoryIndex = wrap(w.categoryIndex + dir, categoryKeys().length);
    w.subVerbIndex = 0;
  } else if (w.layer === LAYER.SUBVERB) {
    w.subVerbIndex = wrap(w.subVerbIndex + dir, currentCategory(w).subverbs.length);
  } else if (w.layer === LAYER.ITEM) {
    const slots = validItemSlots(w, game);
    if (slots.length) {
      const at = Math.max(0, slots.indexOf(w.itemIndex));
      w.itemIndex = slots[wrap(at + dir, slots.length)];
    }
  }
  // AIM cycling is the reticle (handled in main.js reticle mode), not here.
}

// Returns 'fire' if the action is fully composed and should resolve; else undefined.
export function forward(w, game) {
  const leaf = currentLeaf(w);
  switch (w.layer) {
    case LAYER.CATEGORY:
      w.layer = LAYER.SUBVERB; return;
    case LAYER.SUBVERB:
      if (leaf.needsItem) {
        const slots = validItemSlots(w, game);
        if (!slots.length) return;                 // empty item ring → can't advance
        if (!slots.includes(w.itemIndex)) w.itemIndex = slots[0];
        w.layer = LAYER.ITEM; return;
      }
      if (leaf.aimType !== 'none') { w.layer = LAYER.AIM; return; }
      return 'fire';
    case LAYER.ITEM:
      if (leaf.aimType !== 'none') { w.layer = LAYER.AIM; return; }
      return 'fire';
    case LAYER.AIM:
      return 'fire';
  }
}

// Returns 'close' when already at the top.
export function back(w) {
  if (w.layer === LAYER.CATEGORY) return 'close';
  w.layer -= 1;
  if (w.layer < LAYER.SUBVERB) w.layer = LAYER.CATEGORY;
  w.reticle = null;
  return;
}
```

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Commit.** `git commit -am "feat(wheel): cycle/forward/back navigation"`

---

## Task 4: Availability gating (greyed leaves)

**Files:** Modify `game/action-wheel.js` · Test `tests/action-wheel.test.js`

Leaves are never removed — `leafEnabled(leaf, game)` says whether it can be *fired*; the renderer greys disabled ones and `forward` refuses to fire them.

- [ ] **Step 1: Failing test**

```js
import { leafEnabled } from '../game/action-wheel.js';
test('Magic is disabled without MP/spells; Melee always enabled', () => {
  const noMagic = { playerMp: 0, knownSpells: [], equipment: {}, inventory: [] };
  assert.equal(leafEnabled(VERB_TREE.FIGHT.subverbs[2], noMagic), false); // magic
  assert.equal(leafEnabled(VERB_TREE.FIGHT.subverbs[0], noMagic), true);  // melee
});
test('Throw disabled with no throwable items', () => {
  const g = { inventory: [], equipment: {}, playerMp: 0 };
  assert.equal(leafEnabled(VERB_TREE.TRICK.subverbs[0], g), false);
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement**

```js
// game/action-wheel.js
export function leafEnabled(leaf, game) {
  if (!leaf.available(game)) return false;
  if (leaf.needsItem) {
    const slots = game.inventory
      .filter(s => s && itemAllowedForLeaf(s.itemDef, leaf));
    if (!slots.length) return false;
  }
  return true;
}
```

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Commit.** `git commit -am "feat(wheel): leaf availability gating"`

---

## Task 5: `compose()` + resolver map

**Files:** Modify `game/action-wheel.js` · Test `tests/action-wheel.test.js`

`compose(w, game)` returns `{ leaf, itemSlot, aimTile }` for `main.js` to route. `RESOLVERS` is just the leaf→key map already on each leaf; the *functions* live in `main.js` (they need game internals).

- [ ] **Step 1: Failing test**

```js
import { compose } from '../game/action-wheel.js';
test('compose returns the leaf, item slot, and reticle tile', () => {
  const w = createWheelState();
  w.categoryIndex = 1; w.subVerbIndex = 0;  // TRICK/Throw
  w.itemIndex = 2; w.reticle = { x: 5, y: 7 };
  const c = compose(w, { inventory: [] });
  assert.equal(c.leaf.key, 'throw');
  assert.equal(c.itemSlot, 2);
  assert.deepEqual(c.aimTile, { x: 5, y: 7 });
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement**

```js
// game/action-wheel.js
export function compose(w) {
  const leaf = currentLeaf(w);
  return {
    leaf,
    itemSlot: leaf.needsItem ? w.itemIndex : -1,
    aimTile: leaf.aimType === 'none' ? null : (w.reticle || null),
  };
}
```

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Commit.** `git commit -am "feat(wheel): compose() output for the resolver router"`

---

## Task 6: Auto-aim — pure target picker

**Files:** Modify `game/action-wheel.js` · Test `tests/action-wheel.test.js`

`autoAimTile(leaf, game)` returns the reticle's starting tile: nearest alive hostile for Fight/Throw, adjacent NPC for Trade, the safest walkable adjacent for Run, else the player's facing tile. Pure given the game snapshot it reads (`playerX/Y`, `enemies`, `facing`, `map`).

- [ ] **Step 1: Failing test**

```js
import { autoAimTile } from '../game/action-wheel.js';
const board = {
  playerX: 5, playerY: 5, facing: 'down',
  map: { isWalkable: () => true },
  enemies: [
    { x: 5, y: 9, entity: { isAlive: () => true }, behavior: ['HOSTILE'] },
    { x: 6, y: 5, entity: { isAlive: () => true }, behavior: ['HOSTILE'] }, // nearest
  ],
};
test('Melee auto-aims the nearest hostile', () => {
  assert.deepEqual(autoAimTile(VERB_TREE.FIGHT.subverbs[0], board), { x: 6, y: 5 });
});
test('falls back to the facing tile when no hostiles', () => {
  const empty = { ...board, enemies: [] };
  assert.deepEqual(autoAimTile(VERB_TREE.FIGHT.subverbs[0], empty), { x: 5, y: 6 }); // down
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement**

```js
// game/action-wheel.js
const FACING_DELTA = { up:[0,-1], down:[0,1], left:[-1,0], right:[1,0] };
function facingTile(g){ const [dx,dy]=FACING_DELTA[g.facing]||[0,1]; return {x:g.playerX+dx,y:g.playerY+dy}; }
const cheb = (ax,ay,bx,by) => Math.max(Math.abs(ax-bx), Math.abs(ay-by));

export function autoAimTile(leaf, game) {
  if (leaf.aimType === 'none') return null;
  const alive = (game.enemies||[]).filter(e => e.entity.isAlive());
  if (leaf.resolver === 'run') {
    // safest = adjacent walkable tile maximizing distance from nearest hostile
    const cands = Object.values(FACING_DELTA)
      .map(([dx,dy]) => ({x:game.playerX+dx, y:game.playerY+dy}))
      .filter(t => game.map.isWalkable(t.x,t.y));
    if (!cands.length) return facingTile(game);
    const distTo = t => alive.length ? Math.min(...alive.map(e=>cheb(t.x,t.y,e.x,e.y))) : 99;
    return cands.sort((a,b)=>distTo(b)-distTo(a))[0];
  }
  const pool = leaf.resolver === 'trade'
    ? alive                                  // any adjacent character to trade/give
    : alive.filter(e => !e.behavior || e.behavior.includes('HOSTILE'));
  if (!pool.length) return facingTile(game);
  return pool
    .map(e => ({ x:e.x, y:e.y, d:cheb(game.playerX,game.playerY,e.x,e.y) }))
    .sort((a,b)=>a.d-b.d)
    .map(({x,y})=>({x,y}))[0];
}
```

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Commit.** `git commit -am "feat(wheel): autoAimTile pure target picker"`

---

## Task 7: Open the wheel — restore + auto-aim seed (`main.js`)

**Files:** Modify `game/main.js` (`_openWheel`, constructor wheel state)

- [ ] **Step 1: Implement** — replace the old wheel-state creation and `_openWheel`:

```js
// constructor
import { createWheelState, currentLeaf, autoAimTile, LAYER } from './action-wheel.js';
this.wheel = createWheelState();

// _openWheel()
_openWheel() {
  if (this.state !== STATE.IDLE) return;
  this.state = STATE.RADIAL_MENU;
  // restore last leaf (categoryIndex/subVerbIndex persist on this.wheel);
  // re-seed the reticle from auto-aim for the restored leaf.
  this.wheel.layer = LAYER.CATEGORY;
  const leaf = currentLeaf(this.wheel);
  this.wheel.reticle = autoAimTile(leaf, this);
  audio.playSfx('menu-open');
  this._ensureParticleLoop();
  this._render();
}
```

- [ ] **Step 2: Verify in-browser**

Start `python dev-server.py 3001`; in the preview: get to IDLE, then
```js
__game._openWheel(); ({state:__game.state, leaf: __game.wheel && __game.wheel.categoryIndex, reticle: __game.wheel.reticle})
```
Expected: `state:"radial_menu"`, a reticle `{x,y}` (auto-aimed) or the facing tile.

- [ ] **Step 3: Commit.** `git commit -am "feat(wheel): open restores last leaf + seeds auto-aim"`

---

## Task 8: Ring navigation in RADIAL_MENU (`main.js`)

**Files:** Modify `game/main.js` (the `if (this.state === STATE.RADIAL_MENU)` keydown branch)

Replace grip/spin handling with the carousel grammar. AIM is handled in Task 9.

- [ ] **Step 1: Implement**

```js
import { cycle, forward, back, currentLeaf, compose, leafEnabled, autoAimTile } from './action-wheel.js';

if (this.state === STATE.RADIAL_MENU) {
  e.preventDefault();
  const w = this.wheel;
  if (w.layer === LAYER.AIM) { this._reticleKey(e.code); return; }  // Task 9

  if (e.code === 'ArrowLeft'  || e.code === 'KeyA') { cycle(w, -1, this); audio.playSfx('menu-tick'); this._render(); return; }
  if (e.code === 'ArrowRight' || e.code === 'KeyD') { cycle(w, +1, this); audio.playSfx('menu-tick'); this._render(); return; }
  if (e.code === 'ArrowDown'  || e.code === 'KeyS' || e.code === 'Escape') {
    if (back(w) === 'close') { this._closeWheel(); } else { audio.playSfx('menu-cancel'); this._render(); }
    return;
  }
  if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Space' || e.code === 'Enter') {
    // refuse to advance into a disabled leaf at the SUBVERB layer
    if (w.layer === LAYER.SUBVERB && !leafEnabled(currentLeaf(w), this)) { audio.playSfx('bump-wall'); return; }
    const r = forward(w, this);
    if (w.layer === LAYER.AIM && !w.reticle) w.reticle = autoAimTile(currentLeaf(w), this);
    if (r === 'fire') { this._fireWheel(); } else { audio.playSfx('menu-tick'); this._render(); }
    return;
  }
  return;
}
```

- [ ] **Step 2: Verify in-browser**

```js
__game._openWheel();
document.dispatchEvent(new KeyboardEvent('keydown',{code:'ArrowRight'}));  // FIGHT->TRICK
document.dispatchEvent(new KeyboardEvent('keydown',{code:'ArrowUp'}));     // into TRICK subverbs
({layer:__game.wheel.layer, cat:__game.wheel.categoryIndex, sub:__game.wheel.subVerbIndex});
```
Expected: `cat:1` (TRICK), `layer:1` (SUBVERB).

- [ ] **Step 3: Commit.** `git commit -am "feat(wheel): carousel grammar (forward/back/cycle) for rings"`

---

## Task 9: Reticle mode for AIM (`main.js`)

**Files:** Modify `game/main.js` (add `_reticleKey`)

- [ ] **Step 1: Implement**

```js
_reticleKey(code) {
  const w = this.wheel;
  const leaf = currentLeaf(w);
  const range = this._aimRange(leaf);     // 1 for adjacent, item.range for throw (Task 10 helper)
  const move = { ArrowUp:[0,-1], KeyW:[0,-1], ArrowDown:[0,1], KeyS:[0,1],
                 ArrowLeft:[-1,0], KeyA:[-1,0], ArrowRight:[1,0], KeyD:[1,0] }[code];
  if (move) {
    const nx = w.reticle.x + move[0], ny = w.reticle.y + move[1];
    if (cheb(this.playerX, this.playerY, nx, ny) <= range && this.map.isWalkable(nx, ny)) {
      w.reticle = { x: nx, y: ny }; this._render();
    }
    return;
  }
  if (code === 'Space' || code === 'Enter') { this._fireWheel(); return; }
  if (code === 'Escape') { back(w); audio.playSfx('menu-cancel'); this._render(); return; }
}
// cheb helper (top of main.js): const cheb=(ax,ay,bx,by)=>Math.max(Math.abs(ax-bx),Math.abs(ay-by));
```

Note: in AIM, `↓` moves the reticle (not "back") — back is `Escape`. This is the one documented grammar exception (spec §Aim).

- [ ] **Step 2: Verify in-browser** — open wheel, go to a Throw leaf, enter AIM, dispatch ArrowUp, confirm `__game.wheel.reticle.y` decreased and stayed within range.

- [ ] **Step 3: Commit.** `git commit -am "feat(wheel): reticle aim mode (move/fire/cancel)"`

---

## Task 10: Fire — route compose() to the existing resolvers (`main.js`)

**Files:** Modify `game/main.js` (`_fireWheel`, `_aimRange`)

Only existing resolvers are wired. `dep` leaves (Ranged/Magic/Hide) are blocked earlier by `leafEnabled`; if one slips through, fire is a logged no-op (never crash). Run wires to the existing 1-tile move (dash is a dep). Trade wires to existing give/trade.

- [ ] **Step 1: Implement**

```js
_aimRange(leaf) {
  if (leaf.aimType === 'adjacent') return 1;
  if (leaf.key === 'throw') {
    const slot = this.inventory[this.wheel.itemIndex];
    return (slot && slot.itemDef.range) || 5;
  }
  return 1;
}

_fireWheel() {
  const { leaf, itemSlot, aimTile } = compose(this.wheel);
  this.wheel.lastFired = {
    catKey: categoryKeys()[this.wheel.categoryIndex], subKey: leaf.key, itemSlot, aimTile,
  };
  audio.playSfx('menu-confirm');
  const done = () => { this._closeWheel(); };  // closeWheel → STATE.IDLE, advanceWorld handled by resolver

  switch (leaf.resolver) {
    case 'combatAttack': {
      const enemy = aimTile && this.enemies.find(e => e.entity.isAlive() && e.x===aimTile.x && e.y===aimTile.y);
      if (enemy) { this.combatAttack(enemy, this.equipment.weapon.damage); this._advanceWorld(); }
      done(); return;
    }
    case 'resolveThrow': {
      if (itemSlot >= 0 && aimTile) { this._throwAt(itemSlot, aimTile); }  // wraps resolveThrow at a tile
      done(); return;
    }
    case 'resolveUse': {
      if (itemSlot >= 0) { this._doItemUse(itemSlot); }                    // self-use; advances world inside
      done(); return;
    }
    case 'guard':  { this.addBuff('guard','Guard',1,'buff'); this._advanceWorld(); done(); return; }
    case 'wait':   { this._log('[Wait]'); this._advanceWorld(); done(); return; }
    case 'run':    { const d=this._aimDir(aimTile); if(d) this._doMove(d); done(); return; }
    case 'trade': {
      const npc = aimTile && this.enemies.find(e => e.x===aimTile.x && e.y===aimTile.y);
      if (npc) { this._openTradeOrGive(npc); }                            // existing give/trade entry
      done(); return;
    }
    default: { this._log(`[${leaf.label} isn't ready yet]`); done(); return; }  // dep stub — no crash
  }
}
_aimDir(tile){ if(!tile) return null; return { dx: Math.sign(tile.x-this.playerX), dy: Math.sign(tile.y-this.playerY) }; }
```

- [ ] **Step 2: Add the thin helpers** `_throwAt(slot, tile)` (resolve the existing throw toward `tile`'s direction/line — reuse `resolveThrow` + the current throw pipeline) and `_openTradeOrGive(npc)` (call `_openTrade(npc)` if vendor, else `applyGive`/the give flow). Keep them small; reuse existing functions.

- [ ] **Step 3: Verify in-browser (sewer, real enemies)** — for each of Melee, Throw, Treat(heal), Defend, Wait: open wheel → navigate → fire → assert the expected effect (enemy HP drop, item consumed, guard buff present, turn advanced). Confirm a `dep` leaf (force `Magic`) logs the not-ready beat and does NOT crash.

- [ ] **Step 4: Commit.** `git commit -am "feat(wheel): fire routes compose() to existing resolvers"`

---

## Task 11: Double-tap-repeat express lane (`main.js`)

**Files:** Modify `game/main.js` (the Space handler at IDLE + a timestamp)

- [ ] **Step 1: Implement** — on Space at IDLE, if within 250ms of the last Space *and* `this.wheel.lastFired` is still valid (target alive / item present), re-fire it without opening; else `_openWheel()`.

```js
if (e.code === 'Space') {
  e.preventDefault();
  const now = performance.now();
  if (now - (this._lastActKeyAt||0) < 250 && this._canRepeatLast()) { this._repeatLastAction(); }
  else { this._openWheel(); }
  this._lastActKeyAt = now;
  return;
}
```
`_canRepeatLast()` validates `wheel.lastFired` (target still alive at `aimTile`, item still in slot); `_repeatLastAction()` re-runs the same `_fireWheel` path from `lastFired` without drawing the wheel.

- [ ] **Step 2: Verify in-browser** — adjacent to an enemy, double-dispatch Space quickly; confirm two hits and the wheel never rendered (`state` returned to idle between).

- [ ] **Step 3: Commit.** `git commit -am "feat(wheel): double-tap-repeat express lane"`

---

## Task 12: Retire the old grip/spin paths

**Files:** Modify `game/main.js`, `game/action-wheel.js`

- [ ] **Step 1:** Delete the old `moveGrip`/`spinRing`/`gripOrder`/`ACTION_RINGS`/`RING_*`/`createWheelState`-old and the `_spinWheel`/`_animateWheelRing`/`_wheelRingRot`/`_snapWheelRot` machinery and the `STATE.ITEM_THROW_DIR` / `_doThrow(dir)` standalone flow (absorbed by the reticle). Grep first:

Run: `git grep -nE "moveGrip|spinRing|gripOrder|ACTION_RINGS|RING_ACTION|RING_ITEM|RING_AIM|_spinWheel|ITEM_THROW_DIR" game/`
Remove/replace every hit; keep eased-rotation helpers only if the carousel render reuses them.

- [ ] **Step 2: Verify** — `node --test tests/action-wheel.test.js` PASS; in-browser smoke: open wheel, navigate all four categories, fire Melee, no console errors.

- [ ] **Step 3: Commit.** `git commit -am "refactor(wheel): remove grip/spin + standalone throw-dir paths"`

---

## Task 13: Carousel geometry (`layout.js`)

**Files:** Modify `game/layout.js`

- [ ] **Step 1:** Define ring radii for the carousel (category ring inner, sub-verb mid, item outer) reusing the existing `RING_*_R` constants' scale, plus the angular slice geometry and touch hit-zones (a `wheelHitTest(px,py) → {layer, index}` for Task 16). Export the same shape the renderer + hit-test both import (single source, per the existing pattern).

- [ ] **Step 2: Verify** — pure: a tiny node test that `wheelHitTest` maps the center, a slice angle, and outside-the-wheel to the right `{layer,index}`/null. (Add to `tests/action-wheel.test.js` or a new `tests/wheel-layout.test.js`.)

- [ ] **Step 3: Commit.** `git commit -am "feat(wheel): carousel geometry + hit-zones in layout.js"`

---

## Task 14: Draw the carousel (`renderer.js`)

**Files:** Modify `game/renderer.js` (`_drawWheel`)

- [ ] **Step 1:** Rewrite `_drawWheel(game)` to render, for the current `wheel.layer`, the active ring as a carousel: the selected slice centered/brightest, neighbors curving away and **fading at the edges** (alpha ramp), the **center composition** text (e.g. `TRICK ▸ Throw ▸ Hot Dog`), disabled leaves drawn greyed (use `leafEnabled`), and the held layer highlighted. Generalize the existing ring-draw; show only the rings up to the current layer. Real drawing code follows the existing `_drawWheel` patterns (bitmap font, UI palette, `ctx.arc`).

- [ ] **Step 2: Verify in-browser (screenshot)** — open the wheel at each layer; capture `game.renderer.canvas.toDataURL()` (rAF-safe) and confirm: four categories legible, greyed leaves visibly dimmer, center composition correct, edge fade present.

- [ ] **Step 3: Commit.** `git commit -am "feat(wheel): circular carousel render with edge fade + greying"`

---

## Task 15: Draw the reticle (`renderer.js`)

**Files:** Modify `game/renderer.js` (add `_drawReticle`, call from `renderFrame` when `wheel.layer === AIM`)

- [ ] **Step 1:** Draw, in world space (under the existing camera transform): a reticle box on `wheel.reticle`, a dotted **trajectory** from the player to it, the **3×3 footprint** if the held item is AoE (`itemDef.aoe`), tiles beyond range dimmed, and a highlight on every character whose tile(s) the footprint/target covers. Multi-tile-aware: operate on tile sets so a future big enemy lights all its tiles.

- [ ] **Step 2: Verify in-browser (screenshot)** — Throw leaf in AIM with an AoE item: footprint + trajectory render; move the reticle, footprint follows; an enemy under it highlights.

- [ ] **Step 3: Commit.** `git commit -am "feat(wheel): reticle + trajectory + 3x3 footprint render"`

---

## Task 16: Touch input

**Files:** Modify `game/main.js` (`_tapRadialMenu`), `game/layout.js` (hit-zones)

- [ ] **Step 1:** Rework `_tapRadialMenu(px,py)`: tap a slice → select + `forward`; swipe ←/→ → `cycle`; a thumb BACK affordance → `back`. In AIM, tap a tile → move reticle there (clamped to range); a FIRE button / second tap → `_fireWheel`. Reuse `wheelHitTest` from Task 13.

- [ ] **Step 2: Verify in-browser** — dispatch synthetic pointer events on the canvas slice centers (from `layout.js` geometry) and confirm the same state transitions as keyboard.

- [ ] **Step 3: Commit.** `git commit -am "feat(wheel): touch — tap/swipe rings + tap-to-aim reticle"`

---

## Task 17: Audio hooks + reduce-motion

**Files:** Modify `game/main.js`, `game/renderer.js`

- [ ] **Step 1:** Ensure `menu-open` (open), `menu-tick` (cycle/forward), `menu-confirm` (fire), `menu-cancel` (back) fire (add SFX names to `audio.js` if missing). In the renderer, when `Settings.get('reduceMotion')`, snap carousel/edge-fade transitions instantly (no eased spin), matching the existing reduce-motion pattern.

- [ ] **Step 2: Verify in-browser** — toggle reduce-motion; confirm no eased rotation; confirm SFX calls fire (console-log shim if needed).

- [ ] **Step 3: Commit.** `git commit -am "feat(wheel): audio hooks + reduce-motion snap"`

---

## Task 18: No-regression + "done-when" playtest

**Files:** none (verification)

- [ ] **Step 1:** `node --test` (full suite) → PASS (combat resolvers, save round-trip untouched).
- [ ] **Step 2:** In-browser playtest the spec's "done-when": rat east → Space, Space (Melee auto-aimed); double-tap Space (repeat); then Trick → Throw → Fire Potion → nudge reticle onto a target → fire; `↓` back to walking. Confirm movement/shove input still works (open wheel only via Space; bump still shoves).
- [ ] **Step 3:** Push the branch and stop for Caelan's review/merge.

```bash
git push -u origin feature/combat-wheel
```

---

## Self-review (filled)

- **Spec coverage:** grammar (T3,8), reticle real-placement (T6,9,15), Fight/Trick/Treat/Flight tree (T1), universal agency / no gating-by-target (T4 gates by *capability*, never by target identity), auto-aim (T6,7), greyed leaves (T4,14), double-tap-repeat (T11), touch (T16), dependencies left as greyed/stub (T1 `dep`, T10 default case). Mapped.
- **Placeholder scan:** `dep`-leaf behavior is concrete (greyed + logged no-op), not a TODO; render tasks (14/15/16) describe the exact draw contents + verification rather than full canvas code, intentionally following the existing `_drawWheel` patterns — flagged as the one place code is sketched, not omitted.
- **Type consistency:** `LAYER`, `currentLeaf`, `compose`→`{leaf,itemSlot,aimTile}`, `leafEnabled`, `autoAimTile`, `validItemSlots`, `cheb` used consistently across tasks.
