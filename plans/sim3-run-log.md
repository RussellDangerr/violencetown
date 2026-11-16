# SIM3: every sim run leaves a record

## Goal
Each `sim:check` and `sim:write` used to leave nothing (a check) or overwrite the last
baseline (a write). Finding which merge moved a number meant replaying merges. Now each run
appends one row to a local log, so the bisect is a lookup.

## What it does
- One JSON line per run appended to `tools/.sim-runs/runs.jsonl`: time, commit sha and whether
  the tree was dirty, the command (check or write), the seeds, and per script: n, finish rate,
  turns and deaths (mean and margin), broken seeds, MOVED metric names, how many seeds ended
  differently, plus minutes for the whole run.
- Each run's per-seed lines (the same numbers SIM2 keeps) go to `tools/.sim-runs/<runId>.jsonl`.
- `node tools/autoplay-sim.mjs --history` prints one line per run, newest first: date, short
  sha (a `+` marks a dirty tree), finish rates, MOVED count.
- `tools/.sim-runs/` is gitignored. No npm script (loop slices cannot touch package.json).
- Row shape is one flat JSON object per line, written by `tools/autoplay-sim-log.mjs`.

## Acceptance
- A tiny `sim:check` (`--seeds=1-2 --scripts=loops`) logs a row and `--history` shows it.
- Tests cover the row builder, the append, and the history lines.
- `npm test`, `balance:check` and the naming grep pass.

## Out of scope
Pruning old runs, comparing two logged runs, any change to what counts as MOVED.
