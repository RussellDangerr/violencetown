# FX42: examining bare floor logs one line instead of opening a panel

## Goal

Pressing E at plain ground with nothing on it currently logs the tile's name
line and also opens an inspect panel ("Floor") that needs a key to close. After
this slice that case logs the same line and opens nothing. Anything with
something to say keeps its panel exactly as today.

## What counts as bare

Bare means the last two rungs of the examine ladder in `game/examine.js`
`resolveExamine`:

- the tile's own name line (Floor, Sludge, Factory floor, Green tent, ...), and
- the off-map line.

Everything above them is not bare and keeps the panel: an authored instance, a
living creature, a container, an item on the ground, a prop with a name.
A quest hint appended by `questExamineHint` also counts as something to say, so
bare ground that gets a hint keeps its panel too.

## How

- `resolveExamine` marks those two results with `bare: true`. Nothing else about
  the result changes, and the log line is today's body text (no new words).
- `doExamine` skips `_openInspect` when the result is bare and no quest hint was
  added. It still logs the line, still emits quest events, still grants.
- `game/main.js` needs no change: the E listener already calls `doExamine`.

## Acceptance

1. E on bare ground logs one line and opens nothing.
2. E on anything else behaves as today.
3. A new test (`tests/examine-bare-floor.test.js`) presses E with real keydown
   events through main.js's own listener (the lifted-method pattern used by
   `tests/taxi-at-bridge.test.js`), on bare ground and on something examinable,
   and checks the log line and whether the inspect panel opened.
4. `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

## Rulings it rests on

- FX42R1 (picked: a): the old assertion in `tests/examine.test.js` that bare
  ground opens one panel changes to expect none, in its own commit, because this
  card changes that behaviour. The log-line assertion beside it stays.

## Out of scope

- The Target List / tap examine path (`main.js` `_fireResolver`) still opens the
  panel; the card is the E key only.
- No new copy: the one line is the existing body text.
