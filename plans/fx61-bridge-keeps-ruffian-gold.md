# FX61: the bridge cutscenes keep the Ruffian's stolen gold

## Goal
A mugger keeps the gold he took when you leave his zone. Doors and later taxi rides already
record it (BS2). The two first-crossing bridge cutscenes (the crash into the Canyon, the ramp into
Downtown) did not, so the Ruffian came back with his base gold.

## Fix
The record moves into the one zone-change step (`_zoneChange`), once. The per-caller calls on the
door path and the ride path are removed, so nothing counts twice.

## Acceptance
- After the crash and after the ramp, a Ruffian holding stolen gold has it on his record.
- Every zone change records muggers once, from inside `_zoneChange`; no caller copies it.
- A test drives both cutscenes, the ride and the door step.
- npm test, balance:check, naming grep and autoplay:check pass.

## Rulings
None. Loop-approved under the standing delegation; it restores what BS2 already promised.

## Out of scope
Any new copy, numbers or names. No change to how the record is read back on respawn.
