# RC: the recolor tool

## Goal

A small Python tool, `tools/gen_recolor.py`, in the same house style as
`tools/gen_tiny_extra.py` and `tools/gen_outlined_sheet.py`: take one base
sprite cell, apply a named palette per variant, and write one packed sheet of
tinted variants. It makes enemy variants cheap. The rats are its first use.

The base is the Tiny Dungeon rat, cell (3,10). It has four colours: the plum
outline (also its tail), a body shade, a body light and the eye. The tool does
exact-colour swaps of the body and eye colours only. The outline colour and
the alpha mask are never touched, so every variant has the same silhouette and
outline as the original rat.

Output: `game/assets-placeholder/kenney/ratVariants_packed.png`, one row of
16x16 cells, gutter-free. The tool prints its column order when it runs.

## Palettes (rests on a ruling)

The colours come from the "bold and readable" pick:

- birthday: pink
- sludge: the purple of the sludge items (#9a52c8, hue 0.78, as in
  `gen_tiny_extra.py`)
- robot: steel grey, with a red eye
- undead: grey-green
- frost: pale ice blue
- pouch: sandy tan

The first three (the Carnival rats) take the first three columns, then the
other three. The exact RGB values within each named colour are the tool's
choice and are listed in it, one row per variant, so they are easy to change.

## Acceptance

- Running the tool regenerates the sheet byte for byte
  (`python tools/gen_recolor.py --check` exits 0 on a clean tree).
- Every variant cell keeps the base cell's outline colour and exact
  silhouette. Only the body and eye colours change.
- The sheet is registered in `game/sprites.js` SHEETS and listed in
  `TINY_STYLE_SHEETS`, so it is not outlined twice. A test pins its size.
- No enemy draws from it yet, so nothing on screen changes.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

## Out of scope

- Wiring any enemy to the new cells (no `ENEMY_SPRITES` entries).
- Rat names, stats, or where any rat appears.
- Recolouring any other sprite.
