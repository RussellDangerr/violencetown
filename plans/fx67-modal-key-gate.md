# FX67: game keys stop at the Options window, the help window and the key screen

Goal: with Options, the help window or the key screen open, direction, Space and action keys
do not reach the world. The hero stays put and no turn passes.

Cause: `_bindInput` gated on text boxes, pause, splash, credits and sliding, but not on these
three windows, so six real keys walked the hero two tiles behind Options.

Fix: one helper, `_keyWindowOpen()`, checked at the top of the `_bindInput` keydown listener.
It does not call preventDefault, so a focused button still takes its own Space / Enter, and
the title's Space guard (FX65) is untouched. Esc keeps closing Options and help through their
own capture-phase handlers, which run first.

Acceptance:
- keydown with each window open never reaches the world (test lifts the real listener and
  counts a probe that runs right after the gate);
- with none open, the same keys do reach it;
- typing in the save-code box still types; Esc still closes the windows.

Out of scope: closing the key screen with Esc, any new copy, the Remoticon and menu sheet.
