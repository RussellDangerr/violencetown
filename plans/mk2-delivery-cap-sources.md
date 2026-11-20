# MK2: you can find or buy the grey and blue delivery caps

## Goal
The two delivery caps (MS3) exist but nothing hands them out. Give each exactly one source,
where the MK1R2 ruling put it.

- Grey cap: lies on the Diner floor, reachable on foot from the door. Picked up once; the
  existing collected-items record keeps it gone after a save and reload.
- Blue cap: the Newsstand Kid in Downtown stocks it beside his bandage. At his neutral
  disposition trade.js buyPrice gives 10 x 1.6 = 16 GP, the ruled price, so items.js is untouched.

## Acceptance
1. A scan of every map finds exactly one source for each cap.
2. The grey cap is reachable on foot, goes in the bag once, and stays gone after save and reload.
3. The Newsstand Kid lists the blue cap beside his bandage at 16 GP; buying with real keys moves gold.
4. Worn, a looted purse is half as big again; unworn, loot is unchanged.
5. In its own commit: entering Downtown now mentions the unowned cap (armour notice), so only the
   Downtown cases in tests/armour-shop-notice.test.js change.
6. npm test, balance:check, naming grep, autoplay:check pass.

## Rulings
- MK1R2 a: grey on the Diner floor, blue sold by the Newsstand Kid for 16 GP.
- PCR3 a: player-visible text is plain; no new text is added here.

## Out of scope
Cap names, art and descriptions (placeholders already in items.js), any price change, any
change to the cap's perk.
