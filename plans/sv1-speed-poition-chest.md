# sv1: a Speed Poition waits in a chest off the beaten path

## Goal

Put one Speed Poition somewhere a player has to go looking for it. The spot is the
Graveyard, in a chest tucked into a corner, away from the road between the arch and
the boss. Quest 1 never visits the Graveyard, so this does not touch the story run.

## How

One new entry in `game/graveyard-map.json`, in a `containers` list, copying the shape
of `factory-locker` in `game/factory-map.json`: an id, `type: "chest"`, a tile, and
`contents: ["speed_poition"]`. No code change. Opening a chest, taking from it and
saving it already work for every other container.

## Acceptance checks

- The chest sits on a walkable-adjacent tile that real feet can reach from the
  Graveyard's spawn, by the game's own walkability rules.
- It is well away from the shortest walk from the spawn to the boss, and from the
  walk to the south exit.
- It is not on the row just above a tall prop, where the prop would be drawn over it.
- Walking to it with real key presses and bumping it opens it; taking the Poition puts
  exactly one in the bag and empties the chest.
- A reload (CONTINUE) keeps the chest empty and the Poition in the bag.
- Drinking the Poition does what it does today (the item is not changed).
- Tests, balance check, naming grep and the quest 1 autoplay all stay green.

## Rulings this rests on

SPR1, picked (b): "It's in a chest somewhere off the beaten path". The spot was left to
the loop; the tile it chose is listed in the report for review.

## Out of scope

Anything about the Poition itself (name, effect, numbers), other chests, any change to
how containers persist or refill, and the art.
