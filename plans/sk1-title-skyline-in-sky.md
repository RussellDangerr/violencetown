# sk1 — the title screen's skyline stays inside its sky

## Goal
On the title screen the city skyline is drawn in a sky that runs from x=24 to x=296
on the 320x220 splash canvas. The rows of buildings loop until they pass the sky's right
edge and draw their last building whole, so it pokes 6-8 px over the panel's right
border. Keep the skyline inside its sky: same buildings, same windows, same moon.

## Acceptance checks
- No skyline pixel (far row, near row, windows, moon, ground line) is drawn right of
  x=296 or left of x=24; a test records the rects `_drawSplashCityscape` draws through a
  stand-in context and asserts it.
- The frame's right border is fully visible on the title screen.
- "PRESS SPACE OR CLICK BELOW" has at least 2 px clear above and below it, measured from
  the font's real glyph boxes. If it already does, it stays put and the report says so;
  if not, it is nudged and the spot is flagged for his eye.
- The TV opening still plays into the title as TV1 built it.
- Evidence: a 3440x1440 frame of the title screen, plus a zoomed crop of the right edge.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

## How
Every skyline fill goes through one small helper that keeps only the part inside
x=24..296, so the last building of each row is cut at the edge. Buildings that already fit
are drawn exactly as before.

## Rulings it rests on
None.

## Out of scope
Any title-screen words, the TV opening, the panel art, the composition of the skyline.
