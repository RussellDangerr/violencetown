# Gold Standard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Gold Standard combat laws (`plans/gold-standard-design.md`): universal 100 HP, one damage pipeline with named multiplier buckets, elemental matchups, backstab, enemy wallets with loot-on-death and heal purchases, the balance harness with a committed golden table, the balancing bible, and creature-card stat blocks.

**Architecture:** All damage math funnels through one pure function in `combat.js` (`computeHit`), which applies the bucket law (flats add, multipliers multiply, round once); armor stays in `Entity.takeDamage` (subtract-last, min 1). Only three call sites migrate: `combatAttack` (main.js:3670), `_aoeStrike` (main.js:3114), and the ally attack (main.js:3862), plus the enemy attack in npc.js. Wallets reuse the existing `transferGold` transaction spine. The harness is a zero-dependency Node script importing the real data modules; its committed output is the regression golden.

**Tech Stack:** Vanilla ES modules, no build step. Tests: `node --test` with `node:assert/strict` (existing pattern in `tests/*.test.js`). Harness: plain Node script in `tools/`.

**Conventions:** Commit style is lowercase `feat(scope):` / `test:` / `docs:` (match `git log`). The game name is always one word — **Violencetown**. Before finishing, `git grep -iE 'violence[ _-]+town'` must return zero hits outside CLAUDE.md.

---

### Task 1: Restore Law 0 — Enemy default HP 100, vermin exception

**Files:**
- Modify: `game/enemies.js` (ctor default, ~line 38: `hp = 50`)
- Modify: `game/sewer-setpiece.js:32` (rat spawn)
- Test: `tests/combat-lawzero.test.js` (create)

- [ ] **Step 1: Write the failing test**

```js
// tests/combat-lawzero.test.js — Law 0: The Hundred. Every combatant of
// consequence has exactly 100 HP; only vermin:true spawns may go below.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Enemy } from '../game/enemies.js';

describe('Law 0 — The Hundred', () => {
    test('an Enemy with no hp override defaults to 100', () => {
        const e = new Enemy({ id: 'g1', type: 'Grunt', x: 0, y: 0 });
        assert.equal(e.entity.maxHp, 100);
        assert.equal(e.entity.hp, 100);
    });
    test('vermin may be sub-Hundred and carry the flag', () => {
        const r = new Enemy({ id: 'r1', type: 'Rat', x: 0, y: 0, hp: 16, vermin: true });
        assert.equal(r.entity.maxHp, 16);
        assert.equal(r.vermin, true);
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/combat-lawzero.test.js`
Expected: FAIL — `maxHp` is 50, and `vermin` is undefined.

- [ ] **Step 3: Implement**

In `game/enemies.js`, in the `Enemy` constructor:
- change the destructured default `hp = 50` → `hp = 100`
- add `vermin = false,` to the destructured params (next to `tag = null`)
- add `this.vermin = !!vermin;` beside the other field assignments (near `this.tag`).

In `game/sewer-setpiece.js:32`, add the flag to the rat spawn:

```js
return new Enemy({ id: 'rat_' + (_ratSeq++), type: 'Rat', x, y, hp: 16, damage: 6, sightRange: 10, tag: 'sewer_rat', vermin: true });
```

- [ ] **Step 4: Run the new test AND the full suite**

Run: `node --test tests/combat-lawzero.test.js` → PASS.
Run: `node --test` → all tests pass. If an existing test pinned the 50 default or a specific
enemy's implicit 50 HP (check `tests/content-integrity.test.js` and any save fixtures), update that
expectation to 100 in the same commit — the 50 was the divergence, not the law.

- [ ] **Step 5: Commit**

```bash
git add game/enemies.js game/sewer-setpiece.js tests/combat-lawzero.test.js
git commit -m "feat(combat): restore Law 0 — enemies default to 100 HP, rats declared vermin"
```

---

### Task 2: `computeHit` — the one pipeline (bucket law)

**Files:**
- Modify: `game/combat.js`
- Test: `tests/combat.test.js` (extend)

- [ ] **Step 1: Write the failing tests**

Append to `tests/combat.test.js` (import `computeHit` alongside the existing imports):

```js
import { Entity, attack, formatDamageNumber, DEFAULT_HP, DEFAULT_ARMOR, computeHit } from '../game/combat.js';

describe('computeHit — the bucket law (Gold Standard Law 2)', () => {
    test('base alone passes through', () => {
        assert.equal(computeHit({ base: 10 }), 10);
    });
    test('flats add before multipliers', () => {
        // (10 + 5) × 2 = 30
        assert.equal(computeHit({ base: 10, flats: 5, elemental: 2 }), 30);
    });
    test('multipliers from different categories multiply', () => {
        // 20 × 2 (weakness) × 1.5 (backstab) = 60 — the "above 50" worked example
        assert.equal(computeHit({ base: 20, elemental: 2, positional: 1.5 }), 60);
    });
    test('outgoing and incoming status buckets fold in', () => {
        // Blind attacker: 8 × 0.5 = 4
        assert.equal(computeHit({ base: 8, outgoingMult: 0.5 }), 4);
        // Guarding defender: 10 × 0.5 = 5
        assert.equal(computeHit({ base: 10, incomingMult: 0.5 }), 5);
    });
    test('rounds ONCE at the end, floor at 1', () => {
        // 9 × 0.5 = 4.5 → rounds to 5 (round-once law; the old inline floor gave 4)
        assert.equal(computeHit({ base: 9, outgoingMult: 0.5 }), 5);
        // immune: ×0 → floors to 1? NO — immunity means 0. Only positive hits floor at 1.
        assert.equal(computeHit({ base: 20, elemental: 0 }), 0);
        // tiny positive result floors at 1
        assert.equal(computeHit({ base: 1, outgoingMult: 0.4 }), 1);
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/combat.test.js`
Expected: FAIL — `computeHit` is not exported.

- [ ] **Step 3: Implement in `game/combat.js`**

Add above the Entity class, and add `computeHit` to the export list at the bottom:

```js
// ── The one pipeline (Gold Standard Law 2) ────────────────────────────────────
//
// Every damage number in the game is computed here. The bucket law:
//   - flats ADD to base (same-family bonuses share one bucket)
//   - earned multipliers (elemental, positional) and status buckets
//     (attacker-outgoing, defender-incoming) MULTIPLY — independent
//     achievements both count fully
//   - round ONCE at the end; a positive hit lands for at least 1
//   - elemental immunity (×0) is the one true zero
// Armor is NOT applied here — Entity.takeDamage subtracts it last (min 1),
// so the full formula is: max(1, computeHit(...) − armor).

function computeHit({ base, flats = 0, elemental = 1, positional = 1, outgoingMult = 1, incomingMult = 1 } = {}) {
    const raw = (base + flats) * elemental * positional * outgoingMult * incomingMult;
    if (raw <= 0) return 0;
    return Math.max(1, Math.round(raw));
}
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/combat.test.js` → PASS (all existing tests still green — `computeHit` is additive).

- [ ] **Step 5: Commit**

```bash
git add game/combat.js tests/combat.test.js
git commit -m "feat(combat): computeHit — the one damage pipeline with named buckets"
```

---

### Task 3: Migrate Blind and Guard into the pipeline

**Files:**
- Modify: `game/npc.js` (~line 232, the enemy melee attack)
- Modify: `game/main.js` (~line 4105, the guard halving in the player damage path)
- Test: `tests/combat.test.js` (already covers the math); full suite guards the migration

*(Amended after Task 2's quality review: chaining two computeHit calls double-rounds — a blinded
9-damage enemy vs a guarding player must be round(9×0.25)=2, not round(round(4.5)×0.5)=3. Both
status mults therefore compose in ONE call, in applyDamageToPlayer, which already receives the
attacker.)*

- [ ] **Step 1: npc.js ~232 — pass RAW damage; blind moves to the receiving side**

Replace:

```js
const dmg = npc.hasBuff('blind')
    ? Math.max(1, Math.floor(npc.damage * 0.5))
    : npc.damage;
game.applyDamageToPlayer(dmg, npc);
```

with:

```js
game.applyDamageToPlayer(npc.damage, npc);   // blind folds in at the one computeHit call site
```

(Update the comment above it: blind is now applied in applyDamageToPlayer's single pipeline call.)

- [ ] **Step 2: main.js ~4105 — ONE computeHit call composing both status buckets**

Add `computeHit` to main.js's combat import. In `applyDamageToPlayer(dmg, npc)`, replace:

```js
if (this.hasBuff('guard')) dmg = Math.max(1, Math.floor(dmg / 2));
```

with:

```js
dmg = computeHit({
    base: dmg,
    outgoingMult: npc?.hasBuff?.('blind') ? 0.5 : 1,
    incomingMult: this.hasBuff('guard') ? 0.5 : 1,
});
```

(Callers that pass no attacker — environmental damage — get outgoingMult 1 via the optional chain.)
Behavior deltas, both spec'd: blind 9 → 5 (round, not floor); blind+guard 9 → 2 (one round, not two).

- [ ] **Step 2b: combat.js hygiene from Task 2's review**

- Default `base = 0` in computeHit's destructure (a missing base must yield 0, not NaN — NaN
  propagates into hp and makes an entity unkillable).
- Fix the comment block: the full formula line becomes "0 means the hit does not happen — call
  sites must skip attack()/takeDamage entirely on 0 (immunity), never floor it back to 1 via
  armor math"; add "never chain computeHit(computeHit(...)) — pass all buckets in one call
  (round-once)".
- Two new asserts in the computeHit describe block:

```js
    test('immunity annihilates flats and other multipliers', () => {
        assert.equal(computeHit({ base: 20, flats: 10, elemental: 0, positional: 1.5 }), 0);
    });
    test('missing base yields 0, never NaN', () => {
        assert.equal(computeHit({}), 0);
    });
```

- [ ] **Step 3: Run the full suite + smoke test**

Run: `node --test` → all pass.
Smoke: `python dev-server.py 3001`, load the game, Guard then take a hit (log shows halved), Blind
an enemy (Boo!/Fearmur path or dev console) and confirm its hits halve. Console clean.

- [ ] **Step 4: Commit**

```bash
git add game/npc.js game/main.js
git commit -m "feat(combat): guard and blind flow through computeHit's named buckets"
```

---

### Task 4: Elemental matchups — weak ×2 / resist ×½ / immune ×0

*(Carry-forwards from Task 3's quality review: (a) in `applyDamageToPlayer`, add `if (dmg === 0)
return 0;` between the computeHit call and the armor line — the 0-contract must not be floored
back to 1; (b) fix three stale blind comments: buffs.js:22, enemies.js:167, enemies.js:290-291 —
blind now applies inside applyDamageToPlayer's single pipeline call.)*

**Files:**
- Modify: `game/enemies.js` (ctor: `weak`, `resist`, `immune` arrays)
- Modify: `game/combat.js` (add `elementalMult`)
- Modify: `game/main.js` (`combatAttack` ~3670 and `_aoeStrike` ~3114 compose it in)
- Test: `tests/combat.test.js` (extend)

- [ ] **Step 1: Write the failing tests**

```js
import { elementalMult } from '../game/combat.js';   // extend the existing import line

describe('elementalMult — Law 2 elemental family', () => {
    const gasbag = { weak: ['fire'], resist: ['cold'], immune: ['fear'] };
    test('weakness doubles', () => assert.equal(elementalMult('fire', gasbag), 2));
    test('resistance halves', () => assert.equal(elementalMult('cold', gasbag), 0.5));
    test('immunity zeroes', () => assert.equal(elementalMult('fear', gasbag), 0));
    test('untyped damage or unlisted type is neutral', () => {
        assert.equal(elementalMult(undefined, gasbag), 1);
        assert.equal(elementalMult('energy', gasbag), 1);
        assert.equal(elementalMult('fire', {}), 1);
        assert.equal(elementalMult('fire', null), 1);
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/combat.test.js` → FAIL: `elementalMult` not exported.

- [ ] **Step 3: Implement `elementalMult` in combat.js** (export it)

```js
// Elemental matchup (Law 2): weakness ×2, resist ×½, immune ×0, else ×1.
// `target` carries optional weak/resist/immune arrays of damageType strings.
function elementalMult(damageType, target) {
    if (!damageType || !target) return 1;
    if (target.immune?.includes(damageType)) return 0;
    if (target.weak?.includes(damageType))   return 2;
    if (target.resist?.includes(damageType)) return 0.5;
    return 1;
}
```

- [ ] **Step 4: Thread the arrays through Enemy**

In the `Enemy` ctor param list add `weak = null, resist = null, immune = null,` and assign
`this.weak = weak; this.resist = resist; this.immune = immune;` beside the other fields.

- [ ] **Step 5: Compose into the two funnels in main.js**

In `combatAttack(enemyObj, damage, opts = {})` (~3670), where the raw number reaches `attack()`
(~3684), replace `const result = attack(playerEntity, enemyObj.entity, dmg);` with:

```js
const finalDmg = computeHit({
    base: dmg,
    elemental: elementalMult(opts.type, enemyObj),
    positional: 1,               // backstab lands here in Task 5
});
if (finalDmg === 0) { this._log(`[${enemyObj.type} is immune!]`); return null; }
const result = attack(playerEntity, enemyObj.entity, finalDmg);
```

In `_aoeStrike(tiles, damage, opts = {})` (~3114), the per-enemy hit inside the tile loop applies
the same composition — `elemental: elementalMult(opts.type, enemyObj)` for each struck enemy
(spell/trick call sites at ~3174/~3203 already pass `{ type: … }`), with the same immune log-and-skip.
Add `elementalMult` to main.js's combat import.

- [ ] **Step 6: Run full suite + commit**

Run: `node --test` → PASS.

```bash
git add game/combat.js game/enemies.js game/main.js tests/combat.test.js
git commit -m "feat(combat): elemental matchups — weak x2, resist half, immune zero"
```

---

### Task 5: Backstab ×1.5

*(Carry-forwards from Task 4's quality review — all small, same files: (a) items.js:~549
resolveThrow gates `affected++` on combatAttack's return (immune ≠ caught in splash); (b)
main.js:~4049 ring ignite routes through computeHit + elementalMult instead of raw takeDamage;
(c) main.js:~3684 ring typeBonus stops pre-rounding — pass `dmg * (1 + typeBonus/100)` raw as
computeHit's base so rounding happens once; (d) all-immune cleave/spin still consumes the turn
(match spells' behavior); (e) one new assert: a type in both weak and immune → 0 (immune wins);
(f) thread the equipped weapon's damageType into the wheel's basic-attack combatAttack call
(main.js:~3138) as opts.type — the Ray Gun's energy typing must fire on basic hits. Also note:
AoE-via-combatAttack means point-blank AoE gets backstab on the enemy you're directly behind —
this is spec (the design's worked example composes spell × weakness × backstab); no discriminator
needed unless Caelan later rules backstab melee-only.)*

**Files:**
- Modify: `game/pathing.js` (`stepEntity` ~123: record last step direction)
- Modify: `game/combat.js` (add `isBackstab`)
- Modify: `game/main.js` (`combatAttack`: positional bucket)
- Test: `tests/combat.test.js` (extend)

- [ ] **Step 1: Write the failing tests**

```js
import { isBackstab } from '../game/combat.js';   // extend the import line

describe('isBackstab — Law 2 positional', () => {
    test('attacker on the tile directly behind the facing → true', () => {
        const e = { x: 5, y: 5, _lastDx: 0, _lastDy: -1 };   // moved north, faces north
        assert.equal(isBackstab(5, 6, e), true);               // player directly south
    });
    test('any other adjacent tile → false', () => {
        const e = { x: 5, y: 5, _lastDx: 0, _lastDy: -1 };
        assert.equal(isBackstab(4, 5, e), false);
        assert.equal(isBackstab(4, 6, e), false);              // diagonal-behind is NOT a backstab
    });
    test('an enemy that has never moved cannot be backstabbed', () => {
        assert.equal(isBackstab(5, 6, { x: 5, y: 5 }), false);
    });
});
```

- [ ] **Step 2: Run to verify failure** — `node --test tests/combat.test.js` → FAIL.

- [ ] **Step 3: Implement**

In `game/pathing.js`, inside `stepEntity(ent, x, y, ms)` (after the `_slideFrom` lines):

```js
    ent._lastDx = Math.sign(x - ent.x);
    ent._lastDy = Math.sign(y - ent.y);
```

In `game/combat.js` (export it):

```js
// Backstab (Law 2 positional, ×1.5): the attacker stands on the tile DIRECTLY
// behind the target's last step direction. Strict — diagonals don't count, and
// a target that has never moved has no back. The 5-Zone Body's "Back" zone,
// as a rule instead of an HP pool.
function isBackstab(attackerX, attackerY, target) {
    if (!target._lastDx && !target._lastDy) return false;
    return attackerX === target.x - target._lastDx
        && attackerY === target.y - target._lastDy;
}
```

In `combatAttack`, replace `positional: 1,` with:

```js
    positional: isBackstab(this.playerX, this.playerY, enemyObj) ? 1.5 : 1,
```

and when it fires, log it: after computing `finalDmg`, `if (finalDmg > 0 && isBackstab(this.playerX, this.playerY, enemyObj)) this._log('[Backstab!]');`
Add `isBackstab` to main.js's combat import.

- [ ] **Step 4: Run full suite** — `node --test` → PASS. Smoke: chase an enemy, circle behind, hit — log shows `[Backstab!]` and the splat is ×1.5.

- [ ] **Step 5: Commit**

```bash
git add game/pathing.js game/combat.js game/main.js tests/combat.test.js
git commit -m "feat(combat): backstab — x1.5 from the tile directly behind the last step"
```

---

### Task 6: Wallets — loot on death, respawns come back broke

*(Carry-forwards from Task 5's reviews: (a) ally melee (main.js:~3888) routes through computeHit
with the ally's damage as base — allies are combatants, the pipeline is for everyone (matters for
Task 9's lion); (b) ally movement (main.js:~3897/3905 direct x/y assignment) goes through
stepEntity so allies have real facing; (c) `_lastDx`/`_lastDy` join toSave/fromSave so a mid-fight
reload doesn't erase an enemy's back. Deferred cosmetics, not in scope: immune-AoE double-logging,
"shrugged off" phrasing.)*

**Files:**
- Modify: `game/main.js` (`_handleEnemyDeath`; spawn loop ~567; save/load fields)
- Test: `tests/wallets.test.js` (create)

The Enemy class already carries `gold` and a transaction log (the trade spine), and
`transferGold(from, to, amount, reason)` (`game/trade.js`) already moves gold both directions
with conservation. This task wires death and respawn to it.

- [ ] **Step 1: Write the failing test**

```js
// tests/wallets.test.js — Law 6: loot = remaining wallet; respawns come back broke.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Enemy } from '../game/enemies.js';
import { transferGold } from '../game/trade.js';

describe('Law 6 — the wallet is the loot', () => {
    test('transferGold moves an enemy wallet to a receiver and conserves total', () => {
        const bandit = new Enemy({ id: 'b1', type: 'Bandit', x: 0, y: 0, gold: 40 });
        const player = { gold: 10, _txLog: [] };   // shape transferGold accepts (matches trade.js call sites)
        const total = bandit.gold + player.gold;
        const ok = transferGold(bandit, player, bandit.gold, 'loot');
        assert.equal(ok, true);
        assert.equal(player.gold, 50);
        assert.equal(bandit.gold, 0);
        assert.equal(bandit.gold + player.gold, total);
    });
});
```

(If `transferGold`'s actual receiver shape differs — read `game/trade.js` before writing — adjust
the stub to the real contract; the assertion set stays the same.)

- [ ] **Step 2: Run to verify it fails or passes-for-the-wrong-reason**

Run: `node --test tests/wallets.test.js`. If `gold` isn't a ctor param yet, FAIL → add
`gold = 0,` to the Enemy ctor destructuring and `this.gold = gold;` if not already present (the
vendor path may already do this — read the ctor first; do not double-assign).

- [ ] **Step 3: Loot on death**

In `main.js`, in `_handleEnemyDeath(...)` (found via the `result.killed` sites at ~3734/~3867), add
at the top of the death handling:

```js
        if (enemy.gold > 0) {
            const loot = enemy.gold;
            transferGold(enemy, this, loot, 'loot');   // spine conserves; wallet → player
            this._log(`[Looted ${loot} GP.]`);
            this._muggedIds.add(enemy.id);             // respawns come back broke (Law 6d)
        }
```

Initialize `this._muggedIds = new Set();` in the Game constructor near the other state fields.

- [ ] **Step 4: Respawns come back broke**

In the spawn loop at ~567:

```js
        for (const s of this.map.enemySpawns) {
            const e = new Enemy(s);
            if (this._muggedIds.has(e.id)) e.gold = 0;   // you already mugged this guy
            this.enemies.push(e);
        }
```

Persist it: in the save payload (follow the existing pattern in `game/save.js` /
`tests/save-roundtrip.test.js`), add `muggedIds: [...this._muggedIds]` on save and
`this._muggedIds = new Set(data.muggedIds ?? [])` on load. Extend
`tests/save-roundtrip.test.js` with a case asserting the set survives a round-trip.

- [ ] **Step 5: Run full suite + commit**

Run: `node --test` → PASS.

```bash
git add game/main.js game/enemies.js tests/wallets.test.js tests/save-roundtrip.test.js game/save.js
git commit -m "feat(combat): enemy wallets loot on death; respawns come back broke"
```

---

### Task 7: Enemy heal purchase — the first wallet "extra"

**Files:**
- Modify: `game/ai.js` (pure decision helper)
- Modify: `game/npc.js` (HOSTILE case: buy before attacking/chasing)
- Test: `tests/ai.test.js` (extend)

- [ ] **Step 1: Write the failing tests**

Append to `tests/ai.test.js`:

```js
import { healPurchase } from '../game/ai.js';   // extend the existing import

describe('healPurchase — Law 6a/6b (peg-priced heal, extras only)', () => {
    test('hurt and solvent → spends 1 GP per HP, capped at missing HP', () => {
        assert.deepEqual(healPurchase(30, 100, 200), { spend: 70, heal: 70 });
    });
    test('hurt grunt with 20 GP → the whole 20, ceiling 50 (the readable prediction)', () => {
        assert.deepEqual(healPurchase(30, 100, 20), { spend: 20, heal: 20 });
    });
    test('not hurt enough (hp > 40) → no purchase', () => {
        assert.equal(healPurchase(41, 100, 200), null);
    });
    test('broke (gold < 20) → no purchase; the sliver can never heal', () => {
        assert.equal(healPurchase(10, 100, 19), null);
    });
});
```

- [ ] **Step 2: Run to verify failure** — `node --test tests/ai.test.js` → FAIL.

- [ ] **Step 3: Implement in `game/ai.js`** (export it)

```js
// healPurchase — Law 6: enemies buy heals at the peg (1 GP = 1 HP).
// Rule: below 40 HP and holding at least 20 GP, spend min(gold, missing HP).
// Returns { spend, heal } or null. Pure — npc.js applies the result.
export function healPurchase(hp, maxHp, gold) {
    if (hp > 40 || gold < 20) return null;
    const spend = Math.min(gold, maxHp - hp);
    return { spend, heal: spend };
}
```

- [ ] **Step 4: Wire into the HOSTILE turn (npc.js)**

In the HOSTILE case, immediately BEFORE the adjacency-attack check (~line 231), so a dying enemy
heals instead of swinging:

```js
            const buy = healPurchase(npc.entity.hp, npc.entity.maxHp, npc.gold);
            if (buy) {
                npc.gold -= buy.spend;
                npc.entity.hp = Math.min(npc.entity.maxHp, npc.entity.hp + buy.heal);
                game._log(`[${npc.name ?? npc.type} buys back ${buy.heal} HP! (−${buy.spend} GP)]`);
                break;   // the purchase IS the turn
            }
```

Import `healPurchase` from `./ai.js` at the top of npc.js.

- [ ] **Step 5: Run full suite + smoke, commit**

Run: `node --test` → PASS. Smoke: give a spawn `gold: 100`, whittle it below 40, watch it buy.

```bash
git add game/ai.js game/npc.js tests/ai.test.js
git commit -m "feat(combat): enemies buy heals at the peg — the first wallet extra"
```

---

### Task 8: The balance harness

*(Amendments accumulated from Tasks 1-7 reviews: (a) the ROSTER is not hardcoded — the harness
reads every `game/*-map.json`'s enemySpawns (plain JSON, headlessly readable; skip the
`*-TheDangerrZone.json` snapshots) so the Law 0 lint sees the REAL world — Task 1's review found
every map enemy is currently sub-100 non-vermin, and the golden table must document that honestly
as lint flags, not hide it; (b) economy lint hooks: `burnGold` in trade.js is the declared-sink
primitive, `transferGold` the conserving flow — the harness reports per-zone faucet (sum of spawn
wallets) and names the sink hooks; (c) import HEAL_HP_FLOOR/HEAL_MIN_GOLD from ai.js and state the
default grunt policy in the report header; (d) lint that any spawn with `hp < 100` carries
`vermin: true`, and vermin wallets ≤ 5.)*

**Files:**
- Create: `tools/balance-harness.mjs`
- Test: `tests/balance-harness.test.js` (create)
- Modify: `package.json` (scripts)

- [ ] **Step 1: Write the failing tests for the pure math**

```js
// tests/balance-harness.test.js — the harness's math, unit-tested.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ttk, pegRate, lintEntity, REFERENCE_DAMAGE } from '../tools/balance-harness.mjs';

describe('harness math', () => {
    test('ttk is exact ceil(hp / net-per-turn)', () => {
        assert.equal(ttk(100, 20, 0), 5);      // lazy standard
        assert.equal(ttk(100, 20, 4), 7);      // armor 4 → 16/turn → ceil(6.25)
        assert.equal(ttk(100, 40, 0), 3);      // informed (×2)
        assert.equal(ttk(16, 20, 0), 1);       // vermin one-shot
        assert.equal(ttk(100, 1, 99), 100);    // min-1 floor keeps TTK finite
    });
    test('pegRate = damage per gold', () => {
        assert.equal(pegRate(18, 6), 3);       // Ray Blast
        assert.equal(pegRate(50, 50), 1);      // lion at peg
    });
    test('lintEntity flags a non-vermin sub-Hundred enemy', () => {
        const flags = lintEntity({ type: 'Grunt', hp: 50, armor: 0, damage: 8, gold: 20, vermin: false });
        assert.ok(flags.some(f => f.includes('Law 0')));
    });
    test('lintEntity flags armor over cap without puzzleWall', () => {
        const flags = lintEntity({ type: 'Wall', hp: 100, armor: 14, damage: 8, gold: 0, vermin: false });
        assert.ok(flags.some(f => f.includes('armor')));
        const ok = lintEntity({ type: 'Knight', hp: 100, armor: 14, damage: 8, gold: 0, vermin: false, puzzleWall: true });
        assert.ok(!ok.some(f => f.includes('armor')));
    });
    test('REFERENCE_DAMAGE is the act-1 anchor', () => assert.equal(REFERENCE_DAMAGE, 20));
});
```

- [ ] **Step 2: Run to verify failure** — `node --test tests/balance-harness.test.js` → FAIL (module missing).

- [ ] **Step 3: Implement `tools/balance-harness.mjs`**

```js
// balance-harness.mjs — the Gold Standard's measuring bench (plans/gold-standard-design.md).
//
// Headless. Imports the REAL data modules and answers, with exact arithmetic:
//   - TTK/TTD: turns to kill each enemy (lazy + informed), turns it needs to kill you
//   - peg lint: every GP/MP rate vs its declared band; Law 0/armor-cap/wallet-band checks
//   - econ summary: total wallet gold (faucet) per region
// Modes:
//   node tools/balance-harness.mjs           → print the table
//   node tools/balance-harness.mjs --write   → refresh tools/balance-golden.txt
//   node tools/balance-harness.mjs --check   → diff vs golden, exit 1 on drift
import { WEAPONS } from '../game/weapons.js';
import { SPELLS } from '../game/spells.js';
import { TRICKS } from '../game/tricks.js';
import { readFileSync, writeFileSync } from 'node:fs';

export const REFERENCE_DAMAGE = 20;   // act-1 geared reference (spec Law 4)
export const ARMOR_CAP = 10;          // half the reference; puzzle walls exempt

export function ttk(hp, dmgPerTurn, armor) {
    const net = Math.max(1, dmgPerTurn - armor);
    return Math.ceil(hp / net);
}
export function pegRate(damage, cost) { return damage / cost; }

export function lintEntity(e) {
    const flags = [];
    if (!e.vermin && e.hp !== 100) flags.push(`${e.type}: Law 0 — hp ${e.hp} ≠ 100 and not vermin`);
    if (e.vermin && (e.gold ?? 0) > 5) flags.push(`${e.type}: vermin wallet ${e.gold} > 5`);
    if (!e.puzzleWall && (e.armor ?? 0) > ARMOR_CAP) flags.push(`${e.type}: armor ${e.armor} over cap ${ARMOR_CAP} without puzzleWall`);
    return flags;
}

export function lintSkills() {
    const flags = [];
    for (const t of Object.values(TRICKS)) {
        if (t.damage && pegRate(t.damage, t.gpCost) < 2.5)
            flags.push(`trick ${t.id}: ${pegRate(t.damage, t.gpCost).toFixed(2)} dmg/GP < 2.5 (gated tricks must beat spells)`);
    }
    for (const s of Object.values(SPELLS)) {
        if (s.damage > 0) {
            const r = pegRate(s.damage, s.mpCost);
            if (r < 1.5 || r > 2.5) flags.push(`spell ${s.id}: ${r.toFixed(2)} dmg/MP outside [1.5, 2.5]`);
        }
    }
    return flags;
}

// The enemy roster the harness measures. Map spawn data isn't importable headlessly
// (map.js touches the DOM), so the roster mirrors spawn configs; the content-integrity
// suite is the seam that keeps this honest as the bestiary grows.
export const ROSTER = [
    { type: 'Rat (sewer)', hp: 16, armor: 0, damage: 6, gold: 0, vermin: true },
    { type: 'Grunt (default ctor)', hp: 100, armor: 0, damage: 8, gold: 0, vermin: false },
];

export function report() {
    const lines = [];
    lines.push('VIOLENCETOWN BALANCE GOLDEN — generated by tools/balance-harness.mjs --write');
    lines.push(`reference damage ${REFERENCE_DAMAGE} | armor cap ${ARMOR_CAP} | peg 1 GP : 1 HP`);
    lines.push('');
    lines.push('ENEMIES              hp  armor dmg  gold | TTK lazy  TTK informed  TTD');
    for (const e of ROSTER) {
        const lazy = ttk(e.hp, REFERENCE_DAMAGE, e.armor);
        const informed = ttk(e.hp, REFERENCE_DAMAGE * 2, e.armor);
        const ttd = ttk(100, e.damage, 0);
        lines.push(`${e.type.padEnd(20)} ${String(e.hp).padStart(3)}  ${String(e.armor).padStart(4)} ${String(e.damage).padStart(3)} ${String(e.gold).padStart(5)} | ${String(lazy).padStart(8)} ${String(informed).padStart(13)} ${String(ttd).padStart(4)}`);
    }
    lines.push('');
    lines.push('WEAPONS   dmg        SPELLS   dmg/MP      TRICKS   dmg/GP');
    const w = Object.values(WEAPONS).map(x => `${x.id} ${x.damage}`).join(', ');
    const s = Object.values(SPELLS).filter(x => x.damage > 0).map(x => `${x.id} ${pegRate(x.damage, x.mpCost).toFixed(2)}`).join(', ');
    const t = Object.values(TRICKS).filter(x => x.damage).map(x => `${x.id} ${pegRate(x.damage, x.gpCost).toFixed(2)}`).join(', ');
    lines.push(`weapons: ${w}`); lines.push(`spells:  ${s}`); lines.push(`tricks:  ${t}`);
    lines.push('');
    const flags = [...ROSTER.flatMap(lintEntity), ...lintSkills()];
    lines.push(flags.length ? 'LINT FLAGS:' : 'LINT: clean');
    for (const f of flags) lines.push(`  ! ${f}`);
    return lines.join('\n') + '\n';
}

const GOLDEN = new URL('./balance-golden.txt', import.meta.url);
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/').split('/').pop())) {
    const out = report();
    if (process.argv.includes('--write')) { writeFileSync(GOLDEN, out); console.log('golden updated'); }
    else if (process.argv.includes('--check')) {
        const prev = readFileSync(GOLDEN, 'utf8');
        if (prev !== out) { console.error('BALANCE DRIFT vs golden:\n'); console.error(out); process.exit(1); }
        console.log('balance matches golden');
    } else console.log(out);
}
```

- [ ] **Step 4: Add npm scripts** to `package.json`:

```json
    "balance": "node tools/balance-harness.mjs",
    "balance:check": "node tools/balance-harness.mjs --check",
    "balance:write": "node tools/balance-harness.mjs --write"
```

- [ ] **Step 5: Run tests, then generate and READ the first table**

Run: `node --test tests/balance-harness.test.js` → PASS.
Run: `npm run balance` — read the lint flags. Expected flags right now: none for the roster
(rats are vermin, ctor default is 100 after Task 1); `hire_lion` has no `damage` field so it's
skipped (its retune is Task 9).

- [ ] **Step 6: Commit**

```bash
git add tools/balance-harness.mjs tests/balance-harness.test.js package.json
git commit -m "feat(tools): balance harness — TTK/TTD table, peg lint, golden diff"
```

---

### Task 9: First golden + the lion retune

**Files:**
- Modify: `game/tricks.js` (hire_lion)
- Create: `tools/balance-golden.txt` (generated)

- [ ] **Step 1: Retune Hire a Lion to the peg (spec retune list)**

In `game/tricks.js`, change `hire_lion` to:

```js
    hire_lion: {
        id: 'hire_lion', name: 'Hire Lire', gpCost: 50,
        summon: 'lion', summonName: 'Lire', summonTurns: 2, summonHp: 100, summonDamage: 25,
    },
```

(50 GP → 25 dmg × 2 turns = 50 total damage: exactly at peg, Law 1. The lion is a combatant, so
The Hundred applies to it: 100 HP.)

- [ ] **Step 2: Check nothing else pinned the old lion numbers**

Run: `node --test` → if a test pinned 12 GP / 30 HP (check `tests/rings.test.js`,
`tests/wheel-model.test.js`), update those expectations in this commit with a comment citing the
spec's retune list.

- [ ] **Step 3: Write the golden and eyeball it**

Run: `npm run balance:write` then `npm run balance:check` → "balance matches golden".
Read `tools/balance-golden.txt` once, slowly. This file is now the reviewable diff surface: any
future PR that changes combat numbers must regenerate it, and the diff IS the balance review.

- [ ] **Step 4: Commit**

```bash
git add game/tricks.js tools/balance-golden.txt
git commit -m "feat(balance): first golden table; lion retuned to the peg (50 GP, 50 total dmg)"
```

---

### Task 10: Nameplate GP pips

**Files:**
- Modify: `game/renderer.js` (enemy HP bar site, ~line 1052)

- [ ] **Step 1: Draw the pips**

At the enemy draw site (~1052, where `const frac = e.entity.hp / e.entity.maxHp;` renders the HP
bar), add beneath the bar (exact bar x/y/w variables are in scope there — reuse them):

```js
            // Law 6e — the wallet renders in Hundreds: 1 gold pip = 100 GP
            // (one full heal he can afford). Partial hundred = a sliver pip.
            if (e.gold > 0) {
                const pips = Math.floor(e.gold / 100);
                const sliver = e.gold % 100;
                const py = barY + barH + 1;                     // one px below the HP bar
                for (let i = 0; i < pips; i++)
                    ctx.fillRect(barX + i * 4, py, 3, 2);        // full pip: 3×2 gold block
                if (sliver > 0)
                    ctx.fillRect(barX + pips * 4, py, Math.max(1, Math.round(3 * sliver / 100)), 2);
                ctx.fillStyle = '#f5c542';                       // set BEFORE the rects — move up if needed
            }
```

Match the surrounding code's actual variable names (`barX`/`barY`/`barH` stand for whatever the
HP bar uses at that site — read the ~20 lines above 1052 first and reuse its locals; set
`ctx.fillStyle = '#f5c542'` before the fills).

- [ ] **Step 2: Smoke test (no unit test — pure canvas)**

`python dev-server.py 3001` → give a spawn `gold: 350` → nameplate shows 3 pips + a half sliver.
Kill it → pips vanish, log shows `[Looted 350 GP.]`. Console clean.

- [ ] **Step 3: Commit**

```bash
git add game/renderer.js
git commit -m "feat(ui): wallet pips on nameplates — 1 pip = 100 GP, KH-style dread"
```

---

### Task 11: The balancing bible

**Files:**
- Create: `plans/balancing-bible.md`

- [ ] **Step 1: Write it.** Structure (the spec `plans/gold-standard-design.md` is the source; the
bible is the *working reference* — every law restated with its in-code location, every price on
one page):

```markdown
# The Violencetown Balancing Bible
(Working reference. The design rationale lives in plans/gold-standard-design.md;
this is the page you keep open while authoring content.)

## The laws, one line each, with enforcement points
0. The Hundred — 100 HP for combatants of consequence; vermin:true is the only exit.
   [enemies.js ctor; linted by tools/balance-harness.mjs]
1. The Peg — 1 GP : 1 HP for lazy violence; gates buy better rates. [lintSkills]
2. Earned multipliers — flats add, categories multiply, round once, armor last.
   [combat.js computeHit; elementalMult ×2/×½/×0; isBackstab ×1.5]
3. Armor cap 10 unless puzzleWall. [lintEntity]
4. Roles not levels — the band table. [balance-golden.txt is the living version]
5. Bosses spend, not swell — phases are purchases at the peg.
6. The Visible Wallet — budget = fuel = loot; extras only; respawns broke; pips in Hundreds.

## Authoring a new enemy (the form)
role → archetype → zone flavor → the table hands you hp(100)/armor/damage/gold →
add weak/resist/immune from the zone's element palette → run `npm run balance:write` →
read the diff → commit code + golden together.

## Authoring a new skill (the form)
resource (MP renewable / GP solvent) → rate band (spells 1.5–2.5 dmg/MP;
gated tricks ≥ 2.5 dmg/GP; ungated anything ≤ 1 dmg/GP) → gate honestly declared →
AoE pays per-target discount (Cleave ⅔, Spin ⅖ precedent) → harness → diff → commit.

## Price list (current, act 1)
[paste the WEAPONS/SPELLS/TRICKS lines from tools/balance-golden.txt and annotate
each rate with its gate justification — Ray Blast 3.00 dmg/GP: gated on Ray Gun + aim]

## Deferred laws (spec'd, not yet built)
Statline buyout (damage × 5, payment funds the enemy), pacify (damage × turns),
boss spending policies beyond heals, econ faucet/sink lint per zone,
creature-card stat blocks (Task 12), 5-Zone Body ruling.
```

Fill every section with the real current numbers from the golden — no placeholders. Keep it under
~150 lines; the bible is a reference card, not an essay.

- [ ] **Step 2: Naming check + commit**

Run: `git grep -iE 'violence[ _-]+town' -- plans/` → zero hits.

```bash
git add plans/balancing-bible.md
git commit -m "docs(balance): the balancing bible — laws, forms, and the price list"
```

---

### Task 12: Creature Card stat blocks

**Files:**
- Modify: `tools/balance-harness.mjs` (`--cards` mode)
- Test: `tests/balance-harness.test.js` (extend)

- [ ] **Step 1: Write the failing test**

```js
import { statBlock } from '../tools/balance-harness.mjs';   // extend the import

describe('statBlock — creature card generation', () => {
    test('renders a marker-wrapped block from an entity', () => {
        const md = statBlock({ type: 'Wererat', hp: 100, armor: 4, damage: 12, gold: 150, vermin: false, weak: ['fire'] });
        assert.ok(md.startsWith('<!-- statblock:start -->'));
        assert.ok(md.endsWith('<!-- statblock:end -->'));
        assert.ok(md.includes('100'));           // The Hundred, stated
        assert.ok(md.includes('150 GP'));        // the wallet
        assert.ok(md.includes('fire'));          // the weakness
        assert.ok(md.includes('TTK'));           // the derived read
    });
});
```

- [ ] **Step 2: Run to verify failure** → FAIL: `statBlock` not exported.

- [ ] **Step 3: Implement in the harness**

```js
export function statBlock(e) {
    const lazy = ttk(e.hp, REFERENCE_DAMAGE, e.armor ?? 0);
    const informed = ttk(e.hp, REFERENCE_DAMAGE * 2, e.armor ?? 0);
    return [
        '<!-- statblock:start -->',
        `**HP:** ${e.hp}${e.vermin ? ' (vermin)' : ' — The Hundred'} · **Armor:** ${e.armor ?? 0} · **Damage:** ${e.damage}/turn`,
        `**Wallet:** ${e.gold ?? 0} GP · **Weak:** ${e.weak?.join(', ') || '—'} · **Resist:** ${e.resist?.join(', ') || '—'} · **Immune:** ${e.immune?.join(', ') || '—'}`,
        `**TTK (ref. loadout):** ${lazy} lazy / ${informed} informed · **Buyout at peg:** ~${e.hp + (e.gold ?? 0)} GP`,
        '<!-- statblock:end -->',
    ].join('\n');
}
```

Add a `--cards` CLI branch: for each file in `wiki/Creature Cards/*.md` whose frontmatter contains
`enemyId: <key>` where `<key>` names a ROSTER entry (extend ROSTER entries with an `id` field),
replace the text between the statblock markers (or append the block after the frontmatter if no
markers yet) and write the file. Cards without `enemyId` are untouched — the bestiary wires up
card-by-card as cryptids get implemented.

- [ ] **Step 4: Run tests, regenerate golden, full suite**

Run: `node --test` → PASS. `npm run balance:check` → still matches (statBlock doesn't change the
table). No card has `enemyId` yet, so `--cards` is a no-op today — that's correct; the first
wired card lands with the first implemented cryptid.

- [ ] **Step 5: Commit**

```bash
git add tools/balance-harness.mjs tests/balance-harness.test.js
git commit -m "feat(tools): creature-card stat blocks — generated from the same data the harness lints"
```

---

### Task 13: Close out

- [ ] **Step 1: Full verification**

Run: `node --test` → all pass. `npm run balance:check` → matches golden.
Run: `git grep -iE 'violence[ _-]+town'` → zero hits outside CLAUDE.md.
Smoke: dev server up, one fight with a walleted enemy end-to-end (backstab log, heal purchase,
loot, pips), console clean.

- [ ] **Step 2: Update the spec status line**

In `plans/gold-standard-design.md`, change the Status line to
`**Status:** Adopted — implemented through plans/gold-standard-implementation.md (Tasks 1–13)`.

- [ ] **Step 3: Commit**

```bash
git add plans/gold-standard-design.md plans/gold-standard-implementation.md
git commit -m "docs(balance): mark the Gold Standard spec adopted"
```

Merge to `dev` is Caelan's call, per CLAUDE.md.

---

## Deferred (spec'd in gold-standard-design.md, deliberately NOT in this plan)

- **Statline buyout & pacify (Law 6c)** — needs a wheel verb + trade-window design; its own feature.
- **Boss spending policies beyond heals (Law 5)** — summons/enrages/phase moves land with the first
  real boss build (Bigfoot), priced by the bible's forms.
- **Econ faucet/sink lint per zone** — needs zone gold totals; add to the harness when zone
  wallets exist at scale.
- **5-Zone Body ruling** — awaiting Caelan; `isBackstab` is written so a zone system can replace
  its facing check without touching callers.
