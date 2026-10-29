---
name: board-loop
description: One pass of Violencetown's ticket-board loop. Reads the board, clears Claude's turn (Merge it, Changes, replies, Tweak it), builds up to 10 approved slices through the slice-builder agent, writes the cards back, posts a short update and schedules the next pass. Use when the /loop fires, or when Caelan says to run the board loop or work the board.
---

# Board loop: one pass

The rules live in `tools/roadmap-board/LOOP.md`. **Read it in full at the start of every pass.**
This file is only the running order. If the two ever disagree, LOOP.md wins.

The board's word for turning an idea into rulings and slices is **tweak**. Use no other.

## Running order

1. **Read the board**, per LOOP.md §1 step 1. Use a fresh folder:
   `<scratchpad>/board-loop/<yyyy-mm-dd-hhmm>/`.
2. **Recover stale `doing` cards** (§1 step 2).
3. **Clear Claude's turn** in the §1 step 3 order. Merges follow §4, tweaks §5, ruling options
   §6. At most 10 merges, 10 Changes builders and 10 tweaks.
4. **Ask what's next:** `node tools/roadmap-board/next-slice.mjs <folder>`. Besides the picks it
   prints `openRulings` (§5's pause) and `idleWait` (§7's wait).
5. **Build the picks** (up to 10, none sharing a file):
   1. Recon every pick (§1 step 5). A hit drops that pick only; carry on with the rest.
   2. Claim every pick that's left (§1 step 6).
   3. Spawn every pick's `slice-builder` in one message, plus every scout and checker that's due
      (§10, §12).
      Each builder gets the card JSON, the picks of the rulings it rests on, `slug` and
      `touches`.
   4. Write each report back to its card (§1 step 7). FAILED or no report adds 1 to `fails`
      (§3). Board writes stay here, never in the builder.
6. **Scouts** (§10): for each of `scout-defects` and `scout-threads` that is due, not running and
   not held back, spawn it in the background (with the builders when there are any). Give it its
   `meta/<name>` (`lastSha`, `leads`), the current dev sha, the pass's card folder, the next area
   or system in its rotation, Caelan's checkout path and a scratchpad log folder. Set
   `meta/<name>.runningSince` at spawn. When it reports, land its proposals as Ideas cards in one
   batch with `newScoutIdea()`, and pass its hand-off lines to the other scout's `leads` (the
   thread scout's `LEADS KEPT` go back to its own). Keep `TOOLING` lines for the update, then set
   `meta/<name>` to `{lastSha, lastAt, area}`.
   - If the session started before a scout's file existed, its type won't spawn: spawn
     `general-purpose` with worktree isolation and point it at `.claude/agents/<name>.md`.
   **Checks** (§12): for up to 3 Review slices due a check (no `checked`, or its `sha` or
   `devSha` is stale), spawn `slice-checker` in the background with the card JSON, the branch sha
   and Caelan's checkout path. When it reports, append its result to the card's `feedback`
   (`ask: true` only on a failed guard or gate, or a conflict) and set `checked: {sha, devSha, at}`.
7. **Post the update** (§7): six lines at most, in plain words, no card codes without their
   title.
8. **Schedule the next pass** with ScheduleWakeup, prompt `/board-loop`:
   - **60 s** after a pass that changed anything on the board;
   - otherwise `idleWait` (300, 1200 or 3600 s), with `noop: true`;
   - **600 s** when the board couldn't be read;
   - **`stop: true`** only when he asks, or after 3 passes in a row that couldn't read the
     board (§7).

## Standing policy (his picks on LP1–LP6)

| Card | His pick |
|---|---|
| LP2 | one loop |
| LP3 | caps of 10, settled by his "limits of 10" (`plans/loop-limits-ten.md`): 10 rulings + 10 slices per tweak; Doing and Review hold 10 slices each; no tweaks of the loop's own while 10 or more rulings are open |
| LP4 | ideas stay put; the update names the 3 oldest |
| LP5 | per-pass update, no digest |
| LP1 | permission settings are his; the loop never changes them |
| LP6 | standing delegation (LOOP.md §11): approve, pick and tweak what the loop is confident about |

If he changes a pick on the board, the board wins.

## Hard stops

- Never merge without his Merge it.
- Never push `main`, tag, or force-push.
- Never answer a ruling or press his buttons, except as LOOP.md §11 (the standing delegation)
  allows. Never press Merge it.
- Never put board content in a committed file.
- Never work in his checkout.

If any step would need one of those, stop that step and say so in the update.
