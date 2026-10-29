# AE2 — After Act 1, the objective points at the three Act 2 zones

## Goal

Act 1's last quest is the burger delivery. Once it is done, no quest is active, so the HUD has no
objective line and the Map rings nothing, though Act 2 (the Carnival, the Factory and the
Graveyard, in any order) is what comes next. Fill that gap the way NO1 filled the one after the
car: the HUD reads an objective and the Map rings all three Act 2 zones.

## How

- A second row in NO1's between-quests table (`game/quests.js`):
  - **when:** `deliver_burger` is complete;
  - **objective:** "Explore the Carnival, Factory and Graveyard";
  - **zones:** `CARNIVAL`, `FACTORY`, `GRAVEYARD`.
- Rows name a list of zones (`targetZones`) instead of one. `getTargetZones()` returns the active
  stage's zone, or the row's list, or none; `getTargetZone()` stays and returns the first.
- The Map (`_drawWorldMapBody`) rings every zone in that list red with "» GO", not just one.
- The row reads only saved state (the completed list), so it survives a reload, and it gives way
  to any active quest, so starting an Act 2 quest hands over to that quest's own objective.

The "COMPLETED 3 / 3" counter is left alone: AB3's Act 2 quests make it 3 of 6.

## Acceptance

- After the last Act 1 quest, the HUD shows the objective and the Map rings the three Act 2 zones.
- Starting any Act 2 quest hands over to its own objective.
- The test finishes the delivery and opens the Map with real keys.
- Evidence: 3440×1440 frames of the HUD and of the Map.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

## Out of scope

- Retiring the row once Act 2 is done. No Act 2 quests exist yet (AB3), and pointing at the
  finale is Act 3's row.
- The Quests tab and its counter.
