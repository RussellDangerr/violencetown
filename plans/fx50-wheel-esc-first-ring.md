# FX50: Esc on the wheel's first ring closes it; the hint says when Esc only goes back

## Goal
Esc at the wheel's first ring closes the wheel. In a sub-ring Esc steps back one ring, and the
on-screen hint must say that instead of claiming it closes the wheel. Reopening starts at the first ring.

## Found on dev before building
- Behaviour already shipped: `_wheelBack` calls `back()`, which pops a ring or returns 'close' at the
  root; `_openWheel` always resets the path to the first ring (only the first ring's last-used
  category is remembered). So Esc and reopen needed no change.
- Missing: the hint always read "ESC TO CLOSE". That is the whole change.

## Acceptance
- Esc in a sub-ring goes back one ring and the hint says so; Esc at the first ring closes.
- Reopening the wheel starts at the first ring.
- The test drives the wheel with real keys (the game's own keydown listener).
- npm test, balance:check, naming grep and autoplay:check pass.

## Rulings
None. The sub-ring hint word is a placeholder, `ESC [TEXT]`, for Caelan to word.

## Out of scope
Any change to wheel-model, key bindings, or the aim/confirm Esc behaviour.
