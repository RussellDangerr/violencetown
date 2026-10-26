# IC3: a frozen area joins the Factory to the Wilderness

## Goal

A new small map sits between the Factory and the Wilderness. The Factory's cold room opens into
it, it runs out into the Wilderness, and an iced-over pond sits in it that you can walk on. Its
name is `[Frozen Area]` until Caelan names it.

## Acceptance

- You can walk from the Factory's cold room into the frozen area and out into the Wilderness,
  and back again the same way.
- The pond is iced over and walkable.
- The map's edge border is set and pinned in `tests/tile-coverage.test.js`.
- Screenshots at 3440x1440 of both doors and the pond.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

## Rulings it rests on

- Where the frozen area goes: Caelan picked a new map of its own. The Factory's cold room opens
  into it, and it runs out into the Wilderness (a whole new map and two new doors).
- The spine: the Factory is on it and the Wilderness is not. The new map is off the spine, like
  the Wilderness, so no Locked row moves.

## The build

- `game/frozen-map.json`: a small map of snow ringed by trees, `zoneName` `[Frozen Area]`, with a
  door on its north edge back to the Factory, a door on its east edge out to the Wilderness, and
  an iced-over pond in the middle (a `pond` region) that you can walk across. Its edge border is
  snow with trees.
- `game/factory-map.json`: the small south-east alcove becomes the cold room. Its back wall opens
  south into the frozen area.
- `game/wilderness-map.json`: a gap in the west fence leads into the frozen area.
- `game/data.js`: two walkable tile kinds, SNOW (70) and ICE (71).
- `game/sprites.js`: their pictures, from sheets already bundled (Caelan's eye on both picks).
  The raw `roguelikeSheet_transparent.png` is registered as a sheet (1px gutter, `padding: 1`).
  The open-water cells are not used for ice, because they are the river's colour and the river
  is water you cannot walk on.
- `game/world-map.js`: a box for the frozen area below the Factory and left of the Wilderness,
  joined to both, so "you are here" lands while you are in it.
- `plans/screen-fill.md` and `tests/tile-coverage.test.js`: the new border, changed together.
- `tests/frozen-area.test.js`: every door lands on open ground and can reach the door back, the
  map is one walkable piece, the pond is ice you can walk on, and the world map joins it up.

## A ruling taken while building

The first pass found no ice or snow tile, and the slice could not add one inside its first scope.
That was asked as a ruling; the pick was to widen the scope to the tile, sprite and world-map
files and build the frozen look now.

## Out of scope

- Creatures, loot and quest beats in the frozen area (later slices).
- The area's name and any copy beyond `[TEXT]` placeholders.
- Where the ice cone comes from beyond the map existing.
