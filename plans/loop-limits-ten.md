# The board loop's limits go to 10

Caelan, 2026-10-25: "All limits should be like, 10 cards." The loop sat idle with two slices in
review because the cap was 2, while approved, unblocked slices waited behind it.

## What changes

| Limit | Was | Now |
|---|---|---|
| Slices in `doing` + `review` before the loop stops building (the WIP cap) | 2 | 10 |
| Slices built in one pass | 1 | up to 10, none sharing a file |
| Merges per pass (each still needs his Merge it) | 1 | 10 |
| Tweaks per pass | 2 | 10 |
| Rulings and slices one tweak may create | 3 + 3 (his LP3 pick removed it) | 10 + 10 |
| Your turn size that pauses new tweaks | 7 (his LP3 pick removed it) | 10 |

Building several slices in one pass keeps the repo's rule of parallelizing only file-disjoint
work: `nextSlices()` hands out picks whose `touches` share no file with each other or with any
slice still in `doing` or `review`. Each pick gets its own builder in its own worktree.

**2026-10-29:** the WIP cap is now per lane: `doing` and `review` hold 10 slices each
(`DOING_CAP`, `REVIEW_CAP`). One full pass used to fill the shared cap with Review alone, and
the loop then built nothing until he merged. A slice that fails 2 builds is skipped until he
replies (`MAX_FAILS`).

## Unchanged

The limits that are not card counts: at most 5 "Needs your eye" items, 2 fix attempts on red
tests, a 6-line update. Merging still waits for his Merge it, one at a time with every gate run
on each merged tree.

## Acceptance

- `WIP_CAP` is 10, and the board page's banner reads "of 10".
- `nextSlices(cards)` returns up to 10 picks, file-disjoint, within the cap; `nextSlice()` still
  returns the first of them with the same skip reasons.
- `next-slice.mjs` prints the picks.
- LOOP.md and the board-loop skill state the new limits.
- `npm test` passes, with tests for the cap and for file-disjoint picks.
