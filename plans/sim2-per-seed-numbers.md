# SIM2 - the sim keeps every seed's numbers and compares seed to seed

## Goal
The 50-seed sim (plans/sim1-autoplay-many-seeds.md) keeps only each number's mean, spread
and margin, plus one fingerprint per seed. A MOVED line cannot say which seeds moved or by
how much. This slice keeps every seed's numbers in their own file and compares seed to seed.

Seed 17 before against seed 17 after cancels most of the luck, so a paired test sees smaller
real shifts than two independent groups of 50.

## What changes
- `tools/autoplay-sim-seeds.jsonl`: one line per script and seed: `script`, `seed`, `finished`,
  `turn`, `deaths` and every stage number (same flat names as the baseline's metrics, from
  `metricsOf`). Broken runs are left out. The baseline file's format is untouched.
- `sim:write` writes the baseline and the seeds file. A new `--write-seeds` writes only the
  seeds file, so the file can be made without rewriting the baseline.
- `sim:check` compares seed by seed on the seeds both runs share. For each number: the
  per-seed differences, their mean, and a 95% margin from their spread. MOVED means the mean
  difference is past that margin and at least 2% of the baseline mean (one whole unit when
  that mean is 0).
- Each MOVED line names up to 5 seeds that moved most, `before -> after`.
- With no seeds file (or no rows for a script) it falls back to today's two-group test and
  prints that it did.
- `compare` in `tools/autoplay-stats.mjs` is unchanged; `pairedCompare` is new.

## Acceptance
As on the card. Tests in `tests/autoplay-stats.test.js` cover the paired test. `npm test`,
`balance:check`, the naming grep and the guard pass.

## Rests on
SB1 (merged): the sim baseline is current with PS1 and the after-merge routine is written down.
LOOP.md section 8: `sim:write` is not run against the real baseline here, so the seeds file is
made with `--write-seeds`.

## Positive control
SIM1's planted change (Were-Rat damage 12 -> 15) in a throwaway worktree only, never on this
branch, re-run with the paired check. The result is written in the section below.

## Out of scope
Changing the baseline, any golden, the autoplay itself, the flag rule for the loop (LOOP.md
section 13), or any choice of what counts as a move beyond the paired margin.

## Result of the positive control
Throwaway worktree at this branch's tip, `damage: 12` -> `15` on the Sewer's boss, never committed.
`node tools/autoplay-sim.mjs --check --scripts=quest` (the fighter, 50 seeds) against the seeds file:

    quest: 3 moved · 36 of 50 seeds ended differently · paired on 50 shared seeds
      MOVED recover_converter.attacks   0.34 -> 0.20   (-0.14, noise +-0.10)
      MOVED recover_converter.hpLost    212.66 -> 217.54 (+4.88, noise +-2.38)
      MOVED recover_converter.throws    3.54 -> 3.44   (-0.10, noise +-0.08)

So yes: the paired check flags it. The two-group check saw the same hpLost shift with noise
+-23.7 and flagged nothing. The finish rate (98% -> 96%) stays inside its paired noise. Only the
fighter script was re-run (sneak and loops left out, to keep the CPU load small).

The seeds file was made with `node tools/autoplay-sim.mjs --write-seeds --seeds=1-50` on this
branch (150 runs, 0 broken); the baseline file was not rewritten.
