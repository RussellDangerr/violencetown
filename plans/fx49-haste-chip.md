# fx49 — haste shows a chip with the free actions left

Goal: after drinking a Speed Poition the buff bar shows a chip with the number of free
actions left, counting down each action, gone at 0. Until now only a log line said so.

Acceptance:
- The chip appears after the drink and counts down as actions are spent.
- The test drinks the poition through the bag with real keys, then spends actions and reads
  the number the drawn chip shows down to 0.
- Evidence: a 3440x1440 crop of the chip (kept out of the repo).
- npm test, balance:check, naming grep, autoplay:check pass.

How: haste is a count (`_hasteCharges`), not a buff, so the renderer's buff bar adds one chip
for it (`buffBarChips`), same style as the other chips. No rulings; approved by the loop
under the standing delegation.

Out of scope: slow charges (no chip), the chip's real label (it is `[TEXT]`, copy for
Caelan), any change to how haste is spent.
