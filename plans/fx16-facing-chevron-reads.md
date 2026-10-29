# The facing chevron reads on every ground

## Goal

The small chevron that shows which way a watcher looks is filled with a pale tan today. On the
town's road, which is tan too, the fill disappears (a contrast of about 1.08:1) and only its thin
plum outline is left. Fill it with the house plum instead, so it stands out on the ground of every
map.

## Ruling it rests on

- How should the facing chevron stand out on the town's tan ground? Pick: **a darker fill, the
  house plum**. The plum is the one already in the code: `TINY_INK` in `game/sprites.js`
  (#3F2631), the Tiny packs' outline colour. No new colour is invented.

## What changes

- `game/renderer.js`: the chevron's fill becomes the house plum, at the same 0.9 opacity as
  today. The outline, the shape, the size and when it is drawn stay as they are. The colour moves
  into one exported constant so the test can read the colour the game actually draws.

## Acceptance checks

- `tests/chevron-contrast.test.js` works out each map's ground and measures the chevron against it:
  - a map's ground is its most common walkable tile (the floor a watcher stands on);
  - the ground's colour is the mean of that tile's opaque pixels, read from the same sprite-sheet
    cell the renderer draws;
  - the chevron's colour is its fill laid over that ground at its opacity;
  - the WCAG contrast ratio between the two is at least 3:1 on every map;
  - the list of grounds checked is not empty, and every `*-map.json` gets one.
- The same test shows the old tan fill failed on the town's road, so it can't pass by accident.
- Before and after shots at 3440x1440.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

## Out of scope

- One-off walkable tiles that are not a map's ground: doors, the manhole, the canyon's scree,
  the factory's conveyor. The plum is darker than the old tan, so on those few dark tiles it
  reads less well than before.
- Night and the fight's fog, which darken the ground under everything; this measures the ground
  art as it is drawn by day.
- The chevron's shape, size, outline and the rule for who gets one (`showsFacingChevron`).
