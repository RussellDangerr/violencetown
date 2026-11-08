# The two no-levels docs note the use-ranks ruling

## Goal

Two design docs still say, in plain terms, that Violencetown has no XP and no levels. Since the
ruling that skills may rank up by use, that is no longer the whole story. Each line that rules out
XP or levels gets a short dated note underneath saying what changed and where to look. The
original lines stay exactly as written, so the history of the rule is still readable.

The lines:

- `plans/systems-audit-2026-08.md`, section 6: "Violencetown has no XP and no levels."
- `plans/stats-consumables-library.md`, the Origin note at the top ("no XP, no levels, ...").
- `plans/stats-consumables-library.md`, Part 1 Stats: "No XP, no level-ups, ...".

Each note says: as of 2026-10-26, skills rank up by use (each skill counts clean successes and
grants a small perk at set counts), there is still no single level number and no stat growth past
Law 0, and the details are in `plans/us1-light-fingers.md` and `game/skills.js`.

## Acceptance checks

- Each of the three lines above carries a dated note about the use-ranks ruling.
- The original lines are unchanged.
- `npm test`, the naming grep, `balance:check`, the limezu check and `autoplay:check` pass.

## Rulings this rests on

- **Skills may rank up by use** despite the written "no XP, no levels" rule: picked *yes, use-ranks
  that grant perks*. That pick said the two docs would get a dated amendment; this is it.

## Out of scope

- Any code or test change. The card says there is no testable logic.
- Rewording or restructuring the two docs beyond the notes.
- Other docs that mention levels in passing.
