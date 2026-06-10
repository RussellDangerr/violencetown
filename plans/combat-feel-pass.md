# Combat Feel-Pass — Implementation Plan
**Phase:** 1.0 feel/polish pass (the "juice" gate)
**Status:** Development (Gate 3)
**Branch:** `feature/combat-feel-pass`, stacked on `feature/action-wheel` (throwing routes through the new wheel). Merge order to `dev`: action-wheel first, then this.

> **Built inline.** No Node / test runner on this machine — verify in-browser via `window.__game` + dynamic `import()` + canvas pixel-sampling (see memory `verify-violencetown`). Restart `dev-server.py` (preview_stop + preview_start) to load edited modules. All gameplay randomness uses `game.rng` (none needed here — both features are deterministic). Animation timing uses `performance.now()`.

**Goal:** Two 1.0 combat-feel features.
1. **Thrown-consumable 3×3 burst** — a thrown item flies straight, strikes the first enemy/wall, and bursts **one-shot over the 3×3 (9 tiles) centered on impact**, applying its effect at **half** to **all valid targets** (respect-the-target: damage→enemies, heal→friendlies). New **Sludge Sack** offensive throwable. Same "half to all in area" rule wired into the existing **cleave**.
2. **Typed hit-splats** — replace the damage-number + "POW!" event-word system with RuneScape-style colored splat badges where **color/border = damage type**, that **fan directionally** (toward the hit's source; omni-burst when sourceless) and **animate per type**. Drop the per-hit word spam.

---

## Shared groundwork — damage types

A `damageType` string threads from combat/throw resolution → floating-text spawn → renderer.

- `DAMAGE_TYPES`: `physical`, `sludge`, `poison`, `fire`, `heal`, `miss`. **1.0 uses** `physical`, `sludge`, `heal`, `miss`; the rest are color/anim-ready for later.
- Renderer owns `TYPE_COLOR` (physical #d23f2f, sludge #9a52c8, poison #57a23e, fire #f0833a, heal #3fb56a, miss #3a6ea5) and a `crit` flag (gold border, bigger, flies further).
- Items/attacks carry `damageType` (default `physical`; `sludge_sack` → `sludge`).

---

## Feature 1 — Throwing 3×3 burst + Sludge Sack

**Files:** `game/items.js` (resolveThrow rewrite, Sludge Sack def, `damageType` field), `game/main.js` (`_doThrow`, cleave resolver, splat spawns), `game/combat.js` (thread `damageType` through `attack`).

- [ ] **Sludge Sack item** — `game/items.js` ITEMS: `{ id:'sludge_sack', name:'[Sludge Sack]', useType:'throw', damage:8, damageType:'sludge', range:5, consumable:true }`. (Burlap sack, leather tie, full of sludge — flavor in description.)
- [ ] **`damageType` on items/attacks** — default `physical`; rock `physical`; sludge_sack `sludge`. Unarmed/melee `physical`.
- [ ] **Area helper** — `tilesInSquare(cx, cy, radius=1)` → the 9 tiles of the 3×3 centered on (cx,cy). (radius 1 = 3×3.)
- [ ] **resolveThrow rewrite** — fly straight from player along `direction` up to `range`, stop at first wall (burst on the tile before the wall) or first alive enemy (the **impact** tile). Then: for every tile in the 3×3 around impact, find a valid target and apply **half** the item's effect — damage items (`damage`) hit enemies only; heal items (`healAmount`/`effect:'heal'`) heal friendlies only (latent: no allies in 1.0). Spawn a typed hit-splat **per affected target** as an **omni** burst (AoE has no single source). Deterministic; item consumed once. Quest items already filtered by the wheel.
- [ ] **Cleave** — find the current cleave resolver in `main.js`; make it deal **half** damage to **all** enemies in its swing area (align to the same area-half rule), spawning `physical` splats. (Confirm its area shape; keep its existing shape, just apply half-to-all.)
- [ ] **Verify (in-browser):** inject a `sludge_sack` into inventory, line up 2–3 enemies, throw into them; confirm 3×3 half-damage to all, purple `sludge` splats, single consumption, no soft-lock. Confirm a thrown heal item does nothing to enemies (respect-target).

---

## Feature 2 — Typed hit-splats (directional + per-type motion)

**Files:** `game/main.js` (`_spawnDamageNumber` → typed/directional spawn; remove per-hit `_spawnEventWord("POW!"…)`), `game/renderer.js` (`_drawDamageNumbers` → splat badge + per-type motion + fan).

- [ ] **Particle shape** — extend the floating-text particle with `type` (damage type), `crit` (bool), and a launch direction `dirX,dirY` (unit vector; `null` ⇒ omni). Keep `tileX,tileY,text,bornAt,maxAge`. Drop the `vx/vy` straight-rise in favor of per-type renderer motion. `slot` (int) for deterministic pre-separation among same-tile/same-frame spawns.
- [ ] **Spawn API** — `_spawnHitSplat(tileX, tileY, text, type, opts)` where `opts = { dir?, crit? }`. When several spawn on the same tile within one resolution, assign incrementing `slot` so they pre-separate (fan). Replace `_spawnDamageNumber` call sites with this. **Remove** the automatic `_spawnEventWord` "POW!/WHACK!" on every hit (reserve words for KO only, or drop).
- [ ] **Thread type + direction from combat** — `combatAttack` (player→enemy): `physical` (or weapon's `damageType`), `dir` = player→enemy vector. `applyDamageToPlayer` (enemy→player): `dir` = enemy→player vector (directional from the attacker); sourceless ticks ⇒ omni. `resolveThrow`: omni at each target.
- [ ] **Renderer — splat badge** — in `_drawDamageNumbers`, draw a rounded splat badge filled with `TYPE_COLOR[type]`, dark inset + border (gold border when `crit`), the number/text centered in the bitmap font (white). Position from tile→screen (reuse existing conversion).
- [ ] **Renderer — per-type motion** — dispatch on `type` (+`crit`), driven by `age/maxAge` and the launch `dir`/`slot`:
  - physical: hard pop (scale overshoot) + short rise along `dir`.
  - sludge: ooze **down**, vertical stretch.
  - poison: rising **rattle** (high-freq x-shudder).
  - fire: **flicker** (opacity/scale jitter) + rise + shrink (burn up).
  - crit: physical but bigger pop + **further** travel.
  - heal: gentle float + soft glow.
  - miss: **sideways** drift on the wind + fade.
  - Directional spawns bias travel along `dir`; omni spawns distribute by `slot` around the target. Honor **reduce-motion** (dampen amplitude).
- [ ] **Verify (in-browser):** trigger each type (physical melee, sludge throw, heal, miss), confirm splat colors, distinct motions, directional fan vs omni burst, and that simultaneous bits never overlap. Confirm no "POW!" spam. Confirm reduce-motion dampens.

---

## Out of scope (post-1.0, but groundwork left ready)
- **Lingering sludge surface** (per-tile state + timers) — the 3×3 is one-shot for 1.0.
- **Poison / fire damage sources** — colors + animations exist; no item produces them yet.
- **Ally-targeted heal-throws** — mechanic respects friendlies, but allies arrive with the AGGRO system (post-1.0).
