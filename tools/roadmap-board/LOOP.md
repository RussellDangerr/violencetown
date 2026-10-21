# The build loop — one slice per run

This is what a `/loop` run does. Point the loop at this file, e.g.
`/loop follow tools/roadmap-board/LOOP.md`. The design is `plans/ticket-board.md`.

**The board:** https://claude.ai/code/artifact/267dc977-cb87-453f-9ba8-ce6479a79ce7. Collection
`cards`, one document per card.

## Each run

0. **Clear Claude's turn first** (the board's second strip, `claudesTurn()` in `board-model.js`).
   His gestures come before new building:
   - **Feedback with no reply:** answer on the card. Append `{from: "claude", text, at}` to its
     `feedback`. Add `ask: true` when the reply is a question back to him.
   - **An idea marked Tweak it:**
     1. Recon it.
     2. Write `ruling` cards with 2–4 `options` and a `recommended` one.
     3. Write `slice` cards with `touches`, `acceptance` and `blockedBy`.
     4. Move the idea to `done` with a note naming what it became.
   - **A ruling with no options:** write its options.
   - **A Ready slice with no acceptance:** tweak it.
   - **Merge it on a review card:** merge exactly as `CLAUDE.md` says (`--no-ff --no-commit`, all
     gates, the game runs, then commit and push `dev`). Move the card to `done`. Clicking it is
     his merge call.
   - **Changes on a review card:** make the change on the same branch, then put the card back in
     `review` with `verdict` cleared.

   Then carry on to step 1. A run that cleared Claude's turn may still build one slice.
1. **Read the board.** Run `ArtifactData list` on `cards` with `out_dir` set to a **fresh**
   scratchpad directory, plus `query.limit: 1000`. Note the `version` of every card from the
   listing; writes are pinned to it.
2. **Ask what's next.** Run `node tools/roadmap-board/next-slice.mjs <that dir>`.
   - `wip-cap`: two branches are waiting on Caelan's merge. Do nothing else and end the run.
   - `nothing-pickable`: report the `skipped` reasons in one short list and end the run.
   - `ok`: carry on with `pick`. A slice is only ever picked once he has pressed Approve on it.
3. **Recon first.** Check `git fetch`, `git branch --no-merged dev`, and `git log -S` for the
   slice's key names. If the slice already shipped or overlaps an unmerged branch, write that
   in the card's `note`, move the card to `someday`, and end the run.
4. **Claim it.** Use a pinned `update` on the card:
   `{lane: "doing", claim: {by: "loop", at: <now>}, branch: "feature/<slug>"}`.
5. **Branch from `dev`, explicitly:** `git fetch origin && git checkout -b feature/<slug> origin/dev`.
   Worktree isolation forks from the default branch, which is not `dev`.
6. **Spec first.** The first commit is a short `plans/<slug>.md`: the slice's goal, its
   acceptance checks, the rulings it rests on (with the picks from the board), and what is out
   of scope. Never copy unrelated board content into the repo; it is public.
7. **Build.** Stay inside the slice's `touches`. If the work needs a file outside them, or a
   judgment call the rulings don't settle, **stop**:
   - create a `ruling` card (lane `ruling`, 2–4 `options`, a `recommended` one);
   - add its id to the slice's `blockedBy`;
   - move the slice back to `ready` and drop its `claim`;
   - commit what is safe, push the branch, and end the run.

   **Never guess.**
8. **Gates, all of them, gated on exit codes:**
   - `npm test`
   - `npm run -s balance:check`
   - the naming grep from `CLAUDE.md`
   - `npm run autoplay:check`
   - `git ls-files | grep -i limezu` must print nothing

   For anything the player can see, load the game too (see the repo's verify notes): a green
   suite is not a running game.
9. **Push the branch, never merge.** Merging to `dev` is always Caelan's call.
10. **Hand it over.** Use a pinned `update` on the card:
    `{lane: "review", summary: "<what changed, test counts, anything he should look at>"}`.
    Keep `branch`. Then end the run. **One slice per run.**

## Never

- Merge, push to `dev` or `main`, tag, or release.
- Write idea, ruling or card content into a committed file.
- Answer a ruling. Those are Caelan's, on the board.
- Delete a card. Move it to `someday` with a note instead.
- Touch `tiled/` (his, untracked) or anything in his Obsidian vault.

## If a run stalls

- **A write waits for approval:** the session's permission mode is too strict for unattended
  writes. The 2026-10-20 check passed in auto mode.
- **The PC slept:** keep-awake is per session.
- **The board shows a card in `doing` with no live run:** a run died mid-slice. Its `branch`
  says where the work is. Move the card back to `ready` and drop the `claim` before the next
  run.
