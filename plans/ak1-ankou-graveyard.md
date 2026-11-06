# AK1: the Ankou walks the Graveyard

## Goal
One Ankou, hand-placed in the Graveyard at (8,21): a skeleton with a ghost drawn around it.
It hunts you when it sees you and can be fought to the end like any ordinary hostile.

## How
- `game/slots.js`: a new registry entry `ankou`, placed by a map spawn that names the entry
  (`{ id, entry, x, y }`), as the Crying Angel is. It is in no slot's pool, so it cannot
  disturb the Graveyard's boss slot. Numbers and kit are the Polar Bear's (armour 3, damage 10,
  the same purse and loadout); barks and examine text are `[TEXT]`.
- `game/sprites.js`: an `Ankou` enemy sprite, an existing gaunt Tiny Dungeon cell, carrying a
  `ghost` field: the white ghost cell drawn as a see-through, slightly larger surround.
- `game/renderer.js`: when the sprite entry has a `ghost`, draw it behind the body on every
  frame of a living creature, walking or in a fight. No other entry has the field.
- `game/graveyard-map.json`: the one spawn at (8,21).

## Acceptance
- The Graveyard has one Ankou at (8,21); it spawns hostile, hunts on sight, and takes a fight
  through to its death.
- The ghost is a field on the Ankou's sprite entry; a test shows no other sprite entry and no
  registry entry has one, and the renderer draws it before the body.
- `tools/balance-golden.txt` gains its one Graveyard row and +10 on the Graveyard faucet and
  nothing else moves. This builder may not write that golden: it reports the exact diff and the
  loop records it in its own commit.
- The autoplay golden does not move (no run enters the Graveyard).
- Evidence: a 3440x1440 frame beside the Rattling Skeleton.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

## Rulings and picks
None. The name "Ankou" is Caelan's. Every other player-facing thing is a stand-in, flagged:
Polar Bear numbers and kit, `[TEXT]` barks and examine, the art cells.

## Out of scope
- A ghost that outlives the skeleton as a second stage.
- A pool or slot for it; any boss behaviour; any other zone.
- Final art, names, copy and tuning.
