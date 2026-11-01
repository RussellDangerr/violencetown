# HO2 — a test pins that the sewer's haul pays for Hooch's alcohol

## Goal
The ramp route needs a bag that can be sold to Hooch for at least the price of his
alcohol. Today nothing checks this against what quest 1 really leaves the Sewer with, so
a balance change could strand the route unseen. This slice makes the autoplay record what
the quest run (and the sneak) carries out of the Sewer, and adds a test that reads that
record.

## Rulings it rests on
- HOR2, picked (a): selling what you found in the sewer; the objective says so.
- HO2R1, picked (b) by the loop under the standing delegation: the quest run records its
  haul when it leaves the Sewer, and the test reads that.

## Plan
1. `tools/autoplay.mjs` watches the game (observation only, no change to a run) and keeps
   the bag and gold at the moment the player leaves the Sewer. The golden's quest and
   sneak entries gain that one record; every stage score stays as it was.
2. `tests/ramp-route-gold.test.js` reads the golden's record and checks that selling the
   bag to Hooch, at his disposition in `game/town-map.json`, covers the alcohol's price.
3. The golden is written by the loop in its own commit (citing HO2R1), never by the builder.

## Acceptance
- The quest run records its bag and gold when it leaves the Sewer; nothing else in the
  golden changes.
- The test fails if that haul does not cover the alcohol at Hooch's disposition.
- If the real haul does not pay for the alcohol, that is reported and nothing is bent.
- npm test, balance:check, naming grep and autoplay:check pass.

## Out of scope
Any price, disposition or tuning change; any change to how a run plays; any
player-visible change (none; UNSEEN).
