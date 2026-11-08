# AN2 — carry sweet food and an ant swarm comes for it

## Goal

While the player carries sweet food in a warm zone, ants walk in from the edge of the map and
come for it. An ant that reaches the player bites and holds on, biting every turn until the player
spends a turn brushing it off. Squashing an ant leaves an alarm scent that pulls the others to it,
and sometimes one or two more ants walk in from the edge. Putting the food away (it leaves the bag
by any route: dropped, given, sold, eaten, delivered) ends the swarm: the ants let go and walk
back out. Ants never set foot on a cold tile, so the frozen area is safe.

The ants move by AN1's rules (`game/ants.js`): scouts wander, ants follow trails, ants close in on
food they notice, and alarm scent draws them to a squashed ant.

## How it works, in plain words

- **Sweet food.** Nothing in the game marks food as sweet yet, so the Tiger's Blood Ice Cone is
  the only sweet item for now: one set in `ants.js`.
- **Warm and cold.** A tile is cold when it is one of the frozen tiles (snow, ice: the 70–79 band
  in `data.js`). The swarm runs only while the player stands on a warm tile, and ants treat cold
  tiles as walls (AN1 already does).
- **Where ants come from.** The entry tiles are the open tiles on the map's outer edge plus its
  doors. When a swarm starts, its nest is the entry tile the player can reach in the fewest steps.
  Every ant, first wave and reinforcement alike, walks in there, one per turn.
- **How they find you.** A swarm starts the way a real one does: a scout has already found the
  food and walked home, so a trail runs from the player back to the nest, laid by AN1's own
  carrier rule (strongest by the food, weakest by the nest). After that the sweet food drips: each
  turn the player's tile gets the trail a carrier lays by the food. Ants follow the trail out and
  close in once they are near.
- **Bite and latch.** An ant next to the player bites for 1 and latches on. A latched ant moves
  with the player, staying beside them, and bites for 1 every turn. If there is no open tile beside
  the player it falls off.
- **Brush off.** Waiting a turn while ants are latched brushes every latched ant off: each lands a
  couple of tiles away and lies there for that turn, neither moving nor biting. Waiting with none
  latched is an ordinary wait.
- **Squash.** An ant has 1 HP, so any hit kills it. The squashed ant leaves AN1's alarm scent on
  its tile and around it, and the others head for it. While the swarm is on, a squash sometimes
  sends one or two more ants in from the edge (AN1's recruit count).
- **The swarm ends** when the sweet food leaves the bag or the player steps onto a cold tile. Ants
  let go, walk back to the nest and leave the map there. Changing zones clears them, as it clears
  every other creature.
- **Not a fight.** Ants have no eyes (sight 0), so they never open a fight, its fog or its
  entrance, and they never join one. The ordinary enemy turn skips them; the swarm moves them.
- **Determinism.** Every random choice uses the game's seeded RNG. With no sweet food and no ants
  the swarm draws nothing, so the autoplay is unchanged.

## Acceptance

- Carrying the cone in a warm zone brings ants in from the edge; dropping it (or it otherwise
  leaving the bag) sends them back out and off the map.
- Ants follow the trail to the player, swarm to a squashed ant, and reinforcements walk in from
  the edge.
- A latched ant bites for 1 every turn, follows the player, and stops after one turn of brushing.
- No ant ever stands on a cold tile, and no swarm starts on one.
- A new test, `tests/ant-swarm.test.js`, pins the above on small grids with a seeded RNG.
- A GIF at 3440x1440 of a swarm, a squash and a brush-off (scratchpad only).
- `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

## Rulings it rests on

- **AN1** (done): the ant movement rules in `game/ants.js`.
- **ANR1, pick b**: a swarm happens only while you carry sweet food, like the ice cone.
- **ANR3, pick a**: each ant has 1 HP and a 1-damage bite that latches and repeats until you spend
  a turn brushing it off.
- **ANR2, pick a / ANR4, pick a**: the ant's art starts from the Kenney Pico-8 mite, two or three
  to a tile, reshaped (body as three dots, three legs a side) and recoloured to the Tiny outline
  colour. The art is not built on this branch: it needs a generator script, an image and a line
  in the sprite-coverage test, all outside this slice's files. Until it lands, an ant draws as
  the renderer's tinted fallback square.

## Placeholders (for Caelan's eye)

- Swarm size, the reinforcement chance and how far a brushed ant lands are new numbers, set as
  named constants at the top of the swarm section in `ants.js`.
- Which key brushes: the existing Wait (T, the wheel's Wait and the menu's Wait).
- Log lines are `[TEXT]`.

## Out of scope

- Other sweet foods, and anything that marks an item sweet beyond the one set.
- Ants eating or carrying off the food; a nest you can find; chill coma; ants in the frozen area.
- Hiding the HP bar and K.O. tag the renderer draws over every enemy (needs `renderer.js`).
