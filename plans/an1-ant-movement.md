# AN1 — ants that move like real ants

## Goal

A pure module, `game/ants.js`, that moves ants around a tile grid the way a real foraging colony
does: scouts wander, an ant that finds food drinks and walks home laying a scent trail, later ants
follow the strongest trail out to the food, and a squashed ant leaves an alarm scent that pulls
nearby ants toward it. Cold tiles are walls to an ant.

Nothing appears on screen in this slice. A later slice puts ants into a zone and draws them; this
one gives it the rules to call once per world turn.

## How it works, in plain words

- **Two scents per tile.** Every tile holds a trail number and an alarm number. Both fade every
  turn by a fixed fraction, set by a half-life in turns. Trail lasts long (tens of turns); alarm
  is gone in a handful. Anything below a small floor drops to zero.
- **Only a carrier lays trail.** An ant carrying food adds trail to each tile it walks on the way
  home, more near the food and less near the nest. Scouts lay nothing.
- **Following a trail.** When there is trail next to an ant, it scores each open neighbour as
  (threshold + trail) squared and picks one at random in proportion to the scores. It never steps
  straight back onto the tile it just left (unless boxed in), and tiles behind it count for a
  quarter, so ants keep going forward along a trail instead of shuttling on it. Some of the time
  it takes a fully random step instead, so ants are noisy followers. A strong trail keeps winning
  over a weak one.
- **Wandering.** With no trail nearby, an ant walks a gently curving path: it mostly keeps its
  heading, sometimes turns 45 degrees (alternating left and right), and now and then picks any
  direction. It does not step back onto the tile it just left unless it is boxed in.
- **Finding food.** An ant notices food only a couple of tiles away. It closes in, drinks for one
  turn while next to it, then turns round for home carrying food. If there is trail it follows the
  trail back, the way it came; with none it heads straight for the nest by the shortest walkable
  route. Arriving at the nest it hands over the food and reports a delivery, so the caller can
  release recruits (one or two per delivery). It comes back out facing no particular way, like a
  new ant, so which branch it takes next is the trail's choice and not its old heading.
- **Alarm.** Squashing an ant writes alarm on its tile and a weaker amount on tiles up to a few
  tiles away. An ant that senses alarm becomes alarmed for a few turns: it ignores trail and food
  and steps toward the strongest alarm.
- **Cold.** Cold tiles are walls to an ant: it never steps onto one, and the home route goes round
  them. An ant that somehow starts on a cold tile does not move.
- **Determinism.** Every random choice draws from an injected seeded RNG (`game/rng.js`), never
  `Math.random`, so a seed replays exactly.

The module takes the map as a small interface — `{ width, height, isWalkable(x, y), isCold(x, y) }`
— so it never names tile kinds; whatever slice adds snow and ice supplies `isCold`. Ant-on-ant and
ant-on-player occupancy is the caller's to fold into `isWalkable`.

Every number is a named, exported constant at the top of the file, as a starting value for
Caelan to tune.

## Acceptance

- On a small test grid with the food behind a gap in a wall, a scout finds the food and walks home
  laying trail, and ants released afterwards reach the food sooner than ants on a clean grid,
  walking on trail tiles more.
- Double-bridge check: with two routes to the food and one already carrying a strong trail, most
  new ants take the trailed route, and it still wins after the colony has been running a while.
- A squashed ant leaves alarm on nearby tiles; ants within range end up closer to it, ants far
  away are untouched.
- No ant ever stands on a cold tile, even with food, trail or alarm on the far side.
- The same seed replays the same run exactly; a different seed gives a different run.
- Every number is a named constant.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

## Rulings it rests on

- Caelan asked for ants with a scientifically accurate move set (pheromone recruitment, following
  each other), with a research task first. The research's own rules for the game are this design;
  its numbers become the starting constants.
- Numbers the research did not give (alarm strength, how faint a scent can still be noticed) are
  placeholders, flagged for his eye.

## Out of scope

- Putting ants in a zone, drawing them, or any player-facing change.
- The nest's reserve pool, the snow cone's syrup count, and extra ants arriving after a squash.
- Biting, stinging and swarm damage.
- Chill coma recovery, cool tiles that slow ants, the lost-trail loop search, the "no entry" mark,
  and the share of ants that ignore trail on a given trip.
- Re-emitted alarm from ants that reach the spot.
- Two colony-level effects real ants show are not guaranteed with the starting numbers, so they
  are not tested: on two equal routes the colony does not always settle on one, and a colony on a
  long trailed route does not always stay on it once a shorter route opens. Both depend on the
  branch-choice and random-step numbers, which are Caelan's to tune.
