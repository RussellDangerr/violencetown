# Violencetown

A browser-based 2D RPG of small violences, set across five hand-authored zones. Zero dependencies, no build step — open and play.

Play it live at [violencetown.russelldangerr.com/game/](https://violencetown.russelldangerr.com/game/).

## Status

Active development on `dev`. Turn-based combat, an Omnitrix-style radial wheel, a seeded-RNG world with localStorage save/load, and five interconnected zones (Town, Sewer, Circus, Graveyard, Factory).

## Play

Open `game/index.html` in a browser, or run the dev server (recommended — it disables caching so edits show on reload):

```
python dev-server.py 3001      # serves game/ at http://localhost:3001/
```

No build tools, no dependencies — vanilla ES modules and a canvas.

### Controls

| Key | Action |
|-----|--------|
| W A S D / Arrows | Walk one tile (hold to keep moving). Items are picked up automatically as you step onto them. |
| 1–9 | Select an inventory slot |
| Space | With an item selected: open the use overlay (Use / Throw / Smash / Give). With nothing selected: wait one turn. |
| E | Examine the thing you're facing |
| L | Open the message-log history |
| ? | How-to-play |
| Esc | Cancel a menu / deselect |

Walk into a hostile enemy to open the **radial combat wheel** (Attack / Skill / Throw / Give / Run / Defend) — the wheel rotates around a fixed pointer at 12 o'clock. `←`/`→` spin, `↑`/`Space` confirm (Attack surfaces Basic / Cleave / Poke), `↓`/`Esc` cancel. On touch: a d-pad walks, the `☰` button opens a menu, and you tap in-canvas panels directly (hotbar, overlay, wheel, log strip).

## How it works

- **Turn-based:** one input = one action = the world advances a turn. Bump-to-attack; waiting and item use cost a turn too.
- **Hand-authored zones:** five connected maps (Town hub + Sewer, Circus, Graveyard, Factory), each with its own tiles, hazards (e.g. sewer sludge), NPCs, and items. Zones connect through transition tiles.
- **Combat:** the radial wheel drives Attack (Basic / Cleave / Poke), Throw, Give, and Defend. Underneath: flat HP, flat damage, flat armor reduction — no dice, no misses. A debuff system (Blind via Poke) layers on top.
- **NPCs:** a finite-state machine (idle / wander / work) plus a disposition system — some NPCs can be given items, bribed, and flipped to allies.
- **Seeded RNG:** all gameplay randomness comes from one Mulberry32 generator, so a run is deterministic and resumable across saves.
- **Save/load:** versioned localStorage save with an atomic write + one backup slot; `CONTINUE` on the splash resumes your last session. No accounts.

## Design influences

Stick RPG meets Mother 3 meets *Codename: Kids Next Door* meets Adventure Time anthology vibes, with cryptid Americana and Persona-coded combat feel.

## Project structure

```
game/
  index.html        # Game page (splash + UI shell)
  style.css         # Layout + touch controls
  main.js           # Game class: loop, input, state machine, combat dispatch, save hooks
  renderer.js       # Canvas rendering — world, HUD, modals, particles
  map.js            # Map loader, tiles, transitions, regions
  *-map.json        # Hand-authored zones (town, sewer, circus, graveyard, factory)
  data.js           # Constants + tile definitions
  items.js          # Item defs, equip/use/throw/give resolution
  combat.js         # Entity + flat HP/damage/armor
  enemies.js        # Enemy class, line-of-sight, enemy-turn resolution
  npc.js            # NPC finite-state machine (idle/wander/work)
  pathing.js        # Greedy chase pathfinding
  give-action.js    # Disposition / bribery / ally-flip system
  rng.js            # Mulberry32 seeded RNG
  save.js           # Versioned localStorage save/load
  quests.js         # Data-driven quest engine
  examine.js        # The Examine skill
  sprites.js        # Sprite-sheet loader + tile/enemy/item maps
  ui-sprites.js     # 9-slice panel + palette helpers
  bitmap-font.js    # 8x8 bitmap font renderer
  assets/           # Font + UI panel atlases, Kenney sprite sheets
  sprite-picker.html# Dev tool: pick a sheet cell, copy its coords
dev-server.py       # No-cache dev server (serves game/)
tools/              # Asset generators (gen_font.py, gen_ui_panel.py)
plans/              # Feature briefs and research
ROADMAP.md          # Phase-level goals
GAME_STUDIO_PLAN.md # The 4-gate development pipeline
```

## Development

All feature work follows the 4-gate pipeline in `GAME_STUDIO_PLAN.md`; phase goals live in `ROADMAP.md` and per-feature briefs in `plans/`. Develop on `dev`.

## License

[MIT](LICENSE) for the project's own code. Third-party Kenney sprite assets in `game/assets/` are distributed under their original Kenney license bundled there.
