# pc5-meta-plain-copy

## Goal
Coming back, the credits, bones and save messages stop showing the `[TEXT]` placeholder. Each
line says plainly what the thing is, what it does and what the player should do about it.

## Acceptance
- No `[TEXT]` left in away.js, credits.js, bones.js or save.js.
- The away news lines say time passed and that nothing in the save changed. The rested line says
  what the buff does; its numbers are read from `RESTED_BUFF`, not retyped.
- Each credits card says what it is for. Bones lines say whose remains these are and what they
  hold. Save messages say what happened to the save.
- The tests that pinned `[TEXT]` (away-news, credits, bones, save-code) pin the new lines instead,
  in their own commit. No assertion is weakened or removed.
- npm test, balance:check, the naming grep and autoplay:check pass.

## Rulings
- PCR1 (a): plain, deadpan lines; `[TEXT]` never reaches a player; creative writing stays the
  owner's. Every new line is listed for him to replace.
- PC5R1 (b): the intro and finale belong to another slice; finale-setpiece.js and tv-intro.js
  are not touched.

## Out of scope
The intro and finale copy, any new mechanic, any tuning number.
