# WS4 — the hit splat shows slash, stab or crush

## Goal

When you hit something with a physical weapon, the hit splat says what kind of hit it was:
a slash, a stab or a crush. The kind comes from the weapon's class (the class table from WS1),
and when a class has more than one kind the game picks the best one against that target.

## Rests on

- **WS1 (merged):** every weapon names a class, and every class lists the hit kinds it lands,
  drawn from slash, stab and crush (`game/weapons.js` `WEAPON_CLASSES`, `weaponClassOf`).
- **WR1, pick b:** slash, stab and crush are real damage subtypes. Each meets weakness and
  resistance like any other type, and the game uses your best one against each target
  ("swords stab and slash, auto-picked").

## How it works

- `combat.js` gains `bestAttackKind(kinds, target)`: of a class's kinds, the one with the
  highest weak/resist/immune multiplier against the target (`elementalMult`). A tie goes to the
  class's first kind, so a sword is a slash unless a stab would do more.
- A hit only has a kind when it is physical: a weapon with its own `damageType` (the energy
  Ray Gun) keeps that type and shows no kind.
- The kind rides the splat particle as `kind`. The splat keeps its physical fill, motion and
  mark; the kind adds its own placeholder tag beside it, so the three read differently.
- `hit-splat.js` holds the kind-to-tag table, so the pick is unit-tested, not grepped.

## Acceptance

1. A hit of each kind draws a visibly different splat.
2. Damage numbers do not change: no enemy lists slash, stab or crush in its weak or resist
   lists today, so the best kind always multiplies by 1. The autoplay and balance goldens do
   not move.
3. Every gate passes and the splats are checked in the running game.

## Out of scope

- Giving any enemy a slash/stab/crush weakness or resistance (a tuning ruling).
- The final art for each kind: the tag is an obviously fake placeholder until it is ruled.
- Entrances by hit kind (F2b).
- Regenerating the splat atlas.
