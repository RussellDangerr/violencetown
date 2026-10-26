# Light fingers: clean lifts rank up your thieving

## Goal

Thieving gets better the more you do it well. Every clean lift (a take the victim never notices)
counts toward one skill, light fingers. At set counts you reach a rank, and each rank grants a
small perk through the same passives bag that rings already feed into the Thieve verb: a higher
steal ceiling (`stealLimit`) or a larger notice buffer (`noticeBuffer`). Nothing else grows. There
is no level number and no stat growth; a rank only changes what you can lift and how much you can
take before someone notices.

## How it works

- `game/skills.js` is a pure table plus helpers. A skill is a list of ranks, each a count of clean
  uses and the perk it adds. The perks of every rank reached add together.
- The game keeps `skills` on the player as `{ skillId: cleanUses }`. It belongs to you, not to
  anything you wear, so swapping gear, rings or (when they exist) masks cannot touch it.
- In the Thieve resolver the passives are the ring passives plus the skill perks. Only a clean lift
  is counted; a noticed lift, an empty pocket, nothing to take, or a full bag count for nothing.
  The perk a lift unlocks applies from the next lift on, not to the one that earned it.
- Reaching a rank writes one log line. Its copy is `[TEXT]` until it is written.
- The save carries `player.skills` and a load restores it. An empty record is left out of the
  save, so a run that never steals cleanly saves exactly as it did before (the autoplay's
  fingerprint is a hash of the save). Load cleans the record: only known skills, whole numbers,
  never below zero. RESTART clears it, like every other part of a run.

## Acceptance checks

- A clean lift counts toward the skill; a noticed or failed one does not (`tests/skills.test.js`).
- Reaching a threshold grants its perk, and the perk changes `stealLimit` / `noticeBuffer` as the
  Thieve verb reads them.
- Ranks survive a save and load, and survive a change of rings (the stand-in for a mask swap,
  since masks are not built yet).
- `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

## Rulings this rests on

- **Skills may rank up by use** despite the written "no XP, no levels" rule: picked *yes, use-ranks
  that grant perks*. The pick amends two docs, `plans/systems-audit-2026-08.md` (its "Do not add
  levels" section) and `plans/stats-consumables-library.md` (its "no XP, no level-ups" line), with
  a dated note: use-ranks count clean successes of one action and grant small perks at
  thresholds; there is no single level number and no stat growth past Law 0. Those two files are
  outside this slice's touches, so the amendment is recorded here and left for a follow-up.
- **Which skill first:** picked *light fingers: thieving*.
- **Do you see your ranks:** picked *a log line on rank-up, and a readout in the Remoticon*. This
  slice ships the log line; the readout is its own slice.

## Placeholders (for Caelan's eye)

- The thresholds (3, 8, 15 clean lifts) and the perk sizes (+25 GP ceiling, +1 notice buffer) are
  placeholders. +25 GP is one coin-weight step and +1 is one buffer step, so each rank is the
  smallest change the theft maths can show.
- The rank-up log line is `[TEXT]`.

## Out of scope

- The Remoticon readout of skills and ranks (its own slice).
- Any other skill (running waits on the sprint; cooking does not exist; prices is ruled out).
- Masks themselves.
- Editing the two docs named above.
