# CA1 — a statue in the Graveyard that comes closer only while you look at it

## Goal

The Graveyard gets one new hand-placed creature at (21,9), a stone figure. It moves
only on the beats where you are looking at it. Look at it and every action you take
brings it one tile closer, or lands a blow once it is beside you. Look away and it
does nothing at all, even when it is beside you. The fun is the choice of which way to
face, and the fact that turning costs no action.

## The rule

On each committed action (the enemy beat that follows it):

1. Is it looked at? Ask `perception.js`'s own `perceives()` about the angel's tile, with
   the player as the watcher: the player's facing as a vector, sight range 8. Looked at
   means the verdict is DIRECT: inside the same 90-degree cone and with the same line
   of sight enemies use on the player, out to 8 tiles. A wall between you means not
   looking.
2. Looked at and beside you: it hits (the entry's damage).
3. Looked at and not beside you: it steps one tile closer, using the ordinary greedy
   step (never into a wall, a creature, a container or your tile).
4. Not looked at: nothing. No step, no hit, no turning toward you.

Turning in place costs no action in the game today, so it never reaches this code and
never moves the angel. A blow from you does not turn you today, so a blow counts as
looking for that beat whatever way you face. That uses the existing `struck()` mark
(`_struckBy`), which every blow already stamps on a hostile that is not yet hunting.

## Staying out of the fight

The angel never leaves the `idle` state and has no sight of its own (sight range 0, as
the ants have). So `fighters()` never counts it, which means it never starts or holds
the fight fog, and `joiners()` never pulls it into chasing when another fight is on.
It draws nothing from `game.rng`.

## Where it lives

- `game/slots.js`: one registry entry. The `angel` tag marks it, the way `circler` marks
  the horses.
- `game/ai.js`: the tag and its predicate (a leaf, no imports).
- `game/npc.js`: the turn, taken at the top of the hostile case.
- `game/graveyard-map.json`: one spawn `{ id, entry, x: 21, y: 9 }`.
- `game/sprites.js`: art, an existing Tiny Dungeon cell no other Graveyard creature uses.
- `tests/crying-angel.test.js`: new. `tests/act2-enemy-counts.test.js`: the Graveyard
  total 6 becomes 7 because the behaviour changed (its own commit).
- `tools/balance-golden.txt`: the Graveyard gains the angel's row and the faucet moves
  with it. The builder cannot run `balance:write`, so the new golden is handed to the
  loop with the numbers.

## Acceptance

- The Graveyard has one angel at (21,9), on open ground.
- Facing it in line of sight within 8 tiles, each action brings it a tile closer, or a
  blow once beside you (tests drive real enemy turns).
- Facing away: no step and no blow on any action, even beside you; a wall between you
  counts as not looking (tests).
- Turning in place alone never moves it (the facing change is not a beat; tested by
  changing facing with no world beat).
- A blow from you counts as looking that beat, whichever way you face.
- It never makes `fighters()` non-empty by itself, and a fight elsewhere does not make it
  chase (tests).
- The balance golden moves by the angel's row and the Graveyard faucet only; the autoplay
  golden does not move.
- Evidence at 3440x1440: closer after three steps facing it; still after three facing away.

## Rulings and picks

None. The loop approved the card; every number and name below is a stand-in.

## Stand-ins (to be designed)

- Numbers and kit are the Rattling Skeleton's (35 GP, 5 hits, 13 turns measured).
- Name is `[Angel]`, barks and examine text are `[TEXT]`.
- Art is an existing cell, not drawn for it.

## Out of scope

- Any change to `main.js` or `fight-area.js` (the behaviour reads the player's facing from
  the game object).
- Authored lines, a real name, real art, tuning.
- Looking-at rules for any other creature; more angels.
