# SIM1 — the autoplay over many seeds

**Status: picked 2026-11-09 ("Autoplay, many seeds"). Built on this branch.**

## Why

`npm run autoplay:check` (plans/quest1-autoplay.md) plays each scripted player on one seed and
fails on any change. That catches *that* something moved, never *whether it matters*: a seed is
one roll of the dice, so a change that makes the fighter lose 10 more HP on seed 1 might lose 10
fewer on most others. A balance tool has to tell a real shift from luck.

The model is the WoW simulators: a scripted player, a fixed scenario, many seeded runs, and the
average reported with its margin of error. Before and after one change, a number that moved by
more than its noise is a real shift. One that didn't is luck.

## What it does

`node tools/autoplay-sim.mjs` runs the three checked scripts (`quest`, `sneak`, `loops`) on seeds
1..N (default 50), several at once, each through the existing `tools/autoplay.mjs --json`.
`autoplay.mjs` gets one fix: running eight at once on Windows showed it could read Chrome's
`DevToolsActivePort` while Chrome was still writing it (EBUSY) and crash. A locked file now just
means "not ready yet", as a missing one already did.

For each script it reports, over the seeds:

- **finish rate**: the share of seeds that finished;
- **turns, deaths**, and per stage **turns, HP lost, healed, gold, deaths** (whatever numbers the
  stage carries): the mean, the spread, and the 95% margin of error of the mean;
- **broken runs** (a console error, a timeout, a run that returned nothing): listed by seed. A
  broken run is a bug, never a data point.

`--write` saves the result as `tools/autoplay-sim-baseline.json`. `--check` runs again and compares
each number with the baseline. A number **moved** when the two means differ by more than 1.96
times their combined standard error (a 95% test) **and** by at least 2% of the baseline (so a
real but tiny shift doesn't fail a check). It exits 1 when anything moved or any run broke.

## The eval loop

1. `npm run sim:write` on `dev`: the baseline.
2. Change one thing on a branch.
3. `npm run sim:check`: the table of what moved, by how much, with its margin.
4. A shift that was meant: `npm run sim:write` on the branch, and the new baseline merges with it.

## Not in this slice

- More scripts or scenarios than the three the golden already checks.
- An AI player hunting for exploits. Once the baseline exists, an agent's find can be checked
  against it.
- Replacing `autoplay:check`. The single-seed golden stays: it is exact, and catches any change.
  The sim says which changes matter.

## First baseline and the two planted changes (2026-11-09)

The baseline on `dev` at `bf6ff69` (v0.33.0): 150 runs, none broken, about 14 minutes at 12 at a
time on a 28-core laptop.

| Script | Finished | Turns | Deaths |
|---|---|---|---|
| quest (fighter) | 98% (49 of 50) | 108.5 ± 2.7 | 2.22 ± 0.13 |
| sneak | 100% | 178.6 ± 4.3 | 2.72 ± 0.13 |
| loops | 100% | 84.2 ± 0.1 | 0 |

Two one-line changes to the Sewer's boss (`game/slots.js`, `wererat`), each checked against that
baseline and then undone. Neither was committed.

- **Damage 12 -> 15 (+25%): nothing moved.** 36 of 50 fighter seeds ended differently, but every
  number stayed inside its noise. HP lost in `recover_converter` went 212.7 -> 217.5 (noise
  ±23.7); the finish rate 98% -> 96% (noise ±7 points). As the fighter plays it (about 24 casts
  in that fight), the boss's hit is not what decides the fight. Why is not measured here.
- **HP 100 -> 200 (the control): 16 numbers moved.** Finish rate 98% -> 2%; deaths 2.2 -> 4.3;
  HP lost in the boss fight 212.7 -> 429.0 (noise ±21.3); casts 24.1 -> 40.7.

So the check can see a change that matters, and a "nothing moved" means the change didn't matter
as played, not that the tool missed it.
