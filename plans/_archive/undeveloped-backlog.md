# Violencetown — Undeveloped Work Backlog

**Compiled 2026-07-23.** This is the entry point for picking up undeveloped work. It consolidates a
full audit (done 2026-07-23) of every plan on this `plan` branch against the shipped code on `dev`
(then at merged tip `33687ad` — XMB usable-bar + Remembrance Rings + defeat scenarios, all live),
plus the fresh plans authored the same day.

> **How to use this:** start in **§1 Ready to build** (settled design + an actionable plan doc).
> **§2** is designed but needs a short design pass first. **§3** is the big post-1.0 roadmap, scoped.
> **§4** lists what is ALREADY BUILT so nobody re-implements it. Every item points at its own doc.

---

## 1. Ready to build (design settled, actionable plan exists)

| Thread | Plan doc | Size | One-line |
|--------|----------|------|----------|
| **Layered examine** | `plans/layered-examine.md` + `-implementation.md` | M (mostly plumbing) | Examine never dead-ends: one `resolveExamine` ladder (instance → creature → item → tile → generic) routed through both examine entry points. Items reuse `description`; enemies/tiles get name-templated generics. *Fully designed + a 3-task TDD plan, 2026-07-23.* |
| **Grapple-hook swing** | `plans/grapple-swing.md` | M | Chapter Two Phase 5: the real `GRAPPLE_ANCHOR` swing. The hook is already earned three ways and the canyon exit is gated on owning it — this replaces the placeholder `requires:grappling_hook` transition with an actual anchor-to-anchor swing verb, mirroring the existing car/barricade bump dispatch. |
| **Ray Gun source + Carnival rename** | `plans/ray-gun-and-carnival.md` | S | Two Armory loose ends: give the fully-defined-but-unobtainable Ray Gun a Factory pickup, and rename `circus-map.json` → `carnival-map.json` to match its `CARNIVAL` zone label (~4 `toMap` refs). |

## 2. Designed, but needs a design pass before building (open questions)

- **"The Crat" — sewer diplomacy talk-quest** — `plans/sewer-crat-quest.md` (an explicit DRAFT).
  A crab (Abner) raising a crab-rat hybrid; the drain gossips over the second parent (the Rat or the
  Bat), structured so the "reveal" is *unknowable* — the player's choice matters more than the truth.
  UNDEVELOPED (nothing built). Pure content on the shipped QuestEngine + disposition dialogue.
  **Open before build:** how ambiguous the tell is; father-flip vs. the deeper "you are not the mother"
  version; player as neutral arbiter vs. bribeable; reward. Reconcile with the shipped sewer Armory
  canon (per the lore-conflict rule) before authoring. Size M (content authoring).

- **Bestiary — new zones & creatures** — `plans/bestiary.md` (a design catalog, 5 open questions).
  Proposes two new zones and their rosters. None built. Cleanly reuses shipped systems, but the open
  design questions (special mechanics? sprite picks?) need settling first. Best takeable pieces:
  - **Cave zone + Weredigo** (off the Sewer): a boss with an **invisibility / blind-combat** status —
    fight at guessed tiles, reveal on a landed hit or timer. New zone + new enemy-status mechanic. M.
  - **Park zone + Ruffian** (Town↔Factory gap): a **steal-and-flee** enemy — grab gold on contact via
    `transferGold`, then retreat via the Fear system's `fleeStep`; kill/catch to recover the drop.
    Reuses two shipped systems cleanly. S–M.
  - **Bear** — a friendly white-bear NPC quest-giver in the Cave (ties Cave↔Downtown), on the
    disposition/ally + multi-path-quest substrate. S–M.
  - **Content enemies** (Bug/Bat/Mascot/Duck/Operator/Goose/Robit/Human Resources): mostly new
    map/sprite entries, low mechanic cost — blocked on the open "special mechanics / which Kenney
    cells" questions. S each.

## 3. Big roadmap threads (post-1.0, scoped) — `plans/roadmap.md`

Bigger, more open-ended. Each is shippable on its own; none started.

- **Element meters** — per-zone accumulating meters (Boredom/Street, Fun/Carnival, Goo/Factory,
  Death/Graveyard). Only Sludge exists today, as a hazard-tile DOT, not a meter. M.
- **Zone deep content / bosses** — rosters + bosses for the non-Sewer zones (Financier/Street is a
  literal `dialogue.js` placeholder; Bigfoot/Carnival; Alien Invasion/Factory — which is where the
  Ray Gun should ultimately drop; The Deity/Graveyard) + each zone's element hazard. L, zone-by-zone.
- **Light + Lantern** — a purchasable light source (from Puck) that makes the dark Wilderness
  explorable. The blackout render (`_drawDarkness`) exists; no Lantern item; the border is still a soft
  "too dangerous" edge. S–M.
- **Party / creature recruitment** — Wererat/Clown/Robot/Skeleton joining as party members. Only the
  disposition ally-flip primitive + the Lion Whip summon exist; `give-action.js` flags "Phase B
  (future): active ally behavior." M–L.
- **Gold-economy depth** — Gold Card tiers, gold-as-liability (Street Boredom), travel tolls, an early
  time-boxed debt, `baseValue` rebalance. GP is just a pill today. M. *(See also the parallel-session
  `plans/gold-standard-design.md` on `dev` — a 100-HP / GP-peg / visible-wallets balancing spec.)*
- **Trade Slice 2 — drag-to-swap barter** — multi-select/swipe barter + NPC loadouts + NPC gold. The
  equipment/stat-gear foundation shipped (Armory + Remoticon GEAR tab, tap-to-buy/sell); drag-swap
  barter and NPC inventories/gold are unbuilt. M.

## 4. ALREADY BUILT / SUPERSEDED — do NOT re-implement

Audited 2026-07-23 against `dev` `33687ad`. These plan-branch docs are history:

- `plans/action-wheel-overhaul.md` (+impl) — **SUPERSEDED** by the shipped `wheel-model.js` node-tree wheel.
- `plans/combat-wheel-radial-overhaul.md` (+impl) — **BUILT** (sunburst/compass/wedge-icons/juice, 4 merged phases). Only vestigial slivers unbuilt: CVD colour presets, hover-before-AIM predictive highlight.
- `plans/combat-wheel-rework.md` (+impl) — **BUILT** (`ff5f995`, FIGHT/TRICK/TREAT/FLIGHT tree + reticle), since extended.
- `plans/two-wheels-focus-state-and-color-language.md` (+phase0-impl) — **PARTIAL/mostly BUILT** (colour language, `appliesTo`/`verbApplies`, Target List, dominant-slice+flapper, bottom-right anchor, combat re-skin). The one gap — §8 **layered examine** — is now in §1 (`plans/layered-examine.md`).
- `plans/combat-wheel-effects.md` — **BUILT** (`832d097`: TREAT heal fix, reaction/aggro bus, Plus-Ultra confirm, AoE helper, real-placement throw, Trade hub).
- `plans/combat-feel-pass.md` — **BUILT** (3×3 throw burst + Sludge Sack + typed hit-splats).
- `plans/chapter-two-downtown-canyon-and-cohesion.md` — **BUILT except Phase 5** (economy spine, bridge/fuel, Canyon+Pike+hook-three-ways, Downtown+MQ2, reversible trade window, tiers+Macc). The unbuilt **Phase 5 grapple swing** is promoted to §1 (`plans/grapple-swing.md`); Phase 0 Park/Cave zones live in §2; Phase 6e tuning is post-1.0.
- `plans/movement-feel.md` — **BUILT** (continuous chaining, input buffer, turn-in-place, walk anim, held-key resume, 8-way diagonals).
- `plans/sewer-armor-weapons-and-carnival.md` — **PARTIAL/mostly BUILT** (5-piece armor set, Fear system, 3 of 4 weapons). Loose ends → §1 `plans/ray-gun-and-carnival.md`.
- `plans/world-structure.md` — **BUILT** (directional world re-layout, blocked bridge, Wilderness, Puck).
- `plans/zone-stub-expansion.md` — **BUILT** (cross-hub Town + Circus/Factory/Graveyard, since grown to full zones).
- `plans/road-to-1.0.md` — **BUILT** (critical-path fixes, audio, options, ending, saves, test harness). Only residue: itch.io page + capsule art (superseded by the web-first Cloudflare deploy).
- `plans/wild-ideas.md` — **META** (sparks). Loose, non-build-ready: "it's all store credit" flavor for the buyback window; "items with a deliberate second use" as a roster design-lens; oil-as-a-proper-fuel (needs a brainstorm; only a `fuel_note` breadcrumb + the alcohol side-mission shipped).

---

### Provenance

The build-vs-undeveloped verdicts above came from a 16-agent parallel audit run 2026-07-23 (one
assessor per plan-branch doc, each verifying its claims against `dev` code + git history). The three
§1 docs were authored the same day: layered-examine went through full brainstorm → design → TDD plan;
grapple-swing and ray-gun-and-carnival are grounded in the current `main.js` bump dispatch,
`canyon-map.json`, `weapons.js`, and the map `toMap` graph.
