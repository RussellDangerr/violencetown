# Radial Sunburst Combat Wheel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement task-by-task. Steps use `- [ ]` checkboxes.
> **Design spec (read first):** `plans/combat-wheel-radial-overhaul.md`.

**Goal:** Replace the flat "tape" combat wheel with a concentric radial **sunburst** — MENU hub, greyed
decision-stack rings, one bright spinnable active ring, and a curved-arc-tile preview of the next level fanning
above the pointer — driven by a deepened verb tree.

**Architecture:** Generalize `wheel-model.js` from fixed layers (CATEGORY/SUBVERB/ITEM/SPELL/AIM) to an
**arbitrary tree walk** (a `path` of indices into a node tree; `cycle` = rotate the current ring, `drill` = push a
child, `back` = pop). Shipped resolvers (`combatAttack`/`cleaveAttack`/`spinAttack`/`castSpell`/`resolveThrow`)
stay; only the tree shape + navigation generalize. The render moves from `renderer._drawWheel`'s tape to a sunburst
built from one reusable curved-tile primitive; geometry centralizes in `layout.js`. Four phases off `dev`.

**Tech stack:** Vanilla JS ES modules · `<canvas>` 2D · no build step.

**VERIFICATION (no test runner here — this replaces TDD):** start the dev server with
`python dev-server.py 3001` (or the `violencetown` launch config). Verify each task IN-BROWSER:
`mcp__Claude_Preview__preview_eval` for state/geometry probes and `canvas.getContext('2d').getImageData(x,y,1,1)`
for **pixel probes** (primary — the screenshot tool times out on the animated canvas). To boot: navigate to
`http://localhost:3001/index.html`, click `#splash-go`, then drive `window.__game`. **Restart the dev server after
any `.js` edit** (the `?dev` token only rotates on restart) — reload alone won't reload modules.

---

## File structure

| File | Responsibility | Change |
|---|---|---|
| `game/wheel-model.js` | Verb tree + navigation (pure, no DOM) | Generalize to a tree walk; deepen the tree; add decision-path + preview-children + placeholder accessors |
| `game/layout.js` | Shared in-canvas geometry | Add sunburst consts (hub/ring radii, preview band+span, pointer, tile gap); delete legacy `RING_*`/`RADIAL_*` |
| `game/renderer.js` | Canvas draw | A curved-tile primitive + rewrite `_drawWheel` (tape → sunburst) |
| `game/main.js` | Input + touch | Map spin/drill/back/fire to the model; rewrite `_tapRadialMenu` (Phase 2) |

Keep `wheel-model.js` DOM-free (renderer reads it, main drives it) — the boundary that lets it be probed directly.

---

## PHASE 1 — Tree-walk model + static sunburst render

Branch: `feature/wheel-sunburst-1` off `dev`. Outcome: the new tree renders as a static sunburst; every ability
still reaches its resolver through the new path. No animation yet.

### Task 1.1 — Generalize the model to a node tree

**Files:** Modify `game/wheel-model.js`.

- [ ] **Step 1 — Define the node tree.** Replace `VERB_TREE` (the category→subverb object) with a single ROOT
  node whose `children` are the categories. A node is
  `{ key, label, available?, children?, resolver?, aimType?, needsItem?, needsSpell? }`. A node with `children`
  is a sub-wheel; a node without is a leaf (an ability). Exact data:

```js
const always = () => true;
export const ROOT = { key: 'menu', label: 'MENU', children: [
  { key: 'fight', label: 'Fight', children: [
    { key: 'melee', label: 'Melee', children: [
      { key: 'hit',    label: 'Hit',    aimType: 'adjacent', resolver: 'combatAttack', available: always },
      { key: 'cleave', label: 'Cleave', aimType: 'adjacent', resolver: 'cleaveAttack', available: always },
      { key: 'spin',   label: 'Spin',   aimType: 'none',     resolver: 'spinAttack',   available: always },
    ]},
    { key: 'ranged', label: 'Ranged', needsItem: true, aimType: 'reticle', resolver: 'resolveThrow', available: always },
    { key: 'magic',  label: 'Magic',  needsSpell: true, aimType: 'reticle', resolver: 'castSpell',
      available: (g) => (g.playerMp || 0) > 0 && ((g.knownSpells && g.knownSpells.length) || 0) > 0 },
  ]},
  { key: 'trick', label: 'Trick', children: [
    { key: 'throw', label: 'Throw', needsItem: true,  aimType: 'reticle',  resolver: 'resolveThrow', available: always },
    { key: 'trade', label: 'Trade', needsItem: false, aimType: 'adjacent', resolver: 'trade',        available: always },
  ]},
  { key: 'treat', label: 'Treat', children: [
    { key: 'eat',     label: 'Eat',     needsItem: true, aimType: 'none', resolver: 'resolveUse', available: always },
    { key: 'cleanse', label: 'Cleanse', needsItem: true, aimType: 'none', resolver: 'resolveUse', available: always },
  ]},
  { key: 'flight', label: 'Flight', children: [
    { key: 'defend', label: 'Defend', aimType: 'none',     resolver: 'guard', available: always },
    { key: 'wait',   label: 'Wait',   aimType: 'none',     resolver: 'wait',  available: always },
    { key: 'run',    label: 'Run',    aimType: 'adjacent', resolver: 'run',   available: always },
  ]},
]};
```

- [ ] **Step 2 — Replace the wheel state with a path.** `createWheelState()` returns
  `{ path: [0], reticle: null, lastFired: null, aiming: false }`. `path` is indices from ROOT.children down to the
  current ring's selection: `path[0]` = selected category index, `path[1]` = selected verb index, etc. The
  **current ring** is the children of the node reached by `path[0..len-2]`; `path[len-1]` is the selection in it.

- [ ] **Step 3 — Tree walk helpers.** Add pure functions:

```js
// The node reached by following indices from ROOT.
function nodeAt(indices) { let n = ROOT; for (const i of indices) n = n.children[i]; return n; }
// The ring the player is currently spinning (siblings of the selection): children of path[0..len-2].
export function activeRing(w)   { return nodeAt(w.path.slice(0, -1)).children; }
export function activeIndex(w)  { return w.path[w.path.length - 1]; }
export function selectedNode(w) { return activeRing(w)[activeIndex(w)]; }
export function isLeaf(node)    { return !node.children || node.children.length === 0; }
// Breadcrumb: the locked parent labels, root→current. ['MENU','Fight',...].
export function decisionPath(w) { const out = ['MENU']; let n = ROOT; for (let d = 0; d < w.path.length - 1; d++) { n = n.children[w.path[d]]; out.push(n.label); } return out; }
// The preview children of the current highlight (for the arc), or [] if leaf/needs-item/needs-spell.
export function previewChildren(w) { const s = selectedNode(w); return (s.children || []); }
```

- [ ] **Step 4 — cycle / drill / back.** Replace the old `cycle`/`forward`/`back` with tree ops:

```js
const wrap = (i, n) => ((i % n) + n) % n;
export function cycle(w, dir) { const ring = activeRing(w); w.path[w.path.length - 1] = wrap(activeIndex(w) + dir, ring.length); }
// Drill: leaf → 'fire'; sub-wheel → push (cursor-memory index if remembered, else 0).
export function drill(w, game) {
  const s = selectedNode(w);
  if (isLeaf(s) && !s.needsItem && !s.needsSpell && s.aimType === 'none') return 'fire'; // self leaf
  if (isLeaf(s)) { w.aiming = (s.aimType !== 'none'); return s.aiming ? 'aim' : 'fire'; }
  w.path.push(w._memory?.[pathKey(w)] ?? 0); return;
}
export function back(w) { if (w.path.length <= 1) return 'close'; w.path.pop(); w.reticle = null; w.aiming = false; }
```
   (`pathKey`/`_memory` is the cursor-memory map keyed by the parent path — Task 1.2.)

- [ ] **Step 5 — Keep the resolvers reachable.** `compose(w, game)` returns
  `{ node: selectedNode(w), itemSlot, spellId, aimTile }` using the same item/spell logic as today, keyed off the
  selected node's `needsItem`/`needsSpell`. Keep `affectedTiles`, `needsFriendlyConfirm`, `aimRange`,
  `autoAimTile`, `isOffensiveLeaf`, `validItemSlots`, `selectedSpell*` — but have them read `selectedNode(w)`
  instead of `currentLeaf(w)`. Keep `OFFENSIVE_RESOLVERS` unchanged.

- [ ] **Step 6 — VERIFY (in-browser).** Restart server, boot, then probe the walk:

```js
preview_eval: (() => { const g = window.__game; const W = createTest = g.wheel; g._openWheel();
  const k = c => document.dispatchEvent(new KeyboardEvent('keydown',{code:c,bubbles:true}));
  const r = () => g.wheel.path.slice();
  const out = { open: r() };                 // [0]
  k('Space'); out.drillFight = r();          // [0,0]  (into Fight)
  k('Space'); out.drillMelee = r();          // [0,0,0] (into Melee → Hit/Cleave/Spin)
  k('ArrowRight'); out.spinToCleave = r();   // [0,0,1]
  return out; })()
```
  Expect `path` deepens to `[0,0,0]` (MENU→Fight→Melee) and spins within Melee's ring. **Fix until correct.**

- [ ] **Step 7 — Commit.** `git add game/wheel-model.js && git commit -m "feat(wheel): generalize the model to a node tree (Melee/Ranged/Magic sub-wheels)"`

### Task 1.2 — Cursor memory + placeholder padding

**Files:** Modify `game/wheel-model.js`.

- [ ] **Step 1 — Cursor memory.** Add `w._memory = {}`; `pathKey(w)` = `w.path.slice(0,-1).join('.')`. In `cycle`
  and on `drill`, write `w._memory[pathKey(w)] = activeIndex(w)` so re-entering a ring restores the last pick.
  On `_openWheel`, restore `path` from the deepest remembered category so the top opens on the last-used.
- [ ] **Step 2 — Placeholder padding.** Add `paddedRing(ring)` — if `ring.length < 2`, append
  `{ key:'placeholder2', label:'…', placeholder:true }` (and `placeholder3`) so every ring is spinnable;
  `cycle` skips placeholders' resolvers (a placeholder is non-selectable to FIRE — drilling/firing it is a no-op
  with a `bump-wall` sfx). `activeRing` returns the padded ring.
- [ ] **Step 3 — VERIFY:** `preview_eval` open the wheel after using Magic once, confirm `path` reopens on Fight
  (or last category) and Ranged's ring shows placeholders when the bag has < 2 throwables.
- [ ] **Step 4 — Commit:** `git commit -am "feat(wheel): cursor memory + placeholder padding for thin rings"`

### Task 1.3 — Sunburst geometry in layout.js

**Files:** Modify `game/layout.js` (the `Radial combat wheel` block).

- [ ] **Step 1 — Replace `RING_*`/`RADIAL_*` (lines ~48-64) with sunburst consts:**

```js
export const RADIAL_CENTER_X = 304, RADIAL_CENTER_Y = 304;
export const WHEEL_HUB_R   = 34;            // center 'MENU' disc
export const WHEEL_RING_W   = 40;           // radial thickness of each full ring
export const WHEEL_RING_GAP = 5;            // gap between rings
export const WHEEL_RING0_R0 = 40;           // inner edge of the first ring out from the hub
export const WHEEL_TILE_GAP = 0.03;         // angular gap between tiles (radians)
export const WHEEL_PREVIEW_R0 = 124;        // inner edge of the preview arc (outside the active ring)
export const WHEEL_PREVIEW_R1 = 158;
export const WHEEL_PREVIEW_SPAN = Math.PI * 0.85; // total arc the preview tiles occupy, centred on top
export const WHEEL_POINTER_R = 120;         // where the ▲ sits (just outside the active ring)
// ring k's [inner,outer] radius (k=0 nearest the hub):
export function wheelRingR(k) { const r0 = WHEEL_RING0_R0 + k * (WHEEL_RING_W + WHEEL_RING_GAP); return [r0, r0 + WHEEL_RING_W]; }
```

- [ ] **Step 2 — Commit:** `git commit -am "feat(layout): sunburst wheel geometry (replaces legacy radial consts)"`
  (Grep `RING_ACTION_R|RADIAL_INNER` across `game/` first; if the legacy consts are imported anywhere, update or
  remove those imports in the same commit so nothing breaks.)

### Task 1.4 — The curved-tile primitive + `_drawWheel` sunburst

**Files:** Modify `game/renderer.js` (the `_drawWheel` method + imports from `layout.js`).

- [ ] **Step 1 — Curved-tile primitive.** Add a helper that fills one donut-wedge tile + a centered label:

```js
_wheelTile(r0, r1, mid, half, fill, alpha, label, txtColor, outline) {
  const { ctx } = this, cx = RADIAL_CENTER_X, cy = RADIAL_CENTER_Y;
  ctx.beginPath(); ctx.arc(cx, cy, r1, mid - half, mid + half); ctx.arc(cx, cy, r0, mid + half, mid - half, true); ctx.closePath();
  ctx.globalAlpha = alpha; ctx.fillStyle = fill; ctx.fill(); ctx.globalAlpha = 1;
  if (outline) { ctx.lineWidth = outline.w; ctx.strokeStyle = outline.c; ctx.stroke(); }
  if (this.font && label) { const lr = (r0 + r1) / 2; this.font.drawText(ctx, label, cx + Math.cos(mid) * lr, cy + Math.sin(mid) * lr - 4, { color: txtColor, scale: 1, align: 'center' }); }
}
```

- [ ] **Step 2 — Rewrite `_drawWheel(game)` as the sunburst.** Draw order: dim wash → greyed decision rings →
  bright active ring → preview arc tiles → hub + MENU/breadcrumb label → pointer ▲. Use `decisionPath`,
  `activeRing`, `activeIndex`, `previewChildren`, `wheelRingR`. Structure:

```js
_drawWheel(game) {
  const w = game.wheel; if (!w) return;
  const { ctx } = this, TOP = -Math.PI/2, cx = RADIAL_CENTER_X, cy = RADIAL_CENTER_Y;
  if (w.aiming) { this._drawReticle(game); return; }      // AIM reuses the existing reticle (Phase 2 wires entry)
  ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0,0,CANVAS_PX,CANVAS_PX); ctx.restore();
  // greyed decision rings: one ring per locked depth (path[0..len-2]); the chosen tile at TOP, colour desaturated
  // bright active ring: activeRing(w) tiles, selection at TOP, full hue, outlined
  // preview arc: previewChildren(w) as curved tiles in [WHEEL_PREVIEW_R0,R1] across WHEEL_PREVIEW_SPAN centred on TOP,
  //   last-used child at TOP brighter, neighbours greyed; skip if the selection is a leaf (draw a small 'fire' cue)
  // hub: filled disc r=WHEEL_HUB_R, label = decisionPath(w).at(-1)  (root='MENU')
  // pointer: down-triangle at WHEEL_POINTER_R from cy, at TOP
}
```
   Colours: a `WHEEL_HUE` map keyed by the top-level category in the path (`fight:'#c8443a'`, `trick:'#caa23a'`,
   `treat:'#4f9b4a'`, `flight:'#3f78c4'`) carried down; greyed = same hue at `alpha≈0.26`. The exact wedge fills
   and label colours match the approved `show_widget` mock (`semicircle_preview_wheel`).

- [ ] **Step 3 — Remove the tape code** (the `SPACING/BW/BH` tape loop) and the SPELL-tape branch from the old
  `_drawWheel`; the SPELL ring is now just another sub-wheel (Magic's children), drawn by the same sunburst.

- [ ] **Step 4 — VERIFY (pixel probes).** Restart server, boot, `g._openWheel()`, then read the canvas:

```js
preview_eval: (() => { const g = window.__game; g._openWheel();
  const ctx = document.getElementById('game-canvas').getContext('2d');
  const px = (x,y) => { const d = ctx.getImageData(x,y,1,1).data; return `${d[0]},${d[1]},${d[2]}`; };
  return { hubCenter: px(304,304), activeTopTile: px(304, 304-60), preview: px(304, 304-140) }; })()
```
  Expect the hub area dark (MENU disc), the active top tile a category hue, the preview band a dimmed hue. Drive
  `drill` and re-probe (the rings should shift). Console must be clean. **Tune fills/radii against the mock.**

- [ ] **Step 5 — Commit:** `git commit -am "feat(renderer): radial sunburst wheel render (replaces the tape)"`

### Task 1.5 — Phase-1 verification sweep + merge

- [ ] **Step 1 — Walk every branch in-browser:** open the wheel, drill MENU→Fight→Melee→Hit and confirm `▲` fires
  `combatAttack` on an adjacent enemy (HP drops); MENU→Fight→Magic→Fireball casts; Trick/Treat/Flight reach their
  resolvers. Use the same drive-via-keydown + read-`g.playerX`/enemy-HP pattern from the combat-aiming verification.
- [ ] **Step 2 — Naming guard + console clean:** `git grep -inE 'violence[ _-]+town' -- ':!CLAUDE.md'` empty;
  `preview_console_logs` level error → none.
- [ ] **Step 3 — Commit, push, MERGE to dev** (`--no-ff`) per the project flow; leave the branch for review.
  (Per `[[feedback-branch-merge-control]]`, confirm the merge with Caelan unless pre-authorized.)

---

## PHASE 2 — Interaction + touch  (branch `feature/wheel-sunburst-2`)

Outcome: the sunburst reads as a **directional compass** (per the 2026-07-02 design amendment) and is fully
drivable on keyboard **and** touch; the AIM hand-off works.

> **Status note (2026-07-02):** the original Task 2.1 (keyboard `◄►`→`cycle`, `▲`→`drill`, `▼`→`back`) and Task 2.2
> (`_fireWheel` reads `compose(w,this).node`) **already shipped in Phase 1's branch** (`feature/wheel-sunburst-1`,
> commit "sunburst render + input rewiring to the node-tree model"). The keyboard is already the d-pad. So Phase 2's
> real remaining work is the **compass render** (making the wheel *look* like that d-pad) + **touch parity**.

- **Task 2.1 — Compass active-ring render + reserved Back tile.** In `renderer.js` `_drawWheel`, replace the
  full-ring draw for the **active** level with the 3-slot compass: **top (−π/2) = selected**, **left (π) = prev**
  (`cycle(-1)`), **right (0) = next** (`cycle(+1)`) — three curved tiles in the top hemisphere. Draw a distinct
  muted **BACK** tile in the **bottom quadrant (π/2)**, labelled `▼ BACK`, or `▼ CLOSE` when `w.path.length === 1`
  (root). Keep the hub label (`decisionPath` tip), the preview arc of the selected node's children, and the `▲`
  pointer. *Verify:* pixel-probe the top/left/right/bottom quadrants show the expected labels/hues.
- **Task 2.2 — Off-screen carousel indicator + greyed breadcrumb.** When `activeRing(w).length > 3`, draw a
  **carousel indicator** — a row of pips (one per ring option, the selected one filled) near the hub, or a
  `‹ n/N ›` cue — so off-screen options are hinted, not hidden. (≤ 3 options → no indicator.) Redraw the greyed
  **decision-stack** rings as an inward **breadcrumb** — each locked parent level shows just its chosen tile at the
  top, greyed — so it stays coherent with the compass. *Verify:* indicator pip-count equals `activeRing` length
  after drilling into `Trick` (5) vs `Melee` (3).
- **Task 2.3 — Touch parity: 4-quadrant `_tapRadialMenu`.** Replace the interim stub (hub=back, else=drill) with a
  quadrant hit-test on the active band (`wheelRingR(w.path.length - 1)`): **top slot → drill**, **left → `cycle(-1)`
  + render**, **right → `cycle(+1)` + render**, **bottom → `back`** (→ `_closeWheel` on `'close'`), **hub →
  back/close**. Keep the AIM/CONFIRM tap paths. Reuse `RADIAL_CENTER_*`, `WHEEL_HUB_R`, `wheelRingR`, `WHEEL_*`.
  *Verify:* dispatch `PointerEvent`s at each quadrant centre, assert the same `path`/state transitions as the keys.
- **Task 2.4 — Verify both inputs + console clean + naming guard + commit + push.** Per
  `[[feedback-branch-merge-control]]`, **push `feature/wheel-sunburst-2` and stop — Caelan makes the merge call.**

## PHASE 3 — Juice + reduce-motion  (branch `feature/wheel-sunburst-3`)

- **Task 3.1 — Open overshoot** (scale 0.85→1.05→1.0, ~180ms) + spin snap (eased rotation of the active ring to
  TOP, ~110ms) + `menu-tick`. Drive from `performance.now()` deltas stored on the wheel (mirror the retired
  `_wheelSlide` easing). *Verify:* eval the eased value mid-animation.
- **Task 3.2 — Drill/back transition** (active ring eases inward to greyed; preview arc expands into the new active
  ring) + **fire hit-pause** (2-3 frames) + `menu-confirm`.
- **Task 3.3 — Reduce-motion** (`Settings.get('reduceMotion')`): skip overshoot/rotation/transition (instant
  snaps), keep colour/border + audio. *Verify:* toggle the setting, confirm instant.
- **Task 3.4 — Verify + commit + merge.**

## PHASE 4 — Predictive highlight on hover + icons + colorblind  (branch `feature/wheel-sunburst-4`)

- **Task 4.1 — Hover predictive highlight.** When the selected node is a fixed-pattern ability (Cleave/Spin) or a
  spell, paint `affectedTiles` on the world *before* AIM (seed off the player's facing / nearest hostile). Reticle
  verbs preview at AIM (already do). *Verify:* hover Cleave, pixel-probe the arc tiles lit.
- **Task 4.2 — Wedge icons.** Render the Kenney icon (sword/crosshair/etc.) + label on each tile so colour isn't
  the sole cue. *Verify:* visual.
- **Task 4.3 — Colorblind presets + final placeholder polish.** Per-CVD palette presets in `settings.js`; ensure
  selected-at-top + label + icon carry meaning without colour; replace placeholder labels with a real "(empty)"
  treatment. *Verify:* swap presets, squint test.
- **Task 4.4 — Verify + commit + merge.**

---

## Self-review

- **Spec coverage:** sunburst render (1.4), greyed decision stack (1.4), arc-tile preview (1.4), deeper tree (1.1),
  cursor memory (1.2), placeholders (1.2), spin/drill/back/fire (2.1-2.2), touch (2.3), juice + reduce-motion (3.x),
  predictive highlight + icons + colorblind (4.x) — all mapped to tasks. ✓
- **No vague steps:** Phase 1 carries exact code (tree data, model fns, geometry, primitive, probe evals). Phases
  2-4 are concrete task outlines deliberately deferred to firm up against Phase 1's real implementation (a canvas
  overhaul is tuned in-browser) — NOT placeholders; each names files, the change, and a verify. ✓
- **Type/name consistency:** `selectedNode`/`activeRing`/`activeIndex`/`decisionPath`/`previewChildren`/`isLeaf`
  defined in 1.1, used consistently in 1.4/2.x. The render reads the node tree, not the old `leaf`/layer API. ✓
- **Risk:** the existing combat (flat Fight ring) is replaced — the shipped resolvers don't move, only the tree
  shape; Task 1.5 re-verifies every ability fires through the new path before merge. ✓
