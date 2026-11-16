# TL8 - on a phone, the throw prompt is thumb-sized (the hotbar slot is held back)

## Goal
On a phone the throw prompt's four buttons are at least 44 CSS px, grown in place around the
hero's tile. They never cover the hero's tile, each other or the dock. Desktop keeps its four
32 px targets, number for number. The legacy hotbar slot was also on the card.

## Rulings it rests on
- TLR2 pick (a): every phone target at least 44 tall.
- TLR3 pick (a): sheets on phones; these two are not menus, so they grow in place.
- TL3/TL4/TL7 pattern: the layout function returns today's layout unless the viewport is a phone.

## How
- `layout.js`: `throwRects(vp)` returns thumb squares on a phone (`thumbOf(vp)`), the side pair
  just clear of the hero's tile, the top and bottom pair half a thumb out so none touch.
- `renderer.js`: the prompt draws each target at the size layout gives it.
- `tap-targets.test.js`: `world.throw` leaves the known-small list; new tests pin the geometry.

## Hotbar slot: not done
`main.js _tapHotbar` hit-tests the slot from the exported HOTBAR_SLOT_W/H constants, which the
desktop pin fixes at 42. Growing it on a phone needs main.js to take its rects from a layout
function, and main.js is outside this card's touches. It stays on the known-small list.

## Out of scope
main.js, the offer screen, the dialogue rows.
