# Architecture & Game-Feel Direction

Captured 2026-05-24. Records the decisions made during a session that started with "should I switch to a tile editor?", widened to "should I switch to an engine?", and landed on "actually, my movement just needs polish." Written as a reference so future-Caelan can re-find the decisions without re-deriving them.

---

## TL;DR

- **V-town stays vanilla JS.** The architecture fits the game shape; conversion would be cost without benefit.
- **Pain Mountain remains the Godot learning vehicle.** Different game shape, engine-shaped problem.
- **"I need an engine" decomposes** into separable purchases: tile editor, data visualization (creature cards), movement polish. All solvable without conversion.
- **Movement fluidity is mostly perception polish, not architecture.** Five tunings on the path to DQM-feel; two were already done, three identified, one fixed.

---

## Section 1 — Engine vs. vanilla decision

### What a game engine actually is

Three things bundled: a **runtime** (game loop, scene graph, pre-built node behaviors, input system, asset import, signal/event bus), an **editor** (visual placement), and an **asset pipeline** (drag PNG → usable sprite). The deepest structural difference vs. vanilla is **inversion of control**: the engine owns the loop and calls *you* through reactive hooks (`_process(delta)`, `_input(event)`, `_on_player_died()`). In vanilla you own the loop and call into your own modules.

### What a "scene" means in Godot

Not a level — a saved tree of nodes (`.tscn` file) that you can instance (clone) at runtime or compose in the editor. A scene can be a whole level, one enemy, a UI widget, or a particle effect. You compose by nesting (`Town.tscn` contains `Building.tscn` instances which contain `Door.tscn` instances). Editing the leaf scene updates every instance.

### Why V-town doesn't need a scene graph

Two structural properties:

1. **World state is fully describable as flat data.** A `Uint8Array` of tile IDs + JSON arrays of `{x, y, hp, type}` entities. No per-entity continuous motion, no physics bodies, no animation trees to coordinate. Wrapping each enemy in a `Node2D` with a `Sprite2D` child and a `CollisionShape2D` sibling buys nothing.
2. **Single viewport, single render pass.** The `Renderer` is roughly `(state, sprite maps) → pixels`. A scene graph's job is coordinating many objects across layers and cameras; V-town has one camera and a fixed draw order.

Scenes start mattering when entities have continuous motion, layered children that move together, multiple cameras, physics bodies, or non-programmers placing entities visually. None describe V-town. All describe Pain Mountain.

### What a conversion would look like

Module mapping (for reference, not as a plan):

| V-town today | Godot equivalent |
|---|---|
| `Game` class | `Main.tscn` root + GDScript, shattered into ~20 scripts on different nodes |
| `GameMap` + JSON loader | `TileMap` node + `TileSet` resource |
| `Renderer` class (45 KB) | mostly deleted — nodes render themselves |
| `sprites.js` sheet maps | editor-defined `TileSet` atlas regions |
| Tile-picker overlay | built-in TileSet editor |
| `Enemy` class | `Enemy.tscn` per type or generic scene + resource |
| `npc.js` FSM | `StateMachine` script or `AnimationTree` states |
| `combat.js` | stays as plain script |
| `give-action.js` | stays as plain script |
| Radial menu | `Control` scene with `_draw()` override |

Realistic effort: 2–3 weeks for someone who knows Godot; 4–6 weeks mid-learning. Most goes into editor work (TileSets, per-enemy scenes, signal wiring). Pure logic ports (combat, give-action, FSM) are fast.

### Decision: stay vanilla

Three reasons:
1. **Cost lands at the wrong moment.** Post-v0.5.0 momentum on cosmology + zones would stall for pure infrastructure work that produces no new content.
2. **Architecture is well-fit.** Turn-based grid games have been built in vanilla forever because flat data maps cleanly to arrays. Engine overhead would buy capabilities V-town doesn't use.
3. **You'll learn Godot better fresh.** Conversion teaches "how do I make Godot recreate what I had?" — frustrating angle. Greenfield teaches "how does Godot want me to think?" — which is how engine idioms actually absorb.

The clean framing: **engines and vanilla aren't a quality hierarchy; they're a shape match.** Grid/turn-based/single-viewport → vanilla. Real-time/3D/multi-entity/physics → engine. Right tool per project beats one tool across all projects.

---

## Section 2 — The Tiled-as-shortcut option

[Tiled](https://www.mapeditor.org/) is what Godot's TileMap editor *is*, basically — same UX, same paint-a-tile-on-a-grid loop. It exports JSON natively, and V-town's map JSONs map almost 1:1 to Tiled's tile-array format. An adapter is maybe 50 lines remapping Tiled's 1-indexed tile IDs to V-town's 0-21 scheme plus translating object layers into the `enemies` / `items` / `containers` / `transitions` arrays. `GameMap` itself wouldn't change.

**Recommended order:** try Tiled first (one afternoon) before building any in-game level editor. If Tiled feels right, the editor question is solved. If it breaks flow, the in-game editor becomes the right answer with a clearer picture of which features it needs.

**Decision status:** deferred. Install when next map work feels heavyweight.

---

## Section 3 — Creature card / bestiary view

### What we want

A debug view that shows every enemy type with: sprite rendered next to data fields (hp, damage, barks, drops), plus cross-references — which maps spawn this enemy, where its FSM logic lives, what items it drops.

### What an editor gives you

In Godot this is the **Inspector** view on a `Resource`. Define `EnemyResource` with fields; each enemy variant (Carrion, Greedy Green, etc.) is a `.tres` file. Click one → Inspector renders fields with sprite preview. `Ctrl+Shift+F` on the resource path → see every scene that loads it.

### What we'd build in vanilla

A debug mode toggled by a key (`F2` or `~`) that:

1. **Scans a single source of truth** — probably a new `enemy-defs.js` exporting `[{ id, name, sprite, hp, damage, barks, drops, behaviors, ... }]`. Today this data is scattered (class shape in `enemies.js`, spawn blobs in JSONs, sprite coords in `sprites.js`). The bestiary forces consolidation.
2. **Renders a grid of cards** — sprite at 4× scale via existing `SpriteSheet.drawTile`, data fields as text.
3. **Cross-references automatically** — scan map JSONs at boot, list "Appears in: Sewer (3 spawns), Town (0 spawns)." 10-line `Object.entries` filter.
4. **Click-to-detail** — expanded view with all barks, drop items rendered with their sprites, FSM state references.

**Stealth benefit:** the act of centralizing enemy defs is itself a design win — balancing becomes visual, duplicate barks become visible, scope of the roster becomes legible.

**Cost:** ~1 focused session for v1; ~2 for cross-reference + click-to-detail.

**Decision status:** deferred. Worth doing before the enemy roster grows past ~6 types, since the longer it waits the more scattered data has to be consolidated.

---

## Section 4 — Grid vs. free movement

### The five axes (grid-ness is not one thing)

| Axis | Quantized | Continuous |
|---|---|---|
| 1. Logical position | cell ints | float coords |
| 2. Visual position | snap | interpolate |
| 3. Input | one-press-one-step | held-key continuous |
| 4. Collision | tile-aligned | hitbox |
| 5. Time | turn-tick | frame-tick |

- **Pixel Dungeon** = all five quantized. Maximum grid-feel.
- **DQM / Pokemon overworld** = logical grid (1, 4, 5 quantized) + smooth visuals + held-key walking (2, 3 continuous). The grid is real but invisible.
- **Zelda LTTP / Stardew** = all five continuous. Free movement.
- **Stick RPG** = 1D continuous (side-scroller).

**V-town's current state:** axes 1, 4, 5 quantized; axis 3 already continuous (held-key stack shipped v0.5.0); axis 2 partially fluid (animation exists but with the gaps below). Closer to DQM than to Pixel Dungeon than first felt.

### Already done correctly

- **Camera smoothing** via interpolated `_scrollX` / `_scrollY` driven by `_animProgress` in `renderer.js:116-118`. The world slides under a pinned-center player. This is the Pokemon/DQM render pattern.
- **Linear easing** in `_animateMove`. Correct choice for chained motion (ease-out would create per-tile deceleration stutter).

These are the tunings that require upfront architectural commitment. The remaining three are bolt-on polish.

### Three findings from the `main.js` audit

**Finding 1 — `_AUTO_REPEAT_MS: 120 → 100` (FIXED)**

- Symptom: 20ms dead frame per tile during held-key walk. Animation finishes at 100ms but next move doesn't fire until 120ms. Eye reads as micro-stutter per tile.
- Location: `main.js:100`
- Fix: change constant from 120 to 100. Done in this session.
- Status: edited on `dev`, uncommitted, untested in browser.
- Better fix (deferred): kill `setInterval`, chain-cancel from animation callback. Removes drift, removes 20ms gap entirely.

**Finding 2 — input drops during animation (PENDING)**

- Symptom: pressing a new direction during the 100ms slide is silently dropped. "The game ignored me" at direction changes.
- Location: `main.js:498` — `if (this._animating) return;`
- Fix: replace `return` with `this._queuedMoveDir = dir; return;`. In the animation callback, check `_queuedMoveDir` and fire it. ~5 lines.
- Pairs with Finding 1 (same callback site).

**Finding 3 — static player sprite (PENDING, biggest visual win)**

- Symptom: character is biomechanically frozen. Smooth camera + frozen pose reads as "cursor sliding" not "person walking." Human vision parses "walking" from leg alternation.
- Location: `sprites.js` — `PLAYER_SPRITE = { ..., static: true }`. Renderer at `renderer.js:443` ignores `game.facing`.
- Open question: does `roguelikeChar_transparent.png` actually have walk frames? Most Kenney character sheets do; verify with tile-picker overlay.
- Fix shape:
  ```js
  // sprites.js
  PLAYER_SPRITES = {
      down:  [{col: 0, row: 7}, {col: 1, row: 7}],
      up:    [{col: 0, row: 5}, {col: 1, row: 5}],
      left:  [{col: 0, row: 6}, {col: 1, row: 6}],
      right: [{col: 0, row: 8}, {col: 1, row: 8}],
  };
  // renderer.js _drawPlayer
  const frames = PLAYER_SPRITES[game.facing];
  const frameIdx = game._animating ? Math.floor(performance.now() / 200) % frames.length : 0;
  const cell = frames[frameIdx];
  ```
  (Coords above are placeholder — confirm via picker-overlay.)
- Plumbing already exists: `this.facing` updated by `_doMove:501-504`; renderer just doesn't read it. "Parked" infrastructure, not dead code.
- Side benefit: enables idle bob / breathing / blink animation later for "character feels alive when standing still."

---

## Decisions made

| # | Decision | Status |
|---|---|---|
| A | Stay vanilla for V-town | active |
| B | Pain Mountain = Godot learning project | active |
| C | `_AUTO_REPEAT_MS: 120 → 100` | edited on `dev`, untested, uncommitted |
| D | Walk-cycle restoration is the next-biggest movement lever | committed as direction |
| E | Bestiary view is a defensible next debug-tool | committed as direction |

---

## Open questions

| # | Question | Trigger to revisit |
|---|---|---|
| F | Install Tiled now or later? | next time map layout feels heavyweight |
| G | Does `roguelikeChar_transparent.png` have walk frames? | when starting Finding 3 — verify with picker overlay |
| H | When to implement Findings 2 + 3? | after feel-test of Finding 1 confirms diagnosis |
| I | When to build bestiary view v1? | before enemy roster grows past ~6 types |
| J | When to start Pain Mountain in earnest? | independent of V-town; tracked separately |
| K | Clean up stale `origin/claude/*` branches? | housekeeping pass, any time |

---

## Insights worth preserving

- **Two of the five movement-fluidity tunings were already done correctly** (camera smoothing, linear easing). The ones that required upfront architectural commitment — done. The remaining three are bolt-on polish. Better starting position than felt mid-session.
- **Inversion of control is the deep difference between engine code and vanilla.** Syntax differences (GDScript vs JS) are surface; the mental shift "I no longer own when things happen, I subscribe to when things happen" takes longer. Every confusing Godot tutorial will trace back to that.
- **"I need an engine" usually decomposes into 2–3 separable purchases.** Pixel editor + tile editor + scene runner. V-town already has the scene runner (the game itself). Shopping list is shorter than the engine question suggests.
- **In-game debug tools are how pro games ship.** Skyrim Creation Kit, Source `developer 1` console, Quake `edicts`, Unity Inspector — all "the game with editor mode bolted on." V-town's tile-picker overlay is already this pattern at minimum scale. Bestiary view, level-edit mode, AI-state inspector are all natural extensions.
- **The `Game` class is doing what an engine does, just smaller.** Input binding, tick advancement, render dispatch, particle loop, screen shake, radial wheel state — the categories an engine bundles. Built a mini-engine specialized to one game. Same pattern as id Tech 1, Build, ZZT.
- **"Parked" infrastructure is a gold mine.** The `facing` state still updated despite renderer ignoring it is exactly the kind of half-deleted feature cheaper to revive than rebuild. Worth periodic grep for `// parked` / `// TODO` / `// disabled` — often 80%-done features waiting for the last 20%.
- **Walk-cycle animation does more cognitive work than people realize.** 2-frame leg alternation flips visual parsing from "sliding cursor" to "walking person." Tiny pixel cost, huge perceptual impact. Pokemon, DQM, Earthbound, Mother 3 all use minimal walk cycles (2–4 frames) for this exact reason.
- **"Snap-feel" is usually camera-induced, not character-induced.** Players' eyes track the character, but spatial sense tracks the background. Smooth camera + snap character = "free." Snap camera + smooth character = "grid-y." V-town has the smooth-camera half done; that's why the grid-feel is already weaker than expected.
- **Defensive timing buffers are stealth bugs.** The "slightly longer than 100ms animation" comment was honest about intent, but the buffer protected against a problem another guard already handles (`_doMove`'s early-return on `_animating`). Cost: 20ms of dead frame per tile. Worth periodically auditing comments that explain "small fudge factor" or "extra margin" — they're often the source of perceived stutters.
- **Tests that take 30 seconds beat plans that take 30 minutes.** No-build-step setup is optimized for the empirical loop: theory generates a candidate, hard-reload confirms or denies. Cherish that loop. Engines slow it down by 2–10×.

---

## Cross-references

- `plans/sprite-polish-playbook.md` — the workflow that proved the in-game debug tool pattern (tile-picker overlay)
- `plans/cosmology-and-arc.md` — narrative canon driving zone + enemy roster growth (which is what makes bestiary view worthwhile)
- `plans/give-action-feature.md` — example of design doc written mid-build paying off later
- `~/.claude/projects/C--Users-caela/memory/project_violencetown.md` — auto-memory snapshot
- `~/.claude/plans/mutable-mixing-feather.md` — v0.5.0 combat-radial-menu plan (Plans A/B/C)
