# FD2 - carrying Mola Cola into the Wilderness brings a bear for it

## Goal
The second row of the interaction table (game/interactions.js). Walk into the Wilderness
carrying Mola Cola and one bear comes in from the edge for it, exactly the way the polar bears
do in the frozen area (FD1): it chases, it hits for real, and it takes the cola and leaves if you
drop every can.

## Acceptance
- With Mola Cola in the bag, entering the Wilderness brings one hostile bear in from the map edge, once per entry.
- Without the cola, nothing comes.
- The bear has art of its own (a recolour of the polar bear, brown) and is listed in the balance harness.
- A test walks in with real arrow keys, cola in the bag.
- npm test, balance:check, the naming grep and autoplay:check pass. The balance golden gains one row.
- Evidence: a GIF at 3440x1440 of the bear arriving.

## Rulings it rests on
- FDR4, pick (a): the bear is the polar bear's art recoloured brown with the recolour tool.
- FD1 (done): the table row, the pack effect and the "leaves when the cola is gone" rule are reused.

## Choices made here
- Its stats start as the polar bear's, copied from that entry at load; the balance bench lists the row.
- Its name is the stand-in `[Bear]`; its note and examine text are `[TEXT]`.
- The bear is defined in game/enemies.js (it is not a slot entry nor a map spawn) and the balance
  harness and content validator list it by name.

## Out of scope
- Final name, note text, tuning numbers (all stand-ins until Caelan's say).
- Accepting the new balance golden: needs its own ruling.
