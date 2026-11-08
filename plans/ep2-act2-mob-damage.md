# ep2: ordinary Act 2 enemies hit as the ruling says

## Goal
The Clown (Carnival), the Skeleton (Graveyard) and the Greedy Green (Factory) are the ordinary
Act 2 enemies. They hit for 8, 8 and 9 today, below the Sewer's tougher mobs. Ruling EP2R1,
option (a): all three hit for 12. The Alien's allies copy the Green's numbers and the Snowman
copies the Skeleton's (the frozen-creatures test ties the Snowman to `skel1`, the Alien test ties
his allies to `green1`), so they follow to 12 and still match their sources.

## What changes
- `game/carnival-map.json` `clown1`, `game/graveyard-map.json` `skel1`, `game/factory-map.json`
  `green1`: `damage` becomes 12. Nothing else on those rows moves.
- `game/slots.js`: `alien_ally` and `snowman` take the same number, held in one exported constant
  (`ACT2_MOB_DAMAGE`) beside the boss one. The Yeti (12) and Polar Bear (10) copy other sources
  (the Sewer's) and stay put.
- `tests/act2-mob-numbers.test.js`: pins the numbers, runs a real fight against each (his turn
  through the real `resolveEnemyTurns`) and checks every blow is 12, and pins the enemies that do
  not change.

## Acceptance
- The Clown, the Skeleton, the Green and the Alien's allies hit for 12 in a real fight; the
  Snowman matches the Skeleton.
- The rats, the Ruffian (Downtown, Act 1) and the Sewer's enemies do not change.
- The Act 2 bosses (14), the Financier (12) and Sun Man (30) do not change.
- The balance golden and the loops autoplay fingerprint move; the loop records them citing EP2R1.
  The quest and sneak runs do not move.
- npm test, balance:check (differs only until the golden is rewritten), the naming grep and
  autoplay:check pass.

## Rests on
- EP2R1, picked (a): the Clown, the Skeleton and the Greedy Green hit for 12.
- GP1 (merged, armour by zone) and EP1 (merged, bosses at 14), both untouched here.

## Out of scope
- HP, armour, gold or kit changes for any enemy; each ordinary enemy getting its own number.
- The Act 2 bosses, the Yeti, the Polar Bear, the rats, the Ruffian, the Sewer.
- Writing the balance and autoplay goldens (the loop does it).
