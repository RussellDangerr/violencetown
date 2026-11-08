# TX3: the driver takes you across, and goes down with you if the taxi crashes

Third slice of the taxi-driver record (`plans/taxi-driver.md`). The trigger does not change:
stepping onto the opened bridge mouth starts the first crossing, and the fuel still decides it
(raw crashes into the Canyon, alcohol ramps into Downtown; `carFuel` is untouched). What changes
is who is in the ride.

## Goal

- The first crossing's lines name the driver and his taxi, not "you" and "your car". Both
  branches (ramp and crash) and both landing logs are placeholders.
- On a crash the driver lands in the Canyon with you: a fixed placement beside the landing spot in
  `game/canyon-map.json`. The Canyon has no way in except the crash, so it needs no flag. He reuses
  his look from the bridge (same id, so the same sprite pick) and he talks.
- The Canyon wreck is the taxi now: its examine text and its radical piece (`canyon/wreck`) are one
  text and neither says "your car".
- Climbing out with Pike's hook still lands in Downtown. Nothing about the anchor changes.

## Acceptance

- Alcohol poured, stepping onto the bridge mouth plays the ride lines and lands in Downtown, as today.
- Raw fuel plays the crash lines and lands in the Canyon with the driver beside the landing tile;
  talking to him opens his greeting.
- The wreck examinable on the Canyon map and the radical piece say the same thing, and neither
  contains "your car".
- The hook climb out of the Canyon still lands in Downtown.
- `tests/taxi-crash.test.js` crosses with real arrow keys under both fuels, on the stand-in game
  of `tests/canyon-branch.test.js`; that file's stand-in gains nothing a real method does not need.
- `autoplay:check`, `npm test`, `balance:check` and the naming grep pass; the golden does not move
  (the quest-1 route ends before the bridge).

## Rulings it rests on

- TX3R1 (a): the taxi is dented, not dead. He falls with you, you climb out with Pike's hook, and
  every ride after that ramps cleanly.
- HO1R3 (a): the taxi replaces your car; the Converter fixes his taxi, and he is how you cross.
- TX2 (merged): the taxi and its driver at the bridge.
- Spine SP10: quest 1 stays the opening, and this crossing is part of it.

## Decisions made here

- Every line a player reads that changes is the placeholder `[TEXT]`: the two cutscene branches,
  the two landing logs, the wreck text, the driver's Canyon greeting and choice. The builder wrote
  no wording.
- The Canyon driver reuses the id `townie-driver`, so his sprite pick is the same as at the bridge.
  He has his own dialogue entry so the bridge dialogue is untouched.

## Out of scope

- Moving the driver back to the bridge after the climb, and rides after the first crossing (TX4).
  The Town bridge placement already stands, so he is simply there again; no new state.
- The Converter's use hint, the boss bark, the help text, and the `Wrecked car` prop label in
  `examine.js` (files outside this slice's touch list) still say "car".
- Any change to the Canyon's other residents, Pike's shop, or the hook anchor.
