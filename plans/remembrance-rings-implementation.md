# Remembrance Rings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `skills.js` spell/trick loadout with literal finger-rings worn across two hands, where **adjacent rings fuse into new abilities**, rings are fashioned from boss-remembrance materials at Platero, and all runtime ground-drops persist per-zone.

**Architecture:** A new pure module `game/rings.js` holds the slot model, unlock ladder, adjacency, and fusion/resonance resolution (node-testable, no DOM). `game/ring-data.js` holds the ring roster + fusion table (content). `Game` gains ring state and its `_refreshGrantedSkills` becomes ring-sourced — `knownSpells` / `grantedTricks` = base ∪ slotted-ring actives ∪ fusion actives ∪ gear — so the wheel and cast paths are unchanged consumers. The SKILLS device tab is reskinned into two hands. A per-zone dropped-items layer (mirroring `_collectedItems`) fixes runtime-drop loss.

**Tech Stack:** Vanilla ES modules, HTML5 canvas, `node --test` for pure modules. **No local Node** — pure-module + save tasks get node tests (run in CI / on a node box); `Game`-wiring / UI tasks verify in-browser via `python dev-server.py 3001` + `window.__game`.

**Spec:** `plans/remembrance-rings.md` (approved 2026-07-19). This plan implements its Gate 3/4 sequencing.

---

## ⚠️ PREREQUISITE — do this before Task 1

**Merge `feature/defeat-scenarios` into `dev` first.** It is built, verified, and unmerged, and it rewrites `main.js` (+311), `renderer.js` (+268), `layout.js`, and `items.js` — four of the files this plan edits. Per the project merge-hygiene rule, merge it (and confirm the game RUNS: restart the dev server, load, console clean, smoke-test defeat + combat) before starting rings on top. That merge is Caelan's call.

> **Line-number drift:** every `main.js` / `renderer.js` / `layout.js` / `items.js` line number below was verified on `dev` @ `a8d6967` (before the defeat-scenarios merge). After that merge they WILL shift. **Re-grep the named symbol before each edit** — the symbols are stable, the line numbers are hints. `game/rings.js`, `game/ring-data.js`, `game/save.js`, `game/combat.js`, `game/map.js`, `game/data.js` are untouched by defeat-scenarios.

**Branch:** `feature/remembrance-rings` off `dev` (after the merge above).

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `game/rings.js` | **Create** | Pure store: `FINGERS`/`HANDS`/`UNLOCK_ORDER`, `unlockedFingers`/`unlockedSlots`/`adjacentPairs`, `findFusion`, `resolveAdjacencies`, `slottedActives`, `aggregatePassives`, `slotRing`/`unslotRing`/`acquireRing`, `sanitizeSlots`. No game/DOM deps. |
| `game/ring-data.js` | **Create** | `RINGS` roster + `FUSIONS` table (content). Starter set only; Caelan expands. |
| `tests/rings.test.js` | **Create** | Node unit tests for `rings.js`. |
| `game/main.js` | Modify | Ring ctor state; `_refreshGrantedSkills` → ring-sourced merge; `_acquireRing`/`_slotRing`/`_unslotRing`; `_canEnter` (rat-form grate exception) + player-move repoint; rat-form turn tick; wererat fur drop; Platero `_fashionRing`; per-zone dropped-items layer in `_loadMap`; device-tap hands routing; unlock-tier hooks; passive/trigger application in combat. |
| `game/ring-data.js` actives | (in `main.js`/`tricks.js`) | `rat_form` + `ember_rat` TRICKS entries + cast resolvers. |
| `game/save.js` | Modify | Four-touch for `ownedRings` / `ringSlots` / `ringTier` / `discoveredFusions`; per-zone dropped-items map; drop the superseded `learned*`/`equipped*` handling. |
| `game/renderer.js` | Modify | `_drawDeviceSkills` → the two-hands view (bare unrevealed fingers, fusion sparks). |
| `game/layout.js` | Modify | `deviceSkillsLayout` → hand/socket/link rects (draw + hit-test share it). |
| `game/items.js` | Modify | Fur remembrance material def (`questItem`); Platero wiring if item-driven. |
| `game/npc.js` | Modify | Hard `questItem` guard on `wantsItems` matching. |
| `game/data.js` | Modify | (none required — `GRATE` stays `walkable:false`; the exception is player-move-only in `main.js`.) |
| `game/skills.js` | **Delete (Task 5)** | Superseded by `rings.js`. Removed once the device tab stops calling it. |
| `game/wheel-model.js` | Unchanged | Still reads `knownSpells` / `grantedTricks`. |

---

## Sequencing

Order builds the tested pure core first, then the independent bug-fix, then wires rings into `Game` behavior-preservingly, then the worked content chain, then the UI, then the hidden tiers + passive/trigger math.

1. **Task 1** — pure `rings.js` + node tests (no game touch).
2. **Task 2** — per-zone dropped-items persistence (independent bug-fix; save test + in-browser).
3. **Task 3** — `ring-data.js` + ring state in `Game` + ring-sourced merge (empty rings ⇒ identical to today).
4. **Task 4** — the worked chain: `rat_form`/`ember_rat` actives, grate walkability, wererat fur drop, Platero fashioning.
5. **Task 5** — the two-hands UI (reskin the SKILLS tab; delete `skills.js`).
6. **Task 6** — hidden thumb/pinky tiers + passive/trigger application + finish.

Re-run `node --test` after Tasks 1–3; in-browser smoke after 2–6; full smoke before considering the branch done ("a merge is done when the game RUNS").

---

## Task 1: Pure store module `game/rings.js`

**Files:**
- Create: `game/rings.js`
- Test: `tests/rings.test.js`

**Why a separate module:** `Game` (`main.js`) touches `document` at load and can't be constructed under node, so the slot/adjacency/fusion logic lives here as pure functions (mirrors `ai.js` / `pathing.js` / `skills.js`) and `Game` delegates. This is the only node-testable seam for the ring logic.

- [ ] **Step 1: Write the failing tests**

Create `tests/rings.test.js`:

```js
// rings.test.js — the pure store ops behind the Remembrance Rings axis.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    FINGERS, HANDS, UNLOCK_ORDER,
    unlockedFingers, unlockedSlots, adjacentPairs,
    findFusion, resolveAdjacencies, slottedActives, aggregatePassives,
    slotRing, unslotRing, acquireRing, sanitizeSlots,
} from '../game/rings.js';

// A tiny fixture roster + fusion table.
const RINGS = {
    rat:   { id: 'rat',   tags: ['vermin', 'sewer'], grants: 'rat_form', passive: { evasion: 5 } },
    fire:  { id: 'fire',  tags: ['fire'],            passive: { fireDamage: 10 } },
    water: { id: 'water', tags: ['water', 'sewer'],  passive: { armor: 1 } },
};
const FUSIONS = [
    { pair: ['vermin', 'fire'],  id: 'ember_rat', grants: 'ember_rat' },
    { pair: ['sewer', 'water'],  id: 'pet_slime', grants: 'pet_slime' },
];
const get = (id) => RINGS[id] || null;

describe('unlock ladder', () => {
    test('tier 0 unlocks only the ring finger (2 slots)', () => {
        assert.deepEqual(unlockedFingers(0), ['ring']);
        assert.equal(unlockedSlots(0).length, 2);
    });
    test('tiers 1..4 unlock middle, index, thumb, pinky (4,6,8,10 slots)', () => {
        assert.equal(unlockedSlots(1).length, 4);
        assert.equal(unlockedSlots(2).length, 6);
        assert.equal(unlockedSlots(3).length, 8);
        assert.equal(unlockedSlots(4).length, 10);
    });
    test('slot keys are hand:finger and stable', () => {
        assert.ok(unlockedSlots(0).every(s => s.key === `${s.hand}:${s.finger}`));
        assert.deepEqual(unlockedSlots(0).map(s => s.key).sort(), ['left:ring', 'right:ring']);
    });
});

describe('adjacency', () => {
    test('pair counts are 0,2,4,6,8 across tiers 0..4', () => {
        assert.equal(adjacentPairs(0).length, 0);   // two rings on opposite hands — never adjacent
        assert.equal(adjacentPairs(1).length, 2);
        assert.equal(adjacentPairs(2).length, 4);
        assert.equal(adjacentPairs(3).length, 6);
        assert.equal(adjacentPairs(4).length, 8);
    });
    test('adjacency never crosses hands', () => {
        for (const { a, b } of adjacentPairs(4)) {
            assert.equal(a.split(':')[0], b.split(':')[0]);
        }
    });
    test('unlocked fingers are always anatomically contiguous', () => {
        for (let t = 0; t <= 4; t++) {
            const idxs = unlockedFingers(t).map(f => FINGERS.indexOf(f)).sort((x, y) => x - y);
            for (let i = 1; i < idxs.length; i++) assert.equal(idxs[i] - idxs[i - 1], 1);
        }
    });
});

describe('findFusion', () => {
    test('matches a tag pair in either ring order', () => {
        assert.equal(findFusion(RINGS.rat, RINGS.fire, FUSIONS).id, 'ember_rat');
        assert.equal(findFusion(RINGS.fire, RINGS.rat, FUSIONS).id, 'ember_rat');
    });
    test('returns null when no pair matches', () => {
        assert.equal(findFusion(RINGS.fire, RINGS.water, FUSIONS), null);
    });
    test('is deterministic — first authored match wins', () => {
        // rat+water share tag 'sewer'; only pet_slime matches (sewer+water).
        assert.equal(findFusion(RINGS.rat, RINGS.water, FUSIONS).id, 'pet_slime');
    });
});

describe('resolveAdjacencies', () => {
    test('an authored adjacent pair grants its fusion active; others resonate', () => {
        // tier 1: left has ring+middle adjacent, right has ring+middle adjacent.
        const slots = { 'left:ring': 'rat', 'left:middle': 'fire', 'right:ring': 'water', 'right:middle': null };
        const r = resolveAdjacencies(1, slots, get, FUSIONS);
        assert.deepEqual(r.grantedActives, ['ember_rat']);
        assert.equal(r.fusions.length, 1);
        assert.equal(r.resonancePairs, 0); // right pair has an empty slot → not a pair
    });
    test('a filled non-fusion adjacent pair counts as resonance, not fusion', () => {
        const slots = { 'left:ring': 'fire', 'left:middle': 'water' };
        const r = resolveAdjacencies(1, slots, get, FUSIONS);
        assert.deepEqual(r.grantedActives, []);
        assert.equal(r.resonancePairs, 1);
    });
    test('the same fusion adjacent on both hands grants once (deduped)', () => {
        const slots = {
            'left:ring': 'rat', 'left:middle': 'fire',
            'right:ring': 'rat', 'right:middle': 'fire',
        };
        const r = resolveAdjacencies(1, slots, get, FUSIONS);
        assert.deepEqual(r.grantedActives, ['ember_rat']); // once, not twice
        assert.equal(r.fusions.length, 2);                 // but both discoveries recorded
    });
});

describe('slottedActives / aggregatePassives', () => {
    test('slottedActives collects each slotted ring grant, deduped', () => {
        const slots = { 'left:ring': 'rat', 'right:ring': 'water' };
        assert.deepEqual(slottedActives(slots, get), ['rat_form']); // water has no grant
    });
    test('aggregatePassives sums numeric modifiers across slots', () => {
        const slots = { 'left:ring': 'fire', 'left:middle': 'water', 'right:ring': 'rat' };
        assert.deepEqual(aggregatePassives(slots, get), { fireDamage: 10, armor: 1, evasion: 5 });
    });
});

describe('slotRing / unslotRing / acquireRing', () => {
    test('acquireRing adds to the pool and auto-slots into the first empty unlocked slot', () => {
        const owned = new Set(), slots = {};
        assert.equal(acquireRing(owned, slots, 0, 'rat'), true);
        assert.equal(owned.has('rat'), true);
        assert.equal(slots['left:ring'], 'rat'); // first unlocked slot
    });
    test('acquireRing is idempotent', () => {
        const owned = new Set(['rat']), slots = { 'left:ring': 'rat' };
        assert.equal(acquireRing(owned, slots, 0, 'rat'), false);
    });
    test('slotRing refuses an un-owned ring or a locked slot, and moves a ring out of its old slot', () => {
        const owned = new Set(['rat']), slots = {};
        assert.equal(slotRing(slots, owned, 0, 'right:ring', 'fire'), false); // not owned
        assert.equal(slotRing(slots, owned, 0, 'left:middle', 'rat'), false); // middle locked at tier 0
        assert.equal(slotRing(slots, owned, 0, 'left:ring', 'rat'), true);
        assert.equal(slotRing(slots, owned, 1, 'left:middle', 'rat'), true);  // moves rat
        assert.equal(slots['left:ring'], null);   // vacated — a ring is one physical instance
        assert.equal(slots['left:middle'], 'rat');
    });
    test('unslotRing clears a slot, returns false if already empty', () => {
        const slots = { 'left:ring': 'rat' };
        assert.equal(unslotRing(slots, 'left:ring'), true);
        assert.equal(slots['left:ring'], null);
        assert.equal(unslotRing(slots, 'left:ring'), false);
    });
});

describe('sanitizeSlots', () => {
    test('drops assignments for un-owned rings and locked slots', () => {
        const owned = new Set(['rat']);
        const dirty = { 'left:ring': 'rat', 'left:middle': 'ghost', 'right:pinky': 'rat' };
        const clean = sanitizeSlots(dirty, owned, 0); // tier 0: only ring fingers unlocked
        assert.deepEqual(clean, { 'left:ring': 'rat' });
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/rings.test.js`
Expected: FAIL — `Cannot find module '../game/rings.js'`.

- [ ] **Step 3: Write `game/rings.js`**

```js
// rings.js — the pure store operations behind the Remembrance Rings axis.
//
// Game (main.js) is browser-coupled and can't be constructed under node; this
// module holds the slot / adjacency / fusion logic as pure functions so it's
// unit-testable in isolation (mirrors ai.js / pathing.js / skills.js). Game
// delegates from _refreshGrantedSkills / _acquireRing / _slotRing / _unslotRing.

// Anatomical finger order per hand. Index in this array = adjacency order:
// two fingers are neighbours iff they are consecutive here.
export const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];
export const HANDS   = ['left', 'right'];

// Fingers unlock in this order, the same finger on BOTH hands at each tier:
//   tier 0 → ring (2 slots) · 1 → +middle (4) · 2 → +index (6)
//   3 → +thumb (8, hidden) · 4 → +pinky (10, hidden)
// Because the set grows ring→middle→index→thumb→pinky, the unlocked fingers are
// ALWAYS anatomically contiguous, so within-hand adjacency is well-defined.
export const UNLOCK_ORDER = ['ring', 'middle', 'index', 'thumb', 'pinky'];

export function unlockedFingers(tier) {
    const n = Math.max(0, Math.min(tier + 1, UNLOCK_ORDER.length));
    return UNLOCK_ORDER.slice(0, n);
}

// Every unlocked slot as { hand, finger, key }, in a stable order (hand major,
// anatomical finger order minor). key = `${hand}:${finger}`.
export function unlockedSlots(tier) {
    const fingers = unlockedFingers(tier);
    const out = [];
    for (const hand of HANDS) {
        for (const finger of FINGERS) {
            if (fingers.includes(finger)) out.push({ hand, finger, key: `${hand}:${finger}` });
        }
    }
    return out;
}

// Within-hand adjacent slot-key pairs { a, b } at a tier. Adjacency never
// crosses hands; a pair needs both fingers unlocked (guaranteed contiguous).
export function adjacentPairs(tier) {
    const fingers = unlockedFingers(tier);
    const pairs = [];
    for (const hand of HANDS) {
        const present = FINGERS.filter(f => fingers.includes(f)); // anatomical order
        for (let i = 0; i < present.length - 1; i++) {
            pairs.push({ a: `${hand}:${present[i]}`, b: `${hand}:${present[i + 1]}` });
        }
    }
    return pairs;
}

// First authored fusion whose tag pair is satisfied by the two rings in EITHER
// order. Deterministic (authored order). Returns the fusion object or null.
export function findFusion(ringA, ringB, fusionTable) {
    if (!ringA || !ringB) return null;
    for (const fz of fusionTable) {
        const [x, y] = fz.pair;
        const ax = ringA.tags.includes(x), ay = ringA.tags.includes(y);
        const bx = ringB.tags.includes(x), by = ringB.tags.includes(y);
        if ((ax && by) || (ay && bx)) return fz;
    }
    return null;
}

// Resolve every adjacent filled pair into fusions (authored) or resonance
// (unauthored). getRing: id → RING|null. Returns:
//   { grantedActives: string[] (deduped), fusions: [{a,b,fusion}], resonancePairs: number }
export function resolveAdjacencies(tier, slots, getRing, fusionTable) {
    const grantedActives = [];
    const fusions = [];
    let resonancePairs = 0;
    for (const { a, b } of adjacentPairs(tier)) {
        const ra = getRing(slots[a]);
        const rb = getRing(slots[b]);
        if (!ra || !rb) continue;                 // both slots must be filled
        const fz = findFusion(ra, rb, fusionTable);
        if (fz) { fusions.push({ a, b, fusion: fz }); if (fz.grants) grantedActives.push(fz.grants); }
        else resonancePairs++;
    }
    return { grantedActives: [...new Set(grantedActives)], fusions, resonancePairs };
}

// The active ability granted by each slotted ring itself (deduped).
export function slottedActives(slots, getRing) {
    const out = [];
    for (const key of Object.keys(slots)) {
        const r = getRing(slots[key]);
        if (r && r.grants) out.push(r.grants);
    }
    return [...new Set(out)];
}

// Sum each slotted ring's numeric `passive` modifiers into one object.
export function aggregatePassives(slots, getRing) {
    const mods = {};
    for (const key of Object.keys(slots)) {
        const r = getRing(slots[key]);
        if (r && r.passive) {
            for (const [k, v] of Object.entries(r.passive)) mods[k] = (mods[k] || 0) + v;
        }
    }
    return mods;
}

// Slot a ring. Refuses (false) if the slot is locked at this tier or the ring
// is un-owned. A ring is ONE physical instance — vacate any slot it already
// occupies before placing it.
export function slotRing(slots, owned, tier, slotKey, ringId) {
    if (!unlockedSlots(tier).some(s => s.key === slotKey)) return false;
    if (!owned.has(ringId)) return false;
    for (const k of Object.keys(slots)) if (slots[k] === ringId) slots[k] = null;
    slots[slotKey] = ringId;
    return true;
}

// Clear a slot. Returns true if it held a ring.
export function unslotRing(slots, slotKey) {
    if (!slots[slotKey]) return false;
    slots[slotKey] = null;
    return true;
}

// Add a ring to the owned pool (idempotent). Generous: auto-slot into the first
// empty unlocked slot so a fashioned ring is usable at once (buffs-feel-given).
// Returns true only if newly acquired.
export function acquireRing(owned, slots, tier, ringId) {
    if (owned.has(ringId)) return false;
    owned.add(ringId);
    for (const s of unlockedSlots(tier)) {
        if (!slots[s.key]) { slots[s.key] = ringId; break; }
    }
    return true;
}

// Sanitize a persisted slot map (save.validate, no live Game): keep only
// assignments whose slot is unlocked at `tier` AND whose ring is owned.
export function sanitizeSlots(slots, owned, tier) {
    const keys = new Set(unlockedSlots(tier).map(s => s.key));
    const out = {};
    for (const key of Object.keys(slots || {})) {
        const id = slots[key];
        if (id && keys.has(key) && owned.has(id)) out[key] = id;
    }
    return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/rings.test.js`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add game/rings.js tests/rings.test.js
git commit -m "feat(rings): pure store module for the Remembrance Rings axis"
```

---

## Task 2: Per-zone dropped-items persistence (the bug-fix)

**Files:**
- Modify: `game/main.js` (`_loadMap` ~505–522; drop + death-drop sites; a new `_droppedItems` field ~334)
- Modify: `game/save.js` (serialize ~88–99; validate ~150; loadInto ~255–264)
- Test: `tests/save-roundtrip.test.js`

**The bug (spec Gate 1):** `_loadMap` rebuilds `groundItems` from **authored spawns only**, so any item dropped at runtime is erased on zone re-entry — and because `_collectedItems` still holds the pickup key, an item you pick up then drop elsewhere vanishes from the world entirely. Fix: record every runtime drop against its map in a persisted `_droppedItems` map, and re-inject them in `_loadMap`.

- [ ] **Step 1: Add the `_droppedItems` field**

In the ctor, beside `this._collectedItems = new Set();` (currently `main.js:334`), add:

```js
// Runtime ground-drops per map ("mapUrl" → [{ type, x, y }]), so items dropped
// by the player OR by a dying enemy survive leaving and re-entering a zone.
// Twin of _collectedItems (which stops AUTHORED spawns respawning once taken);
// together they make the world permanent, never regenerative. Persisted.
this._droppedItems = {};
```

- [ ] **Step 2: Add a `_recordDrop` helper + route drops through it**

Add a small method near the ground-item code (e.g. below `_loadMap`):

```js
// Record a runtime drop so it persists across zone changes, then place it.
// Called for player drops AND enemy death-drops. `def` is optional (resolved).
_recordDrop(type, x, y) {
    const url = this._mapUrl;
    (this._droppedItems[url] ||= []).push({ type, x, y });
}
```

Then, at each site that pushes a runtime drop onto `groundItems`, also record it. The death-drop sites are `main.js:3563` (converter) and `main.js:3568` (grappling hook):

```js
// main.js:3563 — before/after the existing push, record it:
this._recordDrop('catalytic_converter', enemyObj.x, enemyObj.y);
this.groundItems.push({ type: 'catalytic_converter', x: enemyObj.x, y: enemyObj.y, def: ITEMS.catalytic_converter });
```

Apply the same one-line `_recordDrop(...)` beside the `grappling_hook` push (`main.js:3568`) and beside the **player-drop** push (re-grep `groundItems.push` — the player-initiated drop path; if the game has no explicit "drop" verb yet, only the death-drops need it now, and the player-drop hook lands with the first drop verb). Leave the AUTHORED-spawn push in `_loadMap:521` alone — those are not runtime drops.

- [ ] **Step 3: Re-inject dropped items in `_loadMap`**

In `_loadMap`, after the authored-spawn loop (`main.js:517–522`), add:

```js
// Re-inject runtime drops recorded for this map (player drops + death-drops),
// unless the player has since picked them up (same _collectedItems key).
for (const d of (this._droppedItems[url] || [])) {
    if (this._collectedItems.has(`${url}|${d.x}|${d.y}|${d.type}`)) continue;
    const def = this._resolveItemDef(d.type);
    if (def) this.groundItems.push({ type: d.type, x: d.x, y: d.y, def });
}
```

> Note the interaction with `_collectedItems`: picking up a re-injected drop adds its `url|x|y|type` key (existing pickup path, `main.js:2803`), so it won't re-inject after being taken. The compound bug (pick-up-then-drop-elsewhere vanishing) is fixed because the new drop location is recorded independently of the old pickup key.

- [ ] **Step 4: Persist `_droppedItems` (save four-touch)**

In `save.js` `serialize()`, inside the `world: { … }` block (after `collectedItems`, `save.js:92`):

```js
            droppedItems: game._droppedItems || {},
```

In `validate()` (near the other `world` guards, re-grep `r.world.groundItems`): ensure it's an object:

```js
    if (!r.world.droppedItems || typeof r.world.droppedItems !== 'object') r.world.droppedItems = {};
```

In `loadInto()` (beside `game._collectedItems = new Set(...)`, `save.js:264`):

```js
    game._droppedItems = raw.world.droppedItems || {};
```

- [ ] **Step 5: Extend the save round-trip test**

In `tests/save-roundtrip.test.js`, add (adapt the fake-game construction to the file's existing helper style):

```js
test('runtime dropped items persist per-zone across a save round-trip', () => {
    installGlobals();
    const g = makeFakeGame();
    g._mapUrl = 'sewer-map.json';
    g._droppedItems = { 'sewer-map.json': [{ type: 'red_cape', x: 4, y: 9 }] };
    const blob = serialize(g);
    const g2 = makeFakeGame();
    loadIntoReal(g2, blob);
    assert.deepEqual(g2._droppedItems['sewer-map.json'], [{ type: 'red_cape', x: 4, y: 9 }]);
});

test('old save (no droppedItems) loads as an empty map without throwing', () => {
    installGlobals();
    const g = makeFakeGame();
    const blob = serialize(g);
    delete blob.world.droppedItems;
    const g2 = makeFakeGame();
    loadIntoReal(g2, blob);
    assert.deepEqual(g2._droppedItems, {});
});
```

- [ ] **Step 6: Run the save tests**

Run: `node --test tests/save-roundtrip.test.js`
Expected: PASS, including the two new tests.

- [ ] **Step 7: Verify in-browser**

Restart `python dev-server.py 3001`. Load the game. In the console:

```js
const g = window.__game;
// simulate a drop in the current zone, then leave and return:
g._recordDrop('red_cape', g.playerX + 1, g.playerY); g.groundItems.push({ type:'red_cape', x:g.playerX+1, y:g.playerY, def: g._resolveItemDef('red_cape') }); g._render();
// (walk through a zone transition and back, or reload a save)
```

Confirm the dropped cape is still on the ground after re-entering the zone. Console clean.

- [ ] **Step 8: Commit**

```bash
git add game/main.js game/save.js tests/save-roundtrip.test.js
git commit -m "fix(world): runtime ground-drops persist per-zone (twin of _collectedItems)"
```

---

## Task 3: Ring data + ring state in `Game` + ring-sourced merge

**Files:**
- Create: `game/ring-data.js`
- Modify: `game/main.js` (ctor ~156–168; `_refreshGrantedSkills` ~3702–3708; new `_acquireRing`/`_slotRing`/`_unslotRing`; imports ~34)
- Modify: `game/save.js` (four-touch for the ring fields; drop the `learned*`/`equipped*` handling)

**Invariant:** with an empty owned pool + empty slots, the merged `knownSpells` / `grantedTricks` equal today's `base ∪ gear`. No behaviour change until a ring is acquired.

- [ ] **Step 1: Create `game/ring-data.js` (starter roster)**

```js
// ring-data.js — the Remembrance Rings roster + fusion table (CONTENT).
//
// This is the long tail Caelan authors: each boss/notable foe → a remembrance
// material → a ring here; each interesting adjacency → a FUSIONS entry. Fusions
// key on TAGS not ids, so one recipe covers a whole family. Effects conjure
// ghosts/elementals — never gore or animal cruelty (see plans/remembrance-rings.md).

export const RINGS = {
    rat_ring: {
        id: 'rat_ring',
        name: '[Rat Ring]',
        description: 'A braid of coarse wererat fur set in dull silver. It twitches when you look away.',
        tags: ['vermin', 'sewer'],
        remembranceFrom: 'wererat_boss',
        grants: 'rat_form',            // an active — feeds the wheel
        passive: { evasion: 5 },       // small always-on modifier
    },
    fire_ring: {
        id: 'fire_ring',
        name: '[Fire Ring]',
        description: 'A band of blackened copper that is always a little too warm to wear.',
        tags: ['fire'],
        passive: { fireDamage: 10 },   // +10% (applied in combat, Task 6)
        trigger: { on: 'hit', effect: 'ignite', chance: 0.25 },
    },
};

export const FUSIONS = [
    {
        // Rat Ring (vermin) beside Fire Ring (fire) → a conjured fire-elemental
        // rat. NOT a live animal — a rat of cinder and grudge (content rule).
        pair: ['vermin', 'fire'],
        id: 'ember_rat',
        name: '[Ember Rat]',
        grants: 'ember_rat',
    },
];
```

- [ ] **Step 2: Import ring-data + rings.js into `main.js`**

Near the other `./` imports (the `import { … } from './skills.js';` block, `main.js:34`-ish), add:

```js
import { RINGS, FUSIONS } from './ring-data.js';
import {
    unlockedSlots, resolveAdjacencies, slottedActives, aggregatePassives,
    slotRing, unslotRing, acquireRing, sanitizeSlots,
} from './rings.js';
```

- [ ] **Step 3: Add ring state to the ctor**

Replace the ring-builds skill fields (currently `main.js:165–168`: `learnedTricks`/`learnedSpells`/`equippedTricks`/`equippedSpells`, and the `suppressedSkills` line if present) with:

```js
// Remembrance Rings — the ONE slotting system (supersedes the skills loadout).
// ownedRings = the pool (fashioned at Platero); ringSlots = per-slot assignment
// ("hand:finger" → ringId|null); ringTier = the unlock ladder (0..4);
// discoveredFusions = fusion ids seen at least once (for the log). All persisted.
this.ownedRings       = new Set();
this.ringSlots        = {};
this.ringTier         = 0;
this.discoveredFusions = new Set();
this.suppressedSkills = new Set();   // kept: still gates hasSpell/hasTrick at READ
this.ringMods         = {};          // aggregate passives, recomputed by _refreshGrantedSkills
```

- [ ] **Step 4: Make `_refreshGrantedSkills` ring-sourced**

Replace the body of `_refreshGrantedSkills` (`main.js:3702–3708`) and update its comment:

```js
// (Remembrance Rings) The active skills = base ∪ slotted-ring actives ∪ fusion
// actives ∪ the equipped weapon's grants. Actives are split into spells (Magic
// ring) vs tricks (Trick ring) by which registry defines them. Also recomputes
// the aggregate passive modifiers and records any newly-seen fusions. Call after
// any change to weapon OR rings (acquire, slot, unslot, unlock, new game, load).
_refreshGrantedSkills() {
    const w  = this.equipment && this.equipment.weapon;
    const gs = (w && w.grantsSpells) || [];
    const gt = (w && w.grantsTricks) || [];
    const getRing = (id) => RINGS[id] || null;

    const ringActives = slottedActives(this.ringSlots, getRing);
    const adj = resolveAdjacencies(this.ringTier, this.ringSlots, getRing, FUSIONS);
    for (const f of adj.fusions) if (f.fusion.id) this.discoveredFusions.add(f.fusion.id);

    const actives = [...ringActives, ...adj.grantedActives];
    const ringSpells = actives.filter(a => SPELLS[a]);
    const ringTricks = actives.filter(a => TRICKS[a]);

    this.knownSpells   = mergeKnown(BASE_SPELLS, ringSpells, gs);
    this.grantedTricks = mergeKnown([], ringTricks, gt);
    this.ringMods      = aggregatePassives(this.ringSlots, getRing);
}
```

(`mergeKnown` stays imported from `skills.js` until Task 5 deletes that module; move it into `rings.js` in Task 5. `SPELLS`/`TRICKS`/`BASE_SPELLS` are already imported in `main.js`.)

- [ ] **Step 5: Replace the learn/equip methods with ring methods**

Replace `_learnSkill`/`_equipSkill`/`_unequipSkill` (`main.js:3718–3740`) with:

```js
// Acquire a fashioned ring into the pool (from Platero; auto-slots if room).
// Idempotent — returns true only if newly acquired.
_acquireRing(ringId) {
    const got = acquireRing(this.ownedRings, this.ringSlots, this.ringTier, ringId);
    this._refreshGrantedSkills();
    if (got) {
        const def = RINGS[ringId];
        this._log(`[You slip on the ${(def && def.name || ringId).replace(/[\[\]]/g, '')}.]`, 'transition');
    }
    return got;
}

// Slot / unslot a ring (the hands UI, Task 5). Both refresh grants so the wheel
// and passives update immediately.
_slotRing(slotKey, ringId) {
    if (slotRing(this.ringSlots, this.ownedRings, this.ringTier, slotKey, ringId)) this._refreshGrantedSkills();
}
_unslotRing(slotKey) {
    if (unslotRing(this.ringSlots, slotKey)) this._refreshGrantedSkills();
}

// Raise the unlock tier (Task 6 gates call this). Reveals more finger slots.
_setRingTier(tier) {
    this.ringTier = Math.max(this.ringTier, tier);
    this._refreshGrantedSkills();
}
```

- [ ] **Step 6: Ring save four-touch; drop the old skill fields**

In `save.js`:
- **serialize** (`save.js:67–69`) — replace the `learnedTricks`/`learnedSpells`/`equippedTricks`/`equippedSpells` lines with:

```js
            ownedRings:       [...(game.ownedRings || [])],
            ringSlots:        { ...(game.ringSlots || {}) },
            ringTier:         game.ringTier || 0,
            discoveredFusions:[...(game.discoveredFusions || [])],
```

- **validate** (`save.js:192–195`) — replace the `learned*`/`equipped*` sanitize block with:

```js
    // Remembrance Rings: coerce + sanitize (slots ⊆ unlocked ∩ owned).
    const asIds = (a) => (Array.isArray(a) ? a.filter(id => typeof id === 'string') : []);
    p.ownedRings = asIds(p.ownedRings);
    p.ringTier   = Number.isInteger(p.ringTier) ? Math.max(0, Math.min(4, p.ringTier)) : 0;
    p.ringSlots  = sanitizeSlots(p.ringSlots, new Set(p.ownedRings), p.ringTier);
    p.discoveredFusions = asIds(p.discoveredFusions);
```

- **loadInto** (`save.js:240–242`) — replace the `learned*`/`equipped*` restore with:

```js
    game.ownedRings        = new Set(p.ownedRings || []);
    game.ringSlots         = { ...(p.ringSlots || {}) };
    game.ringTier          = p.ringTier || 0;
    game.discoveredFusions = new Set(p.discoveredFusions || []);
```

Update the `save.js` import (`save.js:16`-ish) from `skills.js` → `rings.js`: replace `import { SKILL_SLOTS, sanitizeEquipped } from './skills.js';` with `import { sanitizeSlots } from './rings.js';`.

> Old saves: absent ring fields → empty pool ⇒ `base ∪ gear` ⇒ identical to today. The superseded `learned*`/`equipped*` fields are simply ignored (save compatibility is explicitly deprioritised — Caelan).

- [ ] **Step 7: Verify in-browser**

Restart the dev server. Console:

```js
const g = window.__game;
JSON.stringify(g.knownSpells);        // ['fireball','coneOfCold'] — empty rings = today
g.grantedTricks;                      // []  (wooden sword grants none)
g._acquireRing('rat_ring');           // logs "[You slip on the Rat Ring.]"
g.ownedRings.has('rat_ring');         // true
g.ringSlots['left:ring'];             // 'rat_ring'  (auto-slotted)
g.grantedTricks;                      // [] still — rat_form TRICK arrives in Task 4
g.ringMods;                           // { evasion: 5 }
```

Then save/reload (however the game exposes save) and confirm `ownedRings` / `ringSlots` survive. Console clean.

- [ ] **Step 8: Commit**

```bash
git add game/ring-data.js game/main.js game/save.js
git commit -m "feat(rings): ring state + ring-sourced skill merge (empty pool = no-op); absorb skills loadout"
```

---

## Task 4: The worked chain — rat-form, grate, wererat drop, Platero

**Files:**
- Modify: `game/tricks.js` (or wherever `TRICKS` is defined — re-grep `export const TRICKS`) — `rat_form` + `ember_rat` entries
- Modify: `game/main.js` (cast resolvers for `rat_form`/`ember_rat`; `_canEnter` + player-move repoint; rat-form tick; wererat fur drop; `_fashionRing`)
- Modify: `game/items.js` (fur remembrance material def)
- Modify: `game/npc.js` (`questItem` guard on `wantsItems`)

- [ ] **Step 1: Define the `rat_form` and `ember_rat` tricks**

In the `TRICKS` registry (re-grep `export const TRICKS` — likely `game/tricks.js`), add:

```js
    rat_form: {
        id: 'rat_form',
        name: '[Rat Form]',
        gpCost: 0,
        description: 'Become a rat for three turns. Small enough for the grates.',
    },
    ember_rat: {
        id: 'ember_rat',
        name: '[Ember Rat]',
        gpCost: 4,
        description: 'Conjure a rat of cinder and grudge and send it scurrying at a foe.',
    },
```

- [ ] **Step 2: Add the cast resolvers**

Find the trick-cast dispatch (re-grep `castTrick` in `main.js`). Add branches:

```js
        if (node.trickId === 'rat_form') {
            this._ratFormTurns = 3;
            this._log('[You fold down into a rat. The world goes enormous.]', 'transition');
            this._render();
            break;
        }
        if (node.trickId === 'ember_rat') {
            // Reuse the existing ranged/thrown resolution against the aimed tile;
            // conjured elemental, no live animal (content rule). Model the damage
            // application on the existing thrown-burst path (re-grep _resolveThrow).
            this._emberRatStrike(node);   // implement mirroring the thrown 3×3 burst
            break;
        }
```

(For `ember_rat`, implement `_emberRatStrike` by mirroring the existing thrown-attack resolver — re-grep the `useType:'throw'` / `resolveThrow` path — applying fire-typed damage to the aimed enemy. Keep it small; the point of the MVF is that the fusion PRODUCES a castable active, not a bespoke projectile system.)

- [ ] **Step 3: Rat-form walkability (`_canEnter`) — player-move only**

Add a `Game` method:

```js
// Player-only movement gate. Rings can open tiles that are globally unwalkable:
// in rat-form, GRATE (data.js id 4) becomes passable. Enemies/pathing keep using
// map.isWalkable directly, so only the player squeezes through grates.
_canEnter(x, y) {
    if (this.map.isWalkable(x, y)) return true;
    if (this._ratFormTurns > 0 && this.map.getTileDef(x, y).id === TILES.GRATE.id) return true;
    return false;
}
```

Repoint the **player step** gate from `this.map.isWalkable(nx, ny)` to `this._canEnter(nx, ny)` at the player-move site (`main.js:1927`, the `bump-wall` guard). Leave every other `isWalkable` call (enemies, pathing, AI, wheel targeting) unchanged. (`TILES` is already imported in `main.js`; re-grep `import { TILES` to confirm the name.)

- [ ] **Step 4: Tick rat-form down each world beat**

In the world-advance path (re-grep `_advanceWorld`), alongside the other per-beat timers (e.g. the summon timer near `_hireLion`), add:

```js
        if (this._ratFormTurns > 0) {
            this._ratFormTurns--;
            if (this._ratFormTurns === 0) this._log('[You unfold. Human again.]', 'transition');
        }
```

Initialise `this._ratFormTurns = 0;` in the ctor (beside the other transient timers).

- [ ] **Step 5: The wererat drops the fur material**

In `_handleEnemyDeath` (`main.js:3562`), beside the existing converter drop, add the remembrance material (and record it for persistence via Task 2's `_recordDrop`):

```js
        if (enemyObj.tag === 'wererat_boss' && ITEMS.wererat_fur) {
            this._recordDrop('wererat_fur', enemyObj.x, enemyObj.y);
            this.groundItems.push({ type: 'wererat_fur', x: enemyObj.x, y: enemyObj.y, def: ITEMS.wererat_fur });
            this._log('[Among the fur, one coarse braided tuft stays warm. A remembrance.]', 'pickup');
        }
```

- [ ] **Step 6: The fur material def (`items.js`)**

In `game/items.js` `ITEMS`, add (model shape on the existing `catalytic_converter` questItem):

```js
    wererat_fur: {
        id: 'wererat_fur',
        name: '[Tuft of Wererat Fur]',
        description: 'A braided tuft that stays blood-warm. Platero could set it into something.',
        questItem: true,          // protected: no sell/throw/give/smash, survives death
        useType: 'none',
        fallbackColor: '#7a5a3a',
        baseValue: 0,
    },
```

- [ ] **Step 7: Platero fashions the ring (`_fashionRing`)**

Add a `Game` method:

```js
// Platero's craft: consume a remembrance material from inventory and grant its
// ring. Wired from Platero's dialogue choice (choice.onPick → this). Returns
// true on success. Idempotent-safe: if the ring is already owned, the material
// is NOT consumed (nothing to gain).
_fashionRing(materialId, ringId) {
    if (this.ownedRings.has(ringId)) { this._log('[Platero: "You already wear its like."]'); return false; }
    const slot = (this.inventory || []).find(s => s && s.itemDef.id === materialId);
    if (!slot) { this._log('[Platero: "Bring me the material first."]'); return false; }
    this._removeFromInventory(materialId, 1);   // re-grep the exact inventory-remove helper
    this._acquireRing(ringId);
    this._log('[Platero turns it in the light, and it becomes a ring.]', 'transition');
    return true;
}
```

Add Platero as a Downtown NPC with a dialogue choice whose `onPick` calls `this._fashionRing('wererat_fur', 'rat_ring')` (reuse the existing `choice.onPick` dialogue-consequence hook — re-grep `onPick` for the canyon example; model Platero's NPC def on an existing Downtown vendor, re-grep the downtown map / NPC spawns). Gate the choice's visibility on holding the material if the dialogue system supports a `showIf` predicate; otherwise `_fashionRing` already guards.

- [ ] **Step 8: `questItem` guard on worker pickup (`npc.js`)**

In `findNearestWantedItem` (`npc.js:376`, the `if (!npc.wantsItems.includes(item.type)) continue;` line), add a guard so no worker can ever consume a protected item:

```js
        if (item.def && item.def.questItem) continue;   // never let a worker take a quest/remembrance item
        if (!npc.wantsItems.includes(item.type)) continue;
```

- [ ] **Step 9: Verify the worked chain in-browser**

Restart the dev server. Console-drive the chain (or play it):

```js
const g = window.__game;
// stand in for the kill: drop the fur, pick it up, fashion, slot happens via _acquireRing:
g._recordDrop('wererat_fur', g.playerX, g.playerY);
g.groundItems.push({ type:'wererat_fur', x:g.playerX, y:g.playerY, def: g._resolveItemDef('wererat_fur') });
// (walk onto it / take it so it's in inventory, then:)
g._fashionRing('wererat_fur', 'rat_ring');   // grants + auto-slots the Rat Ring
g.grantedTricks.includes('rat_form');        // true — the ring's active feeds the Trick ring
```

Open the FIGHT wheel → **Rat Form** is present → cast it → `g._ratFormTurns === 3` → stand beside a GRATE and step in → you pass (a non-rat step onto the grate still bumps) → after 3 beats you revert. Then acquire a `fire_ring` (`g._acquireRing('fire_ring')`), ensure it lands in a slot adjacent to the Rat Ring at tier ≥1 (`g._setRingTier(1)` then slot them next to each other) → `g.grantedTricks.includes('ember_rat')` is true and `g.discoveredFusions.has('ember_rat')` is true → cast **Ember Rat**. Console clean.

> The **[Red Cape]** already exists (`items.js:133`) and the grate-examine grant path already exists (`examine.js:33`); no new work — the rat-form squeeze simply reaches wherever the cape is authored.

- [ ] **Step 10: Commit**

```bash
git add game/tricks.js game/main.js game/items.js game/npc.js
git commit -m "feat(rings): rat-form + ember-rat actives, grate squeeze, wererat remembrance drop, Platero"
```

---

## Task 5: The two-hands UI

**Files:**
- Modify: `game/layout.js` (`deviceSkillsLayout` → hand/socket/link rects, `layout.js:212`)
- Modify: `game/renderer.js` (`_drawDeviceSkills` → two hands, `renderer.js:1702`)
- Modify: `game/main.js` (`_tapDevice` skills branch → slot/unslot on socket tap, `main.js:4326`)
- Delete: `game/skills.js` (+ its now-unused imports); move `mergeKnown` into `rings.js`

**Reskin, don't rebuild:** the SKILLS device tab, its `deviceBodyRect`, tab routing, and soft-pause already exist (built for ring-builds). Replace what `deviceSkillsLayout` returns and what `_drawDeviceSkills` draws; the tab plumbing is untouched.

- [ ] **Step 1: `deviceSkillsLayout` → hands geometry**

Replace `deviceSkillsLayout` (`layout.js:212`) so it returns, from `unlockedSlots(game.ringTier)`, a socket rect per unlocked slot laid out as two hands (mirror the `ring_slot_progression` widget geometry in `plans/remembrance-rings.md`), plus the adjacent-link segments from `adjacentPairs(game.ringTier)`. Shape:

```js
// Returns { sockets: [{ key, hand, finger, x, y, w, h, ringId }],
//           links:   [{ ax, ay, bx, by, fusible, fusionId }] }
// Only UNLOCKED fingers get a socket — unrevealed fingers are drawn bare by the
// renderer (no socket here at all, so nothing hints they exist). `fusible` marks
// a link whose two slotted rings have an authored fusion (the spark).
export function deviceSkillsLayout(bodyRect, game) { /* … hand layout … */ }
```

Import `unlockedSlots`, `adjacentPairs` from `./rings.js` into `layout.js`. (Compute `fusible` by importing `RINGS`/`FUSIONS`/`findFusion` — or pass a precomputed set in from the renderer; keep `layout.js` dependency-light by having the renderer mark fusible links from `game.discoveredFusions` + a live `findFusion` check.)

- [ ] **Step 2: `_drawDeviceSkills` → two hands**

Replace `_drawDeviceSkills` (`renderer.js:1702`) to draw:
- both hands as bare silhouettes (all five fingers always drawn — anatomically honest);
- a socket only where `deviceSkillsLayout` returned one (unrevealed fingers get NO socket, NO lock, NO `???`);
- each filled socket showing its ring (name/colour); empty unlocked sockets an empty band;
- a **spark** on every `fusible` link;
- a small discovered-fusions line if `game.discoveredFusions.size`.

Match the existing `this.font.drawText(...)` option names (grep an existing call).

- [ ] **Step 3: `_tapDevice` → slot/unslot**

In `_tapDevice`'s `'skills'` branch (`main.js:4326`), replace the chip hit-test with a socket hit-test from the new `deviceSkillsLayout`: tapping a filled socket unslots it (`_unslotRing(key)`); tapping an empty socket opens a picker of owned-but-unslotted rings (or, MVF-simplest, cycles the next unslotted owned ring into it via `_slotRing(key, nextOwnedUnslotted)`). Play `menu-tick`, `_render()`, `return`.

- [ ] **Step 4: Delete `skills.js`; relocate `mergeKnown`**

Move `mergeKnown` (and `isActive`, still used by `hasSpell`/`hasTrick`) into `rings.js` (export them), repoint the `main.js` import, then delete `game/skills.js` and `tests/skills.test.js`. Re-grep `from './skills.js'` to catch every importer (main.js, save.js already repointed in Task 3). Run `node --test` to confirm nothing imports the deleted module.

- [ ] **Step 5: Verify in-browser**

Restart the dev server. `g._acquireRing('rat_ring'); g._acquireRing('fire_ring'); g._setRingTier(1);` then open the Remoticon → SKILLS (now the hands). Confirm: three fingers per hand show sockets, thumb + pinky are **bare** (no socket); the two rings sit in sockets; slotting them adjacent shows a spark on the link; tap to unslot removes them from the wheel. Screenshot for Caelan. Console clean.

- [ ] **Step 6: Commit**

```bash
git add game/layout.js game/renderer.js game/main.js game/rings.js
git rm game/skills.js tests/skills.test.js
git commit -m "feat(rings): two-hands loadout UI; retire skills.js"
```

---

## Task 6: Hidden thumb/pinky tiers + passive/trigger application + finish

**Files:**
- Modify: `game/main.js` (tier-unlock gates; passive application in `combatAttack`; trigger after-hit)

- [ ] **Step 1: The hidden-tier unlock gates**

The thumb (tier 3) unlocks on a **disposition** milestone ("cool enough"); the pinky (tier 4) on a **Gold Card / GP** milestone ("fancy enough"). Add a check called from the world-advance path (re-grep `_advanceWorld`) or the relevant milestone hook:

```js
// Hidden ring tiers unlock on SOCIAL states, not kills (the reveal — see spec).
_checkRingUnlocks() {
    if (this.ringTier < 3 && this._peakDisposition >= RING_THUMB_DISPOSITION) {
        this._setRingTier(3);
        this._log('[Your hands feel… readier. Your thumbs, even.]', 'transition');
    }
    if (this.ringTier < 4 && this.gold >= RING_PINKY_GP) {
        this._setRingTier(4);
        this._log('[Fancy enough, now, for a pinky ring.]', 'transition');
    }
}
```

Define the thresholds as named consts near the other tuning consts (`RING_THUMB_DISPOSITION`, `RING_PINKY_GP`) and wire whatever "peak disposition seen" signal exists (re-grep the disposition system; if none tracks a peak, track `this._peakDisposition = Math.max(this._peakDisposition, currentBestDisposition)` where dispositions update). Keep both thresholds tunable and NOT-too-late per the spec.

> No UI, save field, tooltip, or log line may reference tiers 3–4 before they fire. The hands simply gain sockets on a finger that was always drawn bare. Verify nothing leaks (Step 4).

- [ ] **Step 2: Apply aggregate passives in combat**

Where player attack damage is computed (re-grep `combatAttack` and the `attack(...)`/`takeDamage` call above `main.js:3504`), fold in `this.ringMods` before the damage lands:

```js
        // (Rings) passive damage modifiers. fireDamage etc. are percent bonuses;
        // apply the ones that match this attack's damage type (opts.type).
        let dmg = baseDamage;
        const mods = this.ringMods || {};
        if (opts.type === 'fire' && mods.fireDamage) dmg = Math.round(dmg * (1 + mods.fireDamage / 100));
        // (armor/evasion passives read elsewhere: armor in the defender path, evasion in the to-hit/dodge path)
```

Apply `mods.armor` where the player's incoming damage is reduced (re-grep the player-takes-damage path) and `mods.evasion` wherever a dodge/miss chance would read (there is none today — flat damage — so `evasion` is inert until a dodge system exists; that's fine, it's a data-forward field).

- [ ] **Step 3: Fire the on-hit trigger**

After a player hit lands (near the hit-splat, `main.js:3504`), fire any slotted ring's `trigger`:

```js
        // (Rings) on-hit triggers (e.g. Fire Ring → ignite). Ghost/elemental
        // framing only. Uses the seeded RNG, never Math.random (determinism rule).
        for (const key of Object.keys(this.ringSlots)) {
            const r = RINGS[this.ringSlots[key]];
            if (r && r.trigger && r.trigger.on === 'hit' && this._rng() < (r.trigger.chance || 1)) {
                this._applyTrigger(r.trigger, enemyObj);   // implement 'ignite' as a small DoT/status
            }
        }
```

Implement `_applyTrigger` minimally for `'ignite'` (a short burning status or a one-tick fire splat) — model on the existing hazard/status code (re-grep `sludge` status handling). Use the seeded RNG (`this._rng` / Mulberry32 — re-grep the RNG accessor), not `Math.random`.

- [ ] **Step 4: Verify + finish in-browser**

Restart the dev server. Console:

```js
const g = window.__game;
// hidden tiers reveal:
g._peakDisposition = 999; g._checkRingUnlocks(); g.ringTier;   // 3 — thumbs appear
g.gold = 999999;          g._checkRingUnlocks(); g.ringTier;   // 4 — pinky appears
```

Open the hands → thumb then pinky sockets appear on fingers that were bare. Confirm NOTHING hinted at them before the unlock (re-open the hands at tier 2 and inspect — bare). Slot a Fire Ring and swing a fire-typed attack → the passive bonus + ignite trigger fire. Full smoke: combat, trade/give, a quest step, save→reload with rings slotted → everything holds, 0 console errors.

- [ ] **Step 5: Commit**

```bash
git add game/main.js
git commit -m "feat(rings): hidden thumb/pinky tiers + passive/trigger application"
```

---

## Verification (whole branch)

**Automated (`node --test`) — run on a Node box (no local node here; CI):**
- `tests/rings.test.js` — the pure store ops (Task 1).
- `tests/save-roundtrip.test.js` — dropped-items + ring pool/slots round-trip + old-save defaults (Tasks 2–3).
- Full `node --test` — no regressions in the other suites; `skills.test.js` removed (Task 5).

**In-browser (behavioural) — `python dev-server.py 3001` + `window.__game`, restart per `.js` edit:**
- **The spec "Done When":** wererat drops the fur → leave the sewer and return, the fur is still there → Platero fashions the Rat Ring → Rat Form on the wheel → grate becomes passable → reach the Red Cape → later, Rat Ring beside Fire Ring → spark → Ember Rat discovered + castable → save/reload holds.
- **Empty-rings identity:** a fresh game / old save behaves exactly as today (`knownSpells` = base + gear).
- **Persistence:** drop an item, leave, return — still there; pick-up-then-drop-elsewhere doesn't vanish.
- **Hidden reveal:** at tier 2 the hands show three fingers, no hint of more; crossing the disposition then GP thresholds reveals thumb then pinky.
- **Full smoke:** "a merge is done when the game RUNS" — combat, trade/give, a quest step, save→reload, 0 console errors.

**Branch:** `feature/remembrance-rings` off `dev` (after the defeat-scenarios merge). Caelan makes the merge-to-`dev` call. Merge promptly once verified — this touches core files.

---

## Self-Review

- **Spec coverage:** ring model + tags (T1/T3) · 6 visible slots 2→4→6 + hidden thumb/pinky (T1 ladder, T6 gates) · within-hand contiguous adjacency (T1) · resonance + authored tag-keyed fusion (T1/T3) · fusions add & cost no slot (T1 — actives merged, no slot consumed) · every adjacent pair pays something (T1 resonance fallback) · spark discoverability + discovered-fusions log (T5/T3) · Platero fashioning from a remembrance material (T4) · per-zone drop persistence + the compound-loss fix (T2) · absorb skills.js (T3/T5) · rat-form → grate → Red Cape (T4) · Ember Rat = conjured elemental (T4 + ring-data comment) · bare unrevealed fingers (T5/T6) · save four-touch (T2/T3). All spec Gate-2 items map to a task.
- **Type consistency:** `ringSlots` is a plain object `"hand:finger"→ringId|null` everywhere (ctor, `slotRing`/`unslotRing`/`sanitizeSlots`, serialize spread, loadInto spread); `ownedRings`/`discoveredFusions` are `Set`s (ctor + loadInto rebuild), serialized as arrays; `ringTier` an int 0–4 (clamped in validate); `RINGS`/`FUSIONS` shapes match `rings.js` accessors (`.tags`/`.grants`/`.passive`/`.trigger`, fusion `.pair`/`.id`/`.grants`); `_acquireRing`/`_slotRing`/`_unslotRing`/`_setRingTier` signatures match their call sites (Platero, hands UI, tier gates).
- **No placeholders:** every code step is complete. Real "match existing style / re-grep first" seams — all whose exact shape lives in files the implementer opens, with the required behaviour specified — are: the player-drop `_recordDrop` site, the `castTrick` dispatch + `_emberRatStrike` (model on the thrown-burst resolver), the `_removeFromInventory` helper name, Platero's NPC/dialogue def (model on a Downtown vendor + the `onPick` hook), the `_advanceWorld` tick site, the RNG accessor, and the disposition-peak signal. Each is flagged inline.
- **Two known reconciliations, surfaced not hidden:** (1) the spec's line "the fire ring lets you cast fireball" — `fireball` is already a BASE spell, so the Fire Ring instead carries a fire *passive* + *ignite trigger* and its value is the `ember_rat` fusion; noted in `ring-data.js`. (2) `evasion` passive is data-forward — inert until a dodge system exists (combat is flat-damage today); kept because it costs nothing and expresses the ring.
