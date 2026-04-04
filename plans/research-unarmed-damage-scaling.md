# Research: Unarmed Damage Scaling Across Games
**Purpose:** Inform Violencetown's fist damage system with concrete numbers from games that make punching feel good
**Date:** 2026-04-04
**Connected to:** `plans/fists-fallback-weapon.md`

---

## 1. Unarmed Scaling in RPGs — What Works

### D&D 5e Monk — The Gold Standard for Tabletop

The Monk's martial arts die scales with level:

| Level | Damage Die | Average | Equivalent Flat |
|-------|-----------|---------|-----------------|
| 1–4 | 1d4 + DEX | 2.5 + 3–5 | ~6 |
| 5–10 | 1d6 + DEX | 3.5 + 4–5 | ~8 |
| 11–16 | 1d8 + DEX | 4.5 + 5 | ~10 |
| 17–20 | 1d10 + DEX | 5.5 + 5 | ~11 |

**What makes it work:** Flurry of Blows (spend 1 ki to make 2 bonus unarmed attacks). At Level 5 with Extra Attack, a Monk throws 4 punches per turn: 2 normal + 2 Flurry. The damage PER HIT is modest, but the VOLUME is high. At Level 5: 4 × 8 avg = 32 damage/turn vs a Fighter's greatsword at 2 × 11.5 = 23/turn.

**Key insight for Violencetown:** The Monk doesn't hit harder — it hits MORE OFTEN. Volume over power. We don't want ki points, but the principle of "fists are fast, weapons hit harder per swing" is relevant.

**What's clunky:** Ki points are a resource that runs out. Monks feel amazing at full ki and pathetic at zero. Violencetown's system avoids this correctly — fists just work, no resource.

### Fallout: New Vegas — The Fist-to-Power-Fist Pipeline

Unarmed weapon damage values (base, before skills/perks):

| Weapon | Damage | DPS | Notes |
|--------|--------|-----|-------|
| Bare Fists | 1 | ~3 | Genuinely terrible |
| Boxing Gloves | 1 | ~4 | Joke weapon |
| Spiked Knuckles | 6 | ~18 | First "real" unarmed weapon |
| Power Fist | 40 | ~80 | Pneumatic gauntlet — this is where unarmed gets real |
| Ballistic Fist | 80 | ~133 | Shotgun shells in a glove. Absurd. Best unarmed weapon. |
| Displacer Glove | 50 | ~75 | Energy damage fist |

**The scaling ratio:** Bare fists (1) to Ballistic Fist (80) = **80× multiplier.** Fists are genuinely useless. The real damage comes from unarmed WEAPONS.

**What makes it work:** Fallout NV treats unarmed as a weapon class with its own progression, not as "no weapon." The Power Fist is the moment unarmed "clicks" — it's the first weapon that competes with guns. The game also adds special VATS moves (Ranger Takedown, Scribe Counter, Khan Trick) that give unarmed unique tactical options.

**Key insight for Violencetown:** Bare fists in Fallout are TERRIBLE (1 damage). The game makes unarmed viable through unarmed WEAPONS, not through bare fists scaling. This is the opposite of what we want — our fists need to be the foundation, not the joke.

**What to avoid:** The 1-to-80 gap. A player should never feel like their base attack is worthless. Violencetown's Level × 10 formula already prevents this.

### Kenshi — Unarmed Becomes Overpowered at Endgame

Martial Arts damage formula: `(2.5 + 0.075 × MA_Skill) + (that) × (0.1 × Strength) + (that) × (0.08 × Toughness)`

| MA Skill | Approx Damage (with 50 STR, 50 TGH) | vs Weapons |
|----------|--------------------------------------|------------|
| 1 | ~5 | Pathetic. Weapons are 5-10× better. |
| 30 | ~15 | Getting viable. Still worse than weapons. |
| 50 | ~25 | Competitive with mid-tier weapons. |
| 80 | ~55 | Better than most weapons. |
| 100 | ~85+ | Overpowered. Wins 7/10 vs max-skill weapon users. |

**The scaling curve:** Exponential growth because MA skill multiplies with STR and TGH. Low levels are pathetic, high levels are broken. At max level, unblockable leaping kicks make unarmed the best option.

**Key insight for Violencetown:** Kenshi proves that unarmed SHOULD scale to be very strong at endgame, but the journey needs to feel rough early. The community considers this balanced because "it's one PITA to get up to said levels." Violencetown's boss-gated leveling serves the same purpose — you earn your fist power.

**What to steal:** The feeling of MA going from "why am I punching things" to "I am a god with my bare hands" over a long arc.

### Path of Exile — Facebreaker (Making Unarmed Competitive Through Multipliers)

- Base unarmed damage: ~2–6 physical (terrible)
- Facebreaker unique gloves: **(600–800)% MORE physical damage with unarmed attacks**
- At 800% with flat physical damage from rings/gear: unarmed competes with endgame weapons

**Key insight for Violencetown:** PoE makes unarmed viable through a single massive multiplier item, not through inherent scaling. The character isn't strong — the GLOVES are strong. This is the "brass knuckles" approach. Violencetown's system is better — fists scale intrinsically through levels, not through gear dependency.

### WoW Windwalker Monk — Combo Variety, Not Combo Points

**Mastery: Combo Strikes** — Your abilities deal **~19% more damage** when they are NOT a repeat of the previous ability. Use the same ability twice in a row = no bonus.

**What this creates:** A rhythm of constantly varying your attacks. Jab → Tiger Palm → Blackout Kick → Rising Sun Kick — never repeat. The gameplay is about VARIETY of strikes, not building/spending a resource.

**Key insight for Violencetown:** This is applicable to our turn-based system. The PRINCIPLE — rewarding the player for doing different things — maps to our throw-then-punch-then-pickup loop. Each turn you're naturally doing something different: throw (free action), punch (turn action), next turn pickup (free action), swing weapon (turn action). The variety is baked into the system without needing a mastery mechanic.

### Yakuza Series — Brawling as the Core Identity

Yakuza 0's Brawler Style (Kiryu's default):
- Base punches are your bread and butter — always available
- Weapons are picked up from the environment and BREAK after use
- Heat Gauge builds from landing hits and not getting hit
- Heat Actions are devastating finishers that spend the gauge
- Brawler starts slow and sloppy but becomes the STRONGEST style at endgame through upgrades

**Damage scaling:** Not raw numbers but MOVE UNLOCKS. Kiryu doesn't punch harder — he learns new moves (counter throws, combo extensions, heat finishers). A maxed Brawler has 3× the tactical options of a starter Brawler, not 3× the damage.

**Key insight for Violencetown:** The Yakuza model of "fists are home, weapons are temporary spikes you grab and break" is EXACTLY Violencetown's throw loop. The Heat Gauge concept — building power from sustained aggression — maps to a potential berserk/momentum system.

### God Hand — Dynamic Difficulty as Fist Scaling

God Hand has 4 difficulty levels (1, 2, 3, Die) that shift dynamically based on player performance:

- **Level goes UP** when you land hits without getting hit (playing well)
- **Level goes DOWN** when you get hit repeatedly (playing poorly)
- At Level Die: enemies are fast, aggressive, attack in groups, can kill you in a few hits
- The player's damage doesn't change — the WORLD scales to match you

**Key insight for Violencetown:** God Hand doesn't scale the player's fists — it scales the enemies. Violencetown's Wealth = Danger system already does this. The synergy: stronger fists (from leveling) + more items (from hoarding) = higher danger. Throwing everything away and fighting with fists = lower danger. The fist system IS the difficulty control.

---

## 2. Berserk / Low-HP Rage Mechanics — Concrete Numbers

### Pokemon Pinch Abilities (Blaze / Torrent / Overgrow)

- **Threshold:** 1/3 HP or less (33%)
- **Bonus:** 1.5× damage (50% boost) to type-matching moves only
- **Why it works:** Simple, binary (on/off), meaningful but not game-breaking. 50% is noticeable without being dominant.
- **Risk balance:** At 1/3 HP, one more hit probably kills you. The boost is a "this might save you" moment, not a strategy to build around.

### PAYDAY 2 Berserker

- **Threshold:** Activates below 50% HP, scales linearly to 0% HP
- **Melee bonus:** 1.0× at 50% HP → **3.5× at ~0% HP** (250% bonus)
- **Ranged bonus:** 1.0× at 50% HP → **2.0× at ~0% HP** (100% bonus)
- **At 10% HP:** ~1.8× melee damage
- **Why it works (and breaks):** Linear scaling means the LOWER you go, the more you're rewarded. Players intentionally tank to low HP and become melee monsters. This IS the dominant strategy for melee builds.
- **Risk balance:** There isn't much. PAYDAY 2 has armor and health kits that let you sustain at low HP. The berserker meta is "stay at 1 HP, deal 3.5× damage."

**Warning for Violencetown:** PAYDAY's Berserker has no real downside once you learn to manage low HP. If Violencetown's berserk is too strong, players will intentionally dump HP to live in berserk mode permanently.

### Fire Emblem — Wrath (Low-HP Critical Boost)

Varies by game, and the series kept NERFING it because it was too strong:

| Game | Threshold | Bonus | Verdict |
|------|-----------|-------|---------|
| Genealogy of the Holy War | 50% HP | Guaranteed critical hit | Busted |
| Path of Radiance | 50% HP | +50 to critical rate | Very strong |
| Radiant Dawn | 30% HP | +50 to critical rate | Balanced (lower threshold) |
| Awakening | 50% HP | +20 to critical rate | Weak (nerfed bonus) |

**Key insight:** They kept nerfing Wrath because guaranteed crits at 50% HP was too dominant. The sweet spot seems to be: **low threshold (25-33%) + moderate bonus (~50% damage, not guaranteed crit).**

### Slay the Spire Ironclad — Strength Stacking

- **Strength:** +1 damage per point, per hit. Multi-hit attacks multiply this.
- **Rupture (power card):** Gain 1 Strength every time you lose HP on your turn
- **Limit Break:** Doubles current Strength. Upgraded = reusable. Infinite scaling potential.
- **Endgame scenario:** 20+ Strength → Limit Break → 40 → Whirlwind (hits 5×) = absurd damage

**Key insight:** "Take damage to get stronger" creates amazing desperation moments. But it requires multi-hit attacks to feel impactful. In Violencetown's one-attack-per-turn system, flat damage bonuses work better than multiplicative stacking.

### Summary: Best Berserk Numbers for Violencetown

| Game | Threshold | Bonus | Too Strong? |
|------|-----------|-------|-------------|
| Pokemon | 33% HP | 1.5× | No — sweet spot |
| PAYDAY 2 | 50% scaling to 0% | Up to 3.5× melee | YES — dominates |
| Fire Emblem (modern) | 50% HP | +20 crit | Too weak for us |
| Fire Emblem (classic) | 50% HP | Guaranteed crit | YES — too binary |

### Recommendation: Berserk for Violencetown

**Pokemon's model, tuned for Violencetown's vibe.**

```
BERSERK: Below 20% HP → 1.5× fist damage (fists only, not weapons)

Level 5 example:
  Normal fists:   50 damage
  Berserk fists:  75 damage
  Fists + Rare weapon (+15): 65 damage (no berserk — weapons don't get it)
  Berserk fists + Rare weapon: 75 + 15 = 90 damage (berserk applies to base only)
```

**Why 20% and not 33%:**
- 20% is lower than Pokemon's 33%, making it harder to camp in berserk mode
- At 20% HP, you're one or two hits from death — this is genuine desperation
- The 1.5× on fists ONLY means it doesn't make weapons better. It makes FISTFIGHTING better when you're out of options

**Why fists only:**
- Berserk rewards the player who has THROWN EVERYTHING and is fighting bare-handed
- If berserk boosted weapon damage too, there'd be no reason to throw your weapons — just tank to 20% and swing your Legendary
- Fists-only berserk creates the fantasy: "inventory empty, back against the wall, swinging haymakers to survive"

**Anti-camping measures:**
- 20% HP is genuinely dangerous (1-2 hits from death in most scenarios)
- No healing during berserk? Or: healing above 20% HP immediately ends berserk
- The 5-zone body system means individual ZONES can be at 20%, not just total HP. Berserk could trigger when ANY zone is below 20%, creating interesting positioning decisions

---

## 3. Creature Differentiation — How Games Make Different Bodies Fight Differently

### D&D Racial Unarmed Attacks

Different races get different natural weapons with different damage AND damage types:

| Race | Attack | Damage | Type | Special |
|------|--------|--------|------|---------|
| Human | Fists | 1 + STR | Bludgeoning | Nothing special |
| Tabaxi | Claws | 1d4 + STR | Slashing | — |
| Lizardfolk | Bite | 1d6 + STR | Piercing | Can eat dead creatures to heal |
| Minotaur | Horns | 1d6 + STR | Piercing | Bonus action dash + gore |

**Key insight:** Damage TYPE matters as much as damage AMOUNT. Slashing vs bludgeoning vs piercing interact differently with armor types.

### Monster Hunter — Weapon Feel Through Speed vs Power

MH differentiates weapons not by damage numbers but by FEEL:

| Archetype | Speed | Damage/Hit | Mobility | Fantasy |
|-----------|-------|------------|----------|---------|
| Dual Blades | Very fast | Low per hit | High | Death by 1000 cuts |
| Great Sword | Very slow | Massive per hit | Low | One perfect hit |
| Hammer | Medium | High per hit | Medium | Stagger and stun |
| Lance | Medium | Medium per hit | Low (guarded) | Turtle and poke |

**Key insight:** In a turn-based system where everyone gets one attack per turn, speed doesn't differentiate. But SECONDARY EFFECTS can: knockback, stagger, bleed, area damage.

### Proposed Creature Differentiation (Revised)

All creatures use the same `Level × 10` base fist damage. The difference is **secondary properties and natural defenses**, not raw damage:

| Creature | Fists Flavor | Fist Secondary Effect | Throw Style | Base Armor | Unique Trait |
|----------|-------------|----------------------|-------------|------------|-------------|
| **Human** | Punches | None — pure baseline | Standard (accurate) | 0 (squishy) | Jack of all trades |
| **Wererat** | Claws & Bite | Bleed (small DoT) | Erratic (short range, usable from 1-tile gaps) | 2 (thick hide) | Squeezes through gaps |
| **Robot** | Metal Fists | Stagger (target loses a free action) | Heavy (longer range, heavier arc) | 5 (metal plating) | Immune to sludge |
| **Clown** | Slaps | Knockback 1 tile (slapstick shove) | Trick throw (bounces off walls?) | 1 (costume padding) | Honk stun ability |
| **Skeleton** | Bone Strikes | Rattle (chance to frighten — NPC skips turn) | Throw own arm (detach + retrieve) | 0 (no flesh, but immune to bleed) | Reassembles from damage |

**Design note:** Secondary effects are subtle flavor. They don't change the core math — fists are still Level × 10. They add tactical personality without separate balance passes.

### Base Armor as the Real Differentiator

Rather than different fist damage, **base armor** is where creatures diverge meaningfully:

```
EFFECTIVE DURABILITY (same HP pool):

  Human (0 armor):    Every hit lands full damage. Glass cannon.
  Clown (1 armor):    Trivial reduction. Still squishy.
  Wererat (2 armor):  Reduces trash weapon damage (bottles, sticks) to near-nothing. Shrugs off weak hits.
  Robot (5 armor):    Common weapons (+3 to +5) are nearly nullified. Need uncommon+ to hurt a Robot.

Against a Level 3 player (fists = 30) swinging a pipe (+5 = 35 total):
  vs Human:   35 - 0 = 35 damage
  vs Wererat: 35 - 2 = 33 damage (minimal difference)
  vs Robot:   35 - 5 = 30 damage (meaningful reduction)

Against bare fists (30 total):
  vs Human:   30 - 0 = 30 damage
  vs Robot:   30 - 5 = 25 damage
```

Armor matters MORE when weapon bonuses are small. At endgame with Level 10 fists (100 damage), 5 armor is a rounding error. This naturally keeps armor relevant early and less dominant late — which is correct because endgame should be about rings, positioning, and zone targeting, not armor stacking.

---

## 4. Turn-Based "Combo" Systems — Sequential Hit Bonuses Without Real-Time

### Slay the Spire — Strength as Momentum

Every Strength point adds +1 per hit, and multi-hit cards multiply it. The "combo" is building Strength through the fight and cashing it in with Whirlwind/Heavy Blade. **Turn-based momentum through persistent buffs, not button sequences.**

### Darkest Dungeon 2 — Combo Tokens

DD2 uses tokens: a "Combo" token can be applied to an enemy, and subsequent attacks that consume the token deal bonus damage. The loop: one character applies Combo (setup), another character consumes it (payoff). **Sequential cooperation between actions, not rapid inputs.**

### WoW Windwalker — Variety Bonus

19% more damage when your current ability differs from your last. Encourages cycling through your full toolkit. **Reward variety, punish repetition.**

### What Works for Turn-Based Violencetown

The game already has a natural combo rhythm through the free-action system:

```
Turn 1: Throw bottle (free) → punch (turn) = 2 actions, 2 different things
Turn 2: Pick up pipe (free) → swing pipe (turn) = new weapon, new feel
Turn 3: Throw pipe (free) → kick (turn, different from punch?) = variety
```

A formal combo system might be overkill. The throw → punch → pickup loop IS the combo. But if we wanted something:

**Momentum (simple, passive):** Each consecutive turn you deal damage without taking damage, gain +5 fist damage (stacks up to 3 times, +15 max). Getting hit resets to 0. This creates the "on a roll" feeling without any resource management.

```
Turn 1: Hit bandit. Momentum = 1 (+5 fist damage)
Turn 2: Hit bandit. Momentum = 2 (+10 fist damage)
Turn 3: Hit bandit. Momentum = 3 (+15 fist damage, capped)
Turn 4: Bandit hits you. Momentum = 0 (reset)
```

This rewards aggressive play and creates dramatic stakes: "I'm on a 3-stack, if I get hit I lose my bonus." It also makes berserk more interesting: at 20% HP with 3 momentum stacks, a Level 5 character does (50 × 1.5) + 15 = 90 damage with bare fists. That's a haymaker.

**Status: CONSIDER, DON'T LOCK.** Momentum is an idea worth playtesting but shouldn't be committed to yet.

---

## 5. Summary — What This Means for Violencetown

### What We're Stealing

| Source | What We're Taking | How It Applies |
|--------|------------------|----------------|
| **D&D Monk** | Volume over power — fists hit more often (via free-action throws + fist attack) | Throw is free, punch is turn. Two "hits" per turn. |
| **Yakuza** | Fists are home, weapons are temporary. Heat gauge = earned power. | Throw-pickup-punch loop. Berserk as earned power at low HP. |
| **Kenshi** | Unarmed scales from pathetic to godlike over the full game | Level × 10: Level 1 = 10 (rough), Level 10 = 100 (dominant). |
| **Pokemon** | Simple binary berserk: threshold + flat multiplier | Below 20% HP → 1.5× fist damage. On/off. No scaling. |
| **God Hand** | The world scales to you, not you to the world | Wealth = Danger already does this. Fists + no gear = low threat. |
| **PoE Facebreaker** | Unarmed CAN compete with weapons given the right multiplier | Our level scaling IS the multiplier. No gear dependency needed. |

### What We're Avoiding

| Source | What We're Rejecting | Why |
|--------|---------------------|-----|
| **D&D Monk** | Ki points as a resource | No resources. Fists just work. |
| **Fallout NV** | Bare fists as trash (1 damage) | Fists are the foundation, not the joke. |
| **PAYDAY 2** | Linear scaling berserk up to 3.5× | Too exploitable. Binary on/off is safer. |
| **Oblivion/Skyrim** | Unarmed as a dead-end non-build | Fists scale with level, not with a skill tree that doesn't exist. |
| **Any game** | Chi/ki/mana/focus points for unarmed | No. Fists just work. Always. No resource. |

### The Complete Fist System (Updated)

```
BASE FIST DAMAGE:     Level × 10  (10 at Level 1, 100 at Level 10 cap)
WEAPON BONUS:         +flat damage on top of fists
THROWN WEAPON:         2× weapon bonus
BERSERK (below 20%):  1.5× FIST damage only (not weapon bonus)
MOMENTUM (maybe):     +5 per consecutive hit-without-getting-hit, caps at +15

Level 5, bare fists, full health:         50 damage
Level 5, pipe (+5), full health:          55 damage
Level 5, throw pipe:                      50 + 10 = 60 damage
Level 5, bare fists, berserk:             75 damage
Level 5, bare fists, berserk, momentum 3: 75 + 15 = 90 damage (haymaker fantasy)
Level 5, legendary (+25), full health:    75 damage (same as berserk fists — intentional)
```

The numbers tell a story: a Level 5 player fighting bare-knuckle at death's door with momentum stacks is as dangerous as someone with a legendary weapon at full health. That's the fantasy. That's the haymaker moment.

---

## Sources

- [D&D 5e Monk — D&D Beyond](https://www.dndbeyond.com/classes/11-monk)
- [Fallout: New Vegas Unarmed — Fallout Wiki](https://fallout.fandom.com/wiki/Unarmed_(Fallout:_New_Vegas))
- [Kenshi Martial Arts — Kenshi Wiki](https://kenshi.fandom.com/wiki/Martial_Arts)
- [Path of Exile Facebreaker — PoE Wiki](https://www.poewiki.net/wiki/Facebreaker)
- [PAYDAY 2 Berserker — Payday Wiki](https://payday.fandom.com/wiki/Berserker)
- [WoW Mastery: Combo Strikes — Wowhead](https://www.wowhead.com/spell=115636/mastery-combo-strikes)
- [Fire Emblem Wrath — Fire Emblem Wiki](https://fireemblem.fandom.com/wiki/Wrath)
- [Critical Status Buff — TV Tropes](https://tvtropes.org/pmwiki/pmwiki.php/Main/CriticalStatusBuff)
- [God Hand Difficulty Level — God Hand Wiki](https://godhandcapcom.fandom.com/wiki/Difficulty_Level)
- [Slay the Spire Strength — StS Wiki](https://slay-the-spire.fandom.com/wiki/Strength)