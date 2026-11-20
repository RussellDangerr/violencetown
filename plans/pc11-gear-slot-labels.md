# PC11 — gear slots are named Top, Bottom, Front, Back and Sides

## Goal
The GEAR tab and the fight panels name the five armour slots by what the game calls them
(equipSlot): TOP, BOTTOM, FRONT, BACK, SIDES. SIDES is one slot. The two hands read
WEAPON RIGHT and WEAPON LEFT, with no brackets, and the chooser title built from a plate's
label follows ("WEAPON RIGHT — CHOOSE").

## Mapping (by slot key)
- top: HEAD -> TOP
- sides: ARMS -> SIDES
- front: TORSO -> FRONT
- back: BACK -> BACK (unchanged)
- bottom: FEET -> BOTTOM
- weapon: WEAPON [RIGHT] -> WEAPON RIGHT
- left: WEAPON [LEFT] -> WEAPON LEFT

## Acceptance
- game/layout.js plates and game/fight-panels.js rows carry the new labels.
- Old test pins are re-pinned exactly to the new labels, in their own commit.
- A new test (tests/pc11-gear-slot-labels.test.js) pins every label in both places and that
  no old label survives in either.
- Plain-copy guard counts do not rise; npm test, balance, naming, limezu, autoplay all pass.

## Rests on
PCR3 pick a (2026-11-17): plain, bracket-free player text; slots named Top/Bottom/Front/Back/Sides.

## Out of scope
- The bracketed empty-chooser note "[No ... gear]" in the renderer (separate copy pass).
- Slot ids, perks, art, layout geometry.
