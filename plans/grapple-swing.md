# Chapter Two Phase 5 — the Grappling-Hook Swing

**Status:** Design + build sketch (2026-07-23). The mechanic's surroundings are all shipped; this is
the one true gap. Promoted from `plans/chapter-two-downtown-canyon-and-cohesion.md` §Phase 5.

## The gap (verified against `dev` `33687ad`)

Everything *around* the grappling hook already ships:

- You can **get the hook three ways**, all converging on owning it: buy it from Pike
  (`canyon-map.json` — Pike is a `vendor` with `stock:["grappling_hook"]`), **kill** Pike
  (`main.js:3793` — `pike_boss` drops `grappling_hook` via `_recordDrop` + `groundItems.push`), or take
  his **deal** (`_grantItem('grappling_hook', …)` at `main.js:3804`).
- The **canyon exit is gated on owning it** — a data-driven transition
  (`canyon-map.json:29`): `{ "x":7, "y":1, "toMap":"downtown-map.json", "requires":"grappling_hook",
  "requiresMsg":"[Sheer rock, straight up. You'd need a good hook and a rope…]" }`.

But the hook is currently **just a key** — it flips the `requires` flag and you walk through a normal
transition tile. There is **no swing**. The canyon map's own `_scaffold` note names this exact work:
*"the Phase-5 GRAPPLE_ANCHOR that replaces this plain hook-gated exit with an actual swing."*

## The mechanic

A **grapple anchor** is a tile you *bump* (walk into) while holding the hook; it arcs the Hero across
a gap to the anchor's paired landing tile. This mirrors the existing **bump-dispatch** pattern exactly:
movement already special-cases tiles by id, e.g. `main.js:1986`
`if (this.map.getTile(nx, ny) === 19) { this._interactCar(); return; }` (the car), and the destructible
`BARRICADE` (tile 23) is cleared the same way. The grapple adds one more bump case.

**Feel:** get the hook → immediately swing out of the pit (the seeded amusement-park payoff), and later
zones get a reusable anchor-gated traversal primitive.

## Design (settled parts)

- **New tile `GRAPPLE_ANCHOR`** in `game/data.js` `TILES` (next free id; `walkable:false` so you *bump*
  it rather than stand on it, like the car). Give it a `fallbackColor` + a sprite pick later.
- **Anchor pairing / destination.** Two options — recommend **(a)** for the MVP:
  - **(a) Data-driven landing** — the anchor carries its destination in map data, reusing the
    transition shape: a per-anchor entry `{ x, y, toX, toY, toMap?, requires:"grappling_hook" }`. Bumping
    it with the hook animates the Hero to `(toX,toY)` (same-map swing) or fires the existing transition
    (cross-map, e.g. the canyon→Downtown climb-out). This lets the canyon exit become a *real anchor*
    instead of a plain `requires` transition, with zero new pathing.
  - **(b) Nearest-open-tile-across-the-gap** — compute the landing by ray-casting past the anchor to
    the first walkable tile. More "physical," but needs gap semantics; defer.
- **`STATE.GRAPPLE_AIM`** is **optional** for the MVP. Simplest: bump-to-swing with a fixed data
  destination (no aim step). Add an aim state only if you later want multiple anchors reachable from one
  spot.
- **Soft-no when the hook isn't owned:** bumping an anchor without `grappling_hook` logs the anchor's
  `requiresMsg` (reuse the transition idiom) and does not move — matching how `requires` already gates.
- **The swing animation** reuses the existing move/slide tween (`_animateMove` / the walk-slide lerp) to
  arc the Hero from the bump tile to the landing tile over a few frames; gate the arc height on
  `Settings.reduceMotion`.

## Build sketch (each step verifiable in-browser via `window.__game`)

1. **Data:** add `GRAPPLE_ANCHOR` to `TILES` (+ `TILE_BY_ID` picks it up automatically) and to the
   sprite map (placeholder colour first).
2. **Bump dispatch:** in the movement bump path (beside the `=== 19` car case, `main.js:1986`), add
   `if (this.map.getTile(nx,ny) === <GRAPPLE_ANCHOR id>) { this._interactGrapple(nx,ny); return; }`.
3. **`_interactGrapple(ax,ay)`:** look up the anchor's data entry for `(ax,ay)`; if the player lacks
   `grappling_hook`, log `requiresMsg` and return; else resolve the destination — same-map → animate the
   Hero to `(toX,toY)`; cross-map → run the existing map transition to `toMap/toX/toY`.
4. **Canyon exit:** replace the `canyon-map.json:29` `requires` transition with a `GRAPPLE_ANCHOR` tile
   at that spot + its anchor data pointing to `downtown-map.json (8,10)`. Confirm the climb-out still
   works only when holding the hook.
5. **Verify:** drive `window.__game` — bump the anchor without the hook (soft-no, no move), grant the
   hook, bump again (swings to the landing / transitions to Downtown), `reduceMotion` on (arc damps).
   0 console errors.

## Out of scope / Caelan's call

- **The canyon geometry** (the wrecked car, Pike's sunken wagon, ledges, where anchors sit) is
  hand-authored by Caelan — this plan wires the *mechanic* onto whatever geometry he lays down. The
  `canyon-map.json` `_scaffold` note says as much.
- Multi-anchor aim (`STATE.GRAPPLE_AIM`), physical ray-cast landings, and using anchors as combat
  mobility are follow-ons once the basic swing feels right.
