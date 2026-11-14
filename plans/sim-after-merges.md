# The 50-seed sim runs after merges, in the loop

Caelan, 2026-11-11: "yes, add it to the loop".

## Why

`npm run autoplay:check` replays one seed through three scripts. `npm run sim:check`
(plans/sim1-autoplay-many-seeds.md) plays the same scripts over seeds 1–50 and flags any number
that moved past its noise. Nothing ran the sim: it is not in `npm test`, the loop's gates, a git
hook or CI. On 2026-11-11 it failed on dev 55bbccf (the sneak's sewer casts 21.78 → 21, MP
197.80 → 190) after two accepted goldens (PS1, WK2) that never re-ran it, and nobody had noticed.
The same day, 4 of the fighter's 50 seeds ended differently while seed 1 showed "no drift".

## What changes

1. **The loop runs the sim on dev's tip** (LOOP.md §13), in the background, whenever dev's tip is
   not the sha the last sim ran on and no sim is running. That covers every merge the loop
   makes and any merge he makes by hand. It is one run at a time: merges that land during a run
   are covered by the next one.
2. **A clean run** is one line in the update. **A moved run** becomes one ruling on his turn:
   intended (re-record the baseline) or a bug (a defect card). **Broken runs** (console errors,
   a timeout) run again once; still broken, they become a defect idea.
3. **Re-recording the baseline** goes through Review like an accepted autoplay golden: the loop
   runs `sim:write` on its own branch, in a commit that cites the ruling, and he presses Merge it.
4. **The guard treats `tools/autoplay-sim-baseline.json` as a golden**, so it moves only in a
   commit that says "accept" and names a ruling. A slice-builder never runs `sim:write`.

## Acceptance

- LOOP.md §13 says when the sim runs, how, and what each outcome does; §1, §4 and §8 point to it.
- The board-loop skill's running order has the step, and `meta/sim` holds its state.
- `isGolden('tools/autoplay-sim-baseline.json')` is true; a branch that changes it without a
  commit citing an accept ruling fails the guard (tests/loop-guard.test.js).

## Load

The sim uses 8 Chromes for about 11 minutes. On 2026-11-11 three `autoplay:check` runs ran beside
a full sim with no timeouts on either side, so builders do not wait for it.

## Out of scope

- An autoplay script that plays Act 2 (its own slice once picked).
- Fixing today's stale baseline: the first run will raise it as a ruling.
