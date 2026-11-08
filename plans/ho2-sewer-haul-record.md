# HO2 — the alcohol costs about 23 GP, and a test pins that the sewer haul pays for it

## Goal
The ramp route needs a bag that can be sold to Hooch for at least the price of his
alcohol. Today nothing checks this against what quest 1 really leaves the Sewer with, so
a balance change could strand the route unseen. This slice makes the autoplay record what
the quest run (and the sneak) carries out of the Sewer, lowers the alcohol's price so the
haul covers it, and adds a test that reads that record.

## Rulings it rests on
- HOR2, picked (a): the alcohol's gold comes from selling what you found in the sewer.
- HO2R1, picked (b) by the loop under the standing delegation: runs record their haul when
  they leave the Sewer, and the test reads that.
- HO2R3, picked (a): the alcohol costs about 23 GP instead of 32. Its baseValue goes from
  20 to 14 in `game/items.js`; that number is the only thing that changes.
- The earlier HO2R2 is superseded: the Were-Rat's gold does not change.

## Plan
1. `tools/autoplay.mjs` watches the game (observation only, no change to a run) and keeps
   the bag and gold at the moment the player leaves the Sewer. The golden's quest and
   sneak entries gain that one record (`sewerExit`); every stage score stays as it was.
2. `game/items.js`: the alcohol's baseValue 20 becomes 14. Any test that pins the old
   price changes in its own commit, with "behaviour changed" in the message.
3. `tests/ramp-route-gold.test.js` reads the golden's record and checks that selling the
   bag to Hooch, at his disposition in `game/town-map.json`, covers the alcohol's price.
4. The goldens (autoplay and balance) are written by the loop in its own commit, citing
   HO2R3 for the price drift and HO2R1 for the new record. The builder never writes them.

## Acceptance
- The alcohol sells at Hooch's for about 23 GP (was 32) at his starting mood.
- The quest run and the sneak each record their bag and gold when they leave the Sewer;
  nothing else in the autoplay golden changes.
- The test fails if that haul does not cover the alcohol at Hooch's disposition, and a
  higher price breaks it.
- If the real haul does not pay for the alcohol, that is reported and nothing is bent.
- npm test, balance:check, naming grep and autoplay:check pass, given the written golden.

## Out of scope
Any price, disposition or tuning change beyond the alcohol's one number; the Were-Rat's
gold; any change to how a run plays.
