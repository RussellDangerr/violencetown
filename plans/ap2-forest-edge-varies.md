# The forest past the map's edge varies

## Goal

Past the edge of Town, the Carnival and Downtown, every off-map cell draws the same tall green
tree today, so the forest is a wall of one tree. It now mixes the tall tree with a one-cell pine.
Each off-map cell picks its tree from a hash of its own position, so the same cell is always the
same tree, frame to frame and visit to visit.

## What changes

- A map's `border.prop` may be a single prop name (as today) or a list of names. A list picks one
  per off-map cell by the position hash (`idHash` in `game/sprites.js`).
- A new prop `pine`: Tiny Town's one-cell pine at col 4, row 2 (sheet is unpadded, 16px stride, so
  source x 64, y 32). Checked by rendering the sheet enlarged: that cell is the small green pine
  under the tall tree's two cells.
- Town, Carnival and Downtown name `["tree", "pine"]`.
- Rows past the south edge stay bare by the tallest tree in the list, so a pine never fills
  some of the bare row and leaves ragged gaps; the south exits stay clear exactly as today.

## Acceptance

1. Past Town's edge the forest mixes the tall tree and the pine, and the same cell always draws
   the same tree (test: the pick is a pure function of the cell; both trees appear).
2. A map whose border is a single prop (Graveyard, Wilderness, Frozen) draws exactly as today
   (test: the pick returns that prop for every cell).
3. A screenshot at 3440x1440 of Town's edge, looked at in full: reads as a forest, no seams,
   no cut-off trees.
4. `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

## Rulings it rests on

- APR2, "How should the forest past a map's edge vary?": Caelan picked (a), mix the tall green
  tree with a one-cell pine (Tiny Town 4,2).
- plans/screen-fill.md SF (2026-10-03): the forest vary was left as a later art pick; this is it.

## The pinned table changes on purpose

`tests/tile-coverage.test.js` pins each map's border to the table in `plans/screen-fill.md`.
Town, Carnival and Downtown change from `"tree"` to `["tree", "pine"]`; the table and the pin
change together, in their own commit.

## Out of scope

- Graveyard, Wilderness and Frozen keep their single tree.
- The mix ratio is an even split by list order; tuning it is not part of this slice.
- No new art; no change to collision, exits, or what is walkable.
