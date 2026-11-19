# PC3: the fight panel, HUD and menus say plainly what each row and control is

## Goal
Every label in the fight target panel, the bag footer, the haste chip, the skills readout, the
Remoticon tabs, the ESC hints, the offer button, the Act 2 checklist header, the notes-empty
line and index.html (aria labels included) reads as a plain, true statement of what the row or
control is or does. No `[TEXT]`, no square brackets. Names stay as they are.

## Acceptance
1. Target panel: armour reads "Armour N", worn gear is headed "Wearing"; weakness and resist
   rows carry plain words. No `[TEXT]` in any panel row.
2. Plain, no brackets: bag footer (including what Space does there, read from the code the
   control runs), haste chip, skill label, the two Remoticon tabs (each named for what it opens),
   the sub-ring ESC hint, the offer button, the Act 2 checklist header, the notes-empty line,
   the index.html labels.
3. No layout rect changes. A line that no longer fits is shortened, never overflows; the fit
   tests still pass.
4. Old tests pinning these labels are re-pinned exactly, in their own commit.
5. `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.
6. Evidence: 3440x1440 frames of a target panel and the bag footer with tabs, plus a 375x812
   frame of the longest label.

## Rests on
PCR3 (picked 11-17): copy is deadpan and factual, every name stays, no square brackets in player
text, every line matches what the code does.

## Out of scope
Gear slot labels (HEAD/ARMS/TORSO/FEET, WEAPON [RIGHT]): PC11 renames them. main.js log lines.

## Status: blocked on touches
Tests outside the touches pin these strings; the loop must widen the touches to include them:
- tests/plain-copy-guard.test.js: ALLOWED counts for index.html (15), layout.js (3), renderer.js (13) must be lowered.
- tests/fight-panel-weakness.test.js:165-166: pins '[TEXT] FIRE' and '[TEXT] COLD'.
- tests/act2-item-checklist.test.js:83: pins the heading '[TEXT]'.
- tests/body-roster.test.js:41: pins DEVICE_TAB_LABELS.bodies === '[TEXT]'.
- tests/interactions.test.js:43: pins DEVICE_TAB_LABELS.notes === '[TEXT]'.
- tests/bag-cursor-start.test.js:232: pins the footer parts '[ ] TABS', 'SPACE' (kept if the footer's key words stay).
