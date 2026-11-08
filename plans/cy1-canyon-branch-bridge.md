# CY1 — the Canyon is a branch

## Goal

The North bridge forks Chapter Two. A hot engine crashes you into the Canyon; a tank of alcohol
ramps you straight over into Downtown. Today the ramp route leaves "Out of the Canyon" counted in
the Quests tab even though it can never be started, so the log reads 2 of 3 forever. And every
walk back onto the bridge replays the crash or ramp cutscene.

After this slice:

- The Quests tab counts only the route you took. On the ramp route the Canyon quest is left out of
  the total; on the Canyon route it counts as it does today.
- The bridge cutscene plays once. After the first crossing, by either route, stepping onto the
  bridge mouth is an ordinary walk into Downtown: no shake, no flash, no crash.

## Rulings it rests on

- **CYR1, his pick (a):** the Canyon is a branch. The quest log counts only the route you took, and
  after the first crossing the bridge is an ordinary walkway to Downtown.

## How

- The quest engine learns which way you crossed (`bridgeRoute()`: `'ramp'`, `'canyon'` or null).
  The arrival code in `main.js` records it as a quest flag the moment you land (in the Canyon or in
  Downtown), so it rides the existing save. Older saves with no flag read it from quest state: the
  Canyon quest started means the Canyon route; the delivery quest started without it means the
  ramp.
- The Canyon quest is marked as the Canyon branch. `getCompletedCount` leaves a branch quest out
  of both numbers once you have taken the other route.
- In `_doMove`, the bridge mouth plays the cutscene only while no route is known. Once one is, it
  queues an ordinary transition to Downtown's own spawn point (where the ramp lands you), so the
  walk goes through the same map-change path every door uses.

## Acceptance

- Ramp route: the Quests tab's count leaves the Canyon quest out (2 of 2 at the end, not 2 of 3).
- Canyon route: it counts as today.
- After the first crossing, the bridge walks you to Downtown with no cutscene, whichever route you
  took the first time.
- `tests/canyon-branch.test.js` walks the bridge through the real keydown handler with real key
  codes.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass. Quest 1's autoplay
  ends at the car, so its golden must not move.

## Out of scope

- Any new line of copy. The plain crossing uses the generic transition line every unlabelled door
  already logs.
- Before any crossing, the count is unchanged (the Canyon quest is still in the total).
- Downtown's south exit back to the old town is already an ordinary door; it is untouched.
- Changing where the walk lands in Downtown: it uses the map's own spawn point, as the ramp does.
