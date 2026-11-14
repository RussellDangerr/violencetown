# TX4 — every crossing is a taxi ride, back and forth

## Goal
The bridge cutscene plays once (the first crossing). After that the bridge mouth in the Town and
Downtown's three south exits were free walkways. Now each crossing is a short taxi ride: stepping
onto the bridge mouth plays a ride beat and lands you in Downtown beside the driver; stepping out
of Downtown's south exits plays a ride beat and lands you at the Town stand beside the driver. You
cannot walk across silently in either direction.

## How
- The ride beat reuses the first crossing's flash and shake, but ends in a clean ramp (the driver
  tames the engine himself after the first crossing). It is one method, `_rideTo(toMap, toX, toY)`.
- Data-driven: Downtown's south exits carry `ride: true` and `_doMove` plays the ride when it meets
  one, instead of a second hardcoded tile check. The bridge mouth in the Town, once the route is
  known, plays the same ride.
- Downtown's exits land at the Town stand (15,4), walkable road beside the driver, not (16,12).
- A driver and taxi stand fixed at Downtown's landing (driver at 13,8 next to the spawn, taxi block
  at 14-15,7-8). The Town's driver and taxi are TX2's, unchanged.
- bridgeRoute flags and the between-quests rows are untouched. The mugger record (`_recordMuggers`)
  is called as in the plain transition path; moving it into `_zoneChange` is a later card.
- All ride lines are `[TEXT]`; the driver reuses the `taxi_driver` dialogue.

## Rulings it rests on
- TX4R1: a ride costs nothing (a).
- TX3R1 (a): the driver tames the engine after the first crossing; HO1R3, CY1 as the card says.

## Acceptance
- A later crossing from the bridge mouth plays a ride and lands in Downtown beside the driver.
- Downtown's south exits ride to the Town stand beside the driver.
- No silent walk either way; no gold is taken.
- A test makes the first crossing, then rides there and back with real arrow keys.
- autoplay:check with no drift; npm test, balance:check, naming grep pass.

## Out of scope
Fares, player-facing copy, new art for the taxi, moving the mugger record, pursuit followers on the ride.
