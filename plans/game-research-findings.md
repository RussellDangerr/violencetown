# Game Research Findings — Violencetown Design Session

> **Superseded in part (2026-10-23): the Five-Zone Body System (§4) is not built and will not be.**
> Every combatant has one 100 HP pool and one flat armour total. Where a hit comes from has one
> rule: the tile behind a target hits for ×1.5 (backstab), every other tile for ×1. No per-zone
> health or armour, no prosthetics, no flanks, no top or bottom hits. The live rule is
> `plans/balancing-bible.md` Law 2. Every "ADOPTED" mark on the zone body below is history.

**Session date:** 2026-03-24 (updated 2026-03-30)
**Games studied:** Pixel Dungeon, Minions of Mirth, Dwarf Fortress, Kenshi, RimWorld

This document captures research findings and design decisions that emerged from studying these games. Decisions marked **ADOPTED** are locked. Decisions marked **REJECTED** are explicitly out. Decisions marked **PENDING** still need resolution.

> **Update 2026-03-30:** A major design evolution session reconsidered many systems. Status of adopted decisions:
> - **Action Preview System** — ADOPTED, but delivery depends on Time Model choice (ABC Cat. 1). Survives in 1A and 1B, dies in 1C.
> - **Origin Discovery System** — ADOPTED, merging with creature system. Origins may become creatures.
> - **Loot Rarity System** — ADOPTED, unchanged. Fixed-identity items in rarity tiers.
> - **5-Zone Body System** — ADOPTED, now confirmed as 1:1 map to 5 equipment slots.
> - **Wealth = Danger** — ADOPTED, unchanged.
> - **Entropy Director** — ADOPTED but LOOSELY HELD. May be cut or incorporated as a pressure valve for Loot Redistribution death (ABC Cat. 4B).
> - **Use-based skill progression** — PENDING → LIKELY REJECTED. New design direction says "no skill progression of any kind." Knowledge is the only progression.
>
> **New research references (2026-03-30 session):** Motherload, Fancy Pants, Binding of Isaac, N/N++, Super Meat Boy, Realm of the Mad God, Kingdom Rush, Stick RPG, Stardew Valley, Breath of the Wild, Outer Wilds, Shadow of the Colossus, Dark Souls/Elden Ring, Pyre, Mortal Sin, FFXIV, Well of Souls, FF1-FF10, OSRS, Hotline Miami, Bomberman, Project Zomboid, TMNT, Vampire Survivors, Yu-Gi-Oh (archetype system).
>
> **See:** `plans/abc-decision-matrix.md` for the full decision framework.

---

## Research Takeaways by Game

### Pixel Dungeon (Shattered)
- **4-state enemy AI** (sleep → wander → investigate → hunt) with directional blindspot: enemies can't see 2+ tiles behind them. Door ambushes are mechanically reliable. → **Directly applicable to Violencetown NPC AI.**
- **Hunger as forward-pressure clock** → Violencetown's entropy system already serves this role. No hunger needed.
- **Trinkets as run modifiers** → Biome mechanics already serve this. Could expand to district-level modifiers.
- **Unidentified items** → **REJECTED.** Items are always clear. Strategy comes from combinations and positioning, not guessing what a mystery bottle does.
- **Chess-like tick rhythm** → Validated. The 10-second tick with branching action preview creates the same "think 3-4 moves ahead" feel.
- **Free actions for item use/throwing** → ADOPTED. Pixel Dungeon treats potions, scrolls, and thrown items as free actions that don't end the turn. Violencetown adopts this: throwing and item use are unlimited per turn, only movement and melee attacks consume the turn. See `plans/unlimited-moves-item-use.md`.

### Minions of Mirth
- **Monster Realm** (kill enemies to unlock playing as them) → Evolved into the Origin Discovery System. Origins are found in the world, not unlocked by kill counts.
- **Use-based skill progression** (~80 skills that advance through use, not point allocation) → **PENDING.** Hybrid approach being considered.
- **Solo party system** (run your own 6-character group) → Not applicable. Violencetown is single-character.
- **NPC faction warfare** (100v100 scripted battles) → Faked via chunk regeneration. The city shifts — that IS the world changing.

### Dwarf Fortress
- **"Losing is fun"** — The game is designed around inevitable failure. You build and scramble, entropy wins eventually. → **Core to Violencetown's DNA. Already confirmed.**
- **Procedural artifacts with histories** ("Swordbreaker, forged by Urist in 247") → **REJECTED for procedural generation.** Items are fixed-identity. Legendaries are hand-crafted with personality, not rolled by an algorithm.
- **Material tag interactions** → Tag-based combo system handles this.
- **Body-part targeting** (anatomical combat) → Evolved into the 5-Zone Body System (see Design Decisions).
- **4-facet NPC personalities** (aggression/loyalty/cowardice/greed) → Worth adding to NPC definitions in data.js.
- **Text log as Legends Mode** → The log should function as a personal history. "You killed 3 Clowns in chunk 4,-2. The Bandits noticed."

### Kenshi
- **"You are nobody"** — No chosen one, no plot armor. The world doesn't care. → **Already Violencetown's DNA.**
- **Learn-by-doing skills** — Fight to get better at fighting, sneak to get better at sneaking. → **PENDING.** Key unresolved question: do skills reset on death-as-displacement?
- **Per-limb injury + prosthetics** — Damage by body part, prosthetics that exceed organic capability. → Evolved into 5-Zone Body System. Glow-zone prosthetics could exceed natural stats.
- **World runs without you** — Factions fight, NPCs have routines, territory shifts off-screen. → **Faked via chunk regeneration.** The city shifts when chunks reload. That IS the world changing. No off-screen simulation needed.
- **Biome-as-difficulty** — Different zones have radically different threats AND different faction rules. → Already planned. Each zone fully active in Phase 5.
- **Failure = progression** — Getting beaten up trains toughness. Enslavement trains lockpicking. → Feeds into skills discussion. Death-as-displacement + use-based skills = surviving hard situations makes you better at surviving hard situations.

### RimWorld
- **Storyteller AI** (Cassandra = steady escalation, Randy = pure chaos, Phoebe = relaxed) → Evolved into Random with Guardrails entropy director (see Design Decisions).
- **Wealth = raid difficulty** — More powerful colony = harder raids. → **ADOPTED.** Player threat level scales with inventory power + taxi upgrades + faction rep.
- **Transparent mood system** — Players always know WHY something is happening. → Validated Violencetown's philosophy: clear information, no hidden rolls, no mystery items.
- **Crafting quality tiers** → Feeds into Loot Rarity System (see Design Decisions).
- **"Story generator" philosophy** — The game generates narratives through systemic interaction, not scripted content. → **Core to Violencetown's Phase 6 goal: "20 minutes feels like a story happened to you."**

---

## Design Decisions

### 1. Action Preview System — "Sherlock Holmes Moments"  **ADOPTED**

The action queue becomes a **branching decision tree** rendered step-by-step. Not a flat list — a tree that updates as the player makes choices.

**How it works:**
- Step 1: Show all immediate actions (move N/S/E/W, attack, grab, use item, wait)
- Step 2: Selecting an action renders what branches from that choice (moved N → now can shove dresser, grab item on floor, attack adjacent NPC, continue moving)
- Step 3: Continue branching until tick's action budget is spent

**Organized by:** direction first, then action type (use item, grab person, environmental interaction).

**The math is done for you:** If you have a crowbar in inventory, "shove furniture" appears automatically. The game calculates what's possible given your current position, inventory, and surroundings. Players discover combo options by seeing them in the tree — not by memorizing recipes.

**Natural limits:** The number of interactable objects limits the tree depth. A barren alley has 4 options (move N/S/E/W + wait). A cluttered building might have 20+. The environment IS your moveset.

**Player experience goal:** "What if I did this?" moments before committing. Queue up a chain — shove dresser, move through door, throw shoestraction down alley — hit Space, watch it play out. The 10-second timer creates urgency. Scanning the tree IS the game.

**Violencetown examples:**
- Find poison ivy bundle + peppers in inventory → tree shows "craft pepper bomb" → select → tree shows "attach to robot rat" → select → tree shows "throw robot cheese as decoy" → Space → chaos
- See a bowling ball being thrown at you → tree shows "step left (dodge)" OR "grab bystander as shield" OR "kick dumpster into path"
- Low HP, exiting a building → tree shows "barricade door with dresser (crowbar required)" as an option you might not have known you had

---

### 2. Origin Discovery System  **ADOPTED**

Origins are **found and collected in the world**, not unlocked behind kill counts or menus.

**How it works:**
- Origin stories are discoverable items/events found throughout Violencetown (Street Youth, Clown, Gas Station Attendant, Sewer Rat, and others)
- Origins combine with **locations** (biomes, districts, specific buildings) to create **modifiers** that shape the run
- Example: Street Youth + Circus District = Balloon Bender (different starting gear, different faction relationships, possibly different movement mechanics)
- **Monster runs** (playing as a faction member/creature) are special origin combinations or rare drops — not hidden behind kill milestones
- Origins are a **collectible system** that drives replayability without arbitrary gating

**What this replaces:** The previous design had 5 fixed biome origins selected at the menu. That's still the starting point for a new player's first run, but origins become a living system you discover and combine.

**Still to resolve (Gate 2):**
- How many base origins exist? How many location modifiers?
- How do monster runs work mechanically — origin drop or combo?
- Does origin selection happen at the menu or mid-run?

---

### 3. Loot Rarity System  **ADOPTED**

**Fixed-identity items** organized into **rarity tiers** (Diablo/WoW/Borderlands style).

**Core principle:** Every Lead Pipe is the same Lead Pipe. No stat randomization, no "is this version good?" lottery. Rarity = **both power tier AND scarcity.**

| Tier | Color | Examples | Availability |
|------|-------|---------|--------------|
| Common | White/Grey | Bottle, Pipe, Shoes | Everywhere |
| Uncommon | Green | Crowbar, Bandage, Matches | Moderate |
| Rare | Blue | Katana, Riot Shield | Hard to find |
| Epic | Purple | Named items with unique mechanics | Very rare |
| Legendary | Orange/Gold | The Woody Machine, [hand-crafted refs] | Extremely rare |
| Pearlescent | Cyan/Pearl | *(maybe)* Ultra-rare, run-defining | TBD |

**Design rules:**
- No weapon levels. Lead Pipe doesn't become Lead Pipe +2.
- No procedural stat generation. The item is what it is.
- Legendaries are **designed by hand** with personality and references. Not algorithm output.
- Higher rarity items are both mechanically stronger AND harder to find — the tiers reflect power and scarcity together.
- Rarity affects **wealth score** (see Wealth = Danger).

---

### 4. Five-Zone Body System  **ADOPTED — REPLACES FLAT 100 HP**

All characters (player, NPCs, all creature types) have **5 hit zones**. The zone hit is determined by **attacker position**, not menu choice.

| Zone | Human body part | Hit from | Frequency |
|------|----------------|---------|-----------|
| **Top** | Head | Above (rooftop, ladder, upper floor) | Rare |
| **Front** | Chest / body | Facing the target (NESW) | Common |
| **Back** | Capes, wings, jetpacks, accessories | Behind the target | Common |
| **Sides** | Arms | Flanking (perpendicular to facing) | Common |
| **Bottom** | Legs | Below (sewer grate, floor hole) | Rare |

**Key rules:**
- Positioning on the tile map IS your targeting decision. No attack menus.
- Front/Back/Sides are the bread and butter — standard NESW tile positioning determines these.
- Top/Bottom are **rare and disproportionately powerful.** Limited verticality in Violencetown makes them special:
  - Headshot from above = daze, extra damage, possible knockdown
  - Leg strike from below = movement cripple, possible trip
- Non-human creatures map to the same 5 zones differently (a dog's "back" is its spine, not a cape slot)
- Zone-specific **armor and HP** — a armored vest protects the front, not the back. A helmet protects the top.
- **Prosthetics** (Kenshi-inspired) can replace damaged zones and potentially exceed organic performance, especially Glow-zone tech.

**This replaces the flat 100 HP system** from the original combat brief. The "universal 100 HP" locked decision is superseded by this zone-based approach.

---

### 5. Wealth = Danger  **ADOPTED**

Player **threat level** is a hidden score that makes the city push back harder as the player accumulates power.

**Threat level components:**
- Inventory items (weighted by rarity tier — Legendaries add more heat than Commons)
- Taxi upgrades (each part tier adds to threat)
- Faction reputation (high rep with The Duke = Clowns and Bandits send harder enemies)

**Effect:** Higher threat = more aggressive NPC behavior, tougher encounter spawns, more faction attention. Hoarding powerful gear is a **strategic tradeoff** — power vs. heat.

**Why this works for Violencetown:** Prevents boring late-game power fantasy. Keeps entropy meaningful at every stage. Makes the 2D inventory grid a tactical decision — do you carry that Epic item knowing it draws heat?

---

### 6. Entropy Director — Random with Guardrails  **ADOPTED**

Entropy events are mostly random but governed by soft invisible rules that manufacture drama.

**The rules:**
- **Hidden health buffer:** The last ~5% of visible HP is actually 10-15% of real HP. Players feel like they barely survived more often than they actually do. The game doesn't lie about numbers — it just compresses the danger zone visually. (Borderlands uses this trick.)
- **Loot compensation:** When the player is in a bad state (low HP, few items, recent deaths), nearby ground item quality quietly improves. The city just happens to have a first-aid kit behind that dumpster.
- **Extended clutch moments:** When the player is in danger, the game biases toward giving them escape routes — more interactable objects nearby, NPCs slightly slower to pursue. Extends the tension rather than collapsing it.
- **No stacking disasters:** Soft cap on consecutive entropy events after a death or near-death.

**What this is NOT:** Hand-holding. The rules are invisible. The city still doesn't care. Players should never feel protected — they should feel lucky. The goal is manufactured "skin of your teeth" moments that reward improvisation and chaos.

---

## Still Pending

| Decision | Status | Blocking question |
|----------|--------|-------------------|
| **Use-based skill progression** | LIKELY REJECTED (2026-03-30) | New design direction: "no skill progression of any kind." Player knowledge IS progression (Outer Wilds principle). Rings replace what skills would do. |
| **Pearlescent rarity tier** | MAYBE | Depends on how deep the item system goes. Leave open for Phase 5+. |
| **Origin combination specifics** | EVOLVING → CREATURE SYSTEM | Origins are merging with creature selection. "How many creatures?" replaces "how many origins?" See ABC Cat. 3. |
| **NPC personality facets** | PENDING | Add aggression/loyalty/cowardice/greed facets to NPC data definitions. More important now if Loot Redistribution (ABC Cat. 4B) is chosen — NPCs need distinct behavior when equipped with player gear. |
| **Ring archetype system** | NEW (2026-03-30) | 10-slot ring/chip/brain build system. Archetype synergies at 3+ stacks. See ABC Cat. 6. |
| **Creature "One Cool Thing"** | NEW (2026-03-30) | Each creature gets one unique mechanic (rat squeezes through gaps, robot resists sludge, smooth talker replaces combat with dialogue). See ABC Cat. 3B. |
| **Loot Redistribution on death** | NEW (2026-03-30) | NPCs pick up and equip player-dropped gear. Creates emergent difficulty. Requires persistent world (ABC Cat. 5B/5C). See ABC Cat. 4B. |
| **Time model evolution** | NEW (2026-03-30) | Tick timer reconsidered. Pixel Dungeon hybrid (no timer, turn-based, play as fast as you want) is leading option. See ABC Cat. 1. |
