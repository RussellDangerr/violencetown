# Pathing round corners

Caelan, 2026-11-22: "find a way" pathfinding needs to be stronger; a lot of the time it won't find
a way around a corner.

## The problem

`getGreedyStep` (game/pathing.js) moves a character to the neighbour that most cuts straight-line
(Chebyshev) distance to its target. When a wall sits between them, every neighbour that cuts the
distance is a wall, so the character stands still. It is the step behind:

- the hostile chase, to you or to where it last saw you (npc.js)
- the friendly NPC chase to you, wandering, walking home (`returning`), carrying to a chest,
  fetching a ground item (npc.js)
- allies going for a target or following you (main.js)

`goHomeStep` and tap-to-walk already use a real search (`findPath`, `pathToNearest`). The
Wilderness bear picks its spawn spot by checking the greedy chase can reach you from it.

## The change

`getGreedyStep` keeps its name and signature, and every caller keeps calling it. Inside, it
floods outward from the target over terrain (walls and containers block; characters don't, since
they move) until it reaches the mover. That gives each tile its true walking distance to the
target, and the step goes to the free neighbour with the smallest one.

- Open ground: true distance equals Chebyshev distance, and ties break the same way as before
  (straight-line distance, then the fixed neighbour order), so the step is unchanged.
- Behind a wall: the step leads round the corner instead of standing still.
- Blocked by another character: waits, as before (only steps that bring it closer count).
- No route over terrain at all (target across a river, flood cap hit): the old straight-line
  nudge, so nothing that used to edge closer now freezes.

Same no-corner-cutting rule on diagonals as everywhere else.

## Tests

tests/pathing.test.js: round an L-corner, out of a U-shaped pocket, open-ground steps match the
old rule, waits when the only way forward is occupied, falls back when walled off.

## Gates

`npm test`, then `npm run autoplay:check`. Quest 1 enemies now come round corners, so a drift is
expected; if the runs still play out, re-record with `npm run autoplay:write` citing this
request. Then `npm run sim:check` (and `sim:write` + `spirits:harvest` for an intended move).

## Results (133fc90)

- `npm test`: all pass but one, the plain-copy guard, which fails the same way on dev (an
  ignored local `game/_design-screen.html`). 7 new pathing tests.
- Autoplay: all three runs still clear quest 1; golden re-recorded in 133fc90. The fighter's
  sewer escape went from 4 turns to 61, with one more fall.
- Sim, 50 seeds: **the fighter finishes quest 1 on 54% of seeds, down from 98%.** Every
  unfinished run ends at 5 falls in the sewer (recover_converter): the rats that used to stand
  stuck behind the sewer walls now come round them. The sneak finishes 98% (unchanged), and
  its escape is faster (48 to 20 turns) since nothing gets wedged in its way. Loops did not
  move. The sim baseline is **not** re-recorded; that waits on Caelan's ruling.
- Cost: about 0.27 ms per step on the largest map (Carnival) with far targets.

## Ruling (Caelan, 2026-11-22)

**Everyone gets the corner-rounding chase, and the sewer is rebalanced.**

## The sewer rebalance

Why the fighter stopped finishing: after a fall in the boss fight you wake at the sewer door,
and the Wererat and the Fungus King used to be stuck behind the walls on their way there. Now
they arrive, and the retry killed you again as you woke, five times over.

- **A boss retry puts the fight back at its posts** (adf3a1c). Everyone in the boss fight goes
  back to their own post, out of the hunt, as the retry's "start the encounter over" always
  meant. `npc.js` `sendToPosts`, called through `_fightToPosts` (optional-called, like
  `_finaleReset`, so the defeat tests' stand-in games need not carry it).
  tests/boss-retry-posts.test.js.
- Tried and dropped: a smaller first escape wave (10 to 8 rats). Escape falls went 0.92 to 0.90,
  inside the noise, so it was reverted.

Sim, 50 seeds, after the retry reset:

| | finished | falls per run | turns |
|---|---|---|---|
| fighter, before this branch | 98% | 2.22 | 108 |
| fighter, now | 98% | 3.54 | 144 |
| sneak, before this branch | 98% | 2.76 | 180 |
| sneak, now | 98% | 5.16 | 217 |

Both finish as often as before. The extra falls are in the boss fight (recover_converter): the
Fungus King and the fungi who spot you now reach you, so the Wererat is rarely fought alone.
Who lands the killing blow, 8 seeds each: the Wererat 30, the escape rats 17, the Fungus King
11, the other fungi 10.

## Open: the boss fight

The levers that would bring the falls back down are not sewer-only:

- the Wererat's damage (12) is the anchor the Act 2 bosses are ruled against ("14, two above
  the Were-Rat"), and the Returning Boss copies it;
- the Fungus King's numbers are copied by the Carnival lion.

Sewer-only options: move the Fungus King's post out of the boss room (he stands at 15,10, two
tiles from the Wererat), or leave the boss fight harder now that it is a real fight. The sim
baseline is re-recorded once that is settled.
