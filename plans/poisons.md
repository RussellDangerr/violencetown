# Poisons — Fire Blood and Sludge Brain

**Status:** spec (2026-10-06). Branch `feature/poisons`, cut from `chore/trim-followups` (`c05a36d`).
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
| Carriers | Fire Blood: the **Carnival Clown** and **one sewer Red Fungus**. The other former Fire Bottle carriers (the second Red Fungus, the Fungus King, the Wererat) get a **Sludge Sack** instead, same kit value. Sludge Brain: **one sewer enemy** |
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
