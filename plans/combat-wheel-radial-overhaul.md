# Combat Wheel — Radial Sunburst Overhaul (design spec)

**Date:** 2026-06-28 · **Status:** design APPROVED (brainstorming) — ready for an implementation plan.
**Supersedes the render of:** `combat-wheel-rework.md` (its verb-tree *model* survives but is made deeper;
only the on-screen *tape* render + interaction are replaced).

## Context

The combat action menu drifted from the XMB / spinning-wheel feel it was meant to have into a flat horizontal
**tape** (`renderer._drawWheel`). We're rebuilding it as a **concentric radial sunburst**. The `wheel-model.js`
depth model (CATEGORY → … → AIM, with `cycle` = spin and `forward`/`back` = drill/collapse) is the right
abstraction and is kept, but the **verb tree gets deeper** (Fight → Melee/Ranged/Magic; Melee → Hit/Cleave/Spin),
so this is a model *and* render overhaul.

**Research note (informed, deliberate):** parallel research (radial/XMB menus; nested combat menus; game-feel /
readability / accessibility) cautioned that *concentric* rings are the classic radial failure — **for menus with
many options per ring**. We are choosing concentric anyway because every level here has only **3–4 options** (big,
readable wedges) and the deeper levels render as **greyed partial-arc previews**, not full competing rings — which
defuses the pitfall. We keep the research's other wins (predictive highlight, cursor memory, world-pause, juice,
color+label, touch targets), most of which the codebase already enables.

## The visual model (this is the part that took the iterating — be exact)

At any moment the wheel is a sunburst centred on the canvas radial centre:

- **Center hub** — the root label **`MENU`** (or the current breadcrumb tip as you go deeper).
- **Greyed decision-stack rings (inner)** — every level you have **locked in** (drilled past), drawn as a *full*
  ring of curved tiles with the chosen option highlighted, **colours desaturated/greyed**. This is your decision
  trail; it grows inward toward the hub as you drill.
- **Active ring (bright, full)** — the level you are **on right now**. A full ring of curved, colour-coded
  "Simon-Says" tiles; the **selected tile sits at the top** under a fixed pointer (`▲`). You **spin** this ring.
- **Preview (partial arc of curved tiles, above the pointer)** — the **highlighted** option's children, rendered
  as **a couple of curved arc tiles (semicircle-style segments) fanning up over the pointer** — NOT a full ring.
  The **last-used child is centred at the top**; its neighbours render **greyed** to either side. If the option
  has more children than the few previewed, the rest are implied (and **populate into the full active ring only
  when you drill in**). When the highlighted option is a **leaf** (no children — e.g. Hit/Cleave/Spin), there is
  no preview arc; show a small "fire" cue instead.

Reading the wheel top-to-center gives the path: the preview tiles (next level) → the active selection (`▲`) →
the greyed decisions → `MENU`.

## Interaction

- **Spin (`◄ ►` / swipe / tap a tile):** rotate the active ring so your choice comes under the top pointer. The
  preview arc updates to the new highlight's children.
- **Drill (`▲` / action button):** lock the highlighted tile — it desaturates into a new greyed decision ring
  (joining the stack), the **preview arc tiles complete into the new bright active full ring**, and a fresh
  preview arc appears for the new highlight. (Re-center / zoom transition.)
- **Back (`▼` / swipe-down / tap a decision crumb):** collapse the active ring back into a preview arc; the most
  recent greyed decision ring becomes bright/active again.
- **Fire:** `▲` on a **leaf** (Hit/Cleave/Spin, a spell, a self-verb) activates the ability → **AIM** (the
  reticle + `affectedTiles` predictive highlight) when it needs a target; the Plus-Ultra ally-confirm still gates.
- **Cursor memory:** every level remembers its last selection; the **top wheel opens on your last category**, so a
  repeat is drill-drill-fire. (We have `lastFired`.)
- **Placeholders:** a level with fewer than ~2 real options is padded with temporary `placeholder` tiles so there
  is always a full wheel to spin; real content replaces them later.

## The tree (APPROVED)

```
MENU
├─ Fight
│  ├─ Melee   → Hit · Cleave · Spin        (leaves — ▲ fires, then AIM)
│  ├─ Ranged  → <throwable items>          (pad with placeholders when carrying < 2)
│  └─ Magic   → Fireball · Cone of Cold
├─ Trick  → Throw · Trade
├─ Treat  → Eat · Cleanse
└─ Flight → Defend · Hide · Wait · Run
```

`Hit` is the basic strike (the old single-target `combatAttack`). **Cleave and Spin relocate *under* Melee** —
the abilities themselves are unchanged (`cleaveAttack`, `spinAttack`, `castSpell`, `resolveThrow` all stay); only
their **position in the tree** moves. Fight's direct children become **sub-wheels** (Melee/Ranged/Magic), each with
its own children, so the tree is one level deeper than the flat Fight ring we shipped.

## Render (`renderer.js` `_drawWheel` → sunburst)

- Concentric draw order: hub → greyed decision rings → bright active ring → partial preview arc (curved tiles).
- A reusable **curved-tile** primitive (donut-wedge) is the unit for every ring and the preview arc.
- The selected tile of the active ring is the focal point: brightest, outlined, plus a **non-colour cue** (border /
  pulled radius) so it survives the squint test and greyscale.
- Colours: per-tile category/verb hue ("Simon-Says"); greyed for decided + preview. Labels on tiles; **icons**
  (Kenney / item sprites) are a Phase-4 polish so colour is never the sole differentiator.
- Predictive highlight via `affectedTiles` when a leaf ability is highlighted/aimed.

## Feel / juice

Open with a quick scale overshoot; **spin** snaps the selection to top (~100ms, front-loaded) with a `menu-tick`;
**drill** re-centers (the active ring eases inward to greyed, the preview arc expands into the new active ring);
**fire** gets a 2–3 frame hit-pause + a `menu-confirm` "thunk." The **world stays paused** while the wheel is open
(already true). A **reduce-motion** path (existing setting) swaps the transitions for instant snaps, keeping the
colour/border change + audio.

## Touch

Spin = swipe around the active ring or tap a tile; `▲` = the action button; back = swipe-down or tap a greyed
decision crumb; ≥44px hittable wedge area; dead-center hub. The preview arc tiles are taps that drill into that
child directly.

## Architecture (where it lands)

- **`wheel-model.js`** — deeper `VERB_TREE` (Fight → Melee/Ranged/Magic sub-wheels; Melee → Hit/Cleave/Spin;
  Ranged/Magic sub-wheels). `cycle`/`forward`/`back` already handle arbitrary depth, so the change is the tree
  *shape* + wiring resolvers to the new leaves (`Hit` = `combatAttack`, etc.). Add accessors the renderer needs:
  the **decision-stack path** and the **highlighted option's children** (for the preview arc). Add the
  **placeholder-padding** rule for thin levels.
- **`renderer.js` `_drawWheel`** — tape → sunburst (the big piece): curved-tile primitive, the four layers above,
  the spin/drill transition + reduce-motion.
- **`main.js`** — map spin/drill/back/fire to `cycle`/`forward`/`back`/`_fireWheel` (already close); rewrite
  `_tapRadialMenu` for the sunburst (tap a tile / preview tile / decision crumb; AIM taps reuse the reticle work).
  Snappy `_reticleKey` stays.
- **`layout.js`** — sunburst geometry: hub radius, per-ring radii, the preview-arc band + angular span, pointer
  position, curved-tile angular gap. Replace the legacy `RING_*` / `RADIAL_*` consts (vestigial 3-ring wheel).
- **`audio.js` / `settings.js`** — reuse `menu-tick`/`menu-confirm`; reduce-motion already exists.

## Phasing (each a branch off dev → verify → merge)

1. **Deeper tree + sunburst render (static).** `wheel-model` tree restructure (Fight → Melee/Ranged/Magic, Melee →
   Hit/Cleave/Spin, etc.) + the sunburst draw (hub, greyed stack, active ring, arc-tile preview) replacing the
   tape. No animation yet. Verify every ability still reaches its resolver through the new path.
2. **Interaction + touch.** Spin/drill/back/fire mapped through the model; the sunburst tap model; placeholders.
3. **Juice + reduce-motion.** Open overshoot, spin snap, drill re-center transition, fire hit-pause, audio.
4. **Predictive-highlight-on-hover + icons + colorblind presets + placeholder polish.**

## Risks / open

- **Concentric readability at depth** — mitigated by ≤4 options/level + greyed previews; keep the selected-at-top
  the clear focus and watch label legibility (icons in Phase 4 help).
- **Muscle-memory reset** — Cleave/Spin now live under Melee, so the path to them changes from the flat Fight ring
  we just shipped. Acceptable for an overhaul; cursor memory softens repeats.
- **Ranged sub-wheel = throwable items** — needs the placeholder rule when the bag has < 2 throwables.
- **Leaf with no children** — show a "fire" cue, not an empty preview arc.
- **Preview before AIM for fixed-pattern abilities** (Cleave arc / Spin ring) can preview off the player's facing;
  reticle verbs preview at AIM.

## Already in place (low-cost wins to surface)

`affectedTiles` (predictive highlight) · `lastFired` (cursor memory) · clock world-pause during the wheel ·
procedural SFX (`menu-tick`/`menu-confirm`) · reduce-motion setting · the Kenney icon set for wedge icons ·
the shipped resolvers (`combatAttack`/`cleaveAttack`/`spinAttack`/`castSpell`/`resolveThrow`).
