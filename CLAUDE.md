All feature planning and development follows the 4-gate pipeline defined in GAME_STUDIO_PLAN.md. Read it before starting any feature work.
Always develop on the dev branch.
Always plan on the plan branch.

## Branch & merge hygiene — keep merge conflicts small

Merge pain here comes from long-lived feature branches that all edit the SAME core files
(`main.js`, `wheel-model.js`, `trade.js`, `give-action.js`) getting merged at different times,
after dev has moved on underneath them. Two levers control it:

1. **Merge a finished, verified branch to dev PROMPTLY** — before starting the next feature that
   touches the same core file. Short-lived branches barely conflict; a branch that touches core
   files and sits unmerged while dev advances accrues conflict debt that grows every time dev moves.
2. **Parallelize only FILE-DISJOINT work.** If the next feature will rewrite the wheel model or the
   economy, don't build it beside another *unmerged* branch that touches the same file — merge that
   one first so the new work builds ON TOP of it.

**Before starting sweeping changes to a core file** (`main.js`, `wheel-model.js`, `trade.js`,
`give-action.js`, the economy, the wheel model): run `git branch --no-merged dev`, and for any
unmerged branch check `git diff dev <branch> --stat` for overlap with the file you're about to
rewrite. If one overlaps, FLAG it to Caelan *before* the change — "merge it first, or reconcile
later?" — his call, but surface it up front, not after the collision.

**A merge is done when the game RUNS, not when the conflict markers are gone.** Git auto-merges by
line, so it silently drops a needed import or lets one side's method win — this bit us twice (a
dropped `applyGive` import; a dropped closing brace), both invisible to "0 conflict markers" but
fatal at runtime. After every merge + conflict resolution: restart the dev server, load the game,
check the console for errors, and smoke-test the touched systems BEFORE committing.

## Repo location

The canonical working copy lives at **`C:\Projects\violencetown`**. An older `C:\Users\caela\OneDrive\Desktop\violencetown` exists but is abandoned (OneDrive sync froze it on an old snapshot mid-session). Do not pull from or commit to the OneDrive path.

## Dev server

Use `python dev-server.py 3001` (the wrapper next to the repo root) — not `python -m http.server`. The wrapper:
- Sets `Cache-Control: no-store` on every response.
- Rewrites `<script src="...js">` in served HTML to add a `?dev=<token>` cache-buster.
- Rewrites every relative `import ... from './x.js'` in served JS to carry the same query.

Together this cascades fresh module URLs through the browser on every server restart, bypassing the per-realm ES module cache that ignores `Cache-Control` once a URL is mapped. Cloudflare Pages (prod) ignores this — local-only.

The `.claude/launch.json` already points at this script via absolute path.

## Naming

The game's name is always one word: **Violencetown**. Never "Violence Town", "violence-town", or "violence_town". Casing varies by context (Title in prose, ALLCAPS for the splash, lowercase for identifiers / URLs / branch names); spacing does not.

Citizens of the game are **Violencians** — this is the in-fiction demonym and is correct as written; do not "fix" it.

Before merging, run `git grep -iE 'violence[ _-]+town'` from the repo root — it must return zero lines (excluding this CLAUDE.md, which contains the rule definition).

## Recent infrastructure (since v0.8.0)

- **Bitmap pixel font** at `game/assets/font_8x8.png` rendered via `game/bitmap-font.js` (`BitmapFont.drawText(ctx, text, x, y, opts)`). Loaded once on init, stashed on `renderer.font`. Plain ASCII 32–126.
- **Procedural 9-slice ornate panel** at `game/assets/ui_panel.png` (48×144, three variants: base / dark / glow). `drawPanelBig` / `drawPanelSmall` in `game/ui-sprites.js` consume it. Pass `this.uiSheet` when calling so panels render with the chrome instead of the flat fallback.
- **Sprite picker** at `game/sprite-picker.html` — open in browser, pick a Kenney sheet, click any cell to copy `{ col, row }` to clipboard. Use this when adding/swapping sprite picks instead of counting pixels in an image viewer.
- **Kenney roguelike sheets carry a 1px gutter between cells.** The `SpriteSheet` class in `game/sprites.js` already honors this via the `padding` constructor arg (default 1 for every roguelike sheet, 0 for the packed City sheet). When adding new SpriteSheet entries from a roguelike pack, set `padding: ROGUELIKE_PAD`. The `(col, row)` coords are picked against this corrected stride.
- **Generation scripts** live in `tools/`:
  - `tools/gen_font.py` — regenerates the bitmap font atlas.
  - `tools/gen_ui_panel.py` — regenerates the 9-slice panel atlas.
- **Player resources:** HP (red bar) / MP (cyan bar, currently inert) / GP (Gold Card pill). All three live on the `_drawHPPanel` surface. GP is the same value as `game.gold`. See `plans/gold-card.md` for the in-universe lore the Gold Card is intended to grow into.
