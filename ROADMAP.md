# Violencetown Roadmap

> **Updated 2026-04-01** — Major design pivot. No longer a roguelike. Static hand-crafted map with defined zones.
> Zone definitions: `plans/game-zones.md`
> Open design decisions: `plans/abc-decision-matrix.md`
> All feature development follows the 4-gate pipeline in `GAME_STUDIO_PLAN.md`.
> **Systems audit (2026-08-21): `plans/systems-audit-2026-08.md`** — inventory, the TTK finding,
> the lock/key gate pass, and a proposed order of operations. Read it before planning new systems.

## Design Status

**2026-04-01 Pivot:** Violencetown is no longer a roguelike with procedural generation. The game is now a **2D pixelated tile-based game with a hand-crafted static map**. No chunk regeneration, no shifting city, no run-based structure. The tile system remains.

### World Structure — DECIDED
The world is a single authored map divided into **five zones**, each home to a specific creature:

| Zone | Creature | Description |
|------|----------|-------------|
| **Town** | Human | City center, player start. Bank Street sub-area run by vampire bankers (The Financier). |
| **Sewer** | Wererat (Rat ↔ Wererat) | Underground tunnels, tight spaces. Rat transforms into powerful Wererat. |
| **Circus** | Clown (Cryptid) | Americana roadside carnival. Clowns are cryptid creatures. Bigfoot is the boss. |
| **Graveyard** | Skeleton (Skeleton ↔ Zombie) | Tombstones, crypts, fog. Shifts to Zombie form when damaged. |
| **Factory** | Robot | Industrial zone. Machines, conveyor belts, metal. |

Full zone plan: `plans/game-zones.md`

### Decisions still pending (from ABC matrix):
1. Movement & Time Model (tick timer vs Pixel Dungeon hybrid vs real-time)
2. Creature Depth (cosmetic vs One Cool Thing vs divergent classes)
3. Death Mechanics (arcade vs loot redistribution vs creature permadeath)
4. Inventory Philosophy (2D bag vs Borderlands flow vs ring-only)
5. Ring/Build Depth (light stats vs archetype synergy vs combinatorial)
6. Character Parking (easter egg vs quest-sending vs territorial deployment)
7. Visual Scale (current 24px vs mid 32px vs large 60px+)

**Terminology shift:** Playable characters are called **"creatures"** (human, sewer rat, clown, skeleton, robot, etc.) — not classes, not characters.

---

## Phase 1 — The Bones *(REWORKING)*
- ~~Tick timer (10s, Space to execute), infinite procedural city~~ — procedural generation removed
- ~~Chunk-based generation (32x32), simplex noise biomes~~ — replaced by static authored map
- Diagonal movement with squeeze-through — **stays**
- Canvas tile map, tile palettes, text log — **stays**
- **NEW:** Static map with 5 zones (Town, Sewer, Circus, Graveyard, Factory)
- **NEW:** Zone-specific tile palettes and visual themes
- **Done when:** Walk through all five zones on the static map. Each zone looks and feels distinct.

---

## Phase 2 — Life in the City *(IN REDESIGN)*

Phase 2 planning docs exist but are partially superseded by the design evolution. Each plan must be reconciled with the ABC Decision Matrix before entering Gate 2 (Design).

### What survives regardless of decisions:
- NPCs populate the map, move, react (plan: `plans/npc-spawning-ai.md`)
- On-map combat with positioning-based 5-zone targeting
- Death with world persistence (specifics depend on Cat. 4 decision)
- Ground items (already implemented, `plans/ground-items-inventory.md`)

### What depends on ABC decisions:
- Time model (tick vs PD hybrid) — affects combat pacing, preview system, movement feel
- Inventory bridge (simple array vs Borderlands flow) — depends on Cat. 2
- NPC loot pickup behavior — depends on Cat. 4 (loot redistribution)
- Creature selection/origins menu — depends on Cat. 3 (creature depth)

### Superseded/evolved plans:
- `plans/combat-health-system.md` — 5-zone body system ADOPTED, but flat 100 HP superseded
- `plans/origin-stories-and-menu.md` — Origins may merge with creature system; 5 biome origins may become creature starting points instead
- `plans/death-respawn.md` — Fast displacement survives but loot redistribution may replace it

**Done when:** Encounter creatures, fight them with positioning-based combat, die and experience consequences (whatever form those take), see the city react to your presence. The core loop is fun WITHOUT rings, parking, or advanced systems.

---

## Phase 3 — Rings, Equipment & Identity *(NEW — was "The Bag and Improvisation")*

This phase was originally about the 2D inventory grid and crafting. It's being reconsidered based on the ring/equipment design evolution.

### Core deliverables (pending ABC decisions):
- 10-slot ring/chip/brain system with creature-specific UI
- 5-slot equipment (Front/Back/Sides/Top/Bottom) with chosen agency model
- Inventory system (bag, Borderlands flow, or ring-only — depends on Cat. 2)
- Ring archetype synergies (if Cat. 6B or 6C chosen)
- Environmental interaction: shove, throw, barricade (survives regardless)

### What may move here from old Phase 3:
- Tag-based crafting (if it survives — loosely held)
- Shoestraction and environmental combos

**Done when:** Equip rings that visibly change your creature's aura/particles/effects. Stack 3+ from one archetype and trigger a synergy. Your build is visible to other creatures and NPCs.

---

## Phase 4 — Creature Hopping & Parking *(NEW — was "Noise, Light, and Stealth")*

Multi-creature system. The core gameplay loop of hopping between creatures.

- Creature roster: collect and swap between creatures
- Creature-specific One Cool Things (if Cat. 3B chosen)
- Creature swap with joke cutscene entrances
- Parking: creatures persist on map when swapped away (scope depends on Cat. 7)
- Item/ring transfer between creatures

### What moved:
- Noise/Light/Stealth (old Phase 4) is now **loosely held** — may be incorporated as a creature's One Cool Thing (stealth creature) or cut entirely

**Done when:** Hop between a zombie, a robot, and a sewer rat in the same session. Each feels different. Encounter your parked zombie wandering around. Laugh.

---

## Phase 5 — Factions, Territory & Endgame

- Territory control (if Cat. 5B or 5C chosen)
- Faction reputation system (if factions survive)
- Boss encounters in each territory
- Loot redistribution maturity (NPCs with player gear become area bosses)
- Origin Discovery System expansion
- Advanced parking features (Brotherhood quests, Trojan Horse — if earned)

### Loosely held features that land here if they survive:
- The Duke at the gas station
- Death Taxi (progression anchor, vehicle combat)
- Zone-specific mechanics (Stealville theft, Sludgeworks corrosion, Glow radiation)
- Cryptids in UnHoused territory

**Done when:** Take over a territory. See your parked creatures holding districts. The world has a persistent history shaped by your play.

---

## Phase 6 — Entropy and Polish

- Entropy events (sludge floods, faction raids, building collapses, blackouts, fires)
- Day/night cycle
- Procedural audio (Web Audio API)
- Content expansion (more creatures, rings, items, building templates)
- Visual scale overhaul (if not done earlier — move to 32px+ tiles)
- Entropy Director (hidden HP buffer, loot compensation) — if it survives

**Done when:** 20 minutes of play feels like a story happened to you that you didn't plan.

---

## Future — Godot Migration

- Rebuild in Godot for built-in physics, tilemaps, lighting, pathfinding, shaders
- Export to HTML5 (WebAssembly) — same browser-based "click and play" distribution
- Visual map editor replaces pure code generation
- GPU-accelerated lighting for environmental effects
- The ABC decisions made now should be Godot-compatible

## Future — Mobile Controls

- Swipe to input movement direction
- Tap to advance turn (replaces spacebar or PD-style input)
- Virtual d-pad fallback option
- Creature swap accessible from mobile UI

---

## Verification

Each phase: open via `python -m http.server`, play for 5+ minutes, verify the "done when" condition. The game should be playable and interesting after every phase, not just the last one.

Each feature within each phase follows the 4-gate pipeline defined in `GAME_STUDIO_PLAN.md`:
1. **Gate 1: Research** — genre analysis, player experience goal, scope, risks
2. **Gate 2: Design** — system design, integration map, data schema, edge cases
3. **Gate 3: Development** — quality checklist, no regression, save integrity
4. **Gate 4: Polish** — code review, playtesting, visual feedback, merge
