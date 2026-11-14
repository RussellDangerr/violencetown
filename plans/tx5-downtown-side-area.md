# TX5 — a small side area past a gate in Downtown

## Goal
Add one small off-spine map (16x12) reached from a fenced gate on Downtown's west edge. It carries
no beat and no enemies or items: ground, a border filler, a few props, one examinable and a door
back to Downtown. Nothing in play reaches it until TX6 swaps the fence for road.

## What changes
- `game/side-area-map.json`: new map, zone name `[SIDE AREA]` (a placeholder), door on its west
  edge back to Downtown's street, border filler the same forest as Downtown.
- `game/downtown-map.json`: the west-edge tile at (0,9) becomes a fence (tile 17, never 23, which
  tears down on any bump), with the door to the side area on that same tile. A fence cannot be
  stepped on, so the door is unreachable. Clear of the TX4 driver and taxi block.
- `game/world-map.js`: a box for the area at col 1, row 0, joined to DOWNTOWN; the diagram at the
  top is updated.
- `tests/tile-coverage.test.js` and `plans/screen-fill.md`: the filler table gains the new map, the
  two changed together.
- `tests/side-area.test.js`: loads the area, walks out of its door with real arrow keys, checks the
  landing is standable, the Map box and link, and that the fenced gate holds against bumping.

## Acceptance
1. The map loads; its door leads to Downtown onto walkable ground; its filler matches the table.
2. The World Map has a box joined to DOWNTOWN, labelled `[SIDE AREA]`.
3. Downtown's west gate is a fence, not walkable, not destructible by bumping.
4. A test loads the area and walks out with arrow keys.
5. Evidence frames: the area, the World Map, the fenced gate.

## Rulings
TX1 and HO1R4 (a): the area is off the spine and carries no beat. The name `[SIDE AREA]` and every
text are placeholders.

## Out of scope
Opening the gate (TX6), any enemy, item or story for the area, real names or copy.
