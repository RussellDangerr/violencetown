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

- `game/frozen-map.json`: a small fenced map, `zoneName` `[Frozen Area]`, with a door on its
  south edge back to the Factory, a door on its west edge out to the Wilderness, and a pond in
  the middle that is walkable ground.
- `game/factory-map.json`: the small north-east alcove becomes the cold room. Its back wall
  opens north into the frozen area.
- `game/wilderness-map.json`: a gap in the east fence leads into the frozen area.
- `tests/frozen-area.test.js`: every door lands on walkable ground next to a door back, and the
  pond is walkable. `tests/tile-coverage.test.js` pins the new map's border.

## Found while building

The game has no ice or snow tile. A tile kind lives in `game/data.js` (`TILES`) and its picture
in `game/sprites.js` (`ZONE_TILE_SPRITE_MAP`), and neither file is in this slice's scope. Until
a ruling widens the scope, the map uses existing ground tiles as stand-ins and the pond is
marked but not yet drawn as ice. The world-map subscreen (`game/world-map.js`) also has no box
for the new map, so "you are here" does not land while you are in it.

## Out of scope

- Creatures, loot and quest beats in the frozen area (later slices).
- The area's name and any copy beyond `[TEXT]` placeholders.
- Where the ice cone comes from beyond the map existing.
