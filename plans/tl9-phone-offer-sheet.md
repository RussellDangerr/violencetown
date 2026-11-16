# TL9 - on a phone, the offer screen becomes a sheet with thumb-sized rows, tray and buttons

## Goal
On a phone the trade / offer screen opens as a full-screen sheet. Its goods rows, tray slots,
the make-the-offer button and the Talk button are all at least 44 CSS px. Desktop keeps its
layout number for number. This is the last phone screen, so the tap test's known-small list
ends with only the never-drawn flat hotbar slot (ruling TL8R1 c).

## Rulings it rests on
- TLR2 pick (a): phone menus are full-screen sheets, every row and button at least 44 tall.
- TLR3 pick (a): sheets everywhere on phones.
- TL4, TL6, TL7, TL8 (merged): the pattern. A layout function takes an optional sheet
  (`deviceSheetRect(vp)`, null off a phone) and returns today's layout without one.

## How
- `layout.js`: `offerLayout(panel, sheet = null)`. With a sheet it returns the phone layout
  with the same keys: a title row (face, name, GP, close chip), a meter row with Talk, two
  columns of six tall rows that still tile with no gap, two trays of six thumb-tall slots
  (three to a line so they fit a column), the strip, the ledger and one full-width button.
  It also carries `thumb`, text scales `ts` and the header's spots `head` (desktop values are
  today's).
- `renderer.js`: the offer screen draws from those; on a phone its text is larger, rows get a
  big icon and a divider, the key legend is left out, and the panel the close chip and
  tap-outside use is the sheet.
- `main.js`: the offer tap and the wheel scroll hit-test against the sheet layout.
- Tests: `tap-targets.test.js` measures the offer with the sheet and its four entries leave
  the known-small list (the hotbar slot stays); `offer-layout.test.js` pins the sheet:
  44+ targets, inside the sheet, no overlap, zero-slop rows, every tray slot reachable.

## Out of scope
The hotbar slot, the dialogue rows, new copy (the Talk label stays a placeholder), a
different number of visible rows.
