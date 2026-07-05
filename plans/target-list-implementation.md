# Target List (RuneScape menu) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the radial *Target Wheel* (the verbs shown when you tap/focus an NPC/item/POI) with a vertical **RuneScape-style ordered list**, so the action wheel is the only radial surface and players never wonder "which wheel am I on?"

**Architecture:** Reuse the existing `targetVerbs(target, game)` verb set from `wheel-model.js`; add a pure `orderedTargetVerbs()` that re-orders by convention (default action on top, `Cancel` at the bottom) and appends a `cancel` pseudo-verb. Add a new `STATE.TARGET_LIST` + `renderer._drawTargetList` (a plain vertical menu drawn in the ornate-panel chrome) + keyboard/tap handlers that mirror the existing target-wheel handlers. Retire `STATE.TARGET_WHEEL` and route the tap/`F` entry points to the list. **Out of scope this slice:** `Walk here` and path-then-act (they land with the pointer-model slice) — so verbs keep their current adjacency gating.

**Tech Stack:** Vanilla JS ES modules, canvas 2D. Tests via `node --test` (run where `node` exists — it's absent on this machine, so also verify behavior in-browser via `python dev-server.py 3001` + `window.__game`). Commit after each task.

---

## File structure

- **Modify `game/wheel-model.js`** — add `orderedTargetVerbs(target, game)` (pure): calls `targetVerbs`, re-orders by a convention rank, appends `{ key:'cancel', label:'Cancel', resolver:'cancel', color:'#6b5436', text:'#e8dcc0' }`. `targetVerbs` stays as-is (still returns the raw set).
- **Modify `game/main.js`** — add `STATE.TARGET_LIST`; add `_openTargetList` / `_closeTargetList` / `_targetListKey` / `_tapTargetList`; add a `cancel` branch + a `runTargetVerb(verb, target)` helper (extract the switch from `_fireTargetVerb` so both wheel-era and list share it — but since the wheel is retired here, `_fireTargetVerb`'s body moves into the list path); route the tap-a-target and `F` entry points to `_openTargetList`; retire `STATE.TARGET_WHEEL` + `_openTargetWheel`/`_targetWheelKey`/`_tapTargetWheel`.
- **Modify `game/renderer.js`** — add `_drawTargetList(game)` + dispatch (`if (game.state === 'target_list') this._drawTargetList(game)`); remove the `target_wheel` dispatch line (leave `_drawTargetWheel` unused or delete).
- **Modify `game/layout.js`** — add `TARGET_LIST_RECT` + a `targetListRowRect(i)` helper for tap hit-testing.
- **Test `tests/target-list.test.js`** — the pure ordering.

State shape: reuse a `game.targetList = { x, y, target, verbs, sel }` (mirrors `targetWheel` minus the spin fields).

---

### Task 1: Ordered target verbs (pure logic)

**Files:**
- Modify: `game/wheel-model.js` (add `orderedTargetVerbs`, exported; near the existing `targetVerbs` / `createTargetWheelState`)
- Test: `tests/target-list.test.js` (create)

- [ ] **Step 1: Write the failing test**

```js
// tests/target-list.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderedTargetVerbs } from '../game/wheel-model.js';

const G = { playerX: 5, playerY: 5, inventory: [] };

test('friendly NPC: Talk default on top, Cancel last', () => {
  const npc = { x: 6, y: 5, behavior: ['IDLE'], dialogueId: 'x', bribeable: true,
                entity: { isAlive: () => true } };
  const list = orderedTargetVerbs({ x: 6, y: 5, npc }, G).map(v => v.key);
  assert.equal(list[0], 'talk');                 // default on top
  assert.equal(list[list.length - 1], 'cancel'); // Cancel last
  assert.ok(list.indexOf('examine') < list.indexOf('cancel')); // Examine above Cancel
});

test('hostile NPC: Attack (hit) default on top', () => {
  const npc = { x: 6, y: 5, behavior: ['HOSTILE'], entity: { isAlive: () => true } };
  const list = orderedTargetVerbs({ x: 6, y: 5, npc }, G).map(v => v.key);
  assert.equal(list[0], 'hit');
  assert.equal(list[list.length - 1], 'cancel');
});

test('ground item: Take default, then Examine, then Cancel', () => {
  const item = { def: { name: '[Rock]' } };
  const list = orderedTargetVerbs({ x: 6, y: 5, item }, G).map(v => v.key);
  assert.deepEqual(list, ['take', 'examine', 'cancel']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/target-list.test.js`
Expected: FAIL — `orderedTargetVerbs is not a function` (import error). *(No `node` on this machine → this run happens where node exists / CI. Locally, proceed to Step 3 and verify in-browser at Task 6.)*

- [ ] **Step 3: Implement `orderedTargetVerbs`**

Add to `game/wheel-model.js` (after `targetVerbs`; export it). It ranks the raw `targetVerbs` result by convention and appends `cancel`:

```js
// (Target List) Convention order for the RuneScape-style target menu: the
// default/quick action on top, then other verbs, then Examine, then Cancel.
// `Walk here` is added by the pointer-model slice; not present yet.
const TARGET_VERB_RANK = { hit: 0, talk: 0, take: 0, examine: 90, // defaults share rank 0
  trade: 20, bribe: 30, throw: 40 };
export function orderedTargetVerbs(target, game) {
  const verbs = targetVerbs(target, game).slice();
  // Default = the natural top action for this target kind.
  const npc = target && target.npc;
  const hostile = npc && ((!npc.behavior || npc.behavior.includes('HOSTILE')) && !npc._ally);
  const defaultKey = target.item ? 'take'
    : npc ? (hostile ? 'hit' : (npc.dialogueId ? 'talk' : 'examine'))
    : 'examine';
  const rank = (v) => (v.key === defaultKey ? -1 : (TARGET_VERB_RANK[v.key] ?? 50));
  verbs.sort((a, b) => rank(a) - rank(b) || (a.label < b.label ? -1 : 1));
  verbs.push({ key: 'cancel', label: 'Cancel', resolver: 'cancel', color: '#4a3c2a', text: '#b0a184' });
  return verbs;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/target-list.test.js`
Expected: PASS (where node exists). Locally: skip; covered by Task 6 in-browser.

- [ ] **Step 5: Commit**

```bash
git add game/wheel-model.js tests/target-list.test.js
git commit -m "feat(target-list): orderedTargetVerbs — convention ordering + Cancel"
```

---

### Task 2: STATE.TARGET_LIST + list state + open/close

**Files:**
- Modify: `game/main.js` (STATE enum; add `_openTargetList`/`_closeTargetList`; init `this.targetList`)

- [ ] **Step 1: Add the state**

In the `STATE` object in `game/main.js`, add after `TARGET_WHEEL`:

```js
    TARGET_LIST:     'target_list',     // (Target List) RuneScape-style verb menu on a tapped/focused target
```

- [ ] **Step 2: Init list state**

Where `this.targetWheel = createTargetWheelState()` is set in the constructor, add:

```js
        this.targetList = { x: 0, y: 0, target: null, verbs: [], sel: 0 };
```

- [ ] **Step 3: Add open/close (import `orderedTargetVerbs`)**

Add `orderedTargetVerbs` to the existing `from './wheel-model.js'` import. Add these methods next to the existing `_openTargetWheel`/`_closeTargetWheel`:

```js
    _openTargetList(x, y) {
        if (this.state !== STATE.IDLE) return false;
        const target = this._targetAt(x, y);
        if (!target) return false;
        const verbs = orderedTargetVerbs(target, this);
        if (!verbs.length) return false;
        this._stopAutoRepeat();
        Object.assign(this.targetList, { x, y, target, verbs, sel: 0 });
        this.state = STATE.TARGET_LIST;
        audio.playSfx('menu-open');
        this._render();
        return true;
    }

    _closeTargetList() {
        this.state = STATE.IDLE;
        this.targetList.target = null;
        audio.playSfx('menu-cancel');
        this._render();
        this._resumeHeldWalk();
    }
```

- [ ] **Step 4: Commit**

```bash
git add game/main.js
git commit -m "feat(target-list): STATE.TARGET_LIST + open/close"
```

---

### Task 3: Render the list

**Files:**
- Modify: `game/layout.js` (add `TARGET_LIST_RECT` + `targetListRowRect`)
- Modify: `game/renderer.js` (add `_drawTargetList` + dispatch)

- [ ] **Step 1: Layout rect + row helper**

Add to `game/layout.js`:

```js
// (Target List) A compact centred menu. Rows are ROW_H tall from the title.
export const TARGET_LIST_RECT = { x: 180, y: 150, w: 248, h: 40 }; // h is per-row seed; real height computed in the renderer
export const TARGET_LIST_ROW_H = 30;
export function targetListRowRect(i) {
  return { x: TARGET_LIST_RECT.x + 10, y: TARGET_LIST_RECT.y + 44 + i * TARGET_LIST_ROW_H, w: TARGET_LIST_RECT.w - 20, h: TARGET_LIST_ROW_H - 4 };
}
```

- [ ] **Step 2: Renderer + dispatch**

Import `TARGET_LIST_RECT, TARGET_LIST_ROW_H` from `./layout.js` in `renderer.js`. Add the dispatch next to the other modals (after the `target_wheel` line, or replacing it):

```js
        if (game.state === 'target_list') this._drawTargetList(game);
```

Add the method (near `_drawTargetWheel`):

```js
    // (Target List) A RuneScape-style vertical menu: the target named at the top,
    // its ordered verbs as rows, the selected row highlighted, drawn in the ornate
    // panel chrome. Colours ride each verb's own colour language.
    _drawTargetList(game) {
        const { ctx } = this; const ui = this.uiSheet; if (!this.font) return;
        const tl = game.targetList; if (!tl || !tl.verbs.length) return;
        ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX); ctx.restore();
        const R = TARGET_LIST_RECT, RH = TARGET_LIST_ROW_H;
        const h = 44 + tl.verbs.length * RH + 8;
        const px = R.x, py = R.y, w = R.w;
        if (ui?.loaded) drawPanelBig(ctx, ui, px, py, w, h, 'base');
        else            drawPanelSmall(ctx, px, py, w, h);
        const t = tl.target;
        const name = (t.npc && (t.npc.name || t.npc.type)) || (t.item && ((t.item.def && t.item.def.name) || t.item.type)) || (t.examinable && t.examinable.id) || '?';
        this.font.drawText(ctx, String(name).replace(/[\[\]]/g, '').toUpperCase().slice(0, 18), px + w / 2, py + 14, { color: UI.gold, scale: 1, align: 'center' });
        for (let i = 0; i < tl.verbs.length; i++) {
            const v = tl.verbs[i], sel = (i === tl.sel), ry = py + 44 + i * RH;
            if (sel) { ctx.fillStyle = 'rgba(212,185,106,0.18)'; ctx.fillRect(px + 8, ry - 2, w - 16, RH - 4); }
            this.font.drawText(ctx, (sel ? '> ' : '  ') + v.label, px + 16, ry + 6, { color: sel ? (v.text || UI.textLight) : UI.text, scale: 1 });
        }
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
```

- [ ] **Step 3: Commit**

```bash
git add game/layout.js game/renderer.js
git commit -m "feat(target-list): renderer._drawTargetList + layout rect"
```

---

### Task 4: Input — keyboard nav + tap + fire

**Files:**
- Modify: `game/main.js` (key handler block; tap dispatch; `_targetListKey`/`_tapTargetList`; reuse the verb-resolution switch)

- [ ] **Step 1: Keyboard handler**

In the keydown handler, replace the `STATE.TARGET_WHEEL` block with a `STATE.TARGET_LIST` block:

```js
            if (this.state === STATE.TARGET_LIST) {
                e.preventDefault();
                const n = this.targetList.verbs.length;
                if (e.code === 'ArrowUp'   || e.code === 'KeyW') { this.targetList.sel = (this.targetList.sel - 1 + n) % n; audio.playSfx('menu-tick'); this._render(); return; }
                if (e.code === 'ArrowDown' || e.code === 'KeyS') { this.targetList.sel = (this.targetList.sel + 1) % n; audio.playSfx('menu-tick'); this._render(); return; }
                if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') { this._fireTargetVerb(this.targetList.verbs[this.targetList.sel]); return; }
                if (e.code === 'Escape' || e.code === 'KeyF') { this._closeTargetList(); return; }
                return;
            }
```

- [ ] **Step 2: Tap handler**

In the pointer/tap dispatch, replace the `STATE.TARGET_WHEEL` branch with:

```js
        if (this.state === STATE.TARGET_LIST) { this._tapTargetList(pt); return; }
```

Add `_tapTargetList` (import `targetListRowRect` + `TARGET_LIST_RECT` from layout, and reuse `_pointInRect`):

```js
    _tapTargetList(pt) {
        const tl = this.targetList;
        for (let i = 0; i < tl.verbs.length; i++) {
            if (this._pointInRect(pt, targetListRowRect(i), 4)) {
                if (i === tl.sel) { this._fireTargetVerb(tl.verbs[i]); return; }
                tl.sel = i; audio.playSfx('menu-tick'); this._render(); return;   // first tap selects, second fires
            }
        }
        this._closeTargetList();   // tap outside = cancel
    }
```

- [ ] **Step 3: Handle the `cancel` verb + list-close in `_fireTargetVerb`**

`_fireTargetVerb` currently sets `this.state = STATE.IDLE` then switches on `verb.resolver`. Add a `cancel` case at the top and make the examine/talk/etc. cases also work from the list (they already set IDLE + call the resolvers — unchanged). Add:

```js
            case 'cancel': { this._closeTargetList(); return; }
```

Ensure any resolver that opened a sub-UI (talk/trade) still works — they call `_openDialogue`/`_openTrade`, which set their own state, so no change needed.

- [ ] **Step 4: Commit**

```bash
git add game/main.js
git commit -m "feat(target-list): keyboard nav + tap + fire (cancel row closes)"
```

---

### Task 5: Retire the Target Wheel + route entry points to the list

**Files:**
- Modify: `game/main.js` (route `_openTargetWheelFaced`/tap-a-target → `_openTargetList`; remove wheel methods)
- Modify: `game/renderer.js` (drop the `target_wheel` dispatch)

- [ ] **Step 1: Route entry points**

Find every call site that opened the target wheel — the `F` key path (`_openTargetWheelFaced`) and the IDLE tap-a-target path (which calls `_openTargetWheel(tile.x, tile.y)`). Change them to call `_openTargetList` / a faced variant:

```js
    _openTargetListFaced() {
        const FACE = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
        const [dx, dy] = FACE[this.facing] || [0, 1];
        return this._openTargetList(this.playerX + dx, this.playerY + dy);
    }
```

Update the `KeyF` handler to call `_openTargetListFaced()`; update the IDLE canvas-tap-on-a-target branch to call `_openTargetList(tile.x, tile.y)`.

- [ ] **Step 2: Remove the wheel**

Delete `_openTargetWheel`, `_closeTargetWheel`, `_targetWheelKey`, `_tapTargetWheel`, `_openTargetWheelFaced`, and the `STATE.TARGET_WHEEL` enum entry + its `this.targetWheel = createTargetWheelState()` init and the `createTargetWheelState` import (if now unused). In `renderer.js` remove the `if (game.state === 'target_wheel') this._drawTargetWheel(game)` dispatch (leave `_drawTargetWheel` + `createTargetWheelState`/`targetVerbs` — still exported/used-by-tests, harmless — or delete `_drawTargetWheel` if you prefer).

- [ ] **Step 3: Grep to confirm nothing dangles**

Run: `git grep -n "TARGET_WHEEL\|targetWheel\|_targetWheelKey\|_tapTargetWheel\|_openTargetWheel"`
Expected: no live references in `game/main.js`/`game/renderer.js` (test files that reference the retired API should be updated or the references removed).

- [ ] **Step 4: Commit**

```bash
git add game/main.js game/renderer.js
git commit -m "refactor(target-list): retire the Target Wheel; route F/tap to the list"
```

---

### Task 6: Verify in-browser + final commit

**Files:** none (verification)

- [ ] **Step 1: Serve + drive**

Run: `python dev-server.py 3001` (restart for fresh modules). Then via the preview tools / `window.__game`:

```js
// start game, load town, open the list on an NPC:
const g = window.__game;
const npc = (g.enemies||[]).find(e => e.dialogueId);
g._openTargetList(npc.x, npc.y);
JSON.stringify({ state: g.state, verbs: g.targetList.verbs.map(v=>v.key) });
```

Expected: `state:"target_list"`, verbs ordered with the default first and `cancel` last.

- [ ] **Step 2: Screenshot + interactions**

Screenshot the list (a vertical menu, not a ring). Confirm: ↑↓ moves the highlight, Space/Enter/E fires the selected verb (talk opens dialogue, examine opens the inspect panel), Esc/F and the `Cancel` row and a tap-outside all close it, a tap on a row selects-then-fires. Check the console for 0 errors.

- [ ] **Step 3: Regression check**

Confirm the *action wheel* (Space/`Q`) still opens as a radial (unchanged), and tapping an NPC now opens the LIST (not the ring). Both surfaces have distinct silhouettes.

- [ ] **Step 4: Final commit (if any verify-driven fixes)**

```bash
git add -A
git commit -m "test(target-list): in-browser verification pass"
```

---

## Self-review

- **Spec coverage:** implements spec §3 "Target List" (ordered list, default-on-top, reuses `targetVerbs`, retires the wheel). `Walk here` + path-then-act are intentionally deferred to the pointer-model slice (noted in Goal + Task 1). Pad navigation (FOCUS/MOVE/CONFIRM) is satisfied by the keyboard handler (F/↑↓/Space) and will bind to intents in the input-layer slice.
- **Placeholders:** none — every step has real code or an exact command.
- **Type consistency:** `orderedTargetVerbs` returns the same verb-object shape `targetVerbs` produces (`{key,label,color,text,resolver,...}`) plus a `cancel` verb; `_fireTargetVerb` already switches on `verb.resolver` and gains a `cancel` case; `game.targetList = {x,y,target,verbs,sel}` is used consistently across open/render/key/tap.
- **Node caveat:** the `node --test` steps run where node exists (absent locally); Task 6 is the authoritative local verification.
