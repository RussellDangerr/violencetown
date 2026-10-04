# Trim — batch 1: records, cuts and one clock

**Status:** spec, not built. Branch `chore/trim`, cut from `dev` at `df65952`.

## Why

On 2026-10-03 Caelan ruled on 146 cards in a trim pass. The cards covered the half-built systems
in the game, the parts of the world that still run on real seconds, every unbuilt idea in the
planning docs, and every open roadmap ruling. His words for the goal: slim the game down to what it
is actually becoming, and drop the elements that never got fleshed out or no longer fit how turns work.

Batch 1 is the first group: the foundation the later work builds on, plus standalone wins that
need no new art and no new design. It has four stages on two branches. The rest of the ledger
(features to finish, ideas he wants soon, ideas for someday) stays outside the repo until each one
gets its own branch, per CLAUDE.md.

## What batch 1 does

| Stage | What | Branch |
| --- | --- | --- |
| 1 | Write the rulings into the docs that own them | `chore/trim` |
| 2 | Cut what he ruled out, and the dead code nobody can see | `chore/trim` |
| 3 | One clock: game state moves when you act, never on wall time | `fix/one-clock` (after `chore/trim` merges) |
| 4 | Three small wins: placed poitions, scoped theft cones, edge trees behind | `chore/trim` |

Stage 3 gets its own branch because it is the only stage that changes how the game plays and will
move the autoplay golden. Stages 1, 2 and 4 should leave both goldens unchanged, apart from the
deliberate poition placement (see 4a).

---

## Stage 1 — records (docs only)

The rulings, as Caelan made them:

| Question (old code) | Ruling | Written into |
| --- | --- | --- |
| Unused "bruiser" balance tier (A1) | Fold it into its neighbours | roadmap §2; cut in stage 2 |
| Poisoning's opinion penalty (A2) | Fine as is | roadmap §2 |
| Carnival ground shares Town's road (CG) | Give the Carnival its own ground | roadmap §2; art pick, later batch |
| Phone tap targets (P1) | Build a touch layout | roadmap §2; later batch |
| Fight-entrance punch (ENT) | Fine as is: closed | roadmap §2, `entrance-feel-pass.md` |
| Two objectives overflow a phone (OBJ) | Caelan shortens them himself | roadmap §2 |
| Theft aiming shows every cone (V1) | Only cones within the theft's range | roadmap §2; built in 4b |
| Lire has no sprite (V2) | Give it a stand-in picture | roadmap §2; art pick, later batch |
| Sound discoverability (AU) | **No speaker icon.** Sound stays off by default and hidden in Options, as experimental | roadmap §2 |
| Edge filler (SF) | Vary the forest (art, later); draw edge trees behind everything (4c) | roadmap §2, `screen-fill.md` |
| Interior furniture (Z1, Z2) | Later | roadmap §2 |
| TheDangerrZone files (DZ) | **Open:** Caelan's yes needed before deleting (see stage 2) | roadmap §2 |

**Why AU flipped:** Caelan sends the game to family, friends and recruiters, and nothing should blare
when they open it. The sounds are early placeholders, so they stay opt-in in Options.

Turn-model rulings for `plans/turn-model.md`. They don't change batch 1's code; they steer step 2.

| Old code | Ruling |
| --- | --- |
| TM-1, TM-2 | **Yes:** a turn may let you move a little and act, and enemies get the same round |
| TM-5 | Fire Fireball, Cleave and Throw as soon as the target is picked. Drop the extra Space |
| TM-6 | Keep the one-step buffer. Movement still feels rough, so more small movement smoothing is welcome |
| TM-7 | Still open (ties) |
| TM-8 | You act first, on the press; rare fast enemies may interrupt |
| TM-9 | Every character gets a speed number, set per enemy type |
| Cascade verdict | Not played yet |
| Speed Poition | Rework it for the speed order (it currently makes you act *more often*) |

Also in stage 1:
- Mark these docs superseded with a one-line banner (no deletion): `ROADMAP.md` (April's vision),
  `plans/unlimited-moves-item-use.md`, options 1A/1C of `plans/abc-decision-matrix.md`, and the
  "no input buffering" line in `plans/combat-ui-layers.md` (TM-6 kept the buffer).
- Reseed the roadmap board after the merge (`tools/roadmap-board/`).

## Stage 2 — cuts

Before each cut, grep for every reader and writer first. Several of these were found by audit,
and an audit can miss a caller. Old saves are safe: an unknown item id is dropped on load.

| Cut | Where | Tests | Notes |
| --- | --- | --- | --- |
| **Rappel Chain** | `items.js` ~321-331, `sprites.js` ~283 icon, Macc's `stock` in `town-map.json:63`, Macc's "Ask about the canyon" choice `dialogue.js:78-79` | none | Macc keeps `specialBuys` (the converter) and is left with an empty shop list. Check that the offer screen handles a vendor with no stock |
| **Tome of Ray Blast** and the `learn` use | `items.js` 50-64, `case 'learn'` ~560, `resolveLearn` ~588; `main.js:5602` clause; `sprites.js:281` | none | `game._learnSkill` no longer exists, so the path is dead. Tidy the "learn tomes" comments |
| **`game/particles.html`** | tracked in `game/`, so the live site serves it | none | `git rm`; grep that nothing links to it |
| **Bruiser tier** | `tools/balance-harness.mjs:145-151` | `balance-harness.test.js:304` | Armor -29…-15 then falls to `standard`. No enemy sits in that band, so `balance:check` should not move. Show its output |
| **Carrion's pronoun** | `defeat-scenarios.js` `patched_by_carrion` log: "his corner", "he grunts" | — | → her / she (ruled) |
| **Invisible leftovers** | `main.js`: `extraMoves`, `_pendingWalkDir`, `_animFrame`, `ownedItems`, `_findAdjacentDialogueNpc`, `suppressedSkills` (+ its reads in `hasSpell`/`hasTrick`), the `blind` reads (`main.js:4833`, `enemies.js:267`); `buffs.js` "Recover" `pendingHeal`; `map.js` `bossRoom` and the field in `sewer-map.json` | `buffs.test.js` pins Recover (2 tests): remove with it | Verify "written, never read" for each before removing |
| **Stale comments** | `main.js:3` "Bump-to-attack"; `perception.js:214`; `renderer.js:627`; `enemies.js:151` | — | Make them say what the code does |
| **Unused tiles** `GAP` (3), `BOSS_TRIGGER` (7) | `data.js` 11/15, `sprites.js` 216/220, `tile-coverage.test.js` allowlist | allowlist | ⚠ **Overlaps unmerged `feature/tiled-pipeline`** (local only; edits `data.js`, `sprites.js`, `tile-coverage.test.js`). Merge that branch first, or make this the last commit and expect to reconcile |

**Kept on purpose** (they look dead but wait on a ruling, or are test seams):
- Rings, the Fire Ring, Ember Rat, Rat Form, and the ring thief bonuses (`stealLimit`, `noticeBuffer`): rings are an open question.
- Hide: open.
- NPC gift memory (`giftLog`): ideas he wants soon may read it.
- `hudInteractiveRects`, `expandRect`, `areaAt`: tests use them as seams.

**TheDangerrZone** (eight `*-TheDangerrZone.*` files in `game/`): untracked and git-ignored, so they
exist only on Caelan's machine. His rule: something only on his machine gets cleaned up, not
documented. **Recommendation: delete them**, plus the `.gitignore` lines and the test exclusions that
name them. Not done until he says yes: git can't recover an untracked file.

## Stage 3 — one clock (`fix/one-clock`)

**Today** there are two drivers (`main.js` ~607-627 and ~3797-3807). Out of a fight, a 500 ms timer
winds `_worldBeat` on wall time: the day clock, ambient wander and mood fade. In a fight the timer
lets go, and each committed action winds one beat. The result is that standing still changes the
world, and so does the time you spend thinking.

**The ruling:** game state moves when you act, everywhere. The town keeps its look of life: people
still wander on the half-second timer, but that wander can no longer change an outcome's dice.

| # | Change | Where | Ruling |
| --- | --- | --- | --- |
| 3a | **Pause pauses.** The heartbeat returns early while `_paused` | `main.js` ~619 | fix |
| 3b | **Day and night count actions.** `_advanceDayClock` steps once per committed action, in and out of fights, never on the timer. **Save the day clock** (today a reload is always noon) | `main.js` 4088-4098, `_advanceWorld`; `save.js` | switch to turns |
| 3c | **Moods fade per action.** One nudge every `DISPOSITION_DECAY_TURNS` (40) committed actions, everywhere. Remove `DISPOSITION_DECAY_MS` and its accumulator. The open offer partner stays exempt | `main.js` 140-142, 620-622, 3804 | switch to turns |
| 3d | **Wander gets its own dice.** Ambient wander stays on the timer but draws from its own seeded stream (`game.ambientRng`), so thinking time can't change a fight's or a theft's rolls | `resolveAmbientTurns` (`enemies.js`), the `npc.js` wander helpers | keep wander, separate the dice |
| 3e | **A held walk stops at a fight.** Held-key and click-to-walk paths stop when a fight starts or anyone spots you; inside a fight each step needs a fresh press. This also stops walking from cutting off the cascade's blows | `_autoRepeatShouldStop` ~2651, `_onStepSettled` ~2561 | fix |
| 3f | **Buyback lasts until you leave the zone.** Clear `npc._buyback` on `_loadMap` instead of after 5 minutes. Remove the never-drawn countdown (`_buybackRemainingMs`), `_buybackEntry`, the 1 s `_startTradeTimer` redraw loop, and the refund credits nothing spends | `main.js` 131-139, 5774-5781, 6322-6334, 6461-6510 | until you leave the zone |

**Open tuning for Caelan:** how long is a day, in actions? Today it is 3,600 half-second beats.
Quest 1 takes the autoplay 185-213 actions. **Proposal: 600 actions a day.** A quest-1 run then
reaches dusk without a full night, and night (a third less sight for watchers) is something you play
into, not something you wait for.

**Still real-time after this, by choice:** where townsfolk stand and face. Wander moves them on the
timer, so a theft's facing check still depends on when you act. The sewer miners also still pocket
soap from the floor on the timer. The dice are protected, but positions are not. If that bites, the
next step is to wind wander per action too, which is the "switch to turns" option he didn't take.

**Expect golden drift.** Day, decay and the RNG split all change the run. Read the trace: both
profiles must still finish quest 1, and every stage delta must have an explanation. Then
`npm run autoplay:write`. Drift is the signal to read, not to rubber-stamp.

## Stage 4 — small wins (`chore/trim`)

- **4a Place four poitions:** Health, Mana, Gold, Strength (Speed waits on its rework).
  **Proposal:** Puck stocks Health and Mana; Gold sits in a sewer chest; Strength in a Factory chest.
  Caelan adjusts the placement before it's built. If the autoplay buys or opens these, its golden
  moves: re-record after reading the trace.
- **4b Theft cones within range:** aiming a theft draws only the cones of watchers inside the
  theft's reach, not the whole town's.
- **4c Edge trees behind everything:** filler trees past a map's south edge stop covering the last
  row. Today you vanish for one step at Town's south exit, and two Carnival corners hide what
  stands on them. `tests/tile-coverage.test.js` pins the filler table; the depth sort is in the
  renderer.

## Order and overlap

1. `chore/trim`: stages 1, 2 and 4. Light touches to `main.js`; also `items.js`, `dialogue.js`,
   `town-map.json`, `sprites.js`, `renderer.js`, `data.js` and `buffs.js`.
2. `fix/one-clock`: stage 3, cut from `dev` **after** `chore/trim` merges, because both edit
   `main.js`. Heavy on `main.js`; also `save.js`, `enemies.js` and `npc.js`.
3. `feature/tiled-pipeline` (local, unmerged, `ffb6505`) overlaps stage 2's tile cut. Merge it
   first if the Canyon painting is close; otherwise its tile cut goes last.
4. `spike/3d-view` lives in `game/spike-3d/` and touches nothing here.

## Verify (each branch)

- `npm test`: re-measure the count; a dropping count means a file failed to load.
- The naming gate (CLAUDE.md), `npm run -s balance:check`, `npm run autoplay:check`.
- `python dev-server.py <port>`, a real load, the console, and a smoke test of every touched system:
  Macc's shop with no stock, Carrion's patched-up loss, and a theft aim near and far.
- For stage 3, also check:
  - pause holds the town still;
  - walking into a fight stops the walk;
  - the light turns after the set number of actions;
  - a save and reload keeps the time of day.

## After batch 1

Later batches each get their own branch and spec when Caelan picks them. The candidates he ruled
"finish": an art pass (item icons from the Kenney packs, a stand-in for Lire, the Carnival's own
ground, a varied forest), the robbery loss in the sewer, monsters following you selectively,
the Forest zone past the Graveyard, critical hits with the weakness chart, goo and conveyor floors,
Carrion's shop, the Bank and Casino, and turn-model step 2.
