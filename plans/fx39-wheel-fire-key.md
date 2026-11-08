# FX39: the key that fires a wheel action stops there

## Goal
Firing a wheel action (Thieve on Praline, found 2026-10-26) with a direction key must not
also bump or talk to the person beside you. Today the Down press that points the reticle
and fires the action also leaves Praline's Talk dialogue open.

## Cause (reproduced on dev a3ad38c before the fix)
The keydown handler records every direction key in `_physicalHeld` before it looks at the
game state. The wheel branch then fires the action, `_closeWheel` runs, and `_closeWheel`
calls `_resumeHeldWalk`, which sees that same key still "held" (its keyup has not come yet)
and walks into the townsperson: a bump, which is Talk. The resume on wheel close exists on
purpose, for a direction held through the wheel; nothing accounted for the key that drove
the wheel itself.

## Fix
In the wheel's keydown branch (`game/main.js`), a direction key pressed while the wheel is
open is consumed by the wheel: it is dropped from the held sets, so closing the wheel does
not resume a walk from it. A direction held before the wheel opened is untouched.

## Acceptance
- Firing Thieve (or any wheel action) beside a townsperson leaves no dialogue / bump.
- A later, separate key press still bumps or talks as before.
- The test sends real key events through the real `_bindInput` listener and the real wheel
  methods (`tests/wheel-fire-key.test.js`).
- `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

## Rulings
None needed: nothing a player reads changes except the bug going away.

## Out of scope
Held-key repeat after the wheel closes; the touch/pointer paths; any wheel copy or layout.
