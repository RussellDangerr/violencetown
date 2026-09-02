Feature work is *guided* by the 4-gate pipeline in GAME_STUDIO_PLAN.md (Research → Design →
Development → Polish). Treat it as a checklist that catches real mistakes, not a ceremony to
perform — scale it to the size of the change. It exists to facilitate development, not hinder it.

**Branches:** develop on `dev`. Specs and plans live in `plans/*.md` on `dev` as well, committed
beside the code they describe — that is where every recent spec actually lives. (The legacy `plan`
branch is badly diverged and is no longer the planning surface; don't write new plans there.)
Feature branches remain the norm for substantial work, and Caelan makes the merge-to-`dev` call.

**What survives the session is what got committed.** Any decision worth keeping goes into a file
before the conversation ends — the repo is the source of truth, not the chat history.

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

## Dev server

Use `python dev-server.py 3001` (the wrapper next to the repo root) — not `python -m http.server`. The wrapper:
- Sets `Cache-Control: no-store` on every response.
- Rewrites `<script src="...js">` in served HTML to add a `?dev=<token>` cache-buster.
- Rewrites every relative `import ... from './x.js'` in served JS to carry the same query.

Together this cascades fresh module URLs through the browser on every server restart, bypassing the per-realm ES module cache that ignores `Cache-Control` once a URL is mapped. Cloudflare Pages (prod) ignores this — local-only.

The `.claude/launch.json` already points at this script via absolute path.

Note the dev server's document root is **`game/`, not the repo root** — a file at `game/foo.html` is
served at `http://localhost:3001/foo.html`.

## Tests (corrected 2026-08-23)

**Node is installed here** — `node v24.18.0`, `npm 11.16.0`. `npm test` runs the whole suite locally
via `node --test`; a single file is `node --test tests/<name>.test.js`. Baseline as of 2026-08-23:
**404 tests, 87 suites, 0 failures, ~400ms.**

Several older docs — `plans/defeat-scenarios*.md`, `plans/remembrance-rings*.md`,
`plans/pd3-ai-consolidation*.md`, `plans/ring-builds-ability-axis.md`,
`plans/interaction-ui-polish.md` — say "no local Node" and mark their node tests UNRUN. That was true
when written and is **stale**: those tests have since been run and all pass. Don't inherit the claim,
and don't plan around it.

(`npx --no-install node --test …` fails here — npx tries to fetch a different node. Call `node`
directly.)

## Naming

The game's name is always one word: **Violencetown**. Never "Violence Town", "violence-town", or "violence_town". Casing varies by context (Title in prose, ALLCAPS for the splash, lowercase for identifiers / URLs / branch names); spacing does not.

Citizens of the game are **Violencians** — this is the in-fiction demonym and is correct as written; do not "fix" it.

A **Poition** is the consumable category added in v0.20.0 — a deliberate portmanteau of *poison* and *potion*, because the same object is one or the other depending on who drinks it. Spelled `poition` everywhere (id, field, prose); it is not a typo for either parent word, and do not "fix" it.

**`defence`** is British-spelled, like the demonym above — in the `poition.stat` value, item ids, prose and code. Never `defense`.

Before merging, run this from the repo root — it must return zero lines:

```bash
git grep -iE 'violence[ _-]+town' -- ':!CLAUDE.md' ':!plans/item-hotbar-xmb-implementation.md'
```

Both exclusions are files that *quote the rule itself* rather than violate it.

## Recent infrastructure (since v0.8.0)

- **Bitmap pixel font** at `game/assets/font_8x8.png` rendered via `game/bitmap-font.js` (`BitmapFont.drawText(ctx, text, x, y, opts)`). Loaded once on init, stashed on `renderer.font`. Plain ASCII 32–126.
- **Procedural 9-slice ornate panel** at `game/assets/ui_panel.png` (48×144, three variants: base / dark / glow). `drawPanelBig` / `drawPanelSmall` in `game/ui-sprites.js` consume it. Pass `this.uiSheet` when calling so panels render with the chrome instead of the flat fallback.
- **Sprite picker** at `game/sprite-picker.html` — open in browser, pick a Kenney sheet, click any cell to copy `{ col, row }` to clipboard. Use this when adding/swapping sprite picks instead of counting pixels in an image viewer.
- **Kenney roguelike sheets carry a 1px gutter between cells.** The `SpriteSheet` class in `game/sprites.js` already honors this via the `padding` constructor arg (default 1 for every roguelike sheet, 0 for the packed City sheet). When adding new SpriteSheet entries from a roguelike pack, set `padding: ROGUELIKE_PAD`. The `(col, row)` coords are picked against this corrected stride.
- **Generation scripts** live in `tools/`:
  - `tools/gen_font.py` — regenerates the bitmap font atlas.
  - `tools/gen_ui_panel.py` — regenerates the 9-slice panel atlas.
- **Player resources:** HP (red bar) / MP (cyan bar) / GP (Gold Card pill). All three live on the `_drawHPPanel` surface. GP is the same value as `game.gold`. **MP is live** — spells spend it (fireball 12, coneOfCold 10, boo 8) and a `mana_poition` restores it; an older note here called it inert, which it has not been for some time. See `plans/gold-card.md` for the in-universe lore the Gold Card is intended to grow into.

## Planning surface (corrected 2026-07-25)

Specs and plans for work being *done* live in `plans/*.md` on `dev`, beside the code. The **`plan` branch is still used** — for parking work that is *not* being done: backlogs, open rulings, ideas deliberately deferred. Its latest is `plans/next-session-open-work.md`. Read it with `git show plan:plans/next-session-open-work.md` rather than checking the branch out; it is badly diverged from `dev`, so use `git worktree add` if you need to write to it.

(An earlier note here said not to write new plans on `plan` at all. That over-corrected — the distinction is active-work vs parked-work, not "never".)
