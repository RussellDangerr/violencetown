# Violencetown — Unified Development Plan

> **⚠ SUPERSEDED — predates the 2026-04-01 pivot.** This plan describes the
> original procedurally-generated chunk-city design (10s real-time ticks,
> diagonal movement, `player.js`/`ui.js`). Those systems were removed in the
> pivot to turn-based combat across hand-authored zones. For current state see
> `README.md`, root `ROADMAP.md`, and the per-feature briefs in `plans/`. Kept
> for historical reference only.

**Status:** Active development
**Foundation:** Playable skeleton (tick system, procedural city, diagonal movement, localStorage saves)

---

## What We Have (Working Foundation)

The game already has a functional core from the original codebase:

| System | File(s) | Status |
|--------|---------|--------|
| Tick-based game loop (10s ticks, Space to resolve early) | `main.js` | Working |
| Procedural chunk-based city generation | `map.js` | Working |
| 5 biomes (Stealville, Sludgeworks, The Glow, Downtown, Outskirts) | `data.js` | Working |
| Building types per biome (pawn shops, labs, scrap yards, etc.) | `data.js`, `map.js` | Working |
| City shifting — buildings regenerate every 600 ticks | `map.js` | Working |
| WASD + diagonal movement with squeeze-through mechanics | `player.js` | Working |
| Canvas tile renderer (24px tiles, 21x21 viewport) | `ui.js` | Working |
| Ground loot spawning & pickup | `map.js`, `player.js` | Working |
| Hazard tiles (sludge, radiation) | `data.js`, `player.js` | Working |
| localStorage save/load (position, inventory, map state) | `main.js` | Working |
| Splash screen ("You are a taxi driver. Things have gone wrong.") | `index.html` | Working |
| Flat combat system (100 HP, flat damage, flat armor) | `combat.js` | Module ready, not yet integrated |
| Particle sim (EVA-01 theme, vortex/network/chaos modes) | `particles.html` | Standalone demo |

---

## Development Phases

### Phase 1: Combat Integration (Next Up)
**Goal:** Wire `combat.js` into the game loop so combat encounters actually work.

- [ ] Import `Entity` and `attack()` into `player.js`
- [ ] Give the Player class HP/armor from the Entity system (replace current flat `hp`/`maxHp`)
- [ ] Add enemy entities to chunk generation (rats, bandits — biome-dependent)
- [ ] Resolve combat during tick execution: if player moves into enemy tile, attack
- [ ] Display damage numbers in the text log using `formatDamageNumber()`
- [ ] Render enemy characters on the map (rat = `r`, bandit = `!`, etc.)
- [ ] Enemy death drops loot
- [ ] Player death → game over → clear save → restart

### Phase 2: Height & Visibility System
**Goal:** Add vertical dimension — climbing on furniture, height-based fog of war.

*Based on [PLAN-height-visibility.md](./PLAN-height-visibility.md) research.*

- [ ] Define height tiers: Ground (0) → Furniture (1) → Counter (2) → Tall (3) → Ceiling (4)
- [ ] Add `heightPlane` property to tile definitions in `data.js`
- [ ] Implement `canReach(playerHeight, itemHeight, horizontalDist)` function
- [ ] Alpha-dimming renderer: active plane at full brightness, others fade
  - `globalAlpha = 1.0` for current plane
  - `0.4–0.6` for adjacent planes
  - `0.2` for distant planes
- [ ] Climb action: `[C]` key to climb onto adjacent climbable surface
- [ ] Height affects combat: attacking from above = damage bonus
- [ ] Usable items at current height get subtle highlight (composite glow)
- [ ] Transition feel: quarter-second alpha tween on height change
- [ ] Performance: recalculate visibility only on height change (event-driven)

### Phase 3: Origin Stories & Gas Station Menu
**Goal:** Replace the splash screen with an atmospheric gas station menu that feeds into origin story selection.

*Based on [ROADMAP.md](./ROADMAP.md) feature list.*

#### Gas Station Menu
- [ ] Replace splash with illustrated gas station background (pixel art, night, neon)
- [ ] "Where do you want to go?" — destination picker (road sign / pump screen style)
- [ ] "Who are you?" — name + archetype picker ("A name. A reason. That's enough.")
- [ ] Idle rat animation nibbling cheese in the corner
- [ ] Ambient sound: distant highway, buzzing fluorescent light, wind
- [ ] "Continue" button if `localStorage` has an existing save
- [ ] Minimal UI chrome — atmosphere over buttons

#### Origin Stories
- [ ] Define origin data: `{ name, startZone, lootTable[], lootCount, description }`
- [ ] Starting origins:
  - "Scavenger from the East Side" → Outskirts spawn, survival gear
  - "Ex-mechanic from the refinery" → Sludgeworks spawn, tools
  - "Street kid from the underpass" → Stealville spawn, lockpicks
  - "Lab tech from the crater" → The Glow spawn, tech components
  - "Cabbie who saw too much" → Downtown spawn, taxi keys + random loot
- [ ] Each origin gets 1 guaranteed rare crafting supply
- [ ] Location + Identity → generates loadout → drops player in zone

### Phase 4: NPCs & World Life
**Goal:** Make the starting zones feel alive with interactive entities.

- [ ] **Rat + Cheese (tutorial NPC):** rat nibbles cheese in starting area, demonstrates damage numbers when attacked, runs at 50% HP, drops cheese scrap
- [ ] **Sleeping drunk:** dialogue giver, minor quest hook
- [ ] **Street vendor:** limited random stock, introduces economy
- [ ] **Stray dog:** befriendable, seeds the follower system
- [ ] NPC tick behavior: NPCs act during tick resolution (move, patrol, flee)
- [ ] Basic dialogue system: interact with `[E]` on NPC tile → text log conversation

### Phase 5: Session Persistence & Quality of Life
**Goal:** Zero-friction return experience. No login walls, no accounts.

- [ ] Versioned save key: `violencetown_save_v2` (migration from v1)
- [ ] Auto-save on zone transition, item pickup, significant events
- [ ] "Last played: X" timestamp on continue screen
- [ ] Compact save format — stringify only what matters
- [ ] New Game as secondary option, Continue as primary
- [ ] Save player inventory, discovered areas, quest flags, NPC states

### Phase 6: Polish & Expansion
- [ ] Inventory grid system (replacing simple item list)
- [ ] Crafting system using collected components
- [ ] More biome-specific building interiors
- [ ] Weather effects on the map (rain, fog, chemical clouds)
- [ ] Sound design: footsteps, combat hits, ambient per-biome
- [ ] Mobile touch controls for the game canvas

---

## Architecture

```
game/
├── index.html          # Game page (splash + game UI)
├── style.css           # Game styles (dark theme, panels, canvas)
├── main.js             # Game loop, tick timer, input, save/load
├── map.js              # Procedural chunk-based city generation
├── player.js           # Player state, movement, actions
├── ui.js               # Canvas rendering, DOM panel updates
├── data.js             # Tile types, biomes, items, building classes
├── utils.js            # Seeded RNG, simplex noise, helpers
├── combat.js           # Flat HP/damage/armor combat system
├── particles.html      # Standalone particle sim demo
├── PLAN.md             # This file — unified development plan
├── PLAN-height-visibility.md  # Height system research (Gate 1)
└── ROADMAP.md          # Feature ideas and priorities
```

---

## Design Principles

1. **No RNG in combat.** Damage is flat. Armor is flat reduction. You always hit. Strategy comes from positioning and height, not dice rolls.
2. **The camera does the talking.** No HUD indicators for height/visibility — use alpha dimming, glow, and parallax to communicate what's reachable.
3. **Zero-friction saves.** localStorage, no accounts, no login. Load and play.
4. **The city shifts.** Buildings regenerate over time. Nothing is permanent. Adapt or die.
5. **Atmosphere over UI chrome.** Gas station menu, not a settings screen. Text log, not a tooltip.
