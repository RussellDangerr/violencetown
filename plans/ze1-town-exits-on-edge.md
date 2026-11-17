# ZE1: Town's exits sit on its edge and cover the whole road

## Goal
An exit between two outdoor zones sits on the map's very last row or column, on every walkable
tile of the road crossing it. The map files say so themselves, so the chevrons, the exit tiles
and the data all agree.

## Ruling it rests on
ZER1, picked (a): on the map's very last row or column, on every tile of the road crossing it,
with the chevrons there.

## What changes
- Town: west exits x=0 rows 10-15, east exits x=33 rows 10-15, south exits y=25 cols 14-19.
  (The map loader already fills these openings at load time, so play does not move; the files
  now state it.)
- Factory: its east exit to Town is x=29, rows 14-15.
- Carnival: its north exit to Town is y=0, cols 4-5; its exit to the Graveyard is y=21, cols 52-53.
- Landings: each one lands a tile inside the exit it comes through, so walking back puts you
  beside the exit you took (Town west lands at Factory x=28; Sewer back to Town lands x=32;
  Carnival back to Town lands y=24; Town south lands Carnival y=1).
- Building doors (Borgir, the compactor room) are exempt.

## Acceptance
- A content test reads every map: an exit between two outdoor zones is on the last row or
  column and covers every walkable tile of its crossing. The zones that fail today sit on a
  named list that the follow-up (ZE2) empties; nothing new may fail.
- Each exit lands on a walkable tile that is not itself an exit.
- npm test, balance:check, the naming grep and autoplay:check pass. If the autoplay golden
  moves, that is filed as an accept question, not re-recorded.
- Evidence: 3440x1440 frames of Town's south and east edges with chevrons on.

## Out of scope
The Graveyard, Wilderness, Valley, Tunnels, Frozen, Canyon and Gorge exits (ZE2). Tiled
files, the golden, and any copy changes.
