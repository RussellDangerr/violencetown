# AH1 — the autoplay bots carry food into the Sewer

## Goal

The autoplay player already has a heal rule (`game/autoplay/player.js`): below 40% HP, with
food on its bar, eat. It never fires, because the route only walks to its goals and the bots
reach the Sewer holding no food. The golden shows 0 eats in every stage.

Town has three hot dogs on the ground at (18,12), and they count as Eat. A `take` goal ahead
of the car in the first stage makes both bots walk onto them and carry them into the Sewer,
which feeds the rule that is already there.

Nothing a player sees changes. Only the bots, and so their golden, change.

## Acceptance checks

- Both bots walk onto the Town hot dogs before examining the car, through a `take` goal in
  `game/autoplay/route.js`, and carry them into the Sewer.
- Below the heal threshold with food, a bot eats: a fresh run's report shows at least one eat
  for each bot, from the real run and not a staged view.
- A bot that has eaten its food does not walk back to Town for more. The take goal lives in
  the `examine_car` stage only, and later stages never name it.
- Both bots still finish quest 1 on seed 1. The before and after deaths and HP lost are in
  the summary.
- `npm test`, `balance:check` and the naming grep pass. `autoplay:check` passes against the
  golden the loop accepts.

## Rulings it rests on

- AH1R1, picked a: accept the drift in every stage's turns and HP, as long as both bots still
  finish quest 1. The golden is rewritten once, by the loop, citing AH1R1. This branch does
  not edit `tools/autoplay-golden.json` and never runs `autoplay:write`.
- Q1-10 (existing): drinking stays as it is; drinks are spent in fights.

## Out of scope

- The golden file itself.
- Drinks, other food, or buying food. No change to the heal threshold.
- Any change to the game, its maps, or what a player sees.
