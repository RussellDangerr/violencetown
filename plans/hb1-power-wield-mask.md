# HB1: power wield, the ruled mask holds two two-handers

## Goal
While you wear one particular mask, each hand may hold its own two-handed weapon. Any other
mask (or none) refuses the second two-hander with a placeholder log line.

## What changes
- A new mask item, `[NAME: POWER-WIELD MASK]` (id `strongman_mask`), a head-slot mask with armour
  like the Rat Mask, carrying a `powerWield: true` flag. Its bag icon is a tinted placeholder cell.
- `game/hands.js` (new): `powerWielding(equipment)` says whether the head slot holds a
  power-wield mask, and the refusal text.
- Under the mask a two-hander fills only the hand it was put in (right hand `weapon`, left `left`),
  so one great sword in the right hand with an empty left is a legal pair, and the same def in
  both keys means two held swords. Without the mask nothing about the old rule changes (a
  two-hander fills both keys).
- Putting the mask on while a single two-hander fills both keys frees the left key. Taking it off,
  or swapping to another mask, bags a second two-hander and refills the left from the right.
- Equipping a two-hander into the left hand while the right already holds a two-hander, without
  the mask, is refused: the item stays in the bag and a `[TEXT]` line is logged.
- The GEAR tab's left plate may show Bare under the mask (the left two-hander is its own).

## Acceptance
- Wearing the mask, a two-hander in each hand holds; both show in `heldInHands`.
- Any other mask refuses the second two-hander.
- A save with the mask and two two-handers settles unchanged on load.
- 3440x1440 screenshot of two great swords held under the mask.
- npm test, balance:check, naming grep, autoplay:check pass.

## Rests on
- HR1 (a): a circus Strongman mask; the name is a placeholder until named; art is its own later.
- WS3 (done): two hands; a two-hander takes both.
- MS1 / MS3 (done): mask pattern, and the pinned armour list in tests/weapon-tiers.test.js.

## Out of scope
Final name, art, description, tuning (armour/price are placeholders), where the mask is found in
the world, refusal copy, and `game/save.js` (settling is done in `settleHands`, called there).
