# GV2 — Up from the Canyon into the Valley, and on to the Wilderness

**Branch:** `feature/gv2-canyon-to-valley`, cut from `dev`.

## Goal

A new map, the Valley (Caelan's name), joined to the Canyon by a hook climb up the Canyon's top
right, and joined on its far side to the Wilderness. After this the line Canyon, Valley,
Wilderness, Graveyard, Carnival, Town is walkable end to end. Terrain is a plain placeholder that
Caelan repaints in Tiled, built only from tiles the Canyon already uses. The Valley holds no
enemies, items or quests.

## Rulings it rests on

- **GV1R1, picked (a):** the Gorge is open any time, and the way up to the Valley needs the hook,
  from either side. The Gorge half shipped in GV1; this slice builds the hook-gated way up.
- **GV2R1, picked (a):** the Forest is the Wilderness. The Valley's far side opens into the
  Wilderness map, and walking back returns. No new Forest map.

## What gets built

- `game/valley-map.json`: zoneName `VALLEY`, a small walled placeholder. A jutting rock on its
  east side is a grapple anchor back down to the Canyon (needs the hook). A door in its west wall
  leads to the Wilderness. Nothing else is in it.
- `game/canyon-map.json`: a jutting rock in the top right, a grapple anchor up to the Valley
  (needs the hook; the refusal line is `[TEXT]`). The Downtown anchor and the Gorge door are left
  as they are. A hook climb in this game is an anchor you bump, not a gated door (the existing
  world-integrity pin), so the Valley climb is an anchor too.
- `game/wilderness-map.json`: a gap in the east fence and a door through it, to the Valley.
- `game/world-map.js`: a VALLEY box on the Map tab, joined to both the Canyon and the Wilderness,
  so the "you are here" marker lands on it. The box position is a stand-in; the long line from
  the Canyon is expected to look odd.
- `plans/spine.md`: the Valley listed in the "maps off the spine" row (section 3), and Caelan's
  Forest answer recorded dated 2026-11-04 in the open questions. No Locked row is touched.
- `tests/world-integrity.test.js`: the Canyon climb pin extended to the second hook anchor, in its
  own commit citing the rulings.
- `tests/tile-coverage.test.js`: the border table gets the Valley's row.
- `tests/valley-map.test.js`: walks it all with real key presses.
- `tools/balance-golden.txt`: recorded by the loop if the new map adds a line.

## Acceptance checks

1. Without the hook the way up to the Valley refuses with a `[TEXT]` line; with it you go through,
   both ways.
2. The Valley's far side lands in the Wilderness, and walking back returns.
3. The hook anchor up to Downtown still works.
4. The Map tab joins all of them, with "you are here" correct in each.
5. The spine lists the Valley and records the Forest answer, dated.
6. The world-integrity Canyon pin is re-pinned in its own commit citing the ruling.
7. The test walks the whole way with real keys.
8. Evidence: 3440x1440 frames of the refusal, the Valley and the Map tab.
9. `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

## Out of scope

Anything inside the Valley (enemies, loot, quests, copy); real Valley art; a better Map tab
position; the Forest as a map of its own.
