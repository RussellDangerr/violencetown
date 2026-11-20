# pc1b-car-bridge-plain-copy

## Goal
The car and the bridge say plainly what happened. Every `[TEXT]` log line in `_interactCar` and
the bridge text set by `_openBridgeIfCarFixed` in `game/main.js` becomes a flat, true line: what
happened and what to do next. No jokes, no character voice.

## Acceptance
- No `[TEXT]` in `_interactCar` or `_openBridgeIfCarFixed`.
- Each line matches what the code does (pour, converter installed, car fixed with and without
  alcohol, converter missing with and without it left with Macc).
- The bridge text after the fix agrees with the bridge examinable from PC1 (same opening words;
  says the car is fixed instead of the barricade).
- Old tests that pin these lines are re-pinned to the exact new lines in their own commit; if
  that needs files outside `touches`, the slice reports BLOCKED naming them.
- npm test, balance:check, naming grep, autoplay:check pass; a fingerprint-only autoplay move is
  filed as an accept ruling, never re-recorded.

## Rests on
PCR1, picked (a): plain deadpan lines, `[TEXT]` never reaches a player, creative writing stays
with Caelan. LOOP.md section 6.

## Out of scope
The bridge cutscene lines (`_playBridgeCutscene`), the taxi dialogue (PC2), and any other file.
