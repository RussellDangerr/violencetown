# LF1: your thieving rank says what it changed and how far the next one is

## Goal
Make light fingers legible. When a clean lift reaches a rank, the log line says what that rank
changed. The RINGS tab skills row shows how many clean lifts you have, against the next rank's
threshold.

## What it does
- `game/skills.js` gains pure helpers: `nextThreshold(skills, id)` (the next rank's count, or
  null at the top), `rankPerk(id, rank)` (that rank's own perk) and `perkText(perk)`, which
  prints the perk keys and values raw.
- `_countCleanLift` (main.js) logs `[TEXT]` followed by the raw perk text of the rank just
  reached. It stays an obvious placeholder; no wording is chosen.
- The readout row keeps its `[TEXT]` label and pips, and gains the count as digits: `n/next`,
  or just `n` at the top rank. The layout reserves room for it so the row still fits and clears the
  ring sockets.
- The save is untouched: the count is already stored.

## Acceptance
- Third clean lift logs the placeholder line carrying that rank's perk values; the next lift's
  take reflects them.
- Readout shows the count; it rises after a clean lift, not after a noticed one.
- Top rank shows the count with no threshold; the row fits and clears the sockets.
- Reload keeps count and display.
- Existing skills tests change only where behaviour changed; none removed.
- npm test, balance:check, naming grep, autoplay:check pass (autoplay does not thieve).

## Rulings
LF1R1, pick b: the rank-up line says what the rank changed, and the readout shows clean lifts
toward the next rank. Thresholds (3, 8, 15) become visible.

## Out of scope
Any real wording, names or new numbers; any change to thresholds or perks; the save format.
