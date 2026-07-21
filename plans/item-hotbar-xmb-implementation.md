# The XMB usable-bar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat auto-fill hotbar with an always-live XMB usable-bar (THROW/DRINK/EAT categories × a scrollable item column), route items to their proper home on pickup (gear auto-equips, usables to the bar, quest items to the bag), and fix the two equip/navigation bugs in the Remoticon.

**Architecture:** The bottom bar becomes a **projection over `game.inventory`** — a new pure module `game/xmb.js` filters the bag for usable items and groups them into categories; no new container, no save migration. Gear, bag, and usables are three *views* over the one inventory array plus the `equipment` object. The existing resolvers (`resolveThrow`, `resolveUse`, `resolveEquip`) are reused verbatim — the XMB is a new invocation surface. Work is phased: **Phase A** (equip + nav bug fixes, independently shippable), **Phase B** (the XMB bar), **Phase C** (retire the now-redundant item-use from the combat wheel — gated on Phase B proving out in playtest).

**Tech Stack:** Vanilla ES-module HTML5 canvas game. No build step. Tests are `node --test` files in `tests/` importing `../game/*.js`; **there is no local Node — tests run in CI**, so "run the test" steps note the expected CI result and every task is also verified in-browser via `python dev-server.py 3001` + `window.__game`.

**Design doc:** `plans/item-hotbar-xmb.md`.

---

## Ground truth (verified against the code — do not re-derive)

- **The hotbar IS `game.inventory`** — one flat array of `INVENTORY_SIZE = 9` slots, each `{ itemDef, count } | null` (`game/main.js:294`). The bottom-HUD hotbar and the Remoticon ITEMS tab are two renderings of it via the single `_drawHotbar(game, bodyRect)` (`game/renderer.js:1774`; bottom-HUD when `bodyRect` omitted at `renderer.js:402`, hosted panel when passed at `renderer.js:1689`).
- **Add/remove:** `_addToInventory(itemDef)` (`main.js:3426`, stack-merge then first empty), `_removeFromSlot(slot)` (`main.js:3437`, decrement + null at 0).
- **Pickup:** `_takeItemAt(x, y)` (`main.js:2841`) → `_addToInventory(def)`; logs `` `[Took ${def.name}.]` `` with the `'pickup'` tag. Everything currently funnels to inventory; nothing branches by class.
- **Equipment:** `this.equipment = { weapon, top, bottom, front, back, sides }` (`main.js:219`). `_playerArmor()` (`main.js:3808`) sums `armor` over the five armor zones + `ringMods.armor`. Equip path: `resolveUse(game, def, null)` with `useType:'equip'` → `resolveEquip` (`items.js:366`) which writes `equipment[def.equipSlot]=def` and re-bags any displaced piece.
- **Resolvers (all in `game/items.js`):** `resolveUse(game, itemDef, direction, stackCount=1)` (`items.js:418`) switches on `useType` (`self`/`throw`/`melee`/`equip`/`learn`, default→hint). `resolveThrow(game, itemDef, direction, _stackCount=1, targetTile=null)` (`items.js:503`) — with a `targetTile` it bursts 3×3 at that tile via `game.combatAttack`. The main.js bridges are `_doThrowAt(tile)` (`main.js:2952`, consumes + advances) and `_doItemUse(item)` (`main.js:2443`, consumes + advances). Both key off `this.selectedSlot`.
- **Wheel item leaves (`game/wheel-model.js`):** `ranged` (`:38`), `throw` (`:57`) → `resolveThrow`, reticle; `treat`→`eat`/`cleanse` (`:85-88`) → `resolveUse`, none. All `needsItem:true`, hard-wired to inventory **slot 0** (`w.itemIndex=0` → `compose().itemSlot`, `wheel-model.js:262`). Dispatch is `_fireWheel` (`main.js:3012`; `resolveThrow`→`_throwAt`, `resolveUse`→`_doItemUse`, at `main.js:3117-3118`).
- **Remoticon:** `DEVICE_TABS = ['items','gear','quests','map','rings']` (`layout.js:167`). Draw: `_drawDevice` (`renderer.js:1664`) delegates ITEMS→`_drawHotbar`, GEAR→`_drawEquipmentModal` (`renderer.js:3106`), RINGS→`_drawDeviceRings`. Tap: `_tapDevice` (`main.js:4641`) — tab strip + `rings` + `gear` branches; **no `items` branch**; the `gear` branch bails on an empty plate at `main.js:4679` (`if (!this.equipment[s.key]) return;`). Keydown: device block (`main.js:944`) handles `Tab`/`[`/`]`/`C`/`J`/`M`/`R` + quests-only Up/Down — **no Left/Right, no A/D**. `_deviceCycleTab(dir)` (`main.js:4632`) wraps `cycleDeviceTab` (`layout.js:186`).
- **`tests/device-layout.test.js` is STALE** — it asserts `DEVICE_TABS === ['items','gear','quests','map']` (4 tabs, `line 13`) and 4-tab cycle wraps (`lines 16-32`, `34-45`). The rings work made it 5 tabs, so this file is **currently failing in CI**. Phase A fixes it.
- **Items (`game/items.js`, 21 entries):** `throw` = `rock`, `sludge_sack`. `self` = `soap`, `bandage`, `boardwalk_burger`, `mystery_meat`, `tunnel_mushroom`, `hot_dog`. `equip` = `foil_hat`, `cardboard_cuirass`, `latex_gloves`, `red_cape`, `shoe_bags`. `none` = quest/inert. **No field distinguishes drink vs food today** — only `category:'ambro'` marks food.
- **Geometry (`game/layout.js`):** `CANVAS_INTERNAL_PX = 608` (`:17`), `HOTBAR_SLOT_H = 42` (`:45`), `HOTBAR_TOTAL_W = 418` (`:50`), `HOTBAR_OX = 95` (`:51`), `HOTBAR_OY = 546` (`:52`). `deviceBodyRect()` (`layout.js:180`), `deviceEquipLayout(bodyRect)` (`layout.js:198`).
- **Test harness:** `import { test } from 'node:test'; import assert from 'node:assert/strict';` + `from '../game/x.js'`. Pure/headless (no canvas stub). `npm test` → `node --test` (`package.json:29`).

---

## File Structure

**Create:**
- `game/xmb.js` — pure XMB model: category bucketing, bar-building, selection/cursor logic. Zero DOM.
- `tests/xmb.test.js` — `node --test` for `xmb.js`.
- `tests/xmb-layout.test.js` — `node --test` for the new geometry helpers in `layout.js`.

**Modify:**
- `game/layout.js` — add `XMB_*` constants, `xmbBarLayout(bar)`, and `deviceBagSlotRects(bodyRect)`.
- `game/renderer.js` — add `_drawXmbBar(game)`; change the bottom-HUD call at `:402` from `_drawHotbar(game)` to `_drawXmbBar(game)`.
- `game/main.js` — ctor XMB state; keyboard nav + fire; touch `_tapXmbBar`; `_useXmbCurrent`/`_xmbNav`/`_xmbAimTile`; pickup routing in `_takeItemAt`; `_tapDevice` `items` branch + `gear` empty-plate fix; device keydown Left/Right + A/D.
- `game/wheel-model.js` (Phase C) — remove the `ranged` / `throw` / `treat` item leaves.
- `tests/device-layout.test.js` (Phase A) — fix the stale 4-tab assertions to 5 tabs.
- `tests/wheel-model.test.js` (Phase C) — drop assertions referencing removed leaves.

---

# PHASE A — Equip & navigation fixes (ship-first, independent)

Each Phase-A task leaves the game runnable and fixes a bug the user hit in playtest. Phase A can merge on its own.

## Task A1: Fix the stale device-layout test (5 tabs, not 4)

**Files:**
- Test: `tests/device-layout.test.js:13`, `:16-32`, `:34-45`

- [ ] **Step 1: Update the tab-list assertion**

In `tests/device-layout.test.js`, replace the body of the `'DEVICE_TABS is the four tabs in order'` test (line 12-14):

```js
test('DEVICE_TABS is the five tabs in order', () => {
  assert.deepEqual(DEVICE_TABS, ['items', 'gear', 'quests', 'map', 'rings']);
});
```

- [ ] **Step 2: Update the forward-wrap cycle test**

Replace the `'cycleDeviceTab wraps forward'` test (lines 16-21):

```js
test('cycleDeviceTab wraps forward', () => {
  assert.equal(cycleDeviceTab('items', 1), 'gear');
  assert.equal(cycleDeviceTab('gear', 1), 'quests');
  assert.equal(cycleDeviceTab('quests', 1), 'map');
  assert.equal(cycleDeviceTab('map', 1), 'rings');
  assert.equal(cycleDeviceTab('rings', 1), 'items');   // wrap
});
```

- [ ] **Step 3: Update the backward-wrap cycle test**

Replace the `'cycleDeviceTab wraps backward'` test (lines 23-27):

```js
test('cycleDeviceTab wraps backward', () => {
  assert.equal(cycleDeviceTab('items', -1), 'rings');  // wrap
  assert.equal(cycleDeviceTab('rings', -1), 'map');
  assert.equal(cycleDeviceTab('gear', -1), 'items');
});
```

- [ ] **Step 4: Update the tab-rect geometry test to iterate 5 tabs**

In the `'deviceTabRect returns 4 tabs...'` test (lines 34-45), change the title to `5 tabs` and both `[0, 1, 2, 3]` / `< 4` bounds to cover 5:

```js
test('deviceTabRect returns 5 tabs sharing y/h, left-to-right, non-overlapping, inside the frame', () => {
  const r = [0, 1, 2, 3, 4].map(deviceTabRect);
  for (const t of r) {
    assert.equal(t.y, r[0].y);
    assert.equal(t.h, r[0].h);
    assert.ok(t.x >= DEVICE_RECT.x, `tab x ${t.x} < frame left`);
    assert.ok(t.x + t.w <= DEVICE_RECT.x + DEVICE_RECT.w, `tab right ${t.x + t.w} > frame right`);
  }
  for (let i = 1; i < 5; i++) {
    assert.ok(r[i].x >= r[i - 1].x + r[i - 1].w, `tab ${i} overlaps tab ${i - 1}`);
  }
});
```

- [ ] **Step 5: Commit**

```bash
git add tests/device-layout.test.js
git commit -m "test(device): update device-layout for the 5th (RINGS) tab"
```

Expected in CI: `node --test` passes `device-layout.test.js` (was failing on the stale 4-tab assertions).

---

## Task A2: Remoticon tab navigation with arrows / A · D

**Files:**
- Modify: `game/main.js:944-955` (the `STATE.DEVICE` keydown block)

- [ ] **Step 1: Add Left/Right + A/D tab cycling**

In `game/main.js`, inside the `if (this.state === STATE.DEVICE) { ... }` block, insert these two lines immediately **after** the `KeyR` handler (`main.js:952`) and **before** the quests-scroll lines (`main.js:953`):

```js
        if (e.code === 'ArrowLeft'  || e.code === 'KeyA') { this._deviceCycleTab(-1); return; }
        if (e.code === 'ArrowRight' || e.code === 'KeyD') { this._deviceCycleTab(1);  return; }
```

Rationale: the Remoticon soft-pauses the world, so plain arrows are free here (no movement collision). `ArrowUp`/`ArrowDown` remain the quests-scroll keys on the following lines — no conflict with Left/Right.

- [ ] **Step 2: Verify in-browser**

Restart the dev server (fresh ES modules — mandatory after any `.js` edit):

```bash
python dev-server.py 3001
```

Open `http://localhost:3001`, then in the console:

```js
__game._openDevice('items');
// press ArrowRight / ArrowLeft and D / A — watch __game._deviceTab cycle
```

Confirm `__game._deviceTab` walks `items → gear → quests → map → rings → items` on Right/D and reverses on Left/A. Expected: 0 console errors.

- [ ] **Step 3: Commit**

```bash
git add game/main.js
git commit -m "feat(remoticon): tab nav with arrows and A/D"
```

---

## Task A3: Equip from the Remoticon (Bag-tap + empty GEAR plate)

Two equip paths were dead: tapping a gear item in the ITEMS/Bag tab did nothing (no `items` branch in `_tapDevice`), and tapping an empty GEAR plate early-returned. This task wires both, sharing a new bag-slot layout helper so the tap can't drift from the drawn grid.

**Files:**
- Modify: `game/layout.js` (add `deviceBagSlotRects`)
- Modify: `game/main.js:4641-4686` (`_tapDevice` — add `items` branch, fix `gear` branch)
- Test: `tests/xmb-layout.test.js` (created here; extended in Task B2)

- [ ] **Step 1: Write the failing test for `deviceBagSlotRects`**

Create `tests/xmb-layout.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deviceBagSlotRects, deviceBodyRect,
  HOTBAR_SLOTS, HOTBAR_SLOT_W, HOTBAR_SLOT_H, HOTBAR_STRIDE, HOTBAR_TOTAL_W,
} from '../game/layout.js';

test('deviceBagSlotRects returns one rect per hotbar slot, left-to-right, inside the body', () => {
  const body = deviceBodyRect();
  const rects = deviceBagSlotRects(body);
  assert.equal(rects.length, HOTBAR_SLOTS);
  for (const r of rects) {
    assert.equal(r.w, HOTBAR_SLOT_W);
    assert.equal(r.h, HOTBAR_SLOT_H);
    assert.ok(r.x >= body.x - 1, `slot x ${r.x} left of body`);
    assert.ok(r.x + r.w <= body.x + body.w + 1, `slot right of body`);
  }
  for (let i = 1; i < rects.length; i++) {
    assert.equal(rects[i].x - rects[i - 1].x, HOTBAR_STRIDE);
  }
});

test('deviceBagSlotRects matches _drawHotbar hosted math (ox + 8, oy + 46)', () => {
  const body = deviceBodyRect();
  const ox = Math.round(body.x + (body.w - HOTBAR_TOTAL_W) / 2);
  const rects = deviceBagSlotRects(body);
  assert.equal(rects[0].x, ox + 8);
  assert.equal(rects[0].y, body.y + 44 + 2);
});
```

- [ ] **Step 2: Run to verify it fails**

Run (in CI / on a Node box): `node --test tests/xmb-layout.test.js`
Expected: FAIL — `deviceBagSlotRects` is not exported yet.

- [ ] **Step 3: Implement `deviceBagSlotRects` in `layout.js`**

The hosted `_drawHotbar` computes `ox = round(body.x + (body.w - HOTBAR_TOTAL_W)/2)`, `oy = body.y + 44`, first slot at `(ox + 8, oy + 2)`, slot `i` at `x = xStart + i*HOTBAR_STRIDE`, `y = slotY` (`renderer.js:1781-1784`, `:1845-1847`). Add a helper that reproduces exactly this so hit-tests share the source of truth. Insert after `deviceBodyRect()` (after `layout.js:183`):

```js
// Bag (ITEMS-tab) slot rects — the SAME geometry _drawHotbar draws in its
// hosted branch (ox + 8, oy = body.y + 44, slotY = oy + 2, stride HOTBAR_STRIDE).
// Shared so _tapDevice's ITEMS hit-test can never drift from the drawn grid.
export function deviceBagSlotRects(bodyRect) {
    const ox = Math.round(bodyRect.x + (bodyRect.w - HOTBAR_TOTAL_W) / 2);
    const xStart = ox + 8;
    const slotY = bodyRect.y + 44 + 2;
    const rects = [];
    for (let i = 0; i < HOTBAR_SLOTS; i++) {
        rects.push({ x: xStart + i * HOTBAR_STRIDE, y: slotY, w: HOTBAR_SLOT_W, h: HOTBAR_SLOT_H });
    }
    return rects;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/xmb-layout.test.js`
Expected: PASS (both tests).

- [ ] **Step 5: Add the `items` (Bag) branch to `_tapDevice`**

In `game/main.js`, inside `_tapDevice(pt)`, insert a new branch immediately **after** the tab-strip `for` loop closes (`main.js:4650`) and **before** the `rings` branch (`main.js:4655`):

```js
        // ITEMS (Bag) body → tap a gear item to wear it (swap-aware). Usables are
        // used from the XMB bar, not here; quest items are held. Reads the SAME
        // slot rects deviceBagSlotRects hands the renderer, so the tap can't drift.
        if (this._deviceTab === 'items') {
            const rects = deviceBagSlotRects(deviceBodyRect());
            for (let i = 0; i < rects.length; i++) {
                if (!this._pointInRect(pt, rects[i], HIT_SLOP)) continue;
                const stack = this.inventory[i];
                if (!stack) return;                       // empty slot — nothing to do
                const def = stack.itemDef;
                if (def.useType === 'equip' && def.equipSlot) {
                    const msg = resolveUse(this, def, null);   // useType:'equip' → resolveEquip (re-bags any displaced piece)
                    this._removeFromSlot(i);                   // the worn copy leaves the bag
                    this._refreshGrantedSkills();
                    if (msg) this._log(msg);
                    audio.playSfx('menu-confirm');
                } else {
                    this._log(def.questItem ? '[Best hold onto that.]' : `[${def.name} — used from the bar.]`);
                }
                this._render();
                return;
            }
            return;
        }
```

- [ ] **Step 6: Fix the `gear` empty-plate branch to equip a spare**

In `_tapDevice`'s `gear` branch, replace the empty-slot early-return line (`main.js:4679`, `if (!this.equipment[s.key]) return;`) and the unequip that follows so an empty plate pulls the first matching spare from the bag. Replace lines `4679-4682`:

```js
                if (this.equipment[s.key]) {
                    const msg = unequipItem(this, s.key);   // filled plate → back to the bag
                    if (msg) this._log(msg);
                } else {
                    // empty plate → wear the first spare gear in the bag for this slot
                    const spareIdx = this.inventory.findIndex(
                        st => st && st.itemDef.useType === 'equip' && st.itemDef.equipSlot === s.key);
                    if (spareIdx < 0) { this._log(`[No spare ${s.key} gear in your bag.]`); return; }
                    const def = this.inventory[spareIdx].itemDef;
                    const msg = resolveUse(this, def, null);
                    this._removeFromSlot(spareIdx);
                    this._refreshGrantedSkills();
                    if (msg) this._log(msg);
                }
```

(The `weapon`-plate skip at `main.js:4677` and the `audio.playSfx('menu-tick'); this._render(); return;` tail below stay as they are.)

- [ ] **Step 7: Ensure the layout imports are present**

Confirm `game/main.js`'s `layout.js` import (near `main.js:1`) includes `deviceBagSlotRects` and `deviceBodyRect`. `deviceBodyRect` is already imported (used by the rings/gear branches); add `deviceBagSlotRects` to that same import list. `resolveUse` and `unequipItem` are already imported from `./items.js` (`main.js:10`).

- [ ] **Step 8: Verify in-browser**

Restart `python dev-server.py 3001`. In the console, give yourself a spare piece of gear and exercise both paths:

```js
__game._addToInventory(__game.constructor ? ITEMS.red_cape : null); // if ITEMS isn't global, use the next line instead
// Fallback: __game.inventory.find(s=>!s)  and set it to { itemDef: (a red_cape def), count:1 } — or just pick up the cape in-world.
__game._openDevice('items');   // tap the red_cape slot → expect "[Equipped ...]" and it moves to equipment.back
__game._openDevice('gear');    // tap a filled plate → unequips back to bag; tap an empty plate with a spare → wears it
```

Confirm `__game.equipment.back` becomes the cape after the ITEMS-tab tap, and the GEAR empty-plate tap wears a spare. Expected: 0 console errors. (Taps are simulated by dispatching a canvas `pointerdown`/click at the slot rect, or verify the branch logic by calling `__game._tapDevice({x,y})` with a point inside `deviceBagSlotRects(deviceBodyRect())[i]`.)

- [ ] **Step 9: Commit**

```bash
git add game/layout.js game/main.js tests/xmb-layout.test.js
git commit -m "feat(remoticon): equip gear from the Bag tab and empty GEAR plates"
```

---

# PHASE B — The XMB usable-bar

Phase B builds the always-live bar. It is additive: the combat wheel keeps its item leaves until Phase C, so the game stays fully playable throughout.

## Task B1: The pure XMB model (`game/xmb.js`)

**Files:**
- Create: `game/xmb.js`
- Test: `tests/xmb.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/xmb.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  XMB_CATEGORIES, XMB_LABELS, xmbCategoryOf, buildXmbBar,
  resolveXmbSelection, cycleXmbCategory, cycleXmbItem,
} from '../game/xmb.js';

const rock   = { id: 'rock',   name: 'Rock',   useType: 'throw', range: 4 };
const sludge = { id: 'sludge', name: 'Sludge', useType: 'throw', range: 5 };
const potion = { id: 'potion', name: 'Potion', useType: 'self', effect: 'heal', healAmount: 30 }; // no category → drink
const burger = { id: 'burger', name: 'Burger', useType: 'self', category: 'ambro', effect: 'heal', healAmount: 15 }; // eat
const cape   = { id: 'red_cape', name: 'Cape', useType: 'equip', equipSlot: 'back' }; // not on the bar
const fur    = { id: 'wererat_fur', name: 'Fur', useType: 'none' };                    // not on the bar

const inv = [
  { itemDef: rock, count: 3 }, null, { itemDef: potion, count: 1 },
  { itemDef: burger, count: 2 }, { itemDef: cape, count: 1 }, { itemDef: fur, count: 1 },
];

test('XMB_CATEGORIES is throw/drink/eat in bar order', () => {
  assert.deepEqual(XMB_CATEGORIES, ['throw', 'drink', 'eat']);
  assert.equal(XMB_LABELS.throw, 'THROW');
});

test('xmbCategoryOf buckets by useType/category and rejects non-usables', () => {
  assert.equal(xmbCategoryOf(rock), 'throw');
  assert.equal(xmbCategoryOf(potion), 'drink');
  assert.equal(xmbCategoryOf(burger), 'eat');
  assert.equal(xmbCategoryOf(cape), null);
  assert.equal(xmbCategoryOf(fur), null);
  assert.equal(xmbCategoryOf(null), null);
});

test('explicit consumeKind overrides the derived bucket', () => {
  assert.equal(xmbCategoryOf({ useType: 'self', category: 'ambro', consumeKind: 'drink' }), 'drink');
});

test('buildXmbBar groups usables, tags backing slot, drops non-usables', () => {
  const bar = buildXmbBar(inv);
  assert.deepEqual(bar.columns.map(c => c.key), ['throw', 'drink', 'eat']);
  assert.equal(bar.columns[0].items[0].itemDef.id, 'rock');
  assert.equal(bar.columns[0].items[0].slot, 0);  // backing inventory index
  const ids = bar.columns.flatMap(c => c.items.map(i => i.itemDef.id));
  assert.ok(!ids.includes('red_cape') && !ids.includes('wererat_fur'));
});

test('buildXmbBar hides categories that have no items', () => {
  const bar = buildXmbBar([{ itemDef: rock, count: 1 }]);
  assert.deepEqual(bar.columns.map(c => c.key), ['throw']);   // no drink/eat columns
});

test('resolveXmbSelection remembers the per-category pick and clamps stale ids', () => {
  const bar = buildXmbBar(inv);
  const sel = resolveXmbSelection(bar, 'drink', { drink: 'potion' });
  assert.equal(sel.column.key, 'drink');
  assert.equal(sel.item.itemDef.id, 'potion');
  const sel2 = resolveXmbSelection(bar, 'throw', { throw: 'gone' });  // stale → first item
  assert.equal(sel2.item.itemDef.id, 'rock');
  assert.equal(resolveXmbSelection(buildXmbBar([]), 'throw', {}), null);  // empty bar
});

test('cycleXmbCategory walks non-empty columns and wraps', () => {
  const bar = buildXmbBar(inv);
  assert.equal(cycleXmbCategory(bar, 'throw', 1), 'drink');
  assert.equal(cycleXmbCategory(bar, 'eat', 1), 'throw');    // wrap forward
  assert.equal(cycleXmbCategory(bar, 'throw', -1), 'eat');   // wrap back
});

test('cycleXmbItem walks items within a column and wraps', () => {
  const bar = buildXmbBar([{ itemDef: rock, count: 1 }, { itemDef: sludge, count: 1 }]);
  assert.equal(cycleXmbItem(bar, 'throw', { throw: 'rock' }, 1), 'sludge');
  assert.equal(cycleXmbItem(bar, 'throw', { throw: 'sludge' }, 1), 'rock');   // wrap
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/xmb.test.js`
Expected: FAIL — `../game/xmb.js` does not exist.

- [ ] **Step 3: Implement `game/xmb.js`**

```js
// game/xmb.js — the XMB usable-bar model. Pure, headless, testable.
//
// The always-live bottom bar is a VIEW over game.inventory, not a separate
// container: it filters the bag for "usable" items (throw / self-consumable)
// and groups them into horizontal categories, each with a vertical item column.
// Gear (useType:'equip'), quest/inert items (useType:'none'), learn tomes and
// the melee weapon never appear here — they live in the bag or on the body.

export const XMB_CATEGORIES = ['throw', 'drink', 'eat'];   // left-to-right bar order
export const XMB_LABELS = { throw: 'THROW', drink: 'DRINK', eat: 'EAT' };

// Which XMB column an item belongs to, or null if it is not a bar usable.
// An explicit `consumeKind` ('drink'|'eat') on the item def wins; otherwise a
// self-use food (category 'ambro') → eat, and any other self-use → drink.
export function xmbCategoryOf(def) {
    if (!def) return null;
    if (def.useType === 'throw') return 'throw';
    if (def.useType === 'self') {
        if (def.consumeKind === 'drink' || def.consumeKind === 'eat') return def.consumeKind;
        return def.category === 'ambro' ? 'eat' : 'drink';
    }
    return null;
}

// Build the bar from an inventory array (slots {itemDef,count}|null). Only
// non-empty categories appear, in XMB_CATEGORIES order. Each item carries its
// backing inventory `slot` so callers can drive the existing use paths.
export function buildXmbBar(inventory) {
    const cols = XMB_CATEGORIES.map(key => ({ key, label: XMB_LABELS[key], items: [] }));
    const byKey = Object.fromEntries(cols.map(c => [c.key, c]));
    (inventory || []).forEach((stack, slot) => {
        if (!stack || !stack.itemDef) return;
        const cat = xmbCategoryOf(stack.itemDef);
        if (cat && byKey[cat]) byKey[cat].items.push({ slot, itemDef: stack.itemDef, count: stack.count });
    });
    return { columns: cols.filter(c => c.items.length > 0) };
}

// Resolve the live selection against a bar. `cat` is the remembered current
// category key; `pick` is { throw:id, drink:id, eat:id } remembering the last
// item id per category. Clamps gracefully when items change or a category
// empties (empty categories are absent from bar.columns). Returns
// { column, item, itemIndex, colIndex } or null when the bar is empty.
export function resolveXmbSelection(bar, cat, pick) {
    const cols = bar.columns;
    if (!cols.length) return null;
    let colIndex = cols.findIndex(c => c.key === cat);
    if (colIndex < 0) colIndex = 0;
    const column = cols[colIndex];
    const wantId = (pick && pick[column.key]) || null;
    let itemIndex = column.items.findIndex(it => it.itemDef.id === wantId);
    if (itemIndex < 0) itemIndex = 0;
    return { column, item: column.items[itemIndex], itemIndex, colIndex };
}

// Move the category cursor to the prev/next non-empty column (wraps). Returns
// the new category key (unchanged when the bar is empty).
export function cycleXmbCategory(bar, cat, dir) {
    const cols = bar.columns;
    if (!cols.length) return cat;
    let i = cols.findIndex(c => c.key === cat);
    if (i < 0) i = 0;
    return cols[(i + dir + cols.length) % cols.length].key;
}

// Move the item cursor within the current column (wraps). Returns the new
// remembered item id for that category (null when the column is empty/absent).
export function cycleXmbItem(bar, cat, pick, dir) {
    const cols = bar.columns;
    const column = cols.find(c => c.key === cat) || cols[0];
    if (!column) return null;
    const wantId = (pick && pick[column.key]) || null;
    let i = column.items.findIndex(it => it.itemDef.id === wantId);
    if (i < 0) i = 0;
    return column.items[(i + dir + column.items.length) % column.items.length].itemDef.id;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/xmb.test.js`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add game/xmb.js tests/xmb.test.js
git commit -m "feat(xmb): pure usable-bar model (bucket, build, cursor)"
```

---

## Task B2: Bar geometry (`xmbBarLayout`)

**Files:**
- Modify: `game/layout.js` (add `XMB_*` constants + `xmbBarLayout`)
- Test: `tests/xmb-layout.test.js` (extend the file created in A3)

- [ ] **Step 1: Write the failing tests (append to `tests/xmb-layout.test.js`)**

Add to the existing `tests/xmb-layout.test.js` (extend the import from `../game/layout.js` to also pull `xmbBarLayout`, `XMB_CHIP_W`, and `CANVAS_INTERNAL_PX`):

```js
import { xmbBarLayout, XMB_CHIP_W, CANVAS_INTERNAL_PX } from '../game/layout.js';

const barOf = (keys) => ({ columns: keys.map(k => ({ key: k, label: k.toUpperCase(), items: [{ itemDef: { id: k }, count: 1 }] })) });

test('xmbBarLayout emits one chip per column, centered, non-overlapping', () => {
  const lay = xmbBarLayout(barOf(['throw', 'drink', 'eat']));
  assert.equal(lay.chips.length, 3);
  for (let i = 1; i < lay.chips.length; i++) {
    assert.ok(lay.chips[i].x >= lay.chips[i - 1].x + lay.chips[i - 1].w, 'chips overlap');
  }
  const mid = (lay.chips[0].x + lay.chips[2].x + lay.chips[2].w) / 2;
  assert.ok(Math.abs(mid - CANVAS_INTERNAL_PX / 2) < XMB_CHIP_W, 'chip row not roughly centered');
});

test('xmbBarLayout sits along the bottom (aligned with the old hotbar)', () => {
  const lay = xmbBarLayout(barOf(['throw']));
  assert.ok(lay.bottom <= CANVAS_INTERNAL_PX, 'bar bottom below the canvas');
  assert.ok(lay.current.y < lay.bottom, 'current cell below its own bottom');
  assert.ok(lay.chips[0].y < lay.current.y, 'chips should sit above the current item cell');
});

test('xmbBarLayout on an empty bar yields no chips', () => {
  const lay = xmbBarLayout({ columns: [] });
  assert.equal(lay.chips.length, 0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/xmb-layout.test.js`
Expected: FAIL — `xmbBarLayout` / `XMB_CHIP_W` not exported.

- [ ] **Step 3: Implement the constants + `xmbBarLayout` in `layout.js`**

Add after the `HOTBAR_*` block (after `layout.js:54`):

```js
// ── XMB usable-bar (bottom HUD) ────────────────────────────────────────────
// A horizontal row of category chips over a single "current item" cell, aligned
// to the bottom where the flat hotbar used to sit (HOTBAR_OY..+SLOT_H).
export const XMB_CHIP_W   = 96;
export const XMB_CHIP_H   = 20;
export const XMB_CHIP_GAP = 6;
export const XMB_ITEM_H   = 46;   // current-item cell height (icon + name band)

// Geometry for the XMB bar given a built bar ({columns:[{key,label,items}]}).
// Returns { chips:[{key,label,x,y,w,h}], current:{x,y,w,h}, up, down, bottom }.
export function xmbBarLayout(bar) {
    const cols = (bar && bar.columns) || [];
    const cx = CANVAS_INTERNAL_PX / 2;
    const bottom = HOTBAR_OY + HOTBAR_SLOT_H;                 // 588 — align with old hotbar bottom
    const chipY = bottom - XMB_ITEM_H - XMB_CHIP_H - 6;
    const n = cols.length;
    const totalW = n > 0 ? n * XMB_CHIP_W + (n - 1) * XMB_CHIP_GAP : 0;
    const startX = Math.round(cx - totalW / 2);
    const chips = cols.map((c, i) => ({
        key: c.key, label: c.label,
        x: startX + i * (XMB_CHIP_W + XMB_CHIP_GAP), y: chipY, w: XMB_CHIP_W, h: XMB_CHIP_H,
    }));
    const iconSize = XMB_ITEM_H - 6;                          // 40
    const itemY = chipY + XMB_CHIP_H + 6;
    const current = { x: Math.round(cx - iconSize / 2), y: itemY, w: iconSize, h: iconSize };
    const up   = { x: current.x + current.w + 10, y: itemY - 4,               w: 18, h: 14 };
    const down = { x: current.x + current.w + 10, y: itemY + current.h - 10,  w: 18, h: 14 };
    return { chips, current, up, down, bottom };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/xmb-layout.test.js`
Expected: PASS (A3 tests + the three new ones).

- [ ] **Step 5: Commit**

```bash
git add game/layout.js tests/xmb-layout.test.js
git commit -m "feat(xmb): bottom-bar geometry (chips + current item cell)"
```

---

## Task B3: Render the bar + ctor state + swap the bottom-HUD call

**Files:**
- Modify: `game/main.js` (ctor state near `:294`)
- Modify: `game/renderer.js` (add `_drawXmbBar`; change the call at `:402`)

- [ ] **Step 1: Add XMB state to the Game constructor**

In `game/main.js`, immediately after the inventory/overlay declarations (`main.js:298-299`), add:

```js
        // (XMB) Always-live usable-bar cursor. A projection over `inventory`, so
        // it is not saved — it rebuilds from the bag on load and clamps itself.
        this.xmbCat = 'throw';   // current category; re-clamped to a non-empty one at use time
        this.xmbPick = {};       // remembered item id per category: { throw, drink, eat }
```

- [ ] **Step 2: Import the XMB model + layout into the renderer**

In `game/renderer.js`, add to the imports: from `./xmb.js` → `buildXmbBar`, `resolveXmbSelection`; from `./layout.js` → `xmbBarLayout` (extend the existing `layout.js` import line). `drawInset`, `drawPanelSmall`, `UI`, `CANVAS_PX`, and `_drawItemIcon` are already in scope.

- [ ] **Step 3: Implement `_drawXmbBar(game)`**

Add this method to the renderer, next to `_drawHotbar` (after `renderer.js:1921`):

```js
    // (XMB) The always-live usable-bar that replaces the flat bottom hotbar:
    // category chips (only non-empty ones) over the selected category's current
    // item. A projection over game.inventory — see game/xmb.js. Drawn nothing
    // when the player holds no usables (pure browse state).
    _drawXmbBar(game) {
        const { ctx } = this;
        if (!this.font) return;
        const bar = buildXmbBar(game.inventory);
        if (!bar.columns.length) return;                 // no usables → no bar
        const sel = resolveXmbSelection(bar, game.xmbCat, game.xmbPick);
        const lay = xmbBarLayout(bar);

        // Parchment strip behind the whole bar.
        const left = lay.chips[0].x - 10;
        const right = lay.chips[lay.chips.length - 1].x + lay.chips[lay.chips.length - 1].w + 10;
        drawPanelSmall(ctx, left, lay.chips[0].y - 6, right - left, (lay.bottom - lay.chips[0].y) + 10, this.uiSheet);

        // Category chips.
        for (const chip of lay.chips) {
            const on = sel && chip.key === sel.column.key;
            drawInset(ctx, chip.x, chip.y, chip.w, chip.h);
            if (on) { ctx.strokeStyle = UI.gold; ctx.lineWidth = 2; ctx.strokeRect(chip.x + 1, chip.y + 1, chip.w - 2, chip.h - 2); }
            this.font.drawText(ctx, chip.label, chip.x + chip.w / 2, chip.y + chip.h / 2 - 4, { color: on ? UI.gold : UI.dim, scale: 1, align: 'center' });
        }

        // Current item cell (icon + name + count), with ▲/▼ affordance when the
        // column holds more than one item.
        if (sel) {
            const c = lay.current;
            drawInset(ctx, c.x, c.y, c.w, c.h);
            this._drawItemIcon(sel.item.itemDef, c.x + 3, c.y + 3, c.w - 6);
            const name = (sel.item.itemDef.name || sel.item.itemDef.id || '').replace(/[\[\]]/g, '');
            this.font.drawText(ctx, name.toUpperCase(), c.x + c.w + 14, c.y + 4, { color: UI.textLight, scale: 1 });
            if (sel.item.count > 1) this.font.drawText(ctx, '×' + sel.item.count, c.x + c.w + 14, c.y + 18, { color: UI.gold, scale: 1 });
            if (sel.column.items.length > 1) {
                this.font.drawText(ctx, '▲', lay.up.x, lay.up.y, { color: UI.dim, scale: 1 });
                this.font.drawText(ctx, '▼', lay.down.x, lay.down.y, { color: UI.dim, scale: 1 });
            }
        }
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
```

- [ ] **Step 4: Swap the bottom-HUD hotbar call for the XMB bar**

In `game/renderer.js:402`, change:

```js
        this._drawHotbar(game);
```

to:

```js
        this._drawXmbBar(game);
```

(`_drawHotbar` stays — it still renders the ITEMS/Bag tab when called with a `bodyRect` at `renderer.js:1689`.)

- [ ] **Step 5: Verify in-browser**

Restart `python dev-server.py 3001`. Load the game. Expected: the bottom of the screen now shows category chips (only for held usables) + the current item, not the 9-slot grid. In the console:

```js
__game.inventory.filter(Boolean).map(s => s.itemDef.id);   // see what you hold
__game.xmbCat = 'throw'; __game._render();                 // chip highlights THROW
```

Pick up / start with a throwable (e.g. a rock) and confirm the THROW chip + rock icon render. Open the Remoticon ITEMS tab and confirm the full 9-slot Bag still renders there. Expected: 0 console errors.

- [ ] **Step 6: Commit**

```bash
git add game/main.js game/renderer.js
git commit -m "feat(xmb): render the always-live usable-bar (replaces the flat hotbar)"
```

---

## Task B4: Keyboard navigation + fire

**Files:**
- Modify: `game/main.js` (IDLE keydown; new `_xmbNav` / `_useXmbCurrent` / `_xmbAimTile`)

- [ ] **Step 1: Import the XMB model into `main.js`**

Add a new import near the top of `game/main.js` (beside the other `./` imports):

```js
import { buildXmbBar, resolveXmbSelection, cycleXmbCategory, cycleXmbItem, xmbCategoryOf, XMB_LABELS } from './xmb.js';
```

(`xmbCategoryOf` and `XMB_LABELS` are used by Task B6; import them here once.)

- [ ] **Step 2: Confirm `isHostile` is available for auto-aim**

Auto-aim needs a hostility test. Check `main.js`'s `./ai.js` import: run `git grep -n "from './ai.js'" game/main.js`. If `isHostile` is not in that import list, add it (it is exported from `game/ai.js` and already used by `items.js`). If `main.js` has no `./ai.js` import line, add `import { isHostile } from './ai.js';`.

- [ ] **Step 3: Add Shift+arrows/WASD navigation + Enter fire to the IDLE keydown**

In `game/main.js`, in the IDLE-state key handling, insert this block **before** the existing `1`–`9` handling (`main.js:1118`) so the Shift+letter combos are caught before the digit/move logic:

```js
            // (XMB) Shift + arrows / WASD scrolls the always-live usable-bar;
            // bare arrows/WASD still walk. Enter uses the highlighted item.
            const XMB_NAV = {
                ArrowLeft: 'catPrev', KeyA: 'catPrev', ArrowRight: 'catNext', KeyD: 'catNext',
                ArrowUp: 'itemPrev', KeyW: 'itemPrev', ArrowDown: 'itemNext', KeyS: 'itemNext',
            };
            if (e.shiftKey && XMB_NAV[e.code]) { e.preventDefault(); this._xmbNav(XMB_NAV[e.code]); return; }
            if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); this._useXmbCurrent(); return; }
```

> **Fire-key note (tunable):** `Enter` is the default fire key (Space is taken by the action wheel). Candidates to playtest: `Enter`, or a dedicated key. Change the `e.code === 'Enter' || 'NumpadEnter'` line if you re-bind.

- [ ] **Step 4: Implement `_xmbNav`, `_useXmbCurrent`, `_xmbAimTile`**

Add these methods to the Game class (near the other item helpers, e.g. after `_doThrowAt` at `main.js:2962`):

```js
    // (XMB) Move the usable-bar cursor. action ∈ catPrev|catNext|itemPrev|itemNext.
    _xmbNav(action) {
        const bar = buildXmbBar(this.inventory);
        if (!bar.columns.length) return;
        if (!bar.columns.some(c => c.key === this.xmbCat)) this.xmbCat = bar.columns[0].key;
        if (action === 'catPrev' || action === 'catNext') {
            this.xmbCat = cycleXmbCategory(bar, this.xmbCat, action === 'catNext' ? 1 : -1);
        } else {
            const id = cycleXmbItem(bar, this.xmbCat, this.xmbPick, action === 'itemNext' ? 1 : -1);
            if (id) this.xmbPick = { ...this.xmbPick, [this.xmbCat]: id };
        }
        audio.playSfx('menu-tick');
        this._render();
    }

    // (XMB) Use the highlighted bar item: THROW auto-aims the nearest hostile in
    // range and bursts; DRINK/EAT consume on the spot. Both reuse the existing
    // resolver bridges (_doThrowAt / _doItemUse), which consume + advance the world.
    _useXmbCurrent() {
        const bar = buildXmbBar(this.inventory);
        const sel = resolveXmbSelection(bar, this.xmbCat, this.xmbPick);
        if (!sel) { this._log('[Nothing usable on the bar.]'); return; }
        this.xmbCat = sel.column.key;
        this.xmbPick = { ...this.xmbPick, [sel.column.key]: sel.item.itemDef.id };
        const def = sel.item.itemDef;
        this.selectedSlot = sel.item.slot;              // both bridges read selectedSlot
        if (sel.column.key === 'throw') {
            const tile = this._xmbAimTile(def.range || 5);
            if (!tile) { this.selectedSlot = -1; this._log(`[No target in range for ${def.name}.]`); this._render(); return; }
            this._doThrowAt(tile);
        } else {
            this._doItemUse(def);
        }
    }

    // (XMB) Nearest alive hostile within Chebyshev `range`; else null (never waste
    // a throw on empty ground).
    _xmbAimTile(range) {
        let best = null, bestD = Infinity;
        for (const e of this.enemies) {
            if (!e.entity.isAlive() || !isHostile(e)) continue;
            const d = Math.max(Math.abs(e.x - this.playerX), Math.abs(e.y - this.playerY));
            if (d <= range && d < bestD) { bestD = d; best = { x: e.x, y: e.y }; }
        }
        return best;
    }
```

- [ ] **Step 5: Verify in-browser**

Restart `python dev-server.py 3001`. With at least one throwable and one consumable in the bag:

```js
// scroll categories/items and confirm the bar + cursor update:
__game._xmbNav('catNext');  __game._xmbNav('itemNext');
// drink/eat path (no enemy needed):
__game.xmbCat = 'eat'; __game._useXmbCurrent();   // heals + item count drops
// throw path — stand near a hostile, then:
__game.xmbCat = 'throw'; __game._useXmbCurrent(); // bursts on the nearest hostile in range
```

Also confirm **bare** ArrowUp still WALKS (dispatch a keydown without shift) and **Shift+**ArrowUp scrolls the bar. Expected: item counts decrement on use, the world advances one turn on a successful use, 0 console errors.

- [ ] **Step 6: Commit**

```bash
git add game/main.js
git commit -m "feat(xmb): Shift+arrow nav and Enter-to-use (throw auto-aims, drink/eat consume)"
```

---

## Task B5: Touch — tap the bar

**Files:**
- Modify: `game/main.js` (canvas-tap dispatch → `_tapXmbBar`; new method)

- [ ] **Step 1: Route bottom-bar taps to `_tapXmbBar`**

The old `_tapHotbar` (`main.js:1776`) hit-tested the flat bottom hotbar, which no longer renders. Find the IDLE canvas-tap dispatch that called `_tapHotbar` (near `main.js:1755`) and route bottom-bar taps to the new handler first. Add, at the start of the IDLE tap dispatch (before the world-move/target handling):

```js
            if (this._tapXmbBar(pt)) return;   // (XMB) consumed a bottom-bar tap
```

`_tapXmbBar` returns `true` when the point hit a chip / current cell / arrow (so the tap doesn't also walk the world), else `false`.

- [ ] **Step 2: Implement `_tapXmbBar(pt)`**

Add to the Game class (near `_xmbNav`):

```js
    // (XMB) Touch/click on the bottom bar. Tap a chip → switch category; tap the
    // ▲/▼ affordance → scroll the item column; tap the current-item cell → use it.
    // Returns true when the tap was on the bar (so it doesn't also move the world).
    _tapXmbBar(pt) {
        const bar = buildXmbBar(this.inventory);
        if (!bar.columns.length) return false;
        const lay = xmbBarLayout(bar);
        for (const chip of lay.chips) {
            if (this._pointInRect(pt, chip, HIT_SLOP)) {
                this.xmbCat = chip.key; audio.playSfx('menu-tick'); this._render(); return true;
            }
        }
        const sel = resolveXmbSelection(bar, this.xmbCat, this.xmbPick);
        if (sel && sel.column.items.length > 1) {
            if (this._pointInRect(pt, lay.up, HIT_SLOP))   { this._xmbNav('itemPrev'); return true; }
            if (this._pointInRect(pt, lay.down, HIT_SLOP)) { this._xmbNav('itemNext'); return true; }
        }
        if (this._pointInRect(pt, lay.current, HIT_SLOP)) { this._useXmbCurrent(); return true; }
        return false;
    }
```

- [ ] **Step 3: Import `xmbBarLayout` into `main.js`**

Add `xmbBarLayout` to the `./layout.js` import list in `game/main.js` (alongside `deviceBagSlotRects`/`deviceBodyRect`).

- [ ] **Step 4: Verify in-browser**

Restart the server. Resize to mobile if desired. Tap a category chip → the highlight moves; tap the current-item icon → it uses (throw auto-aims / drink-eat consumes); with a 2+ item column, tap ▲/▼ → the item cycles. Drive via a synthetic point if needed:

```js
const bar = buildXmbBar(__game.inventory); const lay = xmbBarLayout(bar);
__game._tapXmbBar({ x: lay.chips[0].x + 4, y: lay.chips[0].y + 4 });   // → true, category set
```

Expected: bar taps never also walk the player; 0 console errors.

- [ ] **Step 5: Commit**

```bash
git add game/main.js
git commit -m "feat(xmb): touch — tap chips, arrows, and the current item"
```

---

## Task B6: Pickup routing + auto-equip

**Files:**
- Modify: `game/main.js:2841-2852` (`_takeItemAt`)

- [ ] **Step 1: Rewrite `_takeItemAt` to route by item class**

Replace `_takeItemAt` (`main.js:2841-2852`) with:

```js
    _takeItemAt(x, y) {
        const idx = (this.groundItems || []).findIndex(gi => gi.x === x && gi.y === y);
        if (idx === -1) { this._log('[Nothing to take there.]'); return; }
        const gi = this.groundItems[idx];
        const def = ITEMS[gi.type];
        if (!def) { this.groundItems.splice(idx, 1); return; }

        // (XMB routing) Gear auto-equips into a FREE body slot; otherwise it waits
        // in the bag as spare (swap it in from the GEAR tab). Usables land in the
        // bag and surface on the XMB bar. The log names where the item went.
        const markTaken = () => {
            this._collectedItems.add(`${this._mapUrl}|${x}|${y}|${gi.type}`);
            this.groundItems.splice(idx, 1);
            audio.playSfx('pickup');
        };

        if (def.useType === 'equip' && def.equipSlot && !this.equipment[def.equipSlot]) {
            this.equipment[def.equipSlot] = def;
            markTaken();
            this._log(`[Equipped ${def.name}.]`, 'pickup');
            return;
        }

        if (!this._addToInventory(def)) { this._log('[Your bag is full.]'); return; }
        markTaken();
        const cat = xmbCategoryOf(def);
        if (cat)                          this._log(`[Took ${def.name} → ${XMB_LABELS[cat]}.]`, 'pickup');
        else if (def.useType === 'equip') this._log(`[Stashed ${def.name} in your bag.]`, 'pickup');
        else                              this._log(`[Took ${def.name}.]`, 'pickup');
    }
```

(`xmbCategoryOf` and `XMB_LABELS` were imported in Task B4 Step 1.)

- [ ] **Step 2: Verify in-browser**

Restart the server. Walk onto / target a ground item of each class and take it:
- A **gear** item with its slot free (e.g. a `foil_hat` while `equipment.top` is null) → log reads `[Equipped …]`, and `__game.equipment.top` is set (it did **not** go to the bag).
- A **throwable** (`rock`) → log reads `[Took Rock → THROW.]` and it appears on the XMB THROW column.
- A **quest** item (`wererat_fur`) → log reads `[Took …]` and it's in the bag, not on the bar.

Console spot-check:

```js
__game.groundItems;                              // find a tile with an item
__game._takeItemAt(gx, gy);                       // routes per class
__game.equipment; __game.inventory.filter(Boolean).map(s=>s.itemDef.id);
```

Expected: 0 console errors; gear with a free slot never lands on the bar.

- [ ] **Step 3: Commit**

```bash
git add game/main.js
git commit -m "feat(xmb): route pickups — gear auto-equips, usables to the bar, rest to the bag"
```

- [ ] **Step 4: Phase-B integration smoke test (do not skip)**

Per CLAUDE.md ("a merge is done when the game RUNS"): restart the server, load a save and a fresh game, and end-to-end verify: pick up a rock (→ bar), pick up a cape with a free back slot (→ equipped), Shift-scroll the bar, Enter-throw at an enemy, Enter-eat a burger, open the Remoticon and equip a spare from the Bag, and save+reload (the XMB rebuilds from inventory — `xmbCat`/`xmbPick` are not persisted and should default cleanly). Confirm 0 console errors before considering Phase B done.

---

# PHASE C — Retire item-use from the combat wheel (gated on Phase B proven)

> **Gate:** Do Phase C only after Phase B has been playtested and the XMB is confirmed to cover throwing, drinking, eating, and curing sludge (soap). Until then the wheel keeps its item leaves and the two paths coexist harmlessly. This phase removes the redundancy so item-use lives *only* on the XMB, per the design decision.

## Task C1: Remove the `ranged` / `throw` / `treat` leaves from the wheel

**Files:**
- Modify: `game/wheel-model.js:38`, `:57`, `:85-88`
- Modify: `tests/wheel-model.test.js` (drop assertions on removed leaves)

- [ ] **Step 1: Inspect the wheel tests for coupling**

Run `git grep -nE "ranged|'throw'|\"throw\"|treat|eat|cleanse" tests/wheel-model.test.js`. Note every assertion that references the four item leaves — those get removed or retargeted in Step 4.

- [ ] **Step 2: Remove the `ranged` leaf**

In `game/wheel-model.js`, delete line `:38` (the `ranged` leaf under Fight):

```js
    { key: 'ranged', label: 'Ranged', color: '#e08a2a', text: '#2a1400', needsItem: true, aimType: 'reticle', resolver: 'resolveThrow', available: always },
```

- [ ] **Step 3: Remove the `throw` leaf and the `treat` branch**

Delete the `throw` leaf (`:57`) under Trick:

```js
    { key: 'throw',  label: 'Throw',  needsItem: true,  aimType: 'reticle',  resolver: 'resolveThrow', available: always },
```

and delete the whole `treat` node with both item children (`:85-88`):

```js
  { key: 'treat', label: 'Treat', color: '#4f9b4a', text: '#effbe9', children: [
    { key: 'eat',     label: 'Eat',     needsItem: true, aimType: 'none', resolver: 'resolveUse', available: always },
    { key: 'cleanse', label: 'Cleanse', needsItem: true, aimType: 'none', resolver: 'resolveUse', available: always },
  ]},
```

Coverage check (why this is safe): THROW → XMB THROW column; food EAT → XMB EAT; soap/cure_sludge → XMB DRINK (soap is `useType:'self'`, no `category` → drink), and `_doItemUse` still sets `_soapUsedThisTurn` (`main.js:2460`). No item-use capability is lost.

- [ ] **Step 4: Update `tests/wheel-model.test.js`**

Remove or retarget every assertion found in Step 1 that referenced `ranged` / `throw` / `treat` / `eat` / `cleanse`. If a test walked the tree by fixed index/position and those indices shift, update the expected values to the new (shorter) rings. Keep assertions about the surviving nodes (Hit/Cleave, non-item Tricks, ring-active tricks, aiming).

- [ ] **Step 5: Run the wheel tests**

Run: `node --test tests/wheel-model.test.js`
Expected: PASS (with the removed-leaf assertions gone). Also run the full suite in CI: `node --test` — confirm `throw-vs-use.test.js` still passes (it exercises the *resolvers*, which are unchanged).

- [ ] **Step 6: Verify in-browser (wheel smoke test — mandatory)**

Restart `python dev-server.py 3001`. Open the action wheel (Space / ✦) and confirm: the wheel opens without error, Hit/Cleave and the ring-active tricks (e.g. `rat_form`) still fire, and there is no orphaned Throw/Ranged/Treat slice. Confirm the wheel's ring navigation (up/down pick, left/right spin) still works — the tree is shorter but structurally valid. Then throw/eat/drink via the XMB to confirm item-use still works entirely off the bar. Expected: 0 console errors.

- [ ] **Step 7: Commit**

```bash
git add game/wheel-model.js tests/wheel-model.test.js
git commit -m "refactor(wheel): retire item-use leaves — throwing/eating/curing now live on the XMB bar"
```

---

## Self-review notes (author checklist — completed)

- **Spec coverage:** vision/frictionless (B3 render, B6 routing) ✓; gear auto-equips-if-free else spare (B6, A3) ✓; XMB categories × item column (B1) ✓; always-live HUD replacing the flat hotbar (B3) ✓; Shift+arrows nav, bare arrows still walk (B4) ✓; touch (B5) ✓; item-use leaves the wheel (C1) ✓; ITEMS→Bag + GEAR equip fixes (A3) ✓; Remoticon arrow nav (A2) ✓; the DRINK/EAT source-of-truth open question resolved via `xmbCategoryOf` (explicit `consumeKind` wins, else derive from `category:'ambro'`) (B1) ✓; the fire-key open question resolved to `Enter`, flagged tunable (B4) ✓.
- **Type consistency:** `xmbCat` (string), `xmbPick` (`{cat:id}`), `buildXmbBar → {columns:[{key,label,items:[{slot,itemDef,count}]}]}`, `resolveXmbSelection → {column,item,itemIndex,colIndex}|null`, `xmbBarLayout → {chips,current,up,down,bottom}` — used identically across B1/B2/B3/B4/B5. `_useXmbCurrent`/`_xmbNav`/`_xmbAimTile`/`_tapXmbBar` names are stable across tasks.
- **No placeholders:** every code step shows real code; the two "read the current test" steps (C1 Step 1/4) are genuine inspection steps because the wheel-test file's exact assertions must be read at execution time, not invented.
- **Save compatibility:** no new persisted state; `inventory`/`equipment` already round-trip; `xmbCat`/`xmbPick` are ephemeral. No migration.
- **Naming gate:** none of the new strings contain "violence town"; run `git grep -iE 'violence[ _-]+town'` before any merge (must be zero excl. CLAUDE.md).
