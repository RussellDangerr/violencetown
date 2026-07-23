# Feature: Layered Examine — Examine never dead-ends

**Phase:** Interaction / UI — the Examine verb (Two-Wheels §8 / §12 step 3).
**Priority:** Medium. Completes the one visibly-missing piece of the shipped wheel/Target-List arc.
**Status:** Design approved (Caelan, 2026-07-23).
**Relates to:** `plans/two-wheels-focus-state-and-color-language.md` §8 (on the `plan` branch) — this is a
**minimal** realization of that section. Supersedes the `[Nothing here worth examining.]` dead-end.

> **Decisions (Caelan, 2026-07-23):**
> - **Minimal scope — items only.** Items reuse their existing `description`; enemies/tiles get a
>   **name-templated generic**, not authored flavor. No bespoke enemy/tile examine strings this round.
> - **Name-templated generic** — examining a creature reads `"It's a {name}."`, a bare tile reads
>   `"{Tile name}."` (derived from the tile key). Never dead-ends; zero new writing.
> - **No `class` taxonomy field** and **no dev item-table viewer** — both deferred (nothing would
>   consume `class` yet — YAGNI).

---

## Why

Examine is meant to be the "tell me about anything" verb, but today it dead-ends. The E-key path
(`examine.js doExamine`) only resolves authored `game.examinables` (the car, the bridge, the cape
grate) and otherwise logs `[Nothing here worth examining.]`. The Target List path
(`main.js` `_fireResolver` `case 'examine'`) is better — it name-templates NPCs and shows an item's
name+tier+description — but still has **no tile fallback** and dead-ends on empty ground, and the two
paths have **divergent** logic. Tapping a brick wall or a generic enemy risks the exact
"nothing interesting" dead-end the whole two-wheels/Target-List effort set out to kill.

## Vision

Examine always says *something* specific about whatever you're looking at, reusing data the game
already has — no content-authoring grind.

## The resolution ladder

One pure resolver, `resolveExamine(game, x, y)`, returns the most salient thing at a tile. Both entry
points call it, so there is **one** source of truth. First match wins:

1. **Instance** — an authored `game.examinables` at the tile → its `text` (and its `grants`, e.g. the
   cape grate). *Existing behavior, preserved.*
2. **Creature** — an alive enemy/NPC on the tile → `"It's a {name}."` (honoring an optional future
   `examine` field on the entity if one is ever added, but none is authored now). Keeps the current
   Target-List hostile/peaceful flavor where it already exists.
3. **Ground item** — an item on the tile → its existing `description` plus the value-tier line the
   current examine already shows (`"{name} ({tier}). {description}"`), falling to `"A {name}."` if the
   def has no description.
4. **Tile** — the map tile → a **display name derived from the tile key** (`SLUDGE → "Sludge."`,
   `FACTORY_FLOOR → "Factory floor."`). Zero authoring; the handful of internal-only tiles that read
   plainly (e.g. `BOSS_TRIGGER`) are rarely examined.
5. **Flat generic** — only if truly nothing resolves (out of bounds) → the old
   `[Nothing here worth examining.]`. Should essentially never fire in-world.

Order rationale: authored-specific beats a creature, which beats the item it stands on, which beats
the bare ground.

## Entry points (both routed through the resolver)

- **E-key `doExamine(game)`** — examine the faced tile. Preserve the "faced **or** adjacent" instance
  reach so multi-tile examinables (the 2×2 car) still resolve when you stand beside them: if
  `findExaminable(game)` (faced-or-adjacent instance) hits, resolve at that instance's tile; else
  resolve at the faced tile. Preserve the grant flow (`_grantFromExaminable`) and the `examine` quest
  event.
- **Target List / pointer `case 'examine'`** — `resolveExamine(game, t.x, t.y)`. Preserve the car
  walk-up-and-install special-case (it lives earlier in `_actOnTarget`, is a quest interaction, and is
  untouched by this change).

Both paths then: `_log` the body, `emitGameEvent('examine', { targetId })` with the resolved id
(instance id / item id / enemy id / tile key), and `_openInspect({ title, body, tierName?, tierColor? })`.

## Data touches (near-zero)

- **Items:** reuse `description`. No item edits (fall to `"A {name}."` if a def lacks one).
- **Enemies/NPCs:** reuse `entity.name`. No edits.
- **Tiles:** add a derived **`TILE_NAME_BY_ID`** map + a `tileDisplayName(id)` helper alongside
  `TILE_BY_ID` in `data.js` (built once from the `TILES` keys, prettified: lowercase, `_`→space, drop
  a trailing `visual`/`vis`, capitalize). No per-tile authoring.

## Out of scope (deferred)

Bespoke enemy/tile examine strings; the item `class` taxonomy; the dev item-table viewer; and the
gated Phase C combat-wheel cleanup (separate work).
