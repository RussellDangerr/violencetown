# The Violencetown Gold Standard — combat & balancing spec

**Status:** Adopted — Laws 0–4 and 6 implemented via `plans/gold-standard-implementation.md`
(Tasks 1–13, branch `feature/gold-standard`). Law 5 (boss spending) and the deferred hooks below
await the first boss build. Open design rulings are collected at the end of `plans/balancing-bible.md`.
**Date:** 2026-07-23
**Supersedes:** the combat-math sections of `plans/combat-health-system.md` (its genre research and
"chess, not slot machines" goal carry forward unchanged; its 2026-03-30 "flat 100 HP is superseded"
note is REVERSED by this spec — see Open Hooks for how the 5-Zone Body survives).
**Source research:** reverse-engineering study of SimulationCraft + wowsims (the two open-source WoW
combat simulators) — full report in the session artifact "The Sim Is the Spec." The transferable
findings (budget systems, additive-vs-multiplicative buckets, one-pipeline discipline, golden-diff
testing) are adapted here to a deterministic game; the Monte Carlo machinery is deliberately NOT
imported because Violencetown has no dice to average over.

---

## The idea in one paragraph

Everyone has 100 HP, and gold is pegged to hitpoints at 1 GP ≈ 1 HP. Those two facts make every
number in combat legible: a damage splat is a percentage, a price is a damage forecast, and an
enemy's visible gold is his budget for bullshit. One number — the wallet — plays three roles at
once: the **design budget** (how much power this enemy is allowed), the **combat fuel** (what he can
spend mid-fight on heals, summons, and phase moves), and the **loot** (whatever's left when he
dies). WoW hides its item-budget math in internal tables; Violencetown wears it on the enemy's
nameplate.

---

## The Laws

### Law 0 — The Hundred
Every combatant has exactly **100 HP**: player, grunt, knight, boss, summoned lion. HP is not a
stat — it is the **unit of measure**. Nothing modifies max HP, ever. All durability
differentiation lives in mitigation (armor, resistances, immunities) and behavior.

- Payoff: every damage number is self-interpreting. Hit the armored knight for 2 and you know
  *exactly* how strong he is, because you know he has 100 like everyone else.
- **No exceptions — fragility is negative armor (amended 2026-07-24, repeals the Vermin
  exception).** Rats and townsfolk carry 100 HP like everyone else; their softness lives in
  **negative armor** (Law 3) — `max(1, hit − armor)` already adds the deficit, so hitting a 1 on a
  −10 rat deals 11, and a reference swing against −80 one-shots. The denominator never changes;
  the splat shows the bonus. `vermin: true` survives as a ROLE marker (ambient swarm class,
  challenge GP ≤ 5) but no longer licenses sub-100 HP.
- Code note: the Enemy ctor defaults `hp = 100`; the Law 0 lint flags ANY non-100 combatant, no
  exemptions.

### Law 1 — The Peg
**1 GP ≈ 1 HP** is the market rate for *lazy* violence. Autonomous gold solutions — bribes,
mercenary summons — clear a basic enemy at ~100 GP. Per-cast skill (aiming, positioning, risk) buys
rates *above* peg; nothing autonomous may beat it.

The peg keys on **autonomy, not gating**. A gate alone earns nothing — every trick in `TRICKS` is
gated behind gear (Ray Blast ← Ray Gun, Hire a Lion ← Lion Whip, Rat Form / Ember Rat ← rings), so
"gated" doesn't distinguish anything. What earns above-peg is skill spent *per use*: a bolt you must
aim every cast is skill expression; a summon that fights on its own after one purchase is not, and
is priced at peg however it was unlocked.

The exchange-rate ladder (current + retuned content):

| Route                              | Rate               | Why it's allowed                                          |
|------------------------------------|--------------------|-----------------------------------------------------------|
| Bribe / buyout                     | ~1:1 remaining HP  | Zero skill, zero risk — pure peg                          |
| Hire a Lion (retuned: 50 GP)       | 1:1 (50 total dmg) | Gated behind Lion Whip, but priced at peg — autonomy costs no skill |
| Ray Blast (6 GP → 18 dmg)          | 3:1                | Gated: Ray Gun equipped + aim                             |
| Cleave into 3 enemies              | 2× weapon, free    | Positioning is the payment                                |
| Spin fully surrounded              | 3.2× weapon, free  | Risk is the payment                                       |

MP is the *renewable* skill currency (regenerates per turn), so spell efficiency prices in
opportunity-turns, not gold: spells sit at **1.5–2.5 dmg per MP** (AoE justifies the top of the
band). GP is the *non-renewable* solvency currency: per-cast tricks must beat spells' raw rate
(**≥ 2.5 dmg per GP**) to justify spending real money.

The peg is a **target rate, not just a ceiling** — the autonomous band is **0.5–1.0 dmg per GP**.
Above 1.0 is a balance violation (autonomy outperforming skill). Below 0.5 is a *content* failure:
a summon nobody would rationally buy is dead content, and the lint should say so while it's still
cheap to retune. Both sides are enforced by `lintSkills` (`AUTONOMOUS_MAX_RATE` /
`AUTONOMOUS_MIN_RATE` in `tools/balance-harness.mjs`).

### Law 2 — Earned multipliers (no dice, ever)
Combat stays deterministic — "no rolls, no misses" is permanent. Damage spikes are **conditions the
player engineers**, not luck:

- **Elemental:** weakness **×2**, resist **×½**, immune **×0**. The clean doubling family — mental
  math survives. (The Persona verb: find the weakness, exploit it.)
- **Positional:** backstab **×1.5**. **Shove spins (ruled 2026-07-24):** a shove turns its victim
  clean around — `[You shove X so hard they spin around!]` — and they spend their next turn
  recovering, so the window survives exactly one follow-up hit. Feared enemies remain
  backstabbable while fleeing; that emergent synergy is canon.
- Statuses do NOT add attacker-side multipliers by default — they modify the *target's* own output
  and behavior, which is already how Guard (×0.5 incoming) and Blind (×0.5 outgoing) work. A future
  status may declare an attacker-side multiplier explicitly, priced when it does.

**Composition rule (the bucket law):** same-family flat bonuses **add**; earned multipliers from
*different* categories **multiply** (independent achievements both count fully). Round **once**, at
the end. Armor subtracts **last** — mitigation is the target's property, and this ordering is what
lets an exploited weakness crack an armored enemy instead of being eaten by the subtraction:

```
damage = max(1, round((weapon + flat_bonuses) × elemental × positional) − armor)
```

Worked check: 20-damage spell on weakness (×2) with backstab (×1.5) = 60 — "above 50 if used
correctly," derived rather than declared. Guard/Blind migrate from special-cased riders at read
sites into named incoming/outgoing multiplier buckets in this one pipeline.

### Law 3 — Armor is the wall, and walls are puzzles
Flat subtraction, minimum 1, stays (more legible than any curve under The Hundred — the knight
taking 2 IS the design). Constraint: **regular enemies cap armor at 10** (half the act-1 reference
weapon of 20 — see Law 4), EXCEPT declared **puzzle walls** that demand their specific counter
(armor-piercing, elemental, positional). Puzzle walls are allowed to floor you to
1 precisely so the message is unmistakable: *this fight is a lock, go find the key.*

**Negative armor is the fragility axis (amended 2026-07-24).** Armor spans **−80 … +10**;
`max(1, hit − armor)` needs no change — negative armor ADDS damage, so soft targets die on
schedule without ever touching The Hundred. The standard fragility stops, vs the 20-damage
reference: **−80** one-shot (vermin, townsfolk), **−30** TTK 2 (fodder fighters), **−15** TTK 3,
**−5** TTK 4, **0** TTK 5 (standard), **+5…+10** elite walls. Retune recipe for existing content:
preserve a fighter's current lazy TTK via `new_armor = 20 − ceil(100 / old_TTK)`, snapped to the
nearest stop; damage-0 civilians snap straight to −80 (a Violencian goes down in one punch — this
is Violencetown).

### Law 4 — Roles, not levels
One flat power band for the whole act; enemies differ by **role** and **archetype shape**, not
level. Because damage is deterministic, TTK is exact — `ceil(100 / net dmg per turn)` — so these
bands are declarations, not hopes.

**Reference loadout (act 1): a 20-damage weapon** — the geared act-1 player (Ray Gun tier), not
the tutorial Wooden Sword. "Lazy" = basic attacks only; "informed" = weakness and/or positioning
exploited (×2 elemental is the workhorse: 20 × 2 = 40/turn; with backstab, 60). The derivation
anchor is the design statement "above 50 damage if used correctly."

| Role     | Armor      | TTK lazy | TTK informed | Their dmg/turn | Challenge GP |
|----------|------------|----------|--------------|----------------|--------------|
| Vermin / townsfolk | −80 | 1 (one-shot) | 1     | 0–6            | 0–5          |
| Fodder fighters    | −30 | 2        | 2            | 4–6            | 5–20         |
| Standard | −5 … 0     | 4–5      | 2–3          | 8–12           | 20–60        |
| Elite    | +5 … +10   | 7–10     | 3–4          | 14–18          | 100–200      |
| Boss     | varies     | —        | per phase: 3–4 | 16–24        | 500–2,500    |

*(Amended 2026-07-24: HP left the table — it's always 100 now. Armor is the durability axis in
both directions, and the wallet column is **Challenge GP** — the composite kit value of Law 6f,
not lootable coins.)*

Regular enemies cap armor at **10** (half the reference weapon — lazy play never falls below half
rate); only declared puzzle walls exceed it (Law 3).

Archetypes (brute / tank / swarm / lurker / caster) redistribute within the band along
`threat × toughness ≈ constant` — a brute trades armor for damage; a tank the reverse; swarm units
split one budget across bodies. Zones are open-order equals; only bosses and set-pieces break the
band (Law 5).

### Law 5 — Bosses break the band by SPENDING, not by pools
A boss is not a bigger health bar — he is a **richer combatant**. Phase transition = a purchase:
full heal (100 GP at peg) plus a rules-change move (summon adds, enrage, arena shift — each priced).
The Hundred stays literally true in every phase.

Bigfoot ledger (1,000 GP): two full heals (200) + three Hopkinsville Goblin summons (150) + enrage
(100) + smoke-bomb reposition (50) = 500 spent across the fight, 500 left as loot if you never
slowed him down — much more if you rushed him. Killing a boss faster than he can spend is the skill
ceiling, and the reward scales with it automatically.

### Law 6 — The Visible Wallet
Every combatant shows **HP/100 and GP** on its nameplate.

- **6a — Symmetric peg.** Enemies buy at the same rates the player does: heals 1:1, summons ~1:1
  total damage. No secret discounts for the house.
- **6b — Enemies spend on extras only.** The statline (attack, armor — the gear you can *see on the
  sprite*) is free to use and never silently self-modified. The wallet buys heals, summons, buffs,
  escapes, phase moves. The bullshit is finite, visible, and optional. An enemy at **0 GP is
  solved** — a broke knight is a 12-damage metronome you can dance around; draining the wallet is a
  real strategy.
- **6c — The player may buy the statline out of the fight.** Disarm-by-purchase: buy the bandit's
  sword right out of his hands at **price = item damage × 5** (≈ 3 turns of prevented damage at peg
  + ~2 turns' worth of asset value — you GET the sword). The payment lands **in his wallet**: the
  bandit is now harmless and rich, and might heal with your own money. Pacify (buying aggression,
  no asset received) prices peg-exact at `damage × turns bought`, wired through the existing
  `disposition` / `bribeable` / `flipThreshold` machinery. Full bribe-out ≈ remaining HP × greed
  factor (default 1.0, disposition-modified).
- **6d — Respawns come back broke.** You already mugged this guy. Kills wallet-farming dead.
- **6e — Wallets render in Hundreds.** 1 pip = 100 GP = one full heal he can afford = one
  potential "set" of effective life. Bigfoot's ten gold pips under his HP bar are the Kingdom
  Hearts purple-bar dread — with the twist KH doesn't have: the pips are **fungible**. He might
  convert them to bars, or to goblins. A grunt's 20 GP is a sliver; you both know he can't afford
  the heal. AI spending policies are decision lists over (HP, GP, position) — e.g. `hp < 40 AND
  gp ≥ 100 → buy full heal` — so a player reading nameplates can *prove* ceilings: "he's at 35
  with 20 GP; his best case is 55; I can finish this."
- **6f — Challenge GP is a composite (ruled 2026-07-24).** The nameplate number is the enemy's
  **total liquidatable kit**: liquid gold + the value of every usable potion and piece of gear it
  carries — the RuneScape PvP loadout read, made exact. It doubles as the challenge rating
  denominated in GP: a 2,500 GP boss is a 2,500-point PROBLEM, not 2,500 lootable coins. **Loot
  stays liquid gold only** (plus whatever physically drops); the gear/potion share of the number
  dies with its owner unless separately dropped. The dread display is the NUMBER itself — the
  future boss frame shows `2,500g` outright ("9 bars of dread" is really 2,500-gp-in-the-wallet
  dread); tile pips keep the 5+overflow cap. Implementation: `challengeGp(e) = e.gold +
  Σ loadout item values`; an enemy with no loadout reads as pure gold.

---

## Retune list (current content → Gold Standard)

| Item | Now | Becomes | Why |
|------|-----|---------|-----|
| Enemy ctor default HP | 50 | 100 | Law 0 |
| Sewer rats (16 HP) | implicit sub-100 | `vermin: true` — legally sub-Hundred | Law 0 vermin exception |
| Summoned lion | 12 GP; 30 HP, 12 dmg × 2 turns | 50 GP; 100 HP, ~25 dmg × 2 turns | Law 0 + peg (50 GP → 50 total dmg) |
| Guard / Blind | special-cased riders at read sites | named incoming/outgoing buckets in the one pipeline | Law 2 |
| Enemy gold | vendors only (`VENDOR_WALLET`) | every enemy carries a role-band wallet | Law 6; extends the existing transferGold conservation spine |
| Kill reward | undefined (no gold in drops) | loot = remaining wallet | Law 6 |
| Ray Blast | 6 GP → 18 dmg | unchanged (3:1, gated) | already legal — the reference example of a justified above-peg rate |
| Nameplates | HP only | HP + GP pips (Hundreds) | Law 6e |

## Deliverables

1. **`plans/balancing-bible.md`** — the full bible: these laws, the pricing menus (skills by MP/GP
   with gate annotations, debuffs priced in effect-turns, summon/bribe/buyout formulas), and worked
   examples retuning every current skill, trick, spell, and enemy.
2. **`tools/balance-harness.mjs`** — headless Node, imports the real data modules (`weapons.js`,
   `spells.js`, `tricks.js`, `enemies.js`, `buffs.js`):
   - **TTK/TTD matrix** — for every enemy × every loadout: turns you need to kill it (TTK) and
     turns it needs to kill you (TTD), exact arithmetic both ways;
   - **Peg lint** — flags any GP/MP rate outside its declared band, any autonomous above-peg rate,
     any armor over cap without a `puzzleWall` declaration, any max-HP ≠ 100;
   - **Economy lint** — per zone: faucet (sum of wallets + quest gold) vs sinks (shops, tricks,
     bribes, buyouts); target: peg-solutions affordable for ~10–20% of encounters;
   - **Golden table** — committed output file so every balance change shows up as a reviewable
     diff (the wowsims `.results` pattern: the diff of *consequences*, not just source).
3. **Creature Card stat blocks** — generated per card: role, archetype, armor, damage, resists,
   wallet, TTK vs reference loadout, and the peg price to buy the kill. The wiki and the game data
   stay in sync because the block is generated from the same modules the harness reads.

## Adoption path

1. Restore Law 0 (enemy HP default → 100) and migrate Guard/Blind into the pipeline buckets.
2. Add wallet fields + loot-on-death to the Enemy class (the transaction spine already conserves gold).
3. Build the harness; commit the first golden table; fix what the peg lint flags (lion re-price).
4. Nameplate pips (renderer).
5. New content authored budget-first from then on: pick role + archetype + zone flavor → the sheet
   hands you the numbers → the harness proves them.

## Open hooks (noted, not designed)

- **5-Zone Body reconciliation:** the March note's zone system survives as the *positional layer* —
  Back zone = backstab ×1.5, zones as where armor lives — NOT as split HP pools. Needs Caelan's
  ruling before the bible states it as law.
- **Enemy buys YOUR gear:** the symmetric-peg logic permits a thief archetype who throws gold at
  you and takes your sword (you're compensated; you're also disarmed). Funny. Deferred.
- **AI reads the player's wallet:** bribe demands and shop prices scaling to visible player wealth.
  Very Violencetown. Deferred.
- **Elemental coverage matrix:** which damage types exist (fire/cold/energy/fear today) and the
  weakness table per enemy family — content work for the bible, not a law change.
