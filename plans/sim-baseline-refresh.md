# Sim baseline refresh

**Status: picked 2026-11-11. Built on this branch.**

## Why

On 2026-11-11 `npm run sim:check` on dev (55bbccf) exits 1. The sneak moved against
`tools/autoplay-sim-baseline.json`, which SIM1 recorded in f15d3b0:

| sneak metric                    | baseline | dev 55bbccf |
|---------------------------------|---------:|------------:|
| `recover_converter.casts`       |    21.78 |          21 |
| `recover_converter.mpSpent`     |   197.80 |         190 |

Since SIM1 the seed-1 golden (`tools/autoplay-golden.json`) was re-accepted twice, at PS1
(e9576c0) and WK2 (8db1987), without running the sim. The sim baseline went stale behind it.

## What this branch does

1. Finds the dev merge that moved the sneak: `node tools/autoplay-sim.mjs --check --scripts=sneak`
   at each dev merge between f15d3b0 and dev's tip, in detached worktrees, until the first move.
2. Caelan rules whether that move is what the slice set out to change.
3. On his yes, `npm run sim:write` re-records the baseline in a commit that cites the ruling.
4. Writes the routine into CLAUDE.md's Tests section: after merging a batch to dev, run
   `npm run sim:check` once. A MOVED line is either an intended change, re-recorded with
   `sim:write` in a commit that cites it, or a bug.

## Done

The branch is pushed, `npm run sim:check` exits 0 on it, and the merge that caused the move is
named. Gates: `node --test`, `npm run balance:check`, `npm run autoplay:check`, the naming grep.
