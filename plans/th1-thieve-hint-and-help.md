# th1: the game tells a new player where Thieve lives

## Goal

The only mention of picking a pocket today is the blind-spot hint, which never
names the Thieve verb or says it sits under Trick. Help has no Thieve line
either. This slice adds the two places a player can learn it, both as obvious
placeholder lines so the wording is chosen later.

1. A second hint row, placed right after `blindSpot` in `game/hints.js`. It
   fires once the player is unseen and standing beside someone who has
   something to take, using the same `takeable()` the wheel greys its Thieve
   slices on. The existing pacing gap (`HINT_COOLDOWN_TURNS`) puts it a few
   turns after the blind-spot line. Like every hint it shows once and is then
   remembered.
2. One new bullet under "Combat & actions" in the Help modal in
   `game/index.html`.

The `blindSpot` text and id are left exactly as they are.

## Acceptance

- Unseen beside a townsperson who has gold: the blind-spot line appears first,
  unchanged; after the pacing gap the placeholder line appears once, never again.
- Beside someone with nothing to take, or while seen: the new hint does not fire.
- Existing hint tests pass with their assertions unchanged. New tests live in a
  new file, `tests/th1-thieve-hint.test.js`.
- Help shows one new placeholder bullet and still opens and closes with `?` and Esc.
- Screenshots at 3440x1440 of the log with the hint and of the Help modal.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

## Rulings

None. The card was approved by the loop. Every new line is a `[TEXT]`
placeholder, listed for Caelan to word.

## Out of scope

- The one-line reason on the grey Thieve wedge (new on-screen copy and a ring
  layout change; its own card).
- Any real wording. Folding the two hints into one is a matter of deleting a row.
- `tests/hints.test.js` is not edited; nothing there needs to change.
