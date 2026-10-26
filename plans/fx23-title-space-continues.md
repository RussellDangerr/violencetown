# FX23 — Space on the title continues your save, and never opens the wheel

## Goal

The title screen says to press Space. Today that key does two wrong things:

1. With a save on disk, Space starts a **new** game (the splash keydown calls `start()`), and the
   new run's first autosave then overwrites the old save. The CONTINUE button does the right
   thing (`continueGame`); the key does not.
2. The same Space keydown carries on to the game's own keydown listener (registered after the
   splash one, on the same `document`). By then the state is IDLE, so it opens the action wheel:
   the player lands in the town with the wheel already open.

The fix, in `_bindSplash` (`game/main.js`):

- Space on the title continues the save when there is one (`continueGame`), and starts a new game
  when there is none (`start`), the same two paths the buttons use.
- The Space that leaves the title is spent there: `stopImmediatePropagation()` keeps it from the
  game's listener, so the game starts idle.
- Once the title has been left (the splash carries `gone`), further Spaces do not start a second
  run. A save loads asynchronously and the state stays SPLASH until it finishes, so without this a
  quick second Space during the load would start a new game on top of it.

## Acceptance checks

- With a save present, Space on the title continues that save: gold, bag and turn match the save.
- With no save, Space starts a new game.
- Leaving the title with Space never opens the wheel; the game starts idle.
- The tests (`tests/title-space.test.js`) drive real key events (`KeyboardEvent`-shaped events
  through a real `EventTarget` standing in for `document`) through the real splash and game
  listeners lifted from `main.js`, rather than calling `start()` directly.
- Evidence: 3440x1440 frames of the first screen after Space, with and without a save.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

## Rulings it rests on

None. The loop took the obvious fix under Caelan's standing delegation; the title already says
to press Space.

## Out of scope

- The GAME START, CONTINUE and RESTART buttons: unchanged.
- Any change to what the title shows or says.
- Enter or any other key on the title.
