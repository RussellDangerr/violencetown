# The taxi driver

Ruled 2026-11-01 (recorded in `plans/spine.md` §9). The thing waiting at the bridge is a taxi driver,
and the taxi is his, not yours. Quest 1 becomes getting him his Converter, and he is how you cross.

This is the short spec the later slices cite. It records what was ruled and what each slice changes.
It is not a place for open questions: anything not yet ruled is left out, and the slice that needs it
asks first.

## What changes

- **The taxi replaces your car.** The broken vehicle at the start is the driver's taxi, not yours.
  The Converter from the Sewer is still Act 1's required item, and it still fixes the vehicle.
- **He is how you cross.** The bridge is crossed in his taxi, with him driving.
- **A new optional side area.** It sits past a barricade, off the spine. Oil always unlocks it, and
  it carries no beat. Its name is [TEXT].

## What does not change

The Sewer and its boss, the Converter (`catalytic_converter`), the Canyon, Pike's grappling hook,
Downtown and the Financier all stay as the spine has them. Internal ids stay (the examinable `car`,
the quest `fix_car` and its stages, the flag `carFixed`) so saves and the autoplay route keep working.
All player-facing wording the slices touch is [TEXT] until Caelan writes it.

## The slices, in order

1. **TX1: this record.** Spine entry in §9, wording in §1 and the beat table, one line in §3. No code.
2. **TX2: the taxi and its driver at the bridge.** The broken vehicle and a driver stand at the bridge,
   and quest 1 fixes his taxi. The only slice that moves the autoplay golden.
3. **TX3: the crossing becomes his.** The first crossing names the driver and his taxi. If the taxi
   crashes into the Canyon he goes down with you.
4. **TX4: every crossing is a ride.** After the first, crossing the bridge either way is a taxi ride,
   with the driver at both ends.
5. **TX5: the side area.** A small off-spine map behind a gate in Downtown, on the World Map, with
   nothing in it and nothing reaching it yet.
6. **TX6: oil.** An oil item you spread; the next landing slides through the Downtown gate and opens
   the side area.
7. **TX7: Hooch sells oil** beside the alcohol.

## Out of scope

Anything in the side area beyond an empty map. Rewriting the Canyon beat. Any change to the Act 2
zones, the finale, or the other Locked spine rows.
