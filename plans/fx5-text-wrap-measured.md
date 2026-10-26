# Text wraps to the space it really has

## Goal

Five places in `game/renderer.js` still decide how much text fits by allowing 8 px a letter,
a leftover from the retired 8x8 bitmap font. The UI font is VT323 now, which is about 4.8 px a
letter at scale 1, so these places cut or wrap text with roughly 40% of the space still empty:

- the dock's quest log (objective line and the message feed);
- the YOU panel in a fight;
- the target panel in a fight;
- the QUESTS tab of the Remoticon (stage checklist and witness log);
- the inspect panel's body.

Each one now measures the text with the font (`this.font.measure`), the way the offer screen
and the item description already do, and cuts or wraps against the real pixel width.

## What stays the same

- A cut line still ends in `~`, as these five places do today; only where the cut falls moves.
- Word wrapping keeps its rules: break at spaces, never inside a word.
- Line heights, panel sizes, colours and scales are untouched.

## Acceptance checks

- None of the five places divides a width by 8 any more.
- DEFENCE POITION, CARDBOARD CUIRASS and GREY GREAT SWORD show in full in the fight panels.
- The quest-1 finale line in the dock log runs to the panel's edge instead of stopping halfway.
- `tests/text-wrap.test.js` pins the cut and the wrap against measured widths: a cut line never
  measures wider than its room, and a line is cut only when the whole text does not fit.
- Before and after shots at 3440x1440 of the two fight panels and the quest log.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` pass, with no autoplay drift.

## Rests on

- The board card for this fix, tweaked from the scout's defect report under the loop's standing
  delegation. No new names, copy or numbers are added.

## Out of scope

- The other fixed-width idioms (`slice(0, 5)` on buff chips, headers that are never cut).
- Changing the cut mark, shrinking text to fit, or making any panel larger.
