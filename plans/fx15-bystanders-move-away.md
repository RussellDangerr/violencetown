# FX15 — scared townsfolk near a fight actually move away

A fix to F3c (`plans/f3c-bystanders-clear-out.md`, merged).

## The bug

`bystanderTurn` in `game/npc.js` marks a neutral as scared (`_fleeing`) when it sees the player or
a fighter. But it only steps away while it stands inside the fight area, and that area is only the
tiles a *fighter* perceives. Fighters face the player, so a townsperson two tiles behind the enemy
you are hitting is outside every fighter's cone. It is scared, and it stands still in plain view,
right next to the fight.

## Goal

The player counts as part of the fight. A scared townsperson keeps moving away until no fighter
and not the player can see it, then waits there as before.

## How it works

- `game/fight-area.js` gets `playerSees(map, player, fs, x, y)`: the player sees a tile when there
  is a clear line of sight to it (`hasLineOfSight`, walls block) and it is no further than the
  farthest-seeing fighter can see (the largest `sightRange` among `fs`, Chebyshev). The player has
  no facing cone in this game, so the view is all round. No new number: the reach is the fighters'
  own.
- It also gets `inFightView(map, fs, player, x, y)`: a fighter perceives the tile, or the player
  sees it.
- `bystanderTurn` uses `inFightView` for both "am I still in it" and the safe-tile test it hands to
  `fleeFrom`. Nothing else changes: the notice rule, who holds their ground (vendors, quest givers,
  heavy set pieces, bosses, sewer dwellers), the walk home, and the fact that fleeing is a flag and
  never a fighter.
- `fightArea()`, which the renderer's fog draws from, is left alone, so the fog looks the same.

## Acceptance

1. A scared townsperson two tiles from a fight, out of every fighter's sight but in the player's,
   moves away until neither a fighter nor the player can see it, then stays put.
2. A wall between it and the player counts: once behind one, out of the fighters' sight, it stops.
3. Vendors, quest givers and sewer creatures in the same spot still hold.
4. Tests in `tests/bystander-radius.test.js`; the F3c tests in `tests/npc-flee.test.js` still pass
   unchanged.
5. Evidence: a staged daytime Town fight in a headless page, the game's own turns running, as a
   GIF at 3440x1440 of townsfolk scattering. Kept outside the repo.
6. `npm test`, `balance:check`, the naming grep and `autoplay:check` pass. Quest 1 has no fleeing
   neutrals (sewer creatures hold), so the autoplay must not move; if it does, the slice stops and
   asks.

## What it rests on

- The FX15 card, tweaked by the loop under the standing delegation from a scout report: count the
  player's view as part of the area.
- F3c's rulings, unchanged: most neutrals run out of the way; vendors and quest givers hold; sewer
  dwellers hold, only surface townsfolk scatter.

## Out of scope

- The fog's shape (it still shows only what the fighters see).
- Any log line, emote or copy for a fleeing neutral.
- Night shrinking the player's reach; it uses the fighters' daylight sight.
- A new sight range for the player.
