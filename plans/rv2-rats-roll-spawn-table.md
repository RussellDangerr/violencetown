# RV2 — the Carnival's rats roll from the zone's spawn table

**Parent:** `plans/spine.md` §2 SL-6 (mob slots hold mooks, rolled per spawn from the zone's
spawn table), `plans/slot-registry.md` (the registry), `plans/rv1-carnival-rats.md` (the three
rats, placed by hand).

## Goal

The three Carnival rat spawns stop being fixed. The Carnival gets a spawn table, a mob slot
`carnival.mob` pooling exactly RV1's three rats (Birthday, Sludge, Robot) at equal weights. Each
rat spawn on the map names a seat, and a new game rolls one rat for each seat from the game's
seed. Rolls are independent, so a crowd may repeat a rat.

## The shape

- `slots.js`: a mob slot may carry `seats`, how many spawns roll from it. `pickSlots` rolls one
  entry per seat on the slot's own seeded stream (the existing per-slot stream, so no anchor pick
  and no combat roll moves). `deckFor` accepts a saved roll only when it has `seats` entries all
  from the pool; otherwise it falls back to the pool's own order, which is RV1's hand-placed
  crowd.
- `carnival-map.json`: the three rat spawns become `{ id, slot: "carnival.mob", seat, x, y }`
  with the same ids and tiles.
- Saves: the rolls live in the existing `slots` save field under `carnival.mob`. Zone changes
  re-resolve spawns from `game.slots`, so the rats are the same each time. An old save has no
  `carnival.mob` entry and loads RV1's crowd unchanged. `main.js` already keeps the seed's picks,
  so it needs no change.
- `content-validate.js`: a spawn in a rolled slot needs a valid seat, and the map must seat
  exactly `seats` spawns.
- `balance-harness.mjs`: unchanged by design; it resolves spawns with the default (pool order)
  picks, so the same three rats are linted where they stand.

## Acceptance

- Each rat spawn rolls one rat from the table per new game, from the seed.
- Walking out and back in, or saving and loading, keeps the same rats.
- Two seeds give different crowds; the same seed always gives the same one.
- The autoplay stage scores do not move.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

## Out of scope

Weights other than equal; new rats or numbers; other zones' tables; respawn clocks; any copy.
Goldens are never written by this slice.
