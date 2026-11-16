# EA1 — in a fight, Eat and Run sit on the arc beside your attacks

## Goal
The fight arc (plans/fa1-fight-arc.md) holds attacks only. Add two more slots after the attacks:
Eat and Run, on the keys 9 and 0. Each slot is the wheel's own node (Treat > Eat, Flight > Run),
found by key, so there is no second copy of either action.

## Acceptance
- In a fight the arc shows Eat then Run after the attacks. Attacks keep slots 1-8; Eat is always
  slot 9 and Run slot 10 (a position belongs to its number, as the arc already rules).
- Keys 9 and 0 fire them in a fight. Outside a fight, 9 still picks bag slot 9 and 0 does nothing.
- A greyed Eat (nothing to eat, or full health) logs the wheel's existing reason and spends nothing.
- The arc still fits with ten positions at 3440x1440 and at phone width (the existing
  "covers nothing" test runs over every size).
- A test presses real keys 9 and 0 and reads the outcome.
- npm test, balance:check, naming grep and autoplay:check pass.

## Ruling it rests on
EA1R1, picked (a): "Yes: Eat and Run after the attacks, up to 10 slots". The arc gains two slots
on keys 9 and 0; 9 no longer picks a bag slot mid-fight.

## Changes to existing tests
The FA1 tests that pin "eight positions" and "9 is still the bag in a fight" change, because this
ruling changes that behaviour. They are edited in their own commit.

## Out of scope
Cleanse and Wait stay in the wheel. No new copy, labels or art: the slots use the wheel's labels
and the arc's existing stand-in look. Slot size and radii are left as they are unless ten slots
cannot fit.
