# Feature: Sewer NPC Behavior Skeleton
**Phase:** Phase 2 — Life in the City
**Priority:** Critical (unblocks all richer NPC behavior)
**Status:** Design (Gate 2)

> **Builds on:** `plans/npc-spawning-ai.md` (Gate 1 research, 2026-03-30).
> The Gate-1 doc presupposes a chunk-based world; current code is flat 20×20 map JSONs. This Gate-2 design bridges that gap by ranging the FSM over the existing per-map `enemies` array rather than a hypothetical `chunk.npcs`. Chunk-based persistence is deferred until world expansion makes it necessary.

> **Coexists with:** `plans/decision-trees.md` sewer lore (Wererat + Texas Beholdem). This feature additively adds fungus content (Fungus King + soap mine) without retiring the locked lore. Wererat and Beholdem rooms exist as sealed peek-only spaces in this ship; they're populated in follow-up features.

---

## Gate 1 (re-stated for this scope)

### Genre References
- **Brogue** — 2–3 behaviors per monster is enough; pack feel emerges from simple rules.
- **Cataclysm: DDA** — NPCs act on the same tick system as the player. Non-combat behaviors (looting, fleeing, going about their business) make the world feel alive.
- **F.E.A.R.** — Soldiers feel smart because their actions are *legible*, not because they're hidden. Apply: NPC actions emit log lines describing intent ("Violet Fungus picks up a rock") so the player can read the loop.

### Player Experience Goal

> "You crest a wall in the sewer and see fungi shuffling soap into a chest while their king bellows orders — a workshop you weren't invited to, that you have to decide whether to interrupt or rob."

### Scope (MVF)

- Per-NPC FSM with states: `IDLE`, `WANDER`, `WORKING`, `HOSTILE`.
- `behavior: [...]` whitelist per NPC — picks which states this NPC is allowed to enter. Carrion's `[IDLE]` makes her literally unable to attack, even with stimulus.
- Wander on a radius constrained by `homeRegion`. Configurable cadence (`wanderEveryTurns`).
- Workers pick up items matching `wantsItems` and deposit in a target chest. Single-slot carry, no inventory.
- Fungus King emits log barks on a turn-modulo schedule. King's barks do *not* yet drive minion behavior (deferred to follow-up `feature/king-director`).
- One non-hostile NPC: Carrion (dehydrated zombie merchant, south corridor). Single adjacency bark, blocks the corridor narratively.
- Sewer expands: add soap-mine region (central), sealed peeks at Wererat lair (north) and Beholdem antechamber (east), south corridor (Carrion).
- New `containers: [...]` map field. Chest entity, player can open when adjacent.
- New `regions: [...]` map field tags rectangular sub-areas with names; NPCs reference by name.

### Out of Scope (explicit)

- Director coupling (King's barks actually changing minion FSM state) — schema is forward-compatible; code is not built this ship.
- Wererat encounter, Texas Beholdem fight, Carrion trade — those rooms/entities exist as sealed/inert hooks.
- A* pathfinding — greedy single-step only.
- FLEE state, faction system, reputation gates, archetypes — those are next layers above this skeleton.
- Save/load — game has no save system; chest contents and NPC carry-state reset on map reload, same as enemies/items do today.

### Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Layering FSM on top of `enemies.js` breaks the existing chase behavior | High | Step-1 refactor is signature-only; existing chase entries use the FSM with `behavior: [HOSTILE]` (default for missing field), reproducing today's behavior exactly. Cold-boot test after every commit. |
| NPC traffic-jam on greedy-step (two miners want the same tile) | Medium | Same occupancy filter as today's `getGreedyStep`. If blocked, NPC stays put for the turn. Acceptable for 2 miners on a 6×5 region; revisit if scaled up. |
| Carrion accidentally entering HOSTILE via some future code path | Medium | Whitelist enforcement: state transition function explicitly checks `if (!npc.behavior.includes(newState)) return` before allowing the transition. Belt-and-suspenders. |

---

## Gate 2 Design

### System Design — FSM

State transitions, character-driven (each NPC's `tickState(game)` may transition):

```
   ┌─────────┐   every N turns   ┌──────────┐   adjacent wanted-item   ┌──────────┐
   │  IDLE   ├──────────────────▶│  WANDER  ├─────────────────────────▶│ WORKING  │
   └────┬────┘                    └────┬─────┘                          └─────┬────┘
        │                              │ ▲                                    │
        │                              │ │  carry empty + no items in region  │
        │                              │ └────────────────────────────────────┘
        ▼  player in sightRange + LOS (only if behavior allows HOSTILE)
   ┌─────────┐
   │ HOSTILE │ (existing chase + attack)
   └─────────┘
```

Default state if `behavior` is omitted entirely: `['HOSTILE']` — reproduces today's behavior exactly. This makes the change additive for the four existing fungus archetypes.

### Integration Map

```
sewer-map.json (data)            ─── regions[], containers[], NPC behavior[]
        │
        ▼
main.js::_advanceWorld()         ─── still calls resolveEnemyTurns(game)
        │                            then resolveBarks(game) for any NPC with barks
        ▼
npc.js (new)                     ─── exports tickNpc(game, npc) — the FSM
        │
        ├──▶ enemies.js::getGreedyStep (generalized to take a destination)
        ├──▶ enemies.js::hasLineOfSight (re-exported, used in HOSTILE transition)
        └──▶ utils.js::manhattan
```

`enemies.js` keeps `resolveEnemyTurns` as the entry point; inside, each enemy is dispatched to `tickNpc` if it has a `behavior` field, otherwise falls through the existing chase logic. This means no map JSON has to change for the existing Red/Ghost Fungus entries; they keep working unchanged.

### Data Schema (sewer-map.json additions)

```json
"regions": [
  { "name": "soap-mine",            "x": 7,  "y": 7, "w": 7, "h": 5 },
  { "name": "wererat-lair",         "x": 7,  "y": 1, "w": 6, "h": 3, "sealed": true },
  { "name": "beholdem-antechamber", "x": 13, "y": 5, "w": 5, "h": 4, "sealed": true },
  { "name": "south-corridor",       "x": 5,  "y": 15, "w": 9, "h": 4 }
],
"containers": [
  { "id": "soap-mine-chest", "type": "chest", "x": 12, "y": 9, "contents": [] }
],
"enemies": [
  // ... existing entries unchanged; Fungus King at (15,10) gains fields ↓
  {
    "id": "e6", "type": "Fungus King", "x": 15, "y": 10,
    "hp": 60, "damage": 10, "armor": 3,
    "behavior": ["IDLE", "HOSTILE"],
    "homeRegion": "soap-mine",
    "barks": [
      "Fungus King: MINE FASTER, SPORELINGS.",
      "Fungus King: THE CHEST DEMANDS MORE SOAP.",
      "Fungus King: AN INTRUDER, MY CHILDREN. PRESS ON."
    ],
    "barkEveryTurns": 6
  },
  // e1, e2 (Violet Fungus) gain miner config ↓
  {
    "id": "e1", "type": "Violet Fungus", "x": 12, "y": 9,
    "hp": 25, "damage": 5,
    "behavior": ["WANDER", "WORKING"],
    "homeRegion": "soap-mine",
    "wanderRadius": 3,
    "wanderEveryTurns": 2,
    "wantsItems": ["rock", "soap"],
    "depositsTo": "soap-mine-chest"
  },
  // Carrion is new
  {
    "id": "carrion", "type": "Carrion", "x": 8, "y": 17,
    "hp": 30, "damage": 0, "sightRange": 0,
    "behavior": ["IDLE"],
    "homeRegion": "south-corridor",
    "adjacencyBark": "Carrion: Road's blocked, friend. Sewer river's swollen with sludge. Come back later."
  }
]
```

### UI/UX Spec

- Chest renders as a distinct tile-sized glyph. Two visual states: empty (single sprite) and full (single sprite with overlay indicating items inside — placeholder until real art).
- Player adjacent to chest + interact key → log shows "You loot the chest: 2 rocks, 1 soap." Items transfer to player inventory. Chest visually empties.
- King's barks appear in the existing log panel with the King's name prefix. Same channel as enemy attack messages.
- Miner pickup/deposit emits log lines ("Violet Fungus picks up a rock", "Violet Fungus drops a rock into the chest"). High signal — without these the loop is invisible.
- Carrion adjacency bark fires once per adjacency-entry (not per turn while adjacent — that would spam).
- Sealed-room doors render as a distinct wall tile so the player understands they're peek-only, not just plain walls.

### Save/Load Impact

None — no save system exists. When the map reloads, chest contents reset and NPCs return to their starting positions. Same behavior as enemies/items have today.

### Edge Cases

1. **Two miners want the same tile.** Order them by id; second one stays put for that turn.
2. **A miner is mid-haul (carrying = "rock") when the player kills it.** The carried item is destroyed with the corpse. Documented intentional (simpler than dropping; can change in a polish pass).
3. **The chest's `depositsTo` target doesn't exist on the map.** Worker reverts to WANDER. Log a one-time warning in console for the dev. No crash.
4. **A miner's `homeRegion` doesn't exist in `regions`.** Worker has no wander constraint and wanders the whole map. Log a warning. Existing entries without `homeRegion` (Red/Ghost Fungus) are unaffected — they keep their chase behavior.
5. **Player stands on the chest tile.** Worker can't deposit (chest is blocked). Worker stays adjacent and idles until tile clears. No crash.
6. **King has `behavior: [IDLE, HOSTILE]` and the player is in LOS.** King transitions to HOSTILE on first sighting; barks continue (barks are independent of state). Barks could become state-aware in a polish pass.
7. **All items in the mine are deposited.** Miners revert to WANDER permanently. Acceptable — the player has "broken" the loop by waiting. A polish pass could spawn fresh items on a turn timer.

### "Done When"

A fresh page-load drops the player at sewer spawn. Without the player taking any action, after ~20 turns of waiting (turn counter visible in HUD), the chest has at least one item in it (deposited by a miner that found a rock in the soap-mine region), and the Fungus King has barked at least twice in the log. Walking south, the player meets Carrion, sees her adjacency bark, confirms she does not move or attack. Walking north or east hits sealed doors. Walking into the soap mine and standing in the King's LOS triggers HOSTILE — King chases. Miners continue mining (director coupling is not built). Killing all enemies and looting the chest is possible; the player exits via the boss room with stolen goods.

---

## Gate 3 Development Plan

**Branch:** `feature/sewer-npc-skeleton` (off `dev`'s tip, per the feature-branches-from-dev rule).

**Commit sequence (each leaves game playable):**

1. `refactor: generalize greedy-step pathfinding` — Export and re-signature `getGreedyStep(game, from, to)` in `enemies.js`. Existing call site uses player as `to`. Pure refactor.
2. `feat: regions[] and containers[] schemas (data only)` — Map JSON gains the fields, renderer draws chests, player can open empty chests for the no-op log line. No NPCs use the new fields yet.
3. `feat: npc.js with IDLE + WANDER` — New file. Existing enemies without `behavior` keep working unchanged. Add one test NPC with `behavior: [WANDER]` and `homeRegion: "soap-mine"` to confirm region containment.
4. `feat: NPC WORKING state, deposits to container` — Wire pickup/deposit. Confirm by watching the test NPC fill the chest.
5. `feat: Fungus King director (flavor barks)` — Extend e6's data, add bark scheduler in main.js. Confirm barks appear on cadence and King still chases.
6. `feat: Carrion + sewer room expansion` — Add Carrion entry, redraw sewer-map.json tiles to include north/east/south rooms with sealed doors. Cold-boot test.
7. `polish: sewer scene readability` — Log message tone pass, chest visual states, bark cadence feel.

**Quality checklist:** Per `GAME_STUDIO_PLAN.md` Gate 3. Cold-boot test after every commit (per `feedback_cold_boot_testing.md`).

---

## Gate 4 Plan (after Gate 3 ships)

- Self-review against the readability/architecture/data-flow/performance/consistency checklist in `GAME_STUDIO_PLAN.md`.
- 10+ minute playtest with the new scene as the explicit focus.
- PR to `dev` via `--no-ff` merge. PR description: this Gate-2 doc + the "Done When" scenario result + list of deferred follow-ups.
- After merge, tag `game-v0.5.0-dev` (minor bump because this is a real code feature, per the version-bump precedent set in v0.4.2).

---

## Follow-up features unlocked by this one

| Feature | Notes |
|---|---|
| `feature/king-director` | Wire King's barks to actually flip minion FSM state. Code-only — schema is already in place. |
| `feature/sewer-wererat-room` | Populate the north sealed room with Wererat combat. |
| `feature/sewer-beholdem` | Boss encounter design. Significant. |
| `feature/carrion-merchant` | Trade UI, "come back in a few days" implies a day counter — depends on time system. |
| `feature/save-system` | Critique flagged this as the missing precondition for any persistent-world feature. Probably the most important next step after this skeleton. |
| `feature/npc-flee-state` | Easy add to the FSM. Deferred only because no current enemy needs it. |
| `feature/reputation-gates` | The layer above this skeleton, per the critique doc. This feature is the prerequisite. |
