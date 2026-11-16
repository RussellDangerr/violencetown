---
name: board-loop
description: One pass of Violencetown's ticket-board loop. Reads the board, clears Claude's turn (Merge it, Changes, replies, Tweak it), builds up to 10 approved slices through the slice-builder agent, writes the cards back, posts a short update and schedules the next pass. Use when the /loop fires, or when Caelan says to run the board loop or work the board.
---

# Board loop: one pass

The rules live in `tools/roadmap-board/LOOP.md`. **Read it in full at the start of every pass.**
This file is only the running order. If the two ever disagree, LOOP.md wins.

The board's word for turning an idea into rulings and slices is **tweak**. Use no other.

## Where the board lives (this one section wins over LOOP.md)

Caelan's projects share one board since 2026-10-30. Its address is in `.claude/board.local.md`,
which git ignores because this repo is public; if that file is missing, stop and ask him for it.
Project id `vt`. Wherever LOOP.md or this file names a board path, use the project's own:

| They say | Use |
|---|---|
| collection `cards` | `boards/vt/cards` |
| `meta/<name>` | collection `boards/vt/meta`, document `<name>` |
| collection `archive` | `boards/vt/archive` |

A read with `out_dir` lands in `<folder>/boards/vt/cards/`: that is the folder to hand
`next-slice.mjs`. Cards archived before the move are in collection `boards/vt/archive-2026-10-30`,
documents `part-N`, each holding a `cards` array: copy one back to `boards/vt/cards` when a new card
needs it. Write new archived cards to `boards/vt/archive` as usual. Never use the old board's address.

A card may also hold `notes`: words he saved for Claude while its decision waits (`[{text, at}]`). The page moves them into `feedback` or `pick.note` when he decides. If this loop ever decides that card for him, read them first and move them the same way. Otherwise leave them alone; they put nothing on Claude's turn.

## Report what's running

Collection `boards/vt/agents`, written in the same batch as the card writes where you can. Times are
epoch ms. Read it at the start of a pass for the versions, and delete finished rows over a day old.

- **Document `loop`** (`role: "loop"`). Pass start: `state: "working"`, `startedAt`, `updatedAt`,
  `note`. Pass end: `state: "idle"`, `updatedAt`, `nextAt` (when the next pass wakes), `note` (the
  update's first line). When the loop stops: `state: "stopped"`.
- **One document per agent you spawn**, id `<role>-<card or mode>-<epoch>`. At spawn: `role` (agent
  name), `card` (if it has one), `state: "working"`, `startedAt`, `updatedAt`. At its report:
  `state: "done"` or `"failed"`, `endedAt`, `updatedAt`, `note` (one line). A worker that died
  without reporting: `"failed"`.

Status goes in these rows only, never on a card, and a failed status write never stops the pass.

## Running order

1. **Read the board**, per LOOP.md §1 step 1. Use a fresh folder:
   `<scratchpad>/board-loop/<yyyy-mm-dd-hhmm>/`.
2. **Recover stale `doing` cards** (§1 step 2). Then **archive finished cards** (his 2026-10-30
   ruling, the one exception to LOOP.md §8's no-delete):
   - A `done` card with no `doneAt` gets `doneAt: <now>`, pinned.
   - A `done` card whose `doneAt` is over 7 days old moves to the `archive` collection, unless an
     open card names it in `blockedBy` or it sits in Your turn or Claude's turn. Add a scout card's
     `scoutKey` and title to `meta/archived-scouts` first, `set` the copy with `archivedAt`, read it
     back, then delete it from `cards`, pinned.
   - A new card that rests on an archived ruling: move that ruling back to `cards` first. A blocker
     missing from `cards` blocks forever.
3. **Clear Claude's turn** in the §1 step 3 order. Merges follow §4, tweaks §5, ruling options
   §6. At most 10 merges, 10 Changes builders and 10 tweaks.
4. **Ask what's next:** `node tools/roadmap-board/next-slice.mjs <folder>`. Besides the picks it
   prints `openRulings` (§5's pause) and `idleWait` (§7's wait).
5. **Build the picks** (up to 10; only the shared files in LOOP.md §1 step 4 may hold several):
   1. Recon every pick (§1 step 5). A hit drops that pick only; carry on with the rest.
   2. Claim every pick that's left (§1 step 6).
   3. Spawn every pick's `slice-builder` in one message, plus every scout and checker that's due
      (§10, §12).
      Each builder gets the card JSON, the picks of the rulings it rests on, `slug` and
      `touches`.
   4. Write each report back to its card (§1 step 7). FAILED or no report adds 1 to `fails`
      (§3). Board writes stay here, never in the builder.
6. **Scouts** (§10), spawned in the same message as the builders. **Hold both back** while his
   turn holds 10+ items or 5+ scout cards sit untriaged. Otherwise spawn each of `scout-defects`
   (`mode: diff` after a merge, `full` at most hourly) and `scout-threads` (at most every 2 h)
   that is due and not running; a scout that plays the game waits while 4+ builders run. Give it
   its mode, `meta/<name>` (`lastSha`, `leads`), the current dev sha, the pass's card folder, the
   next area or system in its rotation, Caelan's checkout path and a scratchpad log folder. Set
   `meta/<name>.runningSince` at spawn. When it reports, drop any proposal whose key or title is in
   `meta/archived-scouts`, then land the rest as Ideas cards in one
   batch with `newScoutIdea()`, and pass its hand-off lines to the other scout's `leads` (a thread
   lead marked "kept for" goes back to its own). Keep `TOOLING` lines for the update, then set
   `meta/<name>` to `{lastSha, lastAt, area}` (plus `lastFullAt` after a full run).
   - If the session started before a scout's file existed, its type won't spawn: spawn
     `general-purpose` with worktree isolation and point it at `.claude/agents/<name>.md`.
   **Checks** (§12): for up to 3 Review slices with no `checked` or a stale `checked.sha`, spawn
   `slice-checker` (it runs no game or tests) with the card JSON, the branch sha and the dev sha.
   When it reports, grep each TEST quote at its `file:line` on the branch; a quote that isn't
   there becomes NOT SHOWN, and the update says so. Then append the result to `feedback`
   (`ask: true` only on a failed guard or a conflict) and set `checked: {sha, devSha, at}`. When
   only `checked.devSha` is stale, run `git merge-tree --write-tree origin/dev origin/<branch>`
   yourself and post only if the answer changed.
   **The sim** (§13): when dev's tip is not `meta/sim.lastSha` and `meta/sim.runningSince` is
   empty, start `npm run -s sim:check` in the background in a detached worktree at dev's tip,
   and set `meta/sim` `{sha, runningSince}`. When it exits, write the outcome as §13 says, set
   `meta/sim` to `{lastSha, lastAt, result}`, and remove the worktree. A sim still running keeps
   the pass from counting as idle.
7. **Post the update** (§7): six lines at most, in plain words, no card codes without their
   title.
8. **Schedule the next pass** with ScheduleWakeup, prompt `/board-loop`:
   - **60 s** after a pass that changed anything on the board;
   - otherwise `idleWait` (300, 1200 or 3600 s), with `noop: true`;
   - **600 s** when the board couldn't be read;
   - **`stop: true`** when he asks, after 3 passes in a row that couldn't read the board (§7), or
     at one of the two limits below.

## When the loop stops by itself (his ruling, 2026-11-09)

Two limits, kept on the `loop` row in `boards/vt/agents` so they survive between passes:

- **`sessionStartedAt`**: set at the first pass after a `/loop /board-loop` start (the row says
  `stopped`, or the field is missing). Leave it alone on every later pass.
- **`idleStreak`**: how many passes in a row were idle. A pass is idle when it changed nothing on
  the board, started no agent, ran no merge, and had nothing still in flight (no builder, checker,
  scout or test run waiting to report). Any other pass sets it back to 0.

1. **15 hours.** At pass start, if `now - sessionStartedAt` is 15 hours or more, start nothing new:
   no build, scout, check, tweak or merge. Finish what is already in flight (write its result to the
   card, unlink its worktree), then stop. The last update names everything left open, his Merge it
   presses included, so the next session starts there.
2. **5 idle passes.** When a pass ends idle and `idleStreak` reaches 5, stop.

To stop: set the row to `state: "stopped"`, `stoppedBy` (`"15h"`, `"idle"`, `"asked"` or
`"board"`), `updatedAt`, `note`; drop `nextAt`, `sessionStartedAt` and `idleStreak`; call
ScheduleWakeup with `stop: true`; and post one line saying why it stopped and that
`/loop /board-loop` starts it again. Passes waiting on work in flight are not idle, however quiet,
and a pass does not count as idle just because it chose `noop: true`.

## Standing policy (his picks on LP1–LP6)

| Card | His pick |
|---|---|
| LP2 | one loop |
| LP3 | caps of 10, settled by his "limits of 10" (`plans/loop-limits-ten.md`): 10 rulings + 10 slices per tweak; Doing and Review hold 10 slices each; no tweaks of the loop's own while 10 or more rulings are open |
| LP4 | ideas stay put; the update names the 3 oldest |
| LP5 | per-pass update, no digest |
| LP1 | permission settings are his; the loop never changes them |
| LP6 | standing delegation (LOOP.md §11): approve, pick and tweak what the loop is confident about |
| Session length | stops itself after 15 hours, or after 5 idle passes in a row |

If he changes a pick on the board, the board wins.

## Hard stops

- Never merge without his Merge it.
- Never push `main`, tag, or force-push.
- Never answer a ruling or press his buttons, except as LOOP.md §11 (the standing delegation)
  allows. Never press Merge it.
- Never put board content in a committed file.
- Never work in his checkout.

If any step would need one of those, stop that step and say so in the update.
