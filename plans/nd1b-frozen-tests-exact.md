# ND1b: the frozen-creature examine tests check the exact line again

Goal: ND1 loosened two assertions in tests/frozen-creatures.test.js (the examine panel body and the E-key log line). Put them back to exact matches, computed from the real examine output.

Acceptance:
- The panel body for each frozen creature (Snowman, Yeti, Polar Bear) is asserted with an exact equal.
- The E-key log is asserted with an exact deepEqual of the one line.
- No game file changes; no other assertion changes.
- npm test, balance:check, naming grep, autoplay:check pass.

Rests on: the ND1 plain-line change (e08aed9). Out of scope: any wording or game change.
