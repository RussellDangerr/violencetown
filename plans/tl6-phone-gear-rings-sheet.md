# TL6 - on a phone, the GEAR and RINGS tabs fill the sheet with thumb-sized plates and rows

## Goal
On a phone, the Remoticon's GEAR and RINGS tabs use the sheet's full height, and every
GEAR plate, every GEAR chooser row and every ring socket is at least 44 CSS px on its
short side. Desktop is untouched.

## Rulings it rests on
- TLR2 pick (a): phone menus become full-screen sheets, every row and button at least 44 tall.
- TLR3 pick (a): sheets on phones everywhere (a zoom is off the table).
- TL4 (merged): the sheet pattern. Layout functions take the body rect; a body from a phone
  sheet carries `thumb`, and without it they return today's layout.

## How
- `deviceBodyRect(sheet, 'gear' | 'rings')` returns the sheet's whole height, like the bag.
- `deviceEquipLayout` lays the seven plates as two thumb-tall columns around the figure, HEAD above.
- The chooser's rows are a thumb tall and the panel is as wide as the gap between the columns.
- `deviceRingsLayout` makes each socket a thumb square; the staggered fingertips keep neighbours apart.
- The renderer and main.js already read these functions, so they follow without edits.

## Acceptance
- On 375x812 and 390x844 plates, chooser rows and ring sockets are 44+ CSS px, inside the body,
  not overlapping each other; they leave the tap test's known-small list.
- Desktop at 3440x1440 keeps every pinned number.
- Screenshots at 375x812 of GEAR with the chooser open, and RINGS.
- npm test, balance:check, naming grep, autoplay:check pass.

## Out of scope
The target list, item overlay, hotbar, offer screen and the shared close chip on other menus.
