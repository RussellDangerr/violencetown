# MP2: the Map dims the zones you haven't been to

## Goal
The Map keeps a saved set of the overworld zones you have stood in. Zones not in it draw
in the Map's existing dim colour (text and outline), so where you have been, and where
the quest wants you, stand out.

## Acceptance
1. A new game shows Town bright and every other zone dimmed; entering the Sewer brightens it.
2. Visited zones survive a save and reload. An old save with no record counts every zone
   as visited, so nothing it showed goes dark.
3. The test walks into the Sewer and opens the Map with real keys.
4. Evidence: 3440x1440 frames of the Map at a new game and after the Sewer.
5. npm test, balance:check, the naming grep and autoplay:check all pass.

## Design
- `game._visitedZones`: a Set of overworld zone names (an interior counts for its parent),
  noted in `_loadMap`. `null` means "no record" (an old save): nothing is dimmed.
- Saved as `world.visitedZones` (sorted names). Left out for a null record. A new game and
  RESTART start from an empty set, so Town is the only one lit.
- `_drawWorldMapBody`: an unvisited zone that is not "here" uses `UI.dim` for its outline and
  label. A zone the quest targets keeps its red ring, its "» GO" and its normal label (the
  MP1 marking stays fully visible). No new colour, label or copy.

## Rests on
MP1 (merged): the Map marks where every quest stage wants you. Dimming rather than hiding
is the loop's call, flagged.

## Out of scope
Hiding zones, fog on connector lines, any new copy, visited state for interiors.
