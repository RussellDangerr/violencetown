# cc1 — climbing out of the Canyon logs one line, not two

## Goal

Climbing out of the Canyon on the hook used to log two lines for one climb: the exit's own
"sink the hook into the rockface" line, then the canyon_escape quest's finishing line
("sink the hook into the rock, haul yourself up..."). One climb now logs one line.

## Ruling it rests on

CCR1, pick (a), Caelan's own: "Keep the climb's own line; the quest's finishing line goes."

- The exit label in `game/canyon-map.json` (the anchor to Downtown) stays exactly as it is.
- The `_log(...)` in `canyon_escape`'s `onComplete` in `game/quests.js` is removed.
- No new words are written.

## Acceptance

- Climbing out logs one "sink the hook" line.
- The delivery quest (`deliver_burger`) still starts on arrival in Downtown; `onComplete` still
  calls `_startMainQuest2`.
- The test climbs out with real keys: the hook goes in the bag, the hero stands under the
  anchor and presses the up arrow through the real key listeners and `_doMove`.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.
- Evidence: a 3440x1440 frame of the log after the climb.

## Out of scope

- Any rewording of the climb line, the quest objective or the Downtown arrival line.
- The `[Entered DOWNTOWN]` line the world beat adds on arrival.
- The ramp route (it never ran `canyon_escape`).
