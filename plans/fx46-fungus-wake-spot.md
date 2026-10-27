# FX46 — losing to the fungus wakes you where none of them can see you

## Goal

The "processed by fungus" defeat in the sewer wakes you at half HP on a fixed tile. Today that
tile is (10,10), in the middle of the soap-mine: five tiles from the Fungus King's post, beside
both Violet Fungus, and in plain sight of all of them. They are still there after the time skip,
so a beaten player (and the sneak autoplay) wakes up, gets spotted and goes down again a few turns
later.

Move the wake tile to the nearest walkable tile that no sewer enemy can see.

## The pick

"Can see" uses the game's own sight rule (`perception.js` `perceives`), in full daylight, at an
enemy's full sight range, checked for **every one of the eight facings**, so turning around cannot
expose the tile. Each enemy is checked from its spawn and, if it wanders, from every walkable tile
of its home region (the two Violet Fungus roam the soap-mine). Walls block sight through
`hasLineOfSight`, as in play.

"Nearest" is the length of the game's own `findPath` route from the old spot (10,10), with the
soap-mine chest blocking as it does in play.

Against today's sewer map four hidden tiles tie at 7 steps: (12,4), (15,15), (12,16) and (12,17).
The pick is **(12,17)**: of the four, it has the most hidden neighbours, so it sits inside the
small walled pocket south of the soap-mine rather than on the edge of someone's view. That
tie-break is the loop's call and is flagged for Caelan's eye.

## Acceptance

- After the fungus defeat you wake where no sewer enemy can see you.
- A test pins that against the real sewer map and the real spawned enemies (their sight ranges
  come from the same spawn path the game uses), so moving an enemy, widening a sight range or
  opening a wall later fails it.
- The test also pins "nearest": no other hidden tile is a shorter walk from the old spot.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` pass. The sneak autoplay used
  to die there; if its golden moves, the slice stops and asks rather than rewriting it.

## Rulings it rests on

None. The tile is the loop's pick under the rule above, flagged for review.

## Out of scope

- The defeat's log line and every other scenario's wake spot.
- Moving enemies back to their posts after a defeat; the check is against their posts and
  wander ground, not wherever a chase left them.
- Night: darkness only shrinks sight, so the daylight check is the worst case.
