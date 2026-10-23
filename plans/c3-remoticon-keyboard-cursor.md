# C3 — a keyboard cursor in the Remoticon

## Goal

Everything the Remoticon does with a tap can be done with only a keyboard. Today
the keys can open it, close it and change tabs, but selecting an item, using,
equipping, unequipping, dropping and protecting it, and slotting rings, are
tap-only.

## How it works

- **One activate step.** Every Remoticon action goes through one method,
  `_deviceActivate(zone, index)`: a tab, a bag slot, an inspector action, a gear
  plate, a chooser row, a chooser dismiss, a ring socket. `_tapDevice` only turns
  a point into a `(zone, index)`; the keys only move a cursor and, on confirm, call
  the same step with the cursor's `(zone, index)`. This is the offer screen's
  `_offerActivate` pattern, so taps and keys cannot drift apart.
- **The cursor is the existing selection.** `_deviceSel` already draws the gold
  halo on a bag slot (and opens its inspector) or on a gear plate. The cursor
  moves that same selection. Two inner levels get a focus index on it: the
  inspector's action buttons (`action`) and the gear chooser's rows (`option`).
  A gear plate can now be focused without its chooser open (`open` marks the
  chooser as open). Ring sockets, action buttons and chooser rows get a gold
  outline drawn just outside the rect, since filled sockets and buttons already
  wear an inner stroke.
- **Moving** picks the nearest rect in the pressed direction from the rects the
  renderer draws (`nearestRectInDir` in `layout.js`), so the bag grid, the plates
  around the figure, the two hands and the button rows all navigate by geometry.
  No wrap; at an edge the cursor stays.

## Keys (ruling C3R1, pick a)

- Arrows and WASD move the cursor. They no longer cycle tabs.
- `[` and `]` cycle tabs. C / J / M / R still jump to a tab; Tab still pockets it.
- Space or Enter confirms: on a filled bag slot it steps into the action buttons;
  on an action it does it; on a gear plate it opens the chooser; on a chooser row
  it equips or bares; on a ring socket it slots or unslots.
- Esc steps back one level (actions back to the slot, chooser back to the plate);
  Esc again closes the Remoticon. The ✕ chip and a tap outside still close it at
  once, as today.
- On the Quests tab up/down still scroll the list.
- No new key needs Ctrl, Alt or Meta.

## Acceptance

- With only a keyboard you can select, use, equip, unequip, drop and protect
  items, and slot and unslot rings.
- Keys and taps do the same thing for every Remoticon action, and
  `tests/device-keys.test.js` drives each action both ways and compares the
  outcome.
- Keys follow the ruling above; no new key needs a modifier.
- Screenshots at 3440x1440 of the cursor on the Items, Gear and Rings tabs.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

## Choices made here (flagged for review)

- The first arrow or confirm on a tab with no cursor puts it on the first entry
  (bag slot 0, the HEAD plate, the leftmost socket) rather than moving.
- After a keyboard action or equip the cursor stays on that slot or plate; a tap
  still clears the selection, as today.
- The weapon plate stays inert, as it is for taps.

## Out of scope

- The footer hint text is unchanged (no new copy).
- Gamepad input, mouse hover moving the cursor, and the Map tab (nothing to act on).
