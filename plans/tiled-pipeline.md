# Tiled pipeline — paint maps in Tiled, keep the game's JSON as the truth

**Status:** building on `feature/tiled-pipeline` (2026-09-27). First map: the Canyon.

## Why

Map geometry is typed by hand today — about 600 tile numbers per zone, no editor. The
2026-09-27 outside review (tech lead) named it the biggest cost in adding a zone, and
`architecture-and-game-feel.md` §2 deferred an editor "until map work feels heavyweight". The
empty `canyon-map.json` (`_scaffold`, 14×10 of wall and dead grass) is that point.

## Shape

- **`game/*-map.json` stays the only source of truth.** Tiled files are a working copy.
- **`tools/tiled.mjs`**, three commands (also `npm run tiled:import -- canyon` etc.):
  - `tileset` — writes `tiled/violencetown.tsx` + `.png`. **Tiled tile N is game tile id N**
    (gid N+1), painted from the same sprite refs the renderer uses (`tileRef`, `under`, a quad
    tile's top-left cell, `fallbackColor` when a tile has no art). Each tile carries its `TILES`
    name and `walkable` as properties. The painter is `tools/gen_tiled_tileset.py` (PIL, like the
    other `tools/gen_*.py`).
  - `import <map>` — `tiled/<map>.tmj`: one tile layer, plus one object layer per positioned list
    (`enemies`, `items`, `examinables`, `props`, `anchors`, `transitions`, `lights`, `containers`,
    `regions` as rectangles, `spawn`, `bossRoom`). Refuses to overwrite an existing `.tmj` without
    `--force`, so unsaved Tiled work is never clobbered.
  - `export <map>` — writes Tiled's edits back **surgically**: only the `tiles` array, `width` /
    `height`, and the `x`/`y` (`w`/`h` for regions) of objects that actually moved. Every other
    byte of the map file is left as it was (the maps use three different JSON styles; a
    re-serialise would churn them all).
- `tiled/` is generated and gitignored.

## Rules

- A no-op round trip (import, then export untouched) is byte-identical for every map — a test.
- Export refuses an empty cell or an id that isn't in `TILES`, and names the cells.
- Flipped/rotated tiles are refused (the renderer has no flips).
- Objects added or deleted in Tiled are reported and **not** applied. Author new entries in the
  JSON; Tiled moves them. (Placing new things from Tiled is a later step if this earns it.)
- After an export, `npm test` is the check (zone identity, tile coverage, world integrity).

## Out of scope

A Tiled JS extension that opens the game JSON directly; new-object authoring from Tiled; any
runtime change. Nothing under `game/` changes except map JSON the author exports.
