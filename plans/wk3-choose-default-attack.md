# WK3 — you choose your default attack

## Goal
Your weapon's move stays what a tap uses (WK2) until you choose another. You
choose on the wheel: hold a Melee move and it becomes your default, marked with a
star. The choice is saved.

## Rulings it rests on
- WKR4 (pick a): choose on the wheel; hold a move to make it the default, and it
  gets a star.
- WK2 (merged): a tap uses the weapon's own move.
- WKR3: the default hit and the plain hit are the same thing.

## How
- The choice is `{ weaponId, key }`, kept on the game and in the save (left out of
  the save while there is none).
- It holds only for the weapon it was starred on and only while that move is still
  on the Melee ring. A different weapon in hand puts that weapon's own move back
  and clears the choice.
- Gestures: a held press on the dial's drill quadrant while a Melee move is
  highlighted (a quick tap still drills on release); `F` on the keyboard.
- A tap, `E` and a bump use the chosen move through the same path WK2 built.
- The star is a placeholder mark, `[*]`, on the slice.

## Acceptance
- Any Melee move on your ring can be made your default; tapping an enemy uses it.
- The choice survives a save and reload.
- Swapping to a weapon without that move falls back to the new weapon's own move.
- 3440x1440 screenshot of the wheel showing the default.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

## Out of scope
Spells and tricks as the default (Melee ring only); enemies using your default;
the star's final look and any copy; a hold gesture for every input device beyond
pointer and `F`.
