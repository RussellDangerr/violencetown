# MK1: you can find the Rat Mask in a new game

## Goal
The Rat Mask exists as an item and nothing hands it out. After this, a new game has exactly one
place to get it: on the floor of the Sewer's north side room (the Crat's room), at a tile away
from the Crat, the two talkers and the door.

## Rulings it rests on
- MK1R1, pick a: the mask lies on the floor of that room; the builder picks the tile.
- PCR3, pick a: player-visible text is plain. The item is named Rat Mask, no brackets, and this
  slice adds no new player-facing text.

## Build
- One line in the `items` array of `game/sewer-north-map.json`: `{type: rat_mask, x: 1, y: 1}`.
  The corner is 5 tiles from the Crat and 4 from the nearest talker.
- `tests/mk1-rat-mask-source.test.js`.

## Acceptance
1. A scan of every map's items, shop stock and containers, the slots.js loadouts and the quests.js
   grants finds exactly one rat_mask source, in the north side room.
2. That tile is reachable on foot from the map's spawn (8-way, no corner cutting), with no mask.
3. Stepping on it with arrow keys puts the Rat Mask in the bag; worn, canStandOn is true at the
   Sewer grate (2,4).
4. Picked once: after save and reload it stays gone from the floor.
5. No other zone, shop or drop gains a rat_mask.
6. Gates: npm test, balance:check, naming grep, autoplay:check.

## Out of scope
Folding it into the main Sewer map (pick b), a Were-Rat loadout entry (pick c), art, and any text.
