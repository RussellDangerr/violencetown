# AP1 — the Carnival gets its own ground

## Goal

The Carnival's ground (`CIRCUS_GROUND`, tile 30) draws the same Tiny Town cell as Town's road,
so across most of the Carnival you are walking on what looks like a street, and where the two
zones meet you can't see the edge. Give the Carnival a ground no other tile draws: stone pavers
on grass, Tiny Town cell (7,3), which reads as a fairground path.

Tents draw carnival ground beneath them (`under: 30`), so they follow with no change of their own.

## Acceptance

- The Carnival's ground no longer matches the road.
- The shared-cell test in `tests/zone-identity.test.js` has no open exception left: the
  `tinyTown(1,2)` entry is gone from `KNOWN_SHARED_CELLS`, and the staleness check passes.
- A screenshot at 3440x1440 of the Carnival where its ground meets a road.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

## How

- `game/sprites.js`: `ZONE_TILE_SPRITE_MAP[30]` points at `tinyTown` (7,3).
- `tests/zone-identity.test.js`: drop the `tinyTown(1,2)` exception.
- `tests/tile-render.test.js`: the tent-cell test spelled the ground cell out as (1,2); it now
  reads the cell from the sprite map, so it checks the layering and not which picture was chosen.

## Rulings it rests on

- The Carnival gets a ground of its own (ruled 2026-10-03).
- Which ground: option a, stone pavers on grass (Tiny Town 7,3).

## Out of scope

- `SAWDUST` and `CONFETTI`, the Carnival's other two grounds.
- Edge or transition tiles between the Carnival's ground and the road.
- The Graveyard's borrowed fence, the other entry in the shared-cell list.
