# ZM1 — a Closer / Farther zoom setting, in whole pixel steps

## Goal

Today the game picks the pixel scale for you: the largest whole scale that still shows at least
20 tiles along the short side of the window (`game/viewport.js`, `computeViewport`). The player
cannot change it. This slice adds a zoom setting to Options. Its steps are the whole pixel scales
the screen allows, Closer moves to the next bigger one, Farther to the next smaller one, and the
view resizes at once. Pixels stay crisp because the scale is always a whole number.

## The ruling it rests on

ZMR1, picked (a) by Caelan: a setting in whole steps the player picks, pixels crisp, plus a
separate text and menu size. The text and menu size is a later slice; this one leaves text and
menus exactly as they are.

## How it works

- `computeViewport` takes an optional `zoom` (a whole scale). Unset means automatic, which is
  today's rule, so an unset setting renders exactly as today.
- The steps run from 1 up to the closest step. The automatic scale is one of them.
- Farther is limited only by the screen. Closer may go past the 20-tile floor, but only as far as
  menus still fit: the menus keep their 608x608 layouts, so the closest step is the largest scale
  at which 608 logical px still fit along the short side. On many screens that is the automatic
  step itself, so Closer has nothing to offer there; this is flagged for Caelan.
- A saved choice that no longer fits the screen (another monitor, a smaller window) is clamped to
  the nearest step that does.
- Choosing the automatic step stores "unset", so the setting then follows the screen again.
- Saved on the device under its own storage key, read and written inside try/catch like
  `game/settings.js` does, and independent of the save file (so a game's save fingerprint does not
  change). `game/settings.js` is outside this slice's files, so the zoom has its own key rather
  than a field there.
- Options gains one row: a label, a Farther button, a readout of the current scale, a Closer
  button. All words are `[TEXT]` placeholders.

## Acceptance

- Options has a zoom row; Closer and Farther move one step and the view resizes at once.
- The choice is saved and survives a reload.
- The automatic choice stays the default; the floor lowers only as far as the closest step needs.
- Text and menus keep their size.
- Tests: the steps for several screen sizes, the setting changing the scale, persistence across a
  reload, and the default matching today.
- Frames at 1920x1080 and 3440x1440 at two steps each.
- npm test, balance:check, naming grep and autoplay:check all pass.

## Out of scope

- The separate text and menu size setting (next slice).
- Real words for the label, buttons and readout.
- Keyboard shortcuts for zoom.
- Anything in `layout.js` or the renderer.
