# FA2 — the fight arc's move slots follow the weapon you hold

## Goal
The arc's slots were worked out once at load from the starting ring. Since WK1 swaps the
Melee ring by weapon class, a hammer's "Cleave" slot fired Stun and Spin pointed at nothing.
The arc now reads the wheel's live tree every time: it lists only moves the ring has right
now, and each slot is found by key when shown or pressed.

## Acceptance
- With a hammer or pipe no slot fires Stun while labelled Cleave; every slot fires the move it is labelled.
- Cleave shows only with a sword; Spin only with two-handers; dagger, whip, wand, pan show neither.
- Changing weapon mid-fight changes the arc's slots and their numbers.
- A test walks every weapon class's kit through the live ring by key, and presses an arc number on a stand-in fight.
- Evidence: 3440x1440 frames with a sword and with a hammer.
- npm test, balance:check, naming grep, autoplay:check pass.

## Rests on
WK1 (WKR2: a move outside the weapon's kit is not on the ring at all); FA1's rule that a
slot is a node of the wheel's own tree. No new name, copy or number.

## Out of scope
Whether Stun gets its own slot (FA3R1). Slot positions, look, copy.
