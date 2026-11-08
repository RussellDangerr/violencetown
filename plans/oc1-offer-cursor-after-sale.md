# OC1: after a sale, the trade cursor stays on a real row

## Goal
Sell the last item in your bag column with the cursor on it and the cursor used to sit one past the
new end: nothing selected, Space did nothing. Now the cursor clamps into the shrunken list, so it
rests on the new last row and Space stages it.

## Acceptance
- Cursor on row 5 of 6, sell it: cursor index 4, Space stages that row.
- The cursor is clamped on both columns after any committed trade (same clamp as the column switch).
- A test drives the real keys with real Macc: five ArrowDown, Space, Enter, then Space stages.
- npm test, balance:check, naming grep, autoplay:check pass.

## Rests on
No rulings: a defect fix approved by the loop under the standing delegation (LOOP.md section 11).

## Change
`_commitOffer` in game/main.js clamps `_offerCursor.index` into its side's list after the lists
shrink. The scroll was already re-clamped there, which keeps the last row in view. Done inline
rather than by a shared method because many existing tests lift `_commitOffer` onto small stubs.

## Out of scope
No words, layout or sounds change. The column-switch code is untouched.
