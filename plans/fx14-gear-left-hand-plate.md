# FX14: the GEAR tab has a left-hand plate

## Goal

Every body has two hands (plans/ws3-two-hands-left-right.md), but the GEAR tab
draws one weapon plate and the equip path (`resolveEquip` in `game/items.js`)
only ever fills the right hand. After this slice GEAR shows a second plate for
the left hand. Tapping it (or confirming it with the keyboard cursor) opens the
same chooser the armour plates use, and picking a weapon from it puts that
weapon in the left hand.

## How

- `game/layout.js`: the left-hand plate is a rect of its own, returned beside
  the six plates by `deviceEquipLayout` as `leftHand`. It is kept out of the
  `slots` list so the plate list other code (and the existing tests) read is
  unchanged. The two weapon plates take the bottom corners, mirrored about the
  figure (right hand bottom-left under BACK, left hand bottom-right under FEET),
  clear of the HEAD plate's chooser and of every other plate. The keyboard
  cursor steps FEET down to the left-hand plate, and HEAD still steps down to
  ARMS.
  Its label is the existing `WEAPON [LEFT]` text; the right-hand plate takes the
  existing `WEAPON [RIGHT]` text so the pair reads as a pair. No new copy.
- `game/items.js`: `resolveEquip` and `resolveUse` take the hand to fill
  (right by default, so every existing caller is unchanged) and hand it to
  `holdInHands`. A new `gearOptions(game, plateKey)` gives the chooser its rows:
  for the left plate it lists the bag's weapons, and leaves out the Bare row
  when the left hand is only holding half of a two-hander (that half can't come
  off alone).
- `game/main.js`: the plate tap, the keyboard cursor, the chooser's row tap and
  its confirm all know the left plate, and the row tap passes the hand through.
- `game/renderer.js`: draws the plate and its chooser from the same helpers.
- The fight panel (`game/fight-panels.js`) already lists the left hand as
  `WEAPON [LEFT]`, a two-hander in both rows. It is not in this slice's touches
  and needs no change.

## Acceptance

1. GEAR shows a left-hand plate; equipping from it puts the item in the left
   hand.
2. Two-handers still fill both hands.
3. The fight panel shows the left-hand item.
4. Screenshot at 3440x1440 of GEAR and the fight panel with a left-hand item.
5. `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

## Rulings it rests on

None. The loop approved it under the standing delegation (no new name, copy or
tuning number).

## Out of scope

- Making the right-hand (`weapon`) plate tappable; weapon swaps for it stay on
  the ITEMS tab.
- Any change to what the left hand does in a fight.
- The fight panel, which already shows both hands.
