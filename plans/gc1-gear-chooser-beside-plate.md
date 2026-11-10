# GC1: the GEAR chooser opens beside the plate you picked

## Goal

On the Remoticon's GEAR tab the chooser (the titled panel of rows) always opened
under the HEAD plate, far from the plate you tapped. It now opens next to the
plate you picked, covering no plate. An empty chooser also gets room inside its
panel for its note, which used to sit on the border.

## How

- `gearChooserRect(body, n, key)` and `gearOptionRects(body, n, key)` take the
  plate's key. No key (or HEAD) gives today's place, so the default is unchanged.
- For another plate the panel tries, in order: beside the plate towards the middle
  of the body (level with it, slid up if it would run off the bottom), below it,
  above it, beside it on the far side. The first place inside the body that covers
  no plate wins.
- With no rows the panel is tall enough for its title band plus one row of room;
  `gearEmptyNoteRect` is that room and the renderer centres the note in it.
- `main.js` (tap hit-test and the keyboard cursor's rects) and the renderer pass
  the open plate's key, so taps, the cursor and the drawing share one rect.

## Acceptance

- Each plate's chooser opens beside that plate and overlaps no plate, for 0 to 6
  rows, at 3440x1440 and on a phone (the layout is in body units, the same at any
  window size).
- The empty note sits inside the panel, clear of its border.
- Taps and the keyboard cursor land on the rows where they are drawn.
- The test opens the FEET and BACK choosers with real keys.
- Evidence frames of the FEET, BACK and an empty chooser.
- npm test, balance:check, naming grep and autoplay:check pass.

## Rulings

None. The loop's tweak note is the brief.

## Out of scope

- Row size, spacing, the plates' own positions, any wording.
