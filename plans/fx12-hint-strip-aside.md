# The controls hint strip steps aside while a menu is open

## Goal

On a first run the game shows a one-line controls hint near the bottom of the screen (the
`#first-run-hint` page element, placed just above the dock). It is a page element, not a canvas
drawing, and nothing told it when a menu was open, so it drew over whatever menu sat behind it.
At 3440x1440 that meant the bottom frame and footer line of the Remoticon, and, with real keys,
the combat wheel: the Space press that starts a fresh game also opens the wheel, and the hint
landed on top of the wheel's footer.

The strip should step aside while a menu is open and come back when the menu closes.

## What changes

- While the game is in a menu state, the hint is hidden. The menu states are the wheel, the
  target list, the item overlay, the throw prompt, the log, the offer screen, dialogue, the
  inspect panel, the Remoticon and the death screen, plus the pause overlay.
- When the menu closes, the hint shows again, as long as it has not been dismissed yet.
- An input that lands while the hint is stepped aside no longer dismisses it. Before, the Esc
  that closed the wheel would also have dismissed the hint, so a player who started with Space
  would never see it. The hint's six-second clock now runs only while it is on screen; a menu
  pauses it and closing the menu starts it again.
- No copy, position or styling of the hint changes.

## Acceptance

- With the Remoticon (or any menu) open, the hint strip does not cover its frame or footer.
- The hint returns when the menu closes.
- Before and after shots at 3440x1440, driven by real key presses.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

## Rulings it rests on

None beyond the card itself (the loop tweaked the scout's defect into this slice under the
standing delegation). No names, copy, tuning numbers or art are added; the existing six-second
hint duration is kept as it is.

## Out of scope

- Moving the hint or the menu box so both fit.
- Changing what the hint says, or when it first appears.
- The page-level help and options modals: they already sit above the hint with their own backdrop.
