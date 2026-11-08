# ep3: more Clowns in the Carnival, more Skeletons in the Graveyard

## Goal
The Carnival and the Graveyard are thin on ordinary fighters. Ruling EP3R1, option (a): both
reach about one fighter per 100 tiles. Counted on dev (bosses included): the Carnival has 5
(boss, Clown, three rats) and the Graveyard has 2 (boss, Skeleton), which matches the ruling's
starting numbers. The targets are 9 and 6, so four more Clowns and four more Skeletons.

## What changes
- `game/carnival-map.json`: four new spawns, `clown2` to `clown5`, each a copy of `clown1`
  (same type, kit, drops, gold, disposition, wander behaviour; damage 12 from EP2).
- `game/graveyard-map.json`: four new spawns, `skel2` to `skel5`, each a copy of `skel1`.
- Every spot is a placeholder for the owner's repaint. Each sits on open ground, well away from
  the boss, the doorways and the road the loops autoplay walks (the Carnival's top-left, from
  the north door to the lion whip and the fire blood). The Graveyard is not on that walk at all.
- `tests/act2-enemy-counts.test.js`: pins the counts (9 and 6), unique ids, that each copy is its
  original apart from id and spot, that each stands on walkable ground clear of the boss, the
  doorways, items and the loops walk, and that a killed copy lands on the respawn list and
  comes back like the original.

## Acceptance
- The Carnival holds 9 fighters and the Graveyard 6.
- Each new one fights, drops and returns on the respawn list like its zone's original.
- The balance golden gains the new rows (the loop records it, citing EP3R1). The autoplay
  golden must not move; if it does, this stops and asks.
- A 3440x1440 frame of each zone shows the new enemies.
- npm test, balance:check (differs only until the golden is rewritten), the naming grep and
  autoplay:check pass.

## Rests on
- EP3R1, picked (a): Carnival 5 to 9, Graveyard 2 to 6.
- EP2 (merged): the Clown and the Skeleton hit for 12; the copies inherit it.

## Out of scope
- Any new enemy kind, kit, stat or art; final positions (the owner repaints those).
- Other zones, the bosses, the rats.
- Writing the balance and autoplay goldens (the loop does it).
