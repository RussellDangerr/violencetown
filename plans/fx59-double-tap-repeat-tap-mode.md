# FX59 - double-tap Space repeats your last action in tap mode too

## Goal
HOW TO PLAY promises that tapping Space twice quickly repeats your last wheel action. In hold
mode it does. In the default tap mode it does not: the first Space already opened the wheel and
left it open, so the second Space arrives while the wheel is up and drills into Fight. Result:
the wheel sits open on Fight and the enemy is unhurt.

## The fix
When the wheel was opened by a bare Space tap, and a second Space arrives inside the existing
double-tap window with no other key between, it repeats the last action instead of drilling.
The window length (250 ms) is the existing number and does not change.

## Acceptance
- Tap mode: Space then Space within the window repeats the last wheel action.
- Hold mode keeps working as it does today.
- A single Space still opens the wheel; a second Space after the window, or after any other key,
  still drills the wheel as before.
- A test drives both modes with real keydown/keyup events through main.js's own listener and
  shows the enemy takes the repeated hit.
- npm test, balance:check, the naming grep and autoplay:check all pass.

## Rulings
None.

## Out of scope
The window length, the hold-mode flow, any copy, and the touch/gamepad openers (they never
used the double-tap).
