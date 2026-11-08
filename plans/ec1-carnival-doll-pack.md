# ec1: a pack of four circles you at the Carnival and whittles you down

## Goal
The Carnival gets a second set piece, hand-placed in its south-west around (10,17): four hostile
[Doll] creatures at (9,16), (11,16), (9,18) and (11,18). They are carnival dolls, fought to
pieces. They hunt you when they see you, walk up like any chaser, and once beside you take
turns: one beat they step to the next free tile around you, the next they hit. The three horses
already do this (plans/cb1-carnival-horses-circle.md); the dolls reuse that, with no new AI.

## How it works
- `game/slots.js`: one new entry, `carnival_doll`, carrying `tag: 'circler'`. That tag is the
  flag circling reads (the enemy constructor drops unknown fields, which is why it rides in
  `tag`). Stand-ins until designed: the townie Knuckles's armour and damage (-30 and 4), a
  two-item kit (rock and pipe), a small purse, the name `[Doll]`, barks `[TEXT]`. No `boss`, no
  slot, so it drops nothing required.
- `game/carnival-map.json`: four spawns naming the entry.
- `game/sprites.js`: the type draws an existing, unused cell of the Tiny Dungeon sheet: the
  grey visored figure, which reads as a toy soldier and not as a child.
- `tests/carnival-cast.test.js`: pins for the four spawns, the entry, the flag, the art, and
  real enemy turns (resolveEnemyTurns, as tests/circling.test.js does) showing the dolls step
  around the player and hit, through the entry's flag alone.
- `tests/act2-enemy-counts.test.js`: the Carnival total goes 14 to 18, in its own commit saying
  the behaviour changed.

## Acceptance
- Four [Doll] at (9,16), (11,16), (9,18), (11,18) hunt you on sight and circle you once beside
  you.
- They use the circling that exists; a test reads the entry's flag. No AI file is touched.
- The four tiles are open ground, clear of doors, items, other fighters, and the road the loops
  autoplay walks.
- `tools/balance-golden.txt` gains four Carnival rows and the Carnival faucet rises by the four
  purses, and nothing else moves. This branch does not write the golden: the loop does, citing
  this card. The new output is saved aside and reported.
- The autoplay golden does not move.
- Evidence: a 3440x1440 frame of the four around the player.
- `npm test`, `balance:check` (differs only by those rows until written), the naming grep and
  `autoplay:check` pass.

## Rests on
EC1R1, picked (b): "They're child-sized carnival dolls: same pack, same circling, and you fight
them to pieces." Also CB1 (the circling behaviour, done). Every name, number, bark and art cell
is a stand-in.

## Out of scope
- Final name, barks, art and numbers.
- Any hurt-child line or child-like art: they are dolls, fought to pieces.
- Writing the balance and autoplay goldens.
- New AI of any kind.
