# The Balancing Bible

`plans/gold-standard-design.md` is the rationale — why each law exists, in prose, with worked
derivations. This doc is the *working reference*: the page you keep open while adding an enemy or
a skill. Every law below is restated in one line with its real in-code enforcement point — grep the
citation, don't trust the prose. Section 5 is the current price list; section 6 is what's still
awaiting a ruling; section 7 is what's spec'd but not built.

**The golden-diff workflow.** `tools/balance-harness.mjs` imports the real data modules
(`weapons.js`, `spells.js`, `tricks.js`, `enemies.js`, the map JSONs) and computes TTK/TTD, peg
rates, and lint flags straight from them — never from a copy. `npm run balance:write` regenerates
`tools/balance-golden.txt`; `npm run balance:check` diffs the live computation against the
committed file and fails on drift. `npm test` (`node --test`) runs `tests/balance-harness.test.js`,
whose last assertion — *"report() matches the committed golden — drift shows up in npm test"*
(`tests/balance-harness.test.js:115`) — is the round-trip: change a number in `game/`, forget to
run `balance:write`, and the suite fails. The diff of the regenerated golden IS the review; read it
before you read the PR.

## The Laws

- **Law 0 — The Hundred.** Every combatant of consequence has exactly 100 HP; nothing modifies max
  HP. Enforced by the `Enemy` ctor default `hp = 100` (`game/enemies.js:40`) and `DEFAULT_HP = 100`
  (`game/combat.js:9`). Vermin exemption: `vermin: true` (`game/enemies.js:73`) legally sub-Hundreds
  a spawn — the only live example is the sewer rat, `hp: 16` (`game/sewer-setpiece.js:32`). Linted
  by `lintEntity` (`tools/balance-harness.mjs:89-94`): any non-vermin entity with `hp !== 100` flags.
- **Law 1 — The Peg.** 1 GP ≈ 1 HP is the rate for autonomous violence; per-cast skill buys rates
  above peg. Bands enforced by `lintSkills` (`tools/balance-harness.mjs:126-164`): spells
  `[1.5, 2.5]` dmg/MP (`SPELL_MIN_RATE`/`SPELL_MAX_RATE`, lines 33-34), per-cast tricks
  `>= 2.5` dmg/GP (`TRICK_MIN_RATE`, line 32), autonomous summons `[0.5, 1.0]` dmg/GP
  (`AUTONOMOUS_MIN_RATE`/`AUTONOMOUS_MAX_RATE`, lines 41-42).
- **Law 2 — Earned multipliers, no dice.** One pipeline, everything routes through it:
  `computeHit`, `elementalMult`, `isBackstab`, all exported `game/combat.js:121`. Bucket law: flats
  add, categories (elemental/positional/outgoing/incoming) multiply, round once
  (`computeHit`, `game/combat.js:28-32`). Immune is a true ×0 — call sites skip the hit entirely
  (`game/main.js:3713`, the immune-check before `attack()`), never floor it back to 1. Guard
  (incoming ×0.5) and Blind (outgoing ×0.5) compose in the same call as everything else:
  `applyDamageToPlayer` (`game/main.js:4160-4168`); the player's own swing folds elemental +
  backstab into one `computeHit` the same way (`game/main.js:3708-3712`).
- **Law 3 — Armor is the wall.** Flat subtraction, minimum 1: `Entity.takeDamage`
  (`game/combat.js:72-77`) for enemies, `this._playerArmor()` subtracted last in
  `applyDamageToPlayer` (`game/main.js:4170`) for the player. Cap: regular enemies ≤ 10
  (`ARMOR_CAP`, `tools/balance-harness.mjs:23`); `lintEntity` flags any armor over cap without a
  declared `puzzleWall` (`tools/balance-harness.mjs:98-99`).
- **Law 4 — Roles, not levels.** One flat power band per act; enemies differ by role/archetype, not
  level. The band table is design-doc law (`plans/gold-standard-design.md`'s Law 4 table); the
  living numbers are `tools/balance-golden.txt`'s TTK/TTD matrix, computed against
  `REFERENCE_DAMAGE = 20` (`tools/balance-harness.mjs:22`, the act-1 Ray-Gun-tier anchor) via `ttk`
  (`tools/balance-harness.mjs:66-68`).
- **Law 5 — Bosses spend, not pool.** A boss phase-transitions by *purchasing* a heal or a
  rules-change move, priced at peg like everything else. **Deferred to the first boss build** — the
  only boss in the current roster (`borgir/borgir_boss`) is a 50-HP, 0-damage placeholder in the
  golden table; no spending-policy code exists yet.
- **Law 6 — The Visible Wallet.** Every combatant's `gold` field (`Enemy` ctor, `game/enemies.js`,
  default `null` → 0) is real currency, not flavor. Loot on death: `_handleEnemyDeath` moves the
  corpse's whole wallet via `transferGold` and marks the id mugged
  (`game/main.js:3809-3813`); a re-spawned mugged id comes back broke via `spawnEnemy(spawnDef,
  muggedIds)` (`game/enemies.js:291-295`, Law 6d). Enemies buy heals at the peg through
  `healPurchase` (`HEAL_HP_FLOOR = 40`, `HEAL_MIN_GOLD = 20`, `game/ai.js:36-48`), wired into the
  ambient tick and paid for with `burnGold(npc, buy.spend, 'heal')` (`game/npc.js:230-231`). The two
  choke-points for all gold movement: `transferGold` (conserves; false if the payer can't cover it)
  and `burnGold` (declared sink) — both `game/trade.js:91-107`. Nameplate pips: 1 pip = 100 GP,
  capped at 5 + an overflow marker, boss multi-bar frame deferred (`game/renderer.js:1096-1129`).

## Authoring a new enemy (the form)

1. **Pick a role** (Vermin / Standard / Elite / Boss) and an **archetype** (brute / tank / swarm /
   lurker / caster) — archetype redistributes the role's budget along
   `threat × toughness ≈ constant`, it doesn't change the budget.
2. **Pick a zone** for its element palette (which `weak`/`resist`/`immune` damage types make sense
   there — fire/cold/energy/fear exist today).
3. **The band table hands you the numbers** (act-1, `REFERENCE_DAMAGE = 20`):

   | Role     | TTK lazy   | TTK informed | Their dmg/turn | Armor | Wallet (GP) |
   |----------|------------|--------------|-----------------|-------|-------------|
   | Vermin   | 1 (one-shot) | 1          | 4–6             | 0     | 0–5         |
   | Standard | 5–6 turns  | 2–3          | 8–12            | 0–4   | 20–60       |
   | Elite    | 7–10 turns | 3–4          | 14–18           | 6–10  | 100–200     |
   | Boss     | —          | 3–4/phase    | 16–24           | varies| 500–1,500   |

   Vermin needs `vermin: true` and stays sub-100 HP (`game/enemies.js:73`) — everyone else spawns
   with `hp: 100` (the ctor default, so you can just omit the field). Armor above 10 needs
   `puzzleWall: true` declared or the lint flags it (Law 3).
4. **Add `weak`/`resist`/`immune`** arrays of damage-type strings matching the zone's palette
   (`elementalMult`, `game/combat.js:36-42`).
5. **Give it a wallet** — `gold: <role band>` in its spawn def. (Every enemy in the current roster
   spawns at `gold: 0` — see §6, "wallet population" — so any new enemy you price here is ahead of
   the retune curve, not behind it.)
6. `npm run balance:write`, read the diff in `tools/balance-golden.txt`, commit code + golden
   together. A clean diff that only touches your new zone/id rows is the review passing.

## Authoring a new skill (the form)

1. **Pick the resource.** MP is renewable (regenerates per turn) → prices in opportunity-turns. GP
   is non-renewable (solvency) → must beat a spell's raw rate to justify spending real money.
2. **Pick the rate band it must satisfy** and hit it honestly — don't reverse-engineer a number to
   dodge the lint, retune the design instead:
   - Spell (MP): **1.5–2.5 dmg/MP** (AoE justifies the top of the band).
   - Per-cast trick (GP): **≥ 2.5 dmg/GP** — the aim/positioning cost is what earns the premium
     over spells.
   - Autonomous summon (GP): **0.5–1.0 dmg/GP** over its whole lifetime
     (`summonDamage × summonTurns`, priced by `trickDamage`, `tools/balance-harness.mjs`) — above
     1.0 is a balance violation (autonomy beating skill), below 0.5 is dead content nobody would
     rationally buy.
3. **Gate honestly.** A gear/ring gate (Ray Gun ← Ray Blast, Lion Whip ← Hire a Lion) earns
   *nothing* on its own — every trick in `TRICKS` is already gated. Only per-cast skill expression
   (you aim it every time) earns a rate above peg.
4. **AoE pays a per-target discount**, not full damage per tile. Confirmed live in the wheel-model
   comments and applied in the resolvers: Cleave = ⅔ weapon damage per target (documented
   `game/wheel-model.js:29-31`, applied `Math.round(weapon.damage * 2 / 3)` in
   `game/main.js:3162-3165`); Spin = ⅖ weapon damage per target (documented
   `game/wheel-model.js:33`, applied `Math.round(weapon.damage * 2 / 5)` in
   `game/main.js:3173-3176`) — fully surrounded (8 targets) that's 3.2× total, "free" because
   positioning/risk is the payment, not gold or mana.
5. `npm run balance:write`, read the diff, commit code + golden together.

## Price list (current, act 1)

From `tools/balance-golden.txt`, read fresh:

**WEAPONS (raw damage)**

| id           | damage | type   |
|--------------|--------|--------|
| fearmur      | 14     | —      |
| gator_tail   | 16     | —      |
| lion_whip    | 12     | —      |
| ray_gun      | 22     | energy |
| wooden_sword | 10     | —      |

**SPELLS (dmg/MP, band 1.5–2.5)**

| id         | mpCost | damage | dmg/mp | note |
|------------|--------|--------|--------|------|
| boo        | 8      | 0      | —      | utility (fears, doesn't damage) — not rate-priced |
| coneOfCold | 10     | 14     | 1.40   | **BELOW the spell floor — flagged, needs retune** |
| fireball   | 12     | 20     | 1.67   | in-band |

**TRICKS (dmg/GP, per-cast floor 2.5 / autonomous band 0.5–1.0)**

| id        | gpCost | damage | dmg/gp | gate justification |
|-----------|--------|--------|--------|---------------------|
| ember_rat | 4      | 14     | 3.50   | gated on Rat + Fire rings; single-cast burst, clears the per-cast floor |
| hire_lion | 50     | 50*    | 1.00   | *summon, priced by lifetime (25 dmg × 2 turns); sits exactly at the autonomous ceiling — gated on Lion Whip but priced at peg, per Law 1 |
| rat_form  | 0      | —      | —      | utility transform, no damage — not rate-priced |
| ray_blast | 6      | 18     | 3.00   | gated on Ray Gun equipped + aim every cast — the reference example of a justified above-peg rate |

**ENEMIES (TTK vs the reference loadout; TTD vs the reference player, 100 HP / 0 armor)**

| zone/id | type | hp | armor | dmg | gold | ttk_lazy | ttk_informed | ttd |
|---|---|---|---|---|---|---|---|---|
| bank/bank-financier | Banker | 30 | 0 | 0 | 0 | 2 | 1 | — |
| borgir/borgir_boss | Boss | 50 | 0 | 0 | 0 | 3 | 2 | — |
| canyon/pike | Pike | 45 | 0 | 6 | 0 | 3 | 2 | 17 |
| canyon/canyon-rat-1 | Rat | 14 | 0 | 4 | 0 | 1 | 1 | 25 |
| canyon/canyon-rat-2 | Rat | 14 | 0 | 4 | 0 | 1 | 1 | 25 |
| casino/casino-pit-boss | Operator | 12 | 0 | 0 | 0 | 1 | 1 | — |
| circus/clown1 | Carnival Clown | 20 | 0 | 4 | 0 | 1 | 1 | 25 |
| diner/diner-cook | Cook | 10 | 0 | 0 | 0 | 1 | 1 | — |
| downtown/dt-recipient | Stranger | 10 | 0 | 0 | 0 | 1 | 1 | — |
| downtown/dt-merch1 | Vendor | 10 | 0 | 0 | 0 | 1 | 1 | — |
| downtown/dt-merch2 | Vendor | 10 | 0 | 0 | 0 | 1 | 1 | — |
| downtown/dt-folk1 | Violencian | 10 | 0 | 0 | 0 | 1 | 1 | — |
| downtown/dt-folk2 | Violencian | 10 | 0 | 0 | 0 | 1 | 1 | — |
| downtown/dt-platero | Violencian | 10 | 0 | 0 | 0 | 1 | 1 | — |
| factory/green1 | Greedy Green | 25 | 0 | 5 | 0 | 2 | 1 | 20 |
| factory/puck | Puck | 30 | 0 | 1 | 0 | 2 | 1 | 100 |
| graveyard/skel1 | Rattling Skeleton | 18 | 0 | 4 | 0 | 1 | 1 | 25 |
| sewer/carrion | Carrion | 30 | 0 | 0 | 0 | 2 | 1 | — |
| sewer/e6 | Fungus King | 60 | 3 | 10 | 0 | 4 | 2 | 10 |
| sewer/e5 | Ghost Fungus | 20 | 0 | 4 | 0 | 1 | 1 | 25 |
| sewer/e3 | Red Fungus | 30 | 0 | 6 | 0 | 2 | 1 | 17 |
| sewer/e4 | Red Fungus | 30 | 0 | 6 | 0 | 2 | 1 | 17 |
| sewer/e1 | Violet Fungus | 25 | 0 | 5 | 0 | 2 | 1 | 20 |
| sewer/e2 | Violet Fungus | 25 | 0 | 5 | 0 | 2 | 1 | 20 |
| sewer/wererat | Wererat | 80 | 4 | 12 | 0 | 5 | 3 | 9 |
| town/townie-hooch | Bootlegger | 12 | 0 | 0 | 0 | 1 | 1 | — |
| town/townie-e | Violencian | 10 | 0 | 0 | 0 | 1 | 1 | — |
| town/townie-glunk | Violencian | 10 | 0 | 0 | 0 | 1 | 1 | — |
| town/townie-knuckles | Violencian | 14 | 0 | 2 | 0 | 1 | 1 | 50 |
| town/townie-macc | Violencian | 20 | 0 | 0 | 0 | 1 | 1 | — |
| town/townie-mince | Violencian | 10 | 0 | 0 | 0 | 1 | 1 | — |
| town/townie-praline | Violencian | 10 | 0 | 0 | 0 | 1 | 1 | — |
| town/townie-s | Violencian | 10 | 0 | 0 | 0 | 1 | 1 | — |
| town/townie-w | Violencian | 10 | 0 | 0 | 0 | 1 | 1 | — |

**34 Law 0 flags** (every roster entry above — every one is sub-100 HP and non-vermin) **= the
current retune worklist.** Plus **1 Law 1 flag** (`coneOfCold`, above). 35 total, per the golden's
`LINT` section. The sewer rat spawned by the set-piece script (`game/sewer-setpiece.js:32`,
`hp: 16, vermin: true`) is NOT in this table — it's dynamic, not part of the static map roster the
harness scans — and is already Law-0-compliant; the two static `canyon-rat` entries above are a
different, still-unfixed case (14 HP, not declared vermin).

## Open rulings (awaiting Caelan)

- **Townsfolk-as-combatants.** 19 of the 34 flagged roster entries are 0-damage NPCs (vendors,
  bank-financier, cook, most Violencians) — do they become 100-HP people, a third non-combatant
  category exempt from Law 0 entirely, or come out of the combat roster altogether?
- **Shove → backstab window.** Whether a shove/stagger interaction should open a guaranteed
  backstab window, and if so how it's telegraphed/countered.
- **Wallet population.** The economy faucet is 0 in every zone right now (no spawn def carries a
  `gold` value yet — `grep gold: game/data.js` returns nothing) — Law 6's wallet mechanics
  (`transferGold`, `burnGold`, `healPurchase`, pips) are fully wired and tested but have nothing to
  move. Populating role-band wallets across the roster is the next retune pass.
- **The boss frame.** Exact wallet display for the Kingdom-Hearts-style multi-bar dread (Law 6e) —
  the current nameplate pip row caps at 5 + overflow and explicitly defers the boss-specific frame
  (`game/renderer.js:1104-1107`).

## Deferred laws (spec'd, not built)

- **Statline buyout** (Law 6c) — disarm-by-purchase at `price = item damage × 5`, paid into the
  target's own wallet. No `disarm`/`buyout`/`statline` code exists yet; `grep` for those terms
  across `game/*.js` returns nothing.
- **Pacify** (Law 6c) — buying aggression down at `damage × turns bought`, wired through the
  existing `disposition` / `bribeable` / `flipThreshold` machinery (`game/give-action.js`), which is
  live for gifts/dialogue but not yet extended to a combat pacify action.
- **Boss spending policies** (Law 5) — decision lists over (HP, GP, position); deferred to the
  first boss build, same as the boss itself.
- **Per-zone faucet/sink economy lint** — the harness already prints a per-zone faucet total
  (currently all zeros); the sink side and the "affordable for 10–20% of encounters" target aren't
  linted yet.
- **5-Zone Body ruling** — whether the March zone system survives purely as the positional layer
  (Back zone = backstab ×1.5, per Law 2) or gets any further reconciliation; needs Caelan's ruling
  before this bible states it as law.
- **Creature-card stat blocks** (Task 12, lands next) — generated per enemy from the same modules
  the harness reads: role, archetype, armor, damage, resists, wallet, TTK vs. reference loadout, and
  the peg price to buy the kill.
