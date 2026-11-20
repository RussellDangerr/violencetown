# TW2: a tap you can't reach still moves you

## Goal
Tapping a wall, a prop, a blocked tile, a tile past the map edge or a tile with no route used to do
nothing. Now you walk to the reachable tile nearest the one you tapped, with no log line.

## Rulings it rests on
- TWR1, pick a: walk to the reachable tile nearest it, without a word. Ties go to the tile nearest
  you. A tap on your own tile does nothing.
- TW1 (merged): a tap on a tile you aim at takes you onto it. Untouched here.
- PCR3: no new player-visible text, so the plain-copy guard counts do not move.

## How
- `game/pathing.js`: `pathToNearest(game, from, to)` floods outward over the same steps `findPath`
  takes and returns the path to the reached tile nearest `to` (straight-line distance; the first
  one the flood meets wins a tie, which is the one fewest steps from you).
- `game/main.js` `_tapWalkTo`: a walkable tile with a route still takes `findPath`; anything else
  takes `pathToNearest`.

## Acceptance
- A tap on a wall, a sealed room, off the map, or past the search cap walks you toward it.
- Your own tile does nothing; standing on the nearest tile does nothing.
- `tests/tw2-unreachable-tap.test.js` covers each; npm test, balance:check, naming, limezu and
  autoplay:check pass.
- Frames at 3440x1440 of a tap behind a Town wall, before and after, kept outside the repo.

## Out of scope
Long-press and Target List behaviour, held-key walking, any text.
