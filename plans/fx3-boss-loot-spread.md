# A beaten boss's loot lands where you can see it

## Goal

When a boss dies, everything it drops (its required item, its unused kit, the Were-Rat's fur,
Pike's rope) is put on the corpse's own tile today. The corpse is drawn over that tile for the
rest of the visit, so the whole pile is invisible, and because pickup takes items in list order
and stops when the bag is full, the required item (pushed last) is the one most likely left
behind.

After this slice each drop goes onto its own free tile around the body, the required item first.

## How it works

`_handleEnemyDeath` in `game/main.js` places every death drop through one helper that picks a
tile for it:

- It searches outward from the body, through walkable ground, nearest first; at distance one the
  order is south, north, east, west (the order the Were-Rat's fur already used).
- A tile is free when it is walkable, is not the body, the player's tile, a container, a map
  exit, or under any other enemy (alive or a corpse), and holds no ground item. A tile already
  holding the *same* item counts as free, so a respawned boss killed again in the same spot puts
  its drop back on the same tile and the existing record dedup still stops it farming copies.
- The search goes at most three steps out and never through an exit. If nothing is free, the
  drop falls back to the body's tile, as today.
- The required item is placed first, so it gets the nearest tile and sits first in the ground
  list. The log lines are unchanged and keep their order.

## Acceptance checks

- A beaten boss's drops land on free tiles around it, none under the body.
- The required item is placed first and is picked up first.
- `tests/boss-drops.test.js` runs the live `_handleEnemyDeath` against a stand-in game and checks
  both, plus the walls, corpses, the player's tile, a crowded corner, and the re-kill dedup.
- Evidence: a staged Act 2 boss kill at 3440x1440 showing the loot around the body.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass. Quest 1 kills the
  Were-Rat, so its converter and fur move one tile; if the autoplay golden drifts, stop and ask.

## Rulings it rests on

- The scout's defect "a beaten boss's loot is hidden under its body", tweaked into this slice and
  approved by the loop under the standing delegation (LOOP.md §11). It adds no name, copy or
  tuning number.

## Out of scope

- Drawing ground items above corpses (the other fix the defect named).
- Separate handling for ordinary enemies: any enemy that drops unused kit goes through the same
  death path, so its kit spreads the same way. Nothing else about them changes.
- Any change to what a boss drops, the log lines, or pickup itself.
