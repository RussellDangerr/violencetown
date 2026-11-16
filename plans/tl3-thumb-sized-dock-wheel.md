# TL3: on a phone, the dock and the wheel are thumb-sized

## Goal
On a phone (375x812 and 390x844), every tap target in the dock and the wheel is at
least 44 CSS px on its shorter side: the wheel's opener, the log, the item bar's
category chips, its item cells and its scroll arrows, and the wheel's hub and rings.
Desktop is unchanged, to the pixel.

## How
- A phone is a viewport whose logical px per CSS px is over 1.2 (today 2). Its thumb is
  44 CSS px in logical px, rounded up to an even number.
- `dockFor(vp)` gives such a phone a taller dock; main.js builds the viewport with it.
  A viewport built with the plain `DOCK` keeps today's layout, so every other caller
  and test is unchanged.
- The item bar's chips and cells grow to the thumb; its arrows become thumb-sized
  cells either side of the row. The opener and the log grow to the thumb.
- The wheel's hub and rings are a thumb thick, opening centred over the dock (there is
  no room to reserve a column for it). Draw and hit-test read the same metrics.
- The 14-tile phone zoom stays off (`PHONE_ZOOM_ON`); this works without it.

## Acceptance
1. tap-targets test: dock and wheel targets are 44+ on both phones (the pins for them
   leave the under-44 list; their phone pins change in their own commit, saying TL3).
2. Desktop pixel-identical: the 3440x1440 pin table is untouched, and a new test pins
   that desktop and plain-`DOCK` viewports take the old code path.
3. Frames of a fight on a 375x812 phone, opening the wheel and picking a move.
4. npm test, balance:check, naming grep, autoplay:check pass.

## Rests on
TLR2 (a): phone menus become full-screen sheets (TL5). Menus are NOT this slice.
TL2 is merged; its zoom ships off and this slice does not turn it on.

## Out of scope
Menus, the throw prompt, dialogue rows, and the first-run hint. Landscape phones
(the dock is two rows there too, but it was not tuned). Wheel label type size: the
text stays as it is, in thicker rings.
