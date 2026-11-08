# RR1 — The Rat Ring makes you dodge; every worn ring shows its passive

## Goal
A worn ring's `evasion` passive now does something: before armour, each blow on the player is
rolled against his evasion. A dodged blow deals no damage, no stagger and no hit flash, and shows
a dodge splat. The Hands tab prints each worn ring's passive (a label and its number) under its
socket, which covers the Fire Ring as well.

## Rulings it rests on
- RRR1, pick a: evasion is rolled before armour; a dodged blow deals nothing.
- RRR2, pick b: 2% a point. The Rat Ring's 5 evasion is a dodge about 1 blow in 10.

## How
- `game/hit-splat.js`: `DODGE_PER_POINT`, `dodgeChance(evasion)`, `DODGE_WORD` (placeholder).
- `game/main.js`: `_rollDodge()` and a check in `applyDamageToPlayer` after the 0-contract and
  before armour. The seeded RNG is drawn only when evasion is above zero, so a run without the
  ring draws exactly what it does today.
- `game/layout.js`: `ringPassiveRows(ring)`; `game/renderer.js` draws the rows on the Hands tab and
  gives the `dodge` splat a colour.

## Acceptance
- Over many seeded blows with the Rat Ring, the dodge rate lands near 10%; a dodge deals nothing.
- With no evasion, no extra RNG draw happens.
- The Hands tab shows each worn ring's passive; the test opens it with real keys.
- 3440x1440 frames of a dodge and of the Hands tab.
- npm test, balance:check, naming grep, autoplay:check pass.

## Out of scope
Enemies dodging. Real copy for the dodge word and the passive label (both `[TEXT]`). A dodge
splat art cell (it borrows the physical shape for now). Other evasion sources.
