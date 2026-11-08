# cb1: three horses circle you at the Carnival and attack as they go

## Goal
The Carnival gets a set piece of three hostile [Horse] creatures, placed by hand like the lion,
at (27,3), (29,3) and (28,5). They hunt you when they see you. They walk up the way any enemy
does; once one is beside you it takes turns: one beat it steps to the next free tile around you,
the next beat it hits. The three are staggered so they do not all swing on the same beat.

This slice builds circling once, as a small reusable piece, so a later pack can reuse it. A
carousel is not drawn yet; the spot the three stand around is (28,4).

## How it works
- `game/ai.js` (a leaf module) gets the pure part: whether a creature circles, which beat it
  steps on, and which tile it steps to. No dice: the step is a function of the creature's id, the
  turn count and which tiles are free.
- `game/npc.js`, in the hostile branch where an adjacent chaser attacks: if the creature circles
  and this is its stepping beat and a free tile around the player is within one step, it steps
  there instead of hitting. With no free tile, or on its hitting beat, it hits exactly as before.
  A step is made on the player's action, so it rides the one clock.
- The flag is off unless a registry entry sets it. The Enemy constructor (outside this slice's
  files) drops unknown fields, so the flag is carried in the existing free-form `tag` field, the
  same way the mugger is picked out (`tag: 'mugger'`). Nothing else uses that tag value.
- `game/slots.js`: one entry, `carnival_horse`, copying the Graveyard Rattling Skeleton's numbers
  and kit (4 GP purse, rock/pipe/foil hat/shoe bags, 12 damage). Name `[Horse]`, barks `[TEXT]`.
  No `boss`, no slot, so it drops nothing required.
- `game/carnival-map.json`: three spawns naming the entry.
- `game/sprites.js`: the type draws an existing cell (the grey beast the Polar Bear uses, a
  different zone).
- `tests/circling.test.js` (new): the pure step, and real enemy turns through `resolveEnemyTurns`.
- `tests/carnival-cast.test.js`: pins for the three spawns, the entry and the flag.
- `tests/act2-enemy-counts.test.js`: the Carnival total goes 11 to 14, in its own commit saying
  the behaviour changed.

## Acceptance
- Three [Horse] at (27,3), (29,3), (28,5) hunt you on sight.
- Beside you each takes turns stepping to the next free tile around you and hitting, shown by a
  test over several beats; with no free tile it just hits.
- A wall or another creature is never stepped into, and circling draws nothing from
  `game.rng`, both shown by tests.
- Any other enemy behaves as it did: nothing circles unless an entry sets the flag.
- `tools/balance-golden.txt` gains three Carnival rows and the Carnival faucet rises by the
  three horses' purses and nothing else moves. This branch does not write the golden: the loop
  does, citing this card. The new output is saved aside and reported.
- The autoplay golden does not move.
- Evidence: a 3440x1440 frame sequence of the three around the player over four beats.
- `npm test`, `balance:check` (differs only by those rows until written), the naming grep and
  `autoplay:check` pass.

## Rests on
No ruling. Approved by the loop. Every name, number, bark and art cell is a stand-in.

## Out of scope
- The carousel itself, final name, barks, art and numbers.
- Any cage, whip or hurt-animal line: the horses are combatants.
- Writing the balance and autoplay goldens.
- Reusing circling for another pack (a later card).
