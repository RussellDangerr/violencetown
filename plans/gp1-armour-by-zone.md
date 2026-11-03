# GP1: armour by zone

## Goal

Armour used to climb badly: every piece lay on the Sewer floor, so the whole set was free in the
first zone. Now the Sewer gives three pieces and the other two are bought further on.

- Latex Gloves move off the Sewer floor onto the Corner Merchant's shelf in Downtown.
- The Cardboard Cuirass moves off the Sewer floor onto Puck's shelf in the Factory.
- Foil Hat, Shoe Bags and the grate that holds the Red Cape stay in the Sewer.

Prices are not set by this slice. They come from the shop's existing rule (base value times the
vendor's disposition band), so there is nothing new to tune.

## Ruling this rests on

GP1R1, "Every armour piece on the ground is in the Sewer: how should armour climb through the
zones?" Caelan picked option (a): the Sewer gives you three pieces; you buy Latex Gloves in
Downtown and the Cardboard Cuirass from Puck in the Factory.

## Acceptance

1. The Sewer floor no longer holds Latex Gloves or a Cardboard Cuirass. Foil Hat and Shoe Bags
   are still on it, and so is the Red Cape's grate.
2. Corner Merchant sells Latex Gloves for 13 GP; wearing them adds 1 armour on the panel.
3. Puck sells the Cardboard Cuirass for 17 GP; wearing it adds 4.
4. A new test buys and wears both with real keys, and all five worn pieces read 10 armour.
5. The autoplay and balance goldens do not move.
6. Evidence: 3440x1440 frames of both shelves.
7. `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

## How it is built

Data only: remove two `items` rows from `game/sewer-map.json`, add `latex_gloves` to the
`stock` of `dt-merch1` in `game/downtown-map.json`, add `cardboard_cuirass` to the `stock` of
`puck` in `game/factory-map.json`. The test is `tests/armour-by-zone.test.js`.

## Out of scope

- Any change to prices, base values, armour numbers or item text.
- Where the Red Cape lies, or any other Sewer item.
- Enemy kits that carry these pieces (they keep them).
- Art for the two items (they keep their current icons).
