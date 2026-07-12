# Ring Builds — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the player a persisted *learned-skill pool* plus a capped *equipped loadout* (the "ring build"), so abilities come from base + gear + a player-chosen slotted subset — not from the equipped weapon alone.

**Architecture:** A new pure module `game/skills.js` holds the store operations (merge / learn / equip / suppress-read), unit-tested under node. `Game` (`main.js`) gains the four persisted fields + a transient suppression Set and delegates to `skills.js`; `_refreshGrantedSkills` changes from *clobber* to *source-merge* (`base ∪ equipped ∪ gear`). A single accessor pair `hasSpell`/`hasTrick` gates casting and folds in suppression. A "tome" consumable is the first learning source. The Remoticon GEAR tab gains a loadout list. Old saves (no fields) load as an empty pool ⇒ byte-identical to today.

**Tech Stack:** Vanilla ES modules, HTML5 canvas, `node --test` for pure modules. **No local Node** — pure-module + save tasks get node tests (run in CI); `Game`-wiring / UI tasks verify in-browser via `python dev-server.py 3001` + `window.__game`.

**Spec:** `plans/ring-builds-ability-axis.md` (approved 2026-07-11). This plan implements its Gate 3/4 sequencing.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `game/skills.js` | **Create** | Pure store ops: `SKILL_SLOTS`, `mergeKnown`, `isActive`, `learnInto`, `equipSkill`, `unequipSkill`, `sanitizeEquipped`. No game/DOM deps. |
| `tests/skills.test.js` | **Create** | Node unit tests for `skills.js`. |
| `game/main.js` | Modify | Ctor fields; `_refreshGrantedSkills` merge; `hasSpell`/`hasTrick`; `_learnSkill`/`_equipSkill`/`_unequipSkill`; trick-cast gate; GEAR-tab tap routing. |
| `game/items.js` | Modify | `tome_ray_blast` def + `resolveLearn` + `case 'learn'` in `resolveUse`. |
| `game/save.js` | Modify | Four-touch (serialize / migrate / validate / loadInto) for the four skill fields. |
| `tests/save-roundtrip.test.js` | Modify | Extend the fake game + assert the pool/loadout round-trips. |
| `game/layout.js` | Modify | `gearEquipRect` (shrunk equipment region) + `gearSkillsLayout` (chip rects). |
| `game/renderer.js` | Modify | Draw the loadout strip in the GEAR body's lower region. |
| `game/wheel-model.js` | Modify (Task 5 only) | Leaf `available` predicates read `hasSpell`/`hasTrick` (fallback-guarded) so suppressed skills grey. |

`game/weapons.js` is **unchanged** — it stays the extrinsic (gear) grant source that merges in.

---

## Sequencing

All on one branch `feature/ring-builds` off `dev` (project rule: develop on `dev`; Caelan makes the merge-to-`dev` call). Order builds the tested core first, then wires it in behavior-preservingly, then adds the new source, UI, and suppression.

1. **Task 1** — pure `skills.js` + node tests (no game touch; lowest risk).
2. **Task 2** — wire the store into `Game` (empty pool ⇒ identical to today).
3. **Task 3** — `_learnSkill` + tome source + save four-touch (the first real behavior).
4. **Task 4** — GEAR-tab loadout UI (**one open sub-decision — see the task; confirm with Caelan first**).
5. **Task 5** — NH-2 suppression greying + finish.

Re-run `node --test` after Tasks 1 and 3; in-browser smoke after 2, 4, 5; full smoke before considering the branch done ("a merge is done when the game RUNS").

> Line numbers are from verification on `dev` @ `746f5cd` (2026-07-12). They drift as edits land — re-grep the named symbol before each edit.

---

## Task 1: Pure store module `game/skills.js`

**Files:**
- Create: `game/skills.js`
- Test: `tests/skills.test.js`

**Why a separate module:** `Game` (`main.js`) touches `document` at load and can't be constructed under node, so its methods aren't unit-testable directly. The store logic lives here as pure functions (mirrors the `ai.js` / `pathing.js` / `buffs.js` extractions) and `Game` delegates. This is the only node-testable seam for the merge/learn logic.

- [ ] **Step 1: Write the failing tests**

Create `tests/skills.test.js`:

```js
// skills.test.js — the pure store ops behind the ring-builds ability axis.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    SKILL_SLOTS, mergeKnown, isActive, learnInto,
    equipSkill, unequipSkill, sanitizeEquipped,
} from '../game/skills.js';

describe('mergeKnown', () => {
    test('unions base, equipped, and gear with no dupes, base first', () => {
        assert.deepEqual(mergeKnown(['a', 'b'], ['b', 'c'], ['c', 'd']), ['a', 'b', 'c', 'd']);
    });
    test('empty equipped + gear returns the base unchanged', () => {
        assert.deepEqual(mergeKnown(['a', 'b'], [], []), ['a', 'b']);
    });
});

describe('isActive', () => {
    test('true when present and not suppressed', () => {
        assert.equal(isActive(['a', 'b'], new Set(), 'a'), true);
    });
    test('false when suppressed', () => {
        assert.equal(isActive(['a', 'b'], new Set(['a']), 'a'), false);
    });
    test('false when absent', () => {
        assert.equal(isActive(['a'], new Set(), 'z'), false);
    });
});

describe('learnInto', () => {
    test('adds to pool and auto-equips when a slot is free', () => {
        const pool = new Set(), eq = [];
        assert.equal(learnInto(pool, eq, 6, 'x'), true);
        assert.equal(pool.has('x'), true);
        assert.deepEqual(eq, ['x']);
    });
    test('learns but does NOT auto-equip when the loadout is full', () => {
        const pool = new Set(['a', 'b']), eq = ['a', 'b'];
        assert.equal(learnInto(pool, eq, 2, 'c'), true);
        assert.equal(pool.has('c'), true);
        assert.deepEqual(eq, ['a', 'b']); // no room — stays in the pool only
    });
    test('is idempotent — re-learning returns false and does not duplicate', () => {
        const pool = new Set(['a']), eq = ['a'];
        assert.equal(learnInto(pool, eq, 6, 'a'), false);
        assert.deepEqual([...pool], ['a']);
        assert.deepEqual(eq, ['a']);
    });
});

describe('equipSkill / unequipSkill', () => {
    test('equipSkill slots a learned, unslotted skill when room', () => {
        const pool = new Set(['a', 'b']), eq = ['a'];
        assert.equal(equipSkill(pool, eq, 6, 'b'), true);
        assert.deepEqual(eq, ['a', 'b']);
    });
    test('equipSkill refuses when unlearned, already slotted, or full', () => {
        assert.equal(equipSkill(new Set(['a']), ['a'], 6, 'z'), false); // unlearned
        assert.equal(equipSkill(new Set(['a']), ['a'], 6, 'a'), false); // already slotted
        assert.equal(equipSkill(new Set(['a', 'b']), ['a'], 1, 'b'), false); // full
    });
    test('unequipSkill removes from the loadout, returns false if absent', () => {
        const eq = ['a', 'b'];
        assert.equal(unequipSkill(eq, 'a'), true);
        assert.deepEqual(eq, ['b']);
        assert.equal(unequipSkill(eq, 'z'), false);
    });
});

describe('sanitizeEquipped', () => {
    test('keeps only learned ids, drops dupes, clamps to capacity', () => {
        assert.deepEqual(sanitizeEquipped(['a', 'b', 'c'], ['a', 'a', 'z', 'b', 'c'], 2), ['a', 'b']);
    });
    test('empty in, empty out', () => {
        assert.deepEqual(sanitizeEquipped([], [], 6), []);
    });
});

describe('SKILL_SLOTS', () => {
    test('exposes generous fixed capacities', () => {
        assert.equal(SKILL_SLOTS.trick, 6);
        assert.equal(SKILL_SLOTS.spell, 6);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/skills.test.js`
Expected: FAIL — `Cannot find module '../game/skills.js'`.

- [ ] **Step 3: Write `game/skills.js`**

```js
// skills.js — the pure store operations behind the ring-builds ability axis.
//
// Game (main.js) is browser-coupled and can't be constructed under node; this
// module holds the learn / equip / merge / suppress-read logic as pure
// functions so it's unit-testable in isolation (mirrors ai.js / pathing.js /
// buffs.js). Game's _refreshGrantedSkills / hasSpell / hasTrick / _learnSkill /
// _equipSkill / _unequipSkill delegate here.

// Generous, fixed loadout capacity per ring (tune toward the wheel's leaf room).
export const SKILL_SLOTS = { trick: 6, spell: 6 };

// The active list for a ring = base ∪ equipped ∪ gear-granted, de-duped, order
// stable (base, then equipped, then gear). Suppression is applied at READ
// (isActive), never here — so unsuppressing restores a skill by construction.
export function mergeKnown(base, equipped, granted) {
    return [...new Set([...base, ...equipped, ...granted])];
}

// A skill can fire iff it's in the merged list AND not currently suppressed
// (NH-2 `blocked`). `suppressed` is a Set.
export function isActive(list, suppressed, id) {
    return list.includes(id) && !suppressed.has(id);
}

// Add id to the learned pool (idempotent). If a loadout slot is free, auto-equip
// it — a newly learned skill is usable immediately (generous; buffs-feel-given).
// Returns true if newly learned, false if already in the pool.
export function learnInto(pool, equipped, cap, id) {
    if (pool.has(id)) return false;
    pool.add(id);
    if (equipped.length < cap && !equipped.includes(id)) equipped.push(id);
    return true;
}

// Slot a learned skill into the loadout. No-op (returns false) if unlearned,
// already slotted, or the loadout is full.
export function equipSkill(pool, equipped, cap, id) {
    if (!pool.has(id) || equipped.includes(id) || equipped.length >= cap) return false;
    equipped.push(id);
    return true;
}

// Remove a skill from the loadout (it stays in the pool). Returns true if changed.
export function unequipSkill(equipped, id) {
    const i = equipped.indexOf(id);
    if (i < 0) return false;
    equipped.splice(i, 1);
    return true;
}

// Sanitize a persisted loadout with no live Game (used by save.validate): keep
// only ids present in the pool, drop dupes, clamp to capacity.
export function sanitizeEquipped(learnedArr, equippedArr, cap) {
    const pool = new Set(learnedArr);
    const seen = new Set();
    const out = [];
    for (const id of equippedArr) {
        if (pool.has(id) && !seen.has(id)) { seen.add(id); out.push(id); }
        if (out.length >= cap) break;
    }
    return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/skills.test.js`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add game/skills.js tests/skills.test.js
git commit -m "feat(skills): pure store module for the ring-builds ability axis"
```

---

## Task 2: Wire the store into `Game` (behavior-preserving)

**Files:**
- Modify: `game/main.js` (ctor ~157; `_refreshGrantedSkills` ~3645; trick-cast gate ~2971; new accessors)

**Invariant:** with an empty pool + empty loadout (fresh game, old save), the merged lists equal today's `[...BASE_SPELLS, ...gear]` / `[...gear]` exactly. No behavior changes yet.

- [ ] **Step 1: Import the pure module**

At the top of `main.js`, near the other `./` imports (the `import { isHostile } from './ai.js';`-style block), add:

```js
import { SKILL_SLOTS, mergeKnown, isActive, learnInto, equipSkill, unequipSkill } from './skills.js';
```

- [ ] **Step 2: Add the store fields to the constructor**

In the ctor, immediately after `this.grantedTricks = [];` (currently `main.js:158`), insert:

```js
// Ring-builds ability axis (learned POOL + capped EQUIPPED subset — the loadout
// IS the build). The pools are append-only and persisted; the loadouts are the
// player's choice and persisted. suppressedSkills is transient (NH-2 `blocked`),
// never saved. _refreshGrantedSkills merges these into knownSpells/grantedTricks.
this.learnedTricks    = new Set();
this.learnedSpells    = new Set();
this.equippedTricks   = [];
this.equippedSpells   = [];
this.suppressedSkills = new Set();
```

- [ ] **Step 3: Change `_refreshGrantedSkills` from clobber to merge**

Replace the body of `_refreshGrantedSkills` (currently `main.js:3645-3651`):

```js
_refreshGrantedSkills() {
    const w = this.equipment && this.equipment.weapon;
    const gs = (w && w.grantsSpells) || [];
    const gt = (w && w.grantsTricks) || [];
    this.knownSpells   = mergeKnown(BASE_SPELLS, this.equippedSpells, gs);
    this.grantedTricks = mergeKnown([], this.equippedTricks, gt);
}
```

Update the comment above it (`main.js:3637-3644`) so `knownSpells = base + equipped + weapon.grantsSpells` and `grantedTricks = equipped + weapon.grantsTricks`.

- [ ] **Step 4: Add the accessor pair**

Directly below `_refreshGrantedSkills`, add:

```js
// The single gate for "can this skill fire right now" — present in the merged
// list AND not suppressed. Cast paths and (Task 5) the wheel route through these.
hasSpell(id) { return isActive(this.knownSpells   || [], this.suppressedSkills, id); }
hasTrick(id) { return isActive(this.grantedTricks || [], this.suppressedSkills, id); }
```

- [ ] **Step 5: Repoint the trick-cast gate**

At `main.js:2971`, replace:

```js
if (!(this.grantedTricks || []).includes(node.trickId)) { this._log("[You don't have that trick.]"); break; }
```

with:

```js
if (!this.hasTrick(node.trickId)) { this._log("[You don't have that trick.]"); break; }
```

(The spell path at `main.js:2954-2965` has no explicit "do you know it" gate — the wheel `available` predicate gates it, addressed in Task 5. Leave it for now.)

- [ ] **Step 6: Verify in-browser (no node for `Game`)**

Restart the dev server (fresh ES modules): `python dev-server.py 3001`. Load the game. In the console:

```js
const g = window.__game;
// Empty pool ⇒ identical to today:
JSON.stringify(g.knownSpells);            // ['fireball','coneOfCold']
JSON.stringify(g.grantedTricks);          // []  (wooden_sword grants none)
g.hasSpell('fireball');                   // true
g.hasTrick('ray_blast');                  // false
// Gear still merges in:
g.equipment.weapon = g._resolveItemDef('ray_gun'); g._refreshGrantedSkills();
g.grantedTricks.includes('ray_blast');    // true
g.hasTrick('ray_blast');                  // true
```

Expected: matches the comments; console clean. Confirm the FIGHT wheel still shows Fireball/Cone and (with the Ray Gun) Ray Blast, and casting each still works.

- [ ] **Step 7: Commit**

```bash
git add game/main.js
git commit -m "feat(skills): merge equipped-skill loadout into Game grants (empty pool = no-op)"
```

---

## Task 3: Learn path + tome source + save four-touch

**Files:**
- Modify: `game/main.js` (add `_learnSkill` / `_equipSkill` / `_unequipSkill` near `_refreshGrantedSkills`)
- Modify: `game/items.js` (`tome_ray_blast` def; `resolveLearn`; `case 'learn'`)
- Modify: `game/save.js` (serialize ~59; migrate ~144; validate ~157; loadInto ~226)
- Modify: `tests/save-roundtrip.test.js`

- [ ] **Step 1: Add the learn / equip / unequip methods to `Game`**

Below the `hasSpell`/`hasTrick` accessors (from Task 2), add:

```js
// Learn a skill into the pool from any source (tome now; trainers/quests later).
// Auto-slots if there's room (generous). Idempotent — returns true if newly
// learned. type: 'trick' | 'spell'.
_learnSkill(id, type) {
    const pool     = type === 'trick' ? this.learnedTricks  : this.learnedSpells;
    const equipped = type === 'trick' ? this.equippedTricks : this.equippedSpells;
    const learned  = learnInto(pool, equipped, SKILL_SLOTS[type], id);
    this._refreshGrantedSkills();
    if (learned) {
        const def = type === 'trick' ? TRICKS[id] : SPELLS[id];
        this._log(`[Learned ${(def && def.name) || id}!]`, 'transition');
    }
    return learned;
}

// Slot / unslot a learned skill (the GEAR-tab loadout, Task 4). Both refresh the
// merged grants so the wheel updates immediately.
_equipSkill(id, type) {
    const pool     = type === 'trick' ? this.learnedTricks  : this.learnedSpells;
    const equipped = type === 'trick' ? this.equippedTricks : this.equippedSpells;
    if (equipSkill(pool, equipped, SKILL_SLOTS[type], id)) this._refreshGrantedSkills();
}
_unequipSkill(id, type) {
    const equipped = type === 'trick' ? this.equippedTricks : this.equippedSpells;
    if (unequipSkill(equipped, id)) this._refreshGrantedSkills();
}
```

(`SPELLS` and `TRICKS` are already imported in `main.js` — used at `2957` / `2972`.)

- [ ] **Step 2: Add the tome item + `resolveLearn` + the `resolveUse` case**

In `game/items.js`, add a tome entry to the `ITEMS` map (after the existing consumables — model on the `soap` entry's shape):

```js
    tome_ray_blast: {
        id: 'tome_ray_blast',
        name: '[Tome of Ray Blast]',
        description: 'A scorched schematic. Study it and the Ray Blast trick is yours — no gun required.',
        useType: 'learn',
        learns: 'ray_blast',
        learnType: 'trick',
        equipSlot: 'back',
        consumable: true,
        fallbackColor: '#c8a24a',
        baseValue: 30,
    },
```

Add the resolver (near `resolveSelfUse`, `game/items.js`):

```js
// Learning source (tomes now; trainers/quests reuse the same hook). The item is
// consumed by the caller (main.js: `if (item.consumable) _removeFromSlot`), so a
// tome for a skill you already know crumbles anyway — learning is idempotent.
function resolveLearn(game, itemDef) {
    if (!itemDef.learns || !game._learnSkill) return `[Used ${itemDef.name}]`;
    const learned = game._learnSkill(itemDef.learns, itemDef.learnType || 'spell');
    return learned ? null : '[You already knew that — the tome crumbles.]';
}
```

Wire it into `resolveUse` (`game/items.js:389`), adding a case before `default`:

```js
        case 'learn':
            return resolveLearn(game, itemDef);
```

(`_learnSkill` logs its own `[Learned …]` line, so `resolveLearn` returns `null` on success — the caller only logs a non-null message.)

- [ ] **Step 3: Serialize the four fields**

In `save.js` `serialize()`, inside the `player: { … }` object (after `carFuel: game.carFuel,` ~`save.js:65`), add:

```js
            learnedTricks:  [...(game.learnedTricks  || [])],
            learnedSpells:  [...(game.learnedSpells  || [])],
            equippedTricks: [...(game.equippedTricks || [])],
            equippedSpells: [...(game.equippedSpells || [])],
```

- [ ] **Step 4: Default + sanitize on migrate/validate**

Add the import to `save.js` (near `import { INVENTORY_SIZE } from './data.js';`, `save.js:16`):

```js
import { SKILL_SLOTS, sanitizeEquipped } from './skills.js';
```

In `validate()` (`save.js:157`), after the `tempEquips` guard (`save.js:184`), add:

```js
    // Ring-builds: coerce to string arrays; equipped ⊆ learned, clamped to cap.
    const asIds = (a) => (Array.isArray(a) ? a.filter(id => typeof id === 'string') : []);
    p.learnedTricks  = asIds(p.learnedTricks);
    p.learnedSpells  = asIds(p.learnedSpells);
    p.equippedTricks = sanitizeEquipped(p.learnedTricks, asIds(p.equippedTricks), SKILL_SLOTS.trick);
    p.equippedSpells = sanitizeEquipped(p.learnedSpells, asIds(p.equippedSpells), SKILL_SLOTS.spell);
```

(No `migrate()` change needed — `migrate` already guarantees `r.player` is an object; absent arrays become `[]` in `validate` via `asIds`.)

- [ ] **Step 5: Restore into the live game (before the merge)**

In `loadInto()` (`save.js`), replace the block at `save.js:226-229` (the equipment rehydrate + the `knownSpells/grantedTricks aren't persisted` comment + the `_refreshGrantedSkills()` call) so the pools/loadouts are restored *before* the refresh:

```js
    // Ring-builds: restore the learned pool + equipped loadout BEFORE refreshing
    // grants, so the merge (base ∪ equipped ∪ gear) includes the slotted skills.
    game.learnedTricks  = new Set(p.learnedTricks  || []);
    game.learnedSpells  = new Set(p.learnedSpells  || []);
    game.equippedTricks = [...(p.equippedTricks || [])];
    game.equippedSpells = [...(p.equippedSpells || [])];
    // knownSpells/grantedTricks are derived, not stored — rebuild from the
    // restored weapon + loadout (the Ray Gun grants Ray Blast, etc.).
    if (game._refreshGrantedSkills) game._refreshGrantedSkills();
```

- [ ] **Step 6: Extend the save round-trip test**

In `tests/save-roundtrip.test.js`, extend the fake game so it carries the four fields (add to wherever the fake game object is built — give it `learnedTricks: new Set(['ray_blast'])`, `learnedSpells: new Set()`, `equippedTricks: ['ray_blast']`, `equippedSpells: []`, and a no-op `_refreshGrantedSkills() {}` if it lacks one). Then add a test:

```js
test('ring-builds pool + loadout survive a save round-trip', () => {
    installGlobals();
    const g = makeFakeGame();               // the helper this file already uses
    g.learnedTricks  = new Set(['ray_blast']);
    g.equippedTricks = ['ray_blast'];
    const blob = serialize(g);
    const g2 = makeFakeGame();
    loadIntoReal(g2, blob);                  // migrate/validate/loadInto
    assert.deepEqual([...g2.learnedTricks], ['ray_blast']);
    assert.deepEqual(g2.equippedTricks, ['ray_blast']);
});

test('old save (no skill fields) loads as an empty pool without throwing', () => {
    installGlobals();
    const g = makeFakeGame();
    const blob = serialize(g);
    delete blob.player.learnedTricks;
    delete blob.player.equippedTricks;
    delete blob.player.learnedSpells;
    delete blob.player.equippedSpells;
    const g2 = makeFakeGame();
    loadIntoReal(g2, blob);
    assert.deepEqual([...g2.learnedTricks], []);
    assert.deepEqual(g2.equippedTricks, []);
});
```

> If the test file constructs its fake game inline rather than via a `makeFakeGame()` helper, adapt: build the same fake with the four fields and a no-op `_refreshGrantedSkills`. Match the file's existing style — read it first.

- [ ] **Step 7: Run the save tests**

Run: `node --test tests/save-roundtrip.test.js`
Expected: PASS, including the two new tests.

- [ ] **Step 8: Verify the learn loop in-browser**

Restart the dev server. Load the game. Console:

```js
const g = window.__game;
g.grantedTricks.includes('ray_blast');    // false (wooden sword, empty pool)
g._learnSkill('ray_blast', 'trick');      // logs "[Learned Ray Blast!]", returns true
g.learnedTricks.has('ray_blast');         // true
g.equippedTricks;                         // ['ray_blast']  (auto-slotted)
g.hasTrick('ray_blast');                  // true — WITHOUT the Ray Gun equipped
```

Open the FIGHT wheel → the Trick ring shows **Ray Blast** → cast it → it spends GP and fires. Then `saveGame`/reload (however the game exposes save) and confirm `g.learnedTricks`/`g.equippedTricks` survive. Console clean.

- [ ] **Step 9: Commit**

```bash
git add game/main.js game/items.js game/save.js tests/save-roundtrip.test.js
git commit -m "feat(skills): tome learning source + save round-trip for the pool/loadout"
```

---

## Task 4: GEAR-tab loadout UI

> **OPEN SUB-DECISION — confirm with Caelan before building this task.** The spec chose the **GEAR tab** as the loadout surface, with a noted fallback: "If GEAR gets visually crowded, a new SKILLS tab — implementation call." Verification shows the GEAR body is *fully* occupied by the scaled equipment figure (`deviceEquipLayout` maps the whole `EQUIPMENT_MODAL_RECT` into the body). This task implements the **GEAR-embed** approach (shrink the figure to the upper ~60%, loadout strip in the lower ~40%). If Caelan prefers to keep the equipment dress-up full-size, switch to a **5th `'skills'` tab** in `DEVICE_TABS` (same draw-body + `_tapDevice` pattern) — a small, well-bounded change. **Ask before writing.**

**Files:**
- Modify: `game/layout.js` (`gearEquipRect`, `gearSkillsLayout`)
- Modify: `game/renderer.js` (draw the loadout strip)
- Modify: `game/main.js` (`_tapDevice` gear branch)

- [ ] **Step 1: Add the GEAR sub-layout helpers**

In `game/layout.js`, after `deviceEquipLayout` (`layout.js:196`), add:

```js
// (Ring builds) Split the GEAR body: the equipment figure gets the top region,
// the skill loadout strip the bottom. deviceEquipLayout is fed gearEquipRect so
// draw + hit-test stay in sync (both call it — never pass the raw bodyRect).
export function gearEquipRect(bodyRect) {
    return { x: bodyRect.x, y: bodyRect.y, w: bodyRect.w, h: Math.round(bodyRect.h * 0.60) };
}

// Chip rects for the learned loadout, two rows (tricks then spells). Each chip
// carries { id, type, slotted } so the renderer styles it and _tapDevice toggles
// it. `game` supplies the pools + loadouts. Rows wrap within the strip width.
export function gearSkillsLayout(bodyRect, game) {
    const top = bodyRect.y + Math.round(bodyRect.h * 0.62);
    const rowH = 30, chipH = 24, chipW = 92, gap = 8, x0 = bodyRect.x + 4;
    const rows = [
        { type: 'trick', pool: [...(game.learnedTricks || [])], eq: game.equippedTricks || [] },
        { type: 'spell', pool: [...(game.learnedSpells || [])], eq: game.equippedSpells || [] },
    ];
    const chips = [];
    rows.forEach((row, ri) => {
        const y = top + ri * (rowH + chipH + 6);
        row.pool.forEach((id, ci) => {
            chips.push({
                id, type: row.type,
                slotted: row.eq.includes(id),
                x: x0 + ci * (chipW + gap),
                y: y + rowH - chipH,
                w: chipW, h: chipH,
            });
        });
    });
    return { rows, chips, rowLabelY: (ri) => top + ri * (rowH + chipH + 6) };
}
```

- [ ] **Step 2: Draw the loadout strip in the GEAR body**

Find where the GEAR tab renders the equipment figure in `renderer.js` (the code that calls `deviceEquipLayout(deviceBodyRect())` for the `'gear'` tab — grep `deviceEquipLayout` in `renderer.js`). Change it to pass `gearEquipRect(deviceBodyRect())` instead of the raw body, then, after the figure draws, render the strip. Add the imports `gearEquipRect, gearSkillsLayout` to renderer's `layout.js` import, and:

```js
// (Ring builds) loadout strip beneath the (shrunk) equipment figure.
const body = deviceBodyRect();
const sk = gearSkillsLayout(body, this.game);
['tricks', 'spells'].forEach((label, ri) => {
    const n = sk.rows[ri].eq.length;
    this.font.drawText(ctx, `${label.toUpperCase()}  ${n}/${SKILL_SLOTS[sk.rows[ri].type]}`,
        body.x + 4, sk.rowLabelY(ri), { color: '#cfc7b0' });
});
for (const c of sk.chips) {
    ctx.fillStyle = c.slotted ? '#3b5b3b' : '#2a2a2a';
    ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.strokeStyle = c.slotted ? '#7fe07f' : '#666';
    ctx.strokeRect(c.x + 0.5, c.y + 0.5, c.w - 1, c.h - 1);
    const def = c.type === 'trick' ? TRICKS[c.id] : SPELLS[c.id];
    this.font.drawText(ctx, (def && def.name ? def.name : c.id).replace(/[\[\]]/g, ''),
        c.x + 5, c.y + 7, { color: c.slotted ? '#eaffea' : '#aaa', max: c.w - 10 });
}
if (!sk.chips.length) {
    this.font.drawText(ctx, 'No skills learned yet.', body.x + 4, sk.rowLabelY(0) + 4, { color: '#8a8570' });
}
```

Import `SKILL_SLOTS` (from `./skills.js`) and confirm `SPELLS`/`TRICKS` are imported in `renderer.js`; add them if not (they define the chip labels). Match renderer's existing `this.font.drawText(...)` option names (grep an existing call — `color`/`max` may be named differently; adapt).

- [ ] **Step 3: Route GEAR-body taps**

In `main.js` `_tapDevice` (`main.js:4237-4248`), the `'gear'` branch: change the equipment hit-test to read `gearEquipRect(deviceBodyRect())` (so it matches the shrunk draw), then add the skill-chip hit-test. Add `gearEquipRect, gearSkillsLayout` to the `layout.js` import (`main.js:33`). New branch:

```js
        if (this._deviceTab === 'gear') {
            const body = deviceBodyRect();
            // Skill chips first (they sit in the lower strip).
            const sk = gearSkillsLayout(body, this);
            for (const c of sk.chips) {
                if (!this._pointInRect(pt, c)) continue;
                if (c.slotted) this._unequipSkill(c.id, c.type);
                else           this._equipSkill(c.id, c.type);
                audio.playSfx('menu-tick');
                this._render();
                return;
            }
            // Equipment plates (upper region) — unequip on tap (weapon inert).
            const { slots } = deviceEquipLayout(gearEquipRect(body));
            for (const s of slots) {
                if (s.key === 'weapon') continue;
                if (!this._pointInRect(pt, s)) continue;
                if (!this.equipment[s.key]) return;
                const msg = unequipItem(this, s.key);
                if (msg) this._log(msg);
                this._render();
                return;
            }
        }
```

- [ ] **Step 4: Verify in-browser**

Restart the dev server. Console: `window.__game._learnSkill('ray_blast','trick'); window.__game._learnSkill('boo','spell');` then open the Remoticon GEAR tab (`C` key or the on-screen button). Confirm: the equipment figure sits in the top region; a `TRICKS 1/6` row shows a highlighted **Ray Blast** chip and a `SPELLS …` row shows **Boo**. Tap Ray Blast → it un-highlights (unslotted) and disappears from the FIGHT Trick ring; tap again → re-slots and returns. Equipment plates still unequip on tap. Screenshot for Caelan. Console clean.

- [ ] **Step 5: Commit**

```bash
git add game/layout.js game/renderer.js game/main.js
git commit -m "feat(skills): GEAR-tab loadout list — tap to slot/unslot learned skills"
```

---

## Task 5: NH-2 suppression greying + finish

**Files:**
- Modify: `game/wheel-model.js` (leaf `available` predicates ~40-67)

The cast gate already honors `suppressedSkills` (via `hasTrick`, Task 2). This task makes a suppressed skill also **grey on the wheel** (read-side parity), fallback-guarded so the node fake-game tests keep working. No live suppression source is added (NH-2 stays hooked-not-live per the spec).

- [ ] **Step 1: Repoint the wheel `available` predicates (fallback-guarded)**

In `game/wheel-model.js`, change the membership reads in the leaf `available` predicates (`wheel-model.js:43,45,49,64,67`) from direct `.includes` to the accessor with a fallback for fake games:

```js
// spells (fireball / coneOfCold / boo):
available: (g) => (g.hasSpell ? g.hasSpell('fireball') : (g.knownSpells || []).includes('fireball'))
    && (g.playerMp || 0) >= (SPELLS.fireball ? SPELLS.fireball.mpCost : 0),
```

Apply the same `g.hasSpell ? g.hasSpell(id) : (g.knownSpells||[]).includes(id)` shape to `coneOfCold` (`:45`) and `boo` (`:49`), and the `g.hasTrick ? g.hasTrick(id) : (g.grantedTricks||[]).includes(id)` shape to `ray_blast` (`:64`) and `hire_lion` (`:67`). Leave the MP/GP guards unchanged.

- [ ] **Step 2: Run the wheel-model tests**

Run: `node --test tests/wheel-model.test.js`
Expected: PASS — the fallback branch preserves behavior for the test's fake game (which has no `hasSpell`/`hasTrick`). If the test's fake game *does* define them, ensure they behave; adjust the fake if needed.

- [ ] **Step 3: Verify greying in-browser**

Restart the dev server. Console:

```js
const g = window.__game;
g._learnSkill('ray_blast', 'trick');       // learn + auto-slot
g.suppressedSkills.add('ray_blast'); g._render();
```

Open the FIGHT wheel → **Ray Blast** is greyed/unavailable and won't fire; then:

```js
g.suppressedSkills.delete('ray_blast'); g._render();
```

→ it returns to available and casts. Console clean.

- [ ] **Step 4: Commit**

```bash
git add game/wheel-model.js
git commit -m "feat(skills): suppressed skills grey on the wheel (NH-2 read-side parity)"
```

---

## Verification (whole branch)

**Automated (`node --test`) — run the full suite on a Node box (no local node here; CI):**
- `tests/skills.test.js` — the pure store ops (Task 1).
- `tests/save-roundtrip.test.js` — pool/loadout round-trip + old-save default (Task 3).
- `tests/wheel-model.test.js` — unbroken by the fallback-guarded predicates (Task 5).
- Full `node --test` — no regressions in the other 12 suites.

**In-browser (behavioral) — `python dev-server.py 3001` + `window.__game`, restart per `.js` edit:**
- **The loop (spec "Done When"):** pick up / `_learnSkill('ray_blast','trick')` → `[Learned Ray Blast!]` + auto-slot → appears on the FIGHT Trick ring → casts, spends GP → learn `boo` (spell) too → open GEAR, unslot Ray Blast → it leaves the wheel → re-slot → returns.
- **Gear independence:** learned+slotted Ray Blast stays castable with the wooden sword equipped (no Ray Gun) and survives equipping/unequipping weapons.
- **Save:** learn + reslot → save → reload → pool + loadout preserved; the wheel matches.
- **Old save:** a save written before this feature loads with an empty pool and behaves exactly as today.
- **Suppression:** add an id to `suppressedSkills` → that leaf greys + won't fire; remove → returns.
- **Full smoke:** load, watch the console, exercise combat, trade/give, a quest step, save→reload — "a merge is done when the game RUNS."

**Branch:** `feature/ring-builds` off `dev`. Caelan makes the merge-to-`dev` call. Merge promptly once verified — this touches core files (`main.js`, `save.js`, `wheel-model.js`), so don't let it sit unmerged while `dev` advances.

---

## Self-Review

- **Spec coverage:** store fields (T2) · `SKILL_SLOTS` (T1) · merge (T2) · `hasSpell`/`hasTrick` (T2) · `_learnSkill` + tome MVF source (T3) · save four-touch (T3) · GEAR loadout UI (T4) · NH-2 hooked-not-live + greying (T2 gate + T5) · old-save identity (T3). All spec Gate-2 items map to a task.
- **Type consistency:** `learnedTricks/Spells` are `Set`s everywhere (ctor, serialize spreads to array, loadInto rebuilds `new Set`, `sanitizeEquipped` takes arrays); `equippedTricks/Spells` are arrays throughout; `SKILL_SLOTS[type]` keyed by `'trick'|'spell'` consistently; `_learnSkill/_equipSkill/_unequipSkill(id, type)` signatures match all call sites (tome, GEAR tap).
- **No placeholders:** every code step is complete. Two spots say "match the existing style / grep first" (renderer `drawText` option names; the save-test fake-game constructor) — these are real seams whose exact shape lives in files the implementer opens; the required behavior is specified.
- **Open decision, surfaced not hidden:** Task 4's GEAR-embed-vs-SKILLS-tab is flagged to confirm with Caelan before building — it's the one product fork the spec delegated.
