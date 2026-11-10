# BN1 — Restart keeps a snapshot; the next game opens with a report

## Goal
Before RESTART wipes the save, keep a small capped snapshot of the old character under its own
localStorage key (`violencetown.bones`): stats, gear ids, gold, where it was, how far it got.
Keep the newest 3. The new game then shows a three-line report in the log strip.

## Acceptance
- Restart snapshots before the wipe; only the newest 3 are kept.
- The new game shows three lines. All three are `[TEXT]` placeholders (copy is Caelan's).
- A broken, old or oddly-shaped snapshot is ignored, never a crash.
- Screenshot at 3440x1440 of the report.
- npm test, balance:check, naming grep, autoplay:check pass.

## Rulings
BNR1 pick (a): the old character may show up as flavour only, its gear stays with it, so no
value crosses into the new run. The snapshot is separate from the save and nothing reads it back
into stats, gear or gold.

## Design
`game/bones.js` is pure (storage passed in): snapshot, keep (cap 3), read (validate, drop bad),
report lines. `_fullReset` in `main.js` snapshots only for a player's Restart (no seed). The
seeded autoplay reset skips both snapshot and report, so the golden cannot move. The report is
log lines, so it never blocks input.

## Out of scope
The old character appearing as an NPC (BN2). Triggers other than Restart. Real report copy.
