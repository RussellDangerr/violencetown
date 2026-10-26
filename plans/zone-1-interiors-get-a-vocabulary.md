# Zone 1 interiors get a vocabulary

**Status:** building on `feature/zone-1-interiors-get-a-vocabulary` (2026-10-25).
Follows `plans/zone-identity.md` Item 1.

## Goal

The Borgir, the diner, the bank and the casino are bare rooms: sidewalk floor, brick walls and
text-only examinables. The renderer draws nothing for an examinable, so you read "a greasy diner
counter" while standing on paving. This slice gives them furniture: counters, tables, chairs,
shelves and plants, so each room reads as the place it is.

## The ruling it rests on

*Where should Town's interior furniture come from?* Caelan picked **vendor Kenney's Roguelike
Interior Pack, outlined to match** (2026-10-25). The pack is CC0 (its `License.txt` says so) and it
is the only source with a counter. Its art is bevelled with no dark outline, so it goes through the
same outline tool as the floors and gravestones before the game uses it.

## Shape

- **`tools/gen_outlined_sheet.py`** gains a second output, `rlInterior_outlined.png`: one packed,
  gutter-free row of 16x16 cells cut from `roguelikeIndoor_transparent.png` (1px gutter, stride
  17). The floors' sheet is left byte-for-byte as it is.
- **Pieces that stand side by side are outlined together.** A counter is several cells in a row.
  Outlining each cell alone would draw a dark seam between them, so each run (a counter, a
  two-cell table) is assembled first, outlined once, then sliced back into cells. Any middle
  cell then fits between any other, with no seam.
- **Full-bleed pieces keep their size.** Most furniture fills its whole cell, so there is no
  transparent pixel outside it for an outline. Where a piece meets the cell edge, its own edge
  pixels (Kenney's dark brown border) are inked instead. Nothing is shrunk or cropped. Pieces with
  a margin (chairs, plants) get the usual outside stroke.
- **The ink is the Tiny packs' plum** (`TINY_INK`, #3F2631), the same colour the renderer's
  outline pass gives every other sprite from a foreign pack.
- **`game/sprites.js`** registers the sheet as `interior` (packed, padding 0, already in the house
  style so the runtime outline pass leaves it alone) and an `INTERIOR_SPRITES` column map that
  must match the script's printed order.
- **Furniture is props**, one per cell, in each map's `props` list: depth-sorted, solid, with
  the ground under them left as it is. No new tile ids.

## The pieces

| Piece | Source cells (col,row) | Used for |
|---|---|---|
| kitchen counter: left end, drawers, doors, grill, bottles, dishes, sink, right end | (0,12) (1,12) (2,12) (4,12) (5,12) (7,12) (8,12) (9,12), outlined as one run | Borgir and diner counters |
| service counter: left, middle, right | (8,15) (9,15) (10,15), outlined as one run | the bank |
| stove | (14,14) | the diner and Borgir kitchens |
| chairs: facing down, up, right, left | (0,2) (1,2) (2,2) (3,2) | dining tables, the bank's waiting seats |
| square table, round table | (5,3) (7,0) | dining |
| felt card table, left and right halves | (19,10) (20,10), outlined as one | the casino |
| bookshelves | (20,17) (21,17) | the bank |
| potted plants | (16,0) (17,0) | every room |

## Rooms (planned placement)

Paths stay open: the column from each spawn to its host (Borgir boss, cook, Financier, Pit Boss)
stays clear, and every host, examinable and the way out can still be reached from the door
(a test walks it), so nothing you talk to or examine is walled off.

- **Borgir:** a kitchen counter along the back wall, x4-12, that takes in the `borgir_counter`
  examinable (8,2), so the counter is a counter; the stove beside it; four square tables with a
  chair either side, clear of the middle three columns; plants in the four corners.
- **Diner:** a counter along the back wall, x3-8, over `diner_counter` (6,2), the stove beside it,
  a plant; two round tables with a chair either side; plants by the door.
- **Bank:** bookshelves along the back wall either side of the vault, a tile clear beside it; the
  service counter either side of the Financier, who stands in its gap; waiting chairs along the
  side walls; plants by the door.
- **Casino:** two felt card tables, two chairs above and two below each; plants in the corners.

An authored examinable answers before a prop, so the two counters still read their own text.

## Examining furniture

Furniture goes in as props, and every prop needs an examine name. Caelan ruled (2026-10-25)
that a piece says its plain name, in the same bracket style as graves and trees: `[Counter.]`,
`[Table.]`, `[Chair.]`, `[Shelf.]`, `[Plant.]`, `[Stove.]`. The bank's service counter reads as a
counter and the casino's felt table as a table.

## Acceptance

- The Interior Pack is in the game as one outlined sheet, made by `tools/gen_outlined_sheet.py`.
- The four rooms each get furniture from it, and the Borgir's counter is a real counter.
- The slot machine (`casino_slots`) and the vault door (`bank_vault`) stay exactly as they are:
  same examinable, same tile, no prop on them.
- Screenshots of all four rooms at 3440x1440, before and after.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.
- `tests/interior-furniture.test.js` holds the sheet to its column map, the generator's order,
  the packed size, an outline on every piece and no seam inside a run; and the rooms to their
  furniture: every piece placed on the floor, runs laid end to end, the two counters under their
  examinables, nothing walled off, and every piece examining as one of the six plain names.
- The pack's sheet and licence are bundled beside the other Kenney sheets, so the generator
  reruns from the repo and reproduces the committed strip byte for byte.

## Out of scope

- Interior floor and wall tiles (they would need new tile ids, and no bundled wall fits).
- A slot machine or vault door picture: neither exists in any pack surveyed, and Caelan holds the
  vault door as its own question.
- Moving any character, examinable or door.
- Any new copy: examinable text stays as it is.
