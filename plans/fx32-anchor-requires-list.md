# fx32: a grapple anchor can ask for a list of items

## Goal
A grapple anchor's `requires` may be one item id (as every anchor is today) or a
list of ids, and a list means "carry all of them", the same rule the bank's vault door
already uses for transitions (`carriesAll` in `game/map.js`). Today
`_interactGrapple` in `game/main.js` compares `anchor.requires` to a single id, so a
list would never match and the anchor could never be used.

## Acceptance
- An anchor whose `requires` is a list swings you only when the bag holds every id in
  it; with some missing it is sheer rock (its `requiresMsg`, no swing, no turn).
- A single id behaves exactly as before; no `requires` stays open.
- Nothing changes in play: no shipped anchor uses a list, so the autoplay golden must
  not move.
- `npm test`, `balance:check`, the naming grep, the limezu check and `autoplay:check`
  all pass.

## How
The rule is applied inside `_interactGrapple` itself (same semantics as
`carriesAll`: a list needs all, an empty list is open). `tests/grapple.test.js` lifts
that method out of the source with only `audio` in scope, so reaching for the imported
helper would break it, and that file is outside this slice.

The new `tests/anchor-requires-list.test.js` goes through the path a player uses: a
real arrow-key press, into the real `_beginMoveOrTurn`, `_doMove`, `getAnchor` and
`_interactGrapple`, on the real Canyon map, with its exit anchor's `requires` turned
into a list.

## Rulings
None.

## Out of scope
Giving any real anchor a list, any copy, any map change, and unifying the two gate
helpers.
