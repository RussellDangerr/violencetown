# AP1 — the Carnival gets its own ground

## Goal

The Carnival's ground (`CIRCUS_GROUND`, tile 30) draws the same Tiny Town cell as Town's road,
so across most of the Carnival you are walking on what looks like a street, and where the two
zones meet you can't see the edge. Give the Carnival a ground no other tile draws: stone pavers
on grass, Tiny Town cell (7,3), which reads as a fairground path.

Tents draw carnival ground beneath them (`under: 30`), so they follow with no change of their own.

Sawdust (`SAWDUST`, tile 33) was a plain orange square, the same colour as the old ground, so it
never showed. On the pavers it stands out as a hard orange box. Each 2x2 patch of sawdust becomes
one rounded dirt patch with a grass rim instead.

## Acceptance

- The Carnival's ground no longer matches the road.
- The shared-cell test in `tests/zone-identity.test.js` has no open exception left: the
  `tinyTown(1,2)` entry is gone from `KNOWN_SHARED_CELLS`, and the staleness check passes.
- A screenshot at 3440x1440 of the Carnival where its ground meets a road.
- Each sawdust patch draws as one rounded dirt patch, and a test pins that every patch on the
  map is a whole 2x2 starting on an even tile, which the 2x2 picture needs.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

## How

- `game/sprites.js`: `ZONE_TILE_SPRITE_MAP[30]` points at `tinyTown` (7,3).
- `tests/zone-identity.test.js`: drop the `tinyTown(1,2)` exception.
- `tests/tile-render.test.js`: the tent-cell test spelled the ground cell out as (1,2); it now
  reads the cell from the sprite map, so it checks the layering and not which picture was chosen.
- `game/sprites.js`: `ZONE_TILE_SPRITE_MAP[33]` becomes a quad of Tiny Town's grass-rimmed dirt
  corners (0,1), (2,1), (0,3), (2,3); `tileFrame` picks the corner by tile parity, as for the tents.

## Rulings it rests on

- The Carnival gets a ground of its own (ruled 2026-10-03).
- Which ground: option a, stone pavers on grass (Tiny Town 7,3).
- Sawdust on the new ground: a rounded dirt patch (picked 2026-10-27, after seeing it in the build).

## Out of scope

- `CONFETTI`, which now blends into the grassy pavers.
- Edge or transition tiles between the Carnival's ground and the road.
- The Graveyard's borrowed fence, the other entry in the shared-cell list.
