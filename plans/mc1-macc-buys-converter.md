# MC1: Macc really buys the Converter, and the taxi quest survives it

## Goal

Macc's line promises 500 GP for the Cataclysmic Converter, but the offer screen refused the
Converter (a quest item), so the promise was empty. Make it real. If you sell it, Macc keeps it
on his shelf and you buy it back for exactly what he paid, so quest 1 can still be finished.

## Acceptance

- Macc buys the Converter for 500 GP in his trade.
- After the sale the taxi quest is still on its last stage, and the objective says to buy it back.
- Buying it back costs exactly 500 at any mood (his disposition would otherwise make it more).
- Finishing quest 1 without selling plays as today; the autoplay golden does not move.
- The shelf is kept in the quest flags, so leaving Town and coming back does not lose the Converter.
- A test sells it with real keys, buys it back, and installs it in the taxi.
- plans/spine.md records the ruling and the Locked row it touches.

## Rulings it rests on

- MCR1 (b): make the promise real; the car quest gets a second route to a converter.
- MC1R1 (a): Macc keeps it on his shelf and you buy it back at the same price (a 500 GP loan).
- TX2 (merged): the broken vehicle is the driver's taxi; "the car" means that quest.

## How

- `trade.js`: `specialDef` copies an item as a special buyer sees it (sellable, fixed price);
  `sellPrice` returns that fixed price at any dealing mood.
- `main.js`: the offer screen's own-bag list shows the sellable copy for items a buyer lists in
  `specialBuys`; a sale records the price in `flags.shelved`; Macc's shelf row sells it back at that
  price and clears the flag.
- `quests.js`: the last stage has a second objective, shown while the Converter is shelved.
- `town-map.json`: Macc gets a 500 GP till, enough to pay once.

## Copy

Every new line is the placeholder `[TEXT]`: the shelved objective and the car bump log.

## Out of scope

Macc dying with the Converter on his shelf, a dialogue line for the shelf, the quest log panel
(renderer) still showing the plain objective.
