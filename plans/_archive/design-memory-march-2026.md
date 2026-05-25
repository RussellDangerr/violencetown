# Violencetown (Working Title) — Design Memory File

> This file captures the full design state from an extensive research and brainstorming session.
> Use it as persistent context for Claude Code sessions working on this project.
> Last updated: March 30, 2026

---

## Project Overview

Violencetown is a top-down action RPG built in HTML5/Canvas. The player navigates a persistent open world, takes over territory from crime bosses, and progresses through equipment and ring-based builds — NOT skill trees or stat leveling. The game draws from Flash-era design philosophy (tight loops, simple inputs, emergent depth from system interactions) while introducing several novel mechanics around character persistence, loot redistribution, and strategic character deployment.

The name is in flux (has been called Vinelandstown, Violencetown, and briefly Greed City). The name doesn't matter yet. The mechanics are the identity.

---

## Core Design Pillars

### 1. No Skill Progression
- No XP, no levels, no skill trees, no stat growth
- Player power comes from EQUIPMENT (passive/automatic) and RINGS (active player choice)
- Player skill/knowledge is the real progression (Outer Wilds principle)
- The player who understands the systems can beat the game with garbage gear

### 2. Equipment: Auto-Equip Best-in-Slot
- 5 equipment slots: Front, Back, Sides, Top, Bottom
- Equipment auto-equips when you walk over something better than what you have
- No inventory management for equipment — the game decides for you
- Old equipment is auto-scrapped for materials
- This removes menu paralysis but also removes player choice on equipment
- **Known concern:** Players may want to "lock" favorite gear to prevent auto-replacement. May need an exception system.
- **Known concern:** Auto-equip removes a dopamine source (the feeling of choosing to equip). Rings must carry ALL the weight of player identity.

### 3. Rings: The Sole Expression of Player Agency in Loadout
- 10 ring slots — the ONLY thing the player actively chooses to equip
- Rings define builds through combinations and synergies
- Ring collection persists permanently — you keep every ring you've ever found
- Equipped rings can be lost on death (bandits steal them) but the collection remains
- Rings have visible environmental effects (sludge pools, fire auras, oil sheens, etc.)
- "Bad" rings aren't bad — they're strategic assets for character parking/deployment
- Ring combos create the build depth that would normally come from skill trees
- **Design goal:** 30+ rings at maturity, but can launch with 10 if each is visually polished
- **Critical requirement:** Ring effects MUST be visually legible in the world. If effects are invisible stat modifiers, the strategic layer collapses.

### 4. Infinite Inventory (Simplified)
- Player picks up everything automatically
- Only keeps the 5 best equipment pieces (auto-equipped)
- Rings go into a permanent collection
- Everything else is auto-scrapped for materials
- No inventory menus, no "which item do I drop" decisions
- Environmental hazards can destroy backpack contents (fire burns supplies, etc.)

---

## Death and Loot Redistribution

### On Player Death:
- Equipment (5 slots) drops at death location
- Some equipped rings are taken by nearby bandits
- Ring COLLECTION persists (you still have every ring you've found, minus the stolen ones)
- Nearby NPCs pick up and equip your dropped gear
- One bandit gets the equipment slots (becomes visually recognizable as "the one wearing your stuff")
- Rings are distributed by pecking order — leader takes best 3-4, lieutenants grab a couple each

### The Emergent Effect:
- Bandit camps near frequent death spots accumulate player gear over time
- A simple bandit hideout can become terrifying if players keep dying nearby
- The bandit who equips your stuff becomes a de facto leader through equipment power
- This is NOT the Nemesis system (no NPC memory, no personality changes, no relationship tracking)
- This IS a loot economy simulation — bandits are scavengers, not nemeses
- **Patent safe:** The WB Nemesis patent (US 10,926,179, expires Aug 2036) covers NPCs remembering encounters and developing personal relationships with the player. Loot redistribution where NPCs equip found gear without any memory of the player is fundamentally different.

### Recovery Experience:
- Equipment recovery: scavenger hunt — sprint through the world, auto-equip whatever you find, rebuild from nothing
- Ring recovery: targeted mission — go to the bandit camp, kill the leader wearing your rings, get your build back online

---

## Character System: Archetypes as Social Perception

### Core Principle:
- Archetypes are NOT classes with abilities
- They define how THE WORLD treats you and how NPCs perceive you
- Everyone has the same 5 equipment slots, 10 ring slots, pick-up-and-throw, infinite inventory
- The difference is NPC behavior, aggro patterns, and world reaction

### Planned Archetypes:
- **The Angler** — Higher aggro radius (bandits chase you more), better drop tables. Carries a fishing rod that can place items at range (bait + environmental hazard = trap). Not a "lure ability" — it's the pick-up-and-throw system expressed through a rod.
- **The Fool** — NPCs underestimate you. Delayed aggro (enemies laugh, turn their backs). Environmental resolution has wider outcome table (chaotic results). When fights start, everyone piles on.
- **The Jock** — NPCs respect or challenge you. More 1v1 encounters. Equipment matters more (NPCs evaluate you by what you're wearing). Thrown objects deal more impact/distance.
- **The Hierophant** — NPCs are suspicious/cautious. Fewer but more dangerous encounters. Ring effects have subtle area-of-effect leakage into the environment.

### "One Cool Thing" Per Archetype:
- Not a special ability button — a property of the character's body or tool
- Discovered through play, never stated on a character select screen
- Uses existing systems (pick-up-and-throw, environmental resolution, ring effects)
- Other archetypes can approximate the effect, just less elegantly

### Archetype Selection:
- Frame it as "who are you?" not "choose a class"
- First playthrough could be archetype-neutral (learn core systems without modifiers)
- Archetypes unlock through encountering them in the world (FFXIV/Minions of Mirth principle)

---

## Character Parking / Strategic Deployment

### The Core Mechanic:
- When you swap to a new character, your old character STAYS IN THE WORLD as an NPC
- They keep their 5 auto-equipped items and whatever rings you left on them
- NPCs cannot change their rings (the "town curse" or similar fiction)
- The parked character radiates ring effects passively in their area

### Strategic Implications:
- Character swapping is DEPLOYMENT, not loss
- "Bad" rings become sabotage tools when left on parked characters in enemy territory
- Players can pre-configure a character's ring loadout for area denial, debuff spreading, environmental setup
- Example: Load a character with 5 AOE debuff rings + oil ring, park them in a bomb factory, swap to Ranger, execute a coordinated strike

### "Fight Yourself" Encounters:
- Parked characters are fully interactive NPCs — you may need to fight them to recover gear
- They use your build but with NPC AI (they use it "wrong" — no player creativity)
- Difficulty scales with how good your previous build was (self-created difficulty curve)
- The visual of YOUR gear on an NPC who doesn't recognize you is the emotional payoff
- **Not a Nemesis system** — the NPC has no memory of you, no grudge, no personality change. They're just wearing good pants.

### World State:
- Multiple parked characters accumulate over time, populating Violencetown with player history
- Parked characters can die, be looted, get into fights with bandits (they participate in the same systems)
- Consider capping active parked characters at 3-4 to prevent difficulty snowball and manage simulation cost
- Older parked characters could "leave town" — gear distributed into world economy

### The Ring Decision at Swap:
- The ONLY choice at character swap is what to do with rings
- Take rings with you → strong start on new character, but old character has no ring effects
- Leave rings on old character → strategic deployment, but new character starts ringless
- This is the game's highest-stakes decision point

---

## World Structure

### Main Objective:
- Take over all crime bosses across Violencetown
- Territory stays taken (persistent world state)
- No stat gates — nothing prevents you from attempting any boss at any time
- Access is controlled by geography and difficulty, not level requirements

### Environmental Design:
- Pick-up-and-throw with environmental resolution (rock-paper-scissors style, inspired by BG3 contested checks)
- No stat attributes for resolution — outcomes depend on WHAT you're holding and WHERE you are
- Environmental hazards interact with ring effects, equipment, and the physics system
- Fire, oil, water, sludge, explosives, electricity — all visually legible, all interactable

---

## Technical Context

- **Platform:** HTML5 / Canvas (browser-based)
- **Constraint:** Solo dev, four-gate development structure
- **Origin:** Started as a Flash-era inspired game, evolved through design iteration
- **Tile system:** Characters occupy tiles (most are 1x1, some NPCs/cryptids are 2x2)
- **Tick system:** Originally 10-second ticks, now reconsidered as "gimmicky" — may move to real-time or different timing model

### Gate Plan (approximate):
- **Gate 1:** Core loop — auto-equip, rings, throw mechanics, death-loot, one district, one crime boss. Must be fun as a straightforward action game WITHOUT parking, swapping, or advanced ring strategies.
- **Gate 2:** Character swapping, NPC persistence, parking mechanics
- **Gate 3:** Broader NPC playability, cryptid system, 2x2 tile characters
- **Gate 4:** Full world, all crime bosses, complete ring set, polish

---

## Research References (from brainstorming session)

### Games Studied for Mechanics:
- **Motherload** — Resource tension, greed as the primary enemy, upgrade-changes-risk-calculus
- **Fancy Pants Adventure** — Physics feel as identity, momentum-based character expression
- **The Binding of Isaac** — Combinatorial depth from simple parts, Flash limitations forcing a remake
- **N / N++** — Movement mastery as content, three inputs creating infinite skill ceiling
- **Super Meat Boy** — Failure tempo, instant respawn transforms difficulty from frustrating to addictive
- **Realm of the Mad God** — Permadeath as engagement, vault system for hedging against loss
- **Kingdom Rush** — Strategic constraint as fun, limited slots forcing real tradeoffs
- **Stick RPG** — Scope perception vs actual scope, time pressure as engagement
- **Stardew Valley** — "One more day" loop, open-endedness, layered systems revealing over time
- **Breath of the Wild** — No skill tree, inventory progression, weapon durability forcing engagement
- **Outer Wilds** — Knowledge as the only progression, zero inventory/stats, discoverable world
- **Shadow of the Colossus** — Objective-driven flat power curve, each boss is a unique problem
- **Dark Souls / Elden Ring** — Ring/talisman slots as build identity, corpse run mechanics, 2-4 slots creating meaningful constraint
- **Pyre** — Permanent character loss as emotional/strategic mechanic, no fail states
- **Mortal Sin** — Classes as combat rhythm (not stat blocks), weapon restrictions as identity, same loot pool with different value per class
- **Minions of Mirth** — Kill enemies to unlock them as playable classes, multiclassing
- **FFXIV** — One character plays all jobs, swap anytime, persistent identity across all expressions

### Key Design Principles Extracted:
1. Flash constraints forced depth through system interactions, not complex individual mechanics
2. The most engaging resource systems are ones where player greed is the primary enemy
3. If your core verb feels incredible, content creation becomes cheap
4. Emergent complexity > designed complexity
5. Loss that creates a STORY feels like drama; loss that reduces a NUMBER feels like punishment
6. The player's understanding of the systems IS the progression
7. Auto-equip works (community mods it INTO games that don't have it)
8. Characters persisting after "loss" is emotionally powerful (Pyre proved this)
9. Restriction breeds strategy — 10 ring slots with 30+ options is richer than unlimited slots

---

## Known Risks and Open Questions

1. **First hour problem:** The advanced systems (parking, deployment, bomb factory combos) are endgame fantasies. The first hour must be fun with just auto-equip, one ring, and basic combat.
2. **Visual legibility at scale:** 30+ ring effects each need visible environmental manifestations. Solo dev production burden is enormous.
3. **Parking skill floor:** 95% of players may never discover the strategic deployment layer. The game must be fun without it.
4. **Auto-equip frustration:** Players may lose gear they liked. May need a "lock" system.
5. **NPC behavior reliability:** Parked characters need to be predictable enough for strategy but alive enough to feel real.
6. **Ring-only agency pressure:** Every ring decision is high-stakes with no low-stakes fiddling space. May need a testing/preview system.
7. **Difficulty snowball:** Multiple parked characters + loot redistribution on death could make areas impossibly hard. Need a pressure valve.
8. **Scope management:** Many of these ideas can't coexist in an HTML5 browser game built by one person. Ruthless prioritization required.

---

## Design Philosophy

> "One bad idea won't spoil it all, I won't let it."

The ideas in this document are clay, not concrete. Most will be reworked. Some will be cut entirely. The ones that work will reveal themselves in development. The tick system was the "biggest idea" and got killed in a week. The Greed City / seven deadly sins overlay was exciting for thirty seconds before being recognized as scope creep. The name doesn't matter. The mechanical identity matters.

Gate One proves the pot can hold water. Everything else is decoration.
