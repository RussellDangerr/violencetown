# Feature: Stats, Consumables & The Library
**Phase:** Phase 2 — Life in the City (foundation), Phase 3 onward (expansion)
**Priority:** Critical (defines how the player gets stronger)
**Status:** Research (Gate 1)

> **Origin:** Design session 2026-05-21. The original design pillar was "no XP, no levels, no skill trees, no stat growth — power comes from equipment and rings." This revision preserves the spirit (no grinding, no XP bars) while adding two new progression axes: **permanent stat-boost items** found through exploration, and **skills learned from books at the Library**. The player still never grinds. Stats grow because you found something, not because you killed 200 rats.

> **Connects to:** `plans/economy-merchants.md` (ambro/necta are trade goods), `plans/give-action-and-disposition.md` (Charisma stat modifies disposition shifts), `plans/combat-health-system.md` (Attack/Defense replace flat damage/armor), `plans/cosmology-and-arc.md` (Behest joins the cast as a knowledge broker), `plans/ground-items-inventory.md` (inventory model is now infinite-with-stacking).

> **Supersedes:** The "No stat growth" clause in `VIOLENCETOWN_DESIGN_MEMORY.md`. The spirit — no grinding — survives. The letter changes: stats CAN grow, through placed items only.

> **Terminology:** Citizens of Violencetown are called **Violencians**. Food items are **ambro** (from ambrosia — food of the gods). Drink items are **necta** (from nectar — drink of the gods). These are Violencian street slang, not formal names.

---

## Gate 1: Research & Discovery

### Genre References

1. **RuneScape** — The gold standard for food-as-healing. Shrimp heals 3, lobster heals 12, shark heals 20. Your inventory of sharks IS your confidence meter: "I have 20 sharks, I can take this boss." The food tier maps to game progression — you unlock better fishing → better food → harder content. The act of eating 20 sharks mid-combat is absurd and beloved. Violencetown should lean into this absurdity the same way, with ambro instead of fish.

2. **Zelda (BotW / TotK)** — Heart containers and stamina vessels are permanent stat boosts found through exploration. No grinding — you find a shrine, you solve it, you get a stat point. The number of upgrades you've collected IS your level without ever calling it that. This is the exact model for Violencetown's stat-boost items: placed, not farmed.

3. **Dark Souls** — Estus flasks (limited healing per checkpoint) create a resource-management layer on combat. You don't heal infinitely — you heal N times, then you're out. Violencetown's ambro model is similar but uses consumable food items instead of refillable flasks. Running out of ambro mid-dungeon is the Dark Souls "out of estus" feeling.

4. **Morrowind** — Potions have wild stacking effects. Drink 50 Intelligence potions, brew a super-potion, break the game. The necta system should allow creative stacking without Morrowind's full degeneracy — temporary buffs that layer but don't multiply exponentially.

5. **Paper Mario: The Thousand-Year Door** — Cooking system where combining ingredients creates better food items. Simple recipes (two items → one dish) with emergent discovery. If Violencetown adds cooking later, this is the complexity ceiling — two-ingredient combinations, not Minecraft crafting grids.

6. **Pokémon** — Vitamins (Protein, Iron, Calcium) permanently increase specific stats. Found in the world, purchased at shops, limited per Pokémon. The items ARE the stat system. No leveling required. Closest mechanical precedent to Violencetown's permanent stat-boost ambro.

7. **Elder Scrolls (Arena through Skyrim)** — The Mages Guild → College of Winterhold progression. A dedicated location where magic is learned, with a cast of instructors. Violencetown's Library fills the same structural role but replaces magic with knowledge and mages with a librarian. Behest is Violencetown's Savos Aren — except she actually does her job.

### Player Experience Goal

> "You open the stats menu and it reads like a report card from a school that doesn't exist. You've eaten your way to +3 Attack, read your way to Lockpicking, and you're carrying 14 boardwalk burgers because you know what's coming. The Library is the only place in Violencetown where violence isn't the answer — unless you count overdue fines."

---

## Part 1: The Stat System

### Stats

Eight stats, split into combat and non-combat. All start at a base value. All increase ONLY through permanent stat-boost items (ambro and books). No XP, no level-ups, no stat growth from combat.

**Combat Stats (4):**

| Stat | Base | Effect | Boost Source |
|---|---|---|---|
| **Muscle** | 5 | Melee damage dealt. Each point = +1 flat damage per hit. | Protein-rich ambro (steaks, jerky, mystery meat) |
| **Guard** | 3 | Damage reduced per hit received. Each point = -1 damage taken. Replaces flat armor. | Tough ambro (hardtack, bone broth, gristle) |
| **Nerve** | 5 | Determines action priority in tick resolution. Higher Nerve = act first. Future: dodge chance. | Stimulant ambro (hot peppers, espresso beans, circus fire-eater candy) |
| **Vitality** | 50 | Max HP. Food heals current HP; Vitality boosts raise the ceiling. | Hearty ambro (whole meals, feast plates, Zelda-style "hearty" prefix items) |

**Non-Combat Stats (4):**

| Stat | Base | Effect | Boost Source |
|---|---|---|---|
| **Charm** | 3 | Disposition shift multiplier on give-action. Charm 3 = 1.0× shift. Each +1 Charm = +0.1× multiplier. Charm 8 = 1.5× shift. Makes bribery more effective. | Social ambro? Or books only. Decision needed. |
| **Sight** | 3 | Detect hidden items, secret passages, disguised NPCs. At Sight thresholds (5, 8, 12), new categories of hidden content become visible. | Books and observational items. "You read 'Spotting the Unseen.' Sight +1." |
| **Luck** | 1 | Loot quality modifier. Higher Luck = better items in ground loot tables and merchant stock. Also affects rare event trigger rate. | Rare charms, lucky finds, specific quest rewards. |
| **Grit** | 3 | Element resistance. Slows how fast element bars (Sludge, Goo, Bored, Fun, Death) fill. Each +1 Grit = -5% fill rate across all elements. | Zone-specific endurance items. Sewer grit from surviving sludge, Circus grit from enduring Fun. |

**Design notes:**
- Eight stats is enough to create build variety through permanent boosts without overwhelming the player.
- All stat effects are transparent and deterministic. Muscle +1 = +1 damage, always. No hidden modifiers.
- Base values are intentionally low so that found boosts feel significant. Going from Muscle 5 to Muscle 8 is a 60% damage increase — every boost matters.
- Non-combat stats create exploration incentives: Sight reveals hidden content (you revisit old zones with higher Sight and find things you missed), Charm makes the give-action economy richer, Luck improves loot across the board, Grit lets you survive deeper in dangerous zones.

### Stats Menu

`[TAB]` or `[S]` opens the stats panel (DOM overlay, tick pauses).

Display:
```
╔══════════════════════════════╗
║  NIGHT KID — Violencian      ║
╠══════════════════════════════╣
║  Muscle   ████░░░░  8        ║
║  Guard    ███░░░░░  6        ║
║  Nerve    █████░░░  10       ║
║  Vitality ████████  75 HP    ║
║──────────────────────────────║
║  Charm    ████░░░░  7 (1.4×) ║
║  Sight    ██░░░░░░  5        ║
║  Luck     █░░░░░░░  2        ║
║  Grit     ████░░░░  7 (-20%) ║
╠══════════════════════════════╣
║  Ambro: 14 items             ║
║  Necta: 6 drinks             ║
║  Gold:  230                  ║
╚══════════════════════════════╝
```

- Bar visualization makes relative stat levels instantly readable.
- Parenthetical shows the derived effect (Charm 7 = 1.4× disposition shift, Grit 7 = -20% element fill).
- Bottom section shows consumable counts and gold — the "confidence meter" at a glance.
- Eventually: hover/click on a stat shows the full list of boosts that contributed to it ("Muscle 8: base 5, +1 from Boardwalk Steak, +1 from Sewer Jerky, +1 from Eternal Burger").

---

## Part 2: Consumables — Ambro & Necta

### Ambro (Food — Healing + Permanent Boosts)

Ambro is the Violencian word for food. All food is ambro. Ambro does two things:

1. **Healing ambro** — Consumable. Eat it, restore HP. RuneScape model: each ambro item heals a fixed amount. Eating consumes one turn (or is a free action — decision needed). Stacks infinitely in inventory. Your ambro stack IS your confidence.

2. **Stat-boost ambro** — Rare, placed items. Eat it, permanently increase a stat by 1. NOT stackable in inventory (each is unique). Found in fixed world locations, quest rewards, or rare merchant stock. These are the Zelda heart containers. ~40-60 total across the full game, distributed across all zones and stats.

**Healing Ambro Tiers (by zone):**

| Tier | Zone | Example Items | Heal Amount | Notes |
|---|---|---|---|---|
| 1 | Street | Boardwalk burger, hot dog, soft pretzel, slice of pizza | 10-15 HP | Jersey's diner serves these. Cheap, common, baseline. |
| 2 | Sewer | Mystery meat, tunnel mushroom, sludge-washed apple | 15-25 HP | Questionable provenance. Carrion sells some of these. May have minor sludge side-effect. |
| 3 | Circus | Cotton candy, caramel apple, funnel cake, popcorn bucket | 20-30 HP | Tastes amazing. May tick Fun gauge slightly. The healing comes at a cost. |
| 4 | Factory | Alien ration pack, synthetic protein bar, grey-alien gruel | 25-40 HP | Efficient but joyless. No side effects — the robots designed these for optimal nutrition. |
| 5 | Graveyard | Bone broth, grave dirt truffle, spectral fig | 30-50 HP | Unsettling. Heals a lot. May tick Death gauge slightly. You're eating food that shouldn't exist. |

**Special Ambro:**
- **Candies** — Heal-over-time items. Eat a hard candy, heal 3 HP per tick for 10 ticks. Slower than a burger but more total healing. Circus-sourced.
- **Feast plates** — High-tier meals that heal to full AND grant a temporary buff (Muscle +2 for 20 ticks, etc.). Rare. Found or cooked (future crafting feature).
- **Stat-boost ambro** — The permanent items. "Eternal Burger" (+1 Muscle permanently). "Hearty Stew" (+5 Vitality permanently). One-time use, placed in the world, never respawns.

### Necta (Drinks — Everything Else)

Necta is the Violencian word for drinks. All potions, beverages, tonics, and concoctions are necta. Necta does NOT heal HP — that's ambro's job. Necta does everything else:

**Necta Categories:**

| Category | Effect | Example Items | Duration |
|---|---|---|---|
| **Buff necta** | Temporarily increase a stat | Muscle Shake (+3 Muscle, 30 ticks), Nerve Tonic (+5 Nerve, 20 ticks) | Timed |
| **Element necta** | Reduce or cleanse element bars | Sludge Flush (halves Sludge bar), Fun Dampener (reduces Fun by 20), Clean Water (general cleanse) | Instant |
| **Perception necta** | Reveal hidden content | Third Eye Tea (Sight +5 for 10 ticks, reveals all hidden items on screen) | Timed |
| **Resistance necta** | Temporary element resistance | Sludge-Proof Serum (ignore Sludge fill for 20 ticks), Death Ward Tonic (pause Death bar for 15 ticks) | Timed |
| **Chaos necta** | Wild effects, risky | Mystery Brew (random stat +5 AND random stat -3), Jester's Juice (Fun bar fills to max but Charm +10 for 5 ticks) | Varies |
| **Transformation necta** | Future: interact with creature transformations | Rat Brew (trigger Wererat form without cooldown?), Bone Juice (Skeleton → Zombie instant?) | Varies |

**Design notes:**
- Necta effects are always temporary (except Chaos necta, which might have permanent downsides as the cost of a gamble).
- Necta stacks infinitely in inventory, same as ambro. Your necta stockpile is your tactical toolkit.
- Water IS a necta — it's the simplest element-cleansing necta. Carrion still values it because she's dehydrated. Water doesn't get a special UI bar; it's just a drink.
- Multiple necta can be active simultaneously. Buff stacking: same-stat buffs don't stack (latest overwrites). Different-stat buffs do stack. No Morrowind degeneracy.
- Necta is rarer than ambro. Food is everywhere; drinks require sourcing. Merchants, rare loot, or the Library's alchemical collection.

### Inventory Model

Infinite inventory with stacking. Resolves the ABC Decision Matrix Category 2:

- All items stack by type. 20 boardwalk burgers = one inventory entry showing "Boardwalk Burger ×20."
- No weight, no bag, no grid, no volume limit.
- The inventory list shows: item name, count, and one-line effect ("Boardwalk Burger ×20 — Heal 12 HP").
- Stat-boost ambro does NOT stack (each is unique, one-time-use, consumed on pickup or via menu).
- Equipment occupies 5 body-zone slots (separate from the consumable inventory).
- Rings occupy 10 ring slots (separate from everything else).
- The inventory's "size" (total consumable count across all types) is the player's power indicator at a glance: a player carrying 14 ambro and 6 necta is well-provisioned; a player carrying 0 is desperate.

---

## Part 3: The Library & Behest

### The Library

The Library is Violencetown's skill hub. It exists as a **cross-zone institution** — a main branch on Street and smaller collections (reading rooms, archives, stashes) in each zone.

**Main Branch (Street):**
- A large building on Street, between Jersey's Diner and Bank Street.
- Multiple rooms: the Reading Room (where skills are learned), the Stacks (explorable bookshelves with findable books), the Circulation Desk (Behest's station), the Archive (locked section with late-game books, requires Sight or quest progress to access).
- Tile palette: wooden floors, bookshelves (tall, dense), reading lamps, card catalog cabinets, "QUIET PLEASE" signs, stamped due-date cards scattered on the floor, a globe, ladders on rails.
- Atmosphere: quiet, warm, dusty. The one place in Violencetown where violence feels wrong (but isn't mechanically prevented — you CAN fight in the Library, and Behest will have opinions about it).

**Zone Branches:**

| Zone | Branch Name | Description | Book Types |
|---|---|---|---|
| **Sewer** | The Drain Archive | Waterlogged room behind a sealed pipe. Half the books are ruined; the ones that survived are invaluable. Shelves are pipe-mounted. | Survival skills, Sludge resistance lore, Wererat history |
| **Circus** | Fortune Teller's Collection | A tent full of mystical texts, tarot guides, cryptid field journals. The fortune teller is one of Behest's "associates." | Perception skills, Cryptid knowledge, Charm techniques |
| **Factory** | Technical Library | A maintenance office with technical manuals, alien datapads, and operating procedures. Sterile, fluorescent-lit. | Combat skills (precision-themed), Goo research, Robot schematics |
| **Graveyard** | The Ossuary Codex | Ancient texts in a crypt library. Bone-shelf bookends. The oldest books in Violencetown are here. | Death resistance lore, history skills, forbidden knowledge |

**How it works:**
1. Player finds a **book** or **magazine** in the world (ground loot, quest reward, merchant purchase, hidden in a bookshelf).
2. Player brings the book to any Library branch.
3. At the Library, interact with the Circulation Desk or the Reading Room: select a book from inventory → "Read [book name]?" → skill learned or stat boosted.
4. Some books can be read anywhere (simple skill books). Others require the Library's resources — Behest's guidance, reference materials, or specialized equipment only the Library has.
5. Books are consumed on use (you've absorbed the knowledge — the book is returned to the Library's collection, narratively).

### Behest — Librarian NPC

**Role:** Cast-spine NPC. The knowledge broker. She controls what Violencians can learn by controlling what they can read. In a city where violence is the default verb, Behest offers the only alternative: understanding.

**Name etymology:** "At your behest" — at your request, at your command. The name initially reads as a **title** ("the Behest" — the one who fulfills requests), not a proper name. Each zone branch appears to have a different librarian. The late-game reveal is that "Behest" is a proper name — it's the same person. The title-to-name inversion is the reveal's hinge: what seemed like a role description was an identity all along.

**Personality:** Procedural, exacting, patient. She doesn't raise her voice. She doesn't judge your choices. She catalogs everything, remembers everything, and provides exactly what's requested — nothing more. She is the KND rule incarnate: bureaucratic procedure for extraordinary content. "You'd like to learn the art of bone-breaking? Section 614.2, third shelf from the left. Please use a bookmark."

**Tonal register:** The anti-Jersey. Where Jersey is a patron with a hidden agenda, Behest is a civil servant with no agenda at all. She serves the Library. The Library serves knowledge. Knowledge serves whoever picks up the book. She's neutral in the cosmological war — she'd catalog the Financier's economic papers with the same care as Sun Man's solar research. Her neutrality is her power: everyone trusts the Library because Behest is incorruptible.

**Appearance (per branch — each is distinct):**
- **Street Main Branch:** Reading glasses, hair pinned up with a pencil, cardigan over a collared shirt. Sensible shoes. Warm, patient, mid-tempo speech.
- **Sewer Drain Archive:** Rubber boots, rain slicker, hair tucked under a waterproof cap. Clipped, efficient speech — she's busy keeping books dry.
- **Circus Fortune Teller's Collection:** Headscarf, layered shawls, kohl-rimmed eyes. Speaks in riddles and half-sentences. Reads palms between book recommendations.
- **Factory Technical Library:** Lab coat, safety goggles pushed up on forehead, clipboard. Technical, precise, speaks in specifications.
- **Graveyard Ossuary Codex:** Black shawl, pale makeup, speaks in a near-whisper. The quietest version. Moves the least.

Each branch's librarian looks, sounds, and behaves like a completely different person. There is no gimmick — no "we're all sisters" joke, no obvious tells, no winking at the camera. The player is meant to accept five different librarians at face value.

**The thread (for players who look):** Minute environmental details that travel with her across all five branches. NOT appearance-based — the disguises are total. The details are in the *objects*:
- The same hairbrush on the desk at every branch (distinctive — tortoiseshell, missing one tooth)
- A mug with the same chip in the rim, different liquid in each zone
- One specific book that's always checked out at every branch — the same title appears on every "Currently Unavailable" list
- A particular shelving habit: she always places returns spine-out on the leftmost shelf first, regardless of Dewey order, then corrects them later
- The faintest sulfuric smell near the desk (the Flatwoods Monster's signature — "noxious mist")

A player who notices the hairbrush in the Sewer AND remembers seeing it on Street has found the thread. A player who never notices still has five functional librarians.

**Location:** Primarily at the main branch on Street. Appears at zone branches during specific narrative beats or when the player has accumulated enough books to warrant a "reading session." She may have assistants at the zone branches (a sodden book-imp in the Drain Archive, a fortune teller in the Circus tent, a filing-cabinet robot in the Factory library, a bone-scribe in the Ossuary).

**Mechanical function:**
- Interact with Behest to access the skill menu.
- She can tell you what books you're missing for a skill you want ("For Advanced Lockpicking, you'll need 'Tumbler Mechanics' — I believe a copy exists somewhere in the Sewer branch").
- She tracks your reading history (a sub-journal of books read, accessible through her dialogue).
- She offers book recommendations based on your current stats (soft guidance without breaking player agency).
- Disposition: starts at +30 (friendly). Unlike most NPCs, she doesn't start hostile. She's a public servant. She can be bribed with rare books to raise disposition further, unlocking access to restricted sections.

### Skills

Skills are learned from books at the Library. They are NOT stat boosts — they are **new abilities** or **permanent passive effects** that change how the player interacts with the world.

**Skill categories:**

| Category | Examples | Source |
|---|---|---|
| **Combat skills** | Uppercut (bonus damage on first hit), Parry (reduce damage from next attack), Sweep (hit two adjacent enemies) | Combat manuals, training guides |
| **Exploration skills** | Lockpicking (open locked chests/doors), Climbing (access height-tier surfaces without [C] key), Swim (traverse sludge/water tiles without element damage) | Adventure guides, survival manuals |
| **Social skills** | Haggle (reduce merchant prices by Charm%), Intimidate (chance to skip combat via threat display), Read Disposition (see exact disposition numbers without hovering) | Social handbooks, psychology texts |
| **Knowledge skills** | Cryptid Lore (Cryptid Cards fill in faster / reveal more detail), Element Theory (see element bar fill rates numerically), Appraise (see item base values and merchant preferences) | Academic texts, research papers |
| **Zone skills** | Sludge Resistance I/II/III (progressive Sludge fill reduction), Fun Immunity (temporary Fun bar freeze on demand), Goo Channeling (Goo speed boost without Life cost) | Zone-specific texts found in zone branches |

**Skill design principles:**
- Skills are OPTIONAL. The game is beatable without any skills. Skills make you more efficient, not more powerful (with exceptions for combat skills that genuinely add damage/options).
- Each skill has a book requirement: one book for basic skills, 2-3 books for advanced skills. Finding all the books for an advanced skill is a collection quest that rewards exploration.
- Skills can be "equipped" in a limited number of active slots (4-6 active skills at a time? Or unlimited? Decision needed). If slotted: the Library is the respec station — visit Behest to swap active skills.
- No skill trees. No prerequisites beyond "have you read the book(s)." A player who finds an advanced book early can learn an advanced skill early. Knowledge is progression.

---

## Technical Feasibility

**Affected modules:**
- `game/player.js` — Stats object (`player.stats = { muscle: 5, guard: 3, nerve: 5, vitality: 50, charm: 3, sight: 3, luck: 1, grit: 3 }`). Skill list (`player.skills = []`). Consumable inventory (`player.ambro = []`, `player.necta = []`).
- `game/data.js` — Ambro definitions (name, healAmount, statBoost, zone, tier, sideEffect). Necta definitions (name, effect, duration, category). Book definitions (name, skillGranted, requiredBooks, zone). Skill definitions (name, type, effect, description).
- `game/items.js` — Consume action for ambro/necta. Book use action (at Library: learn skill; elsewhere: "You should read this at the Library" or simple books work anywhere).
- `game/ui.js` — Stats panel (`[TAB]`/`[S]`). Inventory sub-sections (Ambro, Necta, Books, Equipment, Rings). Library interaction UI (book selection, skill learning confirmation).
- `game/combat.js` — Stat integration: Muscle replaces flat damage, Guard replaces flat armor, Nerve determines turn order.
- `game/npc.js` — Behest NPC definition. Library branch interactables.
- `game/renderer.js` — Hidden item rendering gated by Sight stat. Stat-boost item visual distinction (glow, sparkle, unique color).
- New map JSONs: Library main branch map, zone branch rooms.

**Known constraints:**
- Eight stats is manageable for a solo-dev game. More than 8 risks stat bloat; fewer than 6 risks insufficient differentiation. Eight is the sweet spot.
- Stat-boost items must be hand-placed (not procedurally spawned). This is an authoring burden but ensures each boost feels meaningful and rewards specific exploration.
- The Library as a cross-zone institution requires map space in every zone. Zone branches can be small (one room), but they need to exist.
- Behest needs authored dialogue. She's a cast-spine character — she needs the same quality of writing as Jersey, Sun Man, and Carrion.
- Infinite inventory with stacking requires a UI that handles long lists. Scrollable panel with category tabs (Ambro / Necta / Books / Misc).
- No save system — all stats, skills, and inventory reset on reload. Same constraint as everything else.

**What already exists:**
- `player.hp` and `player.maxHp` — becomes `player.stats.vitality`.
- Item definitions in `data.js` — expand with ambro/necta/book types.
- Ground item rendering — ambro/necta/books render as ground loot with distinct characters/colors.
- Give-action's disposition shift math — modified by `player.stats.charm`.
- Combat damage math — modified by `player.stats.muscle` and `player.stats.guard`.

---

## Scope — Minimum Viable Feature

**In scope for first ship:**

- **Stats:** 8 stats with base values. Stats panel UI (`[TAB]` key). Stats affect combat (Muscle → damage, Guard → reduction, Nerve → priority) and disposition (Charm → shift multiplier). Sight, Luck, Grit effects deferred to follow-up — the stats exist and display, but their mechanical effects roll out incrementally.
- **Ambro:** 3-5 healing food items per zone (Tier 1-5). Eat from inventory to heal HP. Stacks infinitely. 5-8 permanent stat-boost ambro items placed in the Sewer (first zone content).
- **Necta:** 3-5 drink types. Temporary stat buffs, element cleansing. Stacks infinitely. Basic buff stacking (latest same-stat overwrites, different stats coexist).
- **Inventory:** Infinite stacking by item type. Category tabs in inventory panel (Ambro / Necta / Books / Misc). Count display per stack.
- **Books:** 5-8 books placed in the Sewer + Street. Reading a book at the Library grants a skill. Simple books readable anywhere.
- **Library:** Main branch on Street (one room MVP). Behest NPC at the circulation desk. Interact to read books and learn skills. Skill list viewable in stats panel.
- **Behest:** First-encounter dialogue, book recommendation system (tells you where to find books you need), reading history tracker.
- **Skills:** 4-6 launch skills covering combat (1-2), exploration (1-2), and knowledge (1-2). No skill slots for MVP — all learned skills are always active.

**Out of scope (explicit):**

- Zone Library branches (except Street main). Sewer Drain Archive, Circus tent, Factory library, Graveyard codex — all future additions.
- Cooking / recipe system (combining ambro items into better meals).
- Necta brewing (combining ingredients into custom drinks).
- Skill respec at the Library (swapping active skills). MVP: all skills always active.
- Behest's full arc / narrative integration. MVP: she's a functional NPC, not a story-driver yet.
- Sight-gated hidden content (requires map authoring of hidden items — needs its own feature).
- Luck-modified loot tables (requires loot table refactor — needs its own feature).
- Grit-based element resistance (requires element bar system refactor — needs its own feature).
- Stat-boost necta that permanently DECREASE a stat (trade-off drinks). Future depth lever.

---

## Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| **Stat-boost items make the game too easy.** If the player finds all 50+ permanent boosts, they're overpowered. | Medium | Stat-boost items are rare and placed in dangerous locations. The game's difficulty scales with zone progression — Graveyard stat items are guarded by Death-bar pressure. Also: stat boosts are additive (+1 per item), not multiplicative. Going from Muscle 5 to Muscle 15 doubles your damage, but enemies in later zones have proportionally more HP. The curve stays parallel. |
| **Eight stats overwhelm a solo dev's balance surface.** Every new stat multiplies the number of interactions to tune. | High | Ship with 4 mechanically active stats (Muscle, Guard, Nerve, Vitality) and 4 display-only stats (Charm, Sight, Luck, Grit) that are "tracked but not yet wired." This halves the balance work for v1 while keeping the full stat list visible for player anticipation. |
| **Infinite inventory removes resource tension.** If you can carry 99 sharks, nothing is scary. | Medium | Resource tension comes from AVAILABILITY, not carrying capacity. Ambro doesn't spawn in unlimited quantities — each zone has finite food, and it doesn't respawn (until reload). The player can carry all the food they find, but they can't find infinite food. RuneScape's tension isn't inventory space — it's that sharks cost 1,000 gold each. |
| **The Library feels disconnected from the action zones.** Players forget to go back and read books. | Medium | New-book notification in the status panel: "You found a book. Visit the Library to learn from it." Behest dialogue: "I notice you're carrying unread material. Shall we begin?" The Library is on Street — the hub — so players pass through it regularly. Zone branches (future) solve this further. |
| **Behest is underdeveloped as a character.** A functional NPC without narrative depth feels like a vending machine. | Medium | First ship: Behest has personality through her dialogue style (procedural, dry, specific). She comments on what you're reading ("Ah, 'Tumbler Mechanics.' Popular with the Sewer crowd."). She remembers your reading history. Full narrative arc (what is she hiding? why is she neutral? what does she want?) is deferred but the seeds are planted in her first encounter. |

---

## Open Questions (For Gate 2)

1. **Ambro consumption timing.** Is eating a free action (can eat mid-combat without spending a turn) or a turn-consuming action? RuneScape: eating takes one tick. Dark Souls: drinking estus has an animation window. Free action makes ambro a pure resource check (do you have food?). Turn-consuming makes it a tactical decision (do I eat or attack this tick?). Recommendation: turn-consuming, like RuneScape. Eating 20 burgers takes 20 ticks — you're choosing to heal instead of fight for a long time. That's a real decision.

2. **Stat boost discovery or consumption?** When you find a permanent stat-boost item, does it boost immediately on pickup (Zelda model — step on the heart container, HP goes up) or does the player choose when to consume it (Dark Souls boss soul model — bring it to the Library, decide which stat to boost)? Immediate is simpler. Deferred gives the Library more purpose and adds a choice: "Do I boost Muscle or save this for when I have a Library branch nearby?"

3. **Behest's true nature.** LOCKED: Behest is the **Flatwoods Monster** (#6 in the cryptid roster). The ace-of-spades silhouette, metallic "dress" body, glowing eyes, and noxious mist — all hidden behind five distinct human disguises across five Library branches. The Flatwoods Monster's game-zones.md entry describes it as a "stationary sentry that emits noxious mist" — Behest is a sentry of knowledge, and the faint sulfuric smell near every circulation desk is the tell. The reveal recontextualizes a mid-tier cryptid as the most connected NPC in the game: she links the Library (Street), the cryptid menagerie (Circus), and the alien presence (Factory — Flatwoods Monster is West Virginia's alien-adjacent cryptid). Design the reveal as a late-game or NG+ moment, not a mid-game twist. The player who figures it out early is rewarded with dramatic irony, not a cutscene.

4. **Necta side effects.** Should all necta have side effects (risk/reward on every drink) or only Chaos necta? Side effects on all necta create interesting decisions but slow down consumption. Clean effects on most necta with chaos as the exception is simpler. Recommendation: clean effects for Buff and Resistance necta, mild side effects for Element necta (cleansing Sludge slightly ticks Goo, etc.), wild side effects for Chaos necta only.

5. **Book rarity distribution.** How many books total across the full game? How many per zone? How many are required for launch vs. planned for expansion? Recommendation: 20-30 books for the full game (4-6 per zone), with 5-8 in the Sewer + Street for launch. Each book teaches exactly one skill — no multi-book requirements for v1 (simplifies the collection quest).

6. **Can you fight Behest?** She's an NPC in a game where you can attack anyone. What happens if you attack the librarian? Given the Flatwoods Monster reveal, she's a 10-foot-tall alien cryptid with glowing eyes and noxious mist projection hiding inside a cardigan. If you fight her, you're fighting the Flatwoods Monster — at full power, in her own territory, surrounded by her own books. She's read EVERY book. She has EVERY skill. She knows exactly what you're going to do because she cataloged the manual you learned it from. Recommendation: she's the secret superboss. The hardest fight in the game is picking a fight with the librarian.

7. **Violencian as demonym.** Does "Violencian" appear in-game (NPC dialogue, item descriptions, journal entries) or is it a meta/design term? If in-game: it should appear naturally in NPC barks and flavor text, not as a tutorial label. "You're not from around here, are you? Most Violencians know better than to walk Bank Street after dark."
