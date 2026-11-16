# TL7 - on a phone, the target list and the item menu become sheets with thumb-sized rows

## Goal
On a phone, the target list (tap a thing, pick a verb) and the item menu (the use / throw /
smash list) open as full-screen sheets. Every row and the close chip are at least 44 CSS px
tall. Desktop keeps today's floating panels, number for number.

## Rulings it rests on
- TLR2 pick (a): phone menus are full-screen sheets, every row and button at least 44 tall.
- TLR3 pick (a): sheets on phones everywhere (no zoom).
- TL4 and TL6 (merged): the sheet pattern. Layout functions take an optional `sheet`
  (`deviceSheetRect(vp)`, null off a phone) and return today's layout without one.

## How
- `layout.js`: `targetListRowRect(i, sheet)` and `itemOverlayRowRect(i, sheet)` return a
  thumb-tall row under a title band when given a sheet; `listPanelRect` gives the panel (the
  sheet on a phone). The close chip on every phone menu is the thumb-sized chip.
- `renderer.js`: both lists draw through two shared helpers for title and row, at scale 2
  on a sheet; the panel rect they stash for tap-outside and the chip is the sheet.
- `main.js`: the two tap handlers pass the sheet; the page's floating buttons step aside
  while either list is open, as they do for the Remoticon.
- `tap-targets.test.js`: the walk measures these with the sheet; the entries that now reach
  44 leave the known-small list. No rule or desktop pin is loosened.

## Acceptance
- On 375x812 and 390x844 the rows and the chip are 44+ CSS px, on the sheet, not overlapping.
- Desktop at 3440x1440 keeps every pinned number.
- Screenshots at 375x812 of the target list and the item menu.
- npm test, balance:check, naming grep, autoplay:check pass.

## Out of scope
The hotbar slot, the offer screen, the throw prompt and the dialogue rows (they stay on the
known-small list). The close chip also grows to a thumb on the log, offer and dialogue panels
so the shared chip measures 44; their layouts are otherwise unchanged.
