# FX69: a save that puts the player in a wall loads them on open ground

## Goal
`loadInto` clamps the saved player tile to the map but never checks it can be stood on, so a
save at (0,0) or (9999,-50) in the town loads the player idle inside a wall. After the fix the
player is moved to the nearest walkable tile.

## How
- `nearestWalkable(map, x, y)` in `game/save.js`: breadth-first from the tile, fixed neighbour
  order, so it is deterministic. If the search finds nothing it tries the map's spawn, then
  leaves the tile as given.
- Runs in `loadInto` after the tile diffs are re-applied, so a door the player opened counts.

## Acceptance
- A walkable saved tile is untouched.
- A wall tile, and an off-map tile (clamped first), load on the nearest open tile; same answer
  on repeat.
- A map with no open tile at all leaves the tile as given and does not hang.
- Existing save tests and autoplay unchanged.

## Rulings
None; loop-approved defect fix.

## Out of scope
Enemy overlap at the new tile.
