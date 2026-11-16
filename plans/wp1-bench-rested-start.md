# WP1: quit beside a bench, come back an hour later, start rested

## Goal
If you leave the game standing in the Town beside a bench (a spot you can rest) and return after
at least an hour away, you come back with one short strength buff and one log line. Anywhere else,
or under an hour, nothing happens.

## Acceptance
- Beside a Town bench plus an hour or more away: the rested buff and one log line.
- Anywhere else, or under an hour: nothing.
- One fixed buff per return; five long absences in a row never give more than that one buff
  (the buff refreshes, it never stacks).
- Being away costs nothing: no item, gold, HP, MP or quest change beyond the buff.
- Tested through the real save, a moved clock and the real read path, not only the helper.
- The autoplay's virtual clock gives 0 hours away, so its run does not change.
- Evidence frame at 3440x1440 right after returning.

## Rulings it rests on
- WP1R1 pick a: "beside a Town bench" means the same spots you can rest (HP1's bench, tile 20), Town only.
- WP1R2 pick a: the reward is a short strength buff, the strength Poition's numbers (6 for 5 turns).
- CK1: hours away are read once from the save's savedAt, and the one-hour threshold is CK1's.

## How
- `game/away.js`: `besideBench`, `restedOnReturn` and the placeholder constants.
- `game/main.js`: after the hours are read (load, or the tab coming back), call it once.
  On a load it runs after the save is loaded, so the buff is not overwritten by the restored buffs.
- Placeholders: the buff name and the log line are `[TEXT]`; the numbers are the Poition's, unchanged.

## Out of scope
Banking a bigger bonus for longer stays, zone attunement, the unworn-mask form, other zones.
