# FX20 — the fight panels' titles clear the frame's gold corner

## Goal

In a fight, the two side panels (your gear on the left, the target on the right) start their
title 6 px in from the panel's edge. The panel frame's gold corner ornament reaches 10 px in
(measured from `game/assets/ui_panel.png`: the top-left 16×16 cell carries gold out to column 9),
so the first letter of each title (the Y of YOU, the first letter of the target's name) is drawn
across the gold.

The quest log already solved this: it insets its text 12 px "so text clears the ornate corners".
This slice names that inset once in `game/renderer.js` and uses it for the quest log and for the
title row of both fight panels.

## Acceptance

- The YOU title and the target's name sit clear of the gold corners.
- A test pins the title inset at least as wide as the corner, with the corner's width read from
  the panel atlas itself rather than typed in.
- Before and after shots at 3440×1440, plus a zoomed crop of each title.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

## Rulings it rests on

None. The inset is a layout constant, and the value is the quest log's existing one (12), not a
new number.

## How

- `PANEL_TEXT_INSET = 12`, exported from `game/renderer.js`. `_drawQuestLog` uses it in place of
  its local `PAD = 12`, with no change to what it draws.
- `_drawGearPanel` and `_drawTargetPanel` draw their title at `R.x + PANEL_TEXT_INSET`, and clip
  the target's name to the width left between the two insets, so a long name stops short of the
  right-hand corner too.
- The title's height and every row below it stay where they are. Away from the corner the frame's
  top edge is only 2 px deep, so the title at 6 px down already clears it, and the rows below
  never meet a corner.

## Out of scope

- The rows under the titles keep their 6 px inset (they run beside the plain 2 px side edge, not
  the corner). The title now starts 6 px further right than the rows under it.
- Any other panel's text inset.
