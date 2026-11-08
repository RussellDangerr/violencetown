# The loop builds several main.js slices at once

Caelan, 2026-11-08: the loop builds one to three slices, then stops and waits for his Merge it,
though Ready holds a week of approved work. He keeps the merge; he wants more built between
merges.

## Why it stops

`nextSlices()` never hands out a slice whose `touches` share a file with a slice still in
`doing` or `review`. Almost every Ready slice touches `game/main.js` (47 of 47 unblocked on
2026-11-08), so one main.js slice in Review blocks all the rest. The WIP cap (10) and picks per
pass (10) never bind.

## What changes

1. **Shared files.** A few big files may hold more than one slice in flight at once:
   `game/main.js` up to 5, `game/renderer.js` up to 3. Every other file keeps the old rule (one
   slice at a time). The numbers live in `SHARED_FILES` in `board-model.js`.
   `nextSlices(cards, { shared })` takes the map as a parameter, empty by default, so the board
   page and every existing caller keep the strict rule; `next-slice.mjs` passes `SHARED_FILES`
   (and `--strict` turns it off).
2. **A stack check before Review.** Git merges edits to different parts of one file cleanly; two
   slices that edit the same lines don't. `stack-check.mjs <base> <branch>...` merges the
   branches onto the base in order, in memory (`git merge-tree` plus throwaway commits, no
   worktree, nothing pushed), and names the first one that conflicts and its files. The loop
   runs it with dev plus every Review branch plus the new one before moving a slice to Review.
3. **When one conflicts.** The new slice does not go to Review. It returns to Ready with a note
   naming the Review branch it clashes with, keeps its branch, and is picked again once that one
   merges: its builder then merges the new dev into the branch, reruns every gate, and sends it
   to Review. Branches already in Review are never touched. The loop itself still never resolves
   a main.js conflict (LOOP.md §4).
4. **Merging a batch.** His Merge it on several cards merges them one at a time, every gate run
   on each merged tree, as now. A card that stops merging cleanly after an earlier one lands
   goes back to its builder to merge the new dev and rerun every gate; it returns to Review.

## Acceptance

- With `SHARED_FILES`, five main.js slices can be in flight together; the sixth waits with
  "touches busy game/main.js (5 of 5)".
- Without the parameter, `nextSlices()` behaves exactly as before (the existing tests pass
  untouched).
- A file not in the map still takes one slice at a time, even beside shared ones.
- `stack-check.mjs` reports clean for branches that edit different files or different parts of
  one file, and names the branch and files for two that edit the same lines; it writes nothing
  to any branch or worktree.
- LOOP.md says all of the above.
- npm test, balance:check, the naming grep and autoplay:check pass.

## Out of scope

The board page, the WIP cap, the merge rule (still his Merge it), and the board-loop skill file
(LOOP.md wins where they differ). Splitting main.js into smaller files is a later refactor.
The Grawlix board's loop has its own copy of this tooling; mirroring it there is separate.
