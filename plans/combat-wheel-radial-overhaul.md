# Combat Wheel — Radial XMB Overhaul (design spec)

**Date:** 2026-06-28 · **Status:** design approved (brainstorming), ready for an implementation plan
**Supersedes the render of:** `combat-wheel-rework.md` (the verb-tree *model* it introduced stays;
only the on-screen *tape* render + interaction are replaced).

## Context

The combat action menu drifted from the XMB / spinning-wheel feel it was meant to have into a flat
horizontal **tape** of options (`renderer._drawWheel`). It's fluid but it lost the spatial wheel that
made selection legible and satisfying. We're rebuilding it as a true **radial** wheel — but, after
research (below), *not* the multi-ring concentric wheel first sketched. The underlying model
(`wheel-model.js`: depth levels CATEGORY → VERB → ITEM/SPELL → AIM, with `cycle` = spin and
`forward`/`back` = drill/collapse) is the right abstraction and is **kept**; this is a render +
interaction overhaul, low model risk.

## Research basis (what shipped games do right)

Three parallel research passes (radial/weapon-wheels + XMB; nested combat menus; game-feel /
readability / accessibility) converged hard:

- **Do NOT nest concentric rings.** Shrinking wedges + unreadable inner labels + ambiguous angles is
  the classic radial failure (cited disaster: *Temple of Elemental Evil*). The proven pattern is
  *Monster Hunter World*: keep each ring **flat** and **swap** it on drill-in.
- **4 options → the cardinals** (*Crysis* nanosuit): unambiguous on key / d-pad / thumb.
- **≤6 wedges per ring** (*Witcher 3* signs = 5 is the sweet spot; 8 is the hard ceiling).
- **Fixed pointer + move the content** (*XMB*): spin the ring so the choice arrives at one fixed
  highlight, rather than a cursor chasing tiny wedges — far crisper at pixel scale.
- **Center = dead-zone + live readout + aim origin** (*Mass Effect* fuses select + aim).
- **Persistent text breadcrumb** for depth; **parent shown as a dimmed strip, not a second ring**
  (*Final Fantasy* persistent column).
- **Predictive highlight** — show the highlighted option's effect *before* commit. Called the single
  highest-leverage legibility feature. **We already have it** (`affectedTiles`).
- **Cursor memory** — reopen lands on last turn's action (*FF*). **We have `lastFired`.**
- **Pause the world while open** — every weapon-wheel game does. **Our clock already holds the turn
  during selection.**
- **Juice:** open with overshoot; snap selection in ~100ms + an audio *tick*; hit-pause (2–3 frames) +
  a *thunk* on commit (*Juice it or lose it*; *Art of Screenshake*). **We have procedural SFX.**
- **Color + icon + label, never color alone**; pixel-art silhouette-first; colorblind-safe palettes
  (blue↔orange over red↔green); ≥44px touch targets; reduce-motion path.

## Goals / non-goals

**Goals**
- Replace the tape with a radial wheel that reads at a glance: which level you're on, what's
  left/right, what up/down does.
- Hybrid selection: **categories direction-picked on the 4 cardinals; deeper levels spun to a fixed
  pointer.**
- Keep every win we already enable (predictive highlight, cursor memory, world-pause, SFX,
  reduce-motion) and surface them in the new UI.
- Work equally on keyboard and touch; legible on a small phone.

**Non-goals (this overhaul)**
- No change to the verb-tree *model* (categories/verbs/spells/items, `cycle`/`forward`/`back`).
- No new combat verbs or spells (Cleave/Spin/Fireball/Cone already shipped).
- Full per-CVD colorblind presets are deferred to the final phase, not a blocker.

## Design

### 1. Interaction — Hybrid

- **Top level (CATEGORY) = the 4 cardinals.** `Up = Fight`, `Down = Flight`, `Left = Trick`,
  `Right = Treat`. A direction press/flick *selects that category and drills in* in one input. The
  Up/Down axis reads as engage vs disengage.
- **Deeper (VERB → ITEM/SPELL) = spin.** `◄ ►` (Left/Right) spins the flat ring so the choice rotates
  up under the fixed pointer; `▲`/Space/action-button drills in (or fires when nothing is left to
  pick); `▼`/Esc backs out one level. The category's **hue carries down** every level.
- **AIM** is unchanged: the reticle, predictive tiles (`affectedTiles`), snappy direction-melee
  (adjacent verbs commit on a direction), and the Plus-Ultra ally-confirm.
- **Cursor memory:** reopening restores `lastFired`'s full path, so a repeat is two confirms.
- **Expert bypass (Phase 4, optional):** hold a category key + flick a verb to pre-compose past the
  rings (Witcher Quick-Cast style).

### 2. Render

- **CATEGORY** draws as a 4-cardinal **compass**: four wedges/pills on Up/Down/Left/Right, color-coded,
  the highlighted one bright; hub shows the category name.
- **Deeper** collapses the compass into a dimmed **breadcrumb** (`Fight ▸ Cleave`) and the active
  **flat ring** takes over: ≤6 wedges, fill = the category hue, the selected wedge at top under the
  `▲` pointer (brighter + outlined + a non-color cue so it survives greyscale / the squint test).
- **Hub** (center, dead-zone) names the focused choice and co-locates its cost/effect right there:
  `2/3 dmg · hits 3`, `Fireball · 12 MP`, `Bribe · 5 GP`, item counts, etc.
- **Predictive highlight:** as you hover a verb/spell, light the tiles it would hit via
  `affectedTiles` (Cleave's arc off the player's facing, Spin's ring, a spell's burst/cone). At the
  AIM level this is the existing reticle highlight.
- **Colors (proposal):** Fight = red, Flight = blue, Trick = amber, Treat = green; carried down through
  the drill. Every wedge also carries a **label** (and an **icon** in Phase 4) so color is never the
  sole differentiator. Greyed/dimmed for unavailable options (never reflow positions — muscle memory).

### 3. Feel

- **Open:** quick scale overshoot (~0.85→1.05→1.0, ~150–200ms, fast ease-out).
- **Spin:** eased angular rotation (~100–130ms, front-loaded) so the selection snaps to top; a short
  **tick** SFX per step; interruptible (input the next spin immediately).
- **Drill / back:** the chosen wedge **expands** into the next ring; backing **collapses** it into the
  parent — motion encodes direction.
- **Commit:** 2–3 frame hit-pause + a brighter flash on the chosen + a heavier **confirm** SFX
  (existing `menu-confirm`), then collapse toward the chosen wedge.
- **World pauses** while the wheel is open (already true — it composes one turn).
- **Reduce-motion** (existing setting): drop overshoot/rotation/expand-collapse → instant snaps; keep
  the color/border swap + audio so feedback survives.

### 4. Touch

- **CATEGORY:** tap or flick a cardinal quadrant (the d-pad's four directions map 1:1 to the four
  categories). The action button drills/fires.
- **Deeper:** tap a wedge to select it directly, or d-pad `◄►` to spin; the action button drills/fires;
  tap a breadcrumb crumb (a back target) or swipe-down to back out.
- ≥44px hittable wedge area at the narrowest point; dead-center dead-zone so a resting thumb doesn't
  pre-select.

## Architecture (where it lands)

- **`renderer.js` `_drawWheel`** — the big piece: rewrite tape → radial (compass at CATEGORY; flat
  ring + pointer + hub + breadcrumb deeper; predictive-highlight hook; spin/drill/open animation,
  reduce-motion aware). `_drawRadialMenu` already delegates here.
- **`main.js`** — input: at CATEGORY, map a direction to *select category + forward* (the Hybrid
  direction-pick); deeper levels keep `cycle` (spin) / `forward` (drill) / `back`. Touch:
  rewrite `_tapRadialMenu` (tap a wedge / tap a cardinal quadrant / tap a breadcrumb crumb to back;
  reuse the affected-tile/reticle work for AIM taps). The snappy `_reticleKey` stays.
- **`layout.js`** — radial geometry: ring inner/outer radii, hub radius, pointer position, the
  cardinal slot angles. Replaces the legacy `RING_*` / `RADIAL_*` consts (vestigial from the old
  3-ring wheel) — clean them up.
- **`wheel-model.js`** — small adds only: a category→cardinal map + a breadcrumb-path accessor;
  optionally a `directionSelectCategory(w, dir)` helper. No structural model change.
- **`audio.js`** — reuse `menu-tick` (hover/spin) + `menu-confirm` (commit); add an `menu-open` cue if
  one doesn't exist.
- **`settings.js`** — reduce-motion already exists; the radial honors it.

## Phasing (each its own branch off dev → merge after verify)

1. **Radial render replacing the tape.** Compass + flat ring + pointer + hub + breadcrumb + category
   color. Static (no animation yet). This is the structural correction; nothing else regresses.
2. **Hybrid input + touch.** Category direction-pick; deeper spin/drill (mostly already wired); the
   radial tap model (wedge / quadrant / breadcrumb).
3. **Juice + reduce-motion.** Open overshoot, spin rotation, drill expand/collapse, hit-pause, audio.
4. **Predictive-highlight-on-hover + icons + colorblind presets.** Extend `affectedTiles` highlight to
   the verb/spell hover (before AIM); Kenney/item icons on wedges; per-CVD palette presets.

## Risks / open questions

- **Predictive highlight before AIM** needs a facing/seed to compute Cleave/Spin tiles at verb-hover
  (no reticle yet) — use the player's facing + nearest hostile; confirm it reads cleanly.
- **Color choice:** Fight=red / Treat=green is a red-green pair; mitigated by different cardinals +
  labels + (Phase 4) icons + presets. Pick final hues against the parchment/dark UI for ≥4.5:1.
- **Spin vs direction at deeper levels with ≤4 options** (Trick=2, Treat=2, Flight=4): keep spin
  everywhere below CATEGORY for consistency, or let ≤4 levels also direction-pick? Default: spin
  everywhere below the cardinals (one consistent rule). Revisit if it feels slow.
- **Animation budget on a phone canvas** — keep transitions short + interruptible (combat is
  high-frequency; a delightful-once animation becomes friction by the 50th turn).

## Already in place (low-cost wins to surface)

`affectedTiles` (predictive highlight) · `lastFired` (cursor memory) · clock world-pause during the
wheel · procedural SFX (`menu-tick`/`menu-confirm`) · reduce-motion setting · the Kenney icon set
(touch overhaul) for wedge icons.
