# FX43 — the bag's cursor starts on your first item, and the footer lists the keys

## Goal
Opening the Remoticon on its ITEMS tab leaves the cursor on empty space, so the first arrow
press lands on slot 1 whether or not it holds anything, and the footer only names tabs and
close. Start the cursor on the first filled slot instead, and let the footer list the other keys
that work in the bag.

## Acceptance
- Opening the bag puts the selection on the first filled slot of the first page.
- The first arrow press moves from that slot (it does not jump to slot 1).
- An empty bag: no selection, nothing breaks, as today.
- Only the ITEMS tab's opening cursor changes. GEAR, QUESTS, MAP and RINGS open as today;
  switching tabs inside the Remoticon still clears the selection as today.
- The ITEMS footer lists tabs, arrows, Space and Esc, using phrases the game already uses
  (`[ ] TABS`, `↑↓ PICK`, `ESC CLOSE`). Space has no existing verb for this, so it reads
  `SPACE [TEXT]` until Caelan picks one. The footer fits inside the panel (`_fitText`).
- Evidence: a 3440x1440 frame of the bag just opened.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

## Build
- `main.js`: a small `_bagFirstFilled` helper and a use of it in `_openDevice`.
- `renderer.js`: the ITEMS footer line in `_drawDevice`.
- `tests/bag-cursor-start.test.js`: opens the bag with real key events through main.js's own
  input listener and checks where the selection lands and where the first arrow goes; draws the
  footer and checks it fits.

## Rulings
None. The Space wording is a placeholder, flagged for Caelan's eye.

## Out of scope
Cursor behaviour on other tabs, the key bindings themselves, any new copy.
