# FX70 — a save made on a grate in the grates mask reloads on that grate

Goal: FX69 moves a loaded player off any tile the map calls unwalkable, which also moved a
mask-wearer off a grate they were legitimately standing on.

Rule: one exported helper, `canStandOn(map, x, y, { equipment, ratForm })` in game/items.js
(walkable, or a grate tile 4 with rat form or a worn 'grates' mask). main.js `_canEnter` and
save.js `nearestWalkable` / `loadInto` both call it. Rat form is not saved, so the loader
passes it as false.

Acceptance: grate + mask reloads in place; grate without mask moves to the nearest open tile;
walls and off-map behave as FX69; one rule, not a copy; npm test, balance, naming grep and
autoplay pass.

Rests on ruling FX70R1 (a), picked by the loop. Out of scope: any on-screen change.
