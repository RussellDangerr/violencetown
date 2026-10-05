# Violencetown ABC Decision Matrix

> **Purpose:** Present every major design fork as a clear A/B/C choice with tradeoffs, cascade effects, and gameplay vignettes. Designed to be thrown at the developer as rapid-fire decisions that shape the prototype.
>
> **Gate:** Pre-Gate 1 (Research & Discovery) — this document informs which version of each system enters the 4-gate pipeline.
>
> **Session date:** 2026-03-30
> **Decision order:** Categories ranked by cascade impact. Decide #1 first, #8 last.

---

## How to Use This Document

1. Read each category's A/B/C options
2. Read Part 2 (Cascades) to see how choices force or block other choices
3. Read Part 3 (Vignettes) to FEEL what combinations play like
4. Check Part 4 (Compatibility Matrix) for conflicts
5. Make decisions in the order listed in Part 5

Each decision you make narrows the remaining options. By Category 5 or 6, many choices will be pre-determined by your earlier picks.

---

## Part 1: Decision Categories

### CATEGORY 1: MOVEMENT & TIME MODEL — Decide First

> **Superseded (2026-10-03): options 1A and 1C.** The game took 1B, and the turn model
> (`plans/turn-model.md`) builds on it. 1A's timer and 1C's real time are not coming back.

**Option A: Evolved Tick (Keep 10s timer, modernize the Action Preview)**
The current 10-second tick stays. The Action Preview System ("Sherlock Holmes moments") remains the core differentiator. Space executes early. The timer creates urgency. Combat is chess-like deliberation. Modernize by adding variable tick lengths (5s in combat, 10s exploring) and make the preview tree prettier and more responsive.

*Tradeoff:* Unique identity, supports planning depth, but feels slow to modern players. Hard to achieve the "speed IS skill" OSRS feel. New players bounce off the forced waiting.

**Option B: Pixel Dungeon Hybrid (No timer, turn-based under the hood, real-time in feel)**
Remove the clock entirely. One tile per input, as fast as you want. The world only advances when you act. Action Preview still works because time is frozen until you commit. The "Sherlock Holmes moment" becomes: hold Shift to enter preview mode, scan the tree, release to act. Speed players blast through. Cautious players deliberate.

*Tradeoff:* Best of both worlds on paper. Removes the timer anxiety. But loses the urgency that makes bad decisions funny. The "oh no the tick is resolving and I didn't mean to do that" comedy evaporates. Requires rethinking what creates pressure (answer: enemy density and resource scarcity instead of a clock).

**Option C: Real-Time with Pause (Hotline Miami meets Superhot)**
True real-time movement. Time slows dramatically (but does not stop) when the player is not inputting. Enemies move in real-time but at readable speeds. The Action Preview becomes a quick-flash HUD showing options on the current tile, not a branching tree. Pick-up-and-throw is fluid, not queued.

*Tradeoff:* Most visceral, most accessible, closest to Hotline Miami reference. But kills the chess-like depth entirely. The Action Preview System is gutted. Planning is replaced by reflexes. The game becomes a different genre. The Smooth Talker creature becomes nearly impossible to design.

---

### CATEGORY 2: INVENTORY & EQUIPMENT PHILOSOPHY

**Option A: The Bag (2D grid, bag damage, inventory management IS gameplay)**
Keep the existing Phase 3 plan. 6x4 grid. Bag catches fire, gets holes, corrodes in sludge. Choosing what to carry is a core decision. Equipment is manual: you pick what goes in each of the 5 body zone slots from what you're carrying. Rings are a separate permanent collection (not in the bag).

*Tradeoff:* Rich tactical layer. Every item pickup is a decision. Bag damage creates emergent stories ("my bag has a hole and my legendary hammer fell out three tiles ago"). But it's a LOT of UI. Inventory Tetris is polarizing. Slows the pace. Requires significant UI engineering for a canvas game.

**Option B: Borderlands Flow (Infinite pickup, auto-scrap garbage, top-5 choice on good gear)**
Everything you walk over gets picked up. Garbage auto-scraps into currency or materials. When a genuinely good item drops, you get a brief prompt: "Equip this Legendary Frying Pan? It replaces your current Front-slot Rusty Pipe." The game handles the curation. You only make decisions on items that matter. Ring inventory is the REAL inventory where build identity lives.

*Tradeoff:* Fast. Respects player time. Dopamine hit of constant pickup without the drag of management. But removes the "what do I carry?" tension entirely. No bag damage system. No inventory-as-puzzle. The game loses a potential comedy vector (flaming bags, items falling through holes).

**Option C: Ring-Only Identity (Auto-equip everything, zero equipment choice, rings ARE the game)**
Full auto-equip. The game always puts the best item in each body zone slot. You never open an equipment screen. Your ENTIRE build identity comes from the 10 ring/chip/brain slots. Equipment is just passive stat sticks that cycle automatically.

*Tradeoff:* Maximally streamlined. All player agency concentrated in rings. But removes a dopamine source. Players who find a cool weapon want to CHOOSE to equip it. "The game decided for me" can feel bad.

---

### CATEGORY 3: CREATURE SYSTEM & IDENTITY

**Option A: Creatures as Costume (Cosmetic + dialogue, same mechanics)**
All creatures play identically. A zombie and a robot move the same, fight the same, equip the same. The difference is: different joke cutscene entrances, different NPC dialogue reactions, different visual comedy. Build identity comes entirely from rings and gear.

*Tradeoff:* Simplest to implement. Every system only needs to work once. But "why swap?" becomes weak if the only reward is dialogue. Players settle on one creature and never leave.

**Option B: Creatures with One Cool Thing (Shared base, unique signature mechanic)**
Every creature shares the same movement, combat, and equipment systems. But each has ONE unique mechanic. Zombie: eat dead NPCs to heal. Robot: immune to sludge, weak to radiation. Clown: honk = noise weapon. Sewer Rat: fits through 1-tile gaps. Smooth Talker: dialogue replaces combat entirely (persuade, deceive, barter, provoke).

*Tradeoff:* Each creature feels meaningfully different without requiring parallel balance passes. Creates genuine reasons to swap: "I need to get through that 1-tile gap, time to be a rat." But requires careful design so no creature's Thing obsoletes the others.

**Option C: Creatures as Divergent Classes (Deeply different mechanics per creature)**
Each creature has unique movement rules, combat verbs, equipment interactions, and ring affinities. A zombie is slow but regenerates. A robot is fast but needs batteries. A beholdem floats over obstacles but can't use doors. Ring archetypes align with creature types.

*Tradeoff:* Maximum variety and replayability. Every creature swap feels like a new game. But the development cost is enormous. Every system must account for N creature variants. Balance nightmare. The GAME_STUDIO_PLAN.md anti-pattern "building engine, not game" warning applies here.

---

### CATEGORY 4: DEATH & PERSISTENCE

**Option A: Arcade Displacement (Fast reset, minimal penalty)**
Die, see a funny death screen for 3 seconds with a quip and run stats, respawn at the gas station with reduced gear. World persists. Turnaround under 5 seconds. Death is a punchline, not a punishment. You keep 50-70% of what you had.

*Tradeoff:* Lowest friction. Encourages risk-taking, which feeds comedy. But death has no weight. Danger isn't funny if dying is just a loading screen.

**Option B: Loot Redistribution (NPCs pick up your dropped gear, targeted recovery)**
Die, drop ALL equipment at death location. Rings stolen by nearest NPC, who equips them and gets their effects. Your gear scatters. The area around your death becomes harder. Recovery is a targeted mission: find the bandit wearing your Ring of Lantern (who now has a visible lantern and fire aura), reclaim your build.

*Tradeoff:* Creates emergent stories. "A clown is wearing my legendary hammer and three fire rings — he's now the most dangerous NPC in this district." But can snowball: die once, area gets harder, die again recovering, area gets even harder. Needs a pressure valve.

**Option C: Creature Death (Your creature dies permanently, hop to next in roster)**
When a creature dies, it's DEAD. You immediately hop to the next creature in your roster. The dead creature's body and gear persist as loot. If you have no creatures left, you start fresh with a random new one. Death is permanent per creature but the player persists across creatures.

*Tradeoff:* Most meaningful death. Every creature matters. But requires the creature roster to exist at launch, not as a stretch goal. If the player only has one creature, this IS permadeath.

---

### CATEGORY 5: WORLD STRUCTURE

**Option A: Shifting City (Current: chunks regenerate, impermanence is identity)**
Keep the current system. Chunks regenerate every 600 ticks. The city shifts. Nothing is permanent except the gas station. "The city does not care about you."

*Tradeoff:* Technically simple (already implemented). Constant novelty. But makes territory control impossible. Character parking is pointless if chunks regenerate. Loot redistribution is undermined if NPCs despawn.

**Option B: Persistent Territories + Shifting Edges (Hybrid)**
Boss territories and player-claimed zones persist indefinitely. The rest of the city shifts. When you defeat a district boss, that chunk locks and becomes YOUR territory (or your parked creature's). Uncontested chunks continue to regenerate.

*Tradeoff:* Gives accomplishment (persistent territory) and novelty (shifting edges). But architecturally complex. Chunk system must track persistent vs. ephemeral. Save data grows with every conquest. Edge cases at persistent/shifting boundaries.

**Option C: Fully Persistent (Nothing regenerates, world accumulates history)**
Every chunk, once generated, stays forever. Dead NPCs stay dead. Dropped items persist. The city is a living record of everything that happened. Territory changes through faction warfare, not chunk regeneration.

*Tradeoff:* Most narratively satisfying. Character parking works perfectly. Loot redistribution has permanent consequences. But save data grows unboundedly. The "shifting city" identity is gone. Novelty comes only from pushing into unexplored areas.

---

### CATEGORY 6: RING/BUILD IDENTITY DEPTH

**Option A: Light Rings (5-8 rings, simple stat buffs, no archetype synergy)**
Rings are straightforward: +15% fire damage, +20% movement speed, -10% sludge resistance. Each ring does one clear thing. No set bonuses. No archetype combos. Stack 10 independent buffs. Launch with 5-8.

*Tradeoff:* Achievable scope. Easy for players. But boring. "I have 10 stat sticks" is not a build identity. No Torghast/Vampire Survivors feeling.

**Option B: Archetype Rings (12-15 rings, set bonuses at 3-4 stacks, visual combos)**
Rings belong to named archetypes (Sludge, Fire, Tech, Shadow, etc.). Equipping 3+ from the same archetype triggers synergy. Sludge x1 = sludge trail. Sludge x3 = trail damages enemies. Sludge x5 = you ARE sludge. Visual effects compound with stacking. 12-15 rings across 4-5 archetypes at launch.

*Tradeoff:* The sweet spot. Discoverable combos. "What happens if I stack a fourth fire ring?" moments. Build identity is loud and readable. But 12-15 rings each needing VFX is significant art work. Some combos will be overpowered.

**Option C: Combinatorial Explosion (30+ rings, cross-archetype interactions, Vampire Survivors depth)**
Every ring interacts with every other ring. Sludge + Fire = Napalm Trail. Tech + Mind Control = Drone Army. 30+ rings at launch. Visual clutter of a fully-loaded character IS the joke.

*Tradeoff:* Maximum depth and comedy. But 30 rings = 435 unique pairs to design and balance. Scope nuclear bomb for a solo HTML5 project.

---

### CATEGORY 7: CHARACTER PARKING

**Option A: Easter Egg (Parked creatures roam as flavor NPCs)**
When you swap away, the creature stays on the map as a simple wandering NPC. Has funny dialogue if you encounter it. No strategic depth. Pure comedy: "oh look, my zombie is over there eating a rat."

*Tradeoff:* Lowest cost. Real comedy value. But parking isn't a mechanic, it's a visual gag.

**Option B: AC Brotherhood Lite (Send on quests, gear-based success rate)**
Parked creatures can be sent on off-screen quests from a simple menu. Success depends on equipped gear and rings. Successful quests return resources or rare items. Failed quests may lose some gear.

*Tradeoff:* Adds a light meta-layer. Gear matters for creatures you're not playing. But it's a mobile idle mechanic bolted onto an action RPG.

**Option C: Trojan Horse Deployment (Park in territories, creature effects radiate)**
Parked creatures exist on the map with full physical presence. Ring effects radiate into surrounding area. Parking in hostile territory is a strategic move: strong enough = you claim it. Weak = they kill your creature. "Dress your robot in bandit gear and park it in bandit territory" as infiltration.

*Tradeoff:* Most interesting design. The Trojan horse concept is hilarious and deep. But requires on-map AI, ring effect simulation, territory logic, and save persistence. Scope risk is extreme.

---

### CATEGORY 8: VISUAL SCALE & CAMERA

**Option A: Current Scale, Polished (21x21 at 24px)**
Keep current viewport. Invest in color coding, particle effects, floating weapon sprites. Accept equipment details won't be visible. FF1-FF6 approach: silhouette + color + effects.

*Tradeoff:* No overhaul needed. But research shows 24px characters are color blobs. Five equipment zones can't be visually distinguished. Looks like a prototype.

**Option B: Mid Scale (30x20 visible, 32px tiles, 40-56px characters)**
The researched sweet spot. Characters large enough for 5 equipment zones to read. Ring effects have room. Weapons as floating sprites. Enough tactical visibility without feeling disconnected.

*Tradeoff:* Equipment readable, ring effects dramatic, game looks finished. But requires full rendering overhaul: new sprite sizes, tile sizes, viewport, UI layout. Major engineering.

**Option C: Big Scale (PZ-style zoom, 60-80px characters, 50x50+ area)**
Full equipment detail visible. Zoomable camera. Looks like a modern indie title.

*Tradeoff:* Most impressive visually. But requires 3D rendering or enormous sprite sheets. Zoomable canvas means multi-scale redrawing. Performance concern. Godot-migration-tier ambition applied to HTML5.

---

## Part 2: Cascade Analysis

### Primary Cascade: Movement & Time (Cat. 1) drives everything

**If you pick 1A (Evolved Tick):**
- Inventory 2A (The Bag) is natural — 10 seconds to think about inventory
- Combat Preview stays as crown jewel
- Creature 3B (One Cool Thing) works — deliberation lets you use abilities thoughtfully
- Creature 3C (Divergent) is hard — different creature speeds break tick balance
- Death 4A or 4B both pair well

**If you pick 1B (Pixel Dungeon Hybrid):**
- Inventory 2B (Borderlands Flow) is ideal — fast pickup matches fast movement
- Inventory 2A (The Bag) creates friction — stop to manage after fast bursts
- Combat Preview survives in hold-to-preview form
- Creature 3B (One Cool Thing) is the best fit
- Ring 6B (Archetype) works great — visible effects while zooming
- This is the most flexible choice — it constrains the least

**If you pick 1C (Real-Time):**
- Inventory 2A (The Bag) is BLOCKED — can't manage grid in real-time
- Combat Preview is dead — replaced by quick-flash HUD
- Creature 3C (Divergent) is a balance catastrophe in real-time
- Ring 6A (Light) preferred — can't process archetype combos in real-time
- Everything unique about Violencetown evaporates

### Secondary Cascade: World Structure (Cat. 5) + Death (Cat. 4) are coupled

- **4B (Loot Redistribution) REQUIRES 5B or 5C.** NPCs can't equip your gear if they despawn with chunk regeneration. Hard dependency.
- **4C (Creature Death) REQUIRES 3B or 3C.** If creatures are cosmetic (3A), losing one is meaningless.
- **4A (Arcade) works with ANY world structure** — most flexible death option.
- **5A (Shifting City) BLOCKS 4B, 4C, and meaningful parking (7B, 7C).**

### Tertiary Cascade: Ring Depth (Cat. 6) + Inventory (Cat. 2)

- **6C (Combinatorial) + 2A (The Bag) = decision overload.** Player drowns.
- **6A (Light Rings) + 2C (Auto-Equip) = no decisions anywhere.** Player bored.
- **6B (Archetype) + 2B (Borderlands Flow) = balanced.** Streamlined gear + rich rings.

### Cascade Dependency Map

```
CATEGORY 1 (Time Model) ← DECIDE FIRST
  ├─→ CATEGORY 2 (Inventory) — 1C blocks 2A
  │     └─→ CATEGORY 6 (Ring Depth) — 2A+6C = overload, 2C+6A = underload
  ├─→ CATEGORY 3 (Creatures) — 1C blocks 3C
  │     ├─→ CATEGORY 4 (Death) — 4C requires 3B or 3C
  │     └─→ CATEGORY 7 (Parking) — 7C requires 3B+
  └─→ CATEGORY 8 (Scale) — 1C benefits from 8B+

CATEGORY 5 (World Structure) ← DECIDE SECOND
  ├─→ CATEGORY 4 (Death) — 4B requires 5B or 5C
  └─→ CATEGORY 7 (Parking) — 7C requires 5B or 5C
```

---

## Part 3: Gameplay Vignettes

### Vignette 1: "The Deliberator"
*1A Evolved Tick + 2A The Bag + 3B One Cool Thing + 4A Arcade + 5A Shifting + 6B Archetype + 7A Easter Egg*

You're a sewer rat in the Sludgeworks. The tick timer shows 7 seconds. The Action Preview tree fans out: you can squeeze through a 1-tile gap to the left (your One Cool Thing — no other creature fits), grab the glowing purple ring on the other side, or go right and fight the thug. You scan your bag — it has a sludge hole from last zone, your crowbar fell through two ticks ago. You have three Sludge Rings equipped, leaving a damaging trail. You squeeze through the gap. On the other side: a fourth Sludge Ring. You equip it. The synergy bonus triggers — your sludge trail now SLOWS enemies. The timer hits zero. You emerge and the thug steps into your trail. He's stuck. You club him with your frying pan. In the distance you spot your parked zombie wandering around eating a dead rat. Comedy.

### Vignette 2: "The Speedrunner"
*1B Pixel Dungeon + 2B Borderlands Flow + 3B One Cool Thing + 4B Loot Redistribution + 5B Persistent Territories + 6B Archetype + 7A Easter Egg*

You're a robot in Downtown, tapping arrow keys at max speed. Items auto-scrap as you run over them — currency counter ticking up. A Legendary Hammer on the ground: "Equip? Replaces Rusty Pipe (Front slot)." You mash E without stopping. Three clowns block the alley. You hold Shift — preview shows you can shove the dumpster into two and throw your old Rusty Pipe at the third. You release. Dumpster crushes. Pipe clangs. You keep running. A bandit ambushes — you die. Your Legendary Hammer and two Tech Chips drop. The bandit picks up the hammer. You respawn at the gas station as the same robot (zero gear, sad beeping). You head back. The bandit is still there, visibly holding YOUR hammer and glowing with YOUR chip effects. That chunk is persistent. You scavenge a crowbar, stack two Fire Rings from your collection, and go hunting your own build.

### Vignette 3: "The Diplomat"
*1B Pixel Dungeon + 2B Borderlands + 3B One Cool Thing + 4A Arcade + 5B Persistent + 6B Archetype + 7B Brotherhood*

You're the Smooth Talker. No weapons. Your One Cool Thing is dialogue — when adjacent to an NPC, instead of "attack," your options are: Persuade, Deceive, Barter, Provoke. You walk into Clown territory wearing full Clown-archetype rings (honk aura, balloon particles, confetti trail). A Clown guard approaches. You Persuade: "I'm clearly one of you. Look at the confetti." Success. He lets you pass. Deeper in, you find the Clown Boss. You Provoke: "Your shoes aren't even that big." He attacks. You sprint away, leading him into a narrow alley where your parked zombie (sent on a "guard this alley" quest via Brotherhood menu) is waiting. The zombie jumps him. You watch. You never swing a weapon once.

### Vignette 4: "The Hoarder's Nightmare"
*1A Evolved Tick + 2A The Bag + 3B One Cool Thing + 4B Loot Redistribution + 5C Fully Persistent + 6C Combinatorial + 7C Trojan Horse*

You're a human, 200 ticks in. Your bag is a disaster: sludge corroded two slots, fire burned a corner. 14 of 24 slots functional. But your ring setup is absurd: 3 Fire + 2 Sludge + 1 Mind Control = Napalm Trail that mind-controls the first enemy to step in it. Five parked creatures hold five districts, each radiating ring effects. Your fire-ring robot made Downtown a burning hellscape. Then you die. ALL of it drops. The bandit who killed you gets the Mind Control and three Fire Rings. He's now a napalm-mind-control bandit in a fully persistent world. Your parked creatures still hold territory, but your active creature is naked at the gas station. You stare at the map, contemplating your empire and the monster you accidentally created.

### Vignette 5: "The Arcade Machine"
*1C Real-Time + 2C Auto-Equip + 3A Cosmetic + 4A Arcade + 5A Shifting + 6A Light + 7A Easter Egg + 8A Current Scale*

You mash WASD. Your character (a clown, but it doesn't matter — every creature plays the same) runs through the shifting city. Items auto-equip. Rings give flat bonuses. You die. Three seconds later you're back. The city has shifted. Nothing persists. Nothing matters. It's fast, it's smooth, and after fifteen minutes you close the tab because there's nothing to think about. Every unique thing about Violencetown has been sanded off. This combination exists to show what NOT to do.

### Vignette 6: "The Mad Scientist"
*1B Pixel Dungeon + 2B Borderlands + 3C Divergent Classes + 4C Creature Death + 5B Persistent + 6C Combinatorial + 7C Trojan Horse*

Maximum everything. You're a beholdem — you FLOAT. Move over water, ignore ground hazards, can't use doors (too wide). Your 10 eyestalk slots: Fire + Mind Control + Tech x3 = autonomous laser drones that mind-control what they hit. You're a floating death ball. You park your armored zombie in bandit territory as a Trojan horse. You float toward Clown district. Boss fight. Drones mind-control two guards who turn on their boss. You win. Then a sewer rat ambush from below kills you. The beholdem is DEAD. Permanently. You scramble to your roster. Your zombie is embedded in bandit territory. Your robot is on a quest. You're forced to play as... the Smooth Talker. Your only remaining creature. In a world you built for combat. This is either a masterpiece or an unshippable nightmare.

### Vignette 7: "The Ring Collector" — THE SWEET SPOT
*1B Pixel Dungeon + 2B Borderlands + 3B One Cool Thing + 4B Loot Redistribution + 5B Persistent + 6B Archetype + 7A Easter Egg*

You're a zombie. Your brain has 10 lobe slots. Four Sludge Lobes — synergy means your trail heals you when you walk through your own sludge. You're in the Sludgeworks: basically unkillable here. You find a fifth Sludge Lobe. New tier: you can ABSORB sludge tiles, clearing them and gaining temp armor. The Sludgeworks is your home biome. But you need a Fire Lobe from the Glow for a cross-archetype combo (Sludge x5 + Fire x1 = Acid Fire trail). You swap to your robot (immune to sludge, can traverse Sludgeworks safely to reach the Glow). You leave your zombie as a flavor NPC — it wanders, visibly sludge-coated. You navigate the Glow as a robot, find the Fire Chip, pocket it. Now you need to get it BACK to the zombie. The chip is in the robot's inventory, not the zombie's. You need to figure out how to transfer it. An emergent logistics puzzle that's funny, strategic, and totally unscripted.

### Vignette 8: "The Trojan Horse"
*1B Pixel Dungeon + 2B Borderlands + 3B One Cool Thing + 4B Loot Redistribution + 5B Persistent + 6B Archetype + 7C Trojan Horse*

You've been planning this for thirty minutes. You dressed your clown in full bandit-archetype gear: dark rings, stealth effects, muted aura. You park it at the edge of Bandit territory. It blends in. Bandits treat it as one of their own. Meanwhile, you're playing as the sewer rat, tunneling through 1-tile gaps to reach the bandit boss from underneath. When you arrive, your parked clown is right next to the boss, accepted as a guard. You swap to the clown. It's right there. You activate its One Cool Thing: the HONK. Massive noise blast stuns everything. The boss is dazed. You grab his legendary weapon, swap to the rat, squeeze through the escape, vanish. The bandits are confused. Your clown is revealed as a traitor. They attack it. It dies. You lose the clown. But you have the weapon. A heist that was never scripted.

### Vignette 9: "The Comedy Horror"
*1B Pixel Dungeon + 2B Borderlands + 3B One Cool Thing + 4B Loot Redistribution + 5B Persistent + 6B Archetype + 7A Easter Egg*

You die for the third time in the same chunk. Each death, local bandits took your gear. Bandit #1 got your Legendary Frying Pan. Bandit #2 got three Fire Rings. Bandit #3 got your crowbar and sludge ring. You respawn at the gas station, naked. Check the map. That one chunk in Stealville is now the most dangerous square mile in Violencetown. Three bandits wearing your accumulated loadout from an hour of play. One has the frying pan AND fire rings — a walking napalm chef. You gear up with trash weapons, sneak back, shove a dumpster between two of them. They aggro on each other. Your fire-ring bandit sets the sludge-ring bandit on fire. In the chaos, you grab your frying pan and sprint away laughing. None of this was designed. It emerged from systems interacting.

### Vignette 10: "Nothing Matters"
*1A Evolved Tick + 2A Bag + 3A Cosmetic + 4A Arcade + 5A Shifting + 6A Light + 7A Easter Egg + 8A Current*

The conservative path. Everything works. Nothing breaks. The game is functional and unremarkable. You play for 10 minutes and think "this is fine." You close the tab. Nobody tells their friend about it. It ships. It exists. The end. This vignette exists to prove that safe choices produce safe games.

---

## Part 4: Compatibility Matrix

✓ = Strong pairing | ~ = Works with friction | X = Hard conflict or wasted potential

### Time Model vs Inventory

| | 2A: The Bag | 2B: Borderlands | 2C: Auto-Equip |
|---|---|---|---|
| **1A: Evolved Tick** | ✓ tick gives time to manage | ✓ | ✓ |
| **1B: Pixel Dungeon** | ~ fast move, slow bag | ✓ BEST | ✓ |
| **1C: Real-Time** | X can't manage grid in RT | ~ | ✓ |

### Time Model vs Creature Depth

| | 3A: Cosmetic | 3B: One Cool Thing | 3C: Divergent |
|---|---|---|---|
| **1A: Evolved Tick** | ✓ | ✓ BEST | ~ variable speeds break tick |
| **1B: Pixel Dungeon** | ✓ | ✓ BEST | ~ careful balance needed |
| **1C: Real-Time** | ✓ | ~ | X balance nightmare |

### Death vs World Structure

| | 5A: Shifting | 5B: Persistent + Shifting | 5C: Fully Persistent |
|---|---|---|---|
| **4A: Arcade** | ✓ | ✓ | ~ underuses persistence |
| **4B: Loot Redistribution** | X gear despawns | ✓ BEST | ✓ |
| **4C: Creature Death** | ~ body despawns | ✓ BEST | ✓ |

### Ring Depth vs Inventory

| | 2A: The Bag | 2B: Borderlands | 2C: Auto-Equip |
|---|---|---|---|
| **6A: Light** | ✓ bag fills the gap | ~ both shallow | X no decisions |
| **6B: Archetype** | ~ high total complexity | ✓ BEST | ✓ rings carry weight |
| **6C: Combinatorial** | X too many systems | ✓ | ~ rings alone overwhelm |

### Creature Depth vs Parking

| | 7A: Easter Egg | 7B: Brotherhood | 7C: Trojan Horse |
|---|---|---|---|
| **3A: Cosmetic** | ✓ | ~ shallow | X pointless, all identical |
| **3B: One Cool Thing** | ✓ BEST at launch | ✓ | ✓ abilities enable infiltration |
| **3C: Divergent** | ~ wastes potential | ✓ | ✓ but scope catastrophe |

### Creature Depth vs Death

| | 3A: Cosmetic | 3B: One Cool Thing | 3C: Divergent |
|---|---|---|---|
| **4A: Arcade** | ✓ | ✓ | ✓ |
| **4B: Loot Redistribution** | ✓ | ✓ BEST | ✓ |
| **4C: Creature Death** | X losing a costume = nothing | ✓ losing the ability hurts | ✓ devastating |

---

## Part 5: Recommended Decision Order

Ranked by cascade impact — how many other decisions are forced or constrained.

### 1. MOVEMENT & TIME MODEL (Category 1) — Decide First
Constrains: Inventory, Creatures, Combat Preview, Scale, and the fundamental game feel. The difference between tick-based and real-time is a genre change.

### 2. WORLD STRUCTURE (Category 5) — Decide Second
Constrains: Death, Parking, and long-term player investment. Shifting vs persistent is architectural — affects chunk storage, save format, NPC lifecycle.

### 3. CREATURE DEPTH (Category 3) — Decide Third
Constrains: Parking, Death meaning, ring interaction design. "How different are creatures?" determines whether the hopping loop matters.

### 4. DEATH & PERSISTENCE (Category 4) — Decide Fourth
Depends on World Structure and Creature Depth being settled first.

### 5. INVENTORY & EQUIPMENT (Category 2) — Decide Fifth
Depends on Time Model being settled.

### 6. RING DEPTH (Category 6) — Decide Sixth
Depends on Inventory being settled (to avoid decision overload pairing).

### 7. CHARACTER PARKING (Category 7) — Decide Seventh
Depends on Creature Depth and World Structure being settled.

### 8. VISUAL SCALE (Category 8) — Decide Last
Production decision, not design decision. Build at current scale, plan for target. The game should work at 24px and LOOK GOOD at 32px+.

---

## The Combination That Appears Most in the Best Vignettes

**1B + 2B + 3B + 4B + 5B + 6B + 7A(→7B→7C)**

Pixel Dungeon Hybrid + Borderlands Flow + One Cool Thing + Loot Redistribution + Persistent Territories + Archetype Rings + Easter Egg Parking (scaling up to Brotherhood and Trojan Horse as the game matures).

This combination appears in Vignettes 2, 3, 7, 8, and 9 — the five most interesting scenarios. It's not a coincidence. These choices reinforce each other:
- Fast movement (1B) + fast loot (2B) = fluid pace
- One Cool Thing (3B) gives each creature a unique verb without scope explosion
- Loot Redistribution (4B) + Persistent Territories (5B) = emergent difficulty
- Archetype Rings (6B) = discoverable builds without combinatorial scope bomb
- Easter Egg Parking (7A) is cheap to ship, with a clear upgrade path to Brotherhood (7B) and Trojan Horse (7C)

This maps to the GAME_STUDIO_PLAN.md gate structure:
- **Gate 1 (Research):** This document
- **Gate 2 (Design):** Design each system with the chosen combination in mind
- **Gate 3 (Development):** Prototype 1B+2B+3B first (movement + loot + one creature ability)
- **Gate 4 (Polish):** Layer in 4B, 5B, 6B as the core proves fun

---

## Features With Uncertain Status

These were discussed but don't fit cleanly into the ABC matrix. They're modular — they can be added or cut without breaking the core loop.

| Feature | Status | Add if... | Cut if... |
|---------|--------|-----------|-----------|
| **The Duke** | Loosely held | ...the game needs a quest-giver NPC to direct new players | ...emergent gameplay provides enough direction |
| **Death Taxi** | Loosely held | ...the game needs a long-term progression anchor | ...creature hopping + ring collection is enough progression |
| **4 Named Factions** | Loosely held | ...territory persistence (5B/5C) needs faction owners | ...biome-as-lore is enough identity |
| **Noise/Light/Stealth** | Loosely held | ...the Smooth Talker needs stealth as an alternative to combat | ...Smooth Talker's dialogue system is sufficient |
| **Entropy Director** | Loosely held | ...death snowball (4B) needs a pressure valve | ...natural loot redistribution self-balances |
| **Action Preview Tree** | Depends on Cat.1 | ...you pick 1A or 1B (it survives) | ...you pick 1C (it dies) |
| **Tag-based Crafting** | Loosely held | ...environmental interaction becomes a core verb | ...rings replace the "combine things" fantasy |
| **Shifting City chunks** | Depends on Cat.5 | ...you pick 5A or 5B (partially survives) | ...you pick 5C (gone entirely) |
