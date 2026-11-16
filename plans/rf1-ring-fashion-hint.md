# rf1-ring-fashion-hint

Goal: after the Were-Rat drops its fur, tell the player the silversmith (Platero) can make it into a ring, and where rings are worn (the rings tab).

Acceptance:
1. Holding wererat_fur with no ring fashioned yet fires one hint (normal hint pacing) naming the silversmith and the rings tab. Words are [TEXT] placeholders.
2. It does not fire before the fur is held, and fires once (the existing seen-hints record).
3. Platero's Fire Blood choice shows only while at least one Fire Blood is carried (existing `requiresItem`). The count the ring needs (3) is unchanged.
4. tests/ring-fashion-hint.test.js drives the hint with and without the fur and Platero's choices with and without Fire Blood.
5. npm test, balance:check, naming grep and autoplay:check pass.

Rulings: none; loop-approved.

Out of scope: main.js, hint pacing, ring cost, real copy.
