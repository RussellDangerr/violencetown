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
