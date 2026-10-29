# The board loop — a skill that works the board one card at a time

**Date:** 2026-10-21
**Status:** BUILDING on `feature/board-loop`
**Why (Caelan, 2026-10-21):** the board works; next is a loop that picks cards up and finishes
them one by one while he decides things as he goes. He asked for research from several
game-dev viewpoints first.

## 1. What the research said

Four researchers, each in a different role, read `LOOP.md`, `plans/ticket-board.md` and
`CLAUDE.md` and wrote notes outside the repo:
- **Producer:** pace and flow.
- **QA / release:** what a run must prove.
- **Tools engineer:** how Claude Code loops, skills and subagents work.
- **Creative director:** what stays his call.

Where they agreed:
- **A skill runs one pass; a fresh helper builds each slice.** The `/loop` session reads the
  board, clears Claude's turn and writes the cards. A `slice-builder` subagent builds each slice
  in its own worktree, so a long build never fills the loop's context and never touches his
  checkout.
- **Self-paced, not a timer.** `/loop /board-loop` with no interval. Each pass picks its own wait:
  a minute after real work, an hour when idle. A fixed five-minute timer would read the board
  288 times a day for nothing.
- **Order of Claude's turn, fastest unblocking first:**
  1. Merge it
  2. Changes
  3. replies to his feedback
  4. Tweak it
  5. rulings with no options
  6. building
- **Anything a player would notice is his** (names, copy, tuning numbers, art, structure).
  Engineering a player never sees is the loop's. A placeholder is always obviously fake: `[TEXT]`,
  a tinted square, a number left as today's.
- **A Review card says, in his words, what he can now see.** It carries screenshots or a GIF
  for anything visible, a "needs your eye" list of at most five, pass/fail for the gates, and
  what was not done.
- **Prove, don't claim.** The gates are judged by exit code. A guard script checks the branch
  name, that every changed file is in the card's `touches` (forbidden paths never are), that
  the spec is the first commit, and that no test was removed or switched off.

Corrected on the way: QA thought an uncaught per-frame error could slip past
`autoplay:check`. It cannot. `game/autoplay/boot.js:33` collects every uncaught page error,
and `run.js:76` fails the run on any of them.

## 2. Policy that is his call: ruling cards on the board

Five loop policies went to the board as ruling cards (LP1–LP5), each with a recommended pick.

- **Until he answers, the loop uses the recommended pick for LP2–LP5.** LP4 and LP5 change
  nothing until picked.
- **LP1 changes nothing until he says yes.** It would add permission deny rules to
  `.claude/settings.json`, which is his to change.

| Card | Question | Recommended |
|---|---|---|
| LP1 | Lock dangerous git commands at the permission level? | yes, but `dev` stays pushable for Merge it |
| LP2 | One loop, or a fast reply loop plus a build loop? | one, to start |
| LP3 | Cap what one Tweak creates? | at most 3 rulings + 3 slices; no new tweaks while 7+ things wait on him |
| LP4 | Old untouched ideas? | leave them; each update names the 3 oldest |
| LP5 | A daily digest? | no; each pass posts a ≤6-line update in its own session |

## 3. The pieces

- **`.claude/skills/board-loop/SKILL.md`:** one pass. A project skill, model-invocable so
  `/loop` can fire it.
- **`.claude/agents/slice-builder.md`:** builds one slice in an isolated worktree. It branches
  from `origin/dev` itself, since worktree isolation forks from the default branch. It returns
  a fixed-shape report.
- **`tools/roadmap-board/loop-guard.mjs`:** the self-checks, tested in `tests/loop-guard.test.js`.
- **`tools/roadmap-board/LOOP.md`:** the rulebook both of them follow.

**Merge it** happens in a throwaway detached worktree of `origin/dev`. It is merged there with
`--no-ff`, gated, then pushed to `dev`. His own checkout is never touched; he pulls when he
likes.

## 4. Out of scope

- A second, faster reply loop (LP2 b).
- The daily digest (LP5 b).
- Aging out old ideas (LP4 b).
- Desktop scheduled tasks, which give a fresh session per run with an hourly minimum.
- Pixel-diff checks of screenshots against `dev`. Screenshots are evidence for him, not a
  gate yet.
