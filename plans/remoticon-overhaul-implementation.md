# REMOTICON overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop HUD panels from overlapping (with a test that keeps them apart), grow the bag to a 50-slot two-zone (10 SAFE / 40 PACK) layout, and give the REMOTICON a unified tap-to-inspect panel that shows item stats + actions and a real equipment chooser.

**Architecture:** Three independent phases. **A (HUD de-overlap)** adds pure rect helpers + a state-keyed panel enumerator to `game/layout.js` and a net-new invariant test, then shrinks the message-log rect to clear the always-live usable-bar. **B (inventory zones)** extracts the bag routing into a new pure `game/inventory.js`, flips pickup to PACK-first, makes defeat-safety zonal, and renders the bag as two zones. **C (inspector)** adds a `_deviceSel` sub-selection inside `STATE.DEVICE` that draws an inspector panel (stats + action rows) for ITEMS and an options-list-with-deltas for GEAR — no new top-level state.

**Tech Stack:** Vanilla ES modules, HTML5 Canvas, no build step. Tests: `node --test` (node:test + node:assert/strict). Run with `export PATH="$PATH:/c/Program Files/nodejs"` first. Branch: `feature/remoticon-overhaul` (from `dev` @ `0220293`). Spec: `plans/remoticon-overhaul-design.md`.

**Baseline:** `node --test tests/*.test.js` → 254 tests, **8 known-failing** (inventory-stacking:127, target-list:17/:35, throw-vs-use:65/:88/:110, wheel-model:97/:122). Every task must add zero NEW failures. Note: Task B1 fixes the `inventory-stacking:127` stale assertion, so from B1 onward the known-failing count is **7**.

**Canvas coords:** internal canvas is `608×608` (`CANVAS_INTERNAL_PX`, `layout.js:17`). `HIT_SLOP = 6` (`layout.js:18`).

---

## PHASE A — HUD panels must not overlap

The message log (`QUESTLOG_RECT {x:6,y:436,w:340,h:104}` → y 436–540) and the always-live usable-bar (`_drawXmbBar`, panel y 510–592) overlap in a 30px band. Worse, `main.js:1756` hit-tests the log **expanded by HIT_SLOP** (→ y 430–546) and returns before the bar's tap handler at `main.js:1764`, so DRINK/EAT chips at y 516–536 are swallowed by the log-modal opener. Fix: a non-overlap invariant test (fails today), then shrink the log rect to clear the bar.

### Task A1: Pure rect helpers in layout.js

**Files:**
- Modify: `game/layout.js` (add exports near the top, after the `HIT_SLOP` constant at line 18)
- Test: `tests/hud-layout.test.js` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/hud-layout.test.js`:

```js
// hud-layout.test.js — pure rect geometry helpers for the HUD non-overlap invariant.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { rectsOverlap, expandRect } from '../game/layout.js';

describe('rectsOverlap', () => {
    test('true when rects share area', () => {
        assert.equal(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }), true);
    });
    test('false when disjoint on x', () => {
        assert.equal(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 10, h: 10 }), false);
    });
    test('false when disjoint on y', () => {
        assert.equal(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 20, w: 10, h: 10 }), false);
    });
    test('edge-touching (shared border, zero area) is NOT overlap', () => {
        assert.equal(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 }), false);
    });
});

describe('expandRect', () => {
    test('grows a rect by slop on every side', () => {
        assert.deepEqual(expandRect({ x: 10, y: 10, w: 20, h: 20 }, 6), { x: 4, y: 4, w: 32, h: 32 });
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `export PATH="$PATH:/c/Program Files/nodejs"; node --test tests/hud-layout.test.js`
Expected: FAIL — `rectsOverlap`/`expandRect` are not exported.

- [ ] **Step 3: Implement in `game/layout.js`**

Add immediately after `export const HIT_SLOP = 6;` (line 18):

```js
// Pure rect intersection — true iff a and b share positive area. Edge-touching
// (a.right === b.left) is NOT overlap, so panels may abut without clipping.
export function rectsOverlap(a, b) {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

// Grow a rect by `slop` on every side — used to test the TAP zone (HIT_SLOP)
// for overlap, not just the drawn rect, so no tap can land ambiguously.
export function expandRect(r, slop) {
    return { x: r.x - slop, y: r.y - slop, w: r.w + 2 * slop, h: r.h + 2 * slop };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/hud-layout.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add game/layout.js tests/hud-layout.test.js
git commit -m "feat(ui): pure rectsOverlap + expandRect helpers for the HUD invariant"
```
End the body with:
```
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

---

### Task A2: The non-overlap invariant test (fails on today's geometry)

**Files:**
- Modify: `game/layout.js` (add `xmbBarPanelRect` + `hudInteractiveRects`)
- Test: `tests/hud-layout.test.js` (extend)

Context: the XMB bar's background panel extent isn't a single constant — it's computed in `renderer.js:1978-1980` from `xmbBarLayout()`. To test overlap we need the bar's worst-case (widest, n=3 categories) panel rect as a pure function. From recon: panel is `x 144–464, y 510–592` at n=3.

- [ ] **Step 1: Write the failing test**

Append to `tests/hud-layout.test.js`:

```js
import { QUESTLOG_RECT, HIT_SLOP, xmbBarPanelRect, hudInteractiveRects } from '../game/layout.js';

describe('HUD non-overlap invariant', () => {
    test('xmbBarPanelRect worst-case matches the recon extent (n=3)', () => {
        const r = xmbBarPanelRect(3);
        assert.equal(r.x, 144);
        assert.equal(r.x + r.w, 464);
        assert.equal(r.y, 510);
        assert.equal(r.y + r.h, 592);
    });

    test('no two IDLE interactive HUD panels overlap under HIT_SLOP', () => {
        const rects = hudInteractiveRects('idle');
        for (let i = 0; i < rects.length; i++) {
            for (let j = i + 1; j < rects.length; j++) {
                const a = expandRect(rects[i].rect, HIT_SLOP);
                const b = expandRect(rects[j].rect, HIT_SLOP);
                assert.ok(!rectsOverlap(a, b),
                    `HUD panels ${rects[i].name} and ${rects[j].name} overlap (tap-ambiguous)`);
            }
        }
    });
});
```

- [ ] **Step 2: Run to verify it fails the RIGHT way**

Run: `node --test tests/hud-layout.test.js`
Expected: the `xmbBarPanelRect` test fails first (not exported). After Step 3 exports it, the **invariant test fails** with "HUD panels questlog and xmb overlap" — that failure is the bug, and it's what Task A3 fixes. Do NOT weaken the test to make it pass; A3 fixes the geometry.

- [ ] **Step 3: Implement in `game/layout.js`**

The XMB geometry already lives in `xmbBarLayout()` (`layout.js:66-84`). Add a pure worst-case panel-rect derived from the same constants, and the enumerator. Add after the `xmbBarLayout` function:

```js
// The XMB usable-bar's background PANEL rect for `n` visible category chips
// (1–3), mirroring renderer.js:1978-1980. n=3 is the worst case (widest). The
// bar is centered on canvas-center x=304; chip stride is XMB_CHIP_W(96)+6.
export function xmbBarPanelRect(n = 3) {
    const chipW = 96, gap = 6, stride = chipW + gap;   // 102
    const totalChips = n * stride - gap;               // n=3 → 300
    const left = 304 - totalChips / 2 - 10;            // n=3 → 144
    const right = 304 + totalChips / 2 + 10;           // n=3 → 464
    const top = 510, bottom = 592;                     // chipY-6 .. current-bottom+10
    return { x: left, y: top, w: right - left, h: bottom - top };
}

// The set of INTERACTIVE HUD panels visible+tappable in a given game-state
// name. Each entry { name, rect } is what a tap can hit. The invariant: no two
// of these may overlap (under HIT_SLOP), or a tap is ambiguous. 'idle' is the
// only always-live combination (message log + usable bar); the modal states
// (target_list, item_overlay, ...) are exclusive overlays tested separately if
// they gain persistent tappable siblings.
export function hudInteractiveRects(state) {
    const rects = [];
    if (state === 'idle') {
        rects.push({ name: 'questlog', rect: QUESTLOG_RECT });
        rects.push({ name: 'xmb', rect: xmbBarPanelRect(3) });
    }
    return rects;
}
```

- [ ] **Step 4: Confirm the invariant test now fails on the real collision**

Run: `node --test tests/hud-layout.test.js`
Expected: `xmbBarPanelRect` test PASSES; the invariant test FAILS with the questlog/xmb overlap message. This is correct — leave it red; A3 makes it green.

- [ ] **Step 5: Commit (red invariant is intentional — it documents the bug)**

```bash
git add game/layout.js tests/hud-layout.test.js
git commit -m "test(ui): HUD non-overlap invariant — currently red on questlog/xmb collision"
```
End the body with the `Co-Authored-By` trailer.

---

### Task A3: Shrink the message log to clear the usable-bar

**Files:**
- Modify: `game/layout.js:113` (`QUESTLOG_RECT`)
- Modify: `game/renderer.js` (`_drawQuestLog`, verify the feed still fits)

From recon: log is `{x:6,y:436,w:340,h:104}` (bottom 540); the XMB panel top is 510, and the log's HIT_SLOP-expanded bottom is 546. To clear the bar's HIT_SLOP-expanded top (510−6 = 504), the log's expanded bottom must be ≤ 504, i.e. log bottom ≤ 498, i.e. `h ≤ 62`. Use `h: 62` (bottom 498). The feed draws the last 3 lines from the panel bottom (`renderer.js:1634-1684`, `feedTop = R.y + R.h - PAD - visible.length*LH`); with `h:62` the feed still renders (it's anchored to `R.h`), just higher. Verify it doesn't collide with the objective line above it — if 3 lines don't fit in the shorter panel, reduce the feed to the last 2 lines.

- [ ] **Step 1: Shrink the rect**

In `game/layout.js:113`, change:

```js
export const QUESTLOG_RECT = { x: 6, y: 436, w: 340, h: 104 };
```

to:

```js
// h chosen so the panel's HIT_SLOP-expanded bottom (y + h + 6) clears the XMB
// usable-bar's HIT_SLOP-expanded top (510 - 6 = 504): 436 + 62 + 6 = 504.
// Enforced by tests/hud-layout.test.js's non-overlap invariant.
export const QUESTLOG_RECT = { x: 6, y: 436, w: 340, h: 62 };
```

- [ ] **Step 2: Run the invariant test — it must now pass**

Run: `node --test tests/hud-layout.test.js`
Expected: PASS (all — the invariant is green now that the rects clear).

- [ ] **Step 3: Verify the feed still reads (smoke, canvas)**

Read `_drawQuestLog` (`game/renderer.js:1634-1684`). Confirm the feed line count fits in `h:62`: header (~14px) + objective (~14px) + feed. If `LH*3` + header + objective exceeds 62, change the feed to show the **last 2** lines (find where it slices `visible = feed.slice(-3)` and make it `.slice(-2)`), and add a one-line comment citing the shorter panel. Then:

Run: `python dev-server.py 3001`, load the game, walk over an item so the usable-bar appears, and confirm the log panel and the DRINK/EAT bar no longer touch and both are tappable (tapping a chip switches category; tapping the log opens the [L] modal). Console clean.

- [ ] **Step 4: Full suite**

Run: `node --test tests/*.test.js`
Expected: still the 8 known failures, zero new. `hud-layout.test.js` fully green.

- [ ] **Step 5: Commit**

```bash
git add game/layout.js game/renderer.js
git commit -m "fix(ui): shrink message log to clear the usable-bar; invariant now green"
```
End the body with the `Co-Authored-By` trailer.

---

## PHASE B — 50-slot two-zone bag

10 SAFE (indices 0–9, kept on defeat) + 40 PACK (10–49, at-risk). Stacks stay 99. Extract the routing into a pure module, flip to PACK-first, make defeat-safety zonal, render two zones.

### Task B1: Grow the bag; fix the stale sanity test

**Files:**
- Modify: `game/data.js:73-77`
- Modify: `game/main.js:295-296` (comment only)
- Modify: `game/save.js:183-186` (comment only)
- Modify: `tests/inventory-stacking.test.js:127-129` (fix the stale assertion)

- [ ] **Step 1: Update the constants**

In `game/data.js`, replace lines 73-77:

```js
// 9 to match the 9-slot hotbar (layout.HOTBAR_SLOTS) so every slot is both
// rendered and tap/key reachable — a 10th slot was invisible and untappable,
// only reachable via Digit0. Keep these two in lockstep. (fix/critical-path)
export const INVENTORY_SIZE = 9;
export const MAX_STACK = 99;
```

with:

```js
// The bag is two zones: SAFE (indices 0..SAFE_SLOTS-1, kept on defeat) + PACK
// (SAFE_SLOTS..INVENTORY_SIZE-1, at-risk). Rendered as a grid in the REMOTICON
// ITEMS tab, no longer coupled to the 9-slot XMB usable-bar. (remoticon-overhaul)
export const INVENTORY_SIZE = 50;
export const SAFE_SLOTS = 10;
export const MAX_STACK = 99;
```

- [ ] **Step 2: Fix the stale sanity test (currently one of the 8 known failures)**

In `tests/inventory-stacking.test.js` (~line 127-129), the sanity test asserts `INVENTORY_SIZE === 10`. Update it to the new value and add `SAFE_SLOTS` to the import if useful:

```js
test('the limits under test are the real game constants', () => {
    assert.equal(INVENTORY_SIZE, 50);
    assert.equal(MAX_STACK, 99);
});
```
(Match the file's existing assertion style; keep whatever else that test checked. Extend the import at line 38 to include `SAFE_SLOTS` only if a later test needs it.)

- [ ] **Step 3: Update the two stale comments**

`game/main.js:295` — change the comment `// Inventory: 10 stackable slots, each { itemDef, count } or null` to `// Inventory: INVENTORY_SIZE slots (SAFE 0..9 + PACK 10..49), each { itemDef, count } or null`. The init line `new Array(INVENTORY_SIZE).fill(null)` is unchanged.

`game/save.js:183` — change the comment `// Normalize to INVENTORY_SIZE slots. An older save with extra slots is truncated...` to note the bag now GROWS (old 9-slot saves pad with nulls). The loop is unchanged.

- [ ] **Step 4: Run**

Run: `node --test tests/inventory-stacking.test.js` → PASS (the sanity test is now green).
Run: `node --test tests/*.test.js` → **7** known failures now (inventory-stacking:127 fixed), zero new.

- [ ] **Step 5: Commit**

```bash
git add game/data.js game/main.js game/save.js tests/inventory-stacking.test.js
git commit -m "feat(inventory): grow bag to 50 slots (10 SAFE + 40 PACK); fix stale size assertion"
```
End the body with the `Co-Authored-By` trailer.

---

### Task B2: Pure inventory module — PACK-first routing + moveToZone

**Files:**
- Create: `game/inventory.js` (pure, importable)
- Test: `tests/inventory-zones.test.js` (create)

- [ ] **Step 1: Write the failing tests**

Create `tests/inventory-zones.test.js`:

```js
// inventory-zones.test.js — the pure bag-routing module (real import, no mirror).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { addToInventory, moveToZone, zoneOf } from '../game/inventory.js';

const CFG = { size: 50, safeSlots: 10, maxStack: 99 };
const empty = () => new Array(CFG.size).fill(null);
const ROCK = { id: 'rock' };
const SOAP = { id: 'soap' };

describe('zoneOf', () => {
    test('slots below safeSlots are safe, the rest are pack', () => {
        assert.equal(zoneOf(0, 10), 'safe');
        assert.equal(zoneOf(9, 10), 'safe');
        assert.equal(zoneOf(10, 10), 'pack');
        assert.equal(zoneOf(49, 10), 'pack');
    });
});

describe('addToInventory — PACK-first routing', () => {
    test('first pickup lands in the first PACK slot, not SAFE', () => {
        const inv = empty();
        assert.equal(addToInventory(inv, ROCK, CFG), true);
        assert.equal(inv[10].itemDef, ROCK);   // slot 10 = first PACK slot
        assert.equal(inv[0], null);             // SAFE stays empty
    });
    test('merges into an existing stack in either zone before opening a new slot', () => {
        const inv = empty();
        inv[3] = { itemDef: ROCK, count: 5 };   // a protected ROCK stack in SAFE
        assert.equal(addToInventory(inv, ROCK, CFG), true);
        assert.equal(inv[3].count, 6);          // merged, no new slot used
        assert.equal(inv[10], null);
    });
    test('a full stack (99) opens a new PACK slot instead of overflowing', () => {
        const inv = empty();
        inv[10] = { itemDef: ROCK, count: 99 };
        assert.equal(addToInventory(inv, ROCK, CFG), true);
        assert.equal(inv[10].count, 99);
        assert.equal(inv[11].itemDef, ROCK);
    });
    test('overflows into SAFE only when PACK is full', () => {
        const inv = empty();
        for (let i = 10; i < 50; i++) inv[i] = { itemDef: SOAP, count: 99 };   // PACK full
        assert.equal(addToInventory(inv, ROCK, CFG), true);
        assert.equal(inv[0].itemDef, ROCK);     // landed in first free SAFE slot
    });
    test('returns false when the whole bag is full', () => {
        const inv = empty();
        for (let i = 0; i < 50; i++) inv[i] = { itemDef: SOAP, count: 99 };
        assert.equal(addToInventory(inv, ROCK, CFG), false);
    });
});

describe('moveToZone — protect / unprotect', () => {
    test('protect moves a PACK stack to the first free SAFE slot', () => {
        const inv = empty();
        inv[10] = { itemDef: ROCK, count: 3 };
        assert.equal(moveToZone(inv, 10, 'safe', CFG), true);
        assert.equal(inv[0].itemDef, ROCK);
        assert.equal(inv[10], null);
    });
    test('protect fails when SAFE is full', () => {
        const inv = empty();
        for (let i = 0; i < 10; i++) inv[i] = { itemDef: SOAP, count: 1 };   // SAFE full
        inv[10] = { itemDef: ROCK, count: 1 };
        assert.equal(moveToZone(inv, 10, 'safe', CFG), false);
        assert.equal(inv[10].itemDef, ROCK);   // unchanged
    });
    test('unprotect moves a SAFE stack to the first free PACK slot', () => {
        const inv = empty();
        inv[2] = { itemDef: ROCK, count: 1 };
        assert.equal(moveToZone(inv, 2, 'pack', CFG), true);
        assert.equal(inv[10].itemDef, ROCK);
        assert.equal(inv[2], null);
    });
    test('moving to the zone it is already in is a no-op success', () => {
        const inv = empty();
        inv[10] = { itemDef: ROCK, count: 1 };
        assert.equal(moveToZone(inv, 10, 'pack', CFG), true);
        assert.equal(inv[10].itemDef, ROCK);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/inventory-zones.test.js`
Expected: FAIL — `game/inventory.js` does not exist.

- [ ] **Step 3: Implement `game/inventory.js`**

```js
// inventory.js — the pure bag model (zones, routing, protect/unprotect).
//
// Extracted from main.js's _addToInventory so it's importable under node and
// testable without the DOM (the defeat-scenarios.js / layout.js convention).
// The bag is one flat array; zones are index ranges: SAFE = [0, safeSlots),
// PACK = [safeSlots, size). Config is passed in ({ size, safeSlots, maxStack })
// so nothing here imports data.js — the caller supplies the real constants.

export function zoneOf(i, safeSlots) {
    return i < safeSlots ? 'safe' : 'pack';
}

function zoneRange(zone, cfg) {
    return zone === 'safe' ? [0, cfg.safeSlots] : [cfg.safeSlots, cfg.size];
}

function firstFreeIn(inv, zone, cfg) {
    const [lo, hi] = zoneRange(zone, cfg);
    for (let i = lo; i < hi; i++) if (!inv[i]) return i;
    return -1;
}

// Add one unit of itemDef. Merge into an existing non-full stack (either zone)
// first, then a free PACK slot, then a free SAFE slot (overflow), else fail.
// Mutates inv; returns true on success. PACK-first keeps SAFE as deliberate,
// player-curated protection rather than a dumping ground.
export function addToInventory(inv, itemDef, cfg) {
    for (let i = 0; i < cfg.size; i++) {
        const s = inv[i];
        if (s && s.itemDef.id === itemDef.id && s.count < cfg.maxStack) { s.count++; return true; }
    }
    let i = firstFreeIn(inv, 'pack', cfg);
    if (i < 0) i = firstFreeIn(inv, 'safe', cfg);
    if (i < 0) return false;
    inv[i] = { itemDef, count: 1 };
    return true;
}

// Move the stack at fromSlot to the first free slot of targetZone. If it's
// already in that zone, no-op success. If the target zone is full, fail
// (leaving the stack put). Mutates inv; returns boolean.
export function moveToZone(inv, fromSlot, targetZone, cfg) {
    const stack = inv[fromSlot];
    if (!stack) return false;
    if (zoneOf(fromSlot, cfg.safeSlots) === targetZone) return true;
    const dest = firstFreeIn(inv, targetZone, cfg);
    if (dest < 0) return false;
    inv[dest] = stack;
    inv[fromSlot] = null;
    return true;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/inventory-zones.test.js`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add game/inventory.js tests/inventory-zones.test.js
git commit -m "feat(inventory): pure zone module — PACK-first routing + moveToZone"
```
End the body with the `Co-Authored-By` trailer.

---

### Task B3: Wire main.js to the pure router; zonal defeat-safety

**Files:**
- Modify: `game/main.js:9` (import), `:3576-3585` (`_addToInventory`)
- Modify: `game/defeat-scenarios.js:23-30` (`partitionInventory` gains `safeSlots`)
- Modify: `game/main.js:4340` (`_applyTake` passes `SAFE_SLOTS`)
- Test: `tests/defeat-scenarios.test.js` (extend)

- [ ] **Step 1: Write the failing zonal-safety test**

Append to `tests/defeat-scenarios.test.js` (inside or after the `partitionInventory` describe):

```js
describe('partitionInventory — zonal safety (remoticon-overhaul)', () => {
    test('an ordinary item in a SAFE slot (index < safeSlots) is safe', () => {
        const inv = new Array(50).fill(null);
        inv[2] = { itemDef: loot, count: 1 };    // ordinary loot in SAFE zone
        inv[15] = { itemDef: loot, count: 1 };   // same item in PACK zone
        const { safe, atRisk } = partitionInventory(inv, weapon, 10);
        assert.deepEqual(safe.map(e => e.i), [2]);
        assert.deepEqual(atRisk.map(e => e.i), [15]);
    });
    test('a quest item is safe even in a PACK slot (free, index-independent)', () => {
        const inv = new Array(50).fill(null);
        inv[20] = { itemDef: quest, count: 1 };
        const { safe, atRisk } = partitionInventory(inv, weapon, 10);
        assert.deepEqual(safe.map(e => e.i), [20]);
        assert.equal(atRisk.length, 0);
    });
    test('safeSlots defaults to 0 — old 2-arg calls keep their behavior', () => {
        const inv = [{ itemDef: loot, count: 1 }];
        const { atRisk } = partitionInventory(inv, weapon);   // no safeSlots
        assert.deepEqual(atRisk.map(e => e.i), [0]);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/defeat-scenarios.test.js`
Expected: FAIL — the zonal tests fail (slot 2 lands in atRisk; `partitionInventory` ignores index).

- [ ] **Step 3: Make `partitionInventory` zone-aware**

In `game/defeat-scenarios.js`, replace lines 23-30:

```js
export function partitionInventory(inventory, equippedWeapon) {
    const safe = [], atRisk = [];
    (inventory || []).forEach((slot, i) => {
        if (!slot || !slot.itemDef) return;
        (isSafe(slot.itemDef, equippedWeapon) ? safe : atRisk).push({ i, itemDef: slot.itemDef, count: slot.count });
    });
    return { safe, atRisk };
}
```

with (safe when in the SAFE zone OR intrinsically safe; `safeSlots` defaults to 0 so old calls are unchanged):

```js
export function partitionInventory(inventory, equippedWeapon, safeSlots = 0) {
    const safe = [], atRisk = [];
    (inventory || []).forEach((slot, i) => {
        if (!slot || !slot.itemDef) return;
        const kept = i < safeSlots || isSafe(slot.itemDef, equippedWeapon);
        (kept ? safe : atRisk).push({ i, itemDef: slot.itemDef, count: slot.count });
    });
    return { safe, atRisk };
}
```

- [ ] **Step 4: Wire the caller and the router in main.js**

At `game/main.js:9`, extend the `data.js` import to include `SAFE_SLOTS`:
find `import { PLAYER_MAX_HP, PLAYER_MAX_MP, INVENTORY_SIZE, MAX_STACK } from './data.js';`
→ `import { PLAYER_MAX_HP, PLAYER_MAX_MP, INVENTORY_SIZE, SAFE_SLOTS, MAX_STACK } from './data.js';`

Add an import of the pure router near the other `game/*.js` imports at the top of main.js:
`import { addToInventory as addToInv, moveToZone } from './inventory.js';`

Replace `_addToInventory` (`main.js:3576-3585`) body with a delegation:

```js
    _addToInventory(itemDef) {
        return addToInv(this.inventory, itemDef, { size: INVENTORY_SIZE, safeSlots: SAFE_SLOTS, maxStack: MAX_STACK });
    }
```

At `main.js:4340`, change the `_applyTake` call:
`const { atRisk } = partitionInventory(this.inventory, weapon);`
→ `const { atRisk } = partitionInventory(this.inventory, weapon, SAFE_SLOTS);`

- [ ] **Step 5: Run tests + smoke**

Run: `node --test tests/defeat-scenarios.test.js` → PASS.
Run: `node --test tests/*.test.js` → 7 known failures, zero new. (`inventory-stacking.test.js`'s mirror still passes — it mirrors the old two-loop logic, which is behaviorally identical for a 9-item scenario; if it now drifts because it hard-codes SAFE-first fill, update its SEAM-NOTE mirror to call the real `addToInventory` from `game/inventory.js` and delete the mirror, per the test-convention target end-state.)
Smoke: dev server, pick up items — they land in the PACK zone (slot 10+), never auto-fill SAFE.

- [ ] **Step 6: Commit**

```bash
git add game/main.js game/defeat-scenarios.js tests/defeat-scenarios.test.js
git commit -m "feat(inventory): route pickups through the pure module; zonal defeat-safety"
```
End the body with the `Co-Authored-By` trailer.

---

### Task B4: Render the bag as two zones

**Files:**
- Modify: `game/layout.js:218-227` (`deviceBagSlotRects` → 50 rects in two zones)
- Modify: `game/renderer.js:1816-1826` + `:1887-1958` (`_drawHotbar` calls the shared helper; zone labels; zonal safe badge)
- Modify: `tests/xmb-layout.test.js:24-30` (update the pinning test) and `tests/device-layout.test.js` (add a 2-zone geometry test)

From recon: body is `{x:38,y:120,w:532,h:432}`. A SAFE row of 10 + a 4×10 PACK grid fit at the current 45px stride. The tap handler (`main.js:4849`) already indexes `inventory[i]` by rect index, so `deviceBagSlotRects` MUST return 50 rects in slot order (0–9 SAFE, 10–49 PACK).

- [ ] **Step 1: Write the failing layout test**

Append to `tests/device-layout.test.js`:

```js
import { deviceBagSlotRects, deviceBodyRect, rectsOverlap } from '../game/layout.js';

test('deviceBagSlotRects returns 50 rects: SAFE row (0-9) above PACK grid (10-49), none overlapping', () => {
    const body = deviceBodyRect();
    const rects = deviceBagSlotRects(body);
    assert.equal(rects.length, 50);
    // SAFE row: 10 slots sharing a y, left-to-right
    for (let i = 1; i < 10; i++) assert.equal(rects[i].y, rects[0].y, `SAFE slot ${i} not on the SAFE row`);
    // PACK grid starts below the SAFE row
    assert.ok(rects[10].y > rects[0].y + rects[0].h, 'PACK grid must sit below the SAFE row');
    // all inside the body
    for (const r of rects) {
        assert.ok(r.x >= body.x - 0.5 && r.x + r.w <= body.x + body.w + 0.5, 'slot escapes body x');
        assert.ok(r.y >= body.y - 0.5 && r.y + r.h <= body.y + body.h + 0.5, 'slot escapes body y');
    }
    // pairwise non-overlap (2-D)
    for (let i = 0; i < rects.length; i++)
        for (let j = i + 1; j < rects.length; j++)
            assert.ok(!rectsOverlap(rects[i], rects[j]), `bag slots ${i} and ${j} overlap`);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/device-layout.test.js`
Expected: FAIL — `deviceBagSlotRects` returns 9 rects, not 50.

- [ ] **Step 3: Rewrite `deviceBagSlotRects` for two zones**

In `game/layout.js`, replace `deviceBagSlotRects` (lines 218-227). Use a 10-wide grid; SAFE is row 0, PACK is rows 1–4. Keep the current slot size (`HOTBAR_SLOT_W`/`HOTBAR_SLOT_H`) and a compact stride so 10 fit across the 532px body:

```js
// The ITEMS-tab bag as two zones, returned in SLOT-INDEX order (0..9 = SAFE
// row, 10..49 = PACK grid), so main._tapDevice's `inventory[i]` indexing and
// the renderer stay in lockstep. 10 columns; SAFE is the top row, PACK is the
// four rows below it with a gap band between. Non-overlap is pinned by
// tests/device-layout.test.js.
export function deviceBagSlotRects(bodyRect) {
    const COLS = 10, SLOT = 38, GAP = 6, STRIDE = SLOT + GAP;   // 44; 10*44-6 = 434 < 532
    const gridW = COLS * STRIDE - GAP;
    const ox = Math.round(bodyRect.x + (bodyRect.w - gridW) / 2);
    const safeY = bodyRect.y + 30;                 // below the "SAFE" label
    const packY = safeY + SLOT + 24;               // gap band + "PACK" label
    const rects = [];
    for (let i = 0; i < 50; i++) {
        const inSafe = i < 10;
        const col = inSafe ? i : (i - 10) % COLS;
        const row = inSafe ? 0 : Math.floor((i - 10) / COLS);
        const y = inSafe ? safeY : packY + row * STRIDE;
        rects.push({ x: ox + col * STRIDE, y, w: SLOT, h: SLOT });
    }
    return rects;
}
```

(Note: this changes the slot size from `HOTBAR_SLOT_W` to 38 to fit 10 across. If the `xmb-layout.test.js` pin at line 24-30 asserts `deviceBagSlotRects` matches `_drawHotbar`'s HOTBAR-based math, that pin no longer applies — see Step 5.)

- [ ] **Step 4: Make `_drawHotbar` call the shared helper (kill the duplicate math)**

In `game/renderer.js`, `_drawHotbar` (lines 1816+) currently recomputes `ox/oy/xStart/slotY` inline and loops `count = HOTBAR_SLOTS`. Replace the inline geometry + single-row loop with a call to `deviceBagSlotRects(bodyRect)` and iterate its rects (index = slot index). Add `deviceBagSlotRects` to renderer.js's `layout.js` import (line ~19-20). The per-slot body (icon, count backing at `sx+sw-16`, stack count, safe badge) stays — read each rect's `x/y/w/h` instead of the computed `sx/sy/sw/sh`. Draw a small `SAFE` label above the top row and `PACK` above the grid (use `this.font.drawText(..., UI.dim, scale 1)` at `rects[0].y - 12` and `rects[10].y - 12`).

For the **zonal safe badge** (recon: `renderer.js:1945`), change the per-item `isSafe(...)` call so the gold corner also shows for any item in the SAFE zone:

find:
```js
if (isSafe(stack.itemDef, game.equipment && game.equipment.weapon)) this._drawSafeBadge(ctx, sx + sw, sy);
```
replace with (where `i` is the loop's slot index and `SAFE_SLOTS` is imported into renderer.js from `data.js`):
```js
const kept = i < SAFE_SLOTS || isSafe(stack.itemDef, game.equipment && game.equipment.weapon);
if (kept) this._drawSafeBadge(ctx, rect.x + rect.w, rect.y);
```

Update the helper caption (recon: `renderer.js:1962`) from `'gold corner = kept if defeated'` to `'SAFE zone + quest items = kept if defeated'`.

- [ ] **Step 5: Update the pinning test**

`tests/xmb-layout.test.js:24-30` pins `deviceBagSlotRects` to the old HOTBAR single-row math. That coupling is intentionally broken (the bag is no longer the usable-bar). Replace that test with one asserting the two are now INDEPENDENT (the bag grid no longer derives from `HOTBAR_TOTAL_W`), or delete it and rely on the new 2-zone test in `device-layout.test.js`. Keep the `xmbBarLayout` chip tests in that file untouched (they test the actual usable-bar).

- [ ] **Step 6: Run + smoke**

Run: `node --test tests/*.test.js` → 7 known failures, zero new; `device-layout.test.js` green.
Smoke: open the REMOTICON ITEMS tab — 50 slots render as a SAFE row + PACK grid, counts and quest-item gold corners draw, taps hit the right slot. Console clean.

- [ ] **Step 7: Commit**

```bash
git add game/layout.js game/renderer.js tests/device-layout.test.js tests/xmb-layout.test.js
git commit -m "feat(inventory): render the bag as SAFE row + PACK grid; unify slot geometry"
```
End the body with the `Co-Authored-By` trailer.

---

## PHASE C — the unified tap-to-inspect inspector

Replace "tap = act immediately" with "tap = select; inspector panel shows stats + action buttons." One `_deviceSel` sub-selection inside `STATE.DEVICE` (no new top-level state). Serves ITEMS (Use/Protect/Drop) and GEAR (options list with deltas).

### Task C1: `_deviceSel` selection + inspector panel (ITEMS: stats + Use/Drop)

**Files:**
- Create: `game/inspector.js` (pure — builds the panel model + action list for a selection)
- Modify: `game/main.js` (`_deviceSel` state; `_tapDevice` ITEMS branch selects instead of acting; action-row dispatch)
- Modify: `game/renderer.js` (`_drawDevice` ITEMS → draw the inspector when `_deviceSel` set)
- Modify: `game/layout.js` (inspector panel rect + action-row rects within the device body)
- Test: `tests/inspector.test.js` (create)

- [ ] **Step 1: Write the failing tests for the pure panel model**

Create `tests/inspector.test.js`:

```js
// inspector.test.js — the pure inspector model (what stats + actions a selection shows).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { itemActions, itemStatLine } from '../game/inspector.js';

const POTION = { id: 'bandage', name: '[Bandage]', useType: 'self', healAmount: 10 };
const GEAR   = { id: 'foil_hat', name: '[Foil Hat]', useType: 'equip', equipSlot: 'top', armor: 2 };
const QUEST  = { id: 'converter', name: '[Converter]', questItem: true };

describe('itemActions — context actions by item kind and zone', () => {
    test('a consumable in PACK offers Use, Protect, Drop', () => {
        assert.deepEqual(itemActions(POTION, 'pack').map(a => a.id), ['use', 'protect', 'drop']);
    });
    test('gear in SAFE offers Equip, Unprotect, Drop', () => {
        assert.deepEqual(itemActions(GEAR, 'safe').map(a => a.id), ['equip', 'unprotect', 'drop']);
    });
    test('a quest item offers no Protect and no Drop (always kept)', () => {
        assert.deepEqual(itemActions(QUEST, 'pack').map(a => a.id), []);
    });
});

describe('itemStatLine', () => {
    test('heal item', () => assert.equal(itemStatLine(POTION), 'Heals 10 HP'));
    test('armor gear', () => assert.equal(itemStatLine(GEAR), '+2 armor'));
    test('quest item', () => assert.equal(itemStatLine(QUEST), 'Always kept'));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/inspector.test.js`
Expected: FAIL — `game/inspector.js` missing.

- [ ] **Step 3: Implement `game/inspector.js`**

```js
// inspector.js — pure model for the REMOTICON inspector panel: what stat line
// and what action buttons a selected bag item shows. No DOM, no game object —
// takes an itemDef + its zone ('safe'|'pack') and returns plain data the
// renderer draws and main.js dispatches.

// The label used for the primary action button ('Use' vs 'Equip').
function primaryAction(itemDef) {
    if (itemDef.useType === 'equip' && itemDef.equipSlot) return { id: 'equip', label: 'Equip' };
    return { id: 'use', label: 'Use' };
}

// Actions for a bag item. Quest items are always kept, so they get no Protect
// (moot) and no Drop (you can't ditch a quest item). Everything else gets the
// primary action, a zone toggle (Protect in PACK / Unprotect in SAFE), and Drop.
export function itemActions(itemDef, zone) {
    if (!itemDef || itemDef.questItem) return [];
    const toggle = zone === 'safe'
        ? { id: 'unprotect', label: 'Unprotect' }
        : { id: 'protect', label: 'Protect' };
    return [primaryAction(itemDef), toggle, { id: 'drop', label: 'Drop' }];
}

// One-line stat summary for the panel header.
export function itemStatLine(itemDef) {
    if (!itemDef) return '';
    if (itemDef.questItem) return 'Always kept';
    if (itemDef.healAmount) return `Heals ${itemDef.healAmount} HP`;
    if (itemDef.armor) return `+${itemDef.armor} armor`;
    if (itemDef.damage) return `${itemDef.useType === 'throw' ? 'Throw' : 'Melee'} ${itemDef.damage} dmg`;
    return itemDef.description || '';
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/inspector.test.js` → PASS.

- [ ] **Step 5: Wire the selection + panel into the device (canvas — no unit test)**

- `main.js`: add `this._deviceSel = null;` beside `this._deviceTab` (main.js:316). On opening the device or switching tabs, reset it to `null`.
- `main.js` `_tapDevice` ITEMS branch (`main.js:4849-4869`): instead of acting on tap, set `this._deviceSel = { tab: 'items', index: i }` and `_render()`. Then, BEFORE the slot loop, if `this._deviceSel?.tab === 'items'`, hit-test the inspector action-row rects (new `inspectorActionRects(deviceBodyRect())` from layout.js) and dispatch: `use`/`equip` → existing `resolveUse` + `_removeFromSlot` + `_refreshGrantedSkills`; `protect`/`unprotect` → `moveToZone(this.inventory, index, targetZone, {size:INVENTORY_SIZE, safeSlots:SAFE_SLOTS, maxStack:MAX_STACK})` with a `[Safe slots full.]` / `[Pack is full.]` log on false; `drop` → `this.inventory[index] = null`. Clear `_deviceSel` after an action.
- `layout.js`: add `inspectorPanelRect(bodyRect)` (a right-side or bottom band inside the body that does NOT overlap the bag grid — the bag grid uses the top; the panel takes the bottom ~120px) and `inspectorActionRects(bodyRect)` (a row of up-to-3 buttons in that panel). Add a `device-layout.test.js` assertion that the inspector panel does not overlap the bag grid (reuse `rectsOverlap`).
- `renderer.js` `_drawDevice` ITEMS branch: after drawing the bag, if `game._deviceSel?.tab === 'items'` and the slot is filled, draw the inspector panel — item name, `itemStatLine(def)`, stack count, zone, and a button per `itemActions(def, zoneOf(index, SAFE_SLOTS))`. Import `itemActions`/`itemStatLine` from `inspector.js` and `zoneOf` from `inventory.js`.

- [ ] **Step 6: Smoke test + full suite**

Smoke: open ITEMS, tap an item → panel shows its stats + [Use/Protect/Drop]; tap Protect → it jumps to the SAFE row and gains a gold corner; tap Drop → gone; tap a quest item → panel shows "Always kept", no Drop. Console clean.
Run: `node --test tests/*.test.js` → 7 known failures, zero new.

- [ ] **Step 7: Commit**

```bash
git add game/inspector.js game/main.js game/renderer.js game/layout.js tests/inspector.test.js tests/device-layout.test.js
git commit -m "feat(ui): tap-to-inspect inspector — item stats + Use/Protect/Drop"
```
End the body with the `Co-Authored-By` trailer.

---

### Task C2: GEAR options list with stat deltas

**Files:**
- Modify: `game/inspector.js` (add `equipOptions`)
- Modify: `game/main.js` (`_tapDevice` GEAR branch: tap slot → open options; tap row → equip)
- Modify: `game/renderer.js` (`_drawEquipmentModal`: draw the options list when a slot is selected)
- Modify: `game/layout.js` (options-row rects within the body)
- Test: `tests/inspector.test.js` (extend)

- [ ] **Step 1: Write the failing test**

Append to `tests/inspector.test.js`:

```js
import { equipOptions } from '../game/inspector.js';

describe('equipOptions — the GEAR chooser model', () => {
    const worn = { id: 'foil_hat', name: '[Foil Hat]', equipSlot: 'top', armor: 2 };
    const crown = { id: 'tin_crown', name: '[Tin Crown]', equipSlot: 'top', armor: 4, useType: 'equip' };
    const bag = [
        { itemDef: crown, count: 1 },
        { itemDef: { id: 'gloves', equipSlot: 'sides', armor: 1, useType: 'equip' }, count: 1 },
    ];
    test('lists bag items for the slot with armor delta vs worn, plus a Bare row', () => {
        const opts = equipOptions('top', worn, bag);
        // the matching crown (+4 vs worn +2 → delta +2) and a Bare unequip row
        assert.deepEqual(opts.map(o => o.id), ['tin_crown', '__bare__']);
        assert.equal(opts[0].delta, 2);
        assert.equal(opts[0].bagIndex, 0);
        assert.equal(opts[1].id, '__bare__');
    });
    test('no worn item → deltas are the candidate armor itself', () => {
        const opts = equipOptions('top', null, bag);
        assert.equal(opts[0].delta, 4);
    });
});
```

- [ ] **Step 2: Run to verify it fails** — `node --test tests/inspector.test.js` → FAIL (`equipOptions` missing).

- [ ] **Step 3: Implement `equipOptions` in `game/inspector.js`**

```js
// equipOptions — the GEAR chooser: every bag item that fits `slotKey`, each
// with its armor delta vs the currently-worn piece, plus a "Bare" unequip row.
// Pure: takes the slot key, the worn itemDef (or null), and the bag array.
export function equipOptions(slotKey, worn, bag) {
    const wornArmor = (worn && worn.armor) || 0;
    const opts = [];
    (bag || []).forEach((stack, bagIndex) => {
        const d = stack && stack.itemDef;
        if (!d || d.useType !== 'equip' || d.equipSlot !== slotKey) return;
        opts.push({
            id: d.id, name: d.name, bagIndex,
            delta: ((d.armor || 0) - wornArmor),
            sludgeImmune: !!d.sludgeImmune,
        });
    });
    if (worn) opts.push({ id: '__bare__', name: 'Bare', bagIndex: -1, delta: -wornArmor });
    return opts;
}
```

- [ ] **Step 4: Run to verify it passes** — `node --test tests/inspector.test.js` → PASS.

- [ ] **Step 5: Wire the GEAR chooser (canvas)**

- `main.js` `_tapDevice` GEAR branch (`main.js:4891-4915`): replace the "empty plate → wear first spare" logic. Tapping a slot plate now sets `this._deviceSel = { tab: 'gear', slotKey: s.key }` and renders. If `_deviceSel.tab === 'gear'` on entry, first hit-test the options-row rects: tapping a row with `bagIndex >= 0` equips it via `resolveUse(this, this.inventory[bagIndex].itemDef, null)` + `_removeFromSlot(bagIndex)` + `_refreshGrantedSkills()`; tapping the `__bare__` row calls `unequipItem(this, slotKey)`; then clear `_deviceSel`. Keep the `weapon` slot behavior a deliberate choice: for this task, KEEP the existing `if (s.key === 'weapon') continue;` skip (weapon swap stays on the ITEMS tap) — note it as a scope boundary.
- `renderer.js` `_drawEquipmentModal` (`renderer.js:3190-3290`): after the slot-plate loop, if `game._deviceSel?.tab === 'gear'`, draw the options list from `equipOptions(slotKey, game.equipment[slotKey], game.inventory)` — each row: item name + delta shown as `+N`/`−N` (green for positive, dim for zero/negative), the currently-worn one marked. Import `equipOptions`.
- `layout.js`: add `gearOptionRects(bodyRect, n)` (n rows within the body, not overlapping the paper-doll's slots — place them down the right side or across the bottom). Add a `device-layout.test.js` non-overlap assertion vs the equip slots.

- [ ] **Step 6: Smoke + full suite**

Smoke: GEAR tab, tap HEAD → a list of head-gear with `+N` deltas + Bare; tap Tin Crown → equipped, Foil Hat re-bags; the plate updates. Console clean.
Run: `node --test tests/*.test.js` → 7 known failures, zero new.

- [ ] **Step 7: Commit**

```bash
git add game/inspector.js game/main.js game/renderer.js game/layout.js tests/inspector.test.js tests/device-layout.test.js
git commit -m "feat(ui): GEAR equipment chooser — options list with armor deltas"
```
End the body with the `Co-Authored-By` trailer.

---

### Task C3: Close-out

- [ ] **Step 1: Full verification**

Run: `node --test tests/*.test.js` → the 7 known pre-existing failures only (inventory-stacking:127 was fixed in B1), zero new.
Run: `git grep -iE 'violence[ _-]+town'` → only the two known self-referential doc hits (CLAUDE.md, plans/item-hotbar-xmb-implementation.md).
Smoke: full pass through the REMOTICON — the message log and usable-bar don't touch; the bag is 50 slots in two zones; protect/unprotect/drop work; the GEAR chooser shows deltas and equips. Console clean at every step.

- [ ] **Step 2: Update the design-doc status**

In `plans/remoticon-overhaul-design.md`, change the Status line to `**Status:** Implemented via plans/remoticon-overhaul-implementation.md (branch feature/remoticon-overhaul)`.

- [ ] **Step 3: Commit**

```bash
git add plans/remoticon-overhaul-design.md
git commit -m "docs(ui): mark the REMOTICON overhaul spec implemented"
```
End the body with the `Co-Authored-By` trailer.

Merge to `dev` is Caelan's call, per CLAUDE.md.

---

## Self-review notes (coverage vs the spec)

- **Part 0 (HUD overlap):** Tasks A1–A3. The invariant test (A2) is the "true bug testing" the spec asked for; A3 is the disjoint-bands fix. ✓
- **Part 1 (inventory zones):** Tasks B1–B4. 50 slots, SAFE/PACK, 99 stacks unchanged, PACK-first routing, zonal safety with quest items free, two-zone render. ✓
- **Part 2 (inspector):** Tasks C1–C2. Unified tap-to-inspect across ITEMS (Use/Protect/Drop) and GEAR (options + deltas); one `_deviceSel` sub-selection, no new top-level state. ✓
- **Naming correction from recon:** the device tap method is `_tapDevice` (not `_onDeviceClick` as the design-doc prose said); tasks use the real name.
- **Bonus fix:** B1 corrects the stale `inventory-stacking:127` assertion (known-failing → green), dropping the baseline failure count 8→7.
- **Deferred (noted, not built):** weapon-slot chooser on the GEAR tab (weapon swap stays on ITEMS tap); drop-one-vs-whole-stack picker (Drop removes the whole stack); the dead un-hosted `_drawHotbar` selection-highlight path flagged by recon (unrelated).
