# FX62: a 3-kind knockout kills through a live Defence Poition

## Goal
A knockout (three weakness kinds on one hit, non-boss) is meant to empty the target.
`knockoutDamage` sizes the hit as hp + armor, but `Entity.takeDamage` also subtracts the
guard from a live Defence Poition (`guardOf`). So a guarded enemy survived a knockout.
Count the same guard in `knockoutDamage`.

## Acceptance
- A knockout on an enemy with a live Defence Poition kills it.
- A knockout on an unguarded entity gives the same numbers as before; the existing
  `tests/crit-kinds.test.js` passes unchanged.
- A weakening (negative defence) never makes the hit smaller than it was.
- New tests in `tests/knockout-guard.test.js`.

## Rulings
None; loop-approved under the standing delegation.

## Out of scope
Changing crit rules, boss handling, or any tuning number. No player-visible change beyond
the enemy dying.
