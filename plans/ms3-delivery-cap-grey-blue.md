# MS3 — The delivery cap, in grey and blue, pays more

## Goal
The first tiered mask family: two caps, grey and blue, that share one body (a courier figure) and
one perk, and differ only by tier. While either is worn, enemies carry 50% more gold, so you are
paid more when you loot them.

## Acceptance
- Grey and blue are two head-slot masks with the same body and perk; they differ only by tier.
- Worn, an enemy's purse is raised by half before it is looted, and the extra moves through
  `transferGold`, so nothing is minted at the till.
- Unworn, loot is exactly as before.
- 3440x1440 screenshot of both caps.
- `npm test`, the naming grep, `balance:check` and `autoplay:check` pass.

## Rulings it rests on
- MR5 b: the extra money comes from enemies carrying more while you wear the cap; gold stays
  conserved (it only moves).
- MS1 (done): a mask is a hat with a body, read by `wornBody`.

## Placeholders
- Names `[Delivery Cap, Grey]` / `[Delivery Cap, Blue]`, descriptions, armour 2 (equal to the Rat
  Mask), the tier prices that set grey and blue, and all art (tinted cells) are fake.
- The +50% is from the card; rounding up is the builder's choice.

## Out of scope
Where the caps are found or sold, a body verb, stacking with other perks, a perk that differs by
tier, and real art.
