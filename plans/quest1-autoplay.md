# Parked: the quest-1 autoplay — a player who finishes quest 1 on their own

**Parked:** 2026-09-15, at Caelan's word: the autoplay goes on the `plan` branch, tabled for now.
**Status:** an idea with its framing and its open questions. Not a spec; no design pass has run.
**Where it came from:** Caelan, 2026-09-14, reviewing the fight-fog lab. On `dev` it is follow-on
piece 1 of `plans/fight-fog.md` and card **Q1** in `plans/roadmap-2026-09.md` §4 and on the
roadmap board, both marked tabled with a pointer here.

> **Caelan, 2026-09-14:** *"I really like the idea of this lab, but it's kind of hard to tell what's
> going on or what's happening without an auto fight mode. Maybe a simulated mode of what the player
> would do for quest 1 and how they would complete it. I almost think having a standard profile of
> how a single player might complete quest 1. From an eval and product manager standpoint, trying
> to build an eval, I think completing quest 1, having a set of steps to do that, and having it on
> autoplay for me to be able to see things (and for you to be able to test things and balance
> things) would be a cool concept."*

Quest 1 is `fix_car`, *A Working Car* (`game/quests.js`): the main quest, started
deterministically when a new game reaches Town.

## What it is for

- **Watching.** Caelan reviews builds by watching them, in the Browser pane or as GIFs on his phone.
  A run he can press play on replaces staging a scene by hand.
- **An eval.** After any change: does quest 1 still finish, and how? Turns taken, damage taken, gold
  spent, fights entered, deaths. A regression shows up as a number moving, not as a bug found weeks
  later.
- **Balance.** The same run under different numbers (enemy HP, prices, fight length) says what a
  change does to the game as it is played, where `tools/balance-harness.mjs` lints only the tables.

## Open questions for the design pass

1. **The route.** Quest 1's steps as a script, or a goal-driven player that finds its own way? A
   script is cheap and brittle; a planner survives map edits.
2. **The profile.** One standard player, or several (a fighter, a sneak, a talker)? Caelan asked for
   "a standard profile"; the others are the natural second step.
3. **Where it runs.** In the page, through the game's own loop, watchable in the Browser pane; and
   headless, as an eval that runs on every change.
4. **Replays.** Seeded, so a failed run replays exactly: `game.rng`, `Math.random`, and any
   wall-clock timing (`performance.now`).
5. **What a run records.** Finished or not; turns; HP lost; gold; fights; deaths; how long each quest
   stage took. One table per change, or a trend over releases?
6. **An LLM player, later.** Claude playing through the same interface, as a harder eval. Not the
   first version.

## What it would build on

- **`window.__game` drives everything** — `_loadMap`, `combatAttack`, `_advanceWorld`, `_render` —
  and the game's real input handler takes page `KeyboardEvent`s keyed by `code`. (The Browser
  pane's own key action does not reach a hidden pane; page events do.)
- **The fight-fog capture page** (`plans/fight-fog-implementation.md` on `dev`, Task 8): a
  gitignored page that stages a scene through the game's own paths, freezes `performance.now`, and
  renders frames for headless Chrome's `--dump-dom`, turned into GIFs with PIL. The autoplay's
  watch mode could reuse it whole.
- **`tests/quest-flow.test.js`** already drives the real `QuestEngine` through the `fix_car`
  critical path with a fake game stub — the stage list, in node.
- **`tools/balance-harness.mjs`** for the table side of balance.

## When it comes back

It starts with the design pass (brainstorm, then spec, then plan), and the spec lives on `dev`
beside the code, per CLAUDE.md. Move this file there as the starting point.
