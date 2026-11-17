# TC1: break the trash compactor before its walls crush you

## Goal

A new room off the Factory's south-west corner. Step in and the door shuts behind you. A trash
compactor stands in the middle of the room. It never moves and never swings. The walls on both
sides step in, one column each, every 4 committed actions. At action 20 only one column is left
and you are crushed. Break the compactor and the walls stop where they are and the door opens.

This is a set piece in a map off the spine (like the frozen area), so no Locked spine row moves.
It pays nothing yet.

## Rulings it rests on

- TC1R1, pick (a): the compactor is the giant robot. It is one machine in the middle of the
  room that never swings, and the closing walls are the threat.

## What gets built

- `game/compactor-map.json`: an 11-column room. Door in the bottom wall, spawn just inside it,
  the compactor in the middle. Existing Factory floor and wall tiles stand in for terrain.
- `game/factory-map.json`: a door at (4,28) into the room.
- `game/compactor.js`: the room's rules as pure functions over the game. State is
  `{ armed, actions, broken }`. Steps = floor(actions / 4), at most 5. Step 5 crushes.
  Arming shuts the door, a beat counts one action, a step moves the wall columns and shoves
  whoever stands in them inward, breaking it stops the count and opens the door, a retry resets
  the room.
- `game/slots.js`: a `compactor` entry (armour 6, damage 0, 100 HP, sight 0 so it never acts,
  heavy so it cannot be shoved). `game/sprites.js`: its art, an existing cell.
- `game/main.js` (small hooks only): the beat after each committed action, the room applied on
  map load, the break on its death, the reset on defeat, a new game starts clean, the room's
  name for the Continue line, and a blow to the compactor does not provoke it.
- `game/save.js`: the state is saved as `world.compactor`, left out while it is the default so
  every other save is byte-for-byte as before. Wall tiles already travel in the tile diffs.
- `game/world-map.js`: the room is a box beside the Factory on the Map tab, joined to it.
- `tools/balance-golden.txt`: gains the room's rows and nothing else, in its own commit.

## Acceptance

1. A door at Factory (4,28) leads to the room and shuts behind you with a plain line until the
   fight ends.
2. The walls step every 4 committed actions. Turning in place, opening the wheel or waiting at a
   menu never steps them (a test shows it).
3. A wall stepping onto you shoves you inward. At action 20 you die through the ordinary death,
   and the retry finds the room open again.
4. Breaking it at any point stops the walls and opens the door. A reload mid-fight keeps the
   walls where they were (tests).
5. The Map tab shows the room joined to the Factory.
6. The balance golden gains only the new map's rows. The autoplay golden does not move.
7. Evidence: 3440x1440 frames at actions 0, 12 and 20, and one of it broken.
8. npm test, balance:check, the naming grep and autoplay:check pass.

## Stand-ins, for Caelan's eye

Armour 6, damage 0, 100 HP (8 hits lazy, 3 informed by the harness, so 20 actions is 2.5 times
the lazy count). An 11-column room. The name `[Compactor]`. Every line of copy. The art is an
existing cell and the terrain is the Factory's own tiles.

## Out of scope

- A reward for breaking it.
- Real art, a real name, real copy.
- Walls that retreat after the compactor breaks.
- Any change to the spine.
