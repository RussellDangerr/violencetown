# PD-3 + NH-3 AI-Consolidation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Consolidate Violencetown's two enemy-AI code paths into one FSM and untangle the `behavior` field into `capabilities` / `allegiance` / `fsmState` — **behavior-preserving** (the game plays identically).

**Architecture:** Approach A from [plans/pd3-ai-consolidation.md](pd3-ai-consolidation.md). `npc.js tickNpcState` becomes the single state dispatcher and gains a `HOSTILE` case whose body is the *current chase block relocated verbatim*. `behavior` is parsed once at construction into an immutable `capabilities` set + an initial `allegiance` (`'hostile'|'neutral'|'ally'`); runtime code reads `allegiance` via one `isHostile(e)` predicate and never mutates `behavior` again. The dual-clock (hostiles per player-turn, neutrals per heartbeat) is preserved.

**Tech Stack:** vanilla ES modules, no build step. **No Node on this machine** → behavioral verification is in-browser (`python dev-server.py 3001` + `window.__game`, driving the real resolvers); node unit tests are added but run under CI / `npm test` elsewhere.

**Sequencing principle:** each task leaves the game fully playable. Order is chosen so `allegiance` becomes readable (Task 1), then authoritative-for-reads (Task 2), then *persisted* (Task 3), then authoritative-for-dispatch with the chase relocated (Task 4). Restart the dev server after every `.js` edit (ES-module cache); dispatch `keyup` with every synthetic `keydown`; drive logic directly (rAF is paused in the backgrounded preview tab).

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `game/enemies.js` | `Enemy` class + the two turn resolvers | ctor parses `behavior`→`capabilities`+`allegiance`; `resolveEnemyTurns`/`resolveAmbientTurns` route by `allegiance`; the inline chase block **moves out** (to npc.js). `toSave`/`fromSave` gain `allegiance`. |
| `game/npc.js` | the FSM (`tickNpcState` + `STATE`) | gains a live `HOSTILE` case = the relocated chase. |
| `game/ai.js` *(new, tiny)* | shared AI predicates | exports `isHostile(e)` (and `deriveAllegiance`/`parseCapabilities` used by ctor + fromSave) — a neutral home both `enemies.js` and `main.js`/`wheel-model.js`/`items.js` import without a cycle. |
| `game/main.js` | hostility gates + allegiance transitions | ~7 gate reads → `isHostile()`; `_onEntityHarmed`/`_revertAlly`/summon set `allegiance`. |
| `game/wheel-model.js` | `targetVerbs`/`defaultVerb` | 2 gate reads → `isHostile()`. |
| `game/items.js` | thrown-AoE friendly filter | 1 gate read → `isHostile()`. |
| `game/give-action.js` | `becomeAlly` flip | sets `allegiance='ally'`. |
| `tests/ai.test.js` *(new)* | unit-test the predicates | `isHostile`, `deriveAllegiance`, `parseCapabilities`. |
| `tests/save-roundtrip.test.js` | extend | allegiance round-trip + derive-from-old-save. |

**Design note — why a new `game/ai.js`:** `isHostile` is read by `enemies.js`, `main.js`, `wheel-model.js`, and `items.js`. Putting it in `wheel-model.js` would make `enemies.js` import the UI-ish wheel module; a 6-line leaf module (`ai.js`, imports nothing) is the clean home and avoids any import cycle.

---

## Task 0: Branch + baseline behavior snapshot

**Files:** none (git + verification only).

- [ ] **Step 1: Create the branch off dev**

```bash
git checkout dev
git checkout -b feature/ai-consolidation
```

- [ ] **Step 2: Capture a baseline behavior snapshot in-browser**

Start the server, load the game, and record the current AI behavior so Task 4 can prove parity. Restart server first for fresh modules.

Run (PowerShell): `python dev-server.py 3001` (via preview_start name "violencetown"), navigate to `http://localhost:3001/`, then in the console (`window.__game`):

```js
// Baseline: born-hostile chases last-seen; a neutral wanders; provoke works.
// Uses the same real-resolver probes Task 4 will re-run. Save the JSON output.
(async () => {
  const g = window.__game;
  const { Enemy, resolveEnemyTurns } = await import('./enemies.js');
  const walk = (x,y)=>g.map.isWalkable(x,y);
  let b=null; for (let y=0;y<g.map.height&&!b;y++) for (let x=0;x<g.map.width-2;x++) if (walk(x,y)&&walk(x+1,y)&&walk(x+2,y)&&walk(x,y+8)) { b={x,y}; break; }
  const saved=g.enemies, sx=g.playerX, sy=g.playerY;
  const e=new Enemy({id:'probe',type:'Bandit',x:b.x,y:b.y,sightRange:3}); e.homeX=b.x; e.homeY=b.y; e.state='chasing'; e._lastSeenX=b.x+1; e._lastSeenY=b.y;
  g.enemies=[e]; g.playerX=b.x; g.playerY=b.y+8;      // blind
  resolveEnemyTurns(g);
  const blindStep={x:e.x,y:e.y,expect:{x:b.x+1,y:b.y}};
  g.enemies=saved; g.playerX=sx; g.playerY=sy;
  window.__baseline={blindStep}; return JSON.stringify(window.__baseline);
})();
```

Expected: `blindStep` moved to `{x:b.x+1,y:b.y}` (PD-1 last-seen pursuit). Record it.

- [ ] **Step 3: Commit the branch point (no changes yet)** — skip; nothing to commit. Proceed.

---

## Task 1: `game/ai.js` predicates + `capabilities`/`allegiance` fields (additive, `behavior` still authoritative)

**Files:**
- Create: `game/ai.js`
- Modify: `game/enemies.js` (Enemy ctor)
- Test: `tests/ai.test.js`

- [ ] **Step 1: Write the failing unit test**

Create `tests/ai.test.js`:

```js
// ai.test.js — the shared AI predicates (PD-3/NH-3).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isHostile, deriveAllegiance, parseCapabilities } from '../game/ai.js';

describe('deriveAllegiance', () => {
  test('no behavior array → hostile (born chaser)', () => {
    assert.equal(deriveAllegiance({ behavior: null }), 'hostile');
    assert.equal(deriveAllegiance({}), 'hostile');
  });
  test('an ambient behavior array → neutral', () => {
    assert.equal(deriveAllegiance({ behavior: ['IDLE', 'WANDER'] }), 'neutral');
  });
  test('legacy ALLIED array or _ally → ally', () => {
    assert.equal(deriveAllegiance({ behavior: ['ALLIED'] }), 'ally');
    assert.equal(deriveAllegiance({ behavior: null, _ally: true }), 'ally');
  });
});

describe('parseCapabilities', () => {
  test('collects ambient states, drops ALLIED/HOSTILE tokens', () => {
    const caps = parseCapabilities(['IDLE', 'WANDER', 'WORKING', 'ALLIED']);
    assert.ok(caps.has('IDLE') && caps.has('WANDER') && caps.has('WORKING'));
    assert.ok(!caps.has('ALLIED'));
  });
  test('null behavior → empty capability set', () => {
    assert.equal(parseCapabilities(null).size, 0);
  });
});

describe('isHostile', () => {
  test('true iff allegiance === hostile', () => {
    assert.equal(isHostile({ allegiance: 'hostile' }), true);
    assert.equal(isHostile({ allegiance: 'neutral' }), false);
    assert.equal(isHostile({ allegiance: 'ally' }), false);
  });
});
```

- [ ] **Step 2: Verify it fails** — Run `npm test` on a node box / CI. Expected: FAIL (`../game/ai.js` not found). *(Locally: no node; skip — the browser import in Step 4 is the local proof.)*

- [ ] **Step 3: Create `game/ai.js`**

```js
// ai.js — shared enemy-AI predicates (PD-3/NH-3). Leaf module (imports nothing)
// so every consumer (enemies/main/wheel-model/items) can use it without a cycle.
//
// `behavior` (the authored ctor input) is parsed ONCE into these two orthogonal
// things; runtime code reads `allegiance`, never `behavior`:
//   capabilities — immutable ambient states an NPC may occupy (IDLE/WANDER/WORKING)
//   allegiance   — mutable 'hostile' | 'neutral' | 'ally'

const AMBIENT_STATES = ['IDLE', 'WANDER', 'WORKING'];

// The immutable ambient-state whitelist from the authored `behavior` array.
// Born-hostiles (null behavior) get an empty set. ALLIED/HOSTILE tokens are not
// ambient capabilities (allegiance carries those).
export function parseCapabilities(behavior) {
  const caps = new Set();
  if (Array.isArray(behavior)) for (const s of behavior) if (AMBIENT_STATES.includes(s)) caps.add(s);
  return caps;
}

// Initial allegiance from the legacy spawn/save shape. Mirrors today exactly:
// an ALLIED array or a truthy _ally is an ally; a missing behavior array is a
// born-hostile chaser; anything else is a neutral townsperson.
export function deriveAllegiance(src) {
  const b = src && src.behavior;
  if ((Array.isArray(b) && b.includes('ALLIED')) || (src && src._ally)) return 'ally';
  if (b == null) return 'hostile';
  return 'neutral';
}

// The one hostility predicate — replaces the ~9 inline `!behavior && !_ally` checks.
export function isHostile(e) {
  return !!e && e.allegiance === 'hostile';
}
```

- [ ] **Step 4: Populate the fields in the Enemy constructor (additive)**

In `game/enemies.js`: add the import at the top, and in the constructor (right after `this.behavior = behavior;`, in the FSM-config block) derive the two new fields. **Do not remove `behavior` or `_ally` — this step is purely additive.**

Import (with the other imports near the top):
```js
import { parseCapabilities, deriveAllegiance } from './ai.js';
```

In the ctor, after `this.behavior = behavior;`:
```js
// (PD-3/NH-3) `behavior` is parsed ONCE into orthogonal fields; runtime code
// reads these, not `behavior`. Additive for now — behavior/_ally still drive
// dispatch until later tasks flip over.
this.capabilities = parseCapabilities(behavior);
this.allegiance   = deriveAllegiance({ behavior });
```

- [ ] **Step 5: Verify in-browser (fields populate; zero behavior change)**

Restart server, reload, console:
```js
(async () => {
  const { Enemy } = await import('./enemies.js');
  const hostile = new Enemy({ id:'h', type:'Bandit', x:0, y:0 });
  const folk = new Enemy({ id:'f', type:'Local', x:0, y:0, behavior:['IDLE','WANDER'] });
  return JSON.stringify({
    hostile: { allegiance: hostile.allegiance, caps: [...hostile.capabilities] },
    folk:    { allegiance: folk.allegiance,    caps: [...folk.capabilities] },
  });
})();
```
Expected: `hostile → {allegiance:'hostile', caps:[]}`, `folk → {allegiance:'neutral', caps:['IDLE','WANDER']}`. Then boot the game (`window.__game.state`), confirm no console errors — nothing reads the new fields yet, so gameplay is unchanged.

- [ ] **Step 6: Commit**

```bash
git add game/ai.js game/enemies.js tests/ai.test.js
git commit -m "feat(ai): add isHostile + capabilities/allegiance fields (additive, PD-3/NH-3 step 1)"
```

---

## Task 2: Route the hostility gates + allegiance transitions through `allegiance`

Reads flip to `isHostile()`; the transition sites set `allegiance` **and keep the old `behavior`/`_ally` writes (dual-write)** so dispatch (still on `behavior`) keeps working. This makes `allegiance` authoritative for *reads* while staying behavior-preserving.

**Files:** Modify `game/main.js`, `game/wheel-model.js`, `game/items.js`, `game/give-action.js`.

- [ ] **Step 1: Import `isHostile` where the gates live**

Add `import { isHostile } from './ai.js';` to `game/main.js`, `game/wheel-model.js`, and `game/items.js` (top, with existing imports).

- [ ] **Step 2: Replace every hostility-gate read with `isHostile(e)`**

Grep the pattern and replace each. The current shape is `(!e.behavior || e.behavior.includes('HOSTILE')) && !e._ally` (spelling varies: `e.behavior == null`, `!foe.behavior`, sometimes without the `&& !_ally`). Replace with `isHostile(e)`.

Run: `git grep -n "behavior.*HOSTILE\|behavior == null\|!e.behavior\|!foe.behavior\|!npc.behavior" -- game/` to enumerate. Expected sites (verify each against current lines):
- `main.js` `_adjacentHostiles` (combat-critical) → `isHostile(e)`
- `main.js` `_isHostileToPlayer` (combat-critical) → `return isHostile(e) && e.entity.isAlive();` (keep the alive check)
- `main.js` `_onEntityHarmed`'s early-out `const hostile = …` → `if (isHostile(target)) return;`
- `main.js` zone-pursuit follow set (`_zonePursuit`/`_captureFollowers`) → `isHostile(e)`
- `main.js` `_onEntityHarmed`-adjacent examine text ("Looks like trouble") → `isHostile(e)`
- `wheel-model.js` `targetVerbs` `const hostile = …` → `const hostile = isHostile(e);`
- `wheel-model.js` `defaultVerb` `const hostile = …` → `const hostile = isHostile(npc);`
- `items.js` thrown-AoE friendly filter (`!foe.behavior || …`) → `isHostile(foe)`

For each: read the current line, confirm it matches the pattern, replace the boolean with `isHostile(<var>)`, preserve any surrounding `&& !e._ally` by **removing** it (isHostile already excludes allies).

- [ ] **Step 3: Make the transition sites set `allegiance` (dual-write with the existing behavior writes)**

`main.js _onEntityHarmed` — after the existing `target.behavior = null;` line, add:
```js
target.allegiance = 'hostile';
```

`main.js _revertAlly` — after `enemyObj.behavior = null;`, add:
```js
enemyObj.allegiance = 'hostile';
```

`give-action.js becomeAlly` (after `recipient.behavior = ['ALLIED'];`) add:
```js
recipient.allegiance = 'ally';
```

`main.js` summon constructor (`new Enemy({ ..., behavior: ['ALLIED'] })`) — the ctor's `deriveAllegiance({behavior:['ALLIED']})` already yields `'ally'`, so no change needed; confirm by reading the summon site.

- [ ] **Step 4: Verify in-browser — gates read allegiance, behavior parity holds**

Restart, reload, console. Confirm the gates now key on `allegiance`:
```js
(async () => {
  const g = window.__game;
  const { Enemy } = await import('./enemies.js');
  const wm = await import('./wheel-model.js');
  const born = new Enemy({ id:'b', type:'Bandit', x:0, y:0 });                 // hostile
  const folk = new Enemy({ id:'f', type:'Local', x:0, y:0, behavior:['IDLE'] }); // neutral
  const t = (e) => wm.targetVerbs({ npc: e }, g).map(v => v.key);
  const before = { born: t(born).includes('hit'), folk: t(folk).includes('hit') };
  g._onEntityHarmed(folk, { kind: 'attack' });   // provoke
  const afterProvoke = { folkAllegiance: folk.allegiance, folkHitVerb: t(folk).includes('hit') };
  return JSON.stringify({ before, afterProvoke });
})();
```
Expected: `before.born:true` (hostile shows Hit), `before.folk:false` (neutral doesn't); after provoke `folkAllegiance:'hostile'` and `folkHitVerb:true`. Then in the real game: strike a townsperson/vendor → "turns on you" + it chases (dispatch still via behavior=null dual-write). Zero console errors.

- [ ] **Step 5: Commit**

```bash
git add game/main.js game/wheel-model.js game/items.js game/give-action.js
git commit -m "refactor(ai): gates read isHostile(); transitions set allegiance (dual-write, PD-3 step 2)"
```

---

## Task 3: Persist `allegiance` (serialize + derive from old saves)

`allegiance` must round-trip before it becomes the sole dispatch source in Task 4.

**Files:** Modify `game/enemies.js` (`toSave`/`fromSave`), `tests/save-roundtrip.test.js`.

- [ ] **Step 1: Write the failing save tests**

Add to `tests/save-roundtrip.test.js` (inside the PD-5 describe or a new one — imports `Enemy` already present after PD-5):

```js
describe('allegiance round-trip + derive-from-old-save (PD-3)', () => {
  const rt = (e) => Enemy.fromSave(JSON.parse(JSON.stringify(e.toSave())));
  test('a provoked neutral stays hostile across a round-trip', () => {
    const e = new Enemy({ id:'n', type:'Local', x:1, y:1, behavior:['IDLE','WANDER'] });
    e.allegiance = 'hostile';                       // provoked at runtime
    assert.equal(rt(e).allegiance, 'hostile', 'runtime provoke must survive reload');
  });
  test('an OLD save (no allegiance) derives from behavior/_ally', () => {
    const oldAlly    = Enemy.fromSave({ id:'a', type:'X', x:0, y:0, behavior:['ALLIED'], ally:true });
    const oldHostile = Enemy.fromSave({ id:'h', type:'X', x:0, y:0, behavior:null });
    const oldFolk    = Enemy.fromSave({ id:'f', type:'X', x:0, y:0, behavior:['IDLE'] });
    assert.equal(oldAlly.allegiance, 'ally');
    assert.equal(oldHostile.allegiance, 'hostile');
    assert.equal(oldFolk.allegiance, 'neutral');
  });
});
```

- [ ] **Step 2: Verify it fails** — CI/`npm test`: FAIL (allegiance not serialized → `rt(e).allegiance` re-derives `'neutral'` from behavior). Locally: the browser check in Step 4 proves it.

- [ ] **Step 3: Serialize + derive**

`game/enemies.js` `toSave()` — add to the returned object (with the allegiance/summon block from PD-5):
```js
allegiance: this.allegiance,
```

`game/enemies.js` `Enemy.fromSave(s)` — the `new Enemy(s)` call already runs `deriveAllegiance({behavior:s.behavior, _ally:s.ally})` in the ctor (Task 1). Add an explicit override so a *serialized* allegiance wins over the derived one, and OLD saves (no `s.allegiance`) fall back to the derived value:
```js
if (s.allegiance) e.allegiance = s.allegiance;   // new saves: explicit; old saves: keep the ctor-derived value
```
(Place it with the other `fromSave` field restores, near the `if (s.ally) e._ally = true;` line from PD-5.)

- [ ] **Step 4: Verify in-browser (round-trip + old-save derive)**

Restart, reload, console:
```js
(async () => {
  const { Enemy } = await import('./enemies.js');
  const rt = (e) => Enemy.fromSave(JSON.parse(JSON.stringify(e.toSave())));
  const prov = new Enemy({ id:'n', type:'Local', x:1, y:1, behavior:['IDLE'] }); prov.allegiance='hostile';
  const oldAlly = Enemy.fromSave({ id:'a', type:'X', x:0, y:0, behavior:['ALLIED'], ally:true });
  return JSON.stringify({ provokedRoundTrip: rt(prov).allegiance, oldAllyDerived: oldAlly.allegiance });
})();
```
Expected: `{provokedRoundTrip:'hostile', oldAllyDerived:'ally'}`.

- [ ] **Step 5: Commit**

```bash
git add game/enemies.js tests/save-roundtrip.test.js
git commit -m "feat(save): persist allegiance + derive from old-format saves (PD-3 step 3)"
```

---

## Task 4: Relocate the chase into a `HOSTILE` FSM state + route dispatch by `allegiance`

The consolidation itself. Move the chase block verbatim from `resolveEnemyTurns` into a `tickNpcState` `HOSTILE` case; route both resolvers by `allegiance`; drop the `behavior` dual-writes; demote `behavior`.

**Files:** Modify `game/npc.js`, `game/enemies.js`, `game/main.js`, `game/give-action.js`.

- [ ] **Step 1: Read the current chase block to relocate**

Run: `git grep -n "canSeePlayer\|_lostSightTurns\|chaseTarget\|loses the trail" -- game/enemies.js` to locate the chase block inside `resolveEnemyTurns` (the `const dist = manhattan(...)` line through the final `getGreedyStep`/`stepEntity` move, including the PD-1 `chaseTarget`/last-seen logic and the adjacency attack). This whole block is what moves.

- [ ] **Step 2: Add the `HOSTILE` case to `npc.js` (relocated verbatim)**

In `game/npc.js`:
1. Confirm `STATE.HOSTILE` exists (it does — declared, currently unrouted).
2. In the `switch (npc.fsmState)`, add a `case STATE.HOSTILE:` **above** `default`, whose body is the chase block from Step 1 — copied *verbatim*, with two mechanical adaptations: the loop variable `enemy` becomes the param name `tickNpcState` uses (`npc`), and it `return`s its `messages` the way tickNpcState returns log lines (or pushes to the shared message array — match tickNpcState's existing return contract). Its internal `npc.state` (`idle/chasing/returning`) sub-machine is unchanged. It calls the same `getGreedyStep`/`hasLineOfSight`/`stepEntity` (add any missing imports to npc.js — grep npc.js's current imports; it already imports pathing primitives).

The block to relocate is (from `enemies.js`, current PD-1 version — copy the live source, this is the shape):
```js
// (inside case STATE.HOSTILE — chase toward player / last-seen, LOS+leash, PD-1)
const dist = manhattan(npc.x, npc.y, game.playerX, game.playerY);
const canSeePlayer = dist <= npc.sightRange && hasLineOfSight(game.map, npc.x, npc.y, game.playerX, game.playerY);
if (canSeePlayer) { npc._lostSightTurns = 0; npc._lastSeenX = game.playerX; npc._lastSeenY = game.playerY;
  if (npc.state === 'idle' || npc.state === 'returning') { const reacquire = npc.state === 'idle'; npc.state = 'chasing'; if (reacquire) messages.push({ text:`[${npc.entity.name} spotted you!]`, sourceEnemy:npc, category:'spotted' }); } }
if (npc.state === 'returning') { /* …walk home; arrive/boxed → 'idle' … */ break; }
if (npc.state !== 'chasing') break;
if (!canSeePlayer) { npc._lostSightTurns += 1; /* …leash: tooFar||tooLong → 'returning' … */ }
const chaseTarget = canSeePlayer ? { x:game.playerX, y:game.playerY } : { x:npc._lastSeenX, y:npc._lastSeenY };
if (!canSeePlayer && (chaseTarget.x == null || (npc.x === chaseTarget.x && npc.y === chaseTarget.y))) { npc.state = 'returning'; npc._lostSightTurns = 0; messages.push({ text:`[${npc.entity.name} loses the trail.]`, sourceEnemy:npc, category:'deaggro' }); break; }
if (chebyshev(npc.x, npc.y, game.playerX, game.playerY) <= 1) { const dmg = npc.hasBuff('blind') ? Math.max(1, Math.floor(npc.damage*0.5)) : npc.damage; game.applyDamageToPlayer(dmg); break; }
const bestMove = getGreedyStep(game, { x:npc.x, y:npc.y }, chaseTarget, { self:npc }); if (bestMove) stepEntity(npc, bestMove.x, bestMove.y, game._MOVE_MS);
break;
```
> **Copy the exact current block from `enemies.js`** — do not hand-retype from this sketch. The `returning`/`leash` bodies elided above are present in the live source; move them whole. `continue` statements become `break` (switch case).

- [ ] **Step 3: Route `resolveEnemyTurns` by allegiance; remove the inline chase**

In `game/enemies.js resolveEnemyTurns`: replace the `if (enemy.behavior) { if (enemy._ally) {…tickNpcState…} continue; }` fork **and** the now-relocated inline chase with:
```js
// (PD-3) One dispatcher. Hostiles + allies act on the player-turn loop; neutrals
// are heartbeat-driven (resolveAmbientTurns) — skip them here.
if (enemy.allegiance === 'neutral') continue;
const msgs = tickNpcState(game, enemy);   // HOSTILE (chase) or ALLIED
if (msgs && msgs.length) for (const m of msgs) messages.push(m);
continue;
```
Ensure a hostile enemy's `fsmState` is `HOSTILE`: in the ctor, after deriving allegiance, set the initial `fsmState` when born-hostile — `this.fsmState = (this.allegiance === 'hostile') ? 'HOSTILE' : null;` (neutral/ally keep the existing lazy-init). And the transitions (Task 2) that set `allegiance='hostile'` must also set `fsmState = 'HOSTILE'` (add to `_onEntityHarmed` and `_revertAlly`), and `becomeAlly`/summon set `fsmState='ALLIED'` (already the case for ALLIED via tickNpcState's lazy init — confirm).

- [ ] **Step 4: Route `resolveAmbientTurns` by allegiance**

In `game/enemies.js resolveAmbientTurns`: change the `if (npc.behavior)` gate + `if (npc._ally) continue` to `if (npc.allegiance !== 'neutral') continue;` (only neutrals wander on the heartbeat). Keep the `feared`/dead skips.

- [ ] **Step 5: Drop the `behavior` dual-writes; demote `behavior`**

Now that dispatch reads `allegiance`/`fsmState`, remove the leftover `behavior` mutations kept in Task 2: `target.behavior = null` (`_onEntityHarmed`), `enemyObj.behavior = null` (`_revertAlly`), `recipient.behavior = ['ALLIED']` (`give-action`). Leave `behavior` on the instance (ctor input + serialized for old-save derivation) but confirm no runtime code READS it: `git grep -n "\.behavior" -- game/ | grep -v "// "` should show only the ctor parse, `toSave`, and `deriveAllegiance` — no dispatch/gate reads.

- [ ] **Step 6: Verify in-browser — full behavioral parity (vs Task 0 baseline)**

Restart, reload. Re-run the Task 0 baseline probe → `blindStep` must again land on `{x:b.x+1,y:b.y}` (chase now runs through `HOSTILE`). Then drive each transition on the real game:
```js
(async () => {
  const g = window.__game;
  const { Enemy, resolveEnemyTurns } = await import('./enemies.js');
  const walk=(x,y)=>g.map.isWalkable(x,y);
  let b=null; for (let y=0;y<g.map.height&&!b;y++) for (let x=0;x<g.map.width-2;x++) if (walk(x,y)&&walk(x+1,y)&&walk(x+2,y)) { b={x,y}; break; }
  const saved=g.enemies, sx=g.playerX, sy=g.playerY;
  // born-hostile in sight chases the player:
  const e=new Enemy({id:'p',type:'Bandit',x:b.x,y:b.y,sightRange:5}); e.fsmState='HOSTILE'; e.state='chasing';
  g.enemies=[e]; g.playerX=b.x+2; g.playerY=b.y; resolveEnemyTurns(g);
  const chased={x:e.x,y:e.y,towardPlayer:(e.x===b.x+1&&e.y===b.y)};
  g.enemies=saved; g.playerX=sx; g.playerY=sy;
  return JSON.stringify({ chased });
})();
```
Expected: `chased.towardPlayer:true`. Then a full manual smoke in the real game: born-hostiles chase; townsfolk wander; strike a vendor → turns on you + chases; bribe a hostile past threshold → fights for you; friendly-fire the ally → turns back; save→reload preserves provoked/ally/summon. **Zero console errors.** Confirm `git grep '\.behavior' -- game/` shows no live reads.

- [ ] **Step 7: Commit**

```bash
git add game/npc.js game/enemies.js game/main.js game/give-action.js
git commit -m "refactor(ai): one FSM — HOSTILE state = relocated chase; dispatch by allegiance (PD-3 step 4)"
```

---

## Task 5: Finish — grep-gate + full regression smoke

**Files:** none (verification) + any cleanup the greps surface.

- [ ] **Step 1: Invariant greps**

```bash
git grep -n "_ally" -- game/            # writes should be gone; reads → allegiance==='ally'
git grep -n "\.behavior" -- game/       # only ctor parse / toSave / deriveAllegiance
git grep -n "isHostile" -- game/        # present at every former gate
```
Fix any straggler `_ally`/`behavior` runtime read the earlier tasks missed (replace with `isHostile`/`allegiance`).

- [ ] **Step 2: Full in-browser regression** (the "Done When" scenario from the spec) — combat, provoke, flip, revert, summon, zone-pursuit, save/load; zero console errors; the content validator still PASS (`/_design-content-check.html`).

- [ ] **Step 3: Node suite** — run `npm test` on a Node box / CI: `tests/ai.test.js` + the save-roundtrip additions green (+ existing suite unbroken).

- [ ] **Step 4: Finish the branch** — use superpowers:finishing-a-development-branch (present merge/PR/keep options; Caelan makes the merge-to-dev call).

---

## Self-Review

- **Spec coverage:** data model (T1), FSM+HOSTILE (T4), gates+transitions (T2), save/derive (T3), dual-clock preserved (T4 routes by allegiance, both resolvers kept), done-when (T5) — all mapped. ✓
- **Placeholders:** the T4 chase block is a *sketch with an explicit "copy the exact current block" instruction* (a verbatim relocation can't be safely hand-retyped from memory — the instruction is the content). No `TBD`/`add error handling`/`similar to`. ✓
- **Type/name consistency:** `isHostile`/`deriveAllegiance`/`parseCapabilities` (ai.js) used identically across T1–T5; `allegiance` values `'hostile'|'neutral'|'ally'` consistent; `fsmState` `'HOSTILE'`/`'ALLIED'` consistent. ✓
- **Risk:** the two combat-critical gates change in T2 (isHostile == today's predicate by construction) and dispatch in T4 (chase relocated verbatim) — each has an in-browser parity check before commit. ✓
