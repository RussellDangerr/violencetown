# Enemy Kits, Consumable Repricing & DoTs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill every enemy wallet with an authored kit of food, potions and bombs whose summed value *is* the challenge rating — and reprice the consumable catalog to the Law 1 peg so that number tells the truth.

**Architecture:** Four sequential phases, each independently shippable. **A** reprices consumables (`baseValue` = HP-equivalent of effect) and adds the peg lint that was missing. **B** generalizes the existing `sludge` buff into real damage-over-time with a 1-HP player floor. **C** authors kits per spawn against a budget derived from armor, with drops on death. **D** makes sewer food faction-dependent and turns poisoning into a social attack. Every number is enforced by `tools/balance-harness.mjs` so it cannot drift again — the absence of exactly that lint is why this bug exists.

**Spec:** `plans/enemy-kits-and-dots-design.md` (commit `d3ab8a4`)

**Tech Stack:** Vanilla ES modules, zero dependencies. `node --test` for tests, `node tools/balance-harness.mjs` for balance lint + golden diff. No build step.

---

## File structure

**Modified:**

| file | responsibility after this plan |
|---|---|
| `game/items.js` | item defs — repriced `baseValue`, new `dot:{id,dmg,turns}` field, `sewerFare` flag, `fire_bottle` |
| `game/buffs.js` | `BUFF_DEFS` gains `poison`/`fire`; `applyDot` shared tick; the 1-HP player floor lives in `tickBuffList` |
| `game/ai.js` | `isSewerDweller(e)` predicate, beside the existing allegiance predicates |
| `game/enemies.js` | `resolveLoadout`, `challengeGp` over item ids, `KIT_DEFAULTS` fallback, `spawnEnemy` clears loadout |
| `game/main.js` | kit drops on death; rock aggro-pull |
| `game/give-action.js` | poisoned-gift social consequence |
| `game/content-validate.js` | kit integrity checks |
| `tools/balance-harness.mjs` | `dotValue`, `lintItems`, `ROLE_BANDS`/`bandForArmor`, liquidity check |
| `game/*-map.json` | 13 authored kits |

**New test files:** `tests/dot.test.js`, `tests/kits.test.js`. Existing `tests/wallets.test.js`, `tests/buffs.test.js`, `tests/balance-harness.test.js` are extended.

**No new source modules.** Every change lands in a file that already owns that responsibility — DoT behavior beside the other buff behavior, kit resolution beside `challengeGp`, lints beside the other lints. This follows the codebase's established one-table-per-concern pattern (`BUFF_DEFS`, `DEFEAT_SCENARIOS`, `ROLE_BANDS`).

---

# PHASE A — Pricing

*Ships on its own. Fixes a live balance bug independent of everything else.*

### Task 1: `dotValue` — the time-value discount

**Files:**
- Modify: `tools/balance-harness.mjs` (add after `pegRate`, ~line 84)
- Test: `tests/balance-harness.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/balance-harness.test.js`:

```js
import { dotValue, DOT_DISCOUNT } from '../tools/balance-harness.mjs';

describe('dotValue — Law 1 time value of damage', () => {
    test('an instant hit is undiscounted', () => {
        assert.equal(dotValue(3, 1), 3);
    });
    test('sludge_sack 3x5 discounts 15 nominal to 10', () => {
        assert.equal(dotValue(3, 5), 10);   // 3*(1+.8+.64+.512+.4096) = 10.0848
    });
    test('fire_bottle 5x3 discounts 15 nominal to 12', () => {
        assert.equal(dotValue(5, 3), 12);   // 5*(1+.8+.64) = 12.2
    });
    test('same nominal total, faster delivery is worth more', () => {
        assert.ok(dotValue(5, 3) > dotValue(3, 5));  // both deliver 15
    });
    test('tunnel_mushroom 5x2 prices at 9', () => {
        assert.equal(dotValue(5, 2), 9);    // 5*(1+.8) = 9
    });
    test('the discount is the documented 0.8', () => {
        assert.equal(DOT_DISCOUNT, 0.8);
    });
    test('zero turns is worth nothing', () => {
        assert.equal(dotValue(5, 0), 0);
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /c/Code/violencetown && node --test tests/balance-harness.test.js
```

Expected: FAIL — `SyntaxError: The requested module '../tools/balance-harness.mjs' does not provide an export named 'dotValue'`

- [ ] **Step 3: Implement**

In `tools/balance-harness.mjs`, after `pegRate` (~line 84):

```js
// Law 1, the time value of damage (plans/enemy-kits-and-dots-design.md §1c).
// Damage delivered later is worth less: in a turn-based game a DoT that needs N
// turns lets the target act N times, and Law 4's exact TTK means late ticks land
// on a corpse. WoW prices this from the other side — a DoT's coefficient scales
// with duration against a 15s baseline, so Corruption gets +20% total for taking
// 18s. Same statement, inverted.
//
// delta = 0.8 is DERIVED, not imported: Law 4's standard role is TTK 4-5 lazy, so
// the reference fight is five turns and one turn of delay costs one fifth of it.
export const DOT_DISCOUNT = 0.8;

// Discounted worth of `dmg` per turn for `turns` turns. Rounds ONCE at the end
// (Law 2's rounding discipline). turns=1 is an instant hit and returns dmg exactly.
export function dotValue(dmg, turns) {
    let total = 0;
    for (let i = 0; i < turns; i++) total += dmg * Math.pow(DOT_DISCOUNT, i);
    return Math.round(total);
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
cd /c/Code/violencetown && node --test tests/balance-harness.test.js
```

Expected: PASS, all 7 new tests green.

- [ ] **Step 5: Commit**

```bash
cd /c/Code/violencetown && git add tools/balance-harness.mjs tests/balance-harness.test.js && git commit -m "balance: dotValue prices the time value of delayed damage"
```

---

### Task 2: `lintItems` — the check that was missing

The harness lints tricks, spells and summons against the peg but has **never imported `ITEMS`**. That omission is the root cause of the whole bug. This task adds the lint *before* fixing the prices, so the lint's first run is a real red that names every offender.

**Files:**
- Modify: `tools/balance-harness.mjs` (import at ~line 18; function after `lintSkills`, ~line 190)
- Test: `tests/balance-harness.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { lintItems, itemPegValue } from '../tools/balance-harness.mjs';
import { ITEMS } from '../game/items.js';

describe('lintItems — Law 1 peg for consumables', () => {
    test('a heal prices at the HP it restores', () => {
        assert.equal(itemPegValue({ consumable: true, effect: 'heal', healAmount: 25 }), 25);
    });
    test('a flat throwable prices at its damage', () => {
        assert.equal(itemPegValue({ consumable: true, useType: 'throw', damage: 3 }), 3);
    });
    test('a DoT throwable prices at its discounted value', () => {
        assert.equal(itemPegValue({ consumable: true, useType: 'throw', dot: { id: 'sludge', dmg: 3, turns: 5 } }), 10);
    });
    test('persistent gear is out of scope — no peg opinion', () => {
        assert.equal(itemPegValue({ consumable: false, equipSlot: 'top', armor: 2 }), null);
    });
    test('a quest item with no numeric effect is out of scope', () => {
        assert.equal(itemPegValue({ consumable: false, useType: 'none' }), null);
    });
    test('every consumable in ITEMS is at peg', () => {
        assert.deepEqual(lintItems(), []);
    });
});
```

- [ ] **Step 2: Run it and watch it fail loudly**

```bash
cd /c/Code/violencetown && node --test tests/balance-harness.test.js
```

Expected: FAIL — no `lintItems` export. After Step 3 it will fail *again*, differently: the last test will list the seven mispriced items. **That second failure is the bug this whole spec exists to fix — read the list before continuing.**

- [ ] **Step 3: Implement**

Add to the imports at the top of `tools/balance-harness.mjs` (after the `challengeGp` import, ~line 18):

```js
import { ITEMS } from '../game/items.js';
```

Then after `lintSkills` (~line 190):

```js
// What Law 1 says this consumable should cost, or null if the peg has no opinion.
//
// SCOPE: consumables with a numeric effect. Persistent gear is deliberately
// excluded (plans/enemy-kits-and-dots-design.md §1b) — armor's HP-equivalent
// depends on how many hits it eats, which is not a number a lint can know.
//
// A consumable is LAZY VIOLENCE in Law 1's sense: you buy the solution, point it,
// and it works. No gate, no per-cast aim. So it prices at the peg (1 GP ~ 1 HP),
// NOT at the >=2.5 dmg/GP trick rate, which exists for gated aimed abilities.
export function itemPegValue(def) {
    if (!def || !def.consumable) return null;
    if (def.dot && typeof def.dot.dmg === 'number' && typeof def.dot.turns === 'number') {
        return dotValue(def.dot.dmg, def.dot.turns);
    }
    if (def.effect === 'heal' && typeof def.healAmount === 'number') return def.healAmount;
    if (typeof def.damage === 'number') return def.damage;
    return null;
}

// Peg lint over the item catalog (Law 1). The absence of THIS function is why the
// catalog drifted to 2-7x above peg unnoticed — lintSkills covered tricks, spells
// and summons; nothing ever covered the things you buy in a shop.
export function lintItems() {
    const flags = [];
    for (const [id, def] of Object.entries(ITEMS)) {
        const expected = itemPegValue(def);
        if (expected === null) continue;
        const actual = def.baseValue ?? 0;
        if (actual !== expected) {
            flags.push(`[item/${id}] Law 1 — baseValue ${actual}, expected ${expected} (HP-equivalent of its effect)`);
        }
    }
    flags.sort(byCodepoint);
    return flags;
}
```

- [ ] **Step 4: Run it and read the red**

```bash
cd /c/Code/violencetown && node --test tests/balance-harness.test.js 2>&1 | grep -A20 'every consumable'
```

Expected: the first five tests PASS; the sixth FAILS listing `rock`, `sludge_sack`, `bandage`, `boardwalk_burger`, `hot_dog`, `tunnel_mushroom`. (`mystery_meat` will not appear yet — its current `healAmount: 20` and `baseValue: 3` are both wrong but Task 3 changes its *effect*, not just its price.)

- [ ] **Step 5: Commit the lint alone, red and all**

```bash
cd /c/Code/violencetown && git add tools/balance-harness.mjs tests/balance-harness.test.js && git commit -m "balance: lintItems — peg check for consumables (currently red)"
```

---

### Task 3: Reprice the catalog

**Files:**
- Modify: `game/items.js`
- Test: `tests/balance-harness.test.js` (Task 2's last test goes green)

- [ ] **Step 1: Apply the seven retunes**

In `game/items.js`, make exactly these edits.

`rock` — damage 15 → 3, value 2 → 3. Add the aggro flag (Task 9 consumes it):

```js
    rock: {
        id: 'rock',
        name: '[Rock]',
        description: 'A heavy chunk of sewer masonry. Better thrown than held — though a clatter down the tunnel turns heads.',
        useType: 'throw',
        equipSlot: 'sides',
        range: 4,
        damage: 3,
        damageType: 'physical',
        pullsAggro: true,      // enemies investigate where it lands (see main.js _rockClatter)
        consumable: true,
        fallbackColor: '#888888',
        baseValue: 3,
    },
```

`sludge_sack` — flat 16 becomes a 3x5 DoT, value 4 → 10:

```js
    sludge_sack: {
        id: 'sludge_sack',
        name: '[Sludge Sack]',
        description: 'A burlap sack cinched with a leather tie, heavy with sewer sludge. Bursts on impact and keeps eating.',
        useType: 'throw',
        equipSlot: 'sides',
        range: 5,
        dot: { id: 'sludge', dmg: 3, turns: 5 },
        damageType: 'sludge',
        sewerFare: true,       // Phase D: medicine to the things that live down there
        consumable: true,
        fallbackColor: '#9a52c8',
        baseValue: 10,
    },
```

`bandage` — value 10 → 25 (`healAmount: 25` unchanged).
`boardwalk_burger` — value 5 → 15 (`healAmount: 15` unchanged).
`hot_dog` — `healAmount` 12 → 10, value 3 → 10.

`tunnel_mushroom` — was `effect: 'heal', healAmount: 10`; becomes a poison DoT, value 2 → 9:

```js
    tunnel_mushroom: {
        id: 'tunnel_mushroom',
        name: '[Tunnel Mushroom]',
        description: 'Pale, damp, and thriving where nothing should. Something down here eats these on purpose.',
        useType: 'throw',
        equipSlot: 'sides',
        range: 4,
        dot: { id: 'poison', dmg: 5, turns: 2 },
        damageType: 'poison',
        sewerFare: true,
        consumable: true,
        fallbackColor: '#b8b89a',
        baseValue: 9,
    },
```

`mystery_meat` — was `effect: 'heal', healAmount: 20`; becomes 3 damage, value 3 → 3:

```js
    mystery_meat: {
        id: 'mystery_meat',
        name: '[Mystery Meat]',
        description: "Grey, sweating, and warm in a way meat should not be. It's food to somebody.",
        useType: 'throw',
        equipSlot: 'sides',
        range: 3,
        damage: 3,
        damageType: 'poison',
        sewerFare: true,
        consumable: true,
        fallbackColor: '#8a6a5a',
        baseValue: 3,
    },
```

- [ ] **Step 2: Run the lint and confirm it is clean**

```bash
cd /c/Code/violencetown && node --test tests/balance-harness.test.js
```

Expected: PASS — `lintItems()` returns `[]`.

- [ ] **Step 3: Run the full suite**

```bash
cd /c/Code/violencetown && node --test 2>&1 | tail -12
```

Expected: **`fail 0`.** Verified before writing this plan — no test references `mystery_meat` or `tunnel_mushroom` at all, and the one `rock` test (`throw-vs-use.test.js:140`) asserts only `hp < 50` on a 50-HP mock, which a 3-damage rock still satisfies.

- [ ] **Step 4: If anything does fail, apply this rule**

The retunes change what these items *are*, so a red test is asserting the old design, not catching a regression. **Do not change production code to make it pass.** Swap the fixture to a still-healing item (`bandage`, `boardwalk_burger`, `hot_dog`) where the test is about *heal mechanics*, or update the expectation where it is about *that specific item* — the same discipline as the stale-test repair in `48a7da3`.

- [ ] **Step 5: Full suite green**

```bash
cd /c/Code/violencetown && node --test 2>&1 | tail -8
```

Expected: `fail 0`.

- [ ] **Step 6: Commit**

```bash
cd /c/Code/violencetown && git add game/items.js tests/ && git commit -m "balance: reprice consumables to the Law 1 peg

baseValue is now the HP-equivalent of the effect. Sewer scavenge (tunnel
mushroom, mystery meat) becomes harmful rather than healing; sludge sack
becomes a 3x5 DoT. lintItems goes green."
```

---

### Task 4: Wire `lintItems` into the report and re-cut the golden

**Files:**
- Modify: `tools/balance-harness.mjs:401-406`, `tools/balance-golden.txt`

- [ ] **Step 1: Add item flags to the LINT section**

Replace the LINT block in `report()`:

```js
    lines.push('--- LINT ---');
    const entityFlags = sorted.flatMap(e => lintEntity(e));
    const skillFlags = lintSkills();
    const itemFlags = lintItems();
    for (const f of entityFlags) lines.push(f);
    for (const f of skillFlags) lines.push(f);
    for (const f of itemFlags) lines.push(f);
    lines.push(`total flags: ${entityFlags.length + skillFlags.length + itemFlags.length}`);
```

- [ ] **Step 2: Confirm the report still shows only the known Cone of Cold flag**

```bash
cd /c/Code/violencetown && node tools/balance-harness.mjs | tail -5
```

Expected: `total flags: 1` — the pre-existing `[skill/coneOfCold] Law 1 — 1.40 dmg/MP` and nothing else.

- [ ] **Step 3: Re-cut the golden and review the diff**

```bash
cd /c/Code/violencetown && node tools/balance-harness.mjs --write && git diff --stat tools/balance-golden.txt
```

- [ ] **Step 4: Verify the golden round-trips**

```bash
cd /c/Code/violencetown && node tools/balance-harness.mjs --check && node --test 2>&1 | tail -6
```

Expected: `balance golden matches — no drift`, and `fail 0`.

- [ ] **Step 5: Commit — Phase A complete**

```bash
cd /c/Code/violencetown && git add tools/ && git commit -m "balance: lintItems joins the report; re-cut golden"
```

---

# PHASE B — Damage over time

*The machinery exists (`sludge` in `buffs.js`). This generalizes it and adds the player floor.*

### Task 5: Per-buff `{dmg, turns}` and the shared `applyDot`

**Files:**
- Modify: `game/buffs.js`, `game/data.js`
- Test: `tests/dot.test.js` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/dot.test.js`:

```js
// dot.test.js — Law 7: damage over time, and the player floor.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tickBuffList, BUFF_DEFS } from '../game/buffs.js';

// Minimal Game stand-in — tickBuffList only touches these fields.
function fakeGame(hp = 100) {
    return {
        playerHp: hp, playerMaxHp: 100,
        buffs: [], logs: [],
        _lastDefeatedBy: null,
        _log(m) { this.logs.push(m); },
        _hasSludgeImmunity: () => false,
    };
}

describe('DoT — per-buff dmg and turns', () => {
    test('a sludge buff carries its own dmg, not a module constant', () => {
        const g = fakeGame();
        g.buffs = [{ id: 'sludge', turns: 2, dmg: 3 }];
        tickBuffList(g.buffs, g, g);
        assert.equal(g.playerHp, 97);
    });
    test('poison and fire tick their own numbers', () => {
        const g = fakeGame();
        g.buffs = [{ id: 'poison', turns: 2, dmg: 5 }, { id: 'fire', turns: 3, dmg: 5 }];
        tickBuffList(g.buffs, g, g);
        assert.equal(g.playerHp, 90);
    });
    test('a DoT runs for exactly its authored turns', () => {
        const g = fakeGame();
        g.buffs = [{ id: 'fire', turns: 3, dmg: 5 }];
        for (let i = 0; i < 5; i++) tickBuffList(g.buffs, g, g);
        assert.equal(g.playerHp, 85);       // 5x3, then it is gone
        assert.equal(g.buffs.length, 0);
    });
    test('poison and fire are registered behaviors', () => {
        assert.ok(BUFF_DEFS.poison?.onTick);
        assert.ok(BUFF_DEFS.fire?.onTick);
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /c/Code/violencetown && node --test tests/dot.test.js
```

Expected: FAIL — sludge deals the hardcoded `SLUDGE_DOT` of 5 rather than the buff's own 3; `BUFF_DEFS.poison` is undefined.

- [ ] **Step 3: Implement**

In `game/buffs.js`, replace the `sludge` def and add the two new ones:

```js
export const DOT_FLOOR = 1;

// One tick of a damage-over-time debuff. Shared by every DoT so they cannot
// diverge (the discipline challengeGp and affectedTiles already follow).
// `buff.dmg` is authored per-instance so a 3x5 sludge sack and a 5x3 fire bottle
// differ without needing separate defs; it falls back to the legacy tile-hazard
// constant so an old save's bare {id:'sludge'} still ticks.
//
// tickBuffList's contract is onTick(owner, game, buff) where owner === game for
// PLAYER buffs and owner is the Enemy for enemy buffs. This function MUST branch
// on that: the old sludge def wrote game.playerHp unconditionally, which was safe
// only because sludge has never been an enemy buff. poison and fire will be.
function applyDot(owner, game, buff, label, cause) {
    const dmg = buff.dmg ?? SLUDGE_DOT;

    if (owner === game) {
        // Law 7: a DoT never lands the killing tick on the PLAYER — it floors at
        // 1 and does NOT self-cure, so you stand there at 1 HP still burning.
        // Clamped upward too: sewer fare on a sewer-dweller is a negative dmg
        // (a regeneration) and must never exceed the Hundred.
        game.playerHp = Math.min(game.playerMaxHp, Math.max(DOT_FLOOR, game.playerHp - dmg));
        // It still CLAIMS the defeat, so when something else finishes the player
        // the scenario reads the DoT (defeat-scenarios.js keys on cause 'sludge').
        // Healing never claims a defeat.
        if (dmg > 0) game._lastDefeatedBy = { cause };
    } else {
        // Enemies get NO floor. D2's floor is player-only and so is ours — an
        // explicit player-experience concession, not a simulation rule. A sludge
        // bomb absolutely finishes a Violet Fungus.
        const ent = owner.entity;
        if (!ent) return;
        ent.hp = Math.min(ent.maxHp, ent.hp - dmg);
        if (ent.hp <= 0) { ent.hp = 0; ent.alive = false; }
    }
    game._log(`[${owner === game ? 'You' : (owner.name ?? owner.type)} — ${label} ${Math.abs(dmg)}]`);
}

export const BUFF_DEFS = {
    sludge: {
        onTick(owner, game, buff) {
            // Immunity is a PLAYER affordance (Shoe Bags) — an enemy has no such gear.
            if (owner === game && game._hasSludgeImmunity && game._hasSludgeImmunity()) return;
            applyDot(owner, game, buff, 'Sludge', 'sludge');
        },
    },
    poison: {
        name: 'Poisoned',
        onTick(owner, game, buff) { applyDot(owner, game, buff, 'Poison', 'poison'); },
    },
    fire: {
        name: 'Burning',
        onTick(owner, game, buff) { applyDot(owner, game, buff, 'Burning', 'fire'); },
    },
    // ... recover, rattled, hunched, sludged unchanged
};
```

> **Why this branch exists.** Found during plan self-review, not during implementation: `tickBuffList` calls `def.onTick(owner, game, b)` (`buffs.js:68`) and `Enemy.tickBuffs` passes the *enemy* as owner. An `applyDot` that wrote `game.playerHp` unconditionally would have made a poisoned **enemy** damage the **player** every turn. The existing `sludge` def has exactly that shape and is safe today only because sludge has never been applied to an enemy — which Task 7 changes.

`SLUDGE_DOT` stays exported from `data.js` — it is still the **tile hazard's** damage, and is now also the legacy fallback above.

- [ ] **Step 4: Run it and watch it pass**

```bash
cd /c/Code/violencetown && node --test tests/dot.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /c/Code/violencetown && git add game/buffs.js tests/dot.test.js && git commit -m "dot: per-buff dmg/turns and shared applyDot; poison and fire defs"
```

---

### Task 6: Prove the floor and the claim

The floor is the single most important rule in Phase B and the one most likely to be quietly broken by a later edit. It gets its own tests.

**Files:**
- Test: `tests/dot.test.js`

- [ ] **Step 1: Write the tests**

```js
describe('Law 7 — the DoT floor', () => {
    test('a DoT cannot take the player below 1 HP', () => {
        const g = fakeGame(3);
        g.buffs = [{ id: 'fire', turns: 5, dmg: 20 }];
        tickBuffList(g.buffs, g, g);
        assert.equal(g.playerHp, 1);
    });
    test('the floor holds across many ticks — no time-based death, ever', () => {
        const g = fakeGame(100);
        g.buffs = [{ id: 'poison', turns: 50, dmg: 25 }];
        for (let i = 0; i < 50; i++) tickBuffList(g.buffs, g, g);
        assert.equal(g.playerHp, 1);
    });
    test('it does NOT self-cure at the floor — you stand there still burning', () => {
        const g = fakeGame(2);
        g.buffs = [{ id: 'fire', turns: 4, dmg: 10 }];
        tickBuffList(g.buffs, g, g);
        assert.equal(g.playerHp, 1);
        assert.equal(g.buffs.length, 1);          // still lit
        assert.equal(g.buffs[0].turns, 3);
    });
    test('an active DoT claims the defeat cause', () => {
        const g = fakeGame(50);
        g.buffs = [{ id: 'sludge', turns: 3, dmg: 5 }];
        tickBuffList(g.buffs, g, g);
        assert.deepEqual(g._lastDefeatedBy, { cause: 'sludge' });
    });
    test("the claim reaches the scenario the sludge cause already selects", async () => {
        const { pickScenario, DEFEAT_SCENARIOS } = await import('../game/defeat-scenarios.js');
        const pick = pickScenario(
            { zone: 'sewer-map.json', by: null, cause: 'sludge' },
            DEFEAT_SCENARIOS, () => 0);
        assert.equal(pick.id, 'swept_into_sludge');
    });
});
```

- [ ] **Step 2: Run them**

```bash
cd /c/Code/violencetown && node --test tests/dot.test.js
```

Expected: PASS — Task 5's implementation already satisfies these. If any fail, the floor or the claim is wrong; fix `applyDot`, not the test.

- [ ] **Step 3: Verify enemies are NOT floored, and that a poisoned enemy doesn't hurt the player**

Add to `tests/dot.test.js`:

```js
describe('the floor is player-only', () => {
    test('a sludge bomb finishes a fungus — no floor for enemies', () => {
        const g = fakeGame();
        const fungus = { type: 'Violet Fungus', entity: { hp: 4, maxHp: 100, alive: true },
                         buffs: [{ id: 'poison', turns: 2, dmg: 10 }] };
        tickBuffList(fungus.buffs, fungus, g);
        assert.equal(fungus.entity.hp, 0);
        assert.equal(fungus.entity.alive, false);
    });
    test('a poisoned ENEMY does not drain the player — the owner branch works', () => {
        const g = fakeGame(100);
        const fungus = { type: 'Violet Fungus', entity: { hp: 50, maxHp: 100, alive: true },
                         buffs: [{ id: 'fire', turns: 3, dmg: 5 }] };
        tickBuffList(fungus.buffs, fungus, g);
        assert.equal(g.playerHp, 100, 'the player must be untouched');
        assert.equal(fungus.entity.hp, 45);
    });
    test('an enemy DoT never claims the player defeat', () => {
        const g = fakeGame(100);
        const fungus = { type: 'Violet Fungus', entity: { hp: 50, maxHp: 100, alive: true },
                         buffs: [{ id: 'poison', turns: 2, dmg: 5 }] };
        tickBuffList(fungus.buffs, fungus, g);
        assert.equal(g._lastDefeatedBy, null);
    });
});
```

The second test is the regression guard for the bug this plan's self-review caught: an `applyDot` that wrote `game.playerHp` unconditionally would make every poisoned enemy drain the player. It must stay.

- [ ] **Step 4: Commit**

```bash
cd /c/Code/violencetown && git add tests/dot.test.js && git commit -m "dot: prove the 1-HP floor, the no-self-cure rule, and the defeat claim"
```

---

### Task 7: Items apply their DoT

**Files:**
- Modify: `game/items.js` (`resolveThrow` ~line 503, `resolveUse` ~line 418)
- Test: `tests/throw-vs-use.test.js`

- [ ] **Step 1: Write the failing test**

```js
test('a thrown DoT item applies its buff to a hostile in the burst', () => {
    const g = mockGame();                       // reuse this file's existing mock
    const target = g.enemies[0];
    resolveThrow(g, ITEMS.sludge_sack, null, 1, { x: target.x, y: target.y });
    const dot = target.entity.buffs?.find(b => b.id === 'sludge')
             ?? target.buffs?.find(b => b.id === 'sludge');
    assert.ok(dot, 'expected a sludge DoT on the target');
    assert.equal(dot.dmg, 3);
    assert.equal(dot.turns, 5);
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /c/Code/violencetown && node --test tests/throw-vs-use.test.js
```

Expected: FAIL — no buff applied; `resolveThrow` only knows `damage` and `healAmount`.

- [ ] **Step 3: Implement**

In `resolveThrow`, where the per-target effect is applied, add the DoT branch beside the existing damage branch:

```js
        // A DoT item applies its buff instead of a flat hit. Half effect on the
        // burst edge is expressed as half TURNS, not half damage — a weaker tick
        // would misprice the item against dotValue's ladder, whereas a shorter
        // burn is exactly "less of the same thing".
        if (itemDef.dot) {
            const turns = direct ? itemDef.dot.turns : Math.max(1, Math.floor(itemDef.dot.turns / 2));
            const list = target.buffs || (target.buffs = []);
            const existing = list.find(b => b.id === itemDef.dot.id);
            if (existing) { existing.turns = Math.max(existing.turns, turns); existing.dmg = Math.max(existing.dmg, itemDef.dot.dmg); }
            else list.push({ id: itemDef.dot.id, turns, dmg: itemDef.dot.dmg });
            continue;
        }
```

- [ ] **Step 4: Run it and watch it pass**

```bash
cd /c/Code/violencetown && node --test tests/throw-vs-use.test.js
```

- [ ] **Step 5: Commit**

```bash
cd /c/Code/violencetown && git add game/items.js tests/throw-vs-use.test.js && git commit -m "dot: thrown items apply their DoT; burst edge halves turns not damage"
```

---

### Task 8: `fire_bottle`

**Files:**
- Modify: `game/items.js`
- Test: `tests/balance-harness.test.js`

- [ ] **Step 1: Write the failing test**

```js
test('fire_bottle exists and is at peg', () => {
    assert.ok(ITEMS.fire_bottle, 'fire_bottle should exist');
    assert.equal(ITEMS.fire_bottle.baseValue, 12);
    assert.equal(itemPegValue(ITEMS.fire_bottle), 12);
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /c/Code/violencetown && node --test tests/balance-harness.test.js
```

Expected: FAIL — `fire_bottle should exist`.

- [ ] **Step 3: Implement**

Add to `ITEMS` in `game/items.js`:

```js
    fire_bottle: {
        id: 'fire_bottle',
        name: '[Fire Bottle]',
        description: 'A bottle, a rag, and somebody else\'s problem. Lights what it lands on and keeps at it.',
        useType: 'throw',
        equipSlot: 'sides',
        range: 5,
        dot: { id: 'fire', dmg: 5, turns: 3 },
        damageType: 'fire',
        consumable: true,
        fallbackColor: '#e07a2a',
        baseValue: 12,
    },
```

- [ ] **Step 4: Run the suite and the lint**

```bash
cd /c/Code/violencetown && node --test 2>&1 | tail -6 && node tools/balance-harness.mjs | tail -3
```

Expected: `fail 0`, `total flags: 1`.

- [ ] **Step 5: Commit — Phase B complete**

```bash
cd /c/Code/violencetown && git add game/items.js tests/ && git commit -m "dot: fire_bottle — 5x3 fire DoT, the first real bomb"
```

---

# PHASE C — Kits

### Task 9: `rock` pulls aggro

**Files:**
- Modify: `game/main.js` (throw resolution), `game/items.js` (already flagged in Task 3)
- Test: `tests/kits.test.js` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/kits.test.js`:

```js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { rockClatter } from '../game/ai.js';

describe('rock — the stealth affordance', () => {
    test('enemies within earshot retarget to the landing tile', () => {
        const near = { x: 5, y: 5, _lastSeenX: null, _lastSeenY: null, state: 'idle', sightRange: 8 };
        const far  = { x: 40, y: 40, _lastSeenX: null, _lastSeenY: null, state: 'idle', sightRange: 8 };
        rockClatter([near, far], 6, 6);
        assert.deepEqual([near._lastSeenX, near._lastSeenY], [6, 6]);
        assert.equal(near.state, 'chasing');
        assert.equal(far._lastSeenX, null);
    });
    test('it does not disturb an enemy already chasing the player', () => {
        const busy = { x: 5, y: 5, _lastSeenX: 1, _lastSeenY: 1, state: 'chasing', sightRange: 8 };
        rockClatter([busy], 6, 6);
        assert.deepEqual([busy._lastSeenX, busy._lastSeenY], [1, 1]);
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /c/Code/violencetown && node --test tests/kits.test.js
```

Expected: FAIL — no `rockClatter` export.

- [ ] **Step 3: Implement**

In `game/ai.js`, beside the other predicates:

```js
// The rock's clatter (plans/enemy-kits-and-dots-design.md §2c) — the game's first
// stealth affordance. It reuses PD-1's existing seam: npc.js already pursues
// _lastSeenX/_lastSeenY rather than the player's true position, so a rock sets a
// false last-seen WITHOUT the thrower ever having been seen.
//
// An enemy already chasing is NOT redirected — a rock distracts, it does not
// rescue you from a fight you already started.
export function rockClatter(enemies, x, y) {
    for (const e of enemies || []) {
        if (!e || e.state === 'chasing') continue;
        const range = e.sightRange ?? 8;
        if (Math.max(Math.abs(e.x - x), Math.abs(e.y - y)) > range) continue;
        e._lastSeenX = x; e._lastSeenY = y;
        e.state = 'chasing';
    }
}
```

Then in `main.js`, after a throw resolves, call it when the item is flagged:

```js
        if (itemDef.pullsAggro) {
            rockClatter(this.enemies, tile.x, tile.y);
            this._log('[The rock clatters off down the tunnel.]');
        }
```

- [ ] **Step 4: Run it and watch it pass**

```bash
cd /c/Code/violencetown && node --test tests/kits.test.js
```

- [ ] **Step 5: Commit**

```bash
cd /c/Code/violencetown && git add game/ai.js game/main.js tests/kits.test.js && git commit -m "stealth: a thrown rock pulls aggro to where it lands"
```

---

### Task 10: `challengeGp` reads item ids

**The trap this closes:** `challengeGp` reads `it.value ?? 0` but every `ITEMS` def uses **`baseValue`**. Authoring `loadout: [ITEMS.mystery_meat]` today scores **0**, silently. The existing tests pass only because they use invented literals — `{name:'Big Potion', value:60}` is not a real item.

**Files:**
- Modify: `game/enemies.js:310-315`
- Test: `tests/wallets.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/wallets.test.js`:

```js
import { ITEMS } from '../game/items.js';
import { resolveLoadout } from '../game/enemies.js';

describe('challengeGp over real item ids (Law 6f)', () => {
    test('a loadout of ids sums their baseValue', () => {
        const e = new Enemy({ id: 'k', type: 'Fungus', x: 0, y: 0, gold: 4, loadout: ['tunnel_mushroom', 'mystery_meat'] });
        assert.equal(challengeGp(e), 4 + 9 + 3);
    });
    test('an unknown id contributes 0 rather than NaN', () => {
        const e = new Enemy({ id: 'k2', type: 'Fungus', x: 0, y: 0, gold: 5, loadout: ['not_a_real_item'] });
        assert.equal(challengeGp(e), 5);
    });
    test('legacy literal {value} objects still count — old saves keep working', () => {
        assert.equal(challengeGp({ gold: 10, loadout: [{ name: 'Big Potion', value: 60 }] }), 70);
    });
    test('resolveLoadout hands back real defs an enemy can USE', () => {
        const defs = resolveLoadout(['bandage', 'fire_bottle']);
        assert.equal(defs.length, 2);
        assert.equal(defs[0], ITEMS.bandage);
        assert.equal(defs[1].dot.id, 'fire');
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /c/Code/violencetown && node --test tests/wallets.test.js
```

Expected: FAIL — the id loadout scores 4 (gold only), and there is no `resolveLoadout`.

- [ ] **Step 3: Implement**

In `game/enemies.js`, add the `ITEMS` import at the top and replace `challengeGp`:

```js
import { ITEMS } from './items.js';
```

```js
// Resolve a loadout to real item defs. Entries are item IDS so an enemy can
// actually USE what it carries and so §6's ground drop is a one-liner. Unknown
// ids are dropped rather than throwing — content-validate.js is where a typo gets
// caught loudly, at author time.
export function resolveLoadout(loadout) {
    if (!Array.isArray(loadout)) return [];
    return loadout.map(x => (typeof x === 'string' ? ITEMS[x] : x)).filter(Boolean);
}

// Law 6f — the nameplate number is the whole kit: liquid gold + carried item
// values. Accepts item IDS (the authoring form) and legacy {value} literals (old
// saves and fixtures), so both read the same number.
export function challengeGp(e) {
    const items = (e.loadout ?? []).reduce((s, x) => {
        const def = (typeof x === 'string') ? ITEMS[x] : x;
        return s + (def?.value ?? def?.baseValue ?? 0);
    }, 0);
    return (e.gold ?? 0) + items;
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
cd /c/Code/violencetown && node --test tests/wallets.test.js && node --test 2>&1 | tail -6
```

Expected: PASS, `fail 0`. The harness imports `challengeGp` too — confirm it still runs:

```bash
cd /c/Code/violencetown && node tools/balance-harness.mjs --check
```

- [ ] **Step 5: Commit**

```bash
cd /c/Code/violencetown && git add game/enemies.js tests/wallets.test.js && git commit -m "kits: challengeGp resolves item ids; resolveLoadout hands back usable defs"
```

---

### Task 11: Role bands from armor, and the liquidity check

**Files:**
- Modify: `tools/balance-harness.mjs` (`lintEntity`, ~line 99)
- Test: `tests/balance-harness.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { bandForArmor, ROLE_BANDS } from '../tools/balance-harness.mjs';

describe('Law 4 role bands derived from armor', () => {
    test('armor already encodes the role ladder', () => {
        assert.equal(bandForArmor(-80).role, 'vermin');
        assert.equal(bandForArmor(-30).role, 'fodder');
        assert.equal(bandForArmor(-5).role, 'standard');
        assert.equal(bandForArmor(0).role, 'standard');
        assert.equal(bandForArmor(10).role, 'elite');
    });
    test('the bands match Law 4', () => {
        assert.deepEqual([bandForArmor(-80).min, bandForArmor(-80).max], [0, 5]);
        assert.deepEqual([bandForArmor(-30).min, bandForArmor(-30).max], [5, 20]);
        assert.deepEqual([bandForArmor(0).min, bandForArmor(0).max], [20, 60]);
        assert.deepEqual([bandForArmor(10).min, bandForArmor(10).max], [100, 200]);
    });
    test('an over-budget kit is flagged', () => {
        const flags = lintEntity({ zone: 'sewer', id: 'e1', type: 'Violet Fungus', hp: 100, armor: -30, damage: 5, gold: 2, loadout: ['bandage', 'fire_bottle'] });
        assert.ok(flags.some(f => /Law 4/.test(f)), `expected a band flag, got ${JSON.stringify(flags)}`);
    });
    test('a kit inside its band with sane liquidity is clean', () => {
        const flags = lintEntity({ zone: 'sewer', id: 'e1', type: 'Violet Fungus', hp: 100, armor: -30, damage: 5, gold: 3, loadout: ['tunnel_mushroom'] });
        assert.deepEqual(flags, []);      // 3 + 9 = 12 GP, in 5-20; liquid 25%
    });
    test('all-coin-no-kit is flagged on liquidity', () => {
        const flags = lintEntity({ zone: 'sewer', id: 'e1', type: 'Violet Fungus', hp: 100, armor: -30, damage: 5, gold: 15, loadout: [] });
        assert.ok(flags.some(f => /liquid/.test(f)));
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /c/Code/violencetown && node --test tests/balance-harness.test.js
```

Expected: FAIL — no `bandForArmor` export.

- [ ] **Step 3: Implement**

In `tools/balance-harness.mjs`, before `lintEntity`:

```js
// Law 4's role ladder, keyed off ARMOR — which already encodes it across the whole
// roster, so no new authored field is needed (plans/enemy-kits-and-dots-design.md §3a).
// Ordered most-fragile first; bandForArmor takes the first row the armor reaches.
export const ROLE_BANDS = [
    { role: 'vermin',   maxArmor: -80, min: 0,   max: 5 },
    { role: 'fodder',   maxArmor: -30, min: 5,   max: 20 },
    { role: 'bruiser',  maxArmor: -15, min: 15,  max: 40 },   // OPEN (spec §9.1): Law 3 stop with no Law 4 row
    { role: 'standard', maxArmor: 0,   min: 20,  max: 60 },
    { role: 'elite',    maxArmor: 10,  min: 100, max: 200 },
];

export function bandForArmor(armor) {
    for (const b of ROLE_BANDS) if (armor <= b.maxArmor) return b;
    return ROLE_BANDS[ROLE_BANDS.length - 1];
}

// Liquidity target (spec §3a): gold is ~20% of the kit, the rest carried as items.
// Authored kits never land on round numbers, so the lint accepts a range. Below
// LIQUID_MIN the kill feels unrewarded; above LIQUID_MAX the enemy is carrying a
// purse rather than a loadout.
export const LIQUID_MIN = 0.10;
export const LIQUID_MAX = 0.30;
```

Then extend `lintEntity`, keeping every existing check:

```js
    // Law 4 — the kit must land in the band its armor declares.
    const band = bandForArmor(e.armor);
    const gp = challengeGp(e);
    const fights = (e.damage ?? 0) > 0 && !e.ambient;
    if (fights && !e.vermin && (gp < band.min || gp > band.max)) {
        flags.push(`${key} Law 4 — challenge ${gp} GP outside the ${band.role} band [${band.min}, ${band.max}]`);
    }
    // Liquidity (spec §3a). Vermin are exempt — the 0-5 band is too small for a
    // percentage to mean anything.
    if (fights && !e.vermin && gp > 0) {
        const liquid = (e.gold ?? 0) / gp;
        if (liquid < LIQUID_MIN || liquid > LIQUID_MAX) {
            flags.push(`${key} Law 6 — ${Math.round(liquid * 100)}% liquid, expected ${LIQUID_MIN * 100}-${LIQUID_MAX * 100}%`);
        }
    }
```

- [ ] **Step 4: Run it and watch it pass**

```bash
cd /c/Code/violencetown && node --test tests/balance-harness.test.js
```

- [ ] **Step 5: See how red the live roster is**

```bash
cd /c/Code/violencetown && node tools/balance-harness.mjs | grep -c 'Law 4\|Law 6'
```

Expected: **13** — one per fighter, every one broke. That number is the bug, stated by the tool. Task 13 drives it to 0.

- [ ] **Step 6: Commit**

```bash
cd /c/Code/violencetown && git add tools/balance-harness.mjs tests/balance-harness.test.js && git commit -m "kits: lintEntity enforces Law 4 bands and the 20% liquidity target"
```

---

### Task 12: The role-default fallback

Stops a 14th enemy, a summon, or a runtime set-piece spawn shipping broke by omission — the exact failure that produced this bug.

**Files:**
- Modify: `game/enemies.js` (`spawnEnemy`, ~line 321)
- Test: `tests/kits.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { spawnEnemy, challengeGp } from '../game/enemies.js';

describe('kit fallback — nothing ships broke by omission', () => {
    test('a fighter authored with no kit inherits its band default', () => {
        const e = spawnEnemy({ id: 'new1', type: 'Thug', x: 0, y: 0, armor: -30, damage: 5 }, new Set());
        assert.ok(challengeGp(e) >= 5, `expected a fodder kit, got ${challengeGp(e)}`);
        assert.ok(e.loadout.length > 0);
    });
    test('an authored kit always wins over the default', () => {
        const e = spawnEnemy({ id: 'new2', type: 'Thug', x: 0, y: 0, armor: -30, damage: 5, gold: 3, loadout: ['tunnel_mushroom'] }, new Set());
        assert.deepEqual(e.loadout, ['tunnel_mushroom']);
        assert.equal(e.gold, 3);
    });
    test('a civilian gets no kit — only fighters carry', () => {
        const e = spawnEnemy({ id: 'folk', type: 'Violencian', x: 0, y: 0, armor: -80, damage: 0 }, new Set());
        assert.equal(challengeGp(e), 0);
    });
    test('Law 6d — a mugged respawn comes back with NO kit, not just no gold', () => {
        const e = spawnEnemy({ id: 'm1', type: 'Thug', x: 0, y: 0, armor: -30, damage: 5, gold: 3, loadout: ['tunnel_mushroom'] }, new Set(['m1']));
        assert.equal(e.gold, 0);
        assert.deepEqual(e.loadout, []);
        assert.equal(challengeGp(e), 0);
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /c/Code/violencetown && node --test tests/kits.test.js
```

Expected: FAIL — no default is applied, and a mugged spawn keeps its loadout.

- [ ] **Step 3: Implement**

In `game/enemies.js`:

```js
// Stock kits by armor band (spec §3b). This is the OMISSION BACKSTOP, not the
// authoring surface: a summon, a runtime set-piece spawn, or a new enemy added by
// someone who didn't read the spec inherits a legal kit instead of shipping broke
// — which is precisely how Law 6's wallets sat empty through a whole release.
// Explicit authoring always wins.
const KIT_DEFAULTS = [
    { maxArmor: -80, gold: 1, loadout: ['rock'] },                          //  4 GP
    { maxArmor: -30, gold: 3, loadout: ['tunnel_mushroom'] },               // 12 GP
    { maxArmor: -15, gold: 6, loadout: ['tunnel_mushroom', 'fire_bottle'] },// 27 GP
    { maxArmor: 0,   gold: 8, loadout: ['bandage', 'fire_bottle'] },        // 45 GP
    { maxArmor: 10,  gold: 30, loadout: ['bandage', 'bandage', 'fire_bottle', 'sludge_sack', 'boardwalk_burger'] }, // 117 GP
];

function defaultKit(armor) {
    for (const k of KIT_DEFAULTS) if (armor <= k.maxArmor) return k;
    return KIT_DEFAULTS[KIT_DEFAULTS.length - 1];
}

// Law 6d: a spawn the player already mugged comes back broke — no gold AND no kit,
// so re-entering a zone can't farm either half of the wallet. Pure so it stays
// Node-testable.
export function spawnEnemy(spawnDef, muggedIds) {
    const e = new Enemy(spawnDef);
    const fights = (e.damage ?? 0) > 0 && !e.ambient;
    if (fights && spawnDef.gold == null && spawnDef.loadout == null) {
        const kit = defaultKit(e.entity.armor ?? 0);
        e.gold = kit.gold;
        e.loadout = [...kit.loadout];
    }
    if (!Array.isArray(e.loadout)) e.loadout = e.loadout ? [...e.loadout] : [];
    if (muggedIds?.has(e.id)) { e.gold = 0; e.loadout = []; }
    return e;
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
cd /c/Code/violencetown && node --test tests/kits.test.js tests/wallets.test.js
```

- [ ] **Step 5: Commit**

```bash
cd /c/Code/violencetown && git add game/enemies.js tests/kits.test.js && git commit -m "kits: role-default fallback; mugged respawns lose the kit too (Law 6d)"
```

---

### Task 13: Author the 13 kits

The design work. Each kit must land in its armor's band with 10–30% liquid, and should say something about the creature.

**Files:**
- Modify: `game/sewer-map.json`, `game/factory-map.json`, `game/circus-map.json`, `game/graveyard-map.json`, `game/canyon-map.json`

- [ ] **Step 1: Author each fighter's `gold` and `loadout`**

Add these two fields to each spawn. Civilians, vendors and ambient townsfolk get **nothing** — only `damage > 0` non-ambient spawns carry.

| zone | id | type | armor | band | `gold` | `loadout` | GP |
|---|---|---|---|---|---|---|---|
| sewer | e1 | Violet Fungus | −30 | 5–20 | 3 | `["tunnel_mushroom"]` | 12 |
| sewer | e2 | Violet Fungus | −30 | 5–20 | 3 | `["tunnel_mushroom"]` | 12 |
| sewer | e3 | Red Fungus | −30 | 5–20 | 4 | `["mystery_meat","mystery_meat"]` | 10 |
| sewer | e4 | Red Fungus | −30 | 5–20 | 4 | `["mystery_meat","mystery_meat"]` | 10 |
| sewer | e5 | Ghost Fungus | −80 | 0–5 | 1 | `["rock"]` | 4 |
| sewer | e6 | Fungus King | −5 | 20–60 | 9 | `["tunnel_mushroom","sludge_sack","boardwalk_burger"]` | 43 |
| sewer | wererat | Wererat | 0 | 20–60 | 8 | `["bandage","hot_dog"]` | 43 |
| factory | green1 | Greedy Green | −30 | 5–20 | 3 | `["hot_dog"]` | 13 |
| circus | clown1 | Carnival Clown | −80 | 0–5 | 1 | `["rock"]` | 4 |
| graveyard | skel1 | Rattling Skeleton | −80 | 0–5 | 1 | `["rock"]` | 4 |
| canyon | canyon-rat-1 | Rat (vermin) | −80 | 0–5 | 1 | `[]` | 1 |
| canyon | canyon-rat-2 | Rat (vermin) | −80 | 0–5 | 1 | `[]` | 1 |
| canyon | pike | Pike (vendor) | −15 | *open* | — | — | — |

**Pike is deliberately skipped.** It sits on the −15 stop that spec §9.1 flags as having no Law 4 row, and it is a vendor with its own `VENDOR_WALLET`. Leave it unauthored until Caelan rules on the band.

Example, `game/sewer-map.json`:

```json
    { "id": "e1", "type": "Violet Fungus", "x": 12, "y": 7, "hp": 100, "armor": -30, "damage": 5,
      "gold": 3, "loadout": ["tunnel_mushroom"] },
```

- [ ] **Step 2: Drive the lint to zero**

```bash
cd /c/Code/violencetown && node tools/balance-harness.mjs | grep 'Law 4\|Law 6'
```

Expected: **no output.** If a kit is flagged, adjust `gold` or the item list until it lands — the lint is the authority, not this table.

- [ ] **Step 3: Confirm only the known flag remains**

```bash
cd /c/Code/violencetown && node tools/balance-harness.mjs | tail -3
```

Expected: `total flags: 1` (Cone of Cold).

- [ ] **Step 4: Re-cut the golden and eyeball the economy row**

```bash
cd /c/Code/violencetown && node tools/balance-harness.mjs --write && git diff tools/balance-golden.txt | head -60
```

The per-zone faucet numbers should now be non-zero for the first time.

- [ ] **Step 5: Run the game and look at a nameplate**

```bash
cd /c/Code/violencetown && python dev-server.py 3007
```

Walk into the Sewer. **Gold pips should be visible under a Violet Fungus's HP bar** — the first time in the game's history. Confirm the Fungus King shows more than a grunt.

- [ ] **Step 6: Commit**

```bash
cd /c/Code/violencetown && git add game/*-map.json tools/balance-golden.txt && git commit -m "kits: author 13 fighter kits; the wallets are no longer empty"
```

---

### Task 14: Drops on death — **amends Law 6f**

**Files:**
- Modify: `game/main.js:3815-3831` (`_handleEnemyDeath`)
- Test: `tests/drops.test.js`

- [ ] **Step 1: Write the failing test**

```js
test('the unused kit drops as ground items (Law 6f as amended)', () => {
    const g = mockGame();
    const e = { id: 'x', type: 'Fungus', x: 4, y: 4, gold: 3, loadout: ['tunnel_mushroom', 'fire_bottle'],
                entity: { name: '[Fungus]', isAlive: () => false } };
    g._handleEnemyDeath(e);
    const dropped = g.groundItems.filter(gi => gi.x === 4 && gi.y === 4).map(gi => gi.type);
    assert.deepEqual(dropped.sort(), ['fire_bottle', 'tunnel_mushroom']);
});
test('an enemy that drank its potion drops only what is left', () => {
    const g = mockGame();
    const e = { id: 'y', type: 'Fungus', x: 4, y: 4, gold: 3, loadout: [],
                entity: { name: '[Fungus]', isAlive: () => false } };
    g._handleEnemyDeath(e);
    assert.equal(g.groundItems.filter(gi => gi.x === 4).length, 0);
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /c/Code/violencetown && node --test tests/drops.test.js
```

- [ ] **Step 3: Implement**

In `_handleEnemyDeath`, after the existing gold transfer block:

```js
        // Law 6f AS AMENDED (plans/enemy-kits-and-dots-design.md §6): the unused
        // kit drops. He spent his tricks or he didn't — what's left is the reward
        // for rushing him. Farming stays closed because spawnEnemy clears the
        // loadout for a mugged id, same as it clears the gold.
        for (const def of resolveLoadout(enemyObj.loadout)) {
            this._recordDrop(def.id, enemyObj.x, enemyObj.y);
            this.groundItems.push({ type: def.id, x: enemyObj.x, y: enemyObj.y, def });
        }
        if (enemyObj.loadout?.length) {
            this._log(`[They drop what they didn't get to use.]`, 'pickup');
            this._muggedIds.add(enemyObj.id);
        }
        enemyObj.loadout = [];
```

Import `resolveLoadout` alongside the existing `enemies.js` imports at `main.js:25`.

- [ ] **Step 4: Run it and watch it pass**

```bash
cd /c/Code/violencetown && node --test tests/drops.test.js && node --test 2>&1 | tail -6
```

- [ ] **Step 5: Play it — confirm the floor is not carpeted**

```bash
cd /c/Code/violencetown && python dev-server.py 3007
```

Kill three fungus in the Sewer and walk over the corpses. You should absorb ~4 items, not 30. If it feels like a carpet, kits are too big — go back to Task 13.

- [ ] **Step 6: Commit**

```bash
cd /c/Code/violencetown && git add game/main.js tests/drops.test.js && git commit -m "kits: the unused kit drops on death (amends Law 6f)"
```

---

### Task 15: Author-time kit validation

**Files:**
- Modify: `game/content-validate.js`
- Test: `tests/content-integrity.test.js`

- [ ] **Step 1: Write the failing test**

```js
test('a loadout naming an unknown item is a hard problem', () => {
    const { problems } = validateContent([{ file: 'x-map.json', data: { enemies: [
        { id: 'e1', type: 'Thug', damage: 5, loadout: ['not_an_item'] },
    ] } }]);
    assert.ok(problems.some(p => /not_an_item/.test(p)), problems.join('\n'));
});
test('a real loadout passes clean', () => {
    const { problems } = validateContent([{ file: 'x-map.json', data: { enemies: [
        { id: 'e1', type: 'Thug', damage: 5, gold: 3, loadout: ['tunnel_mushroom'] },
    ] } }]);
    assert.deepEqual(problems, []);
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /c/Code/violencetown && node --test tests/content-integrity.test.js
```

- [ ] **Step 3: Implement**

In `validateContent`'s map-references loop, beside the `stock` check:

```js
            for (const id of (e.loadout || []))
                if (!itemIds.has(id)) P(`${file}: enemy ${e.id || '?'} carries unknown item '${id}'`);
```

- [ ] **Step 4: Run it, then the whole suite**

```bash
cd /c/Code/violencetown && node --test 2>&1 | tail -6
```

- [ ] **Step 5: Commit — Phase C complete**

```bash
cd /c/Code/violencetown && git add game/content-validate.js tests/content-integrity.test.js && git commit -m "kits: content-validate catches a typo'd loadout id at author time"
```

---

# PHASE D — Faction food and social poisoning

### Task 16: `isSewerDweller` and the effect flip

> **Spec correction, found while planning.** §5a says the faction split reads "from the existing `ai.js` allegiance parse — the one source of truth for who counts as what." **That is wrong.** Allegiance is `hostile`/`ally`/`neutral` — it describes who you *fight*, not what you *are*. A bribed Violet Fungus becomes an ally and would stop being able to eat mushrooms. Species needs its own field. Amend §5a when this lands.

**Files:**
- Modify: `game/ai.js`, `game/enemies.js` (ctor), `game/items.js`, sewer/canyon map JSONs
- Test: `tests/kits.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { isSewerDweller } from '../game/ai.js';

describe('sewer fare — the eater decides', () => {
    test('species is independent of allegiance', () => {
        assert.equal(isSewerDweller({ sewerDweller: true, allegiance: 'ally' }), true);
        assert.equal(isSewerDweller({ sewerDweller: true, allegiance: 'hostile' }), true);
        assert.equal(isSewerDweller({ allegiance: 'hostile' }), false);
    });
    test('a bribed fungus can still eat its mushrooms', () => {
        const flipped = { sewerDweller: true, allegiance: 'ally', _wasFlipped: true };
        assert.equal(isSewerDweller(flipped), true);
    });
    test('the player is never a sewer dweller', () => {
        assert.equal(isSewerDweller(null), false);
        assert.equal(isSewerDweller({}), false);
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /c/Code/violencetown && node --test tests/kits.test.js
```

- [ ] **Step 3: Implement**

In `game/ai.js`:

```js
// SPECIES, not allegiance (plans/enemy-kits-and-dots-design.md §5a as corrected).
// Sewer fare is poison to humans and medicine to the things that live down there,
// and that must survive a disposition flip — a bribed Violet Fungus is your ally
// and still eats mushrooms. Deliberately NOT derived from `allegiance`, which
// answers a different question.
export function isSewerDweller(e) {
    return !!(e && e.sewerDweller);
}
```

Add `sewerDweller = false` to the `Enemy` ctor destructure and `this.sewerDweller = sewerDweller;` to the body, plus `sewerDweller: this.sewerDweller` in `toSave()` and the `fromSave` restore.

Author `"sewerDweller": true` on the sewer roster (`e1`–`e6`, `wererat`, `carrion`) and the canyon rats.

Then in `items.js`, where a `dot` or `damage` effect resolves against a target, flip the sign:

```js
        // §5a — magnitude preserved, sign flipped. A poison DoT becomes a
        // regeneration-over-time on a sewer dweller, through the SAME buff
        // machinery with a negative dmg. One baseValue stays honest for both.
        const heals = itemDef.sewerFare && isSewerDweller(target);
        const dmg = heals ? -itemDef.dot.dmg : itemDef.dot.dmg;
```

- [ ] **Step 4: Run it and watch it pass**

```bash
cd /c/Code/violencetown && node --test tests/kits.test.js
```

- [ ] **Step 5: Confirm negative dmg heals rather than underflowing**

Add to `tests/dot.test.js`:

```js
test('a negative-dmg DoT regenerates and respects maxHp', () => {
    const g = fakeGame(95);
    g.buffs = [{ id: 'poison', turns: 2, dmg: -5 }];
    tickBuffList(g.buffs, g, g);
    assert.equal(g.playerHp, 100);
    tickBuffList(g.buffs, g, g);
    assert.equal(g.playerHp, 100);        // clamped, never over the Hundred
});
```

Task 5's `applyDot` already clamps upward (`Math.min(game.playerMaxHp, ...)`) and already guards the defeat claim behind `dmg > 0`, so this should pass with no production change. **If it doesn't, the Task 5 implementation drifted** — fix `applyDot`, not the test.

- [ ] **Step 6: Commit**

```bash
cd /c/Code/violencetown && git add game/ai.js game/enemies.js game/items.js game/*-map.json tests/ && git commit -m "faction: sewer fare poisons humans and heals what lives down there"
```

---

### Task 17: Poisoning someone as a social attack

**Files:**
- Modify: `game/give-action.js`
- Test: `tests/give-action.test.js` (or `tests/kits.test.js` if no give-action test file exists)

- [ ] **Step 1: Write the failing test**

```js
import { reactToTransaction } from '../game/give-action.js';

describe('poisoning as a social attack', () => {
    test('gifting sewer fare to a human damages AND drops disposition', () => {
        const npc = { type: 'Violencian', disposition: 20, flipThreshold: -50, values: [], buffs: [] };
        const before = npc.disposition;
        const r = reactToTransaction(npc, { kind: 'gift', itemDef: ITEMS.tunnel_mushroom });
        assert.ok(npc.disposition < before, 'poisoning must not raise their opinion of you');
        assert.ok(npc.buffs.some(b => b.id === 'poison'));
        assert.ok(/poison|sick|betray/i.test(r.message || ''));
    });
    test('someone who VALUED that food takes it worse — betrayal scales with want', () => {
        const plain  = { type: 'A', disposition: 20, flipThreshold: -50, values: [], buffs: [] };
        const hungry = { type: 'B', disposition: 20, flipThreshold: -50, values: ['food'], buffs: [] };
        reactToTransaction(plain,  { kind: 'gift', itemDef: ITEMS.tunnel_mushroom });
        reactToTransaction(hungry, { kind: 'gift', itemDef: ITEMS.tunnel_mushroom });
        assert.ok(hungry.disposition < plain.disposition);
    });
    test('a sewer dweller given the same mushroom is PLEASED', () => {
        const fungus = { type: 'Violet Fungus', sewerDweller: true, disposition: 0, flipThreshold: -50, values: [], buffs: [] };
        reactToTransaction(fungus, { kind: 'gift', itemDef: ITEMS.tunnel_mushroom });
        assert.ok(fungus.disposition > 0, 'to them it is medicine');
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /c/Code/violencetown && node --test tests/give-action.test.js
```

- [ ] **Step 3: Implement**

In `reactToTransaction`, before the normal gift-credit path:

```js
    // §5b — poisoning as a social attack. Routed through THIS seam rather than
    // bolted on beside the damage, because it is the same transaction with a
    // negative sign: the disposition hit must EXCEED the gift credit the food
    // would otherwise earn, or feeding someone poison becomes a way to be liked.
    // An NPC whose `values` include the food reacts WORSE — the betrayal is
    // proportional to how much they wanted it.
    if (tx.itemDef?.sewerFare && !isSewerDweller(npc)) {
        const wanted = (npc.values || []).includes('food');
        const hit = wanted ? -30 : -15;
        npc.disposition = Math.max(-100, npc.disposition + hit);
        const dot = tx.itemDef.dot;
        if (dot) (npc.buffs || (npc.buffs = [])).push({ id: dot.id, turns: dot.turns, dmg: dot.dmg });
        return {
            message: `[${npc.name ?? npc.type} eats it, goes grey, and looks at you differently.]`,
            flipped: npc.disposition <= (npc.flipThreshold ?? -50),
        };
    }
```

- [ ] **Step 4: Run it and watch it pass**

```bash
cd /c/Code/violencetown && node --test 2>&1 | tail -6
```

- [ ] **Step 5: Commit**

```bash
cd /c/Code/violencetown && git add game/give-action.js tests/ && git commit -m "faction: gifting poisoned food damages and costs disposition"
```

---

### Task 18: Close-out — verify, amend the constitution, ship

**Files:**
- Modify: `plans/gold-standard-design.md`, `plans/enemy-kits-and-dots-design.md`, `package.json`, `game/index.html`, `game/style.css`

- [ ] **Step 1: Full verification**

```bash
cd /c/Code/violencetown && node --test 2>&1 | tail -8 && node tools/balance-harness.mjs --check && git grep -iE 'violence[ _-]+town' -- ':!CLAUDE.md' ':!plans/item-hotbar-xmb-implementation.md'
```

Expected: `fail 0`; `balance golden matches — no drift`; no naming hits.

- [ ] **Step 2: Play the whole loop**

```bash
cd /c/Code/violencetown && python dev-server.py 3007
```

Check, in order: pips render on a Violet Fungus · a thrown sludge sack ticks it down over 5 turns · a thrown fire bottle burns for 3 · being burned floors you at 1 HP and **does not** kill you · dying to something else while burning gives the sludge scenario · killing a fungus drops its unused kit · a mugged respawn has no pips · giving a Violencian a tunnel mushroom poisons them and drops their mood · console clean.

- [ ] **Step 3: Amend `plans/gold-standard-design.md`**

Apply spec §10: rewrite Law 6f's loot sentence, add the authoring model to Law 6, add the consumable-peg and DoT-discount statements to Law 1, add **Law 7 — The DoT Floor**, and mark the "Enemy gold: vendors only → every enemy carries a role-band wallet" retune row done.

- [ ] **Step 4: Update the spec's status header**

In `plans/enemy-kits-and-dots-design.md`, change `**Status:** Design (Gate 2)` to `**Status:** Implemented`, and resolve §9.1 (the −15 band) and §9.3 (the magnitude rule) with whatever Caelan ruled.

- [ ] **Step 5: Version bump**

`package.json`, `game/index.html`, `game/style.css` → **0.20.0**. Leave `game/sw.js`'s `CACHE` alone — the service worker is network-first and self-heals via `cache.put`.

- [ ] **Step 6: Commit and hand back**

```bash
cd /c/Code/violencetown && git add -A && git commit -m "v0.20.0: enemy kits, consumable repricing, and damage over time

The marquee idea of v0.19.0 was an enemy's visible wallet as dread. The
machinery shipped and the wallets stayed empty. They are full now: 13
fighters carry authored kits of food, poison and fire whose summed value is
the challenge rating, ~20% of it liquid.

Amends Law 6f (the unused kit drops) and adds Law 7 (a DoT never lands the
killing tick on the player)."
```

Merging to `dev` and on to `main` is **Caelan's call** — do not merge.

---

## Verification checklist

| claim | command | expected |
|---|---|---|
| Suite green | `node --test` | `fail 0` |
| No balance drift | `node tools/balance-harness.mjs --check` | `balance golden matches` |
| Every consumable at peg | `node tools/balance-harness.mjs \| grep 'item/'` | no output |
| Every kit in band | `node tools/balance-harness.mjs \| grep 'Law 4\|Law 6'` | no output |
| Only the known flag | `node tools/balance-harness.mjs \| tail -1` | `total flags: 1` |
| Naming rule | `git grep -iE 'violence[ _-]+town' -- ':!CLAUDE.md' ':!plans/item-hotbar-xmb-implementation.md'` | no output |
| No wallet is empty | `node -e "..."` over the roster | every fighter `challengeGp > 0` |

## Open items carried from the spec

1. **§9.1 — the −15 armor band.** `ROLE_BANDS` proposes `bruiser` 15–40. Pike and the Borgir boss sit there and Task 13 deliberately skips Pike. Needs a ruling.
2. **§9.2 — the potion category is still empty.** No drink/throw/give buff item exists. The elite `KIT_DEFAULTS` entry is bandages and bombs as a result; elite content will want a real potion.
3. **§9.4 — does opening the REMOTICON advance a world turn?** Now sharper: with DoTs live, a bag-open that costs a turn also costs a poison tick, partly undoing the guarantee that reading your bag is free.
4. **§9.5 — boss band derivation.** The Wererat (armor 0, tagged `wererat_boss`) lints as *standard*. Almost certainly right for an act-1 boss, but it should be stated rather than inferred.
