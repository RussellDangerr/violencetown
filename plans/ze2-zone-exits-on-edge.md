# ZE2: every other outdoor zone's exits sit on its edge and cover the road

## Goal
Finish what ZE1 started: every exit between two outdoor zones is on the map's last row or column
and covers every walkable tile of the road crossing it. ZE1's test then has no exception list.

## Ruling it rests on
ZER1, picked (a), the same as ZE1.

## What still fails after ZE1
Only the Graveyard's two roads. The Frozen zone, Wilderness, Valley, Tunnels, Canyon and Gorge
already pass.
- Graveyard north: the road is two tiles wide (cols 14-15) but only (14,0) is an exit.
- Graveyard south: the exit is at row 26, and the road stops at row 27 of 30. Rows 28-29 are
  solid wall.
- Wilderness north, back to the Graveyard: the road is two wide (cols 8-9) but only (8,0) is an exit.

## What changes
- Graveyard: the two solid rows under the south road are cut, so the map is 30x28. The south
  exit is then (14,27) and (15,27), on the last row. The arch stays at row 26, one tile in,
  matching the north arch at row 1 above the exit at row 0.
- Graveyard north: (15,0) becomes an exit next to (14,0).
- Wilderness north: (9,0) becomes an exit next to (8,0).
- Landings into and out of the Graveyard follow ZE1's rule, one tile inside the exit:
  - Carnival -> Graveyard lands at (14,1).
  - Graveyard -> Carnival lands at (52,20).
  - Graveyard -> Wilderness lands at (8,1).
  - Wilderness -> Graveyard lands at (14,26).
- Labels: copy changes are out of scope, so each new exit tile copies its neighbour's label word for word.

## Acceptance
- ZE1's exception list is empty, and the test no longer has one.
- Every outdoor exit lands on a walkable tile that is not itself an exit, in every map, not just ZE1's four.
- For every pair of outdoor zones, walking back lands beside the exit you came through.
- Building doors are unchanged.
- npm test, balance:check, the naming grep and autoplay:check all pass. A move in the autoplay
  golden is filed as an accept question, not re-recorded.
- Evidence: 3440x1440 frames of the Carnival, Factory and Graveyard exits.

## Out of scope
Exit label copy (brackets and `[TEXT]` placeholders), the other landings that already pass,
Tiled files, and the golden.
