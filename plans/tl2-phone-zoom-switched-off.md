# TL2: phone zoom, built and switched off

## Goal
On a phone (coarse pointer) the world can zoom in so the short side shows about 14 tiles
instead of 20, at whole-pixel scales. The zoom is built behind one switch, `PHONE_ZOOM_ON` in
`game/viewport.js`, and ships OFF, so a phone looks exactly as today and no 608px menu is cut
off. A later slice (TL5) makes menus shrink to fit and flips the switch.

## Acceptance
- Switch off: a 375x812 phone viewport is identical to today.
- Switch on (tests pass it explicitly): the phone shows `PHONE_TILES` (14) tiles along the
  short side, at a whole scale, player centred.
- Desktop (3440x1440) is identical to today, with the switch on or off, because only a coarse
  pointer reads it.
- npm test, balance:check, naming grep and autoplay:check pass.

## Rests on
- TLR1: about 14 tiles across on a phone's short side. (The exact card pick was not in the
  repo, so 14 is used; flagged for his eye.)
- TL2R1 (d): two steps. This slice ships the zoom off; TL5 scales menus and turns it on.

## Out of scope
Menu shrink-to-fit, turning the switch on, any change to the saved zoom steps or Options.
