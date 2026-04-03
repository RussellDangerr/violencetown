# Feature: Fists as Viable Fallback Weapon
**Phase:** Phase 2 — Combat Integration
**Priority:** High
**Status:** Research
**Date:** 2026-04-03

> **Supersedes:** The "bare hands fallback: 1-3 damage" line from combat-health-system.md.
>
> **Connected to:** `plans/unlimited-moves-item-use.md` — Throwing is a free action. If throwing your weapon is free and tactically powerful, the player needs a fallback that isn't trash. This feature closes that loop.

---

## Gate 1: Research & Discovery

### The Design Problem

If throwing weapons and items is free (doesn't consume your turn), the game actively encourages emptying your hands. But if unarmed damage is 1-3 — a wet noodle — then throwing your weapon is a trap. The player will hoard instead of interact.

**The goal:** Make fists a viable fallback that rewards players for throwing aggressively, without making weapons pointless.

### Genre References

1. **Pixel Dungeon** — Unarmed is terrible (1 damage). This actively discourages throwing. Players hoard good items because having nothing equipped is a death sentence. **This is what we're avoiding.**

2. **Dark Souls (bare fist / caestus)** — Unarmed is technically viable but punishing. Speedrunners use fists to prove mastery. The fist isn't good — the PLAYER is good. Interesting but too punishing for Violencetown's tone.

3. **Yakuza series** — Bare-knuckle brawling is the baseline, and it's FUN. Weapons are temporary power spikes you pick up mid-fight and break/throw. The combat loop is: grab weapon → use it → it breaks → back to fists → grab another. **This is the exact energy Violencetown needs.**

4. **Streets of Rage / Final Fight** — Fists are your core moveset. Weapons are power-ups you find on the ground. Throwing a weapon at an enemy is a valid and satisfying choice because your fists still work. **Same loop: fists are home base, weapons are spikes.**

5. **Breath of the Wild** — Weapons break constantly. The game trains you to throw weapons (bonus damage on throw), use whatever's lying around, and never get attached. Link is always fine because the core moveset (dodge, parry) is weaponless. **Violencetown's fists serve the same role as BotW's dodge/parry — the thing that's always there.**

### Player Experience Goal

"Your fists are home. Weapons are tools you pick up, use, and throw. When the chips are down and everything's been thrown, you're still dangerous — just not as dangerous."

---

## Core Design: Fists

### What Fists Are

- **Your creature's natural attack.** Not a weapon. Not an item. Can't be dropped, thrown, stolen, or unequipped.
- **Always available.** Fists are what you attack with when no weapon is equipped. They're the Sides zone — your arms.
- **Viable, not optimal.** Fists should deal ~40-60% of a mid-tier weapon's damage. Enough to kill a rat, enough to finish a wounded bandit, not enough to comfortably fight a boss.
- **NOT a build.** There is no "fist build." No skill tree, no unarmed specialization, no fist-specific rings. Fists are the floor, not a ceiling. Every creature has them (or their equivalent). You don't invest in fists — they just work.

### What Fists Are NOT

- Not a separate weapon class with its own upgrade path
- Not a viable strategy for clearing hard content solo — you CAN, but you're making it harder on purpose
- Not something you "spec into" — no unarmed mastery, no fist damage rings
- Not terrible — the old "1-3 damage" is dead

### Damage Model — LOCKED

**Fists scale with player level. Weapons are flat +damage on top of fists.**

```
FIST DAMAGE = Level × 10

Level 1:  10 damage
Level 2:  20 damage
Level 3:  30 damage
...
Level 10: 100 damage (cap)
```

**Leveling:** 2 levels per boss. 5 zones, 5 bosses. 10 levels total. That's the cap.

| Boss | Zone | Levels Gained | Player Level After |
|------|------|---------------|-------------------|
| Texas Beholdem | Sewer | 1 → 3 | 3 |
| Alien Invasion | Factory | 3 → 5 | 5 |
| The Financier | Town | 5 → 7 | 7 |
| Bigfoot | Circus | 7 → 9 | 9 |
| The Deity | Graveyard | 9 → 10* | 10 (cap) |

*Last boss gives 1 level to hit the cap cleanly.*

**Weapons add flat +damage on top of fists.** A weapon doesn't replace your fists — it adds to them. This is a play on the classic +1/+2/+3 system, but with meaningful numbers:

```
TOTAL MELEE DAMAGE = Fist Damage + Weapon Bonus

Example at Level 3 (fists = 30):
  Bare fists:       30 damage
  Bottle (+2):      32 damage
  Pipe (+5):        35 damage
  Crowbar (+8):     38 damage
  Katana (+15):     45 damage
  Legendary (+25):  55 damage
```

**Weapon bonus spectrum:**

| Rarity | Weapon Bonus | Examples |
|--------|-------------|----------|
| Trash | +1 to +2 | Bottle, stick, shoe |
| Common | +3 to +5 | Pipe, shovel, frying pan |
| Uncommon | +6 to +10 | Crowbar, machete, bat |
| Rare | +11 to +15 | Katana, sledgehammer |
| Epic | +16 to +25 | Named uniques |
| Legendary | +26 to +40 | Hand-crafted specials |

Weapons are clearly meaningful (+5 on a Level 1 character is +50% damage) but your fists are always the foundation. At Level 10 with 100 base damage, a +5 pipe is only +5% — by endgame, your fists ARE the weapon and everything else is gravy. Early game, weapons matter a lot. Late game, you're a monster regardless.

### Thrown Weapon Damage — 2x Weapon Bonus

**Thrown damage = Fist Damage + (Weapon Bonus × 2)**

Throwing a weapon does double its bonus damage. This is the incentive to throw — it's always more damage than swinging, but you lose the weapon.

```
THROWN DAMAGE = Fist Damage + (Weapon Bonus × 2)

Example at Level 3 (fists = 30):
  Throw bottle (+2):     30 + 4  = 34 damage
  Throw pipe (+5):       30 + 10 = 40 damage
  Throw crowbar (+8):    30 + 16 = 46 damage
  Throw katana (+15):    30 + 30 = 60 damage
  Throw legendary (+25): 30 + 50 = 80 damage
```

| Weapon | Melee (L3) | Thrown (L3) | Throw Gain | Worth Throwing? |
|--------|-----------|-------------|------------|-----------------|
| Bottle (+2) | 32 | 34 | +2 | Yes — it's garbage, toss it |
| Pipe (+5) | 35 | 40 | +5 | Yes — decent spike for a common weapon |
| Crowbar (+8) | 38 | 46 | +8 | Situational — good burst, hate to lose it |
| Katana (+15) | 45 | 60 | +15 | Only to finish a tough enemy |
| Legendary (+25) | 55 | 80 | +25 | NEVER... unless it's life or death |

The pattern: throwing is always better damage per hit, but you lose the weapon and fall back to fists. Higher-bonus weapons have a bigger absolute throw gain, making the decision more agonizing. "Do I throw my +15 katana for 60 damage and finish this boss, or keep swinging for 45?"

### Stack Throwing (Future Consideration)

Throwing multiple items in one turn (stacking free-action throws) could get out of hand:

```
Level 3, throw 5 bottles in one turn:
  5 × 34 = 170 damage in free actions alone
```

That's probably too much. **Stack throwing may need a cap or diminishing returns** — but we'll cross that bridge later. For now, the system works because inventory size is the natural limiter (you can only throw what you're carrying).

### Creature-Specific Fists

Every creature's "fists" reflect their anatomy. Same damage formula, different flavor:

| Creature | "Fists" | Flavor |
|----------|---------|--------|
| **Human** | Fists | Straight punches, hooks. Bread and butter. |
| **Wererat** | Claws & Bite | Scrappy, fast, dirty. |
| **Robot** | Metal Fists | Mechanical precision. Satisfying clang. |
| **Clown** | Slap & Shove | Slapstick wind-up. Comedy sound effects. |
| **Skeleton** | Bone Strikes | Bony cracks. Detachable arm swing? |

All creatures use the same `Level × 10` formula. No creature variance on fist damage — the difference is purely cosmetic and animation. Balance lives in the level system, not creature selection.

### How This Encourages Throwing

The combat loop at Level 3 (fists = 30):

```
1. You have a crowbar (+8) and a frying pan (+5)
2. A bandit blocks the alley. A rat flanks from behind.
3. FREE ACTION: Throw frying pan at the rat (40 damage — chunks it)
4. TURN ACTION: Move toward bandit, attack with crowbar (38 damage)
5. Next turn: throw crowbar at fleeing bandit (46 damage — finishes him)
6. Now you're at fists (30 damage). Still very much in the fight.
7. Pick up pipe from dead rat → FREE ACTION: pick it up
8. Back to 35 damage. The cycle continues.
```

Without viable fists, step 3 never happens. With 30 base damage, throwing is a tactical choice — you're trading a +5 to +8 bonus for a burst of double that. The fists underneath keep you dangerous.

### Fists and the Wealth = Danger System

Fists have **zero wealth value.** They add nothing to your threat score.

This creates an interesting dynamic: a player who throws everything and fights with fists has a LOW threat score. The city sends weaker enemies. A player hoarding Epic weapons has a HIGH threat score. The city escalates.

Throwing your weapons away is literally de-escalation. You're choosing to be less dangerous so the world is less dangerous to you. Until you need that weapon back.

### Fists and the 5-Zone Body System

Fists are inherently tied to the **Sides zone** (arms). This means:

- Arm armor affects your fist damage (gauntlets, brass knuckles could boost fist damage slightly — but these are equipment items, not a "fist build")
- Arm damage (Sides zone HP depleted) degrades your fist effectiveness
- If your arms are destroyed (prosthetics system), your fists change based on what replaces them

This is organic. Fists aren't a separate system — they're just what your arms do when they're not holding something.

### What About Rings?

Rings DON'T buff fists specifically. There's no "Ring of Punching" or "Unarmed Mastery Chip."

However, rings that buff **all melee damage** or **attack effects** (fire trail, sludge coat) work with fists too. If you have 3 Fire Rings and your fist attack leaves a fire trail, that's emergent — not a fist build. It's a fire build that happens to work with fists.

This prevents "unarmed vs armed" as a build dichotomy. You don't choose fists. You fall back to fists. And if your ring setup happens to make your fists leave a trail of fire, that's a happy accident.

---

## Interaction with Throwing Economy

### The Throw → Fist → Pickup Loop

This is the core micro-loop that makes combat feel like Yakuza / BotW:

```
FULL INVENTORY:
  [Crowbar] [Frying Pan] [Bottle] [Bandage]

Turn 1: Throw bottle at enemy A (free action) → move toward enemy B (turn action)
Turn 2: Throw frying pan at enemy C (free action) → attack enemy B with crowbar (turn action)
Turn 3: Crowbar breaks → punch enemy B with fists (turn action)
Turn 4: Pick up pipe from dead enemy A (free action) → attack with pipe (turn action)

INVENTORY NOW:
  [Pipe] [Bandage]
```

The inventory cycles. Weapons are consumed through use and throwing. Fists bridge the gaps. New weapons are scavenged from the environment and fallen enemies. **The environment IS your moveset** — and fists are what you have when the environment is bare.

### Thrown Weapon Damage

Thrown weapons should deal **bonus damage** on impact (1.2x–1.5x their melee damage) to reward throwing:

| Weapon | Melee Damage | Thrown Damage | Worth Throwing? |
|--------|-------------|---------------|-----------------|
| Bottle | 4 | 6 (1.5x) | Yes — it's garbage, throw it |
| Pipe | 8 | 10 (1.25x) | Situational — decent melee weapon |
| Crowbar | 12 | 15 (1.25x) | Only in desperation or to finish a kill |
| Katana | 20 | 24 (1.2x) | Almost never — too valuable to lose |
| Legendary | 40 | 48 (1.2x) | NEVER... unless you really need to |

The throw multiplier is higher on cheap weapons. This naturally creates the right incentive: throw the trash, keep the good stuff, fall back to fists when you've thrown everything.

---

## Design Decisions — LOCKED

- **Fist damage = Level × 10.** Level 1 = 10, Level 10 = 100. Simple, significant numbers.
- **Level cap is 10.** 2 levels per boss, 5 bosses. That's it.
- **Weapons are +damage on top of fists.** Not replacement damage. Additive bonus.
- **Thrown weapons do 2× their weapon bonus.** Always more damage than swinging, but you lose the weapon.
- **Fists are not a build.** No specialization, no skill tree, no dedicated rings.
- **All creatures use the same fist formula.** No creature-specific fist damage variance. Difference is cosmetic/animation only.
- **Every creature has a fist equivalent.** Claws, metal fists, slaps, bone strikes. Same math, different flavor.

## Design Decisions — OPEN

- **Stack throwing balance** — Multiple free-action throws per turn could spike damage. May need a soft cap or diminishing returns. Start uncapped, playtest.
- **Can brass knuckles / gauntlets add to the weapon bonus?** Leaning yes — they'd be a Sides-zone equipment that gives a small +damage that stacks with fists and doesn't get thrown away.
- **Skeleton arm throw** — Can the Skeleton literally throw its own arm as a weapon and fight one-armed until it picks it back up? Peak comedy, fits the creature's One Cool Thing design space. TBD.
- **Do thrown weapons land on the target tile for retrieval?** Leaning yes.

---

## Open Questions (For Gate 2)

- Enemy HP pools need to be designed around this damage curve (Level 1 doing 10 fist damage means early enemies need HP in the 30-80 range to create 3-8 hit fights)
- Do fists have a unique animation per creature, or reuse the attack animation with no weapon sprite?
- How does fist damage interact with the 5-zone system? (Position-based targeting like weapons, presumably)
- Does the Smooth Talker creature even HAVE fists? Or is their "fallback" something dialogue-based?
- How does the +damage system display in UI? "Crowbar (+8)" in inventory? Damage preview in action tree?
