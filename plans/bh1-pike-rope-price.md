# BH1 — Pike's rope is priced so a sewer haul can buy it

## Goal
Pike's grappling hook is the Canyon's way out, and today it costs about 1400 GP at his
till (baseValue 1000 at his disposition 30). Nothing a player carries out of the Sewer
comes near that. This slice lowers the hook's baseValue so the Sewer's haul can pay for
it in trade, and it pins that with a test.

## Rulings it rests on
- BHR1, picked (a): lower the price so what you carry out of the sewer can pay for it in
  trade.
- BH1R1, picked (a): about 21 GP at Pike's till. That is baseValue 15 at his disposition
  30 (his band multiplies by 1.4), so his disposition still moves the price.
- EK1R1, picked (b): tests add up what the Sewer's enemies and chests can give
  (`tests/helpers/zone-haul.js`), not what one bot's run carried out.

## Plan
1. `game/items.js`: the grappling hook's baseValue goes from 1000 to 15. Nothing else in
   the file changes; the oil's and the alcohol's prices are untouched.
2. `game/dialogue.js`: Pike's "a thousand" reply no longer names a price that is gone. It
   becomes `[TEXT]` (a placeholder; the loop never writes player copy).
3. `tests/pike-rope-price.test.js`:
   - the hook's price at Pike's disposition (read from `game/canyon-map.json`) is about 21;
   - `zoneHaul` on the Sewer, with the bloom cache named as gated and priced at Pike's
     disposition, covers that price, with the working shown on failure;
   - Pike's till, opened with real keys, sells the hook for exactly that price, taking the
     gold and putting the hook in the bag.
4. The balance golden may move because of the price. The builder reports the drift and does
   not write it; the loop writes it, citing BH1R1.

## Acceptance
- Pike's till shows the new price, still moved by his disposition.
- A test pins that what the Sewer can give covers the rope at his prices.
- The test buys the rope through the till with real keys.
- npm test, balance:check, naming grep and autoplay:check pass (given the written golden).

## Out of scope
The oil's and the alcohol's prices; Pike's disposition; the free routes to the rope
(the critter deal, taking it off Pike); any new line of copy beyond the `[TEXT]` marker;
the Canyon's quest text and Pike's barks (checked and listed, not edited).
