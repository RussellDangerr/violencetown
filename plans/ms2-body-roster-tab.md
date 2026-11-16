# MS2: a device tab for the bodies you have worn

## Goal
A seventh Remoticon tab lists the bodies the player has worn. Night Kid is always listed. A mask body (the Rat Mask is the first) is added the first time it is worn. A body never worn appears nowhere.

## Acceptance
- The new tab lists only worn bodies.
- Unfound bodies appear nowhere.
- The list survives save and load.
- A 3440x1440 screenshot of the tab.
- npm test, balance:check, the naming grep and autoplay:check pass.

## Rulings it rests on
- MS1 (merged): the Rat Mask makes you a rat.
- The roster stays fully hidden; only worn bodies ever appear.
- MS2R1 (a): the tab-list tests in device-layout, interactions and tap-targets change for the seventh tab, in their own commit, and nothing else in them is loosened.

## How
- game.bodiesWorn holds the species worn so far, recorded each frame beside the fight tracker. Night Kid is not stored.
- save.js writes it only when non-empty, so a save with no mask worn (and the autoplay fingerprint) is unchanged.
- A new game clears it.
- The tab is last, after notes. Its name and the row labels are bracketed placeholders.
- Tests: tests/body-roster.test.js.

## Out of scope
Body art, real names or descriptions, per-body stats, any change to how bodies are worn.
