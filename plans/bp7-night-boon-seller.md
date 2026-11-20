# BP7: a seller in Town at night sells boon poitions

## Goal
At night a seller named "Night seller" stands in Town. By day the spot is empty. Trading with
them offers one thing: a boon poition, at 500 GP.

## Rulings it rests on
- BPR7, pick a: one boon costs 500 GP from the night seller.
- BPR4, pick a: at most 12 boons per game (items.js BOON_CAP, boonCount, BOON_CAP_LINE).
- BP3 and BP5 (merged): boon poitions exist and the cap exists. Reused, not rebuilt.
- PCR3, pick a: all player-visible text is plain and true to the code. No brackets, no jokes.
  The seller goes by the role name "Night seller".

## How it works
- town-map.json gets a vendor spawn `night-seller` flagged `nightOnly`, stocking `boon_poition`.
- main.js keeps that spawn in step with the day clock: it is added when `_nightLevel` is above 0
  (dusk to dawn) and removed when it is 0 again, never while its trade screen is open. A zone load
  skips it by day.
- trade.js owns the price: `NIGHT_BOON_PRICE = 500` and `stockPrice(npc, id)`. The trade row
  carries that price, the same way a buyback row carries its own, so the screen and the sale agree.
- A bought boon is an ordinary boon poition. Drinking it counts toward the 12, like any other.
- At the cap the seller refuses to sell: drunk plus held boons (plus any staged) must stay within
  12. The line says exactly that.

## Acceptance
- At night the seller is in Town; by day they are not.
- Their trade row for the boon poition costs 500 GP in the offer maths and on screen.
- Boons bought count toward the cap; at the cap the sale is refused with a true line.
- Slot picks and the autoplay (day only) do not move.
- 3440x1440 frames of the seller at night and of the trade screen.

## Out of scope
Other stock, dialogue, a stat-specific boon, price changes by disposition, art for the seller.
