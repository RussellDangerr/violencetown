# SIM4: the sim says when a number's spread changes

## Goal
`sim:check` compares averages only. When PS1 made the sneak's boss-stage casts
exactly 21 on every seed (sd 0.65 -> 0), the dice stopped mattering there and
the check said nothing. It should say so.

## What it does
`spreadCompare(base, now)` in `tools/autoplay-stats.mjs` takes two aggregates
(the same shape `compare` takes) and returns the metrics whose standard
deviation changed:
- by at least x2 or /2, and
- past a 95% variance test (a normal approximation on the log of the variance
  ratio, using each side's n), or
- always when the spread collapses to 0 or grows from 0 (both sides need n > 1).

`tools/autoplay-sim.mjs --check` prints each as a `SPREAD` line under its
script. SPREAD lines are shown only: they never set the failing exit code.

## Acceptance
- A test feeds PS1's real case (recover_converter.casts sd 0.65 -> 0, mpSpent
  6.48 -> 0, n 50) and gets a SPREAD row for each; an unchanged spread gets none.
- Also covered: a x2 change past the test, a x2 change inside the noise (small
  n), a change under x2, grows-from-0.
- `npm test`, `balance:check` and the naming grep pass.

## Rulings
SB1 (baseline caught up with PS1), SIM2 and SIM3 are on dev. No picks; the
card's lean is followed: show, never fail.

## Out of scope
Making SPREAD fail the check; changing the baseline or seeds files; the
run log's row shape.
