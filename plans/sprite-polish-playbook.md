# Sprite Polish Playbook

A repeatable workflow for sprite/tile iteration sessions on canvas-rendered HTML5 games using Kenney pixel-art packs. Written originally for Violencetown (2026-05-22), but the workflow generalizes to any project with a data-driven sprite-coord map.

---

## When to use this

- A sprite or tile renders wrong (looks placeholder, broken, or off-theme).
- You want to swap in a new Kenney pack.
- You're starting a "polish round" without a specific bug to fix — bias toward visible everywhere-changes (floors, walls, characters) over local fixes.

**Don't use this for:** renderer architecture changes, new sprite categories that don't fit existing maps, animation pipelines. Those need design work first.

---

## Prerequisites (one-time)

1. **Game has a data-driven sprite-map architecture.** Look for a `sprites.js` (or equivalent) that exports tile/item/character → `{col, row}` mappings consumed by a separate renderer. If sprite coords are scattered through render code, refactor first — every polish iteration will be 10× slower otherwise.
2. **Dev server runs locally.** Note the port (Violencetown: `3001`).
3. **Kenney All-in-1 pack installed** — CC0-safe for public repos.
4. **Chrome MCP available** (or any way to drive a browser + take screenshots programmatically).

---

## The 5-phase workflow per round

### Phase 1 — Baseline screenshot
Open the live game in Chrome at `localhost:<port>`. Take a screenshot of the scene you want to polish. Annotate (in a memory file or note) the *specific* visible issues — "floor tiles look like CRT monitors", "items render as letter boxes", "player is a green square". Specificity beats vibes.

### Phase 2 — Identify which mapping owns the broken sprite
Open `sprites.js` (or your project's equivalent). The map you need is usually one of:
- `TILE_SPRITE_MAP` / `TOWN_TILE_SPRITE_MAP` — terrain tiles by tile-ID
- `ITEM_SPRITES` — items on ground + inventory
- `ENEMY_SPRITES` — NPC/enemy characters
- `PLAYER_SPRITE` — the player character
- `SHEETS` — declares all loaded spritesheets

The broken-looking sprite traces back to one entry. Find it.

### Phase 3 — Build a tile-picker overlay (THE KEY STEP)
**Never guess from PNG previews.** Kenney sheets routinely have:
- Tile-cell boundaries that don't align with what your eye reads
- 2-cell terrain pairs (sidewalk + sand edge, dirt + stone edge) that read as single tiles in the preview
- Transparent edges and built-in 1px black borders
- Sub-tile design elements that get cut off at unexpected coords

Render the candidate tile at 10–20× scale with `image-rendering: pixelated` and you'll see what you actually have. Paste this into DevTools or run via Chrome MCP `javascript_tool`:

```js
(async () => {
  document.getElementById('tile-picker-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'tile-picker-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#222;overflow:auto;z-index:99999;padding:8px;color:#fff;font-family:monospace;';
  document.body.appendChild(overlay);

  const img = new Image();
  // Cache-bust so you see fresh art after asset swaps:
  img.src = './assets-placeholder/kenney/<SHEET_NAME>.png?_t=' + Date.now();
  await new Promise(r => img.onload = r);

  // Two modes — pick one:

  // MODE A: focused candidates (when comparing specific tiles)
  const candidates = [
    {label: 'CURRENT floor (10,3)', col: 10, row: 3},
    {label: 'alt floor (11,3)',     col: 11, row: 3},
    {label: 'alt floor (15,0)',     col: 15, row: 0},
  ];
  const SCALE = 12;
  for (const c of candidates) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:inline-block;margin:8px;text-align:center;';
    const lbl = document.createElement('div');
    lbl.textContent = c.label;
    lbl.style.cssText = 'color:#ffcc44;margin-bottom:4px;';
    wrap.appendChild(lbl);
    const canvas = document.createElement('canvas');
    canvas.width = 16 * SCALE; canvas.height = 16 * SCALE;
    canvas.style.cssText = 'image-rendering:pixelated;border:1px solid #888;background:#000;';
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, c.col*16, c.row*16, 16, 16, 0, 0, 16*SCALE, 16*SCALE);
    wrap.appendChild(canvas);
    overlay.appendChild(wrap);
  }

  // MODE B: full-sheet picker with grid + col/row labels (when exploring
  // an unfamiliar sheet). Loop all cols × rows, draw labels, render at 3-5x.
  // See bb49ee7 in Violencetown for the exact code.
})();
```

**Take a screenshot of the overlay.** That screenshot is now your tile-identification reference for this entire session.

### Phase 4 — Edit `sprites.js`, hard-reload
Edit the broken coord in `sprites.js`. Save. **Hard-reload with `Ctrl+Shift+R`** — regular reload caches ES modules and your change won't appear.

### Phase 5 — Screenshot, compare, iterate
Take a new screenshot. Compare to baseline from Phase 1. If the new tile still looks off, return to Phase 3 with new candidates. Most coords need 1–2 iterations to land.

When the round feels "done" (significant visible improvement, no obvious next-step), mark it complete and pick a new round target.

---

## Round prioritization template

In rough order of impact:

| Round | Goal | Why first |
|---|---|---|
| 1 | Floors / walls / dominant terrain | Visible on every frame; biggest perceived change |
| 2 | Player + frequent enemies | The eye locks onto characters; placeholder reads as "broken game" |
| 3 | Items + props | Adds detail; fixes letter-box fallbacks |
| 4 | If sheet is wrong genre → source a better pack | Sheet-shopping beats coord-fighting |
| 5 | Edge polish (food sprites, sub-systems, NPCs) | Diminishing returns; stop when "significant upgrade" achieved |

Stop at 3–5 rounds. If you're past round 5 and still iterating, the sheet itself is the problem (see Round 4).

---

## Kenney pack quick reference

(Paths under `KenneyAssets\2D assets\<pack name>\`)

| Pack | Best for |
|---|---|
| **Roguelike Dungeon** | Sewer/dungeon tiles, water/sludge, props (rocks, mushrooms, skulls) |
| **Roguelike Characters** | Slimes (cols 0-1 rows 0-3), humanoid NPCs (cols 0-1 rows 5+) |
| **Roguelike City Pack** | Town tiles — buildings, asphalt road, sidewalks, grass, cars, trees, manholes |
| **Roguelike Interior Pack** | Furniture, indoor scenes |
| **Roguelike Base Pack** | ⚠️ **Avoid for terrain** — uses 2-cell pairs that render as split stripes at single-tile use |
| **Micro Roguelike** | Tiny 8×8 variants if you want pixel-tighter art |
| **RPG Urban Pack** | Alternative urban set; haven't audited yet |

To vendor a new pack:
```bash
cp "<KenneyAssets path>/<pack>/Tilemap/tilemap_packed.png" \
   "<project>/game/assets-placeholder/kenney/<short_name>_packed.png"
cp "<KenneyAssets path>/<pack>/License.txt" \
   "<project>/game/assets-placeholder/kenney/<short_name>_LICENSE.txt"
```

Then add to `SHEETS` in `sprites.js`:
```js
const KENNEY_<SHORT> = `${K}/<short_name>_packed.png`;

export const SHEETS = {
  // ...existing...
  <shortName>: { src: KENNEY_<SHORT>, frameW: 16, frameH: 16 },
};
```

And reference in your tile-map entries with explicit sheet field:
```js
{ sheet: '<shortName>', col: X, row: Y }
```

---

## Gotchas worth remembering

1. **`Ctrl+Shift+R` always.** ES module cache is the #1 reason "my changes didn't apply".

2. **Empty cells exist.** A coord landing on an empty area of a sheet → renderer fallback (usually a colored rectangle). Violencetown's player was at `(4,0)` which is empty on the char sheet for almost 2 versions. The "green player rectangle" was a fallback, not a sprite.

3. **Visual previews lie.** A sheet's preview PNG zoomed to fit looks tidy; the actual 16×16 cells have transparent edges, built-in borders, and 2-cell pairs the preview hides. Always picker-overlay before picking coords.

4. **Sheet design > coord precision.** If iteration feels like fighting the sheet, the sheet is the wrong fit. Round 4 in Violencetown was the biggest win not because of better picks, but because of a better PACK.

5. **Viewport may fight you.** Chrome MCP defaults can land you in narrow tablet-emulation mode. `window.innerWidth` tells you; `resize_window` may need 2 tries; sometimes hard-reload kicks it into landscape.

6. **Touch only `sprites.js`.** If a round requires renderer changes, that's a separate kind of work (architecture, not polish). Defer it — write a tech-debt note instead.

---

## Kickoff prompt

Paste into Claude (any model) to bootstrap a fresh polish session:

> Polish session for [PROJECT] sprites. Repo at `<repo-path>`. Follow the workflow in `plans/sprite-polish-playbook.md`: baseline screenshot via Chrome MCP at localhost:<PORT>, identify worst-offender sprites in `game/sprites.js`, build tile-picker overlay to pick correct coords, hard-reload, screenshot, compare, iterate. Do 3-5 rounds covering [SCENE / ZONE / SPRITE CATEGORY]. Auto mode, don't commit unless asked.

---

## Reference: Violencetown's v0.4.3 polish session

The first run of this workflow shipped as `game-v0.4.3` (commit `bb49ee7`). 5 rounds, all changes localized to `game/sprites.js` + the City Pack PNG. Sewer went from "TV-monitor grid" to readable cracked-stone dungeon; town went from gray fallback void to actual city with brick buildings and lane-marked asphalt.

See the annotated tag for the full release notes:
```bash
git show game-v0.4.3
```
