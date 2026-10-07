# Poisons — Fire Blood and Sludge Brain

**Status:** built and verified (2026-10-07), pushed, not merged. Branch `feature/poisons`, cut from
`chore/trim-followups` (`c05a36d`). Results in *As built* at the end.
Built in the stages below; the merge to `dev` is Caelan's call, then v0.28.0 ships trim + one clock
+ poisons together.

## Why

A *poition* is a potion or a poison depending on who drinks it, but every poition placed so far is a
potion. Caelan's ruling (2026-10-04/06): add the poison half, starting with two damage-over-time
poisons that enemies throw at you, and that you can find and use yourself.

## The rulings

| Question | Ruling |
| --- | --- |
| The Fire Bottle overlaps Fire Blood | **Fire Blood replaces the Fire Bottle** everywhere |
| What Fire Blood does | Whoever it lands on (or drinks it) **burns** 5 a turn for 5 turns **and has fire blood**: while both last, **every melee or ranged hit they land sets the target burning for 3 turns**. Victims do not spread it further |
| Can the player drink it? | **Yes, on purpose** — a risky power-up. The burn floors at 1 HP like every DoT on the player (Law 7) |
| What Sludge Brain does | No mana. It leaves a **3-tile sludge puddle: the impact tile and the two forward diagonals** (a fan opening away from the thrower). Walls are skipped |
| What the puddle does | Ending a turn in it applies the **existing Sludge DoT** (soap cures it; sewer dwellers are healed instead). It **dries after 8 actions**. It is a hazard: held walks stop at its edge |
| Who throws | Enemies throw **only these two** — never the Sludge Sacks they already carry |
| Carriers | Fire Blood: the **Carnival Clown** and **one sewer Red Fungus**. The other former Fire Bottle carriers (the second Red Fungus, the Fungus King, the Wererat) get a **Foil Hat** instead, same kit value (re-ruled 2026-10-07: a Sludge Sack was the first pick, but it heals sewer dwellers, see *As built*). Sludge Brain: **one sewer enemy** |
| Placement | One pickup each to start — **Fire Blood in the Carnival, Sludge Brain in the Sewer**. Caelan re-places them later in Tiled |
| Name | **Sludge Brain** stays |
| Later, not here | Barrels and other props catching fire |

## Design details (mine, to be checked)

- **Fire Blood the item** keeps the Fire Bottle's numbers where they still fit: thrown, range 5, the
  existing 3×3 burst (full turns at the centre, half at the edge), `damageType: 'fire'`. Its poition
  is `{ stat: 'health', amount: -5, turns: 5, as: 'fire' }` plus `fireBlood: true`. Value re-pegged
  by the balance harness's DoT ladder (5 turns instead of 3).
- **The two statuses:** `fire` (the existing burning DoT) and a new `fire_blood` rider with no tick.
  Contagion needs **both** active on the attacker. A hit sets the victim's `fire` to
  `max(current, 3)` turns at 5 a tick; it never grants `fire_blood`, so it never chains.
- **Hit seams that carry the contagion:** the player's hits (`combatAttack`: melee, spells, tricks),
  an enemy's hit on the player (`applyDamageToPlayer`), and an ally's hit (`_allyTakeTurn`). Thrown
  items and DoT ticks do not spread it.
- **Drinking:** Fire Blood sits in the THROW column of the item bar. The inspector offers a second
  action, **Drink**, for any item marked `drinkable`; drinking applies both statuses to yourself and
  costs the turn.
- **Sludge Brain the item:** thrown, range 5, no poition burst; its `puddle` field
  (`{ kind: 'sludge', turns: 8 }`) makes the landing tile and the two forward diagonals sludge. The
  throw's direction is the sign of (impact − thrower); for a straight throw the diagonals are the two
  45° turns of it (east → north-east and south-east), for a diagonal throw they are its two
  cardinal halves (south-east → east and south). Off-map or unwalkable tiles are skipped.
- **Puddles** are zone state, not map edits: `game._puddles = [{ x, y, kind, turnsLeft }]`, cleared on
  `_loadMap` (not saved — like the buyback). Each committed action (`_worldBeat`) dries them by one;
  then everyone standing in one (player and enemies) gets the sludge treatment. Re-landing on a
  puddle refreshes it to 8. The renderer draws them over the floor; `_autoRepeatShouldStop` treats a
  puddle like a hazard tile.
- **Enemy throws:** in the hostile turn, after the heal checks and before the melee check: an enemy
  that carries one of the two, can see you directly (the same `perceives` DIRECT it chases on), and
  stands 2..5 tiles away throws it at your tile — the item leaves its kit. One throw per item.
  Fire Blood lands its burst on you (and any of its own side in the 3×3 is spared); Sludge Brain
  lays its puddle fan from the thrower toward you. Deterministic — no RNG.
- **Kits stay inside their gold bands** (`balance:check` enforces Law 4).
- **Copy** states what things do, plainly (no jokes): Fire Blood, Sludge Brain, the log lines.

## Stages

1. **Fire Blood** — item (replaces `fire_bottle` in items, sprites, kits, the default-kit table,
   tests), the `fire_blood` rider, contagion at the three seams, Drink in the inspector.
2. **Sludge Brain + puddles** — item, the puddle state, fan geometry, the per-action tick, hazard
   walk-stop, rendering, zone clear.
3. **Enemies throw** — the AI choice, carriers and kit swaps, the two pickups.
4. **Verify + as built** — tests, balance, naming, autoplay (read the trace: the Red Fungus now
   throws on the quest-1 path, so drift is expected and must be explained), a real-game smoke of
   every piece, then this section's *As built*.

---

## As built (2026-10-07)

| Stage | Commit | Tests (tests / suites / fail) |
| --- | --- | --- |
| spec | `2163a9c` | — |
| 1 Fire Blood | `9c87846` | 1860 / 334 / 0 |
| 2 Sludge Brain + puddles | `df569bb` | 1876 / 338 / 0 |
| 3 enemies throw, carriers, pickups | this commit | 1888 / 342 / 0 |

Every stage passed `npm test`, the naming gate (0 lines) and `balance:check` (0 flags; the golden
moves only by the kit values named below). New tests: `fire-blood`, `sludge-brain`, `enemy-throws`,
each mutation-checked (a mutant that survived — no sight check on a throw — got a stronger test).

**Details settled while building:**
- Fire Blood is pegged at 17 (the DoT ladder for 5×5); the default-kit table follows (+5 GP a row).
- The device has three action rows, so a drinkable throw item's primary row is **Drink** (its Use
  did nothing there). Throwing stays on the item bar and the wheel.
- Sludge Brain is valued at 12. The sewer's carrier is the **Ghost Fungus** (`e5`).
- Pickups: Fire Blood at Carnival (11,3); Sludge Brain at Sewer (5,5), deliberately off quest 1's
  walking line (row 10), so the autoplay does not pick it up.
- The Clown's purse went from 5 to 7 GP: with Fire Blood its kit was 9% liquid, under Law 6's 10%.
- An enemy throws at the first chance: it sees you directly, you are 2 tiles away up to the item's
  range. Fire Blood thrown at you lands on you only (no 3×3 on its own side).

**The kit-swap finding.** The spec first gave the three former bottle carriers a Sludge Sack. A
Sludge Sack heals sewer dwellers, so they ate it: measured with enemy throws switched off, the
fighter autoplay could no longer finish quest 1 (it looped defeats in the sewer). Caelan re-ruled
to an item they can't eat — a **Foil Hat** (same value 10, drops as loot).

**Autoplay** — both profiles finish quest 1.

| Run | Before (`dev`, one clock) | After |
| --- | --- | --- |
| fighter | 113 turns, `ac7557e6` | 94 turns, `a37d7d01` |
| sneak | 223 turns, `7b270cb0` | 192 turns, `b13490f7` |

Ablation: with enemy throws off and the Foil Hats in place, both runs match the old golden exactly
(113 / 223), so the whole delta is the new throws. Counted from the full logs of an instrumented run:
the Ghost Fungus throws Sludge Brain once per run and you stand in its puddle once; **Fire Blood is
never thrown on quest 1's path** (the Red Fungus never gets a 2–5 tile shot), so the browser smoke
proves it instead. The remaining Sludge Sacks eaten are the ones the fungi always carried.

**Real game** (headless Chrome over CDP, `dev-server.py`, console clean):
- The Clown, hunting you from 3 tiles, throws Fire Blood: you burn with fire blood; your next hit
  sets the Clown burning for 3 turns.
- Drinking Fire Blood through the device's real tap path: one turn, you burn with fire blood.
- Throwing Sludge Brain east lays (4,10), (5,9), (5,11) — drawn in the sludge tile's art; a held walk
  stops one tile short; one fresh press steps in and you get Sludge; 8 actions later it is gone.
- The Ghost Fungus throws Sludge Brain at you: the fan lands around you, and you get Sludge.
- Leaving the zone clears the puddles.

**Not done (later):** props catching fire (his barrel idea); an enemy-thrown Fire Blood bursting on
its own side.

