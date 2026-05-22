# Feature: Zone Stub Expansion + Town Hub Redesign
**Phase:** Foundational (precedes Phase 2 zone-specific content work)
**Priority:** High — converts the world model from "demo" to "early-access map"
**Status:** Design (Gate 2 — ready for development)
**Date:** 2026-05-22

> **Problem:** Only Town and Sewer are walkable. The game reads as a 2-room demo even though the canon in [plans/cosmology-and-arc.md](cosmology-and-arc.md) and [plans/game-zones.md](game-zones.md) has been calling for five zones for over a month. The player can't form a holistic mental model of the world from what's shipped.
>
> **Move:** Redesign the Town map into a cross-shaped hub with four cardinal exits. Ship signpost-labeled stub maps for Circus, Factory, and Graveyard — each a single screen with a distinct tile palette, one sample mook of the zone's native creature, one collectible, and a return-to-Town transition. No zone hazards active. No bosses. Negative-space play: the player walks into each zone, *sees* it, leaves, and now the world has shape.

---

## Gate 1: Research

### Genre references

| Game | Lesson borrowed |
|---|---|
| **Half-Life 2 (Ravenholm)** | Hours of "we don't go to Ravenholm anymore" build *more* anticipation than the visit itself delivers. Locked / labeled space tells a story. |
| **EarthBound / Mother 3** | World map readable at a glance — each town has a distinct silhouette and palette. Player navigates by visual memory, not minimap. |
| **Stardew Valley** | Hub-and-spoke layout. Pelican Town center, farm/forest/mines/beach as cardinal spokes. Early content sketched, expanded over time. |
| **Hollow Knight** | Map fragments — you discover *that* a region exists before you can fully explore it. Player has a map model of the kingdom before having walked it. |

### Player Experience Goal

> *"After a 90-second walk through Town, the player has seen all four zones exist, can name the creature that lives in each, and understands the layout well enough to think about the game holistically — not as a sewer demo, but as a 5-zone world they're standing in the center of."*

### Technical feasibility

Existing systems make this near-trivial to ship:

- **Map loader** ([game/map.js](../game/map.js)) — already loads any JSON map by URL.
- **Transition mechanism** ([game/main.js:854-858](../game/main.js)) — already consumes `{x, y, toMap, toX, toY, label}` and logs the label on cross.
- **Enemy data is inline** in map JSON — no new code needed to spawn a Wererat or a Clown; just add an entry with `type/hp/damage/behavior/disposition`.
- **Tile IDs are zone-namespaced** (sewer 0-7, town 10-21). Circus / Factory / Graveyard claim 30-39 / 40-49 / 50-59 without collision.

Risk: new tile IDs need `TILE_BY_ID` entries in [data.js](../game/data.js) and fallback colors. Existing renderer uses `fallbackColor` when no sprite is registered — sprites can come in a polish pass per [feedback_programmatic_visuals_first].

### Scope (MVF)

In:
- Town redesigned to ~40×25 cross-shape with 4 cardinal exits.
- 3 new map JSONs: `circus-map.json`, `factory-map.json`, `graveyard-map.json`. Each 15×15.
- Each spoke has: distinct tile palette (3-4 new tile types per zone), 1-2 sample creatures of native type, 1 collectible item, 1 return-transition tile.
- 4 transitions wired up (Town → each spoke, each spoke → back to Town).
- Existing Sewer map preserved; only its return-transition coordinates update to match new Town south-exit position.
- Existing Town items (boardwalk burger, hot dog, rocks, bandages, soap) repositioned onto new Town map.

Out of scope (deliberately deferred):
- Zone-specific hazards (Sludge / Fun / Goo / Death meters — those live in their own future Gate plan).
- Bosses (Texas Beholdem already exists in Sewer; Bigfoot / Alien / Deity not in this pass).
- Full creature rosters (1-2 mooks per zone is enough to telegraph identity).
- Cryptid menagerie content (Mothman, Chupacabra, etc. — those are anchored encounters for a later pass).
- Sprite art — programmatic colored-tile rendering only.
- NG+ reaction-rekeying, Sunpyre-specific scenes, etc.
- Per-character map variation (per [cosmology-and-arc.md](cosmology-and-arc.md) Design Principles §2).

### Risks

1. **Scope creep into full zone content.** Mitigation: stub maps are explicitly tiny (15×15 each). If a stub looks too sparse, that's the *correct* state — it's a signpost, not a level.
2. **Tile palette readability.** Each zone needs to be visually distinct from Town AND each other at the fallback-color level. Mitigation: pre-commit color picks documented in Gate 2 below; eyeball test in-game before merge.
3. **Town hub feeling empty after expansion.** Going from 35×14 to ~40×25 ≈ doubling tile count. If existing 12 items / 0 mooks don't fill it, hub reads as a parking lot. Mitigation: redistribute existing items + add 2-3 ambient NPCs (mute, idle, "civilian" type) using existing enemy schema with `behavior: ["IDLE"]` and `disposition: 50` (non-hostile).

---

## Gate 2: Design

### System design

No new code. Pure data:

1. New tile definitions appended to `TILES` in [data.js](../game/data.js). IDs 30-59.
2. New map JSONs in [game/](../game/) following the existing `town-map.json` / `sewer-map.json` schema.
3. Existing `town-map.json` rewritten with new layout.
4. Existing `sewer-map.json` patched — only the return-transition `toX/toY` coordinates change.

### Integration map

| Module | Change |
|---|---|
| `data.js` | +12 tile definitions across 3 new zone palettes |
| `town-map.json` | Full rewrite — cross-shape, 4 transitions |
| `sewer-map.json` | Update return transition coordinates only |
| `circus-map.json` | NEW |
| `factory-map.json` | NEW |
| `graveyard-map.json` | NEW |
| `main.js` | No change — `_loadMap()` and transition handler unchanged |
| `renderer.js` | No change — `fallbackColor` path handles unknown tiles |
| `enemies.js` | No change — `Enemy` class consumes any inline JSON definition |

### Data schema

**New tiles ([data.js](../game/data.js)):**

```js
// Circus tiles (30-39)
CIRCUS_GROUND: { id: 30, walkable: true,  fallbackColor: '#c4a070' }, // dusty carnival ground
TENT_STRIPE:   { id: 31, walkable: false, fallbackColor: '#c43030' }, // red/white striped tent wall
CONFETTI:      { id: 32, walkable: true,  fallbackColor: '#e8c060' }, // ground confetti
SAWDUST:       { id: 33, walkable: true,  fallbackColor: '#a08050' }, // performance ring sawdust

// Factory tiles (40-49)
FACTORY_FLOOR: { id: 40, walkable: true,  fallbackColor: '#3a3a3e' }, // metal grating
FACTORY_WALL:  { id: 41, walkable: false, fallbackColor: '#5a5a5e' }, // steel wall
GOO_VISUAL:    { id: 42, walkable: true,  fallbackColor: '#6abe30' }, // green goo (visual only — no hazard yet)
CONVEYOR_VIS:  { id: 43, walkable: true,  fallbackColor: '#4a4a3e' }, // conveyor belt (visual only — no push yet)

// Graveyard tiles (50-59)
GRAVE_DIRT:    { id: 50, walkable: true,  fallbackColor: '#3a2a1e' }, // dark dirt path
GRAVESTONE:    { id: 51, walkable: false, fallbackColor: '#7a7a7a' }, // upright tombstone
DEAD_GRASS:    { id: 52, walkable: true,  fallbackColor: '#3a3a2a' }, // dry brown-green
IRON_FENCE:    { id: 53, walkable: false, fallbackColor: '#1a1a1a' }, // wrought iron
```

**New transitions on Town (positions relative to redesigned ~40×25 map):**

| From Town | Direction | Target | Label |
|---|---|---|---|
| `(20, 0)` | N | `graveyard-map.json` `(7, 13)` | `[Through the iron gate — GRAVEYARD]` |
| `(20, 24)` | S | `sewer-map.json` `(1, 10)` | `[Descend into the sewer]` |
| `(39, 12)` | E | `circus-map.json` `(1, 7)` | `[Past the ticket booth — CIRCUS]` |
| `(0, 12)` | W | `factory-map.json` `(13, 7)` | `[Through the gates — FACTORY]` |

Each spoke's return transition lands the player one tile inside Town from the exit they took.

**Sample mook stubs:**

| Map | Mook | Notes |
|---|---|---|
| Circus | `Carnival Clown` (hp 20, dmg 4, disposition -40, behavior `IDLE,WANDER`) | Mute placeholder for the cryptid clown roster |
| Factory | `Greedy Green` (hp 25, dmg 5, disposition -50, behavior `IDLE,WANDER`) | Little green man — Oddworld-coded |
| Graveyard | `Rattling Skeleton` (hp 18, dmg 4, disposition -40, behavior `IDLE,WANDER`) | Default form of the Skeleton ↔ Zombie creature |

Each stub map gets one collectible (bandage / rock / soap respectively — reuses existing items, no new schema).

### UI/UX spec

- Player at Town center sees boardwalk arm running E-W and a vertical artery running N-S.
- Each exit tile is a visually distinct tile type (e.g., the eastern exit is a sawdust-colored "ticket booth" path; the northern exit is iron-gate-colored; the western exit is industrial yellow/black).
- On stepping onto the transition tile, existing text log line fires (`[Past the ticket booth — CIRCUS]`), then `[Entered CIRCUS]` after load.
- Zone label in the existing HUD ([renderer.js:484](../game/renderer.js)) already pulls from `map.zoneName` — Circus / Factory / Graveyard get those strings.

### Save/load impact

Existing save persists `currentMapUrl` + `playerX/Y`. Loading into a new map URL the save doesn't recognize → existing fallback path. No schema change needed. Old saves landing on the old Town `(33,6)` sewer descent: that tile in the new Town is *also* walkable Town tile (we keep continuity by leaving the old descent coordinates valid as plain sidewalk). Player will just walk south to find the new sewer descent.

### Edge cases

1. **Player saved mid-step on old Town `(33,6)`.** New Town has walkable tile there; spawn-from-save lands them on a normal sidewalk; sewer descent has moved south. They find it by walking.
2. **Player has 0 HP in a stub zone.** Existing death-respawn (per [plans/death-respawn.md](death-respawn.md)) sends them to Town spawn — works unchanged.
3. **Player gives an item to a stub mook to flip disposition.** Existing give-action / disposition flow handles it; the mook is just an Enemy schema entry. No new code path.
4. **Player tries to leave the world (walking off map edge).** Existing tile-out-of-bounds in [map.js:55](../game/map.js) returns wall id 0 → not walkable. Edges blocked.
5. **Player crosses a transition while a queued action is pending.** `_pendingTransition` already handles this in [main.js:854](../game/main.js).
6. **Two-way transition coordinate desync.** Risk: I author Town → Circus at `(39,12)` but Circus return points to wrong Town tile. Mitigation: each pair is authored together in one commit and walked through manually pre-merge.

### Done When

> *Caelan loads the game, spawns in Town center, walks north until they enter the Graveyard, sees a skeleton and a fence, walks back south, crosses through Town, enters the Factory, sees a goo pool and a greedy green alien, walks back, enters the Circus from the east, sees confetti and a clown, walks back, descends into the Sewer (existing). Round-trip the entire map in under 3 minutes. The HUD zone label changes correctly at each crossing.*

---

## Gate 3: Development

**Branch:** `feature/zone-stub-expansion` off `dev` tip
**Estimated effort:** ~3 hours per the scope decision (stub + 1 mook per zone, Town hub redesigned)

### Build order

1. Append new tile defs to [data.js](../game/data.js).
2. Author `circus-map.json`, `factory-map.json`, `graveyard-map.json`.
3. Rewrite `town-map.json` to cross-shape with 4 transitions.
4. Update `sewer-map.json` return-transition coordinates.
5. Manual playtest: load, walk all 4 round-trips, verify zone labels.

### Quality checklist

- [ ] All 4 round-trips complete without console errors.
- [ ] Zone label HUD reads correctly at each crossing.
- [ ] No existing item collectible disappeared in the Town redesign.
- [ ] Stub mooks are reachable and bumpable (combat opens).
- [ ] Existing Sewer descent still works (`[Descend into the sewer]` from new Town south exit).
- [ ] Each zone is visually distinguishable from Town and from each other within 1 second of arrival.

---

## Gate 4: Review & Polish

### Polish notes

- Transition labels should each carry a sliver of zone tone — `[Past the ticket booth — CIRCUS]` does more than `[Enter CIRCUS]`. Match the existing `[Descend into the sewer]` register.
- Each stub mook's `adjacencyBark` can deliver one line of zone flavor (e.g., the Skeleton: `"[Skeleton: rattles disapprovingly]"`). Optional but cheap.
- Stub maps should not feel polished — they should feel like *signposts*. A clown standing alone in confetti tells you the Circus is real without pretending it's done.

### Future work this unblocks

- Per-zone hazard activation (Sludge / Fun / Goo / Death meters) — each can now be tested in its native zone.
- Boss authoring (Bigfoot / Alien Invasion / The Deity) — each has a home to spawn in.
- Cryptid menagerie placement — Circus stub becomes the seed bed.
- Per-character map variation (Wererat vs. Human in Sewer per cosmology Design Principle §2) — easier to design once the canonical 5-zone shape is in code.
