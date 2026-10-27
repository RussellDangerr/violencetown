# FX6 — tier weapons get a damage number, and a missing one can't make an enemy unkillable

## Goal

The tier generator (`weaponTiers` / `WEAPON_TIERS` in `game/weapons.js`) makes five copies of
each weapon class's base, and the class base carries no damage number. Equip one and every swing
passes `undefined` into the hit math. `computeHit` turns that into NaN, and `Entity.takeDamage`
(`game/combat.js`) passes NaN straight through `Math.max`, so the enemy's HP becomes NaN. NaN is
never 0, so the enemy can never die.

This slice closes that hole three ways:

1. Every tier weapon carries a damage number, per the ruling below.
2. `takeDamage` and `attack` treat a hit that is not a number as a hit of 0, so the game's
   "at least 1 always lands" rule applies and the enemy's HP stays a real number.
3. The content check (`validateContent`) fails on any holdable weapon with no damage number.

None of the tier weapons is in the world, so nothing a player meets changes and the autoplay
goldens must not move.

## Acceptance checks

- Every tier weapon in `WEAPON_TIERS` has a damage number, per the ruling.
- A hit of `undefined`, `NaN`, `null` or a string leaves the target's HP a finite number, lands
  the minimum 1, and a target hit enough times dies.
- `validateContent` reports a problem for any weapon-slot def (`WEAPONS`, weapon-slot `ITEMS`,
  `WEAPON_TIERS`) whose damage is not a finite number, and reports none on today's content.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` pass; no golden moves.

## Rulings this rests on

- **What damage the tier weapons hit for:** the class's existing base weapon damage, scaled by
  the tier the same way armour tiers scale. Armour tiers keep every number the piece's own (WS5),
  so a tier keeps its base's damage at every tier.
- **What the classes with no weapon yet hit for:** the four classes with a weapon in the game
  copy it (sword 10 from the wooden sword, wand 22 from the ray gun, whip 12 from the lion whip,
  hammer 12 from the pipe); the other 14 classes take 10. Same number at every tier.
- **WS2 / WS5, the tier generator (merged):** a tier adds perks, not bigger numbers.

## How it lands

`WEAPON_CLASS_DAMAGE` in `game/weapons.js` holds one number per class, using only the values
above. `classBase` puts it on the class base, and the generator copies it to all five tiers. The
content check then also walks `WEAPON_TIERS`. The tier-generator test that pinned "a class base
carries no damage number" changes in its own commit, because the ruling changed that behaviour.

## Out of scope

- Placing any tier weapon in the world, a shop or a drop table.
- Real names, prices, perks or icon tints for tier weapons.
- The HUD weapon readout for a weapon with no damage (`game/renderer.js`), which is outside this
  slice's files and unreachable while no tier weapon is in the world.
