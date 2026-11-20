# MO1: search a grave, fall into the Tunnels, meet the Molemen, walk out

## Goal

One grave in the Graveyard, at (23,23), is different from the rest. Examine it and you fall
through into a new map off the spine called the Tunnels. Two Molemen are down there and hunt
you; they can be fought to the end. A door at the far end comes out in the Wilderness's east
wall, so you are never stuck. There is no way back up to the Graveyard.

## Acceptance

- Examining the grave at (23,23) drops you into the Tunnels with a plain line. The other graves
  answer as before.
- Two Molemen hunt you there and can be fought to the end.
- The Tunnels' far door lands in the Wilderness. A test walks the whole way with real keys from
  the Graveyard round to the Graveyard.
- The Map tab joins the Tunnels to the Graveyard and the Wilderness, and "you are here" is right.
- `plans/spine.md` lists the Tunnels among the maps off the spine. No Locked row changes.
- `tools/balance-golden.txt` gains the Tunnels' rows and nothing else moves, in its own commit.
- The autoplay golden does not move.
- 3440x1440 frames of the grave, the fall and the Tunnels.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

## Rulings it rests on

- plans/spine.md SA-6 allows new areas beyond the main map. The Tunnels is one, so no Locked row
  moves.
- GV2R1: the cave has no map and waits as a later map off the Valley. This slice neither builds
  it nor duplicates it. Joining the cave later is one door from here.
- Standing rule on copy (LOOP.md section 6): where the card says [TEXT], plain functional lines.
  Every line is listed for the owner's eye. His names "Tunnels" and "Molemen" are kept.

## The build

- `game/tunnels-map.json`: a small map of placeholder terrain (stand-in tiles for repainting), a
  landing for the fall, a far door east, two Molemen placed by hand.
- `game/graveyard-map.json`: one examinable at (23,23) carrying a `fallTo`.
- `game/examine.js`: an examinable with `fallTo` is reported to the caller, who drops the player.
- `game/main.js`: the map change now has one method both the turn end and the fall use; the fall
  calls it. A save's map name for the Tunnels.
- `game/slots.js`: a `moleman` registry entry, the Rattling Skeleton's numbers and kit.
- `game/sprites.js`: the Moleman's art, an existing cell.
- `game/wilderness-map.json`: a doorway in the east wall, into the Tunnels.
- `game/world-map.js`: a box for the Tunnels, joined to the Graveyard and the Wilderness.
- Tests: `tests/tunnels-map.test.js` (doors, the fall, the Molemen, the walk with real keys, the
  world map), plus the border pin in `tests/tile-coverage.test.js` and a `fallTo` check in
  `tests/world-integrity.test.js`.

## Stand-ins (for the owner's eye)

Which grave, with nothing marking it; the Molemen's numbers and kit (the Rattling Skeleton's);
every line of text; the art cell; the map box's spot; the placeholder terrain.

## Out of scope

The cave, the Valley link, real art, real names beyond Tunnels and Molemen, any quest beat, any
loot beyond the Molemen's own kit.
