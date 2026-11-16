# EX2: examine props on touch

## Goal
On a phone, a long-press on a tree, grave, sign or other named prop opens a list with
Examine (and the usual Cancel row). Choosing it runs the same examine ladder as the E key
(`resolveExamine`): same inspect panel, same log line.

## Rulings it rests on
- EXR1 pick (b): a long-press on a prop opens a list with just Examine; bare ground stays as
  today, so it cannot be examined on touch. The row uses the existing Examine label; no new copy.

## How it works
- `examine.js` exports `propNameAt(game, x, y)`: the plain name of the prop on a tile, or null.
- `main.js` `_propTargetAt` makes a target for a named prop only when nothing else is on the
  tile. `_targetAt` is unchanged, so a tap and the F key still ignore props.
- A press on such a tile arms the long-press with a prop flag; only that path lets
  `_openTargetList` accept a prop.
- A prop straight beside you: the long-press turns you to face it (as before) and then also
  opens the list. A quick tap behaves as before. Bare ground beside you still only turns.

## Acceptance
- Long-press on a prop with real touch pointer events opens the list; its row examines through
  `resolveExamine`.
- Tap still walks; the other gestures are unchanged.
- Test: tests/examine-touch.test.js. Evidence: a 375x812 frame after examining a tree.

## Out of scope
New copy, new verbs, examining bare ground on touch, props with no plain name.
