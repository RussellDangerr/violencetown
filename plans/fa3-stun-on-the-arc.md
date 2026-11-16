# FA3 — a hammer's Stun gets a slot on the fight arc

## Goal
The arc shows the move your weapon owns, whichever it is: Cleave, Spin or Stun. Since FA2 the
arc followed the weapon but left Stun off, so a hammer or pipe had no way to use its move from
the arc. Stun becomes one more attack slot, placed right after Hit, found on the wheel's live
Melee ring like every other slot.

## Acceptance
- With a hammer or pipe the arc shows a Stun slot, and that slot fires the stun attack.
- Other weapons' arcs are as FA2 left them (sword: Cleave; two-handers: Spin; the rest neither).
- Attack slots stay numbered 1..n with no gap; Eat and Run stay on slots 9 and 0.
- Evidence: a 3440x1440 frame of the arc with a hammer.
- npm test, balance:check, naming grep and autoplay:check pass.

## Rests on
FA3R1, pick (a): the arc shows your weapon's own move, whichever it is. Uses the wheel's
existing Stun label; no new name or number. FA2 (slots follow the weapon); EA1 (Eat and Run).

## Out of scope
Slot positions and look, new copy, any change to how Stun resolves.
