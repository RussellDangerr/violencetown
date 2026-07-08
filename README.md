# Violencetown

A browser-based 2D action-RPG of small violences, set across a hand-authored, directional world — built as a systems-design playground in **zero-dependency vanilla JavaScript**. No engine, no build step: open a file and play.

**▶ Play it live: [violencetown.russelldangerr.com](https://violencetown.russelldangerr.com)**

`Vanilla JS (ES modules)` · `HTML5 Canvas` · `zero dependencies` · `no build step` · `installable PWA`

<!-- SCREENSHOT SLOT — replace the blockquote below with a real capture, e.g.  ![Violencetown](docs/hero.gif) -->
> 📸 _Gameplay screenshot / GIF goes here._

---

## Why it might be worth a look

Violencetown is a small game with deliberately deep systems. The interesting part isn't the content (yet) — it's the machinery:

- A **turn-based world on one clock**: one input = one action = one world-tick, so combat, ambient NPC life, and a day/night cycle all advance on the same beat.
- A **radial action wheel** driven by a pure state machine, where a single function is the source of truth for *"which tiles does this action hit"* — read identically by the highlight, the friendly-fire confirm, and the damage resolver.
- A **disposition economy**: every NPC carries one mood scalar that gifts, bribes, and dialogue all move through a single seam; cross a threshold and an enemy flips into an ally that fights for you — and that same scalar prices what a merchant charges.
- **Determinism by construction**: all randomness flows from one seeded generator, so a run is reproducible and resumable.

If you're evaluating how I think about systems, product, and architecture, the [Design notes](#design-notes) are the quickest read; the code in [`game/`](game/) backs them up.

## How this was built

I ([Caelan Gander](https://github.com/RussellDangerr)) designed the game's systems and made the architecture and product calls — the wheel grammar, the disposition/economy model, the zero-dependency "no build step" constraint, the scope decisions. **Claude Code** (Anthropic's agentic coding CLI) did a large share of the implementation, working under that direction with tight review loops.

I'm calling that out plainly rather than implying solo from-scratch engineering: directing AI coding tools well — while owning the design, the architecture, and the tradeoffs — is a real part of how this was made, and a skill I care about. The design docs under [`plans/`](plans/) are the paper trail — option matrices, risk analysis, and the four-gate pipeline the work followed.

## Run it locally

No install, no build, no dependencies.

```bash
git clone https://github.com/RussellDangerr/violencetown.git
cd violencetown
python dev-server.py 3001      # serves game/ at http://localhost:3001/
```

Or just open `game/index.html` directly in a browser. The dev server is only needed for live-reload while developing (it disables module caching so edits show on reload) — the game itself is plain static files. It's also installable as a **PWA** for a full-screen, offline app.

## Design notes

The three systems most worth reading, and the reasoning behind each.

### 1. The radial action wheel — one grammar, one source of truth
[`game/wheel-model.js`](game/wheel-model.js) is a **pure state model** (no DOM, no canvas): a node tree `MENU → categories → verbs → leaves`, walked by exactly one grammar — *cycle* (rotate the active ring), *drill* (push into a child / aim / fire), *back* (pop). Per-ring cursor memory means re-entering a ring lands where you left it.

The load-bearing decision: a single function, `affectedTiles`, computes which tiles an action hits — and the on-screen highlight, the friendly-fire confirmation, and the damage resolution **all read from it**. They can't disagree, because there's only one answer. Keeping the model DOM-free also makes it unit-testable in plain Node, no browser required.

### 2. The disposition / trade "transaction spine" — one scalar, many verbs
Every NPC carries a `disposition` value (−100…+100). Gifts (weighted by what that NPC values), flat bribes, and dialogue choices **all move it through one seam** — `reactToTransaction` in [`game/give-action.js`](game/give-action.js). Cross `flipThreshold` and a consequence fires: the NPC drops hostility and joins your side, or a merchant opens a discount. That *same* scalar buckets into eight price bands in [`game/trade.js`](game/trade.js) that set what you pay — with a deliberate spread so flipping items for profit is never free money.

The reasoning: "social" and "economic" behaviour are usually separate systems. Here they're two readers of one number, which keeps NPC relationships legible (one meter, shown as a mood face above their head) and the whole economy internally consistent.

### 3. Throw-resolution — respect the target, share the geometry
Thrown consumables (`resolveThrow` in [`game/items.js`](game/items.js)) fly straight or land on a reticle-chosen tile, then **burst over a 3×3 area at half effect** — damage hits hostiles only, heals touch friendlies only, with an explicit exception when you deliberately aim a heal at a friendly through the confirm gate. Crucially, the burst tiles come from the *same* `affectedTiles` geometry the wheel's highlight uses, so the preview you see is exactly what resolves.

More system write-ups (combat feel, the unified world clock, zone pursuit) live in [`plans/`](plans/).

## How it works (mechanics)

- **Turn-based:** one input = one action = the world advances a turn. Firing a wheel action is your turn; waiting (`T`) and item use cost a turn too.
- **Hand-authored, directional world:** the Street (hub) sits at the center, its only way out — a **bridge north** — blocked until your car runs. The **Sewer** lies east, the **Factory** (home to Puck, a friendly trader) west, and a southern chain runs **Carnival → Graveyard → Wilderness** (a pitch-black, too-dangerous border). You travel by walking into a zone's edge.
- **Combat:** the wheel's verbs resolve over flat HP, flat damage, and flat armor reduction — no dice, no misses. Hits pop **typed hit-splats** whose colour and motion read the damage type at a glance.
- **NPCs & the disposition economy:** every NPC runs a finite-state machine (idle / wander / work) over the disposition value above. **Puck**, in the Factory, runs a **shop** (`E` to open) with disposition-driven prices.
- **Zone pursuit:** flee a fight through a door and the hostiles on your heels **follow you into the next zone**. Wedge the **[pipe]** into the door to jam it and buy a reprieve.
- **Seeded RNG & save:** all gameplay randomness comes from one Mulberry32 generator (deterministic, resumable), with a versioned localStorage save (atomic write + one backup slot). `CONTINUE` on the splash resumes your last session. No accounts.

## Controls

| Key | Action |
|-----|--------|
| W A S D / Arrows | Walk one tile (hold to keep moving). Items are picked up automatically. Walk into a zone's edge to travel. |
| Space | Nothing selected: open the **action wheel** (pre-aims at the nearest enemy; double-tap to repeat your last action). With an item selected (1–9): open its use overlay. |
| 1–9 | Select an inventory slot |
| T | Wait one turn |
| E | Examine what you're facing — or open a **vendor's shop** (Puck, in the Factory) when adjacent |
| L | Open the message-log history |
| ? | How-to-play |
| Esc | Cancel a menu / deselect |

The **action wheel** is concentric rings — the action, the item to use, and an aim compass. `↑`/`↓` pick a ring, `←`/`→` spin it, `Space` fires, `Esc` backs out. On touch: tap to move, the `✦` button opens/fires the wheel, `☰` opens the device, and in-canvas panels are tapped directly.

## Project structure

```
game/
  index.html        # Game page (splash + UI shell)
  main.js           # Game class: loop, input, state machine, combat dispatch, save hooks
  renderer.js       # Canvas rendering — world, HUD, modals, hit-splats, lighting
  wheel-model.js    # Pure state model for the radial action wheel (see Design notes)
  map.js            # Map loader, tiles, transitions, regions
  *-map.json        # Hand-authored zones (town, sewer, factory, carnival, graveyard, wilderness, interiors)
  data.js           # Constants + tile definitions
  items.js          # Item defs; equip / use / throw resolution
  combat.js         # Entity + flat HP/damage/armor
  enemies.js        # Enemy class, line-of-sight, enemy-turn resolution
  npc.js            # NPC finite-state machine (idle/wander/work)
  pathing.js        # Greedy chase + BFS pathfinding
  give-action.js    # Disposition / bribery / ally-flip (see Design notes)
  trade.js          # Shop / barter pricing — disposition bands (see Design notes)
  quests.js         # Data-driven quest engine
  dialogue.js       # NPC dialogue tables
  spells.js tricks.js # Wheel-granted abilities
  save.js           # Versioned localStorage save/load
  rng.js            # Mulberry32 seeded RNG
  audio.js          # Procedural Web Audio SFX + ambient bed
  settings.js       # Options / accessibility store
  sprites.js layout.js ui-sprites.js bitmap-font.js  # Rendering support (sheets, rects, panels, font)
  assets/           # First-party procedural atlases (font, UI panels) + VT323 font
  assets-placeholder/kenney/  # Curated Kenney CC0 sprite sheets (with their license)
  manifest.webmanifest sw.js  # PWA manifest + offline service worker
dev-server.py       # No-cache dev server (serves game/)
tools/              # Asset generators (font, UI panel, PWA icons)
plans/              # Design docs — feature briefs, research, decision matrices
tests/              # Zero-dep Node test suite (node --test)
GAME_STUDIO_PLAN.md # The four-gate development pipeline
```

## Development

Feature work follows the four-gate pipeline in [`GAME_STUDIO_PLAN.md`](GAME_STUDIO_PLAN.md); phase goals live in [`ROADMAP.md`](ROADMAP.md) and per-feature briefs in [`plans/`](plans/). There's a zero-dependency Node test suite under [`tests/`](tests/) (`node --test`) covering the core logic (combat, pathing, wheel model, save round-trip, quests).

## License

[MIT](LICENSE) for the project's own code. Third-party assets:

- **Kenney** sprite packs — CC0 1.0 (public domain) — in `game/assets-placeholder/kenney/`, under the license bundled there.
- **VT323** font — SIL Open Font License 1.1 — in `game/assets/fonts/`.
