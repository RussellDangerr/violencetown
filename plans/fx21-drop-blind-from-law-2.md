# FX21: the rulebook stops mentioning a Blind debuff

## Goal

Law 2 in `plans/balancing-bible.md` says Guard and a "Blind" debuff compose in the same damage
call. The game has no Blind debuff. Take Blind out of that line so the rulebook only describes
what exists. Guard stays, and the sentence still reads cleanly with Guard alone.

## Acceptance checks

- Law 2 no longer mentions Blind; Guard's part of the line is unchanged.
- No other line in `plans/balancing-bible.md` claims a Blind effect exists.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

## Ruling it rests on

"The rulebook mentions a Blind debuff the game doesn't have: planned, or cut?" Caelan picked
**cut it**: take the line out of Law 2. Blind can come back later as its own idea.

## Out of scope

- Any game code. This is a docs-only change, so there is no testable logic and no new test.
- Other files that might mention blindness.
- Designing a Blind debuff.
