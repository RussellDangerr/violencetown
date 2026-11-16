# EX1: a faced note, sign or wreck shows an Examine label

## Goal
Facing an authored examinable (the Town fuel note, the canyon wreck, a road sign) draws the same
label strip a faced creature gets: its name and the Examine verb, in the Examine verb colour.

## Acceptance
- The strip appears over the faced examinable's tile, named the way `examine.js` already names it
  (the id, underscores as spaces). No new copy.
- Nothing else changes; a faced creature still labels the creature (a creature on the tile wins).
- `tests/examine-label.test.js` walks to the Town fuel note with real keys and reads the label.
- Evidence: a 3440x1440 frame of the label at the fuel note.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

## Rests on
EXR1 (ruled), EX2 (touch Examine, merged on dev).

## Out of scope
Labels for plain props with no authored examinable; touch behaviour; any wording or colour change.
