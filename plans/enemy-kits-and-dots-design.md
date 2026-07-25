# Enemy Kits, Consumable Repricing & Damage-Over-Time — design spec

**Status:** **Implemented 2026-07-25** on `feature/enemy-kits-and-dots` via
`plans/enemy-kits-and-dots-implementation.md` (18 tasks, 4 phases). Two sections carry inline
corrections found during implementation — §5a (species is not allegiance) and §11 (Phase A does not
ship alone). Open questions in §9 remain open.
**Date:** 2026-07-25
**Extends:** `plans/gold-standard-design.md` (Laws 0–6). This spec **amends Law 6f** and adds the
authoring model Law 6 never specified. Every other Law is unchanged and load-bearing here.
**Amends:** Law 6f's "loot stays liquid gold only" — see §6.

---

## The idea in one paragraph

Law 6 shipped a visible wallet, a nameplate that renders it, loot-on-death, a mugged-set so
respawns come back broke, and an AI that buys HP back at the peg. Then nobody filled the wallets:
`"gold"` appears in **zero** map JSONs, so every enemy in the live game reads as broke, every
kill loots nothing, and the heal-purchase at `npc.js:240` has never once fired for a player.
Law 6b's "an enemy at 0 GP is solved" is currently true of *every enemy in Violencetown*. This spec
fills them — not with a gold number, but with a **kit**: food, potions and bombs whose summed value
*is* the challenge rating, with roughly 20% carried as liquid coin. Filling them exposed a
pre-existing balance bug (consumables are priced 2–7× above the peg because the harness has never
linted items), so the repricing comes first and everything else rests on it.

---

## 1. The repricing — `baseValue` becomes the HP-equivalent

### 1a. Why this is a bug fix, not a feature tax

Law 1 states the peg as **"1 GP ≈ 1 HP is the market rate for *lazy* violence."** A consumable is
the purest lazy violence in the game: you buy the solution, point it, and it works. No gate, no
aim-per-cast, no positioning. The ≥2.5 dmg/GP band exists for *tricks* — gated, learned, aimed
abilities — and does not apply to objects bought off a shelf.

Measured against that, the whole consumable catalog is off, in one direction, uniformly:

| item | buy price @ neutral (×1.6) | effect | HP per GP |
|---|---|---|---|
| `rock` | 4 GP | 15 dmg | **3.8** |
| `mystery_meat` | 5 GP | heals 20 | **4.0** |
| `sludge_sack` | 7 GP | 16 dmg | **2.3** |
| `hot_dog` | 5 GP | heals 12 | 2.4 |
| `boardwalk_burger` | 8 GP | heals 15 | 1.9 |
| `bandage` | 16 GP | heals 25 | 1.6 |
| *Law 1 peg* | | | *1.0* |

**Root cause:** `tools/balance-harness.mjs` lints tricks (`TRICK_MIN_RATE`), spells
(`SPELL_MIN_RATE`/`MAX`) and summons (`AUTONOMOUS_MIN`/`MAX_RATE`) against the peg. It **never
imports `ITEMS`.** Consumables have never been peg-checked, so they drifted freely.

**Why it blocks the kit feature:** Law 6e's pip legend is *"1 pip = 100 GP = one full heal he can
afford."* If an enemy's kit is priced at 4 HP-per-GP, 100 GP of kit is ~400 HP of healing and the
pip understates the threat fourfold — the dread readout becomes an anti-tell. The wallet feature
is acting as a truth serum on a bug that was already there.

### 1b. The rule

> **A consumable's `baseValue` is the HP-equivalent of its effect.** Heals price at the HP they
> restore; damage sources price at the HP they remove.

This keeps Law 6's central thesis intact — *one number* serving as design budget, combat fuel and
loot — rather than splitting into a market price and a shadow combat value that would drift apart.

**Scope:** consumables with a numeric effect. **Persistent gear is excluded** (`foil_hat`, `pipe`,
`cardboard_cuirass`, …): armor's HP-equivalent depends on how many hits it eats, which is not a
number a lint can know. Gear keeps hand-set values and is out of the lint's jurisdiction.

### 1c. Damage over time is discounted — the time value of damage

DoT damage arrives late, and late damage is worth less. The mechanism is not folklore; it is how
Blizzard priced spells, from the source study behind `gold-standard-design.md` (session artifact
*"The Sim Is the Spec"*):

> Spell coefficients... scale direct-damage coefficient with cast time relative to a **3.5-second
> baseline**, and **DoT coefficient with duration relative to a 15-second baseline**... Warlock
> Corruption (an 18-second, 6-tick DoT) codes `spellCoeff := 0.2` per tick; six ticks at 0.2 sum
> to 1.2, which is **18/15 = 1.2** — the duration-normalized total.

Corruption gets 20% *extra* total damage precisely because it takes 18 seconds instead of the
15-second baseline. Compensating the delay and pricing the delay are the same statement.

WoW's second-based constants do not transfer — Violencetown has turns and no dice. But the
principle transfers **better**, because our version is exact rather than probabilistic: in a
turn-based game **damage delayed is damage taken**. A DoT that needs 5 turns to deliver 15 lets the
enemy swing at you 5 times; an instant 15 lets it swing once. And Law 4 makes wasted ticks exact —
a 5-turn DoT on a target that dies in 2 throws away three ticks, and we know the TTK precisely.

> **DoT value:  `Σ dmg_i × δ^i`  where `δ = 0.8` and `i = 0` is the turn it lands.**

**δ = 0.8 is derived from our own laws, not imported:** Law 4's standard role is TTK 4–5 lazy, so
the reference fight is five turns and one turn of delay costs one fifth of it.

**The worked example that makes it legible** — two items with identical nominal output:

| item | ticks | nominal total | discounted | `baseValue` |
|---|---|---|---|---|
| `sludge_sack` | 3 × 5 turns | 15 | 3(1+.8+.64+.512+.4096) = 10.08 | **10** |
| `fire_bottle` | 5 × 3 turns | 15 | 5(1+.8+.64) = 12.20 | **12** |

Same 15 damage. The fire bottle is worth 20% more *because it gets there sooner*. That is the whole
principle in two items, and it is the reason the rule is worth having at all.

---

## 2. The catalog

### 2a. Retunes to existing items

| item | `baseValue` | effect | change |
|---|---|---|---|
| `rock` | 2 → **3** | **3 dmg** + aggro pull (§2c) | damage 15 → 3 |
| `sludge_sack` | 4 → **10** | **sludge DoT 3 × 5 turns** | flat 16 → DoT |
| `tunnel_mushroom` | 2 → **9** | **poison DoT 5 × 2 turns** | was `heal 10` — now harmful to humans (§5) |
| `mystery_meat` | 3 → **3** | **3 dmg × 1** | was `heal 20` — now harmful to humans (§5) |
| `hot_dog` | 3 → **10** | heals 10 | heal 12 → 10 |
| `boardwalk_burger` | 5 → **15** | heals 15 | value only |
| `bandage` | 10 → **25** | heals 25 | value only |

`rock` is priced at its 3 damage; **its aggro-pull utility is deliberately free.** A rock should be
worth a rock. Pricing the stealth utility would make the game's cheapest object expensive, which is
the wrong shape for an item you pick off the floor of a sewer.

### 2b. New items

| item | category | `baseValue` | effect |
|---|---|---|---|
| `fire_bottle` | bomb | **12** | thrown; **fire DoT 5 × 3 turns** |

The three kit categories named in the ruling are **food** (healing), **potion** (drink / throw /
give — the buff catch-all) and **bomb** (throw / set / use — the combat catch-all). Food is
well-populated; `fire_bottle` opens the bomb category alongside `rock` and `sludge_sack`. **The
potion category is still empty** and needs at least one entry before elite kits can be built —
scoped as an open item in §9 rather than invented here.

### 2c. `rock` — the aggro pull

A thrown rock deals 3 and **draws enemies to investigate its landing tile**, letting the player slip
past instead of fighting. This is the game's first stealth affordance and it interacts with an
existing seam: `npc.js` already pursues `_lastSeenX/_lastSeenY` rather than the player's true
position (PD-1). A rock sets that last-seen target on nearby enemies without ever having been seen.

Design note: this makes `rock` the cheapest item in the game and one of the most useful, which is
correct and intentional — the skill is in *when* you throw it, and skill is never priced (Law 1).

---

## 3. The kit model

### 3a. Budget is derived; kit is authored

Two sources of truth, neither overlapping:

**Budget ← armor.** The roster's armor values already encode Law 4's role ladder exactly — no new
field, no new authoring:

| armor | role | Challenge GP band | current occupants |
|---|---|---|---|
| −80 | vermin / townsfolk | 0–5 | canyon rats ×2, Carnival Clown, Rattling Skeleton, Ghost Fungus |
| −30 | fodder fighter | 5–20 | Violet Fungus ×2, Red Fungus ×2, Greedy Green |
| −15 | *(Law 3 stop with no Law 4 row — see §9)* | *15–40, proposed* | Pike, Borgir boss |
| −5 … 0 | standard | 20–60 | Fungus King, Wererat |
| +5 … +10 | elite | 100–200 | *(none yet)* |
| declared boss | — | 500–2,500 | *(none yet; `_boss` tag overrides the armor derivation)* |

**Kit ← the spawn.** Each fighter authors `loadout` (item ids) and `gold` in its map JSON. This is
where character lives: the Violet Fungus carries spore-caps it can eat, the Wererat carries
somebody else's wallet.

**Liquidity ≈ 20%.** `gold ≈ 0.2 × challengeGp`, the rest in kit. Authored kits will not land on
round numbers, so the lint accepts **10–30%** and flags outside that; below 10% the kill feels
unrewarded, above 30% the enemy is carrying a purse rather than a loadout. Vermin (0–5 GP) are
exempt — the band is too small for a percentage to mean anything.

**Why not derive the kit too:** a single armor→kit table gives every −30 enemy identical bread. The
job is 13 fighters, not 34 spawns (20 of the roster are civilians and vendors at 0–2 damage), so
hand-authoring is tractable and it is the part of this work with actual design value.

### 3b. Role-default fallback

An enemy with no authored kit inherits a stock kit for its armor band. This is the omission
backstop: a summon, a set-piece spawn created at runtime, or a 14th enemy added by someone who
didn't read this spec cannot silently ship broke and re-create the exact bug this spec exists to
fix. Explicit authoring always wins.

### 3c. `loadout` must hold item ids

**Current blocker:** `challengeGp` reads `it.value ?? 0` (`enemies.js:313`) but every `ITEMS` def
uses **`baseValue`**. Authoring `loadout: [ITEMS.mystery_meat]` today scores **0**. The existing
tests pass only because they use invented literals — `{name:'Big Potion', value:60}`
(`wallets.test.js:70`) is not a real item.

**Resolution:** `loadout` holds item **ids**, resolved through `ITEMS` at spawn. Required anyway for
an enemy to *use* what it carries, and it makes the drop in §6 trivial. `challengeGp` sums
`ITEMS[id].baseValue`, with the existing null-safe behavior preserved for bare objects so the
current tests keep their meaning.

### 3d. Kits stay small — a consequence of §1

At peg, a fodder budget (5–20 GP, 80% kit = 4–16) buys **one** item; a standard budget (20–60,
kit 16–48) buys **two or three**. Killing all 13 fighters yields roughly **26 items** across the
entire game. Had the catalog stayed at 2–5 GP per item, a standard kit would have been 10+ pieces
of meat and §6's ground drops would carpet the floor into a 50-slot bag that auto-picks-up on
walk-over. The repricing is what makes the drop rule survivable.

---

## 4. Damage over time

### 4a. The machinery already exists

`sludge` in `buffs.js:33` is a working player DoT with exactly the hook shape needed. `tickBuffList`
already drives player and enemy buffs through one function, so enemies get DoTs for free. This is
**not** new engine work: generalize the flat `SLUDGE_DOT` constant into per-buff `{dmg, turns}`,
and add `poison` and `fire` entries beside `sludge`.

### 4b. The clock is player input — the BG3 failure cannot occur here

The problem being designed against, in the designer's words: in Baldur's Gate 3, *"when you get out
of combat, your character is poisoned... you're trying to rush to the 'How do I cure poison?' menu
options... or you still feel like you're dying."*

Root cause, from bg3.wiki, verbatim: **"When you are outside turn-based mode or combat mode, one
turn is 6 seconds."** The status does not get worse when combat ends — *the clock it is attached to
does*. In combat a turn means as long as you need; out of combat the identical effect means six real
seconds. Larian treats this as a defect elsewhere: Patch 4 notes read *"Fixed harmful conditions on
the vampire spawn ticking down in real time... They now tick down once per combat turn."*

**Violencetown is structurally immune.** `_tickBuffs()` is called from exactly one place —
`main.js:3419`, inside `_advanceWorld()`. The free-running heartbeat (`main.js:3508`,
`WORLD_TICK_MS = 500`) advances ambient NPCs and **does not tick buffs**. Poison advances only when
the player acts. Standing still is free; reading the whole bag is free.

This yields the asymmetry the stealth design wants: **you can hold your breath, but the guard keeps
walking.** Patrols and line-of-sight run on wall-clock; you and your poison run on turns.

### 4c. The Laws of DoT

**A DoT can never land the killing tick — it floors the player at 1 HP.** One rule, in a fight or
out of it. Violencetown has no combat flag, and the research is explicit that inventing one is what
makes BG3's boundary feel arbitrary; our structural family is the roguelikes, where there is one
clock and no boundary at all.

Precedent — Diablo II, verbatim: *"Poison Length Damage can only reduce a Character to 1 remaining
Life."* And Dragon Quest VI made field poison *"impossible for a character to be killed while
walking in the over world and instead being reduced to one HP."*

**It does not cure itself at the floor.** You stand there at 1 HP, still burning. This is DQ VI's
and D2's choice, *not* Pokémon Gen IV's (which floors *and* cleanses). The dread survives the floor:
you are upright, you are on fire, and the next thing that connects ends it.

**The pressure goes up, because the death went away.** DQ VI made field poison non-lethal and in the
same game moved the tick from every 8 steps to **every step** — eight times more frequent and
strictly non-fatal, simultaneously. That is the licence for `sludge_sack` 3×5 and `fire_bottle` 5×3
to be genuinely nasty numbers.

**A DoT cannot kill you, but it can *claim* the kill.** While any DoT is active it stamps
`_lastDefeatedBy = { cause }`, so when something else lands the finishing blow the defeat scenario
still reads the DoT. Without this, flooring the DoT would orphan the `swept_into_sludge` scenario
already written at `defeat-scenarios.js:93`. The sludge does not finish you — it makes sure the
river gets you when something else does.

**Lethal DoT is a separate effect, not a flag.** Mojang did not add `canKill` to Poison; they
shipped `fatal_poison` as its own effect ID (25, Bedrock 1.2.0) that a designer must deliberately
reach for. If a boss ever needs a killing burn it is a distinct `BUFF_DEFS` entry, and the default
stays safe.

**Enemies get no floor.** D2's floor is player-only — mercenaries and summons die to poison
normally. It is an explicit player-experience concession, not a simulation rule. A sludge bomb
absolutely finishes a Violet Fungus.

### 4d. No downed state — and why

The interactive "critical condition" idea (collapse, then spend a turn using an item to save
yourself) is **not** in this design. Two reasons.

**It is the documented anti-pattern.** BG3's downed state: *"Any damage you receive while
unconscious counts as one failure"*, three failures kills. A DoT ticking on a downed character
converts one-for-one into death saves — roughly an 18-second unattended death **with zero player
input required**. A downed state does not remove the panic when a DoT is running; it relocates the
panic and takes the controls away first.

**The beat already exists and is better.** `playerHp <= 0` calls `_die()` (`main.js:4260`), which
despite its name waits 500ms and calls `_resolveDefeat()` — a weighted defeat scenario. You wake
somewhere, at reduced HP, minus some kit, with a line of story. `_runScenario` clears
`this.buffs = []` (`main.js:4298`) so nothing follows you through. **There is no death in
Violencetown**, so the hard requirement — *"I would never want a time-based death to hit the
player"* — is already met by construction, and was before this spec.

---

## 5. Faction-dependent food, and poisoning people socially

### 5a. The split

Sewer scavenge is **poison to humans and medicine to the things that live down there.** Same item,
opposite effect, decided by the eater.

**Proposed rule: the magnitude is preserved; only the sign flips.** A sewer item delivers the same
numbers to a sewer-dweller that it delivers to a human, as healing instead of harm — and over the
same number of turns, so a poison DoT becomes a regeneration-over-time using the identical
`tickBuffList` machinery with a negative sign.

| item | to a human (the player) | to a sewer-dweller |
|---|---|---|
| `tunnel_mushroom` | poison 5 × 2 turns | regenerates 5 × 2 turns |
| `mystery_meat` | 3 damage × 1 | heals 3 × 1 |

This is what makes a Violet Fungus's kit honest: it carries spore-caps *because it can eat them*.
The player carrying the same mushrooms is carrying bombs.

Preserving magnitude is what keeps **one `baseValue` per item** honest across both factions — see
§9.3 for what breaks if a future item's two worths diverge. The specific healing numbers were not
specified in the ruling and are derived from this rule rather than authored; they need confirming.

Implementation seam: an item's effect resolves against the **eater's** species.

> **Corrected during implementation.** This section originally claimed the split could read the
> existing `ai.js` **allegiance** parse, "the one source of truth for who counts as what." That was
> wrong. Allegiance is `hostile`/`ally`/`neutral` — it describes *who you fight*, not *what you are*,
> so a bribed Violet Fungus would become an ally and stop being able to eat mushrooms. Species needs
> its own field: `sewerDweller`, with an `isSewerDweller(e)` predicate beside the allegiance ones in
> `ai.js`. There is a test asserting a flipped fungus keeps its species.

One limitation found in implementation: the sign-flip applies cleanly to **DoT** items (a negative
`dmg` through the same `tickBuffList` machinery) and to the **give** path, but not to a flat-`damage`
item thrown at a sewer-dweller. `resolveThrow`'s damage branch routes through `combatAttack` →
`Math.max(1, raw - armor)`, which would clamp a would-be heal back to at least 1 damage. So a thrown
`mystery_meat` harms everyone; hand-fed, it heals a sewer-dweller. Documented rather than forced —
bending the combat pipeline to carry healing was not worth it for one item.

### 5b. Poisoning as a social attack

Give someone poisoned food and three things happen at once: they **take the DoT**, their
**disposition drops**, and they may **turn hostile**. This routes through
`reactToTransaction` in `give-action.js` — the existing single seam that gifts, bribes and dialogue
already move disposition through — so the social consequence is not a special case bolted on beside
the damage; it is the same transaction with a negative sign.

The tuning knob is that the disposition hit should exceed the gift credit the food would otherwise
earn. Feeding someone poison must never be a net-positive way to raise their opinion of you, and an
NPC whose `values` include food (already an authored field on 11 spawns) should react *worse*, not
better — the betrayal is proportional to how much they wanted it.

Whether the victim flips hostile keys off the existing `flipThreshold`, so a well-liked player can
poison someone and merely be resented, while a marginal one triggers a fight. That asymmetry is
free — it falls out of machinery that already exists.

---

## 6. Drops on death — **this amends Law 6f**

Law 6f as adopted reads: *"Loot stays liquid gold only (plus whatever physically drops); the
gear/potion share of the number dies with its owner unless separately dropped."*

**Amended by ruling, 2026-07-25: the unused kit drops as ground items.** Kill an enemy before he
drinks the potion and the potion is yours.

**Rationale.** It makes rushing rewarding, converts the nameplate from a pure challenge rating into
a legible promise, and — critically — the kit *depletes as he fights*, so the drop is exactly the
part he did not get to use. It is the player's reward for denying him his tricks.

**Farming stays closed.** `spawnEnemy` (`enemies.js:321`) zeroes `gold` for a mugged id; it must
also **clear `loadout`**, so Law 6d ("respawns come back broke") continues to hold for the whole
kit, not just the coins. A re-entered zone yields a toothless enemy — no heal, no bomb — which is
Law 6b's "an enemy at 0 GP is solved" working as written.

**Volume is bounded** by §3d: kits are 1–3 items, so the ground never carpets.

---

## 7. Emergent consequence worth naming

The kit depletes as the enemy fights; the coins do not. So **a worn-down enemy becomes
proportionally more liquid** — he spends his tricks, and what remains is cash. The pips drop as he
eats. That is Law 6e's drain-the-wallet dread arriving with no extra mechanism, purely from the
composition of rules already stated.

---

## 8. Guardrails

Every number in this spec is enforceable, and the enforcement is the deliverable that stops it
rotting the way Law 6's wallets did.

**`lintItems()` — new, in `tools/balance-harness.mjs`.** Checks every consumable's `baseValue`
against its declared effect under §1b, applying §1c's discount to DoTs. This is the check whose
absence caused the bug: the harness currently never imports `ITEMS`.

**`lintEntity()` — extend, `balance-harness.mjs:99`.** It already calls `challengeGp` and enforces
the vermin ≤5 cap. Add the full §3a band table keyed off armor, plus the ~20% liquidity target, so
every kit — authored or defaulted — is proven in band by `npm run balance:check`.

**`content-validate.js` — extend.** Flag at startup any combatant (damage > 0, not `ambient`) with
no kit and no fallback, and any `loadout` naming an id absent from `ITEMS`.

**Golden table.** The kit and its Challenge GP join `tools/balance-golden.txt`, so a retune shows up
as a reviewable diff of consequences.

**Tests.** Extend `tests/wallets.test.js` with real item ids rather than invented literals (this
also closes the `value`/`baseValue` trap in §3c); new coverage for the DoT floor (a DoT tick cannot
take the player below 1), the cause-claim, the mugged respawn clearing `loadout`, the faction split
resolving opposite effects for two eaters, and the discount formula itself.

---

## 9. Open questions

1. **The −15 armor stop has no Law 4 row.** Law 3 lists −15 as a fragility stop (TTK 3) but Law 4's
   role table jumps from −30 to −5…0. Pike and the Borgir boss sit there. **Proposed: 15–40 GP**,
   interpolated between fodder and standard — needs a ruling before the lint can judge them.
2. **The potion category is empty.** No drink/throw/give buff item exists. At least one is needed
   before elite kits (100–200 GP) can be assembled from anything but stacks of bandages.
3. **One item, two worths.** §5a's magnitude-preserving rule is what lets a single `baseValue` serve
   both factions — a `tunnel_mushroom` is worth 9 either way, because it is the same five-times-two
   with the sign flipped. **Confirm the rule**, because the alternative (authoring independent heal
   numbers per faction) breaks Law 6's one-number thesis: Challenge GP would have to count the
   effect *the holder can actually use*, and the nameplate would mean something different depending
   on who you were reading.
4. **Does opening the REMOTICON advance a world turn?** Pre-existing open ruling, now sharper: with
   DoTs live, a bag-open that costs a turn also costs a poison tick — which would partly undo §4b's
   guarantee that reading the bag is free.
5. **Boss band derivation.** A `_boss`-tagged enemy overrides the armor→band derivation with a
   declared band. The Wererat (armor 0, tagged `wererat_boss`) currently reads as *standard*
   (20–60) rather than Law 4's boss band (500–2,500), which is almost certainly right for an act-1
   boss but should be stated rather than inferred.

---

## 10. Amendments to `plans/gold-standard-design.md`

To be applied in the same commit as the implementation, so the constitution never disagrees with
the code:

- **Law 6f** — "Loot stays liquid gold only" → the unused kit drops as ground items; the mugged-set
  clears `loadout` as well as `gold` (§6).
- **Law 6** — gains the authoring model: budget derives from armor, kit is authored per spawn,
  ~20% liquid, role-default fallback (§3).
- **Law 1** — gains the explicit statement that consumables price at peg as lazy violence, and the
  DoT discount `Σ dmg_i × 0.8^i` (§1b, §1c).
- **New: Law 7 — The DoT Floor.** A DoT never lands the killing tick on the player; it does not
  self-cure; it claims the defeat cause; lethal DoT is a separate effect; enemies get no floor
  (§4c).
- **Retune list** — the "Enemy gold: vendors only → every enemy carries a role-band wallet" row is
  the row this spec finally executes, and should be marked done when it lands.

---

## 11. Delivery phases

This spec is deliberately broad — it spans pricing, content, a new combat mechanic and a social
system — because the parts are load-bearing for each other: kits are unauthorable until items are
priced, and drops are unsurvivable until kits are small. It should still ship in four increments,
each independently verifiable and each leaving the game playable.

| phase | scope | done when |
|---|---|---|
| **A — Pricing** | §1, §2a `baseValue` retunes, `lintItems()` | harness green; golden diff reviewed; no gameplay change yet beyond shop prices |
| **B — DoTs** | §4: per-buff `{dmg,turns}`, `poison`/`fire` defs, the floor, the cause-claim, `sludge_sack` and `fire_bottle` as DoTs | a thrown sludge sack ticks an enemy down; a burning player floors at 1 and cannot die to it |
| **C — Kits** | §3, §6, §8's `lintEntity`/`content-validate` work | 13 fighters carry authored kits; pips light up; kills drop coin and unused kit; mugged respawns come back empty |
| **D — Faction food** | §5: the eater-decides split and social poisoning through `give-action.js` | a fungus heals off a mushroom that poisons the player; gifting poisoned food damages *and* drops disposition |

> **Corrected during implementation: Phase A does NOT ship alone.** This originally read "Phase A
> alone fixes a shipped balance bug and is worth landing on its own even if the rest waits." It
> isn't. Phase A replaces `sludge_sack`'s flat `damage` and `tunnel_mushroom`'s `effect: 'heal'`
> with a `dot` field that nothing reads until Phase B, so between the two phases `resolveThrow`
> falls through to *"it shatters harmlessly"* and both items are inert. **A and B ship together.**

Phase C is the one that makes the marquee idea of v0.19.0 finally visible to a player.
