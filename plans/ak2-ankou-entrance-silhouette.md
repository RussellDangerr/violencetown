# AK2: the Ankou's fight-entrance silhouette is its body alone

## Goal
AK1 gave the Ankou a see-through ghost drawn behind its skeleton. The fight entrance draws every
fighter as a flat silhouette using `_drawEnemySprite(..., { bodyOnly: true })`, meant to be the body
alone. The ghost is drawn before the `bodyOnly` early return, so the Ankou's silhouette carries a
dark halo the others lack. Skip the ghost when `bodyOnly` is set.

## Acceptance
- In the entrance silhouettes the Ankou draws as its body alone: no ghost cell.
- Standing, walking, and in a fight (after the entrance) the ghost still draws behind the body, as AK1 built.
- A test draws the Ankou with `bodyOnly` and checks that no ghost cell is drawn, and without it that the ghost is.
- Evidence: a 3440x1440 frame of the "spotted" entrance with the Ankou in it.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

## Rulings
None. The change restores what the AK1 plan and the renderer comment intended.

## Out of scope
The unicycle, which is drawn in the same early block. No one fights the assistant manager, so
it never reaches the entrance.
