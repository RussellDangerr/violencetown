# Feature: Defeat Scenarios — Outward-style varied defeat (System 1 of 3)

**Phase:** Core loop / world-feel — replaces the roguelike death-wipe with reactive, area- and cause-specific defeat outcomes.
**Priority:** High (reframes what failure MEANS in the game).
**Status:** Design (approved 2026-07-12).
**Source:** Outward's "Defeat Scenario" system (research: ~129 scenarios distilled to rules — see Gate 1) + brainstorm 2026-07-12.

> **Decisions (Caelan):**
> - **Defeat is a *varied fate*** (full Outward): HP→0 fires one of several **area/cause-specific scenarios**, not a game-over or a flat reset.
> - **What's at stake = a safe floor + the aggressor takes the rest.** A small always-safe core survives every defeat; beyond it, *who beat you* decides what's taken.
> - **Recovery is aggressor-appropriate:** wealth/loot taken by humanoids (the Wererats) is recoverable (fight/pay); consumables eaten by beasts (the Fungus) or breakables destroyed by a fall are just gone.
> - **Statuses are temporary, never permanent** (respects the "setbacks recover, debuffs aren't punishing" rule — see [[buff-design-philosophy]]).
> - **An occasional rescue/gift roll** exists (the "given," not only "taken").

## Scope: this is System 1 of 3

The brainstorm surfaced three linked systems. This spec is **only #1**; it defines clean *seams* to the other two, which get their own specs:

1. **Defeat scenarios** ← THIS SPEC.
2. **World persistence** — mobs respawn, bosses reset to full ("one-go"), and the world *shifts* when a boss falls (Wererat defeat → Lonny's quest opens, the sewer relaxes on return). This spec only needs the **boss-defeat seam** (a boss beating YOU runs a retry, not a scenario; YOU beating a boss is that spec's trigger).
3. **Item taxonomy / the "loot" bucket** — a sell-only, infinite-storage loot category vs. essentials. This spec refers to the **safe floor** and the **at-risk pool** abstractly; when #3 lands, "loot" becomes the clean at-risk bucket. Until then the at-risk pool = "inventory not in the safe floor," and take-rules key on existing item metadata.

---

## Gate 1: Research

- **Genre reference — Outward's Defeat Scenario system (distilled):**
  - Depleting HP is **a story branch, not a game-over**: the screen fades, time passes, you wake into a *scenario*. No reload loop (permadeath is an opt-in Hardcore roll only).
  - Which scenario fires is **weighted, not random**: `region × who/what-beat-you × story-state`.
  - Every scenario is the same **template**: `{ wake at a new place · time skipped · vitals rewritten · a status/injury · items taken by a rule that fits the aggressor · sometimes a gift · a recovery hook }`.
  - **Consistent take-vs-leave logic:** *humanoids take wealth* (silver, valuables, gear → recoverable by fight/ransom); *beasts take consumables or wreck breakables* (food, mushrooms, potions → cheap, gone); *rescuers give* (supplies, a campfire). **Nobody takes everything, and the backpack is always recoverable** — that invariant is why it never reads as a wiped save.
  - **Severity scales with where/how you fell**, and can even be net-positive (a rescue nets free items). "I died" becomes "I wonder what happens."
- **Player Experience Goal:** *"Losing a fight doesn't reset my run — something happens TO me that fits where I am and who beat me, costs me something real but bounded, sometimes even helps, and leaves me in the world to adapt."*
- **Technical feasibility — current state (verified 2026-07-12):**
  - Death today is a **flat roguelike wipe**: `_die()` (`main.js:3830`) → `setTimeout(_respawn, 500)` → `_respawn()` (`main.js:3842`) refills HP/MP, clears buffs, **deletes all non-`questItem` inventory**, **strips all equipment back to `wooden_sword`**, de-aggros chasers, drops the player at `_safeRespawnCell()` (`main.js:3887`), force-autosaves. `_die` is called from `_advanceWorld` on `playerHp <= 0` (`main.js:3116`, `:3151`) and takes **no argument** — the killer isn't tracked.
  - **Quest items already survive death** (the `questItem` carve-out at `_respawn` — added to stop the converter soft-lock). This is the seed of the "safe floor."
  - The **buff system** (`game/buffs.js` `BUFF_DEFS` with `onTick`/`onExpire`; `addBuff` `main.js:397`; `_tickBuffs` `main.js:405`) can carry a temporary "rattled/hunched" status that expires.
  - The **day/night clock** (`_advanceDayClock` `main.js:3291`, folded into `_worldBeat`) can absorb a `timeSkip`.
  - **Containers** (map JSON `containers[]`, e.g. `soap-mine-chest`; persisted by save.js) are the natural home for a **recoverable stash** of humanoid-taken loot.
  - **Items** carry `questItem`, `category`, `useType`, `consumable`, `baseValue`; `WEAPONS` are separate. Enough metadata to write take-rules (e.g. "food/mushroom category", "high `baseValue` loot").
  - **Enemies** carry `type` (e.g. "Violet Fungus", "Wererat") and `tag` (e.g. `wererat_boss`). Enough to identify the defeater and flag bosses.
  - Save.js already persists inventory / equipment / buffs / containers / groundItems — so the *aftermath* of a scenario persists with no new save schema (see Save/Load Impact).
- **Scope (MVF):** a data-driven `DEFEAT_SCENARIOS` table + a weighted picker keyed on `(zone × defeatedBy × story-state)` + one **consequence runner** that applies the template + the **safe-floor / aggressor take-rule** + a **recovery-stash** mechanic + **~5 seeded sewer scenarios** + a **generic fallback** + the **boss-retry seam**. Replaces `_respawn`'s wipe.
- **Out of scope:** the full item taxonomy / loot bucket (System 3 — at-risk pool is defined abstractly here); the world-persistence + boss-reset-and-shift (System 2 — only the "boss beat me → retry" seam is here); the upgrade mechanic; scenario content for non-sewer zones (generic fallback covers them); hardcore/permadeath; multi-step "escape the prison" set-pieces (a recovery *hook* is enough for MVF — a full escape dungeon is later content).
- **Risks:**
  1. **Content burden** (Outward has 129). → data-driven table + a generic fallback; seed ONLY the sewer; `log()`-style note when a zone falls back so missing content is visible, not silent. Grows per-zone as content.
  2. **Breaking the death path / soft-lock** (respawn into a wall; lose a quest item). → keep `_safeRespawnCell` for wake tiles; the safe floor ALWAYS includes `questItem`s (superset of today's carve-out). Regression-test the converter quest can't soft-lock.
  3. **Punishing feel** (violates [[buff-design-philosophy]]). → statuses are temporary + recoverable, never a permanent stat cut; the safe floor guarantees a floor; recovery hooks + the occasional gift keep it from feeling purely subtractive.
  4. **Recovery-stash bookkeeping** (a stash you can't reach / that vanishes). → reuse the persisted container system; spawn the stash at a reachable, defeater-appropriate tile; it saves/loads like any container.
  5. **Unknown defeater** (hazard death, scripted damage, no last-attacker). → `resolveDefeat` always has a **generic fallback**; `_lastDefeatedBy` defaults to a `cause` string ('fall'/'sludge'/'unknown') so the picker never has nothing to match.

---

## Gate 2: Design

### System design — the spine

Replace the death path with a **pick-then-run** flow:

```
playerHp <= 0
  → _die(cause)                      // cause = the last attacker OR a hazard tag
  → resolveDefeat(cause)             // pick a scenario, weighted by (zone × defeatedBy × state)
      → if defeatedBy is a boss  → runBossRetry()      // System-2 seam: reset encounter, bump to staging
      → else                     → runScenario(pick)   // apply the consequence template
```

**Tracking the defeater.** Stamp the attacker on the player-damage path (`applyDamageToPlayer` ≈`main.js:3728`): `this._lastDefeatedBy = enemy`. Hazard/fall damage sets `this._lastDefeatedBy = { cause: 'fall' | 'sludge' }`. `_die` reads it (default `{ cause: 'unknown' }`), passes it on, then clears it.

**The table** (`game/defeat-scenarios.js`, new — pure data + a pure picker so it's node-testable, mirroring `ai.js`/`skills.js`):

```js
// Each scenario: a predicate over the defeat context + a weight + a declarative consequence.
export const DEFEAT_SCENARIOS = [
  { id, when: (ctx) => bool, weight: n, consequence: {...} },
  ...
];
// ctx = { zone, by, cause, questState }  — `by` is the enemy (type/tag) or null; `cause` a string.
export function pickScenario(ctx, rng) { /* filter by when(), weighted random via rng, fallback id */ }
```

`pickScenario` is **pure** (takes the seeded `rng` so it's deterministic + save-safe). It filters `when()`, weighted-random-picks with the game RNG, and returns the **generic fallback** if nothing matches.

### The consequence template

`runScenario(scenario, game)` applies these slots (each optional; a scenario sets what it uses):

| Slot | Meaning | Reuses |
|---|---|---|
| `wakeAt` | `{ map?, spot }` — a named region/tile in the current map, or another map. Missing → `_safeRespawnCell()`. | `_safeRespawnCell`, `_loadMap`/transition |
| `timeSkip` | beats to advance the day/night clock (a scuffle vs. to-morning). | `_advanceDayClock` / `_worldBeat` |
| `status` | a temporary buff id ('rattled', 'hunched', 'sludged') — **expires**, no permanent cut. | `addBuff`, new `BUFF_DEFS` entries |
| `hp` | fraction of maxHp to wake at (default 0.5). | direct |
| `take` | the aggressor take-rule (below) applied to the at-risk pool. | inventory + a spawned container |
| `gift` | items/heal GIVEN (rescue rolls). | `_addToInventory` |
| `log` | the flavor line(s). | `_log` |

### Safe floor + the aggressor take-rule

**Safe floor** (survives every defeat): `isSafe(item) = item.questItem || item === equippedWeapon || item.essential`. Everything else in inventory / other equipped gear = the **at-risk pool**. (When System 3 lands, the "loot" bucket becomes the explicit at-risk pool; `essential` becomes the player-curated safe set.)

**Take-rule** (declarative per scenario, applied to the at-risk pool):

```js
take: {
  categories?: ['food','mushroom'],  // take items whose category matches (beasts)
  loot?: 'all' | fraction,           // take spare gear / high-value 'loot' (humanoids)
  gold?: fraction,                   // take a fraction of GP (humanoids)
  breakables?: true,                 // destroy consumable breakables (a fall)
  recoverable: bool,                 // → if true, taken items go to a spawned stash; else gone
  stashAt?: { map?, spot },          // where the recoverable stash appears
}
```

`applyTake` removes matched items from the at-risk pool; if `recoverable`, it **spawns a container** at `stashAt` holding them (a fight/pay hook to reclaim); else they're destroyed. Gold taken by a recoverable rule is held by the aggressor (reclaimed on defeat/pay). The safe floor is never touched.

### The sewer seed set (~5 scenarios)

1. **`processed_by_fungus`** — `when`: sewer, `by` is any Fungus. Wake at the soap-mine (`spot:'soap-mine'`), `timeSkip` a few hours, `status:'hunched'`, `hp:0.5`, `take:{ categories:['food','mushroom'], recoverable:false }` (they feast — gone). Flavor: you come to in a spore-cell, provisions gone.
2. **`robbed_by_wererats`** — `when`: sewer, `by.type` Wererat (non-boss). Wake at the sewer mouth, `status:'rattled'`, `take:{ gold:0.5, loot:'all', recoverable:true, stashAt:{spot:'wererat-den'} }`. Reclaim by beating/paying them (ties into the converter plot).
3. **`swept_into_sludge`** — `when`: sewer, `cause` is 'fall'/'sludge' (hazard). Wake downstream, `status:'sludged'`, `take:{ breakables:true, recoverable:false }` (bandages/soap cracked). Your "fall shatters the potions."
4. **`patched_by_carrion`** — `when`: sewer, low weight (the hope roll). Wake at Carrion's corridor, `hp:1.0`, small `gold` cost via `take:{ gold: small }` (recoverable:false — payment), `gift:{ items:['bandage'] }`, nothing else taken. The "given."
5. **`beaten_and_dumped`** (GENERIC FALLBACK, `when: () => true`, lowest weight) — wake at the zone entrance, `status:'rattled'`, `take:{ loot: small, recoverable:false }`. Covers any unhandled defeater/zone so the system never has nothing to run.

### Boss exception + persistence seam

If `ctx.by` is a **boss** (flagged via `tag` ending `_boss`, or an explicit `boss:true`): skip scenarios, run `runBossRetry()` — **reset the boss to full HP** and bump the player to a nearby **staging tile** with HP restored, a `rattled` status, and NO item loss ("finish it in one go, grind and retry"). Beating the boss is **System 2's** trigger (world-shift: Wererat down → Lonny's quest, sewer relaxes) — out of scope here; this spec only guarantees the retry.

### Integration Map

- **`game/defeat-scenarios.js`** (new) — `DEFEAT_SCENARIOS`, `pickScenario` (pure), `isSafe`, the take-rule matcher (pure helpers). Node-testable.
- **`game/main.js`** — `_lastDefeatedBy` stamp in the player-damage path; `_die(cause)` reads/clears it; new `resolveDefeat` / `runScenario` / `runBossRetry` / `applyTake` (replacing `_respawn`'s wipe; keep `_safeRespawnCell`, the de-aggro loop, the forced autosave). Register the new `BUFF_DEFS`.
- **`game/buffs.js`** — `rattled` / `hunched` / `sludged` def(s): temporary, expiring, light effect (or purely cosmetic/flavor for MVF).
- **`game/save.js`** — no new schema expected (aftermath persists via inventory/buffs/containers). Verify a scenario's spawned stash-container round-trips.
- **`game/items.js` / map JSON** — an `essential` flag lever (optional this pass; safe floor works with questItem + weapon alone); a `category` on food/mushroom items if not already present (needed by the beast take-rule).
- **`game/enemies.js`** — a `boss` accessor (tag-based) for the boss seam.

### Data Schema

New `Game` field: `this._lastDefeatedBy` (transient, not persisted — reset on load). New scenario data lives in `defeat-scenarios.js`. New buff defs. Optional new item field `essential` + ensuring food/mushroom `category`. No enemy/map schema change beyond reading existing `type`/`tag`.

### Save/Load Impact

- `_lastDefeatedBy` is transient (a defeat resolves synchronously; nothing mid-flight to persist).
- The scenario **aftermath** persists through existing mechanisms: taken items already gone from inventory; a recoverable stash is a **container** (already persisted); statuses are **buffs** (already persisted); position/map/time are core state.
- **Old saves:** load unchanged; the first post-update defeat simply runs the new flow. No migration.

### Edge Cases

1. **Unknown defeater** (hazard, scripted, no attacker) → `cause:'unknown'` → generic fallback fires. No crash.
2. **Empty at-risk pool** (you're carrying only safe-floor items) → take-rules match nothing; scenario still runs (relocate + status + flavor). Defeat is never a no-op *and* never a wipe.
3. **Quest item safety** → `questItem` is always in the safe floor (superset of today's carve-out); the converter can't be taken → no soft-lock.
4. **Recoverable stash unreachable** → `stashAt.spot` must resolve to a reachable tile; fall back to `_safeRespawnCell` region if the named spot is missing.
5. **Defeated by a boss** → retry template, no scenario, no item loss, boss at full.
6. **Gift + take in one scenario** (e.g. Carrion patches you but charges) → apply `take` (payment) then `gift`; net can be positive.
7. **Repeated defeats** → each runs independently; a second robbery spawns/ąugments the stash without losing the first (stash keyed to aggressor location).
8. **Status stacking** → temporary buffs refresh (existing `addBuff` refresh-only), never permanent.

### Done When

Player HP→0 in the sewer → a **weighted scenario** fires (not a flat wipe) → you wake at the scenario's spot, the clock has advanced, a **temporary** status is applied, **aggressor-appropriate** items are taken while the **safe floor (quest item + weapon) is intact** → for a *humanoid* robbery a **recoverable stash** exists at a reachable tile (and reclaiming it returns the goods); for a *beast/fall* the loss is simply gone → occasionally a **gift/rescue** roll leaves you better off → a **boss** defeat instead resets the boss and bumps you to retry with no item loss → **save/reload preserves the aftermath** (inventory, stash, status, position) → an **unhandled defeater** hits the generic fallback without crashing → console clean; old saves load unchanged.

---

## Gate 3 / 4 (filled during implementation)

- **Branch:** `feature/defeat-scenarios` off `dev`.
- **Verification:** in-browser (`dev-server.py 3001` + `window.__game`, no local node) — drive `_die(cause)` with different defeaters (Fungus / Wererat / fall / boss / unknown) and assert each scenario's aftermath (wake spot, status, taken vs. safe-floor items, stash spawned + reachable, gift); a save round-trip after a defeat; node unit tests for `pickScenario` (weighting, fallback, boss short-circuit) and the pure take-rule matcher. Full smoke: die to each sewer defeater, reclaim a Wererat stash, confirm the converter is never lost.
- **Sequencing (impl-plan):** likely (1) `defeat-scenarios.js` pure table + `pickScenario` + take-matcher + node tests → (2) `_lastDefeatedBy` stamp + `_die(cause)` + `resolveDefeat` dispatch (generic fallback only, behavior ≈ today) → (3) the consequence runner (wake/time/status/take/gift) + buff defs → (4) recoverable-stash spawn + reclaim → (5) the 4 flavored sewer scenarios + boss-retry seam. Verify after each.
