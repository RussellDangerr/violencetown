# SG1 - the strongman stands in the Carnival, and you can talk him into walking with you

**Parent:** `plans/spine.md` (Act 2, the Carnival), `plans/st2-strongman-wins-contest.md`.

## Goal

One strongman stands in the Carnival at (24,13), calm. Talking to him offers one recruit
choice. Taking it turns him into an ally through the same flip a gift uses (give-action.js
`applyFlip`): he walks with you and fights beside you through the existing ally turn
(`_allyTakeTurn`). Leave the Carnival and come back and he is there and still yours. Hitting
him turns him on you, as it does any ally.

## Shape

- `game/slots.js`: the `strongman` entry gets its own type, a `dialogueId`, and stays calm
  and bribeable with the numbers it has today.
- `game/carnival-map.json`: his spawn moves from (43,14) to (24,13). One strongman, not two.
- `game/dialogue.js`: a `strongman` dialogue with a placeholder greeting and one recruit
  choice that lands a disposition shift across his flip threshold.
- `game/sprites.js`: his type gets the bald mustached Tiny cell (2,7), shared with Pike.
- `game/main.js` (small, contained): when you change zone, a living ally strongman is
  written down as a quest flag; `_loadMap` hands the flag back by flipping the freshly
  spawned strongman to an ally. The flag is only written once he is an ally, so a game that
  never recruits him carries no new save field. A save made inside the zone already keeps him
  (saved enemies carry `_ally`).
- `tools/balance-golden.txt`: his row's type column follows his type. No other row moves.

## Acceptance

1. He stands at (24,13) and does not attack; talking opens `[TEXT]` lines with a recruit choice.
2. Taking it, he follows you and fights hostiles beside you through `_allyTakeTurn`.
3. Leave the Carnival and come back: he is there, still an ally. A save and reload: the same.
   A test goes through `_loadMap` and a save.
4. Hitting him turns him on you.
5. A game that never recruits him carries no new save field.
6. The balance golden's only change is his own row; the autoplay golden does not move.
7. `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

## Rulings

- LN1R1 a: the Carnival's cast split (he is a character, not a boss).
- SG1R1 a: he walks with you inside the Carnival only, waits there when you leave.
- SG1R2 a: one strongman: ST2's man moves to (24,13), is calm, and the talk recruit sits
  beside the gift flip.

## Out of scope

The contest, the booth guard and the monster (the stuffed animal card). Real name, lines,
numbers and art: every line is `[TEXT]`, numbers are the ordinary Carnival Clown's.
Recruiting outside the Carnival.
