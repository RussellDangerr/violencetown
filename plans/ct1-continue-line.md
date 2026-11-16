# ct1-continue-line: CONTINUE shows where and when you left off

## Goal
With a save on disk, one line sits under the title buttons saying where the save was left
and how long ago. GAME START's confirm over a save shows the same line after its own
sentence.

## Rulings it rests on
- CTR1, pick (a): the zone and a duration such as "2 hours". The line's fixed words are
  `[TEXT]` placeholders until Caelan words them.

## How
- The zone comes from the save's `mapUrl` through a small table of the game's zone names;
  the age comes from `savedAt`.
- `_continueLine()` in `game/main.js` returns the line or null. No save, or a save that
  will not read, gives null: no line, no error (FX66 keeps such a save aside).
- A hidden `<p id="splash-continue-line">` in `game/index.html` is filled and shown when
  CONTINUE is shown. `style.css` is untouched; styling is inline like TP1's.
- TP1's paste button, FX65's Space guard and FX67's key gate are left as they are.

## Acceptance
- A test builds the line from a real saved game and from a broken one, and checks the
  GAME START confirm text.
- Screenshots of the title at 3440x1440 and 375x812 with a save on disk.
- npm test, balance:check, naming grep, autoplay:check pass.

## Out of scope
- Final wording; the line's placement polish; the paste-code confirm (unchanged).
