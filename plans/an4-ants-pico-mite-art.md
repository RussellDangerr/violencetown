# AN4 — the ants look like the Pico-8 mite, two or three to a tile

## Goal

The swarm (AN2) shipped with each ant drawn as the renderer's flat tinted square, because its art
needed a generator script, an image and a sprite entry that AN2 could not touch. This slice draws
the real ants.

An ant is a small tool-made picture of two or three mites, so one ant on one tile already reads as a
crowd. The mites start from Kenney's Pico-8 Platformer mite (CC0), reshaped a little (body as three
dots, three legs a side) and drawn in the Tiny packs' outline colour.

An ant also stops looking like an enemy: no HP bar, no type label, no K.O. word. A swarm reads as
pests, not a row of fights.

## How it works, in plain words

- `tools/gen_ant.py` writes `game/assets/ant.png`: one row of four 16x16 cells holding two, three,
  three and two mites in different directions. It follows the other `tools/gen_*.py` scripts: it
  runs on its own, carries the source mite inline, and checks it against the Kenney sheet when that
  is on disk. `--check` says whether the file on disk matches.
- `game/sprites.js` registers the sheet as `ant` (a Tiny-style sheet, so the outline pass leaves it
  alone) and gives the `Ant` type an `ENEMY_SPRITES` entry whose `variants` are the four cells, one
  per ant by its id, the same way town citizens pick a look.
- `game/renderer.js` skips the HP bar, the wallet pips, the facing verb label and the K.O. tag for
  an ant. The sprite, its shadow and its hit flash are unchanged.
- `tests/sprite-coverage.test.js` lists `Ant` as a dynamically spawned type, so the "no orphaned
  sprite" and "every spawned type has art" checks cover it.
- `tests/ant-art.test.js` pins the picture and the draw: the sheet exists and holds only the Tiny
  ink, every cell holds two or three separate mites, an ant resolves to an `ant` cell, and drawing
  an ant through the real `_drawEnemySprite` paints that cell and none of the bars or labels.

## Acceptance

- Ants draw as the reshaped Pico-8 mite in the Tiny outline colour, two or three to a tile, not the
  red square.
- An ant shows no HP bar or type label.
- Close-up and 3440x1440 shots of a swarm on town ground and in the diner (scratchpad only).
- `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

## Rulings it rests on

- **ANR4, pick a (Caelan):** "The Pico-8 mite, two or three to a tile, reshaped a little (body as
  three dots, three legs a side) and recoloured to the Tiny outline colour." A small tool-made tile
  that reads as a crowd at once.
- **AN2R1, pick a (the loop, under the standing delegation):** the swarm shipped with plain squares;
  the art gets this slice.

## Placeholders

None in the copy. The exact dot-and-leg pattern, the mite sizes and where they sit in each cell are
this slice's own drawing and are for Caelan's eye.

## Out of scope

- Animation of the mites (they stand still, like every other Tiny sprite).
- Any change to how ants move, bite or spawn, and any other creature's art.
- A way to tell a latched ant from a free one by look alone.
