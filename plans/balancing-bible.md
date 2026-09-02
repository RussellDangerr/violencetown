# The Balancing Bible

`plans/gold-standard-design.md` is the rationale — why each law exists, in prose, with worked
derivations. This doc is the *working reference*: the page you keep open while adding an enemy or
a skill. Every law below is restated in one line with its real in-code enforcement point — grep the
citation, don't trust the prose. Further down: the current price list, a "Ruled 2026-07-24" section
for this round's resolved calls, what's still awaiting a ruling, and what's spec'd but not built.

**The golden-diff workflow.** `tools/balance-harness.mjs` imports the real data modules
(`weapons.js`, `spells.js`, `tricks.js`, `enemies.js`, the map JSONs) and computes TTK/TTD, peg
rates, and lint flags straight from them — never from a copy. `npm run balance:write` regenerates
`tools/balance-golden.txt`; `npm run balance:check` diffs the live computation against the
committed file and fails on drift. `npm test` (`node --test`) runs `tests/balance-harness.test.js`,
whose last assertion — *"report() matches the committed golden — drift shows up in npm test"*
(`tests/balance-harness.test.js:127`) — is the round-trip: change a number in `game/`, forget to
run `balance:write`, and the suite fails. The diff of the regenerated golden IS the review; read it
before you read the PR.

## The Laws

- **Law 0 — The Hundred (amended 2026-07-24, repeals the vermin exception).** Every combatant —
  player, rat, townsfolk, boss — has exactly 100 HP; nothing modifies max HP. Softness is not a
  lower HP, it's **negative armor** (Law 3): `max(1, hit − armor)` already adds the deficit back in,
  so a −80 target dies to a single reference swing without The Hundred ever bending. `vermin: true`
  (`game/enemies.js:75`) survives as a **role marker only** — ambient swarm class, Challenge GP ≤ 5
  (Law 6f) — it no longer licenses sub-100 HP; the sewer rat is `hp: 100, armor: -80, vermin: true`
  (`game/sewer-setpiece.js:32`). Enforced by the `Enemy` ctor default `hp = 100`
  (`game/enemies.js:41`), `DEFAULT_HP = 100` (`game/combat.js:9`), and `lintEntity`
  (`tools/balance-harness.mjs:105-107`): ANY `hp !== 100` flags — vermin included, no exemptions.
- **Law 1 — The Peg.** 1 GP ≈ 1 HP is the rate for autonomous violence; per-cast skill buys rates
  above peg. Bands enforced by `lintSkills` (`tools/balance-harness.mjs:147-187`): spells
  `[1.5, 2.5]` dmg/MP (`SPELL_MIN_RATE`/`SPELL_MAX_RATE`, lines 38-39), per-cast tricks
  `>= 2.5` dmg/GP (`TRICK_MIN_RATE`, line 37), autonomous summons `[0.5, 1.0]` dmg/GP
  (`AUTONOMOUS_MIN_RATE`/`AUTONOMOUS_MAX_RATE`, lines 46-47).
- **Law 2 — Earned multipliers, no dice.** One pipeline, everything routes through it:
  `computeHit`, `elementalMult`, `isBackstab`, all exported `game/combat.js:121`. Bucket law: flats
  add, categories (elemental/positional/outgoing/incoming) multiply, round once
  (`computeHit`, `game/combat.js:28-32`). Immune is a true ×0 — call sites skip the hit entirely
  (`game/main.js:3733`, the immune-check before `attack()` at line 3736), never floor it back to 1.
  Guard (incoming ×0.5) and Blind (outgoing ×0.5) compose in the same call as everything else:
  `applyDamageToPlayer` (`game/main.js:4180-4188`); the player's own swing folds elemental +
  backstab into one `computeHit` the same way (`combatAttack`, `game/main.js:3728-3732`).
  **Shove spins its victim (ruled 2026-07-24).** A successful shove sets `victim._spunTurns = 1` and
  logs exactly `[You shove ${name} so hard they spin around!]` (`game/main.js:1988-1989`); the
  victim's next HOSTILE turn is spent recovering — no attack, no re-face, no move
  (`game/npc.js:230-233`, checked *before* the heal-purchase block) — so the window survives exactly
  one follow-up hit. `_spunTurns` round-trips through `toSave`/`fromSave` the same way `_lastDx`
  does (`game/enemies.js:89, 184, 277`). Feared-and-fleeing enemies remain backstabbable; that
  emergent synergy is canon, not a bug.
- **Law 3 — Armor is the wall, and negative armor is the fragility axis (amended 2026-07-24).** Flat
  subtraction, minimum 1: `Entity.takeDamage` (`game/combat.js:72-77`) for enemies,
  `this._playerArmor()` subtracted last in `applyDamageToPlayer` (`game/main.js:4190`) for the
  player — `max(1, hit − armor)` needed **no code change** to go negative; a negative armor just
  ADDS damage. Standard fragility stops, vs the 20-damage reference: **−80** one-shot
  (vermin/townsfolk), **−30** TTK 2 (fodder fighters), **−15** TTK 3, **−5** TTK 4, **0** TTK 5
  (standard), **+5…+10** elite. Range: regular enemies live in **[−90, +20]**
  (`ARMOR_FLOOR`/`ARMOR_CAP`); `lintEntity` flags any armor outside that band without a declared
  `puzzleWall`.
  **Amended 2026-08-24 (Caelan) — the cap rises 10 → 20, and splits in two.** Raised so an elite
  can reach the systems audit's `ttk_informed` 5–8 target, which was unreachable at +10. But flat
  subtraction is not linear as armor nears the lazy reference damage of 20, and the curve is the
  whole story:

  | armor | lazy (20 dmg) | informed (40 dmg) |
  |---|---|---|
  | 0 | 5 | 3 |
  | +6 | 8 | 3 |
  | **+10** | **10** | **4** |
  | +15 | 20 | 4 |
  | +20 | **100** | 5 |

  So `ttk_informed` 5 costs a **100-turn lazy fight**. The band therefore has two halves, and
  `ARMOR_DIFFICULTY_CAP = 10` marks the seam:
  - **[−90, +10] — the DIFFICULTY band.** Fights that get harder. Author freely.
  - **(+10, +20] — the GATE band.** `max(1, hit − armor)` floors a lazy loadout to 1 damage, so the
    enemy reads to the player (correctly) as *impossible until I come back with something better*.
    That is the audit's §5.3 `puzzleWall` idea. **An enemy authored here is a lock and needs a key**
    — fire, the Ray Gun's 22, an element it is weak to — or it is a wall with no door. `lintEntity`
    emits a loud `Law 3 GATE` flag for anything in this half so it can never be entered by accident.

  Nothing in the roster is above +6 today; this amendment opens the band, it does not populate it.
- **Law 4 — Roles, not levels.** One flat power band per act; enemies differ by role/archetype, not
  level — and (amended 2026-07-24) the role table keys on **armor**, not HP, since HP is always 100
  now (see the authoring form below for the current table). The band table is design-doc law
  (`plans/gold-standard-design.md`'s Law 4 table); the living numbers are
  `tools/balance-golden.txt`'s TTK/TTD matrix, computed against `REFERENCE_DAMAGE = 20`
  (`tools/balance-harness.mjs:27`, the act-1 Ray-Gun-tier anchor) via `ttk`
  (`tools/balance-harness.mjs:71-73`).
  **Amended 2026-08-24 (Caelan) — the `tough` row.** The table jumped from `standard` at exactly
  armor 0 straight to `elite` at +1…+10, so every armor value in between derived as elite and
  demanded a 100 GP wallet off a trash mob. That is the same no-row-fits hole ruling A1 describes
  at −15, and the 2026-08-24 roster re-role walked straight into it. `tough` (armor **+1…+5**,
  **60–100 GP**) is the missing step between a zone's basic enemy and its named foe. The ladder now
  reads:

  | role | armor ≤ | challenge GP |
  |---|---|---|
  | vermin | −80 | 0–5 |
  | fodder | −30 | 5–20 |
  | bruiser | −15 | 15–40 *(still an open question — ruling A1)* |
  | standard | 0 | 20–60 |
  | **tough** | **+5** | **60–100** |
  | elite | +10 | 100–200 |

  **Durability and wallet move together.** Re-roling the roster up the armor ladder without funding
  the wallets raised 11 Law 4 flags at once — the Law working, not noise. A zone's faucet rising is
  the expected consequence of that zone getting harder: the 2026-08-24 pass took the sewer from 28
  to 101 lootable GP, and the whole game from ~37 to ~147.
- **Law 5 — Bosses spend, not pool.** A boss phase-transitions by *purchasing* a heal or a
  rules-change move, priced at peg like everything else. **Deferred to the first boss build** — the
  only boss in the current roster (`borgir/borgir_boss`) is a 100-HP / −15-armor, 0-damage
  placeholder in the golden table (Law 0's 100 applies to him too); no spending-policy code exists
  yet.
- **Law 6 — The Visible Wallet.** Every combatant's `gold` field (`Enemy` ctor, `game/enemies.js`,
  default `null` → 0) is real currency, not flavor. Loot on death: `_handleEnemyDeath` moves the
  corpse's liquid gold via `transferGold` and marks the id mugged (`game/main.js:3818`, transfer +
  mugged-mark at `:3829-3833`); a re-spawned mugged id comes back broke via `spawnEnemy(spawnDef,
  muggedIds)` (`game/enemies.js:321-324`, Law 6d). Enemies buy heals at the peg through
  `healPurchase` (`HEAL_HP_FLOOR = 40`, `HEAL_MIN_GOLD = 20`, `game/ai.js:36-48`), wired into the
  ambient tick and paid for with `burnGold(npc, buy.spend, 'heal')` (`game/npc.js:241`) — gated
  behind the shove-recovery check (Law 2 positional) so a spun victim can't buy a heal on its
  recovery turn. The two choke-points for all gold movement: `transferGold` (conserves; false if the
  payer can't cover it) and `burnGold` (declared sink) — both `game/trade.js:91-107`. Nameplate pips
  read the COMPOSITE wallet, not raw gold (`game/renderer.js:1097-1133`); capped at 5 + an overflow
  marker, boss multi-bar frame still deferred to the first boss build.
  **6f — Challenge GP is a composite (ruled 2026-07-24).** The nameplate number is liquid gold plus
  the value of every carried potion/gear item: `challengeGp(e) = e.gold + Σ loadout[].value`
  (`game/enemies.js:312-315`), persisted through `toSave` the same way gold is
  (`game/enemies.js:251-253`). **Loot stays liquid gold only** — a loadout item never becomes
  lootable coin on death. `lintEntity`'s vermin cap (`tools/balance-harness.mjs:111-113`) and the
  golden's ENEMIES table both read this composite (`tools/balance-harness.mjs:354`, column header
  `chal_gp`); the per-zone ECONOMY faucet stays LIQUID gold on purpose — it measures lootable
  inflow, not the challenge a zone poses (`tools/balance-harness.mjs:392-396`). Buyout (Law 6c,
  still unbuilt) will stay liquid for the same reason: a kit isn't lootable, so it never appears on
  either side of the bribe trade — not as something you pay to unlock, not as something you walk
  away holding.

## Authoring a new enemy (the form)

1. **Pick a role** (Vermin/townsfolk / Fodder / Standard / Elite / Boss) and an **archetype** (brute /
   tank / swarm / lurker / caster) — archetype redistributes the role's budget along
   `threat × toughness ≈ constant`, it doesn't change the budget.
2. **Pick a zone** for its element palette (which `weak`/`resist`/`immune` damage types make sense
   there — fire/cold/energy/fear exist today).
3. **The band table hands you the numbers** (act-1, `REFERENCE_DAMAGE = 20`; amended 2026-07-24 —
   the table keys on **armor**, not HP, because HP is always 100 now):

   | Role     | Armor      | TTK lazy | TTK informed | Their dmg/turn | Challenge GP |
   |----------|------------|----------|--------------|-----------------|--------------|
   | Vermin / townsfolk | −80 | 1 (one-shot) | 1     | 0–6             | 0–5          |
   | Fodder fighters    | −30 | 2        | 2            | 4–6             | 5–20         |
   | Standard | −5 … 0     | 4–5      | 2–3          | 8–12            | 20–60        |
   | Elite    | +5 … +10   | 7–10     | 3–4          | 14–18           | 100–200      |
   | Boss     | varies     | —        | per phase: 3–4 | 16–24         | 500–2,500    |

   Every spawn omits `hp` (the ctor default is already 100) and gets an explicit `armor:` from the
   table above. Vermin/townsfolk additionally gets `vermin: true` (`game/enemies.js:75`) — a role
   marker capping its Challenge GP at 5 (Law 6f), NOT an HP exemption anymore. Armor outside
   `[-90, +10]` needs `puzzleWall: true` declared or the lint flags it (Law 3).
4. **Add `weak`/`resist`/`immune`** arrays of damage-type strings matching the zone's palette
   (`elementalMult`, `game/combat.js:36-42`).
5. **Give it a wallet** — `gold: <role band>` and, optionally, a `loadout: [{ name, value }, ...]`
   for carried potions/gear (Law 6f; its value counts toward Challenge GP but isn't lootable). No
   map spawn authors either field yet — see §6, "wallet/loadout population" — so any new enemy you
   price here is ahead of the retune curve, not behind it.
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
   `game/wheel-model.js:29-31`, the raw fraction computed in the `cleaveAttack` case and passed to
   `_aoeStrike` so `computeHit` rounds once, `game/main.js:3178-3190`); Spin = ⅖ weapon damage per
   target (documented `game/wheel-model.js:33`, `spinAttack` case, `game/main.js:3192-3203`) —
   fully surrounded (8 targets) that's 3.2× total, "free" because positioning/risk is the payment,
   not gold or mana.
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

**ENEMIES (TTK vs the reference loadout; TTD vs the reference player, 100 HP / 0 armor) — hp is
always 100 (Law 0), armor is the durability axis (Law 3), `chal_gp` is Challenge GP (Law 6f)**

| zone/id | type | armor | dmg | chal_gp | ttk_lazy | ttk_informed | ttd |
|---|---|---|---|---|---|---|---|
| bank/bank-financier | Banker | −80 | 0 | 0 | 1 | 1 | — |
| borgir/borgir_boss | Boss | −15 | 0 | 0 | 3 | 2 | — |
| canyon/pike | Pike | −15 | 6 | 0 | 3 | 2 | 17 |
| canyon/canyon-rat-1 | Rat | −80 | 4 | 0 | 1 | 1 | 25 |
| canyon/canyon-rat-2 | Rat | −80 | 4 | 0 | 1 | 1 | 25 |
| casino/casino-pit-boss | Operator | −80 | 0 | 0 | 1 | 1 | — |
| circus/clown1 | Carnival Clown | −80 | 4 | 0 | 1 | 1 | 25 |
| diner/diner-cook | Cook | −80 | 0 | 0 | 1 | 1 | — |
| downtown/dt-recipient | Stranger | −80 | 0 | 0 | 1 | 1 | — |
| downtown/dt-merch1 | Vendor | −80 | 0 | 0 | 1 | 1 | — |
| downtown/dt-merch2 | Vendor | −80 | 0 | 0 | 1 | 1 | — |
| downtown/dt-folk1 | Violencian | −80 | 0 | 0 | 1 | 1 | — |
| downtown/dt-folk2 | Violencian | −80 | 0 | 0 | 1 | 1 | — |
| downtown/dt-platero | Violencian | −80 | 0 | 0 | 1 | 1 | — |
| factory/green1 | Greedy Green | −30 | 5 | 0 | 2 | 2 | 20 |
| factory/puck | Puck | −30 | 1 | 0 | 2 | 2 | 100 |
| graveyard/skel1 | Rattling Skeleton | −80 | 4 | 0 | 1 | 1 | 25 |
| sewer/carrion | Carrion | −80 | 0 | 0 | 1 | 1 | — |
| sewer/e6 | Fungus King | −5 | 10 | 0 | 4 | 3 | 10 |
| sewer/e5 | Ghost Fungus | −80 | 4 | 0 | 1 | 1 | 25 |
| sewer/e3 | Red Fungus | −30 | 6 | 0 | 2 | 2 | 17 |
| sewer/e4 | Red Fungus | −30 | 6 | 0 | 2 | 2 | 17 |
| sewer/e1 | Violet Fungus | −30 | 5 | 0 | 2 | 2 | 20 |
| sewer/e2 | Violet Fungus | −30 | 5 | 0 | 2 | 2 | 20 |
| sewer/wererat | Wererat | 0 | 12 | 0 | 5 | 3 | 9 |
| town/townie-hooch | Bootlegger | −80 | 0 | 0 | 1 | 1 | — |
| town/townie-e | Violencian | −80 | 0 | 0 | 1 | 1 | — |
| town/townie-glunk | Violencian | −80 | 0 | 0 | 1 | 1 | — |
| town/townie-knuckles | Violencian | −80 | 2 | 0 | 1 | 1 | 50 |
| town/townie-macc | Violencian | −80 | 0 | 0 | 1 | 1 | — |
| town/townie-mince | Violencian | −80 | 0 | 0 | 1 | 1 | — |
| town/townie-praline | Violencian | −80 | 0 | 0 | 1 | 1 | — |
| town/townie-s | Violencian | −80 | 0 | 0 | 1 | 1 | — |
| town/townie-w | Violencian | −80 | 0 | 0 | 1 | 1 | — |

**The Law 0 worklist is CLOSED.** The retune (Task 14) took every roster entry above to hp 100 /
negative armor per the fragility stops (Law 3); the golden's `LINT` section dropped from 34 Law 0
flags + 1 Law 1 flag (35 total) to **1 flag total** — `coneOfCold`, still below the spell floor (see
SPELLS above), unrelated to Round 2. The sewer rat spawned by the set-piece script
(`game/sewer-setpiece.js:32`, `hp: 100, armor: -80, vermin: true`) is dynamic (not part of the
static map roster the harness scans) and was already retuned alongside it; the two static
`canyon-rat` entries above got the same `-80` in the same pass (`game/canyon-map.json`). Every
`chal_gp` above reads 0 — no map spawn authors `gold` or `loadout` yet (see the Ruled/Open sections
below).

## Ruled 2026-07-24

- **Townsfolk-as-combatants — RESOLVED.** They're 100-HP people at −80 armor, same as any other
  vermin/townsfolk-role spawn — a Violencian goes down in one punch, because this is Violencetown.
  No third non-combatant category; no carve-out from Law 0.
- **Shove → backstab window — RESOLVED: spins.** A shove turns its victim clean around
  (`[You shove X so hard they spin around!]`) and buys exactly one recovery turn, hence exactly one
  backstab window — not a guaranteed free hit, and not indefinite. Feared-and-fleeing backstabs
  remain canon alongside it. See Law 2 above for the full mechanism + citations.
- **The boss frame — RESOLVED in design, deferred in code.** The dread display IS the number: a
  2,500 GP boss reads as a 2,500-point problem outright (`2,500g`), no Kingdom-Hearts multi-bar
  needed to sell it. The dedicated boss frame itself (any richer rendering than the flat number)
  stays deferred to the first boss build — the current nameplate pip row (`game/renderer.js:1097-
  1133`) already reads the composite (`challengeGp`) and explicitly punts the multi-bar to that
  future frame.

## Open rulings (awaiting Caelan)

- **Wallet/loadout population.** The economy faucet is 0 in every zone right now — no map spawn
  authors a `gold` or `loadout` value yet (`grep '"gold"' game/*.json` and `grep '"loadout"'
  game/*.json` both return nothing). The Task 14 retune populated `armor` everywhere and `vermin` on
  the three rats (two canyon, one dynamic sewer); it deliberately did NOT populate wallets — Law 6's
  mechanics (`transferGold`, `burnGold`, `healPurchase`, `challengeGp`, pips) are fully wired and
  tested but have nothing to move. Populating role-band wallets/loadouts across the roster is
  content work, not a code task.

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
