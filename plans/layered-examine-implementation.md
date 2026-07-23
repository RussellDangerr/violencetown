# Layered Examine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Examine never dead-end by routing both examine entry points through one resolution ladder (authored instance → creature → ground item → tile type → generic), reusing existing data — no new content authoring.

**Architecture:** A single pure function `resolveExamine(game, x, y)` in `game/examine.js` returns `{ title, body, instanceId, grantsInstance, tierName, tierColor }` for a tile. The E-key path (`doExamine`) and the Target List / pointer path (`main.js` `_fireResolver` `case 'examine'`) both call it, replacing two divergent inline implementations. Tile names come from a tiny prettifier over the `def.name` (the tile key) that `data.js` already stores.

**Tech Stack:** Vanilla ES-module HTML5 canvas game. No build step. Tests are `node --test` files in `tests/` importing `../game/*.js`; **there is no local Node — tests run in CI**, so "run the test" steps note the expected CI result and each task is also verified in-browser via `python dev-server.py 3001` + `window.__game`.

**Design doc:** `plans/layered-examine.md`.

**Branch:** `feature/layered-examine` off `dev` (default). ⚠️ The finished-but-unmerged `feature/xmb-usable-bar` also touches `main.js`, but in different functions (XMB bar / pickup vs. the examine verb), so auto-merge should be clean — see the branch note in the execution handoff.

---

## Ground truth (verified against the code)

- **Two examine entry points today:**
  - **E-key:** `main.js` `if (e.code === 'KeyE') { … doExamine(this); this._render(); }` → `examine.js` `doExamine(game)` (`examine.js:26`). Uses `findExaminable(game)` (faced-or-adjacent `game.examinables`), logs `text`, opens inspect, or dead-ends `[Nothing here worth examining.]`. Handles `target.grants` → `game._grantFromExaminable(target)` (the cape grate). Emits `emitGameEvent('examine', { targetId })`.
  - **Target List / pointer:** `main.js` `_fireResolver(verb, t)` `case 'examine'` (`main.js:2823-2843`). Already name-templates NPCs (`t.npc` → "Looks like trouble." / "Minding their own business.") and items (`t.item.def` → name + `itemTier(def).name` + `description`); has **no tile fallback**, dead-ends `[Nothing worth examining.]`. Emits the examine event only when `t.examinable`. Opens `_openInspect(...)`.
- **The car special-case** lives earlier, in `_actOnTarget` (`main.js:2777`): walk to the car's open side, then install the converter (if held) or examine. It is a quest interaction, keyed on `t.examinable.id === 'car'`, and is **not** touched by this change.
- **`game.examinables`** = `[{ id, x, y, text, grants? }]`, loaded per-map (`main.js:594`).
- **`game.enemies`** = `[{ entity, x, y, allegiance }]`; `entity.isAlive()`, `entity.name`. NPCs live here too (non-hostile entities). `isHostile(wrapper)` from `game/ai.js` tests allegiance.
- **`game.groundItems`** = `[{ x, y, type }]`; `type` is a key into `ITEMS` (`game/items.js`). `itemTier(def)` (`items.js:315`) → `{ name, color }`. Item defs carry `description`.
- **Tiles:** `game/data.js:56-59` builds `TILE_BY_ID` and sets `def.name = key` (the ALL-CAPS tile key, e.g. `SLUDGE`, `FACTORY_FLOOR`). `game.map.getTile(x, y)` (`map.js:127`) returns the tile id (or a sentinel out of bounds).
- **Inspect panel:** `game._openInspect({ title, body, tierName?, tierColor? })` (used at `main.js:2842`), rendered by `_drawInspectPanel` (§12.3, shipped).
- **No circular import risk:** `examine.js` will import from `items.js`, `data.js`, `ai.js`; none of those import `examine.js` (only `main.js` does).

---

## File Structure

**Modify:**
- `game/data.js` — add `tileDisplayName(id)` (prettifies the stored `def.name`).
- `game/examine.js` — add the pure `resolveExamine(game, x, y)`; rewrite `doExamine` to use it.
- `game/main.js` — import `resolveExamine`; replace the `_fireResolver` `case 'examine'` body with a call to it.

**Create:**
- `tests/examine.test.js` — `node --test` for `resolveExamine` (ladder priority + name-template fallbacks + never-dead-end).

---

## Task 1: The pure resolver + tile display names

**Files:**
- Modify: `game/data.js` (after the `TILE_BY_ID` loop, ~`data.js:59`)
- Modify: `game/examine.js` (add imports + `resolveExamine`)
- Test: `tests/examine.test.js` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/examine.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveExamine } from '../game/examine.js';
import { ITEMS } from '../game/items.js';

// Minimal stub game. map.getTile returns a fixed tile id; override per test.
const stubGame = (over = {}) => ({
  examinables: [], enemies: [], groundItems: [],
  playerX: 0, playerY: 0, facing: 'down',
  map: { getTile: () => 1 /* FLOOR */ },
  ...over,
});

const foe = (name, x, y, allegiance) => ({ x, y, allegiance, entity: { name, isAlive: () => true } });

test('rung 1: an authored instance wins and carries its id + grant', () => {
  const inst = { id: 'car', x: 2, y: 2, text: '[The car sits dead in the road.]', grants: 'red_cape' };
  const g = stubGame({ examinables: [inst], enemies: [foe('Wererat', 2, 2, 'hostile')] });
  const r = resolveExamine(g, 2, 2);
  assert.equal(r.instanceId, 'car');
  assert.equal(r.grantsInstance, inst);
  assert.match(r.body, /car sits dead/);
});

test('rung 2: a living creature name-templates, hostile vs peaceful', () => {
  const g1 = stubGame({ enemies: [foe('Wererat', 3, 3, 'hostile')] });
  const r1 = resolveExamine(g1, 3, 3);
  assert.match(r1.body, /It's a Wererat\. Looks like trouble\./);
  assert.equal(r1.instanceId, null);

  const g2 = stubGame({ enemies: [foe('Puck', 3, 3, 'neutral')] });
  assert.match(resolveExamine(g2, 3, 3).body, /It's a Puck\. Minding their own business\./);
});

test('rung 3: a ground item shows name + tier + description', () => {
  const g = stubGame({ groundItems: [{ x: 4, y: 4, type: 'rock' }] });
  const r = resolveExamine(g, 4, 4);
  assert.match(r.title, /Rock/);
  assert.ok(r.tierName, 'tier name present');
  assert.match(r.body, /Rock \(/);          // "[Rock (Common). ...]"
  assert.equal(r.instanceId, null);
});

test('rung 4: a bare tile uses the prettified tile name', () => {
  const g = stubGame({ map: { getTile: () => 2 /* SLUDGE */ } });
  const r = resolveExamine(g, 5, 5);
  assert.equal(r.body, '[Sludge.]');
  assert.equal(r.title, 'Sludge');
});

test('rung 4: multi-word tile keys prettify (FACTORY_FLOOR → Factory floor)', () => {
  const g = stubGame({ map: { getTile: () => 40 /* FACTORY_FLOOR */ } });
  assert.equal(resolveExamine(g, 0, 0).body, '[Factory floor.]');
});

test('priority: instance > creature > item > tile at the same tile', () => {
  const g = stubGame({
    examinables: [{ id: 'sign', x: 1, y: 1, text: '[A sign.]' }],
    enemies: [foe('Wererat', 1, 1, 'hostile')],
    groundItems: [{ x: 1, y: 1, type: 'rock' }],
    map: { getTile: () => 2 },
  });
  assert.equal(resolveExamine(g, 1, 1).instanceId, 'sign');
});

test('rung 5: truly nothing (no tile) still never dead-reads uglier than the generic', () => {
  const g = stubGame({ map: { getTile: () => null } });
  assert.equal(resolveExamine(g, 9, 9).body, '[Nothing here worth examining.]');
});
```

- [ ] **Step 2: Run to verify it fails**

Run (in CI / on a Node box): `node --test tests/examine.test.js`
Expected: FAIL — `resolveExamine` is not exported yet.

- [ ] **Step 3: Add `tileDisplayName` to `data.js`**

Insert immediately after the `TILE_BY_ID` loop (after `data.js:59`):

```js
// Human-readable tile name from the stored key (def.name, e.g. "FACTORY_FLOOR").
// Lowercase, "_"→space, drop a trailing "visual"/"vis" render-hint word, capitalize.
export function tileDisplayName(id) {
    const def = TILE_BY_ID[id];
    if (!def || !def.name) return 'ground';
    const words = String(def.name).toLowerCase().split('_').filter(w => w && w !== 'visual' && w !== 'vis');
    const s = words.join(' ');
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'ground';
}
```

- [ ] **Step 4: Add imports + `resolveExamine` to `examine.js`**

At the top of `game/examine.js`, extend the imports (currently only `import { manhattan } from './utils.js';`):

```js
import { manhattan } from './utils.js';
import { ITEMS, itemTier } from './items.js';
import { tileDisplayName } from './data.js';
import { isHostile } from './ai.js';
```

Then add `resolveExamine` (place it after `findExaminable`, before `doExamine`):

```js
// Resolve the most salient examinable thing at tile (x,y) into a display result.
// Ladder (first match wins): authored instance → living creature → ground item →
// tile type → generic. Returns:
//   { title, body, instanceId, grantsInstance, tierName, tierColor }
// - body:      the finished, bracketed line for the log AND the inspect panel.
// - title:     inspect-panel heading.
// - instanceId: set ONLY for an authored instance (rung 1) — the caller fires the
//               `examine` quest event only for these, matching prior behavior.
// - grantsInstance: the instance object IF it has a `grants` (caller runs the grant).
// - tierName/tierColor: set ONLY for a ground item (rung 3), for the inspect tier chip.
export function resolveExamine(game, x, y) {
    // 1. Authored instance at this exact tile.
    const inst = (game.examinables || []).find(e => e.x === x && e.y === y);
    if (inst) {
        return {
            title: String(inst.id).replace(/_/g, ' '),
            body: inst.text || `[You examine the ${inst.id}.]`,
            instanceId: inst.id,
            grantsInstance: inst.grants ? inst : null,
            tierName: null, tierColor: null,
        };
    }
    // 2. A living creature (enemy or NPC) standing here.
    const foe = (game.enemies || []).find(e => e.entity && e.entity.isAlive() && e.x === x && e.y === y);
    if (foe) {
        const name = foe.entity.name || foe.type || 'creature';
        const tail = foe.entity.examine || (isHostile(foe) ? 'Looks like trouble.' : 'Minding their own business.');
        return {
            title: name, body: `[It's a ${name}. ${tail}]`,
            instanceId: null, grantsInstance: null, tierName: null, tierColor: null,
        };
    }
    // 3. A ground item lying here.
    const gi = (game.groundItems || []).find(g => g.x === x && g.y === y);
    if (gi && ITEMS[gi.type]) {
        const def = ITEMS[gi.type];
        const tier = itemTier(def);
        const desc = def.description ? ` ${def.description}` : '';
        return {
            title: def.name || gi.type,
            body: `[${def.name || gi.type} (${tier.name}).${desc}]`,
            instanceId: null, grantsInstance: null,
            tierName: tier.name, tierColor: tier.color,
        };
    }
    // 4. The tile itself.
    const tid = game.map && typeof game.map.getTile === 'function' ? game.map.getTile(x, y) : null;
    if (tid != null) {
        const name = tileDisplayName(tid);
        return { title: name, body: `[${name}.]`, instanceId: null, grantsInstance: null, tierName: null, tierColor: null };
    }
    // 5. Truly nothing (out of bounds).
    return { title: 'Examine', body: '[Nothing here worth examining.]', instanceId: null, grantsInstance: null, tierName: null, tierColor: null };
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `node --test tests/examine.test.js`
Expected: PASS (all 7 tests).

- [ ] **Step 6: Commit**

```bash
git add game/data.js game/examine.js tests/examine.test.js
git commit -m "feat(examine): pure resolveExamine ladder + tile display names"
```

---

## Task 2: Route the Target List / pointer examine through the resolver

**Files:**
- Modify: `game/main.js` — the `./examine.js` import + `_fireResolver` `case 'examine'` (`main.js:2823-2843`)

- [ ] **Step 1: Import `resolveExamine` into main.js**

Change the existing import (currently `import { doExamine } from './examine.js';`):

```js
import { doExamine, resolveExamine } from './examine.js';
```

- [ ] **Step 2: Replace the `case 'examine'` body**

Replace the whole `case 'examine': { … }` block (`main.js:2823-2843`) with:

```js
            case 'examine': {
                // One ladder for every path (instance → creature → item → tile →
                // generic). Resolve at the instance's own tile when the target carries
                // one (multi-tile examinables like the car), else the target's tile.
                const ex = t.examinable;
                const res = resolveExamine(this, ex ? ex.x : t.x, ex ? ex.y : t.y);
                if (res.grantsInstance && this._grantFromExaminable) { this._grantFromExaminable(res.grantsInstance); break; }
                this._log(res.body);
                if (res.instanceId) this.emitGameEvent('examine', { targetId: res.instanceId });
                this._openInspect({ title: res.title, body: res.body, tierName: res.tierName, tierColor: res.tierColor });
                break;
            }
```

Note: `itemTier` may now be unused by `main.js` if this was its only use — leave the import if other code uses it; do NOT remove it unless `git grep -n "itemTier" game/main.js` shows zero remaining references.

- [ ] **Step 3: Verify in-browser**

Restart `python dev-server.py 3001`, load the game, and drive `window.__game`:

```js
// Examine an enemy, an item, a bare tile, and an instance — none should dead-end.
const g = window.__game;
// bare tile under the player:
g._fireResolver({ resolver: 'examine' }, { x: g.playerX, y: g.playerY });
g._logStripMessages.slice(-1);           // → a "[<Tile name>.]" line, not "[Nothing worth examining.]"
```

Place/target an enemy and a ground item near the player and repeat; confirm the log reads `It's a <name>.` and `<Item> (<tier>). <desc>` respectively, and that examining the car still shows its authored text. Expected: 0 console errors.

- [ ] **Step 4: Commit**

```bash
git add game/main.js
git commit -m "feat(examine): route the Target List examine through resolveExamine"
```

---

## Task 3: Route the E-key examine through the resolver

**Files:**
- Modify: `game/examine.js` — rewrite `doExamine` (`examine.js:26-45`)

- [ ] **Step 1: Rewrite `doExamine` to use the ladder**

Replace `doExamine` (`examine.js:26-45`) with:

```js
// Examine action. A free look (no turn cost). Examines a faced-or-adjacent authored
// instance (so multi-tile examinables like the 2x2 car resolve when you stand beside
// them); otherwise the faced tile. Always resolves to something via resolveExamine.
export function doExamine(game) {
    const inst = findExaminable(game);
    let x, y;
    if (inst) { x = inst.x; y = inst.y; }
    else {
        const fd = FACE[game.facing] || { dx: 0, dy: 0 };
        x = game.playerX + fd.dx;
        y = game.playerY + fd.dy;
    }
    const res = resolveExamine(game, x, y);
    // A granting instance (e.g. the Red Cape in a grate) does its own logging.
    if (res.grantsInstance && game._grantFromExaminable) return game._grantFromExaminable(res.grantsInstance);
    game._log(res.body);
    if (res.instanceId) game.emitGameEvent('examine', { targetId: res.instanceId });
    if (game._openInspect) game._openInspect({ title: res.title, body: res.body, tierName: res.tierName, tierColor: res.tierColor });
    return true;
}
```

(`findExaminable` and `FACE` already exist in `examine.js` and are unchanged.)

- [ ] **Step 2: Verify in-browser**

Restart the server. In the game, face a bare wall/floor and press **E** → the log reads the tile's name, not `[Nothing here worth examining.]`. Face an enemy and press **E** → `It's a <name>.`. Walk beside the car and press **E** → its authored text still shows; grab the Red Cape from the grate (examine it) → the grant still fires once. Console drive if needed:

```js
window.__game.facing = 'down';
doExamineProbe = () => { const g = window.__game; const m = g._logStripMessages.length; /* press E via */ document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyE',bubbles:true})); return g._logStripMessages.slice(-1); };
```

Expected: E never dead-ends; car/grate behavior preserved; 0 console errors.

- [ ] **Step 3: Commit**

```bash
git add game/examine.js
git commit -m "feat(examine): route the E-key examine through resolveExamine (no more dead-ends)"
```

- [ ] **Step 4: Integration smoke test (do not skip)**

Restart the server, load a fresh game AND a save. Confirm end-to-end: E-key and tap/Target-List examine both never dead-end across a bare tile, an enemy, a ground item, and an authored instance; the car install and the cape grate grant still work; a quest that reacts to `examine` (if any is active) still fires. 0 console errors before considering the feature done.

---

## Self-review (author checklist — completed)

- **Spec coverage:** the instance→creature→item→tile→generic ladder (Task 1) ✓; both entry points unified through it (Tasks 2, 3) ✓; items reuse `description` (rung 3) ✓; name-templated creatures/tiles, zero authoring (rungs 2, 4) ✓; tile names derived from `def.name` (Task 1, `tileDisplayName`) ✓; grant flow + `examine` quest event preserved (Tasks 1/3, `grantsInstance`/`instanceId`) ✓; car special-case untouched (Task 2 note) ✓; no `class` field, no dev viewer (absent by construction) ✓.
- **Type consistency:** `resolveExamine → { title, body, instanceId, grantsInstance, tierName, tierColor }` used identically in Tasks 2 and 3; `tileDisplayName(id)` signature matches its Task-1 call.
- **No placeholders:** every step has real code and exact commands.
- **Minor intentional change:** the inspect panel now shows the same bracketed `body` for items as the log (rather than the bare description it showed before) — uniform across all rungs; trivially adjustable in playtest if disliked.
- **Naming gate:** run `git grep -iE 'violence[ _-]+town'` before merge (must be zero excl. docs).
- **Import safety:** confirm the game still boots after Task 1 (examine.js now imports items.js/data.js/ai.js) — no circular import, verified by design, but the in-browser load is the proof.
