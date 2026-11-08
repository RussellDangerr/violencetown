# GV1 — Walk left out of the Canyon, down into the Gorge

**Branch:** `feature/gv1-canyon-to-gorge`, cut from `dev`.

## Goal

A new map, the Gorge, joined to the Canyon by a door in the Canyon's left wall. Walk off the
Canyon's left side and you land in the Gorge; walk back and you land beside the door you left by.
The Gorge is empty (no enemies, items, props or quests) and has no other way out. Its terrain is a
plain placeholder that Caelan repaints in Tiled; it uses only tiles the Canyon already uses.

## Rulings it rests on

- **GV1R1, picked (a):** the Gorge is open at any time. The way up from it to the Valley needs the
  grappling hook from either side. This slice builds only the Canyon <-> Gorge link; the Valley is
  a later slice. So the door here has no `requires`: it works with or without the hook.

## What gets built

- `game/gorge-map.json`: zoneName `GORGE`, a small walled map, its east edge open onto one door
  back to the Canyon. No other transitions, no grapple anchors.
- `game/canyon-map.json`: one opening in the left wall with one door into the Gorge. The Gorge's
  door sends you back to the tile beside it, so you land where you left.
- `game/world-map.js`: a GORGE box on the Map tab, joined to CANYON by a connector line, so the
  existing "YOU" marker lands on it while you stand in the Gorge. The Gorge's box sits to the
  right of the Canyon because Downtown holds the left; its place is a stand-in.
- `plans/spine.md` section 3: one row listing the Gorge among the maps off the spine.
- `tests/tile-coverage.test.js`: the border table gets the Gorge's row.
- `tools/balance-golden.txt`: the balance report lists every map; the golden moves only if the new
  map adds a row. The loop records it, not this branch.

## Acceptance checks

1. Walking off the Canyon's left side lands in the Gorge; walking back lands where you left.
2. It works with or without the hook; the Gorge has no other way out.
3. The Map tab shows a Gorge box joined to the Canyon, with "you are here" while inside.
4. `plans/spine.md` lists the Gorge among the maps off the spine.
5. Terrain and box position are flagged for Caelan's eye.
6. A test walks it with real key presses through the real movement code.
7. Evidence: 3440x1440 frames of the door and of the Gorge.
8. `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

## Out of scope

The Valley and the hook-gated way up to it; anything inside the Gorge (enemies, loot, quests,
copy); real Gorge art; a better Map tab position. The door's words are `[TEXT]`.
