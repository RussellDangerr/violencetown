# Violencetown

A browser-based 2D RPG set in a procedurally generated city that shifts over time. You are a taxi driver. Things have gone wrong.

Play it live at [violencetown.russelldangerr.com/game/](https://violencetown.russelldangerr.com/game/).

## Status

v0.7.0 — overhead dialogue + in-canvas log strip shipped 2026-05-25. Active development on `dev`.

## Play

Open `game/index.html` in a browser. No build tools, no dependencies — just load and go.

### Controls

| Key | Action |
|-----|--------|
| WASD / Arrows | Move (hold multiple for diagonals; queue stays smooth) |
| Space | Execute tick now |
| E | Pick up items |
| Esc | Cancel queued action |
| P | Pause |

When you engage an enemy, an Omnitrix-style 6-slice radial wheel appears — the wheel itself rotates around a static pointer at 12 o'clock. Select Attack to surface sub-options (Basic / Cleave / Poke), Item to use inventory, and so on.

## How It Works

- **Tick-based:** You have 10 seconds to queue an action, then the world resolves. Or hit Space to resolve immediately.
- **Procedural city:** Infinite chunk-based map with 5 biomes — Stealville, Sludgeworks, The Glow, Downtown, Outskirts.
- **City shifting:** Buildings regenerate every 600 ticks. Nothing is permanent.
- **Smooth movement:** Held-key direction stack — holding multiple movement keys no longer freezes input.
- **Combat:** 6-slice radial wheel with Attack sub-options (Basic, Cleave, Poke) and a debuff system (Blind is the reference debuff). Friendly NPCs are protected via a canonical adjacency filter that consolidates targeting across all combat verbs. Underneath: 100 HP, flat damage, flat armor reduction — no dice rolls, no misses.
- **localStorage saves:** No accounts, no login. Just play.

## Design influences

Stick RPG meets Mother 3 meets *Codename: Kids Next Door* meets Adventure Time anthology vibes, with cryptid Americana and Persona-coded combat feel.

## Project Structure

```
game/               # The game
  index.html          # Game page (splash + UI)
  main.js             # Game loop, tick timer, input, save/load
  map.js              # Procedural chunk-based city generation
  player.js           # Player state, movement, actions
  ui.js               # Canvas rendering, DOM panels
  data.js             # Tiles, biomes, items, building types
  utils.js            # Seeded RNG, simplex noise
  combat.js           # Flat HP/damage/armor system
  style.css           # Game styles
  particles.html      # Standalone particle sim demo
  PLAN.md             # Unified development plan
  ROADMAP.md          # Feature roadmap and priorities

plans/              # Feature briefs and research
index.html          # Portfolio site
crawler/            # Fast food deals crawler
deals/              # Deals frontend
```

## Development

See `game/PLAN.md` for the phased development plan and `GAME_STUDIO_PLAN.md` for the 4-gate pipeline.

All feature work follows the gate pipeline defined in `GAME_STUDIO_PLAN.md`.

## License

[MIT](LICENSE) — own code. Third-party sprite assets in `game/assets-placeholder/` are distributed under the original Kenney license bundled there.
