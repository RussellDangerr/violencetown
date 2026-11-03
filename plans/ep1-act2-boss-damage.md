# ep1: the Act 2 bosses hit as the ruling says

## Goal
Today every Act 2 boss copies the shared stand-in block `placeholderBoss()` in `game/slots.js`,
which hits for 12, the same as the Were-Rat. Ruling EP1R1, option (a): the Act 2 bosses hit for
14. Bigfoot, Alien Invasion, The Deity and Siberia take it, and so does the Ringmaster, who now
stands in the Carnival's boss spot.

## What changes
- `game/slots.js`: those five entries get `damage: 14` on top of the shared block. The shared
  block itself stays at 12, because the Financier (the finale's phase 1) copies it, and Monstrous
  Sun Man (FIN3) reads the Financier's number. The ruling is about the Act 2 bosses only, so both
  keep hitting for 12.
- `tests/helpers/fight-cost.js`: a small fight helper. It spawns a boss from the registry, runs
  the player's swings through the game's own hit maths and the boss's turns through the real
  `resolveEnemyTurns` / `tickNpcState` (his kit and his purse), and returns what the fight cost in HP.
- `tests/act2-boss-numbers.test.js`: pins the numbers and shows the cost of the first Act 2 boss
  beside the Were-Rat's, each with the gear you would have by then.

## Gear used in the helper (GP1R1 a, GP2R1 a)
- At the Were-Rat: the Sewer's three armour pieces (Foil Hat, Shoe Bags, Red Cape) and the Gator Tail (16).
- At the first Act 2 boss: those three, plus Latex Gloves (Downtown) and the Cardboard Cuirass
  (Puck, Factory), and the Lion Whip (16).

## Acceptance
- Bigfoot, Alien Invasion, The Deity and Siberia hit for 14 in a real fight; the Were-Rat, the
  Borgir boss and Pike are unchanged; the Financier and Sun Man keep their numbers (pinned).
- HP stays 100.
- The test prints the first Act 2 boss's HP cost beside the Were-Rat's.
- The balance golden moves in the Act 2 boss rows; the loop records it citing EP1R1. The quest and
  sneak autoplay runs do not move.
- npm test, balance:check (differs only until the golden is rewritten), the naming grep and
  autoplay:check pass.

## Rests on
- EP1R1, picked (a): 14.
- GP1R1, picked (a): three Sewer armour pieces; gloves from Downtown; cuirass from Puck.
- GP2R1, picked (a): the Lion Whip and the Fearmur hit for 16.

## Out of scope
- Each boss getting its own numbers, HP, armour or kit.
- The Financier, Sun Man, the Were-Rat, the Borgir boss, Pike.
- Writing the balance golden (the loop does it).
