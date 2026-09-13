# Feature: The screen fills the window — one viewport, a bottom dock, and a world that never ends

**Phase:** Design → Development.
**Priority:** High (Caelan, 2026-09-11: *"I think we're still using the area poorly."*).
**Status:** Built on `feature/screen-fill` (stages 1–3, 2026-09); awaiting Caelan's merge call.
**Companions:** `plans/visual-pass.md` Part 3 (the whole-pixel canvas; this keeps its rule and
drops its square) · `plans/roadmap-2026-09.md` (where the follow-on pieces queue).
**Mockup:** `game/_design-screen.html` — local only (`.gitignore:88`), served by
`python dev-server.py 3001` at `/_design-screen.html`. It draws Town with the real renderer and has
every choice below as a control: the rule slider, six screens, the forest filler, three HUD layouts,
the wheel at each depth, and the dial/tower backing.

> **Decisions (Caelan, 2026-09-11 to 2026-09-13):**
> - **Use the whole window, for the world.** *"Could we space it out to scale to the size of the
>   device/window and always show the amount of map they have for the device?"* Chosen over bigger
>   tiles alone and over keeping the square with side panels.
> - **Pokémon-style.** *"Ideally I design the world Pokémon-style, where the actual map is far
>   larger than the playable area."* So: you stay centred, and past the map's edge the game draws a
>   filler — the world never visibly ends.
> - **The rule: at least 20 tiles along the screen's short side.** On his 3440×1440 monitor that
>   is 64px tiles; on a 1080p monitor, 48px.
> - **A bottom dock, with the wheel in it.** *"The wheel needs to be part of the dock for the sole
>   fact that it's too see-through to see on the changing background behind it."*
> - **The wheel's backing is a round dial.** Chosen over a rectangular tower and over shrinking
>   the wheel.
> - **Built as one viewport, in three stages** (approach A), chosen over moving the HUD into HTML
>   and over only offsetting today's panels.
> - **The screen goes first** of the four pieces his 2026-09-11 notes opened; the rest queue behind
>   it (*Follow-on pieces*).

---

## Why: what is there today

- **The world is a fixed 19×19-tile square**, and has been since the first sewer demo (v0.4.0,
  `ce64746`: `VIEW_TILES = 19`, `CANVAS_PX = 608`). `main._fitCanvas` sizes it to the window's
  *shorter* side, snapped to whole art pixels (`canvas-fit.js`), capped at 1024 CSS px. The
  cobblestone around it (`9f9ae7a`) dresses the gap; it does not use it.
- **On Caelan's monitor it is under a fifth of the screen.** 3440×1440 at DPR 1: the cap and the
  snap give a 912px square, 17% of the screen.
- **The HUD is stacked inside that square**, which is the "log sits higher than the button"
  complaint: the log (`QUESTLOG_RECT`, y 436–498) has to sit above the item bar (y 510–592), and
  the wheel (`RADIAL_CENTER` 477,416) takes the bottom-right, because three panels cannot share
  the bottom of a 608px square.
- **The square is assumed in 145 lines:** `VIEW_TILES`, `CANVAS_PX`, `CANVAS_INTERNAL_PX` or `half`
  appear on 123 lines of `renderer.js`, 14 of `main.js`, 4 of `layout.js` and 4 of
  `canvas-fit.js`.
- **The maps are small** — interiors 12×12, Sewer 20×20, Town 34×26, Carnival 58×22 — so near an
  edge, up to half of today's view is void (Caelan's screenshot at Town's south edge).
- **The wheel is hard to read on a busy background:** apart from the selected wedge, its wedges
  are drawn at 0.22–0.5 alpha by design, over a 0.32 scrim, over whatever tiles are behind it.

---

## The design

### 1. The screen and the camera

- **The game fills the window.** The canvas's CSS size is the window; its backing store is the
  window × DPR. No cap, no cobblestone band.
- **One rule picks the tile size.** `k = max(1, floor(shortSideDevicePx / (16 × 20)))` is the
  number of screen pixels per art pixel; a tile is `16k` screen pixels. The largest scale that
  still fits 20 tiles along the short side. Re-evaluated on resize, orientation change and DPR
  change (the existing one-shot `matchMedia` trick in `main.init`).

  | Screen (device px) | Tile | Tiles on screen (before the dock) |
  |---|---|---|
  | Caelan's monitor, 3440×1440 | 64px | 53.8 × 22.5 |
  | 1080p, 1920×1080 | 48px | 40 × 22.5 |
  | 1440p, 2560×1440 | 64px | 40 × 22.5 |
  | Laptop, 2880×1800 | 80px | 36 × 22.5 |
  | Phone upright, 1170×2532 | 48px | 24.4 × 52.8 |
  | Phone sideways, 2532×1170 | 48px | 52.8 × 24.4 |

  Tiles cut off at the screen's edges are drawn. There is never a size between two steps on one
  screen: 56px tiles on 1080p would put art pixels back at uneven widths, the defect
  `plans/visual-pass.md` Part 3 fixed.
- **You are always centred** in the world area — the screen above the dock. No camera stops at
  map edges. This keeps today's model ("the player is the view's centre") everywhere it is
  assumed.
- **Past the map's edge, each map names a filler.** A new optional map-JSON field:

  ```json
  "border": { "tile": 13, "prop": "tree" }
  ```

  `tile` is drawn on every off-map cell; `prop`, if given, is a `PROP_SPRITES` key drawn on every
  off-map cell and joins the depth sort like any map prop. No `border` keeps today's void. This is
  drawing only: `getTile` still reports WALL off the map, so the edge stays unwalkable, and zone
  exits at the edge keep their arrows. Proposed defaults (Caelan's to change):

  | Zone | `border` |
  |---|---|
  | Town, Carnival, Downtown | `{ "tile": 13, "prop": "tree" }` — forest (GRASS + tree) |
  | Graveyard, Wilderness | `{ "tile": 52, "prop": "tree" }` — dead forest (DEAD_GRASS + tree) |
  | Sewer | `{ "tile": 0 }` — its brick (WALL) |
  | Factory | `{ "tile": 41 }` — FACTORY_WALL |
  | Canyon | `{ "tile": 0 }` — its wall (WALL) |
  | Bank, Casino, Diner, Borgir | none — black, as Pokémon interiors are |

- **A known consequence:** you see much more of each map at once (on Caelan's monitor, all of
  Town's width), and watchers from further away. Accepted — it is the point.

### 2. The HUD

- **Three spaces.**
  - *The world* — the tile grid above, sized by the viewport.
  - *The HUD* — pinned to the screen's edges and corners.
  - *Menus* — the Remoticon, the offer screen, dialogue, log history, the target list, the item
    overlay, inspect and the ending screen keep their current 608×608 layouts, drawn in a box of
    that size centred on the screen and kept on it. (It fits on any screen whose short side is at
    least 320 screen px: the rule then guarantees 640 logical px along it.) Their layout code does not change shape. The throw-direction
    prompt, which belongs to where you stand, is drawn around your screen position instead.
- **The HUD scales with the art**, as it does today: the same size relative to the tiles. On
  Caelan's monitor that is twice the logical size (u = k/2 = 2 screen px per logical px); on 1080p,
  1.5×.
- **The dock** — a full-width strip along the bottom, about 100 logical px tall (about 3 tiles on
  Caelan's monitor), in the panel material:
  - *Left: the log*, widened to fill the space up to the item bar: header (zone, time), the
    objective, and **three** message lines instead of two, with its character budget computed
    from its real width. Today a line holds about 40 characters before `~`; this gives about 85 on
    Caelan's monitor and 55–60 on 1080p.
  - *Centre: the item bar*, unchanged, centred on the screen.
  - *Right: the wheel's home.* Closed, a ✦ button: a click or tap opens the wheel, and Space still
    does. Open, a **round dial** rises out of the dock — opaque, in the dock's colours with the
    gold rim — and the wheel draws on it, never on the world. The dial is centred on the wheel's
    hub; its radius is the wheel's largest reach at the current depth plus 12 logical px, and it
    eases to a new size with the wheel's existing drill pop (under Reduce Motion it snaps). The
    hub sits low enough that the BACK tile ends inside the dock. Reach, measured from the real
    `_drawWheel`'s pixels on 2026-09-11 (logical px from the hub):

    | Depth | Up | Down | Sides |
    |---|---|---|---|
    | Open (root) | 103 | 55 | 56 |
    | Fight › | 135 | 87 | 88 |
    | Fight › Melee › (a leaf) | 135 | 119 | 120 |

  - **The full-screen scrim goes.** The wheel no longer darkens the whole screen while open — the
    dial gives it its backing, and the world and the fight stay visible while you choose. In a
    fight, the dial's rim turns red instead (the wheel's combat re-skin moves onto the dial).
  - *Above the dock:* the strips that sit on the screen's bottom edge today — the combat banner
    (`⚔ 2 RAT`), the aim and confirm hints, the zone-exit label and the first-run hint — sit on
    the dock's top edge.
- **The corners.** Top-left: the HP panel, unchanged. Top-right: ☰ and ▤ (still page buttons),
  with the buff bar beside them. The version badge moves into the ☰ menu sheet; its bottom-right
  spot is under the dial now.
- **Phones held upright.** The dock gets a second row: the log on top, the item bar and the ✦
  below. The separate touch ✦ (`#action-btn`) retires — the dock's ✦ replaces it — and so does the
  184px band `style.css` reserves under the canvas for touch controls. The game uses the whole
  screen, clear of the notch and the home bar (`env(safe-area-inset-*)`).
- **A fix along the way.** At the wheel's deepest level the ▼ pointer is drawn over the "▲ FIRE"
  cue (both sit about 135px above the hub when the selection is a leaf). It is in the live game
  too; the FIRE cue moves clear of the pointer.

### 3. How it is built and checked

**The viewport** — one new pure module, `game/viewport.js`, with no DOM, node-testable like
`perception.js` and `canvas-fit.js`. Given the window's CSS size, the DPR and the safe-area insets,
it returns:

- `k` (screen px per art pixel) and `u = k/2` (screen px per logical px);
- the screen in logical px, and the tiles across and down;
- the dock's rect, and whether it has two rows;
- the world area, and your screen position within it;
- the dial's home and its radius at a given depth;
- the menu box's origin;
- screen ↔ tile conversions for taps.

Every draw call and every tap asks it. It replaces `canvas-fit.js`'s `pickCanvasCss`, the
`VIEW_TILES` / `CANVAS_PX` / `half` assumptions in `renderer.js` and `main.js` (among them
`_canvasLocalCoords` and `_screenToTile`), the fixed `SS = 2` supersample, and the fixed HUD
positions in `layout.js` (`QUESTLOG_RECT`, `xmbBarLayout`'s anchor, `RADIAL_CENTER_*`). The menu
rects in `layout.js` stay; they are offset by the menu box.

**Three stages, each ending in a game that works:**

1. **The viewport goes in, and nothing moves.** A *classic* setting reproduces today exactly — the
   square sized by today's rule, 19×19, today's HUD positions. Every draw and tap goes through the
   viewport. **Proof:** the full suite, plus a recording of every canvas draw call in three fixed
   scenes (Town idle, a Sewer fight with the wheel open, the Remoticon open), identical before and
   after with the clock frozen. Classic mode is scaffolding for this proof; it and its recordings
   are removed when stage 2 lands.
2. **The screen fills, and the fillers appear.** The HUD pins to the corners as it stands (the
   mockup's *Corners* layout): HP top-left, buffs and ☰ ▤ top-right, the log bottom-left, the item
   bar bottom-centre, the wheel bottom-right. This proves the flexible screen before the HUD
   changes shape. **Proof:**
   - the rule unit-tested on the six screens in the table above;
   - a tapped tile is the tile you walk to, at three window sizes;
   - menus open centred and their taps land (the offer screen, the Remoticon);
   - every map's `border` names real art (joins `tests/tile-coverage.test.js` /
     `tests/prop-coverage.test.js`);
   - frame time: measure today's frame (Town at night, a Sewer fight) before stage 2; at
     3440×1440 the same scenes must stay under 16ms a frame on Caelan's machine. If they don't,
     the fallbacks are to cache the tile layer between camera moves and to draw the lighting and
     arena passes at half resolution.
3. **The dock and the dial.** The widened three-line log, the ✦ button, the dial with its red
   fight rim, the scrim removed, the strips moved above the dock, the phone's two-row dock, the
   touch ✦ retired, the version badge moved, and the FIRE cue fix. **Proof:**
   - the HUD non-overlap invariant (`tests/hud-layout.test.js`) rewritten for the dock and checked
     at 1080p, 3440×1440 and a phone upright;
   - the dial's taps use the same centre and radius as its drawing (one function for both, as
     `layout.js` does for tap targets today);
   - a fight played through with the wheel at every depth;
   - the phone checked at the Browser pane's mobile size.

**Tests that will need updating:** `canvas-fit.test.js` (superseded by `viewport.test.js`),
`hud-layout.test.js`, `xmb-layout.test.js`, and every test that builds a renderer with `half: 9`
(`tile-render.test.js` among them) — those keep working in stage 1's classic mode and move to the
viewport after it.

**Prerequisites.** Merge `feature/ready-builds` and `feature/combat-legibility` into dev first:
`ready-builds` changes `main.js` (76 lines) and `renderer.js` (38) — the same drawing and input
code this rewrites — and `combat-legibility` touches `main.js` (7). `feature/diagonal-prototype`
(2026-06-14) also touches `main.js` (40 lines); it has sat unmerged since June — Caelan's call
whether it is parked or folded in first.

**Where.** This spec lives on dev. The build goes on a feature branch off dev after those merges.

**Risks.**
- *Speed.* On Caelan's monitor each frame draws about three times the tiles and pixels of today.
  Stage 2's frame-time check is there to catch it early.
- *Phone viewports.* Size from `innerWidth` / `innerHeight` (or `visualViewport`), not CSS `vh`,
  which mis-measures on iOS.
- *Tap drift.* The reason the viewport is one module: drawing and hit-testing read the same
  numbers.
- *The threat field grows with the view.* It is rebuilt per turn over every tile in view
  (`_drawThreatOverlay`), so about 1,100 tiles on Caelan's monitor instead of 361. That is cheap per
  tile, and follow-on piece 1 redesigns that overlay anyway.

---

## Out of scope

- The fight area as fog of war, hit-splat art, and who gets pulled into a fight — the follow-on
  pieces below.
- Menu redesigns — the menus keep their layouts inside the centred box.
- A zoom setting, and a width cap for ultrawide screens. Both are easy later, because the rule is
  one number.
- Generated decoration (scattering trees and rocks by rule through a hand-made map). The filler is
  the simplest version of it.
- Reskinning panels with Kenney UI art. Kenney's 16px pixel UI packs (*UI Pixel Pack* and *UI
  Pack – Pixel Adventure*) do exist and were surveyed on 2026-09-11, but Caelan named the current
  HP panel the best-looking thing on screen, so the chrome stays.

## Open, and not blocking

- The filler per zone — defaults proposed above.
- `feature/diagonal-prototype` — parked or folded in (see *Prerequisites*).

## Follow-on pieces (queued by Caelan, 2026-09-11)

1. **The fight area as fog of war.** Today's combat reads as a spotlight: a lit circle of
   radius ~4 tiles when an enemy is 2 tiles away, the world outside multiplied to about a third of
   its brightness, a black vignette on top. And once a watcher is chasing, the ALARM stipple paints
   the ground they *can* see red — which is the ground between you. Direction: keep HAZE's
   polarity through the fight — clear where the fight can see, a light dither beyond that thins
   out rather than going dark — so the fog means "out of their sight". A tile-aligned square is the
   simpler alternative.
2. **Hit-splat art.** The Kenney Emote Pack's bare glyphs (Style 8: heart, drop, cross, star)
   cover heal, poison, miss and crit; there is no flame, snowflake or skull in any Kenney pack, so
   those would be drawn.
3. **Who gets pulled into a fight** — possibly the same sight-defined area as piece 1, as a
   gameplay rule.

## Measured

The frame-time gate (*Build and check*, stage 2), 2026-09-13, on Caelan's machine (RTX 4080 SUPER)
in the Browser pane at 3440×1440, DPR 1. **Full frame** is the drawing plus the GPU's raster; *issue*
is the drawing alone. The implementation plan's Task 10 note says why issue alone understates a
bigger screen, and how the full frame is timed. Median of three runs, ms per frame:

| Scene | Before: the 1216px square | After: filled, with fillers |
|---|---|---|
| Town at night (after: at the east edge, in front of the forest) | 1.38 full · 0.5–1.1 issue | **6.51** full · 1.56 issue |
| Town at night, north-east corner (forest on two sides) | — | **7.45** full · 1.69 issue |
| Town by day | 1.38 full | **6.38** full · 1.56 issue |
| Sewer fight, wheel open | 1.95 full · 0.6–1.4 issue | **5.67** full · 1.09 issue |

Both gate scenes are under 16 ms, so stage 3 goes ahead without the fallbacks. The cost grows with
the screen's pixels (3.35× here, about 4× the time). A weaker GPU at a big screen would feel this
first: a laptop at 2880×1800 has more pixels than this monitor. If that bites, the fallbacks above
are still the plan.
