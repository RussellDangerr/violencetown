# NO1 — After the car runs, the objective points at the bridge

## Goal

Installing the converter finishes "fix_car", and no other quest starts until you cross the North
bridge. In that gap the HUD has no objective line and the Map rings nothing, so a new player who
has just fixed the car is told nothing about where to go. Fill the gap: while no quest is active,
the car runs and the bridge has not been crossed, the HUD reads an objective and the Map rings
Town, where the bridge is.

## How

A small "between quests" table in `game/quests.js`. Each row has a `when(engine)` test, an
`objective` and a `targetZone`. `getHudText()` and `getTargetZone()` fall back to the first
matching row while no quest is active. The row for this card:

- **when:** `carFixed` is set and `bridgeRoute()` is still null;
- **objective:** "Drive north across the bridge";
- **targetZone:** `TOWN`.

It never asks for the alcohol: the Canyon is the main road and the ramp a branch (spine §1, SP6).
Both are read from saved state (the `carFixed` flag and the bridge route), so the row needs no
saved field of its own and a save made in the gap reloads with it showing. AE2 later adds the
after-Act-1 row to the same table.

## Acceptance

- With the converter in and the bridge not crossed, the HUD shows the objective and the Map rings
  Town.
- Crossing either way (the crash or the ramp) hands over to that quest's objective, as today.
- A save made in the gap reloads with the objective showing.
- The test puts the converter in at the car with real keys and reads the HUD.
- Evidence: a 3440×1440 frame right after the car runs.
- Quest 1's autoplay ends at the car, so its golden doesn't move.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

## Out of scope

- The Quests tab, which lists only the active quest; the gap row is not a quest.
- The after-Act-1 row (AE2).
