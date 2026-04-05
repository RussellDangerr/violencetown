# Violencetown — Adventure Transition Plan
**Date:** 2026-04-05
**Status:** ACTIVE — Supersedes roguelike design direction
**Connected to:** All existing plans (see Migration Notes at bottom)

> **The Pivot:** Violencetown is no longer a roguelike. It is a **2D pixel JRPG adventure** — hand-crafted zones, persistent progression, a hero's journey arc, and the feeling of Stick RPG meets Pixel Dungeon meets early Final Fantasy.

---

## Why Not a Roguelike

### The Practical Trap
Indie games default to roguelikes because:
1. Procedural generation = less hand-crafted content needed (a solo dev shortcut)
2. Permadeath = shorter sessions = less total content required
3. Proven market after Spelunky, Binding of Isaac, Hades

But the counter-arguments are stronger for Violencetown:
1. **Procedural levels can't create memorable setpieces, pacing, or narrative.** Violencetown's zones (Sewer pipe junctions, Circus big tops, Graveyard catacombs) are hand-crafted and better for it.
2. **The roguelike market is oversaturated.** The most commercially successful 2D pixel indie games are NOT roguelikes — Stardew Valley (41M copies), Terraria (44M), Undertale, Hollow Knight, CrossCode, Sea of Stars.
3. **Roguelikes are anti-narrative.** You can't tell the Financier's vampire story or build toward a climactic return if the player dies and restarts every 20 minutes.
4. **Parking, creature hopping, and territory control don't work in a run-based structure.** These ideas kept fighting the roguelike frame. They fit naturally in a persistent adventure.

### What We're Building Instead
A **linear adventure with hub access** — like Dragon Quest, early Final Fantasy, or Chrono Trigger. The player progresses through zones in order, returns to the hub (Street) between adventures, and the world reacts to their progress. The game has a beginning, a middle, and an end. You can beat it.

---

## The Five Zones — Adventure Structure

### Zone Map

```
                [ Graveyard ]
                     |
[ Factory ] — [ STREET ] — [ Circus ]
                     |
                [ Sewer ]
```

**Street** is the hub. Four adventure zones radiate outward. The player can always return to Street between zones.

### Progression Order

| Act | Zone | Element | Enemies | Boss | Story Beat |
|-----|------|---------|---------|------|------------|
| **Act 1** | **Street** | None (tutorial) | Bankers, suits, office drones (hints they're vampires) | None — learning the ropes | Ordinary World. Player is a nobody. The Financier runs everything. Something is wrong with the sunblock. |
| **Act 2** | **Sewer** | Sludge (purple) | D&D fantasy monsters — rats, slimes, goblins, oozes | **Texas Beholdem** | Crossing the Threshold. First real dungeon. Classic fantasy underground crawl. Sludge is leaking from somewhere. |
| **Act 3** | **Circus** | Fun (chaotic) | Cryptids, clowns, carnival freaks, rigged games | **Bigfoot** | Tests & Allies. The tone shifts to Americana weirdness. Things get unpredictable. Fun element makes combat chaotic. |
| **Act 4** | **Factory** | Goo (green, speeds things up) | Robots, aliens (little green men + enslaved greys) | **Alien Invasion** | The Ordeal. The pace accelerates. Goo speeds everything up. Grey alien rescue subplot (Abe's Oddysee). The source of the sludge AND goo is connected to the Financier's operation. |
| **Act 5** | **Graveyard** | Death (drains life) | Undead — skeletons, zombies, wraiths, bone constructs | **The Deity** | The Innermost Cave. The game gets hard. Death element actively kills you. The Deity reveals the Financier's true plan. |
| **Act 6** | **Street (Return)** | All elements converge | Vampires unmasked, the Financier's full power | **The Financier** | Return with the Elixir. The villain from Act 1 was behind everything. The sunblock/moonblock scheme, the sludge, the goo — all connected. Final confrontation on Bank Street. You win the game. |

### The Hero's Journey Mapped

```
ACT 1 — STREET (Ordinary World)
  "You're nobody. The Financier owns the block. The sun burns.
   Something's wrong with the sunblock but nobody questions it."

ACT 2 — SEWER (Call to Adventure / Crossing the Threshold)
  "Below the street, things are wrong. Sludge. Monsters.
   This isn't normal sewage. Someone is dumping something."

ACT 3 — CIRCUS (Tests, Allies, Enemies)
  "The world gets weird. Cryptids are real. Clowns aren't funny.
   The Fun element scrambles your expectations. Trust nothing."

ACT 4 — FACTORY (The Ordeal)
  "The machines produce goo. The aliens want it. The greys are slaves.
   Everything is connected to the Financier's supply chain.
   The pace is frantic. Goo speeds everything up."

ACT 5 — GRAVEYARD (Innermost Cave)
  "Death is here. The Deity rules. The game stops being fair.
   You learn what the Financier really is. What the moonblock really does.
   The dead are not resting because of what's happening on Street."

ACT 6 — STREET RETURN (Return with the Elixir)
  "Back where you started. But you've changed and so has Street.
   The vampires are unmasked. The Financier makes his stand.
   Everything you learned in 5 zones comes together.
   Beat the Financier. Save the Street. Roll credits."
```

---

## What Carries Forward (From Existing Plans)

### LOCKED — These survive the pivot unchanged
- **Fist damage formula:** Level × 10, weapons are +bonus, thrown = 2× bonus
- **Berserk:** Below 20% HP → 1.5× fist damage
- **5-Zone Body System:** Top/Front/Back/Sides/Bottom, positional targeting
- **Combat math:** No missing, flat armor reduction, deterministic
- **Loot rarity tiers:** Fixed-identity items, hand-crafted legendaries
- **Sprite sheet system:** Per-creature sheets, idle animations, layered rendering
- **Free actions:** Throwing and item use don't consume your turn
- **4-gate development pipeline:** Research → Design → Development → Polish

### MODIFIED — These change to fit the adventure structure
| Feature | Old (Roguelike) | New (Adventure) |
|---------|----------------|-----------------|
| **World structure** | Shifting chunks, procedural | Hand-crafted static zones, persistent |
| **Death** | Permadeath / run-based | Checkpoint respawn at hub (Street) or zone entrance. Lose some gold, keep levels and key items. |
| **Progression** | Knowledge only, no levels | **Leveling system** — Level 1-10, 2 levels per boss. Fists scale with level. |
| **Creature system** | Swap freely, park anywhere | **Party members** — creatures join your party at story beats. Swap in combat or at hub. |
| **Parking** | Strategic deployment | **Gone.** Creatures are party members, not deployable assets. |
| **Loot redistribution** | NPCs equip your dropped gear | **Gone.** Too roguelike. Enemies have their own fixed loot tables. |
| **Wealth = Danger** | Dynamic difficulty based on inventory | **Gone.** Difficulty scales by zone, not by hoarding. |
| **Character hopping** | Creature roster, free swapping | **Party system** — up to 3 active creatures, swap at will, level independently. |

### REMOVED — These don't fit an adventure game
- Chunk regeneration / shifting city
- Parking creatures as strategic assets
- Loot redistribution (NPCs equipping your gear)
- Wealth = Danger dynamic difficulty
- Origin Discovery System (replaced by party recruitment)
- Entropy Director (replaced by authored difficulty curve)
- Death Taxi (replaced by clear endgame goal: beat the Financier)

---

## The Stick RPG Inspiration — Daily Loop Within the Adventure

### What Made Stick RPG Feel Good
Stick RPG's core was a **daily time-management loop:**
1. Wake up (alarm clock = wake earlier = more time)
2. Spend hours on activities: work, study, train, gamble, fight
3. Watch stats go up. Watch bank account grow. Get promoted.
4. Sleep. Repeat.

The magic: **every single day you made visible progress.** No wasted time. Every action moved a needle.

### How This Maps to Violencetown

Street (the hub) provides Stick RPG-style activities between dungeon runs:

| Activity | Location | Effect | Stick RPG Equivalent |
|----------|----------|--------|---------------------|
| **Train** | Gym / Dojo on Street | Small stat boost or unlock a move | Easy Gym |
| **Shop** | Street vendors, pawn shop | Buy/sell equipment and consumables | Convenience Store / Pawn Shop |
| **Work** | Odd jobs for NPCs on Street | Earn gold | New Lines Inc. jobs |
| **Gamble** | Back-alley games | Risk gold for more gold | Silver Lining Casino |
| **Rest** | Home base / apartment | Full heal, save game | Apartments |
| **Talk** | NPCs around Street | Get quests, hints, lore, unlock side content | NPC interactions |
| **Upgrade** | Blacksmith / tinkerer | Improve equipment, craft items | Furniture Store |
| **Read** | Library / notice board | Unlock hints about zone secrets, enemy weaknesses | University of Stick (study) |

The player should feel like "I can always do something productive on Street before heading into the next zone." Not time-gated — you go when you're ready. But the hub rewards hanging around and preparing.

### Progression That Feels Good (The RuneScape Principle)

Every level should unlock something concrete:

| Level | Fist Damage | What Unlocks |
|-------|-------------|-------------|
| 1 | 10 | Starting damage. Access to Street. |
| 2 | 20 | Better job available on Street. New shop inventory. |
| 3 | 30 | Access to training dummy (practice combat). New move? |
| 4 | 40 | Circus shop stocks better gear. NPC joins party? |
| 5 | 50 | Midpoint milestone. Something visible changes on Street. |
| 6 | 60 | Factory equipment becomes usable. New crafting options. |
| 7 | 70 | Graveyard entrance accessible. NPCs react differently. |
| 8 | 80 | Endgame gear appears in shops. Optional sidequests unlock. |
| 9 | 90 | Pre-finale. Street changes visually (vampires getting nervous). |
| 10 | 100 | Cap. Ready for the Financier. Fists are devastating. |

The key: **you should never level up and feel nothing.** Every level opens a door, a shop, a conversation, or a visual change.

---

## Party System (Replaces Creature Hopping/Parking)

### How It Works
- You start as **Human** on Street
- Each zone's story introduces a new **party member** (a creature)
- Party members fight alongside you or can be swapped to as the active character
- Each creature still has its **One Cool Thing** (3B from ABC matrix)
- Party caps at 3 active members (swap others at hub)

### Recruitment Arc

| Zone | Creature Recruited | How They Join | One Cool Thing |
|------|-------------------|---------------|----------------|
| Street | **Human** (you) | Start of game | Jack of all trades — can use any equipment |
| Sewer | **Wererat** | Rescued from sludge, or befriended | Squeeze through 1-tile gaps |
| Circus | **Clown** | Won in a bet, freed from servitude, or defects | Honk — area stun/distraction |
| Factory | **Robot** | Repaired/reactivated on the assembly line | Immune to goo, resistant to sludge |
| Graveyard | **Skeleton** | Rises from the dead, joins your cause | Immune to death drain, can throw own bones |

### Party in Combat
- Active party member is who you control on the tile map
- Other party members follow or can be positioned (simple AI: aggressive, defensive, support)
- Swap active member as a **free action** (fits the existing system)
- Each creature levels independently but shares the same Level × 10 fist formula
- Equipment is per-creature (Wererat can't wear Robot armor)

---

## Zone Design Principles

### Each Zone Needs:
1. **A visual identity** — distinct tileset, palette, atmosphere
2. **An element** — environmental mechanic unique to this zone
3. **A roster of enemies** — 4-6 enemy types that escalate in difficulty
4. **A boss** — major fight at the end, grants 2 levels
5. **A party member** — recruited during or after the zone
6. **A story beat** — advances the Financier plotline
7. **Side content** — optional rooms, secrets, NPC quests
8. **A reason to return** — late-game items, locked doors you can open with new abilities

### Zone Difficulty Curve

```
STREET (Hub):  No combat. Shopping, training, quests. Always safe.
SEWER:         Easy. Teaches combat basics. Sludge is a mild hazard.
CIRCUS:        Medium. Fun element adds chaos. Enemies are unpredictable.
FACTORY:       Hard. Goo speeds enemies up. Multiple hazard types overlap.
GRAVEYARD:     Very hard. Death drains HP passively. Endgame difficulty.
STREET RETURN: Boss rush. The Financier + vampire lieutenants. Everything you've got.
```

---

## What This Game Feels Like

### The 20-Minute Session
1. Start on Street. Check the shop — new armor after beating the Circus. Buy it.
2. Visit the gym. Train for a small stat boost.
3. Talk to the Wererat party member hanging out on Street. Get a hint about a secret in the Factory.
4. Head to the Factory. Swap to Robot (immune to goo) for the toxic sections.
5. Find the secret room the Wererat mentioned. Get a rare weapon.
6. Fight through to the Alien Invasion boss. Almost die. Berserk kicks in at 20% HP. Throw your last weapon for 2× damage. Finish with haymaker fists. Level up to 7.
7. Grey aliens are freed. Robot gets an upgrade. New dialogue on Street.
8. Return to Street. Save. Quit. Come back tomorrow.

### The Stick RPG Feeling
"I leveled up. I got new gear. The shop has new stuff. NPCs say different things. I can see the Graveyard entrance but I'm not ready yet. Let me train one more time and upgrade my weapon. Okay, NOW I'm going in."

### The JRPG Feeling
"The Financier was behind the sludge all along. The moonblock scheme connects to the Graveyard. My party is strong enough now. Let's go back to Street and end this."

---

## Migration Notes — What Happens to Existing Plans

| Plan File | Status | Action |
|-----------|--------|--------|
| `game-zones.md` | **REWRITE** | Rename Town → Street. Restructure as adventure zones with difficulty curve. Remove roguelike mechanics. |
| `abc-decision-matrix.md` | **PARTIALLY RESOLVED** | Cat 1: 1B (Pixel Dungeon Hybrid). Cat 2: 2B (Borderlands Flow). Cat 3: 3B (One Cool Thing). Cat 4: Checkpoint respawn (new). Cat 5: Fully persistent (hand-crafted). Cat 7: Party system (replaces parking). |
| `combat-health-system.md` | **SURVIVES** | Combat math unchanged. 5-zone system unchanged. |
| `fists-fallback-weapon.md` | **SURVIVES** | Level × 10 formula, throwing economy, berserk — all unchanged. |
| `unlimited-moves-item-use.md` | **SURVIVES** | Free actions for throwing/item use — unchanged. |
| `sprite-sheets-and-idle-animations.md` | **SURVIVES** | Visual system unchanged. |
| `research-unarmed-damage-scaling.md` | **SURVIVES** | Reference data, still applicable. |
| `death-respawn.md` | **REWRITE** | Replace with checkpoint system. Lose gold on death, keep levels and key items. |
| `npc-spawning-ai.md` | **MODIFY** | NPCs are hand-placed, not procedurally spawned. AI behavior still relevant. |
| `ground-items-inventory.md` | **SURVIVES** | Item pickup system unchanged. |
| `origin-stories-and-menu.md` | **REPLACE** | No origins. You're Human. Start on Street. Party members join via story. |
| `height-visibility.md` | **SURVIVES** | Height system works in hand-crafted zones. |
| `decision-trees.md` | **PARTIALLY RESOLVED** | Many decisions resolved by this pivot. |
| `game-plan.md` | **REWRITE** | Phase structure needs to reflect adventure design, not roguelike phases. |
| `game-roadmap.md` | **REWRITE** | New roadmap: Street → Sewer → Circus → Factory → Graveyard → Street Return. |
| `ROADMAP.md` | **REWRITE** | Same as above. |
| `zone-room-sketches.md` | **SURVIVES** | Room designs still useful for hand-crafted zones. |

---

## Next Steps

1. **Lock this plan.** This document is the new north star.
2. **Rewrite ROADMAP.md** to reflect adventure structure.
3. **Design Street (hub)** — the most important zone. It's where the player spends half their time.
4. **Design Sewer (first dungeon)** — the first real gameplay. Must teach combat, sludge, and the throw-pickup-fist loop.
5. **Define the Financier's arc** — the villain's presence should be felt from Act 1 (hints on Street) through to the final fight.
6. **Prototype** — get Street + Sewer playable. That's the vertical slice.
