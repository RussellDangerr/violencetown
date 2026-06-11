# Violencetown

A browser-based 2D RPG of small violences, set across a hand-authored, directional world. Zero dependencies, no build step — open and play.

Play it live at [violencetown.russelldangerr.com/game/](https://violencetown.russelldangerr.com/game/).

## Status

Active development on `dev`. **Chapter One is playable end to end** — get your car running (recover the cataclysmic converter from the Sewer, fight or bribe your way out), then drive north across the bridge and out of town. Turn-based combat driven by a three-ring **action wheel**; a seeded-RNG world with localStorage save/load; a directional layout of connected zones (the Street hub with a blocked bridge out, plus the Sewer, Factory, Carnival, Graveyard, and a pitch-black Wilderness border); a **disposition economy** where you trade at Puck's shop and bribe enemies into allies that fight for you; **zone pursuit** (enemies chase you through doors); and **installable as a PWA** (full-screen, offline).

## Play

Open `game/index.html` in a browser, or run the dev server (recommended — it disables caching so edits show on reload):

```
python dev-server.py 3001      # serves game/ at http://localhost:3001/
```

No build tools, no dependencies — vanilla ES modules and a canvas.

It's also installable as a **PWA**: your browser's **Install** (desktop) or **Add to Home Screen** (mobile) gives a full-screen, offline, address-bar-free app.

### Controls

| Key | Action |
|-----|--------|
| W A S D / Arrows | Walk one tile (hold to keep moving). Items are picked up automatically as you step onto them. You travel between zones by walking into a zone's edge. |
| Space | Nothing selected: open the **action wheel** (it pre-aims at the nearest enemy; double-tap to instantly repeat your last action). With an item selected (1–9): open its use overlay (Use / Smash / Give). |
| 1–9 | Select an inventory slot |
| T | Wait one turn |
| E | Examine what you're facing — or open a **vendor's shop** (Puck, in the Factory) when you're standing next to one |
| L | Open the message-log history |
| ? | How-to-play |
| Esc | Cancel a menu / deselect |

The **action wheel** is three concentric rings — the action (Attack · Skill · Throw · Give · Defend · Run), the item to use, and an aim compass. Each rotating ring eases its selected slice up to a fixed pointer at 12 o'clock (the compass stays North-up). `↑`/`↓` pick a ring, `←`/`→` spin it, `Space` fires, `Esc` backs out. Walking into an enemy does nothing — bump-to-attack is retired; the wheel is how you fight. On touch: a d-pad walks, the `✦` button opens and fires the wheel, `☰` opens a menu, and you tap in-canvas panels directly (hotbar, overlay, wheel, log strip).

## How it works

- **Turn-based:** one input = one action = the world advances a turn. Firing a wheel action is your turn; waiting (`T`) and item use cost a turn too.
- **Hand-authored, directional world:** the Street (hub) sits at the center, its only way out — a **bridge north** — blocked until your car runs. The **Sewer** lies east, the **Factory** (home to Puck, a friendly trader) west, and a southern chain runs **Carnival → Graveyard → Wilderness** (a pitch-black, too-dangerous border). Each zone has its own tiles, hazards (e.g. sewer sludge), NPCs, and items; you travel by walking into a zone's edge.
- **Combat:** the action wheel's verbs resolve over flat HP, flat damage, and flat armor reduction — no dice, no misses. **Throwing** a consumable bursts over a 3×3 area, applying its effect at half strength to every valid target. Hits pop **typed hit-splats** — a colored marker whose color and motion read the damage type (physical, sludge, …) at a glance.
- **NPCs & the disposition economy:** every NPC runs a finite-state machine (idle / wander / work) over a **disposition** value, shown as a mood smiley above their head. Give them what they value to bribe them — cross a threshold and they **flip into an ally that hunts your enemies and trails you** (hit one by accident and it turns back on you). **Puck**, in the Factory, runs a **shop**: press `E` to open his till and buy / sell at disposition-driven prices, or slip him gold to warm his mood.
- **Zone pursuit:** flee a fight through a door and the hostiles on your heels **follow you into the next zone**, shouldering through the threshold a beat behind you. Wedge the **[pipe]** into the door to jam it — they'll pound it down, but it buys you a reprieve that scales with how hard they hit.
- **Seeded RNG:** all gameplay randomness comes from one Mulberry32 generator, so a run is deterministic and resumable across saves.
- **Save/load:** versioned localStorage save with an atomic write + one backup slot; `CONTINUE` on the splash resumes your last session. No accounts.
- **Installable (PWA):** a web manifest + a network-first service worker make it installable — a full-screen, offline, address-bar-free app with the gold "V" on your home screen.

## Design influences

Stick RPG meets Mother 3 meets *Codename: Kids Next Door* meets Adventure Time anthology vibes, with cryptid Americana and Persona-coded combat feel.

## Project structure

```
game/
  index.html        # Game page (splash + UI shell)
  style.css         # Layout + touch controls
  main.js           # Game class: loop, input, state machine, combat dispatch, save hooks
  renderer.js       # Canvas rendering — world, HUD, modals, hit-splats, wilderness darkness
  action-wheel.js   # The three-ring action wheel model (action / item / aim)
  map.js            # Map loader, tiles, transitions, regions
  *-map.json        # Hand-authored zones (town, sewer, factory, circus→carnival, graveyard, wilderness, + the borgir interior)
  data.js           # Constants + tile definitions
  items.js          # Item defs, equip/use/throw/give resolution
  combat.js         # Entity + flat HP/damage/armor
  enemies.js        # Enemy class, line-of-sight, enemy-turn resolution
  npc.js            # NPC finite-state machine (idle/wander/work)
  pathing.js        # Greedy chase pathfinding
  give-action.js    # Disposition / bribery / ally-flip system
  trade.js          # Shop / barter pricing — disposition bands, bribe cost
  rng.js            # Mulberry32 seeded RNG
  save.js           # Versioned localStorage save/load
  quests.js         # Data-driven quest engine
  sewer-setpiece.js # The "escape the sewer" gauntlet (fix_car's set-piece)
  examine.js        # The Examine skill
  sprites.js        # Sprite-sheet loader + tile/enemy/item maps
  ui-sprites.js     # 9-slice panel + palette helpers
  bitmap-font.js    # 8x8 bitmap font renderer
  assets/           # Font + UI panel atlases, Kenney sprite sheets
  sprite-picker.html# Dev tool: pick a sheet cell, copy its coords
  manifest.webmanifest # PWA manifest (installable, standalone)
  sw.js             # Network-first offline service worker
  icon-*.png        # PWA / home-screen icons (from the favicon "V")
dev-server.py       # No-cache dev server (serves game/)
tools/              # Asset generators (gen_font.py, gen_ui_panel.py, gen_pwa_icons.py)
plans/              # Feature briefs, research, and the roadmap
ROADMAP.md          # Phase-level goals
GAME_STUDIO_PLAN.md # The 4-gate development pipeline
```

## Development

All feature work follows the 4-gate pipeline in `GAME_STUDIO_PLAN.md`; phase goals live in `ROADMAP.md` and per-feature briefs in `plans/`. Develop on `dev`.

## License

[MIT](LICENSE) for the project's own code. Third-party Kenney sprite assets in `game/assets/` are distributed under their original Kenney license bundled there.
