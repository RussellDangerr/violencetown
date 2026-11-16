# FX63: dialogue hides the faced label and stays clear of the dock

## Goal
Talking to someone should look clean. Two defects at wide screens and phones:
1. The "NAME · TALK" tag over the person you face still draws while the dialogue is open and
   pokes out above the window.
2. The dialogue window's bottom edge (592 in the 608 menu box) runs past the top of the dock when
   the centred menu box overlaps it, covering the item bar's captions and the log strip.

## Fix
- The faced-target label is skipped while the state is dialogue, and returns when it closes.
- The window's bottom edge is `dialogueBottom(vp)` (layout.js): 592, or a few px above the dock's
  top edge when that is higher. Look, size and text are otherwise unchanged; the window just
  ends higher on screens where the box overlaps the dock.

## Acceptance
- Dialogue open: no faced label; closed: label returns.
- At 3440x1440 and phone sizes the window ends above the dock, inside the menu box.
- A test opens a real dialogue with Mince (real `_openDialogue`) and reads the label rule and the
  drawn window rect.
- Evidence: 3440x1440 frames before and after. npm test, balance:check, naming grep and
  autoplay:check pass.

## Rests on
Menus sit in the viewport's centred menu box (CLAUDE.md, plans/screen-fill.md). No new rulings,
copy or numbers; the 4px gap above the dock is a placeholder margin.

## Out of scope
Other modals' overlap with the dock; reflowing the dialogue's content.
