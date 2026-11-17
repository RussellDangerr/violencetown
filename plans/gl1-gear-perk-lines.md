# GL1: the bag's item panel says what each piece of gear's perk does

## Goal
Armour in the bag's item panel reads "+N armor" and then one short phrase for each perk it
carries, the way the Shoe Bags already say "sludge-proof".

## What it says (rulings, picked 2026-11-17)
- GL1R1 picked b, say what happens: delivery caps "foes carry +50% gold" (the 50% is read from
  `DELIVERY_CAP_PURSE` in trade.js), the Strongman mask "a two-hander in each hand", the Rat Mask
  "walks through grates".
- GL1R2 picked a: the Lava Cape says "+6 melee" (the 6 is read from the item).
- The Shoe Bags keep exactly "+2 armor, sludge-proof"; the Foil Hat stays "+2 armor".

## Build
One frozen table in `game/inspector.js` keyed on the perk field; `itemStatLine` appends each
matching phrase to the armour line. Nothing that is not armour changes.

## Checks
`tests/gl1-gear-perk-lines.test.js` pins each line, checks the numbers follow the data, and fails
if any armour piece in items.js has a perk field with no phrase.

## Out of scope
The GEAR plate, the renderer, and the wording of item descriptions.
