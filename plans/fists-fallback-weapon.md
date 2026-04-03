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

### Damage Model

```
WEAPON DAMAGE SPECTRUM (flat, no RNG):

Fists:           5-8  (creature-dependent)
Common weapons:  8-12  (pipe, bottle, shovel)
Uncommon:       12-18  (crowbar, machete, bat)
Rare:           18-25  (katana, sledgehammer)
Epic:           25-35  (named uniques)
Legendary:      35-50  (hand-crafted specials)

Fists vs mid-tier weapon: ~40-60% damage
Fists vs common weapon:  ~60-80% damage
```

Fists aren't embarrassing. A 6-damage punch against a rat with 20 HP means 3-4 hits to kill. You can do it. A crowbar does it in 2. That's the difference — efficiency, not capability.

### Creature-Specific Fists

Every creature's "fists" reflect their anatomy. Same role, different flavor:

| Creature | "Fists" | Base Damage | Flavor |
|----------|---------|-------------|--------|
| **Human** | Fists | 6 | Straight punches, hooks. Bread and butter. |
| **Wererat** | Claws & Bite | 7 | Faster, scrappier. Rats fight dirty. |
| **Robot** | Metal Fists | 8 | Hardest hitting base. No pain, no hesitation. |
| **Clown** | Slap & Shove | 5 | Weakest damage, but could have knockback/daze (comedy). |
| **Skeleton** | Bone Strikes | 6 | Detachable arm swing? Throw your own arm, it comes back? |

The variance is small (5-8 range). This isn't a balance lever — it's flavor. The Robot hits slightly harder bare-handed because it's made of metal. The Clown hits softer because slapstick. No creature's fists are so good that weapons don't matter.

### How This Encourages Throwing

The combat loop this creates:

```
1. You have a crowbar (12 damage) and a frying pan (10 damage, throwable)
2. A bandit blocks the alley. A rat flanks from behind.
3. FREE ACTION: Throw frying pan at the rat (10 damage — one-shots it)
4. TURN ACTION: Move toward bandit, attack with crowbar (12 damage)
5. Next turn: crowbar breaks / you throw it at a fleeing enemy
6. Now you're at fists (6 damage). You're still in the fight.
7. You see a pipe on the ground from the dead rat → FREE ACTION: pick it up
8. Back in business.
```

Without viable fists, step 3 never happens. The player hoards both weapons because being empty-handed is a death sentence. With viable fists, throwing is a tactical choice, not a gamble.

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

- **Fists are not a build.** No specialization, no skill tree, no dedicated rings.
- **Fists can't be improved directly.** No "upgrade your fists" mechanic. Arm equipment (gauntlets) can passively boost them, but you're equipping armor, not leveling fists.
- **Fists scale with creature, not with player progression.** Your fists do 6 damage at minute 1 and 6 damage at hour 10. Weapons scale with rarity. Fists are the constant.
- **Every creature has a fist equivalent.** Claws, metal fists, slaps, bone strikes. Same system, different flavor text and animation.

## Design Decisions — OPEN

- **Do fists have any special property?** Speed (attack twice per turn)? Probably not — keep it simple. Fists are just damage.
- **Can brass knuckles / gauntlets boost fist damage?** Leaning yes, as a natural Sides-zone equipment effect. But this is equipment, not a fist upgrade.
- **Skeleton arm throw** — Can the Skeleton literally throw its own arm as a weapon and fight one-armed until it picks it back up? Peak comedy, fits the creature's One Cool Thing design space. TBD.

---

## Open Questions (For Gate 2)

- Exact fist damage numbers per creature (the 5-8 range above is placeholder — needs balancing against actual enemy HP pools)
- Do fists have a unique animation per creature, or reuse the attack animation with no weapon sprite?
- How does fist damage interact with the 5-zone system? (Fists always hit Front? Or position-based like weapons?)
- Does the Smooth Talker creature even HAVE fists? Or is their "fallback" something dialogue-based?
- Thrown weapon retrieval — can you pick thrown weapons back up from the ground? (Probably yes — they land on the target's tile)
