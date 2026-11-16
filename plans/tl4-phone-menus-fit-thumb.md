# TL4 — on a phone, menus fit a thumb (Remoticon first)

## Goal
On a phone, the Remoticon (the tabbed device) becomes a full-screen sheet whose tabs,
bag slots, page arrows, inspector buttons and close button are each at least 44 CSS px
on their short side. Desktop is untouched.

## Rulings it rests on
- TLR2, pick (a): phone menus become full-screen sheets, every row and button at least 44 tall.
- TL3 (done): the thumb-sized dock and wheel; `thumbOf(vp)` says whether a viewport is a phone.

## How
- `deviceSheetRect(vp)` gives the sheet in menu space (the whole screen, offset by the menu
  box so the existing translate and `toMenu` stay as they are), or null off a phone.
- The Remoticon geometry functions take that sheet as an optional argument. With none
  they return exactly what they do today; with one they lay out a thumb-sized version
  (seven tabs across, a bag of seven columns, a pager row under the pack, taller inspector
  buttons). Renderer and main.js read the same functions, as before.
- `tests/tap-targets.test.js` measures the sheet on the phones, and its known-small
  list loses every target that reached 44.

## Acceptance
- Remoticon tabs, bag slots, pager arrows, inspector buttons and close are 44+ CSS px on
  375x812 and 390x844; desktop at 3440x1440 is pixel-identical.
- npm test, balance:check, naming grep and autoplay:check pass.
- Screenshots at 375x812 of the Remoticon and the bag.

## Out of scope (later slices, one per screen)
GEAR plates and chooser rows, ring sockets, the target list, the item overlay, the
hotbar, the offer screen, and the shared menu close chip on the non-Remoticon menus.
Those stay on the known-small list.
