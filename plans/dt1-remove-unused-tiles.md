# DT1 — remove the two tile types no map uses

## Goal

Two tile types are defined and given art but placed nowhere: the sewer "gap" tile (id 3) and the
old "boss trigger" tile (id 7). The trap the second one belonged to was removed long ago. Both sit
on the tile-coverage test's allowlist only so that test stays green. Take them out of the tile
table (`game/data.js`), the sewer tile art map (`game/sprites.js`) and the allowlist
(`tests/tile-coverage.test.js`).

## Acceptance

- Neither id is defined in `TILES`, mapped in any tile sprite map, or on `KNOWN_UNPLACED`.
- No map JSON, no radical (`game/radicals/`) and no Tiled tileset refers to them. Checked before
  building: no `*-map.json` or radical places id 3 or 7. The Tiled tileset is generated from
  `TILE_BY_ID` (`tools/tiled.mjs`), skips ids with no tile, and `tiled/` is not tracked, so it
  follows on its own; `tools/gen_tiled_tileset.py` paints only what the recipe lists and needs no
  change.
- No other id moves. Ids 3 and 7 are left as gaps with a "retired, don't reuse" note, the way 18,
  31 and 51 already are.
- A new test pins that both ids stay retired: not defined, not mapped, not allowlisted.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

## Rulings it rests on

None. Nothing a player sees changes, so this is the loop's own call (code structure only).

## Out of scope

- The other dead hooks the same audit named (hearing range, the essential flag, lasting poition
  ticks). They are tested and one data row from use, so they stay.
- Historical comments in `main.js` and `renderer.js` that mention the old tile-7 trap.
- Evidence: none possible; nothing on screen changes.
