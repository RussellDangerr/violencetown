# KS1 — what you kill stays dead, then comes back a few at a time

## Goal

Today every enemy is rebuilt from the map at full health each time you enter a zone
(`main.js _loadMap`). After this slice, a kill is remembered: the enemy stays dead when you
come back, and the zone refills a few at a time as you move between zones. Seven zone changes
after a kill, it is back.

## How it works

- **The list.** When an enemy that the map placed dies, its id goes on that zone's respawn
  list (`game._respawnLists`, `{ mapUrl: [{ id, age }] }`). Enemies the game spawns on the fly
  (summons, the sewer escape's waves) are not rebuilt from the map anyway, so they are not
  listed.
- **A zone change.** Every walk through a door, and the two bridge rides, counts as one step.
  On each step every listed kill ages by one, then each list sends some kills back, oldest
  first: `floor(n / (stepsLeft + 1))` of its `n` kills, where `stepsLeft` is how many steps the
  oldest kill still has before 7. Anything that has waited 7 steps is always back. So a lone
  kill waits all 7 steps, and seven kills come back one per step. No randomness is involved.
- **Loading a zone** skips any spawn whose id is still on the zone's list.
- **One constant.** `RESPAWN_STEPS = 7` in `game/drops.js`. Changing it to 5 is one line.
- **A boss's items drop once.** The slot's required item (the Sewer boss's converter), the
  Were-Rat's fur and Pike's rope drop only the first time that enemy dies. A respawned boss
  dies with nothing. The boss retry after you go down is untouched (it does not kill the boss).
- **Real loot counts.** A drop record now carries a count, so three of the same item on one
  tile come back as three. Picking one up takes one off the record instead of marking the
  whole tile collected.
- **The save** keeps the respawn lists and the set of bosses whose items already dropped. Both
  are left out of the save while empty, so a save with no kills looks exactly as before, and an
  old save with neither loads fine.

## Rulings this rests on

- KSR1 — "When you leave a zone and come back, do the monsters you killed stay dead?" Caelan:
  a respawn list, time-gated on zone changes, incremental rather than everything at once, all
  back after about 5 to 7 zone changes. The loop chose 7, kept as one constant.

## Acceptance checks

1. Kill something, leave and come straight back: it is still dead.
2. Over the next zone changes they return a few at a time; after 7, every kill is back.
3. A beaten boss's quest item drops only once, however often it respawns.
4. Loot left on a tile keeps its real count across visits.
5. A save and reload keeps the respawn lists.
6. Evidence: frames of a cleared zone, then partly refilled, then full, reached by walking
   between zones with the arrow keys.
7. `npm test`, `balance:check`, the naming grep and `autoplay:check` pass. If quest 1's
   autoplay moves, stop and report.

Tests: `tests/respawn-list.test.js` covers the list maths, the boss-once rule, loot counts and
the save round trip.

## Out of scope

- The Ruffian's stolen gold, and the Act 2 quests (their own slices).
- Respawning an enemy that chased you into another zone and died there (pursuit is off).
- Any on-screen sign that a zone is refilling.
