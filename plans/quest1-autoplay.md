# Q1 — the quest-1 autoplay: a player who finishes quest 1 on their own

**Status: RULED 2026-09-21 — Caelan took every recommendation in §7 ("all recommended"). Build
order §6; implementation plan `plans/quest1-autoplay-implementation.md`.** Un-tabled at his word on 2026-09-21, while he was at work
and could not play, which is the situation this tool exists for. Moved to `dev` from
`plan:plans/quest1-autoplay.md` (parked 2026-09-15), whose framing and open questions it keeps.

> **Caelan, 2026-09-14:** *"I really like the idea of this lab, but it's kind of hard to tell what's
> going on or what's happening without an auto fight mode. Maybe a simulated mode of what the player
> would do for quest 1 and how they would complete it. I almost think having a standard profile of
> how a single player might complete quest 1. From an eval and product manager standpoint, trying
> to build an eval, I think completing quest 1, having a set of steps to do that, and having it on
> autoplay for me to be able to see things (and for you to be able to test things and balance
> things) would be a cool concept."*

## 1. What it is for

- **Watching.** Caelan reviews builds by watching them — in the Browser pane, or as GIFs on his
  phone. A run he can press play on replaces staging a scene by hand.
- **An eval.** After any change: does quest 1 still finish, and how? Turns, HP lost, heals, gold,
  fights, deaths. A regression shows up as a number moving, not as a bug found weeks later.
- **Balance.** The same run under different numbers says what a change does to the game *as
  played*. `tools/balance-harness.mjs` lints the tables; this plays them.
- **Claude's hands.** Most of what is left on the roadmap needs Caelan's eyes. A replayable run is
  how a change gets checked while he is away from the screen.

## 2. Quest 1, read off the maps

Quest 1 is `fix_car`, *A Working Car* (`game/quests.js`), started by `_startMainQuest` when a new
game reaches Town. Every fact below was read from the map JSON and the code on 2026-09-21.

| Stage | Advances on | What the player does |
|---|---|---|
| `examine_car` | `examine { targetId: 'car' }` | Walk from spawn (16,12) to the car examinable (24,6), face it, press E. |
| `recover_converter` | `item_pickup { id: 'catalytic_converter' }` | East through a Town transition (x 32, rows 10/12/14) into the Sewer at (1,10). The converter is **not** on the floor: it drops where the `wererat_boss` dies (`main.js` ~4425). The Wererat stands at (17,10), past a Violet Fungus at (12,9) and (13,11) and the Fungus King at (15,10) — all on or beside row 10, the straight line to the boss. Kill it, step on the drop. |
| `escape_sewer` | `map_entered { map: 'town-map.json' }` | The set-piece fires (`sewer-setpiece.js`): the fungi become rats, a portcullis drops at (13,10), a barricade fills column 1 (rows 9-11, 2 bumps a cell), and rats come in two waves (10, then 5 more once 5 are down). Bump through the barricade, exit west at (0,10). |
| `return_to_car` | `interact_car` | Back to the car holding the converter; interacting installs it and completes the quest (`_interactCar` force-completes, so a dropped event cannot soft-lock it). |

**Things a naive player would get wrong:** Macc (24,10) will pay 500 for the converter
(`specialBuys`) — selling it is a way to lose the quest item. The Sludge Bloom (3,3), the Carrion
(8,17) and the cape grate (11,6) are off the route. Whether the standard player can *beat* the
Wererat at all is unknown — see §8; if it cannot, that is the eval's first finding, not a bug.

## 3. The finding that shapes the design: the game runs on the wall clock

All game-state randomness already goes through the seeded `game.rng` (`rng.js`'s determinism
rule; in the game, `Math.random` touches only audio and the per-frame screen shake — even the
event-word scatter draws from `game.rng`, once per event). So a seed *should* replay a run. It does not, because of time:

- The **free-roam heartbeat** is a `setInterval` of `WORLD_TICK_MS` (500 ms of real time). Each beat
  advances the day clock and, when you stand idle, runs the ambient NPCs — whose wander targets are
  picked from `game.rng` (`npc.js` ~686). How many beats land between two player actions depends on
  how long the player took.
- **Movement** is a `requestAnimationFrame` slide of `_MOVE_MS` (150 ms); a turn resolves only when
  the slide settles.

**Measured 2026-09-21** in the running game: RNG state set to 42, no input, then wait. After 0.6 s
the state was still 42; after 3 s and 6 s it had reached two *different* states and the townsfolk
had moved. Same seed, same inputs, different runs.

So the autoplay has to **own time**. A virtual clock, installed before the game boots, replaces
`performance.now`, `requestAnimationFrame`, `setTimeout` and `setInterval`; the autoplay advances
it. Two properties fall out:

1. **Replays are exact.** Seed + policy + clock schedule = one run, every time.
2. **The run you watch is the run the eval measured.** Headless, the clock advances as fast as the
   CPU allows. Watching, the *same* virtual timeline is paced against real time (at a speed you
   choose). Same numbers either way.

## 4. Three ways to get the player through the route (ruling Q1-1)

**A. A tape** — a recorded list of keys or coordinates. Cheapest, and exactly reproducible. Breaks
on any map edit or wheel reorder (Defend moved from Trick to Fight today; a tape of wheel
positions would already be stale). Says nothing when it breaks except "stuck".

**B. Goals and skills — recommended.** One short authored table maps each quest stage to a *goal*
named by id, not by coordinates: "examine the examinable `car`", "reach the map
`sewer-map.json`", "kill the enemy tagged `wererat_boss`", "pick up `catalytic_converter`", "reach
`town-map.json`", "interact with the car". Generic *skills* do the rest from live map data: path
across maps (the existing `findPath` BFS plus each map's `transitions`), fight whatever hostile is
adjacent or blocking, heal below a threshold, pick up what is underfoot, bump a barricade. Survives
map edits and wheel reorders; when it fails, the failing goal is the diagnosis.

**C. A planner or an LLM player.** Search over game states, or Claude choosing actions. The most
general and the least reproducible. A later eval (§7, Q1-7), not the first version.

## 5. The design (as recommended)

### 5.1 Pieces

| Piece | Job | Tested how |
|---|---|---|
| `game/autoplay/clock.js` | The virtual clock: `now`, `raf`, `setTimeout`, `setInterval`, and `advance(ms)` / `settle()`. Pure. | node, directly |
| `game/autoplay/route.js` | The one authored table: `fix_car` stage id → goal. The only file that knows quest 1. | node: every stage in `QUESTS.fix_car` has a goal, every id it names exists in the maps |
| `game/autoplay/player.js` | The standard profile: given a game-shaped view and a goal, return the next action. Pure over its input. | node, with stub games, the way `tests/*` already drive main.js methods |
| `game/autoplay/run.js` | The driver, in the page: seed, reset, loop *act → settle*, record, detect stuck, report. | the headless run itself |
| `game/autoplay/boot.js` | Loaded before `main.js`. Does nothing unless the URL has `?autoplay`; then installs the clock and the isolation (§5.4) and hands off to `run.js` once the game is up. | the headless run |
| `tools/autoplay.mjs` | Headless runner: serves `game/`, launches the installed Chrome over the DevTools protocol (Node 24's built-in `WebSocket` — still zero dependencies), runs, prints the table, exits non-zero on a failed or drifted run. `npm run autoplay`, `npm run autoplay:check`. | it is the check |
| `tools/autoplay-golden.json` | The committed baseline, like `balance-golden.txt`. | — |

### 5.2 How it acts

**Movement, E and pickups go through real key events** (`KeyboardEvent` by `code`, dispatched on
the page, which the game's handler already accepts). The input stack is exactly what has broken
before while the suite stayed green, so the autoplay should use it. **Wheel verbs are addressed by
key path** — `fight.melee.hit`, `treat.eat` — through the same wheel-model functions the handler
calls, never by slot position. The keys are stable when the wheel is reordered; positions are not.

### 5.3 Seeds

`_fullReset` gains one optional argument: `_fullReset({ seed })` builds `new RNG(seed)` instead of
a random one. That is the whole seam. `tests/restart.test.js` (v0.24.0) already proves a reset
leaves a game identical to a fresh one, so "reset, then play" is a trustworthy start. Map loading
consumes no RNG (spawns are authored), so seeding at reset covers the whole run.

### 5.4 Isolation — it must never touch a real player's game

In autoplay mode: no autosave, and no `localStorage` writes of any kind (the save, settings and
the seen-hints list all live there), audio muted. Critical if watch mode ships to the live site
(Q1-3): a player who opens the autoplay link must find their own save untouched. A real key press
or tap (`event.isTrusted` — the autoplay's own dispatched keys are not) stops a watched run and
returns control.

### 5.5 What a run records (ruling Q1-5)

Per stage and in total: **finished or not** (and if not, the goal it stuck on), virtual turns, HP
lost, heals used, gold in and out, fights entered, deaths, and the seed. Stuck = no progress on
the current goal in 60 virtual turns (a starting number; stage 4 tunes it per goal once real runs
show how long each takes). A run is **checked** the way `balance:check` is: against a
committed golden, where any drift is shown and a failure to finish is an error.

## 6. Build order — each stage stands alone

1. **The clock**, pure and node-tested.
2. **Determinism, proved.** `_fullReset({ seed })`, the boot hook, isolation. Proof: the same seed
   and the same scripted moves, run twice with different real-time gaps, end in an identical game
   state. This is the §3 measurement turned into a passing check.
3. **The runner.** `tools/autoplay.mjs` drives a trivial policy headless — walk to the car, press E
   — and quest 1 stage 1 completes. Proves Chrome + DevTools protocol + clock end to end.
4. **The player.** Skills and the route table; quest 1 end to end.
5. **The record.** Metrics, golden, `autoplay:check`.
6. **Watch mode.** Speed, an on-screen `AUTOPLAY · seed 42 · x4` label, stop on any key, GIF
   capture reusing the fight-fog capture page's pattern.

Stages 1-3 carry the engineering risk; 4 is where the game gets learned. Stop after 3 and the
repo already has replayable, headless runs of anything scripted.

**Stages 1-3 BUILT 2026-09-21** on `feature/quest1-autoplay` (`plans/quest1-autoplay-implementation.md`).
`npm run autoplay` plays quest 1's first stage headless. Measured, seed 1, script `car`:

| Run | Clock | Real time | End states |
|---|---|---|---|
| 3 runs, random real pauses (`--repeat=3 --jitter`) | virtual | 1.86 / 2.01 / 1.89 s | **one** — `68ed5a69` |
| the control, same (`--clock=real`) | wall | 8.4 / 8.7 / 8.7 s | **three** — `a1243c6f`, `687be416`, `ec8c3e50` |
| seed 2 | virtual | 0.84 s | `1e0b8131` |

The same seed also ended on `68ed5a69` in two Browser-pane runs — a second browser, and a hidden
pane whose own animation frames were frozen. The control is what makes the first row mean
something: the check demonstrably fails when time is not owned.

## 7. Rulings — all ruled as recommended, 2026-09-21

| # | Question | Ruled | Why |
|---|---|---|---|
| **Q1-1** | How does the player find the route? | **B, goals + skills** (§4) | Survives map edits and wheel reorders; a stuck goal names the problem. A tape went stale the day Defend moved. |
| **Q1-2** | One profile or several? | **One standard fighter first**, its behaviour set by a few named knobs (heal below 40% HP; fight what blocks the path, walk past what doesn't). A sneak and a talker later, as knob settings where possible. | You asked for "a standard profile". Knobs make the next profiles cheap without designing them now. |
| **Q1-3** | Where does it run — and does watch mode ship on the live site? | **Both, from one code path**: headless for the eval, in-page for watching. **Ship watch mode live** behind `?autoplay`, isolated per §5.4. | You could watch a run on your phone at work from the real URL — no local server, no GIF round trip. Cost to every other player: one small module fetch. |
| **Q1-4** | How are replays made exact? | **The virtual clock + a seed** (§3, §5.3), in watch mode too. | Measured: a seed alone does not replay. With the clock in both modes, what you watch is what the eval scored. |
| **Q1-5** | How is a run judged? | **A committed golden and a check command** (`npm run autoplay:check`), like balance. A trend across releases can come later from the same JSON. | The balance golden is already the pattern that works here; drift is a signal, not a failure, until finishing breaks. |
| **Q1-6** | Is it part of `npm test`? | **No.** A separate command. | It needs Chrome and takes seconds; the suite is pure node and runs in about a second, and cloud routines (no browser) can still run the suite. |
| **Q1-7** | Canonical route only, and an LLM player when? | **Canonical only in v1** (never sells the converter, skips the optional content). **LLM player later**, through the same small action vocabulary. | One route makes the golden meaningful; a stable action vocabulary is what an LLM player would need anyway. |

## 8. Unknowns to settle while building, not before

- **Can the standard fighter beat the Wererat?** Unknown. If a plain Hit-and-heal player loses,
  that is the autoplay's first balance finding, and the ruling is Caelan's (tune the fight, or
  give the profile a smarter skill).
- ~~**Overriding `localStorage` in the page.**~~ **Settled:** `boot.js` overrides
  `Storage.prototype`'s methods with a memory store. Proved both ways in the running game: a run
  autosaved (turn 11) into memory, and the port's real `localStorage` held no save afterwards.
- ~~**Headless frame cost.**~~ **Measured:** every frame still renders, and 5.2 s of game time
  (12 turns plus a 3 s idle) plays in about 0.85 s of real time, page load included — roughly 6x
  real time. A whole quest of a few hundred turns should take seconds.
- **Local only.** The eval needs a Chrome, so it runs on this machine, not in cloud routines.
- **Coupling.** The autoplay reads `window.__game` internals. Mitigated by acting through named entry
  points (key codes, wheel keys) and a source-derived test that those entry points exist.

## 9. What it is not

Not a test in `npm test`. Not a bot for Chapter Two (the canyon and the delivery are later route
tables on the same skills). Not an LLM player. Not new game content, and no gameplay change beyond
the one `_fullReset({ seed })` seam.
