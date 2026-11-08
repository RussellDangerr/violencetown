# FX29: the Quests tab indents a stage's description under its location

## Goal
In the Quests tab, the current stage shows an `@ location` line and, under it, a
description. The location line is indented; the description sits flush left. The
description was written as three leading spaces, but `wrapToWidth` splits on spaces
and drops them, so its first line loses the indent (and the later lines never had one).

## Fix
Indent by x offset, not by spaces. The indent is the measured width of the three
spaces the location line already uses. The location and every wrapped description line
draw at the same x, and the description wraps to the room left after the indent.

## Acceptance
- Every wrapped description line starts at the same x as the `@ location` text above it.
- A test pins that, with a description long enough to wrap to several lines, and checks
  each line still fits the room.
- Evidence: a 3440x1440 crop of the Quests tab, opened with real keys.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

## Rulings
None. No copy, names or numbers change; only where existing text starts.

## Out of scope
The witness log, the checklist objective lines and the completed list keep their
current positions. No wording changes.
