# A Tiger's Blood Ice Cone you can carry

## Goal

Add the Tiger's Blood Ice Cone as an item. It sits in the bag with its own picture, it can be
examined, and carrying it does nothing yet. Its description is the placeholder `[TEXT]` until
Caelan writes it.

## Acceptance

- `ITEMS.tigers_blood_ice_cone` exists, named `[Tiger's Blood Ice Cone]`, and draws from its own
  picture, not the plain-bag fallback.
- Carrying it has no effect: no use, no equip slot, no stat, and no game code reads its id beyond
  the item table and the sprite table.
- Examining it works, on the ground and in the bag, and the description it shows is `[TEXT]`.
- A new test, `tests/ice-cone.test.js`, pins all of the above and rebuilds the picture pixel by
  pixel from the generator's own tables.
- Screenshots at 3440x1440 of the cone in the bag, plus a close-up (scratchpad only).
- `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

## Rulings it rests on

- **The name** is Caelan's own: Tiger's Blood Ice Cone.
- **What carrying it does**: nothing for now. Later, ants will come for it once ants exist, except
  where it is too cold. Neither ants nor cold are built here.
- **The picture (ICR6, option a)**: start from Kenney's Tiny Ski snowy pine (CC0), keep its top
  half and mirror it below its widest row into a 16x15 double point. Red syrup on the top tip
  fades to white ice toward the middle; the mirrored bottom half is repainted as a paper sleeve,
  with one flat paper colour, a darker fold line and a band where the sleeve meets the ice. The
  outline stays the Tiny packs' plum, one pixel wide.

## How the picture is made

`tools/gen_ice_cone.py` carries the pine's 16x16 pixels inline, so it runs anywhere (it checks
them against the Kenney library copy when that is present). It takes the pine's outer edge for
rows 0 to 7, mirrors it, draws a one-pixel plum outline, and fills the inside from a small table
of painted rows using only colours that already appear in the Tiny packs. It writes
`game/assets-placeholder/ice_cone.png`, a 16x16 cell with the cone in its bottom 15 rows.
`game/sprites.js` loads it as the `iceCone` sheet, counted as already in the house style so the
draw-time outline pass leaves it alone.

## Out of scope

- The description text (Caelan's to write).
- Ants, cold, eating it, a price, or anywhere in the world it can be found. The item's value is
  left at 0, the same as the other items that are not for sale.
