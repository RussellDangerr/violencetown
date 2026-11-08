# AL2 — the loops run reloads through CONTINUE

## Goal

The loops run (plans/al1-autoplay-loops.md) picks things up, equips, drops, sells and buys. A
player who does all that and then reloads the page expects CONTINUE to give it all back. Nothing
checks that today. After its trading, the loops run now reloads the page, presses CONTINUE on the
title with a real key, and checks that what it carried, wore and owned came back.

Nothing in the game changes. This is tooling: `game/autoplay/`, `tools/autoplay.mjs` and the
loops entry of the autoplay golden.

## What the run does

1. Plays the loops steps as before, up to and including the sell and buy at Puck.
2. Notes what it holds: the bag (slot by slot, with counts), every worn slot, the gold, the
   active quest and its stage, and where it stands (map and tile).
3. Asks the driver to reload the page. `tools/autoplay.mjs` reloads it over the DevTools protocol
   (`Page.reload`). The game saves on the way out, as it does for any player who leaves the page
   (save-on-leave, FX24).
4. On the new page, the title shows CONTINUE. The run presses Space, the key a player presses
   there, and waits for the save to load.
5. Compares what it holds now with what it noted. Any difference fails the run and names the
   field, as "was -> now".
6. Runs the loops end-state checks (whip worn, rock bought, sword and Fire Blood gone) on the
   reloaded game.

The autoplay walls a run off from the real `localStorage` with an in-memory store, which a reload
would wipe. So `boot.js` carries that store across the reload in `sessionStorage`, under one key,
written on `pagehide` after the game's own save and read back (and removed) by the next page.
The carry also holds the run so far (stage scores, the trades, deaths), so the report covers the
whole run.

## The check can fail

- `--break=<path>` (for example `--break=player.gold`) corrupts that field of the carried save
  before the new page reads it. The run must then fail and name what was lost.
- `tests/autoplay-reload.test.js` proves it in node: a real `serialize` of a stand-in game, the
  same corruption, a real `loadInto`, and the comparison reports the broken field. With nothing
  broken it reports nothing.

## Acceptance

- `npm run autoplay -- --script=loops` reloads mid-run, continues, and everything it checks
  matches before and after.
- A deliberately broken save field makes the run fail (node test above, and `--break`).
- The quest and sneak golden entries are unchanged byte for byte.
- Evidence: a GIF of the reload and CONTINUE.
- The loops golden entry is re-recorded in its own commit citing ruling AL1R1 (by the loop, not
  this build). Quest and sneak stay byte for byte.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` pass, except the expected
  loops-entry drift until it is recorded.

## Rulings it rests on

- **AL1R1** — the loops entry is recorded in the autoplay golden in its own commit citing the
  ruling. Pick: yes.

## Out of scope

- Any change to the game, its save format or save-on-leave.
- Reloading in the quest or sneak runs.
- Checking fields beyond the five named (bag, worn gear, gold, quest stage, position).
- A reload by tap or pointer; the title is left by key only.
