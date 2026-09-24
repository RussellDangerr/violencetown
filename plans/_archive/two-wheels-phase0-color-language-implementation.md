# Two Wheels — Phase 0: Color Language + Flight-under-Trick (implementation plan)

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this task-by-task. Steps use `- [ ]` checkboxes.
> **Design spec (read first):** `plans/two-wheels-focus-state-and-color-language.md` (§5 the color language,
> §6 Player Wheel structure, §12 step 0).

**Goal:** Apply the synced **color language** to the existing Player Wheel and **nest Flight under gold
Trick** — a pure re-color + one re-nest on the compass you already shipped. No new UI, no new mechanics.

**Architecture:** Colors become **data on the verb-tree nodes** (`wheel-model.js ROOT`), and the renderer
paints each wedge from its node's own `color`/`text` instead of one blanket category hue. Flight moves
from a top-level category to a child of Trick — a tree-shape edit the compass already handles (it walks an
arbitrary tree). This is the palette-and-structure foundation every later phase (Target Wheel, dominant
slice, examine layering) builds on.

**Tech stack:** Vanilla JS ES modules · `<canvas>` 2D · no build step.

**Branch base:** stack on **`feature/wheel-sunburst-4`** (the compass render + wedge icons live there,
unmerged). Branch name: `feature/wheel-colors-p0`. If Caelan merges the `wheel-sunburst-2→3→4` stack to
`dev` first, re-base this onto `dev` instead — the edits are identical either way.

**VERIFICATION (no test runner — this replaces TDD):** start the dev server with `python dev-server.py 3001`
(or the `violencetown` launch config), navigate to `http://localhost:3001/index.html`, dismiss the splash
(`document.getElementById('splash-go').click()`), then drive `window.__game`. Read the canvas with
`canvas.getContext('2d').getImageData(x,y,1,1)` for **pixel probes** (the screenshot tool times out on the
live wheel). **Restart the dev server after any `.js` edit** — the `?dev` cache-bust token only rotates on
restart; a reload alone keeps stale modules. Canvas is 2× supersampled: multiply internal 608-space coords
by `canvas.width/608` before probing.

---

## File structure

| File | Responsibility | Change |
|---|---|---|
| `game/wheel-model.js` | Verb tree + nav (pure, no DOM) | Add `color`/`text` to category + Fight-sub nodes; move `flight` under `trick` |
| `game/renderer.js` | Canvas draw (`_drawWheel`) | Paint each wedge from `node.color`/`node.text`; update the fallback hue map |

Scope guard — what Phase 0 does **NOT** touch (later phases): the Target Wheel, the dominant-slice/flapper,
per-verb cross-wheel coloring (Throw amber *everywhere*, etc.), moving Trade/Give off the Player Wheel, and
the examine layering. Phase 0 is category colors + the Fight-method mix (Melee red / Magic purple / Ranged
amber) + Flight re-nested.

---

## Task 1: Colors on the verb tree + Flight under Trick

**Files:**
- Modify: `game/wheel-model.js` (the `ROOT` constant)

- [ ] **Step 1 — Add `color`/`text` to the three top-level categories and the Fight methods, and move
  `flight` to be Trick's last child.** Replace the whole `export const ROOT = {...};` block with the
  version below. The only changes from the current tree are: (a) `color`/`text` fields added, (b) the
  `flight` node relocated from a top-level entry to the end of `trick.children`. Every `key`, `label`,
  `resolver`, `aimType`, `available`, `needsItem`, `needsSpell`, and `spellId` is unchanged.

```js
export const ROOT = { key: 'menu', label: 'MENU', children: [
  { key: 'fight', label: 'Fight', color: '#c8443a', text: '#fff3d0', children: [
    { key: 'melee', label: 'Melee', color: '#c8443a', text: '#fff3d0', children: [
      { key: 'hit',    label: 'Hit',    aimType: 'adjacent', resolver: 'combatAttack', available: always },
      { key: 'cleave', label: 'Cleave', aimType: 'adjacent', resolver: 'cleaveAttack', available: always },
      { key: 'spin',   label: 'Spin',   aimType: 'none',     resolver: 'spinAttack',   available: always },
    ]},
    { key: 'ranged', label: 'Ranged', color: '#e08a2a', text: '#2a1400', needsItem: true, aimType: 'reticle', resolver: 'resolveThrow', available: always },
    { key: 'magic',  label: 'Magic',  color: '#8250c4', text: '#f0e6ff',
      available: (g) => (g.playerMp || 0) > 0 && ((g.knownSpells && g.knownSpells.length) || 0) > 0,
      children: [
        { key: 'fireball', label: 'Fireball', spellId: 'fireball', aimType: 'reticle', resolver: 'castSpell',
          available: (g) => (g.knownSpells || []).includes('fireball') && (g.playerMp || 0) >= (SPELLS.fireball ? SPELLS.fireball.mpCost : 0) },
        { key: 'coneofcold', label: 'Cone of Cold', spellId: 'coneOfCold', aimType: 'reticle', resolver: 'castSpell',
          available: (g) => (g.knownSpells || []).includes('coneOfCold') && (g.playerMp || 0) >= (SPELLS.coneOfCold ? SPELLS.coneOfCold.mpCost : 0) },
      ] },
  ]},
  { key: 'trick', label: 'Trick', color: '#cba43c', text: '#2a1f06', children: [
    { key: 'throw',  label: 'Throw',  needsItem: true,  aimType: 'reticle',  resolver: 'resolveThrow', available: always },
    { key: 'defend', label: 'Defend', aimType: 'none',                       resolver: 'guard',        available: always },
    { key: 'bribe',  label: 'Bribe',  aimType: 'adjacent',                   resolver: 'bribe',        available: always },
    { key: 'give',   label: 'Give',   needsItem: true,  aimType: 'adjacent', resolver: 'give',         available: always },
    { key: 'trade',  label: 'Trade',  aimType: 'adjacent',                   resolver: 'trade',        available: always },
    // Flight nests here now (spec §6): the situational/evasive limb of the gold Trick category.
    { key: 'flight', label: 'Flight', color: '#cba43c', text: '#2a1f06', children: [
      { key: 'run',  label: 'Run',  aimType: 'adjacent', resolver: 'run',  available: always },
      { key: 'hide', label: 'Hide', aimType: 'none',     resolver: 'hide', available: always },
      { key: 'wait', label: 'Wait', aimType: 'none',     resolver: 'wait', available: always },
    ]},
  ]},
  { key: 'treat', label: 'Treat', color: '#4f9b4a', text: '#effbe9', children: [
    { key: 'eat',     label: 'Eat',     needsItem: true, aimType: 'none', resolver: 'resolveUse', available: always },
    { key: 'cleanse', label: 'Cleanse', needsItem: true, aimType: 'none', resolver: 'resolveUse', available: always },
  ]},
]};
```

- [ ] **Step 2 — VERIFY the tree still walks (in-browser).** Restart the server, boot, then probe the
  structure and confirm firing still works through the moved Flight path:

```js
// preview_eval
(() => {
  const g = window.__game;
  const top = ROOT_KEYS(); // see below
  g._openWheel(); g.wheel.path=[0];
  const k = c => document.dispatchEvent(new KeyboardEvent('keydown',{code:c,bubbles:true}));
  // Top level is now 3 categories: fight/trick/treat
  const cats = window.__game && null; // placeholder — read via the model below
  return { note: 'use the probe in Step 3' };
})()
```

  (Real probe is Step 3 — Step 2 is just the server restart + boot.)

- [ ] **Step 3 — VERIFY top level = 3 categories and Flight lives under Trick.**

```js
// preview_eval
(() => {
  const g = window.__game;
  g._openWheel(); g.wheel.path=[0]; g.wheel.aiming=false;
  const k = c => document.dispatchEvent(new KeyboardEvent('keydown',{code:c,bubbles:true}));
  const out = {};
  // spin the top ring and read the three category labels under the pointer
  out.cat0 = g.wheel.path.slice();               // [0] = Fight
  k('ArrowRight'); out.cat1 = g.wheel.path.slice(); // [1] = Trick
  k('ArrowRight'); out.cat2 = g.wheel.path.slice(); // [2] = Treat
  k('ArrowRight'); out.wrap = g.wheel.path.slice(); // [0] again — proves exactly 3
  // drill Trick, spin to Flight (its last child), drill, fire Wait
  g.wheel.path=[1]; k('Space');                  // into Trick
  out.trickDepth = g.wheel.path.slice();         // [1,x]
  // Flight is the last Trick child (index 5); spin left one lands on it (wrap)
  k('ArrowLeft'); out.onFlight = g.wheel.path.slice();
  return out;
})()
```

  Expect `cat0/1/2` = `[0]/[1]/[2]` and `wrap` back to `[0]` (exactly three categories). Drilling Trick
  then `ArrowLeft` lands on Flight (the last child). **Fix until correct.**

- [ ] **Step 4 — Commit.**

```bash
git add game/wheel-model.js
git commit -m "feat(wheel): colour-language fields on nodes + Flight nested under gold Trick"
```

---

## Task 2: Paint each wedge from its node's colour

**Files:**
- Modify: `game/renderer.js` (`_drawWheel` — the fallback hue map, `drawSlot`, and the greyed breadcrumb)

- [ ] **Step 1 — Update the fallback hue map (Trick → gold).** In `_drawWheel`, find the `HUE` line:

```js
const HUE = ({ fight: '#c8443a', trick: '#3f78c4', treat: '#4f9b4a', flight: '#caa23a' })[catNode && catNode.key] || '#8a5a2c';
```

  Replace it with (Trick is gold now; Flight is no longer top-level so its entry is dropped; this map is
  now only a *fallback* for nodes without their own `color`):

```js
const HUE = (catNode && catNode.color) || ({ fight: '#c8443a', trick: '#cba43c', treat: '#4f9b4a' })[catNode && catNode.key] || '#8a5a2c';
```

- [ ] **Step 2 — `drawSlot` paints from `node.color`/`node.text`.** Find the `drawSlot` closure:

```js
        const drawSlot = (mid, node, isSel) => {
            const en = tileEnabled(node);
            this._wheelTile(activeBand[0], activeBand[1], mid, QHALF,
                isSel ? HUE : '#6b5436', en ? (isSel ? 1 : 0.82) : 0.4,
                node.placeholder ? '…' : node.label,
                !en ? '#7a6c50' : (isSel ? '#fff3d0' : '#e8dcc0'),
                isSel ? { w: 3, c: '#fff3c0' } : null,
                node.placeholder ? null : WHEEL_ICONS[node.key]);
        };
```

  Replace it with (each wedge uses its own `node.color`; non-selected wedges dim via alpha, so the ring
  reads as e.g. red/amber/purple under Fight; label/icon take `node.text` when the node defines one so
  dark-on-gold/amber stays legible):

```js
        const drawSlot = (mid, node, isSel) => {
            const en = tileEnabled(node);
            const col = node.color || HUE;
            const txt = !en ? '#7a6c50' : (node.text || (isSel ? '#fff3d0' : '#e8dcc0'));
            this._wheelTile(activeBand[0], activeBand[1], mid, QHALF,
                col, en ? (isSel ? 1 : 0.5) : 0.32,
                node.placeholder ? '…' : node.label,
                txt,
                isSel ? { w: 3, c: '#fff3c0' } : null,
                node.placeholder ? null : WHEEL_ICONS[node.key]);
        };
```

- [ ] **Step 3 — Greyed breadcrumb uses the locked node's colour.** Find the breadcrumb loop:

```js
        for (let d = 0; d < depth - 1; d++) {
            const r = ringAt(d), node = r.ring[r.sel], band = wheelRingR(d);
            this._wheelTile(band[0], band[1], TOP, QHALF, HUE, 0.3, node.label, '#9a8c70', null);
        }
```

  Replace `HUE` with the locked node's own colour so the trail reads in-palette:

```js
        for (let d = 0; d < depth - 1; d++) {
            const r = ringAt(d), node = r.ring[r.sel], band = wheelRingR(d);
            this._wheelTile(band[0], band[1], TOP, QHALF, node.color || HUE, 0.3, node.label, '#9a8c70', null);
        }
```

- [ ] **Step 4 — VERIFY the colours render (pixel probes).** Restart the server, boot, open the wheel at
  root, and probe the three category wedges + the Fight sub-wheel. Colours are checked by dominant channel
  (red > green,blue for Fight; ~equal-high r,g for gold Trick; green > r,b for Treat; blue-heavy purple
  for Magic; orange for Ranged).

```js
// preview_eval
(() => {
  const g = window.__game; g._openWheel(); g.wheel.path=[0]; g.wheel.aiming=false;
  g._overlayOpenedAt = performance.now()-9999; g.wheel._spinAt=0; g.wheel._drillAt=0; // at rest
  const cv = document.getElementById('game-canvas'), ctx = cv.getContext('2d'), S = cv.width/608;
  const px = (x,y)=>{const d=ctx.getImageData(Math.round(x*S),Math.round(y*S),1,1).data;return [d[0],d[1],d[2]];};
  const out = {};
  g._render();
  out.fight_top   = px(304, 244);     // selected Fight wedge fill → red (r>>g,b)
  // spin to Trick, probe top → gold (r,g high, b low)
  const k=c=>document.dispatchEvent(new KeyboardEvent('keydown',{code:c,bubbles:true}));
  k('ArrowRight'); g._overlayOpenedAt=performance.now()-9999; g.wheel._spinAt=0; g._render();
  out.trick_top   = px(304, 244);
  k('ArrowRight'); g._overlayOpenedAt=performance.now()-9999; g.wheel._spinAt=0; g._render();
  out.treat_top   = px(304, 244);     // green (g>r,b)
  // open Fight → probe the Magic + Ranged flanks for purple/amber
  g.wheel.path=[0,0]; g._overlayOpenedAt=performance.now()-9999; g.wheel._spinAt=0; g._render();
  out.melee_top   = px(304, 199);     // red
  out.magic_left  = px(199, 304);     // Magic (prev flank) → purple (b high)
  out.ranged_right= px(409, 304);     // Ranged (next flank) → amber (r high, g mid, b low)
  return out;
})()
```

  Expect `fight_top`/`melee_top` red-dominant, `trick_top` gold (high r+g, low b), `treat_top` green, and
  the Fight sub-wheel showing `magic_left` blue/purple-dominant and `ranged_right` orange. Probes may land
  on a glyph pixel rather than fill — if a value looks like cream text, nudge the probe radius outward
  (e.g. `px(304, 232)` for a fill sample). **Tune until each wedge reads its intended hue.**

- [ ] **Step 5 — VERIFY nothing regressed:** open the wheel, drill Fight→Melee→Hit and confirm `▲` still
  fires `combatAttack` on an adjacent enemy (HP drops); Trick→Flight→Wait passes a turn; console is clean
  (`preview_console_logs` level error → none).

- [ ] **Step 6 — Commit.**

```bash
git add game/renderer.js
git commit -m "feat(wheel): paint each wedge from its node colour (red/gold/green + Fight mix)"
```

---

## Task 3: Phase-0 sweep, naming guard, push

- [ ] **Step 1 — Full walk in-browser:** open the wheel; confirm the top ring reads **Fight (red) / Trick
  (gold) / Treat (green)**; open Fight and confirm **Melee red / Ranged amber / Magic purple**; open Trick
  and confirm Flight is a wedge inside it that drills to Run/Hide/Wait. Reduce-motion still snaps (toggle
  `opt-reduce-motion`, confirm no scale/spin). Touch parity intact (tap a quadrant cycles/drills/backs).
- [ ] **Step 2 — Naming guard:** `git grep -inE 'violence[ _-]+town' -- ':!CLAUDE.md' ':!*.md'` returns
  nothing.
- [ ] **Step 3 — Push and stop.** Push `feature/wheel-colors-p0`; **do not merge** — per
  `[[feedback-branch-merge-control]]`, Caelan makes the merge call.

```bash
git push -u origin feature/wheel-colors-p0
```

- [ ] **Step 4 — Report:** summarize what changed (top level now 3 categories in red/gold/green; Fight
  shows the colour-mix; Flight nested under Trick), flag that visual polish (exact hue nudges, dark-on-gold
  legibility) wants Caelan's eye since the screenshot tool times out on the live wheel, and note the branch
  base (stacked on `wheel-sunburst-4`).

---

## Self-review

- **Spec coverage (§5, §6, §12.0):** category colours (Task 2) ✓ · Fight-method mix Melee-red/Magic-purple/
  Ranged-amber (Task 1 node colours + Task 2 render) ✓ · Trick = gold (Task 1/2) ✓ · Flight nested under
  Trick (Task 1) ✓ · "evolution not rebuild" — only two files, tree-shape + colours, nav/resolvers/juice
  untouched ✓. Deliberately deferred (noted in the scope guard): Target Wheel, dominant slice, per-verb
  cross-wheel sync, examine layering — those are §12 steps 1–5, separate plans.
- **No placeholders:** every code step carries the full block; the verify steps carry real `preview_eval`
  probes. ✓
- **Type/name consistency:** `node.color` / `node.text` are introduced in Task 1 and read in Task 2 under
  those exact names; the fallback `HUE` remains a string; `WHEEL_ICONS`, `tileEnabled`, `activeBand`,
  `ringAt`, `wheelRingR` are all pre-existing and unchanged. ✓
- **Risk:** moving `flight` changes top-level indices (was `[3]`, gone; top level is now 3). A *saved*
  `lastFired` path from an old session could point at a stale index — harmless (it re-resolves or no-ops on
  the next open), but worth watching in Step 5's regression check.
