# A test that measures every tap target on a phone

## Goal

Before the phone work moves anything, have a measuring stick. One test file walks
every tap target the game's layout code produces (the dock, the item bar, the
wheel and the menus), turns each into CSS pixels the way the browser shows them,
and pins the targets that come out under 44 CSS px today. Later phone slices may
only shorten that list.

Nothing changes on screen. The only output a person sees is the table the test
prints.

## How it measures

- Screens: 375x812 at DPR 2 and 390x844 at DPR 3 (the two phones), and 3440x1440
  at DPR 1 (Caelan's desktop). Each goes through `computeViewport` with `DOCK`,
  exactly as `main.js` builds the live viewport.
- A rect's CSS size is its logical size divided by `vp.logicalPerCss`. HUD rects
  come from `hudLayout(vp)` in screen space; menu rects live in the 608 menu box
  and convert the same way, since the box is drawn at the viewport's scale.
- A target's size is its **drawn** rect's shorter side, without `HIT_SLOP`. The
  slop-grown size is printed beside it for reference.
- Targets that repeat (50 bag slots, 6 offer rows) are one entry each, taking the
  smallest instance.
- The wheel's targets are its hub (a disc, measured by its diameter) and the
  compass band at each depth: from the hub's edge out to the active ring's outer
  edge, measured radially.

## Acceptance checks

1. The walker finds every target kind it is meant to find at every screen, and
   finds more than zero (a walk that finds nothing must not pass).
2. At each phone size, the targets under 44 CSS px are a subset of a pinned
   known list. A known target may grow or leave the list; it may not get smaller,
   and no new target may join.
3. At 3440x1440 the full table is pinned as it is today, so phone work cannot
   move the desktop.
4. `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

## Rulings it rests on

- On a phone, how many tiles wide should the world be: picked "about 14". That
  slice grows every target; this test's pins allow growth.
- On a phone, how should menus and the dock grow to fit a thumb: picked
  "full-screen sheets, every row and button at least 44 tall". The known list
  here is what that work has to empty.

## Out of scope

- Changing any layout, size or game code. If measuring needed a game change,
  this slice would stop instead.
- The page's HTML buttons (they are not canvas rects and already reach 44).
- The dialogue window's rows: they are sized at draw time inside the renderer,
  not in `layout.js`, so there is no pure function to measure. A later slice can
  expose them.
