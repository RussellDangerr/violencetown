# go1-goo-status: goo is a status of its own

## Goal
The Factory's goo tile stops handing out Sludge. Stepping on it gives a new status, Goo, with
its own chip. For 3 turns the world takes a second beat after each of the player's moves (the
Slow Poition's rule); Soap washes it off. Examining the tile still reads Goo.

## Rulings it rests on
- GO1R1, pick a: goo slows you for 3 turns, Soap is the cure. The 3 turns and the Soap cure are
  numbers for the owner to tune.
- DT2 (merged): the goo tile was a sludge hazard; this swaps that.

## Acceptance
- Stepping on goo applies Goo, not Sludge; the chip shows a placeholder `[TEXT] Goo` name that
  fits the chip.
- While Goo lasts the world runs two beats per move; it ends on schedule (the extra beat does not
  spend Goo's turns, so 3 turns is 3 moves).
- Soap clears Goo.
- Shoe Bags keep goo off, as they do sludge (the existing `sludgeImmune` flag, reused).
- Examine reads as today.
- A test presses a real ArrowRight onto goo and checks the chip and the effect.

## Out of scope
- Goo as an element (GO2).
- Final chip name and colour, and any tuning of the 3 turns.
