# Defeat Scenarios — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat death-wipe with **Outward-style varied defeat**: HP→0 picks a scenario weighted by `(zone × who-beat-you × story-state)`, applies a consequence template (wake-location · time-skip · temporary status · safe-floor + aggressor take-rule · recovery · optional gift), spawns a recoverable stash for humanoid robberies, and marks safe-floor items with a protected glyph so the player can see what survives.

**Architecture:** A pure `game/defeat-scenarios.js` (the scenario table + `pickScenario` + take-matcher + `isSafe`/`isBoss`) that `Game` delegates to — mirrors the `ai.js`/`skills.js` extractions so the logic is node-testable. `_die(cause)` → `resolveDefeat` dispatches boss-retry vs. a scenario; a consequence runner applies the template; recovery reuses the existing container system; a protected glyph rides the ITEMS/GEAR device tabs off the shared `isSafe()`.

**Tech Stack:** Vanilla ES modules, `node --test` for the pure module. **No local Node** — the pure module + take-matcher get node tests (CI); every `Game`-integration and UI step verifies in-browser via `python dev-server.py 3001` + `window.__game` (drive `_die`/`resolveDefeat` directly — rAF is paused in the backgrounded tab).

**Spec:** `plans/defeat-scenarios.md` (approved 2026-07-12). This implements its Gate 3/4 sequencing.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `game/defeat-scenarios.js` | **Create** | Pure: `isSafe`, `isBoss`, `partitionInventory`, `matchTake`, `pickScenario`, and `DEFEAT_SCENARIOS` (data table). No game/DOM deps. |
| `tests/defeat-scenarios.test.js` | **Create** | Node unit tests for the pure module. |
| `game/main.js` | Modify | `_lastDefeatedBy` tracking; `_die(cause)` → `resolveDefeat`; `_runScenario`/`_runBossRetry`/`_applyTake`/`_spawnStash`/`_skipTime`; keep `_safeRespawnCell` + de-aggro + autosave. Register buff defs. |
| `game/buffs.js` | Modify | `rattled` / `hunched` / `sludged` temporary buff defs. |
| `game/npc.js` | Modify | Pass the attacking enemy into `applyDamageToPlayer` so the defeater is known. |
| `game/renderer.js` / `game/layout.js` | Modify | Protected glyph + legend on safe-floor items in the ITEMS + GEAR device bodies. |
| `game/enemies.js` | (no change) | `isBoss` reads the existing `tag`; the Wererat already carries `wererat_boss`. |

`game/save.js` needs **no schema change** — the aftermath (inventory, spawned stash-container, buffs, position) persists through existing mechanisms.

---

## Sequencing

One branch `feature/defeat-scenarios` off `dev`. Order: tested core → additive plumbing (behavior ≈ today) → the runner → recovery → flavor → UI. Verify after each; full smoke before done.

1. **Task 1** — pure `defeat-scenarios.js` + node tests.
2. **Task 2** — defeater tracking + `_die(cause)` + dispatch (non-boss → existing `_respawn` as fallback; boss → retry). Minimal visible change (boss retry).
3. **Task 3** — the consequence runner + buff defs; the generic fallback becomes a mild scenario (relocate + partial loss) instead of the full wipe.
4. **Task 4** — recoverable stash spawn + reclaim.
5. **Task 5** — the four flavored sewer scenarios wired to their take-rules.
6. **Task 6** — the protected-item glyph (legibility).

> Line numbers are from `dev` @ `42eebe9` (2026-07-12); re-grep the named symbol before each edit.

---

## Task 1: Pure module `game/defeat-scenarios.js`

**Files:** Create `game/defeat-scenarios.js`, `tests/defeat-scenarios.test.js`.

- [ ] **Step 1: Write the failing tests**

Create `tests/defeat-scenarios.test.js`:

```js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isSafe, isBoss, partitionInventory, matchTake, pickScenario } from '../game/defeat-scenarios.js';

const weapon = { id: 'sword' };
const quest  = { id: 'converter', questItem: true };
const food   = { id: 'meat', category: 'ambro' };
const potion = { id: 'bandage', category: 'med', consumable: true };
const loot   = { id: 'mace', category: 'weapon', baseValue: 20 };

describe('isSafe', () => {
  test('quest items, the equipped weapon, and essential-flagged are safe', () => {
    assert.equal(isSafe(quest, weapon), true);
    assert.equal(isSafe(weapon, weapon), true);
    assert.equal(isSafe({ id: 'x', essential: true }, weapon), true);
  });
  test('ordinary items are not safe', () => {
    assert.equal(isSafe(food, weapon), false);
    assert.equal(isSafe(loot, weapon), false);
  });
});

describe('isBoss', () => {
  test('true only for a _boss tag', () => {
    assert.equal(isBoss({ tag: 'wererat_boss' }), true);
    assert.equal(isBoss({ tag: null }), false);
    assert.equal(isBoss({}), false);
  });
});

describe('partitionInventory', () => {
  test('splits safe vs at-risk, skips holes', () => {
    const inv = [{ itemDef: quest, count: 1 }, null, { itemDef: food, count: 2 }, { itemDef: loot, count: 1 }];
    const { safe, atRisk } = partitionInventory(inv, weapon);
    assert.deepEqual(safe.map(e => e.itemDef.id), ['converter']);
    assert.deepEqual(atRisk.map(e => e.itemDef.id), ['meat', 'mace']);
    assert.equal(atRisk[0].i, 2); // slot index preserved
  });
});

describe('matchTake', () => {
  const atRisk = [{ i: 0, itemDef: food }, { i: 1, itemDef: potion }, { i: 2, itemDef: loot }];
  test('categories rule takes only matching categories (beasts eat food)', () => {
    assert.deepEqual(matchTake({ categories: ['ambro'] }, atRisk).map(e => e.itemDef.id), ['meat']);
  });
  test('breakables rule takes consumables (a fall cracks them)', () => {
    assert.deepEqual(matchTake({ breakables: true }, atRisk).map(e => e.itemDef.id), ['bandage']);
  });
  test('loot:all takes everything at-risk (a full robbery)', () => {
    assert.equal(matchTake({ loot: 'all' }, atRisk).length, 3);
  });
  test('never crashes on an empty pool', () => {
    assert.deepEqual(matchTake({ loot: 'all' }, []), []);
  });
});

describe('pickScenario', () => {
  const S = [
    { id: 'fungus', when: c => c.zone === 'sewer' && /Fungus/.test(c.by?.type || ''), weight: 3, consequence: {} },
    { id: 'wererat', when: c => c.by?.type === 'Wererat', weight: 3, consequence: {} },
    { id: 'fallback', when: () => true, weight: 1, consequence: {} },
  ];
  test('filters by when() and returns a match', () => {
    const pick = pickScenario({ zone: 'sewer', by: { type: 'Violet Fungus' } }, S, () => 0);
    assert.equal(pick.id, 'fungus');
  });
  test('falls back when nothing area/enemy-specific matches', () => {
    const pick = pickScenario({ zone: 'town', by: { type: 'Pigeon' } }, S, () => 0.99);
    assert.equal(pick.id, 'fallback');
  });
  test('weighted pick is deterministic given rand()', () => {
    // rand 0 → first eligible; only fallback matches a Pigeon, so it's chosen regardless
    assert.equal(pickScenario({ zone: 'town', by: { type: 'Pigeon' } }, S, () => 0).id, 'fallback');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/defeat-scenarios.test.js`
Expected: FAIL — `Cannot find module '../game/defeat-scenarios.js'`.

- [ ] **Step 3: Write `game/defeat-scenarios.js`**

```js
// defeat-scenarios.js — the pure core of the Outward-style defeat system.
//
// Game (main.js) is browser-coupled and can't be constructed under node; the
// scenario table + selection + take-matching + safe-floor predicate live here as
// pure functions/data (mirrors ai.js / skills.js). Game's resolveDefeat runner
// delegates here; the ITEMS/GEAR glyph shares isSafe so the marker and the
// take-logic can never disagree.

// An item survives EVERY defeat iff it's a quest item, the equipped weapon, or
// explicitly flagged essential. Everything else is the at-risk pool.
export function isSafe(itemDef, equippedWeapon) {
    if (!itemDef) return false;
    return !!itemDef.questItem || itemDef === equippedWeapon || !!itemDef.essential;
}

// A defeater is a "boss" iff its tag ends in _boss (only the Wererat, for now).
export function isBoss(enemy) {
    return !!(enemy && typeof enemy.tag === 'string' && enemy.tag.endsWith('_boss'));
}

// Split inventory into { safe, atRisk } — entries carry the slot index so the
// caller can null the taken slots. Skips empty slots.
export function partitionInventory(inventory, equippedWeapon) {
    const safe = [], atRisk = [];
    (inventory || []).forEach((slot, i) => {
        if (!slot || !slot.itemDef) return;
        (isSafe(slot.itemDef, equippedWeapon) ? safe : atRisk).push({ i, itemDef: slot.itemDef, count: slot.count });
    });
    return { safe, atRisk };
}

// Which at-risk entries a take-rule claims (pure — caller mutates + spawns stash).
//   categories: take items whose def.category is in the list  (beasts eat food)
//   breakables: take consumables                              (a fall cracks them)
//   loot: 'all' | fraction — take spare gear/junk             (humanoids rob you)
export function matchTake(take, atRisk) {
    if (!take || !atRisk || !atRisk.length) return [];
    let out = atRisk.filter(e => {
        const d = e.itemDef;
        if (take.categories && take.categories.includes(d.category)) return true;
        if (take.breakables && d.consumable && d.category !== 'quest') return true;
        if (take.loot) return true;
        return false;
    });
    if (typeof take.loot === 'number' && take.loot < 1) out = out.slice(0, Math.floor(out.length * take.loot));
    return out;
}

// Weighted pick over scenarios whose when(ctx) is true. rand() ∈ [0,1). Returns
// the chosen scenario, or the last eligible (the generic fallback has when:()=>true
// so there is always at least one). Null only if the table is empty.
export function pickScenario(ctx, scenarios, rand) {
    const eligible = (scenarios || []).filter(s => { try { return s.when(ctx); } catch { return false; } });
    if (!eligible.length) return null;
    const total = eligible.reduce((n, s) => n + (s.weight || 1), 0);
    let r = rand() * total;
    for (const s of eligible) { r -= (s.weight || 1); if (r < 0) return s; }
    return eligible[eligible.length - 1];
}

// The scenario table. Consequences are DECLARATIVE data; Game._runScenario
// interprets them. Seeded with the generic fallback; sewer flavor added in Task 5.
export const DEFEAT_SCENARIOS = [
    {
        id: 'beaten_and_dumped',
        when: () => true,             // generic fallback — always eligible, lowest weight
        weight: 1,
        consequence: {
            wakeAt: null,             // → _safeRespawnCell (zone entrance/spawn)
            hp: 0.5,
            status: 'rattled',
            take: { loot: 0.5, recoverable: false },
            log: '[You come to, beaten and dumped. Some of your things are gone.]',
        },
    },
];
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/defeat-scenarios.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add game/defeat-scenarios.js tests/defeat-scenarios.test.js
git commit -m "feat(defeat): pure scenario table + picker + take-matcher + isSafe"
```

---

## Task 2: Defeater tracking + `_die(cause)` + dispatch

**Files:** `game/main.js` (`applyDamageToPlayer:3754`, `_die:3830`, new `resolveDefeat`/`_runBossRetry`), `game/npc.js` (`:235`).

**Behavior after this task:** non-boss deaths still run the existing `_respawn` (today's wipe) as the fallback — so ordinary defeats are unchanged; a defeat *by the Wererat boss* now resets it and bumps you to retry instead of wiping. Plumbing + one small, verifiable change.

- [ ] **Step 1: Import the pure helpers**

Top of `main.js`, near the `./skills.js` import:

```js
import { isBoss, pickScenario, partitionInventory, matchTake, DEFEAT_SCENARIOS } from './defeat-scenarios.js';
```

- [ ] **Step 2: Track the defeater**

Add an `attacker` param to `applyDamageToPlayer` (`main.js:3754`) and stamp it:

```js
    applyDamageToPlayer(rawDamage, attacker = null) {
        if (attacker) this._lastDefeatedBy = attacker;
        // ... existing body unchanged ...
```

Initialize the field in the constructor (near `this._lastHitTarget`): `this._lastDefeatedBy = null;`

In `game/npc.js:235`, pass the enemy: `game.applyDamageToPlayer(dmg, enemy);` (the enemy object is in scope there — confirm the local variable name and use it).

For hazard deaths (sludge DoT, `game/buffs.js` `sludge.onTick` ≈`:35`), stamp a cause before the lethal decrement: `game._lastDefeatedBy = { cause: 'sludge' };`

- [ ] **Step 3: Route `_die` through `resolveDefeat`**

In `_die` (`main.js:3839`), change the respawn timer:

```js
        setTimeout(() => this._resolveDefeat(), 500);
```

Add `_resolveDefeat` (next to `_respawn`):

```js
    _resolveDefeat() {
        const by = this._lastDefeatedBy;
        this._lastDefeatedBy = null;
        // Boss (Wererat) → reset the encounter and retry; no scenario, no loss.
        if (isBoss(by)) { this._runBossRetry(by); return; }
        // Otherwise pick a scenario. Task 3 swaps the fallback body in; for now the
        // generic fallback delegates to the existing _respawn so ordinary defeats
        // are unchanged.
        const ctx = {
            zone: this.map && (this.map.zoneName || this.map.url),
            by: (by && by.entity) ? by : null,       // an Enemy has .entity; a {cause} does not
            cause: (by && by.cause) || 'unknown',
            quest: this.questEngine && this.questEngine.state,
        };
        const pick = pickScenario(ctx, DEFEAT_SCENARIOS, () => this.rng.next());
        this._runScenario(pick, ctx);
    }

    // Task 3 replaces this stub with the full template runner. For now: today's wipe.
    _runScenario(_pick, _ctx) { this._respawn(); }

    _runBossRetry(boss) {
        if (boss && boss.entity) boss.entity.hp = boss.entity.maxHp;   // reset the boss
        const cell = this._safeRespawnCell();
        this.playerX = cell.x; this.playerY = cell.y;
        this.playerHp = this.playerMaxHp; this.playerMp = this.playerMaxMp;
        this.addBuff('rattled', 'Rattled', 6, 'debuff');
        // Reuse _respawn's de-aggro so the retry starts calm.
        for (const e of this.enemies) {
            if (!e.entity.isAlive() || e._ally) continue;
            if (e.state === 'chasing') e.state = 'idle';
            e._intruder = false; e._emergeDelay = 0;
        }
        this.state = STATE.IDLE;
        this._log('[Down but not out. Regroup and finish it.]', 'transition');
        this._render();
        this._resumeHeldWalk();
        this.autosave({ force: true });
    }
```

(Confirm `this.rng.next()` returns a float in [0,1) — check `game/rng.js`; if the method differs, use the correct one. `pickScenario` only needs a `()=>float-in-[0,1)`.)

- [ ] **Step 4: Verify in-browser**

Restart the dev server. In the console (start a run first):

```js
const g = window.__game;
// Non-boss defeat → unchanged wipe path (via the stub):
g._lastDefeatedBy = g.enemies.find(e => /Fungus/.test(e.type));
g.playerHp = 0; g._die(); // wait ~600ms
// → respawns as today (inventory wiped except quest items). Console clean.
// Boss defeat → retry:
const rat = g.enemies.find(e => e.tag === 'wererat_boss'); rat.entity.hp = 10;
g._lastDefeatedBy = rat; g.playerHp = 0; g._die(); // wait
// → rat.entity.hp back to maxHp, player HP full, 'Rattled' buff, no inventory loss.
```

Confirm: boss retry resets the rat + keeps your items; non-boss still respawns; 0 console errors.

- [ ] **Step 5: Commit**

```bash
git add game/main.js game/npc.js game/buffs.js
git commit -m "feat(defeat): track the defeater + boss-retry dispatch (non-boss = today)"
```

---

## Task 3: Consequence runner + buff defs

**Files:** `game/main.js` (`_runScenario`, `_applyTake`, `_skipTime`, `_resolveWakeCell`), `game/buffs.js`.

- [ ] **Step 1: Add the temporary status buffs**

In `game/buffs.js` `BUFF_DEFS`, add three light, expiring statuses (no permanent effect — flavor + a wear-off, honoring the "not punishing" rule). Model on an existing cosmetic buff; minimal:

```js
    rattled: { name: 'Rattled' },   // temporary; no onTick — expires via _tickBuffs
    hunched: { name: 'Hunched' },
    sludged: { name: 'Sludged' },
```

(If `BUFF_DEFS` entries require an effect, leave `onTick`/`onExpire` off — `_tickBuffs` already decrements `turns` and removes at 0 for defs without hooks. Verify against the `guard`/`recover` entries.)

- [ ] **Step 2: Replace the `_runScenario` stub with the real runner**

```js
    _runScenario(pick, _ctx) {
        const c = (pick && pick.consequence) || {};
        // 1. wake location (+ optional map change)
        const cell = this._resolveWakeCell(c.wakeAt);
        this.playerX = cell.x; this.playerY = cell.y;
        // 2. vitals — a temporary hit, never below a floor
        this.playerHp = Math.max(1, Math.round(this.playerMaxHp * (c.hp ?? 0.5)));
        this.playerMp = this.playerMaxMp;
        // 3. time skip
        if (c.timeSkip) this._skipTime(c.timeSkip);
        // 4. status
        if (c.status) this.addBuff(c.status, (BUFF_DEFS[c.status] && BUFF_DEFS[c.status].name) || c.status, 6, 'debuff');
        // 5. what's taken (safe floor is never touched)
        if (c.take) this._applyTake(c.take);
        // 6. what's given (rescue rolls)
        if (c.gift && Array.isArray(c.gift.items)) for (const id of c.gift.items) this._addToInventory(id);
        if (c.gift && c.gift.heal) this.playerHp = this.playerMaxHp;
        // 7. de-aggro + resume (reuse the _respawn tail)
        this._pendingTransition = null;
        for (const e of this.enemies) {
            if (!e.entity.isAlive() || e._ally) continue;
            if (e.state === 'chasing') e.state = 'idle';
            e._intruder = false; e._emergeDelay = 0;
        }
        this.state = STATE.IDLE;
        if (c.log) this._log(c.log, 'transition');
        this._render();
        this._resumeHeldWalk();
        this.autosave({ force: true });
    }

    // Resolve a wakeAt spec to a walkable cell. { spot:{x,y} } → that tile;
    // missing/unknown → _safeRespawnCell (zone spawn). (Named-region 'spot' strings
    // and cross-map wakes are added with the flavored scenarios in Task 5.)
    _resolveWakeCell(wakeAt) {
        if (wakeAt && wakeAt.spot && typeof wakeAt.spot === 'object'
            && this.map.isWalkable(wakeAt.spot.x, wakeAt.spot.y)) return wakeAt.spot;
        return this._safeRespawnCell();
    }

    // Advance the day/night clock by a coarse amount. MVF: bump the turn counter +
    // the day-clock accumulator and log; reuses _advanceDayClock's easing.
    _skipTime(kind) {
        const beats = kind === 'morning' ? 40 : 8;
        for (let i = 0; i < beats; i++) this._advanceDayClock();
        this.turn += beats;
    }

    _applyTake(take) {
        const weapon = this.equipment && this.equipment.weapon;
        const { atRisk } = partitionInventory(this.inventory, weapon);
        const taken = matchTake(take, atRisk);
        let takenGold = 0;
        if (take.gold) { takenGold = Math.floor((this.gold || 0) * take.gold); this.gold -= takenGold; }
        for (const e of taken) this.inventory[e.i] = null;   // remove from the bag
        // Task 4 fills in the recoverable stash. For now, taken items are gone;
        // a recoverable rule is honored there.
        if (take.recoverable && (taken.length || takenGold)) {
            this._spawnStash?.(take.stashAt, taken.map(e => e.itemDef.id), takenGold);
        }
    }
```

Ensure `BUFF_DEFS` is imported in `main.js` (it's used via `game/buffs.js`; check the existing import — `tickBuffList` is imported from `./buffs.js`; add `BUFF_DEFS` to that import if not present).

- [ ] **Step 3: Point the generic fallback at the runner**

No code change — the `beaten_and_dumped` consequence (Task 1) already drives the runner: wake at spawn, HP 50%, `rattled`, lose half the at-risk loot (non-recoverable). The full wipe is now gone; ordinary defeats keep the safe floor + half their loot.

- [ ] **Step 4: Verify in-browser**

Restart. Console:

```js
const g = window.__game;
// give the player some at-risk + safe items
g.gold = 100;
// (put a couple non-quest items in inventory via the debug pickups or _addToInventory)
g._addToInventory('rock'); g._addToInventory('bandage');
const before = g.inventory.filter(Boolean).map(s => s.itemDef.id);
g._lastDefeatedBy = { cause: 'unknown' }; g.playerHp = 0; g._die(); // wait ~600ms
// → NOT a full wipe: quest items + equipped weapon remain; ~half the loot gone;
//   'Rattled' buff present; HP ~50%; console clean.
g.hasBuff && g.hasBuff('rattled'); g.buffs.map(b => b.id);
```

Confirm the safe floor survived, only part of the loot left, the status applied, HP ~50%, no errors.

- [ ] **Step 5: Commit**

```bash
git add game/main.js game/buffs.js
git commit -m "feat(defeat): consequence runner (wake/time/status/take/gift) + status buffs"
```

---

## Task 4: Recoverable stash (spawn + reclaim)

**Files:** `game/main.js` (`_spawnStash`, reusing the container system).

- [ ] **Step 1: Spawn the stash as a container**

Containers are `{ id, type, x, y, contents:[...] }` on `this.containers` (`main.js:326`), rendered + bump-opened via `_openContainer` (`main.js:3407`) and persisted by save.js. Add:

```js
    // A recoverable stash of the loot a humanoid took — a container the player
    // can go back and open (fight/reach it). Placed at a reachable tile near the
    // named spot, else beside the player's wake cell. gold-in-stash is a follow-up;
    // MVF stashes hold the taken ITEMS (gold taken is a non-recoverable mugging).
    _spawnStash(stashAt, itemIds, _gold) {
        if (!itemIds || !itemIds.length) return;
        const near = (stashAt && stashAt.spot && typeof stashAt.spot === 'object') ? stashAt.spot
                   : { x: this.playerX, y: this.playerY };
        const cell = this._nearestFreeTile(near) || near;
        this.containers.push({
            id: `stash_${this.turn}_${Math.round(cell.x)}_${Math.round(cell.y)}`,
            type: 'chest',
            x: cell.x, y: cell.y,
            contents: itemIds.slice(),
        });
    }
```

Reuse an existing free-tile finder for `_nearestFreeTile` — `_safeRespawnCell`'s ring-scan is the model; if no shared helper exists, extract the ring-scan or place at `near` when walkable. (Confirm the exact helper name during implementation; `_safeRespawnCell` at `main.js:3887` contains the scan.)

- [ ] **Step 2: Wire `recoverable` in `_applyTake`**

Already called in Task 3's `_applyTake` (`this._spawnStash?.(...)`). Remove the optional-chain now that it exists: `if (take.recoverable && taken.length) this._spawnStash(take.stashAt, taken.map(e => e.itemDef.id), takenGold);`

- [ ] **Step 3: Verify in-browser**

Restart. Console:

```js
const g = window.__game;
g._addToInventory('rock'); g._addToInventory('mace' /* any non-quest */);
const before = g.containers.length;
g._applyTake({ loot: 'all', recoverable: true, stashAt: { spot: { x: g.playerX + 1, y: g.playerY } } });
g.containers.length > before;                 // a stash container spawned
g.containers.at(-1).contents;                  // the taken item ids
```

Then walk onto/bump the stash tile and confirm `_openContainer` returns the loot to your bag. Console clean.

- [ ] **Step 4: Commit**

```bash
git add game/main.js
git commit -m "feat(defeat): recoverable loot stash via a spawned container"
```

---

## Task 5: The four flavored sewer scenarios + take-rules

**Files:** `game/defeat-scenarios.js` (add table entries), `game/main.js` (`_resolveWakeCell` named spots, if used).

- [ ] **Step 1: Add the scenarios to `DEFEAT_SCENARIOS`**

Insert BEFORE the `beaten_and_dumped` fallback (order doesn't matter for `pickScenario`, but keep the fallback last for readability):

```js
    {
        id: 'processed_by_fungus',
        when: c => c.zone && /sewer/i.test(c.zone) && c.by && /Fungus/.test(c.by.type || ''),
        weight: 3,
        consequence: {
            wakeAt: { spot: { x: 10, y: 9 } },       // near the soap-mine (confirm a walkable tile on sewer-map.json)
            hp: 0.5, timeSkip: 'hours', status: 'hunched',
            take: { categories: ['ambro'], recoverable: false },   // they feast on your food/mushrooms — gone
            log: '[You wake in a spore-cell. Your provisions are gone; the Fungus fed well.]',
        },
    },
    {
        id: 'robbed_by_wererats',
        when: c => c.zone && /sewer/i.test(c.zone) && c.by && (c.by.type || '') === 'Wererat',
        weight: 3,
        consequence: {
            wakeAt: null,                             // sewer mouth (spawn)
            hp: 0.6, status: 'rattled',
            take: { gold: 0.3, loot: 'all', recoverable: true, stashAt: { spot: { x: 17, y: 10 } } }, // wererat den
            log: "[The rats rolled you and scampered off with your haul. You'll want it back.]",
        },
    },
    {
        id: 'swept_into_sludge',
        when: c => c.zone && /sewer/i.test(c.zone) && (c.cause === 'sludge' || c.cause === 'fall'),
        weight: 2,
        consequence: {
            wakeAt: null, hp: 0.5, status: 'sludged',
            take: { breakables: true, recoverable: false },   // bandages/soap cracked in the current
            log: '[The sludge river took you downstream. Your kit is soaked and cracked.]',
        },
    },
    {
        id: 'patched_by_carrion',
        when: c => c.zone && /sewer/i.test(c.zone),
        weight: 1,                                   // the hope roll — low weight, any sewer defeat
        consequence: {
            wakeAt: { spot: { x: 8, y: 16 } },        // Carrion's corridor (confirm walkable)
            hp: 1.0,
            take: { gold: 0.1, recoverable: false },  // a small fee, not a robbery
            gift: { items: ['bandage'] },
            log: "[Carrion dragged you to his corner and patched you up. 'You owe me,' he grunts.]",
        },
    },
```

Confirm the `spot` tiles are walkable on `game/sewer-map.json` (open it / check in-browser); adjust coords to real floor tiles. If a named region is cleaner than raw coords, extend `_resolveWakeCell` to map a `spot` string (e.g. `'wererat-den'`) to a map region.

- [ ] **Step 2: Verify each in-browser**

Restart. For each defeater, set `_lastDefeatedBy` and kill the player, then assert the right scenario fired:

```js
const g = window.__game;
function defeatBy(by) { g._lastDefeatedBy = by; g.playerHp = 0; g._die(); }
// Fungus → food/mushrooms gone, 'hunched', wake near soap-mine:
defeatBy(g.enemies.find(e => /Fungus/.test(e.type)));  // wait, then inspect g.buffs, inventory, playerX/Y
// Wererat → gold+loot taken, stash spawned at the den, 'rattled':
defeatBy(g.enemies.find(e => e.type === 'Wererat' && e.tag !== 'wererat_boss'));
// Sludge → breakables cracked:
defeatBy({ cause: 'sludge' });
```

(Give the player relevant items first via `_addToInventory` so there's something to take.) Confirm: each scenario's wake spot, status, and take-rule; the Wererat stash exists at the den and reclaims; the quest converter is NEVER taken in any of them; console clean.

- [ ] **Step 3: Commit**

```bash
git add game/defeat-scenarios.js game/main.js
git commit -m "feat(defeat): four flavored sewer scenarios (fungus/wererat/sludge/carrion)"
```

---

## Task 6: Protected-item glyph (legibility)

**Files:** `game/layout.js` (badge rect), `game/renderer.js` (draw the glyph + legend in ITEMS + GEAR bodies), `game/defeat-scenarios.js` (already exports `isSafe`).

- [ ] **Step 1: A shared "is this item protected" check the renderer can call**

The renderer already imports from `layout.js`/`items.js`; import `isSafe` from `./defeat-scenarios.js`. A tiny helper avoids repeating the weapon lookup:

```js
// in renderer.js
import { isSafe } from './defeat-scenarios.js';
const _protected = (game, itemDef) => isSafe(itemDef, game.equipment && game.equipment.weapon);
```

- [ ] **Step 2: Draw the glyph on safe items in the ITEMS body**

In `_drawHotbar` (`renderer.js` — the ITEMS tab body), after each occupied slot is drawn, if `_protected(game, slot.itemDef)` draw a small lock badge in the slot's top-right corner (a filled 8×8 square + a lock char via `this.font`, or a tiny SVG-less glyph). Add a one-line legend under the hotbar: `this.font.drawText(ctx, '\u{1F512} = kept if defeated', bodyRect.x + 4, <belowHotbar>, { color: UI.dim, scale: 1 })` — use a plain ASCII marker if the bitmap font lacks the emoji (e.g. `'[K] = kept if defeated'` and draw `K` in the badge). Match the font's available glyphs (plain ASCII 32–126 per the bitmap font).

- [ ] **Step 3: Draw the glyph on the equipped weapon in the GEAR body**

In `_drawEquipmentModal` (GEAR tab), the weapon plate is always the safe one; badge it (and any `essential`/quest gear if shown). Reuse the same corner-badge helper.

- [ ] **Step 4: Verify in-browser**

Restart. Give the player a quest item + ordinary items; open the Remoticon ITEMS tab and confirm the quest converter (and, in GEAR, the equipped weapon) show the protected badge while ordinary items don't; the legend renders. Screenshot for Caelan. Console clean.

- [ ] **Step 5: Commit**

```bash
git add game/layout.js game/renderer.js
git commit -m "feat(defeat): protected-item glyph so players see what survives a defeat"
```

---

## Verification (whole branch)

**Automated (`node --test` — run on a Node box; no local node here):**
- `tests/defeat-scenarios.test.js` — isSafe / isBoss / partition / matchTake / pickScenario (Task 1).
- Full `node --test` — no regressions (esp. `save-roundtrip`, `buffs`).

**In-browser (`python dev-server.py 3001` + `window.__game`, restart per `.js` edit):**
- **Each sewer defeater** → the right scenario: Fungus eat your food/mushrooms (`hunched`); Wererats rob loot+gold and a **recoverable stash** appears at the den (reclaim it); a sludge/fall cracks breakables (`sludged`); the low-weight Carrion roll heals + gifts a bandage.
- **Safe floor holds every time** — the quest converter and equipped weapon are NEVER taken (spec invariant; also the anti-soft-lock guarantee).
- **Boss** (Wererat `wererat_boss`) → resets to full + retry, no item loss.
- **Unknown defeater** → generic `beaten_and_dumped` fallback, no crash.
- **Save round-trip after a defeat** → inventory, the spawned stash-container, the status buff, and position all persist.
- **Legibility** → protected badge on safe items in ITEMS/GEAR + the legend.
- **Full smoke:** die to each defeater, reclaim a stash, save/reload, confirm the converter quest can't soft-lock — "a merge is done when the game RUNS."

**Branch:** `feature/defeat-scenarios` off `dev`. Caelan makes the merge call. Touches core files (`main.js`, `buffs.js`, `npc.js`, `renderer.js`) — merge promptly once verified.

---

## Self-Review

- **Spec coverage:** weighted picker (T1) · safe floor + take-rule (T1/T3) · defeater tracking (T2) · boss-retry seam (T2) · consequence template incl. gift (T3) · temporary statuses (T3) · recoverable stash (T4) · the 4 sewer scenarios + generic fallback (T1/T5) · legibility glyph (T6) · no new save schema (verified in T5/whole-branch). Every Gate-2 element maps to a task.
- **Type consistency:** `partitionInventory` entries are `{ i, itemDef, count }` everywhere; `matchTake` consumes them and returns the same shape; `_applyTake` reads `.i`/`.itemDef.id`; `pickScenario(ctx, scenarios, rand)` signature matches all call sites; consequence keys (`wakeAt`/`hp`/`timeSkip`/`status`/`take`/`gift`/`log`) are identical in the table and the runner; `take` keys (`categories`/`breakables`/`loot`/`gold`/`recoverable`/`stashAt`) match between `matchTake`/`_applyTake` and the scenarios.
- **No placeholders:** every step has real code. Three spots defer detail to their own step by design (the `_nearestFreeTile`/ring-scan helper name, the exact sewer wake-tile coords, and the bitmap-font glyph vs. ASCII marker) — each names the file + the check to run, not a vague "handle it."
- **Ordering safety:** T2 keeps ordinary defeats = today (delegates to `_respawn`) so the risky death-path change lands behind a stub first; T3 swaps in the real runner; the full wipe is only removed once the safe-floor runner is proven. `_spawnStash` is optional-chained in T3 and made concrete in T4.
