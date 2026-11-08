# FX11: the GEAR chooser opens clear of the HEAD plate

## Goal

On the Remoticon's GEAR tab, picking a plate opens a small chooser panel listing
what can go in that slot. Its option rows already sit below the HEAD plate, but
the panel drawn around them (with its title band) starts higher and covers the
bottom of the HEAD plate. After this slice the whole chooser, panel and rows,
starts below the HEAD plate, so every plate stays in view while its chooser is
open.

## How

- `game/layout.js` gains one helper for the chooser panel's rect, measured from
  the HEAD plate's bottom edge in `deviceEquipLayout`. `gearOptionRects` lays its
  rows inside that panel, so the drawn rows and their tap zones still come from
  one place (`main.js` already calls `gearOptionRects(body, n)` and needs no
  change).
- `game/renderer.js` `_drawGearPicker` draws the panel from that helper instead
  of its own numbers.
- The panel's size, the row size and the row spacing stay as they are; only its
  top edge moves down.

## Acceptance

1. Opening any plate's chooser leaves that plate visible: the panel overlaps no
   plate on the tab, at every row count that fits.
2. A test (`tests/gear-chooser.test.js`) pins that the chooser's rect does not
   overlap its own plate's rect, for every plate, and that its rows stay inside
   the panel and the body.
3. Before and after shots at 3440x1440 (and a phone-size check), opened with
   real key presses.
4. `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

## Rulings it rests on

None.

## Out of scope

- Opening the chooser beside the plate it belongs to, or any other new
  placement: it stays a centred column.
- The weapon plate (it opens no chooser) and any left-hand plate (the GEAR tab
  does not show one yet).
- Scrolling or capping a chooser with more rows than fit.
