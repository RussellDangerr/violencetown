# Map radicals — build maps out of hand-made pieces

**Status:** spec on `feature/map-radicals` (2026-10-24). First map: the Canyon.

## Why

A Chinese character is built from radicals, and a map can be built the same way: from small
pieces that are hand-made once and placed many times. Every map today is painted cell by cell
(`plans/tiled-pipeline.md` made that faster, not smaller). One person can't hand-paint a big world,
but one person can hand-make twenty good pieces and arrange them.

This is the authored-pieces-recombined approach (Spelunky's room templates, Crawl's vaults, Caves of
Qud's named places in a generated world). The pieces stay handcrafted; only their arrangement can
someday be seeded. **This slice builds the pieces and a placer. It does not build a generator.** A
generator comes after the pieces exist, because a generator with nothing good to place only makes
empty space.

The Canyon is the first map because it is still the 14×10 placeholder room (`_scaffold`), its
geometry is the author's, and five of its seven palette tiles (62–66) are on `KNOWN_UNPLACED`.

## Shape

- **`game/*-map.json` stays the only source of truth.** A radical is an authoring source. Placing
  one writes into the map JSON; the runtime never reads a radical. Nothing in play changes.
- **A radical** is `game/radicals/<zone>/<name>.json`, the same shape as a map, cut down:
  - `width`, `height`, `tiles`. A `tiles` cell may be `null`, which means *keep whatever the map
    has here*, so a piece needn't be a rectangle.
  - Optional `props` and `examinables`, positioned relative to the piece. Only content that is
    part of the piece travels with it (the wreck's description, the jutting rock). People, quests
    and exits stay in the map.
  - `marks`: named points, `{ id, x, y, slot? }`. A mark says *something goes here*: Pike's seat,
    the climb-out. `slot` names a `game/slots.js` slot id when the thing belongs to one
    (`canyon.npc`). Marks are written down so a generator can bind slots to them later. Today the
    placer only reports them.
  - `sockets`: the openings on its edges, `{ side: 'n'|'s'|'e'|'w', at, width }`, where a path is
    meant to go in or out.
  - `note`: one line on what the piece is, in the plain voice of the game's copy.
- **`tools/radicals.mjs`** (also `npm run radical:…`):
  - `place <zone>/<name> <map> <x> <y>`: stamps the piece into `game/<map>-map.json` with its
    top-left at (x, y). It writes the non-null tiles, appends the piece's props and examinables
    offset to map coordinates, and appends `{ name, x, y }` to the map's `_radicals` list (an
    underscore key, like `_scaffold`, which the runtime ignores). It prints each mark and socket in
    map coordinates. The write is surgical, like `tools/tiled.mjs export`: only `tiles`, the two
    lists and `_radicals` change.
  - It **refuses**, naming the cells, when the piece runs off the map; when a non-walkable cell
    would land on an enemy, item, anchor, transition, container or the spawn; or when a socket
    opens onto a non-walkable map tile that the piece doesn't cover. `--dry-run` prints what it
    would do.
- **Tiled paints radicals the same way it paints maps.** `tools/tiled.mjs import` / `export` take
  `radical:<zone>/<name>` as well as a map name. A `null` cell is an empty Tiled cell. Export
  refuses empty cells in a map but keeps them in a radical. Marks and sockets are object layers.
  New objects are still authored in the JSON and only moved in Tiled, as the pipeline does today.

## The Canyon's first four radicals

These come from the beats the Canyon already has (`canyon-map.json` `_scaffold`, `spine.md`
"Out of the Canyon"). Claude drafts each as a starting sketch in the Canyon palette. **The
geometry is Caelan's**: he repaints them in Tiled, and his version is the one that ships.

| Radical | What it is | Carries | Marks / sockets |
|---|---|---|---|
| `canyon/wreck` | Your car, folded around a boulder, beside the old silt | the `canyon_wreck` examinable | sockets on two sides |
| `canyon/wagon` | Pike's sunken covered wagon, ribs out of the silt | — | mark `npc` (slot `canyon.npc`) where Pike sits |
| `canyon/climb` | The rockface out, with a jutting rock | the `grappleRock` prop | mark `climb` where the anchor goes; socket on the floor side |
| `canyon/riverbed` | A run of DRY_RIVERBED with SCREE banks and a LEDGE | — | sockets at both ends |

Then the Canyon is rebuilt from them: grow the map (its new size is Caelan's call), fill it with
CANYON_FLOOR and CANYON_WALL, place the four, move Pike, the anchor and the critters onto their
marks in Tiled, and paint the seams by hand. CHASM and RIVER get placed wherever the painting wants
them. Each palette tile that ends up placed comes off `KNOWN_UNPLACED`.

## Rules

- Placing a radical, then exporting the map untouched from Tiled, is byte-identical. Placing the
  same piece twice at the same spot changes only `_radicals`.
- `tests/radicals.test.js`: every radical parses; its tiles are `null` or ids in `TILES`; its
  props and examinables sit inside it; its marks sit on walkable cells; its sockets sit on its edge
  and open onto walkable cells; each mark's `slot`, if given, is a key of `SLOTS` or a slot id in the
  `spine.md` beat table (`canyon.npc` is only in the table today; `SLOTS` holds `sewer.boss`
  alone). The test finds
  the radicals by reading `game/radicals/` and asserts it found more than zero.
- The placer's refusals are tested against broken copies, the way `matrixProblems` is.
- After the Canyon is rebuilt, `npm test` (tile coverage, zone identity, world integrity, pathing)
  and `npm run autoplay:check` are the check. The Canyon is a branch off quest 1's golden path
  (SP6), so the golden should not move. If it does, that is the signal to look.
- `game/radicals/` holds only tiles and props from sheets already in the repo (Kenney / CC0).

## Out of scope

A generator or any seeded placement. Runtime composition (a map listing its radicals and the game
assembling them at load). Rotated or mirrored placement (the renderer has no flips). Radicals for
any zone but the Canyon; Town and Downtown are next once these four earn it.

## Open questions for Caelan

1. The Canyon's new size. 30×20 holds the four pieces with room for seams; bigger means more to
   paint by hand.
2. Should Claude's first drafts of the four be painted from scratch in Tiled by him instead, so
   there is no draft to argue with?
