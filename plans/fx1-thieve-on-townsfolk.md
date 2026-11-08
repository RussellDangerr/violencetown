# Thieve works on townsfolk, through the wheel

## Goal

The Thieve verb is meant for robbing people who are not fighting you: townsfolk, shopkeepers,
your own allies (`plans/stealth-perception-and-thieve.md`). Today it cannot. The wheel decides
whether an adjacent verb has a target with one filter, and that filter counts only hostile
neighbours unless the verb is Trade. Coin, Kit and Gear are not on that list, so beside an
unseen townsperson they draw grey and pressing them bumps. The same filter seeds the reticle,
so even a forced aim would point away from the victim.

The fix: in `game/wheel-model.js`, treat the three Thieve resolvers (`thieveCoin`, `thieveKit`,
`thieveGear`) as social, like Trade, in both places: `verbApplies` (the grey-out and the fire
gate) and `autoAimTile` (the reticle seed). Any living neighbour is then a target; who may
actually be robbed is still decided where it was (`_thieveTarget`, `canThieve`, being hidden).

## Acceptance checks

- Beside an unseen townsperson carrying gold, Thieve > Coin, Kit and Gear are lit (when the
  victim has something in that branch) and fire through the wheel.
- `tests/thieve-wheel.test.js` drives the wheel the way a player does: open it, cycle and drill
  to Trick > Thieve > Coin with the wheel's own navigation, then press a direction or Space
  through the game's own key methods (`_wheelDrill`, `_reticleKey`, `_wheelCommit`, lifted from
  `main.js`), and checks that the Coin lift lands on a neutral victim. It fails with the old
  filter (mutation-checked).
- A clean lift from a townsperson counts toward light fingers, through that same path.
- Evidence drives real key events in a headless page (staged: a hidden player beside a
  townsperson given gold), with a 3440x1440 shot of the lit wheel.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

## Rulings and picks it rests on

- The Thieve design (`plans/stealth-perception-and-thieve.md`): theft is a transaction with the
  sign flipped, and its victims include townsfolk, shopkeepers and allies.
- Light fingers (`plans/us1-light-fingers.md`): only a clean lift counts.
- The loop's standing delegation approved this slice: it adds no name, copy or number.

## Out of scope

- Any change to `main.js`, the theft maths, perception, or who counts as thievable.
- Choosing between two adjacent victims by what they carry; the reticle seeds on the nearest
  living neighbour, the same rule Trade uses, and a direction press picks any other.
- New copy, names or tuning numbers.
