# Game Feature Roadmap

> **⚠ SUPERSEDED — predates the 2026-04-01 pivot.** The "procedural city /
> 10s tick / `player.js` / `ui.js`" items below were removed in the pivot to
> turn-based, hand-authored zones. See `README.md` and root `ROADMAP.md` for
> current state. Kept for historical reference only.

> See [game-plan.md](./game-plan.md) for the (also-superseded) unified plan.

---

## Already Built (Foundation)

These systems exist and are working in the codebase:

- **Tick-based game loop** — 10-second ticks, Space to resolve early (`main.js`)
- **Procedural city generation** — infinite chunk-based map with 5 biomes (`map.js`, `data.js`)
- **City shifting** — buildings regenerate every 600 ticks, nothing is permanent
- **Movement** — WASD + diagonal with squeeze-through mechanics (`player.js`)
- **Canvas renderer** — 24px tile grid, 21x21 viewport, biome-tinted tiles (`ui.js`)
- **Ground loot** — items spawn in buildings, [E] to pick up
- **Hazard tiles** — sludge and radiation zones
- **localStorage saves** — position, map state, player data (`main.js`)
- **Splash screen** — "You are a taxi driver. Things have gone wrong."
- **Combat module** — flat HP/damage/armor, no RNG (`combat.js` — not yet wired in)

---

## 1. Origin Stories (Character Start System)

**Concept:** When starting a new run, the player chooses an origin story that drops them into a specific part of the map with a curated-but-random loadout.

- Each origin story ties to a map zone (starting location)
- Loadout is randomly generated but weighted — always includes some valuable crafting supplies
- Origins give identity and flavor without locking gameplay (roguelite sensibility)
- Examples: "Scavenger from the East Side", "Ex-mechanic from the refinery district", "Street kid from the underpass"

**Implementation Notes:**
- Define a list of origins with: `{ name, startZone, lootTable[], lootCount, description }`
- Loot tables should have tiers: common junk, uncommon crafting mats, rare components
- Roll 1 guaranteed rare crafting supply per run start
- Spawn player at a zone-specific spawn point array, pick randomly within that zone

---

## 2. Session Persistence (Local Browser Storage)

**Philosophy:** Remember the old days when you could just get on and play? No login walls. No accounts. Just load and go.

- On game load: check `localStorage` for an existing session
- If session exists: show "Continue" option prominently — one click, back in the game
- If no session: skip menus, start immediately with a default/random origin
- Session data to persist: player position, inventory, health, map state, discovered areas, quest flags
- "New Game" should be a secondary option, not the default

**Implementation Notes:**
- Use a versioned save key, e.g. `violencetown_save_v2`
- Save frequently (on zone transition, on item pickup, on significant events)
- Keep save data compact — stringify only what matters
- Show a small "Last played: X" timestamp if a session exists
- **Note:** Basic save/load already works — this phase upgrades it with versioning, timestamps, and expanded save data

---

## 3. Starting Zone NPCs

**Concept:** The starting zones should feel alive. NPCs give the world texture before the player has any goals.

### Rat + Cheese (Tutorial NPC / Idle Entity)
- A rat nibbles on a piece of cheese in the starting area
- Interacting with or attacking it demonstrates the damage number system
- Structural change: the cheese visually degrades as the rat eats (or takes damage)
- This is the player's first encounter with the damage/durability system — no text tutorial needed, just a rat doing its thing
- The rat should have low HP, run away when at 50%, drop a small cheese scrap item

**Other Starting Zone NPC Ideas:**
- A sleeping drunk leaning against a dumpster (dialogue giver, minor quest hook)
- A street vendor with a limited random stock (introduces the economy)
- A stray dog that can be befriended (follower system seed)

---

## 4. Main Menu — Gas Station Screen

**Concept:** The menu screen is a gas station. It's late. It's lit up. You don't know where you're going yet.

### Visual
- Background: illustrated or pixel-art gas station at night, neon signs, maybe rain
- Idle animation: the rat from the starting zone is visible near the corner, nibbling on cheese
- Atmosphere over UI chrome — minimal buttons, maximum vibe

### "Where do you want to go?"
- A simple location picker presented as destinations on an old road sign or pump screen
- Each location = an origin story zone
- Player picks a destination, which locks in their starting area

### "Who are you?"
- A short text prompt or a few archetype options
- This becomes the player's identity for the run — affects NPC dialogue, some stat weightings, maybe a starting item
- Keep it to one sentence or a name + archetype pick
- Examples: "A name. A reason. That's enough."

**Combined:** Location + Identity → generates the origin story loadout → drops the player in

**Implementation Notes:**
- Menu state stored in `localStorage` so returning players skip straight to "Continue / New Game"
- The rat idle animation should loop seamlessly — consider a simple sprite sheet or CSS animation
- Gas station background can start as a static image, add parallax or weather effects later
- Music/ambient sound: distant highway, buzzing fluorescent light, wind

---

## 5. Height & Visibility System

**Concept:** Vertical dimension with camera-driven fog of war. See [PLAN-height-visibility.md](./PLAN-height-visibility.md) for full research.

- Height tiers: Ground → Furniture → Counter → Tall → Ceiling
- Alpha-dimming to show reachable vs unreachable items
- Climb mechanic with height-based combat bonuses
- No HUD indicators — the renderer communicates everything

---

## Priority Order

1. **Combat integration** — wire `combat.js` into the game loop, add enemies to chunks
2. **Rat NPC + damage numbers** — tutorial-without-a-tutorial, first use of combat system
3. **Gas station menu** — sets tone, integrates the "who/where" questions
4. **Origin stories** — gives the menu choices meaning, defines starting loadouts
5. **Session persistence upgrade** — versioned saves, timestamps, expanded data
6. **Height & visibility** — vertical dimension, the big differentiator
7. **Additional NPCs** — world-building layer, expand incrementally
