# TX2: the taxi and its driver wait at the bridge

Second slice of the taxi-driver record (`plans/taxi-driver.md`, spine entry in `plans/spine.md`).
Ruled by Caelan: the broken vehicle is the driver's taxi, not yours, and whoever stands at the
bridge is the driver, who tells you and is the way you cross.

## Goal

Move the broken vehicle from the grass east of Hooch's stall to the road beside the bridge
barricade, and stand a driver next to it. Quest 1 then fixes his taxi: examine it, bring the
Converter back from the Sewer, install it there. The crossing, the fuel and the bridge cutscene
play exactly as today (TX3 and TX4 change them).

## Decisions made here (nothing a player reads is written by the builder)

- Internal ids all stay: examinable `car`, quest `fix_car` and its stage ids, flag `carFixed`,
  `carFuel`, event `interact_car`, tile 19. Saves, `route.js` and the stand-in tests keep working.
- The 2x2 block of tile 19 moves to the road lane just under the barricade. The four old cells
  become grass (tile 14) like the ground around them. A lane stays open from the road up to the
  barricade.
- The driver is a Violencian townie, IDLE, never wandering, with no barks, so he draws nothing
  from the ambient stream. He opens a dialogue with a greeting and one repeatable choice.
- Every line a player reads that changes is the placeholder `[TEXT]`: the quest title, the four
  stage objectives, the quest-complete log, the bump and install logs, the car and bridge examine
  texts, the driver's name, greeting and choice. Stage objectives still fit the phone budget.

## Acceptance

- A new game shows the taxi and the driver at the bridge; the old spot is open ground.
- E from spawn points at the taxi.
- Talking to the driver opens his greeting.
- Quest 1 still finishes through real keys: examine the taxi, take the Converter from the Sewer,
  install it at the taxi; the barricade opens.
- `tests/taxi-at-bridge.test.js` walks from spawn with real arrow keys, examines the taxi and
  installs a held Converter.
- `autoplay:check` drifts only where TX2R1 lists: in the quest and sneak runs, the `examine_car`
  and `return_to_car` turns, each run's total turn, both fingerprints. `recover_converter`,
  `escape_sewer` and the loops run do not move. The loop writes the golden, not this branch.

## Rulings it rests on

- HO1R3 (a): the taxi replaces your car; the Converter fixes his taxi, and he is how you cross.
- TX2R1: the autoplay golden moves for this slice only.

## Out of scope

The crossing becoming his (TX3), every crossing as a ride (TX4), the side area, oil. Copy: all
wording is a placeholder until Caelan writes it. Files outside this slice's touch list (the
boss's bark in `borgir-map.json`, the help text in `index.html`, the Converter's use hint in
`items.js`, the canyon wreck text) still say "car" and are listed for Caelan.
