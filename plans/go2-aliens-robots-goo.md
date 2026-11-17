# GO2: aliens and robots throw goo, and are immune to it

## Goal
Alien Invasion, the three Alien allies and the Robot Rat carry a thrown goo item. They throw it
at you from range, it leaves a goo puddle, and standing in the puddle gives you the Goo status
(GO1). They are immune to goo themselves. `green1` is left alone: the autoplay fights him.

## Rulings
- GO2R1 (a): goo sits outside the weakness chart like poison: neutral to everything. Aliens and
  robots are simply `immune: ['goo']`.
- GO1 (merged): the Goo status.

## Acceptance
- A new `goo` item (placeholder name/text, tinted-square icon) with `enemyThrows` and a puddle of
  kind goo, modelled on Sludge Brain.
- The goo puddle gives the Goo status to the player; a puddle of kind sludge still gives Sludge.
  Bagged feet keep goo off, as with the goo tile.
- Alien Invasion, `alien_ally` and `robot_rat` carry goo and are immune to it; it drops on death.
- `elements.js` has a `goo` row with no phase; `tests/elements.test.js` passes.
- A new test throws from an alien with the real key path and checks throw, puddle and chip.
- npm test, balance:check, naming grep, autoplay:check pass; green1 and the golden unchanged.

## Out of scope
- `green1`. The puddle's look (the renderer draws every puddle with the sludge tile; a goo look
  needs renderer.js, which this slice does not touch). Any effect of goo on enemies. Final copy.
