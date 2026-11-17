# TW1: a tap on the tile you aim at takes you onto it

## Goal

When you tap a tile, the click-to-walk path should end by stepping onto that tile. Today every
path step, the last one included, goes through the held-walk halt gate (`_autoRepeatShouldStop`),
so a tap on a hazard tile (sludge, goo, a puddle) walks you up to it and stops one tile short.
The tile you pointed at is a deliberate choice; only the steps on the way need the gate.

## What the code does now (measured, not assumed)

- Zone exits no longer halt the gate (the 2026-07-04 ruling in `_autoRepeatShouldStop`), and no
  exit tile on any map is a hazard or a wall. In headless Chrome at 3440x1440 a tap on Town's
  east exit from one tile away already takes the exit. So the exit half of the report does not
  reproduce on `dev`; this slice pins it with a test and fixes the hazard half, which does.
- The gate still halts on walls, hostiles, containers, hazards and puddles.

## Change (game/main.js, path-step logic only)

- In `_onStepSettled`, the path branch asks, for the last queued tile, whether a hazard or
  puddle is the only thing that would stop the step. If so the step is taken.
- New small helper `_hazardIsOnlyThingStopping(dir)`: open floor, no hostile, no container, and
  a hazard tile or a puddle. `_autoRepeatShouldStop` itself is not edited.

## Acceptance

1. The last step of a click-to-walk is no longer stopped by a hazard or puddle; steps before it are.
2. Tapping an exit tile beside you takes the exit; five tiles away walks there and takes it.
3. A hazard in the middle of a path still stops the walk before it.
4. A wall, a hostile or a container on the last tile still stops it.
5. Held-key walking is unchanged: it still halts before a hazard.
6. `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.
7. Evidence frames at 3440x1440, before and after, in the scratchpad (not committed).

## Rulings

None. A defect fix approved by the loop under the standing delegation.

## Out of scope

- Making exits halt held-walk again (the 2026-07-04 ruling stands).
- Walking onto a hostile or a container tile (those open their own menus).
- Any other file in `main.js`; TC1 and BP3 edit it elsewhere.
