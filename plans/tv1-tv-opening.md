# TV1 — the game opens like a TV switching on

## Goal

When the game starts, the title screen does not just appear. The screen plays a short opening
first, like an old TV warming up, and then lands on the existing title screen with GAME START.

## What plays (ruling TV1R1, pick b)

1. Black.
2. A thin bright horizontal line across the middle that grows out from a dot, like a CRT.
3. The line opens up and down into the picture. The picture is an episode title card: the game's
   name and a couple of `[TEXT]` lines (where a season / episode label will go).
4. The card holds, then melts into the existing title screen.

Under two seconds in all. No static, no colour bars. All drawn in code, nothing imported.
Every word except the game's name is `[TEXT]`.

## When it plays and how it skips (ruling TV1R2, pick a)

- Every time the game starts (every page load).
- Any key, or any tap or click on the screen, skips it straight to the title screen. The key that
  skips is spent: it does not also press GAME START.
- The save, CONTINUE and GAME START work exactly as today once the title screen is up.

## Reduce motion

With `settings.reduceMotion` on, the still title card shows at once and nothing moves (no line, no
opening, no fade), then it gives way to the title screen after a short beat. Any key or tap still
skips it.

## Gentle on the eyes

No more than three sharp brightness changes in any one second, and never a full-screen red. The
opening is built from slow ramps; a test samples every frame of it (a tiny rasteriser over the
drawing calls) and checks frame-to-frame brightness jumps and the red share.

## The autoplay

The autoplay (`game/autoplay`) clicks GAME START directly and, after a reload, presses Space for
CONTINUE. It starts from the title, so under `?autoplay` the opening is skipped, as if a key had
already been pressed. The golden does not move.

## Shape

- `game/tv-intro.js` (new, pure): the timeline (`introAt(ms, {reduceMotion})`), the drawing
  (`drawTvIntro`), and which keys skip (`isSkipKey`).
- `game/renderer.js`: `renderSplash(canvas, intro)` draws the title screen as today, plus the
  opening on top of it while one is running.
- `game/main.js`: starts the opening where the title was first drawn, redraws it each frame, hides
  the buttons while it runs, and ends it on its own time, on a key or tap, or when a button is
  pressed.
- `tests/tv-intro.test.js`: timeline, reduce motion, skip keys, flash and red checks.

## Out of scope

- Real copy, season/episode names, any sound for the opening.
- The skyline running a few px past the sky on the title screen (separate card; those lines are
  not touched).
- Any change to CSS or `index.html`.

## Placeholders for Caelan's eye

All timings, the line's brightness and the card's `[TEXT]` lines are stand-ins.
