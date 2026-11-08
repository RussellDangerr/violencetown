# FX53 — the wheel's hint and the red enemy count get their own lines

## Goal

With the wheel open in a fight, two banners were drawn at the same spot, one
line above the dock (`strip - 16` in `game/renderer.js`): the gold hint
("WHEEL OPEN · MOVE KEYS STEER IT · ESC TO CLOSE") and the red enemy count
("swords, how many, nearest foe"). The count drew last, so the middle of the
hint was unreadable. Now, while both are up, the count sits on its own row
directly above the hint's row. Same words, same colours.

## What changes

- A small pure function in `game/renderer.js` decides where each banner sits:
  the hint keeps its row and its sideways rule exactly as today; the count takes
  the 26px row above it. Both centre on the screen when that clears the dial, and
  sit in the room left of the dial when it does not (the rule the hint already
  follows, so a phone keeps both off the dial).
- The count is drawn with the hint, before the dial, so its band can never paint
  over the dial.
- The count only ever existed in the open wheel (nothing draws it with the wheel
  closed), so with the wheel closed nothing moves. The AIM and CONFIRM takeovers
  still return before either banner, as before.

## Acceptance checks

1. Wheel open in a fight, at 3440x1440 and at a phone width: the hint's row and the
   count's row do not overlap.
2. The count's row clears the dial (sideways) and the dock (it ends above the hint's
   row, which ends at the dock's top edge) at both sizes.
3. Wheel closed: the count is not drawn, so nothing is where it was.
4. Evidence: frames of the open wheel in a fight at 3440x1440 and phone width,
   driven by real keys.
5. `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

## Rulings and picks

None. The count's position is the loop's call (one row above the hint), flagged for
Caelan's eye.

## Out of scope

- Any new wording, colour, or tuning number.
- Moving the AIM hint, the EXIT label hint, or the CONFIRM text.
- Changing which fights show a count.
