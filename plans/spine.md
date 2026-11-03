# The Spine — the shape of the whole game

**Date:** 2026-10-11
**Status:** RULED — the structure is Caelan's, from the 2026-10-11 design session, restructured
2026-11-03 into a hub and episodes (§9). `SP3`–`SP9` (§8) are rows in `roadmap-2026-09.md` §2;
`SP10` is ruled, and `SP11`–`SP12` wait until the first three episodes are built.
**Why it exists (Caelan):** *"If I don't lock this decision down, I will never finish this game."*
The structure has been re-decided four times — a static map (04-01), a linear adventure (04-05),
any-order zones (05-21), species adventures (09-15, which dropped the single ending). Ideas outpace
building. This file fixes **one** structure whose *contents* are swappable, so a new idea lands as
a pool entry instead of a fifth re-decision.

**No version is attached to it.** This is the game from its first minute to its credits, not a
release target. Versions keep climbing release by release, and the game gets there when it gets
there (Caelan, 2026-10-12).

---

## 1. The structure (locked)

The game is a hub, nine episodes and a finale (ruled 2026-11-03, §9).

**The Town — the hub.** Built and playable. Every episode is reached from it. Transition zones
hang off it: places with shops, levelling and items, and no required item.

**Nine episodes, three per required item.** Each required item can come from any one of three
episodes. Finishing an episode gives its item and changes that area, and may change the areas next
to it; the item's other two episodes then no longer give it. Not every episode carries every item.
You finish three episodes, one per item, in any order. Each item is earned through its episode's
quest, and the episode's boss fight is a step inside the quest (ruled 2026-10-23, 2026-10-30, §9).

| Required item | How you get it | Its episodes |
|---|---|---|
| the stuffed animal | you win it | the Carnival, and two open (SP11) |
| the flux capacitor | you are given it | the Factory, and two open (SP11) |
| the soul crystal | you take it | the Graveyard, and two open (SP11) |

The Sewer, the Canyon and Downtown are episodes too. Which item each carries, and the three
episodes still unnamed, are SP11.

**The finale — Bank Street.** The three items open it → the Financier → the Final Arc
(`cosmology-and-arc.md`: the Bite, Sun Man's coaching, phase 2 against Monstrous Sun Man) →
credits. New Game+ follows (§9, 2026-11-03).

**Built first:** the Carnival, Factory and Graveyard, one episode per item, so the game can be won.
The other six come after.

**The opening (SP10, ruled 2026-11-03).** Quest 1 stays as the game's opening, played once as
built: the taxi driver's taxi won't start → the Sewer → **the Sewer boss drops the Converter** →
escape → the taxi runs → the driver takes you across the bridge → the Canyon → Pike's grappling
hook → Downtown → meet the Financier (ruled 2026-11-01, §9). The hub opens when the taxi runs.
After that every road is open, and the Sewer, the Canyon and Downtown count as episodes when you
go back. *Interim:* until the quests are built, each placeholder boss drops its item directly.

The beats in code today:

| Beat | Binds to slot | Required item | In code today |
|---|---|---|---|
| The taxi driver's taxi won't start | — | — | `quests.js` `fix_car`, stage `examine_car` |
| Sewer boss | `sewer.boss` | the Converter (`catalytic_converter`) | Were-Rat, `tag: 'wererat_boss'`; the drop is `main.js` `_handleEnemyDeath` |
| Escape the sewer | `sewer.setpiece` | — | `_sewerEscapeSetpiece` |
| The driver takes you across the bridge | — | — | `_openBridgeIfCarFixed`, the bridge cutscene |
| Out of the Canyon | `canyon.npc` | the grappling hook | `canyon_escape`; Pike (SP6: the Canyon is a branch today) |
| Meet the Financier | — | — | quest 1's last stage: hand the delivery to him in the bank (`quests.js` `deliver_burger`, stage `handoff`; SP8) |
| Carnival quest, its boss a step | `carnival.boss` | the stuffed animal (earned) | placeholder boss (first entry: Bigfoot) drops it directly — interim |
| Factory quest, its boss a step | `factory.boss` | the flux capacitor (given) | placeholder boss (first entry: Alien Invasion) drops it directly — interim |
| Graveyard quest, its boss a step | `graveyard.boss` | the soul crystal (taken) | placeholder boss (first entry: The Deity) drops it directly — interim |
| The finale | — | stuffed animal + flux capacitor + soul crystal | not built (`bank-map.json` holds a placeholder Financier) |

It keeps two standing rulings from `species-adventures.md`:
- **SA-1 Fixed maps.** Every zone is a hand-authored map. No map generation.
- **SA-6 No "come back later" gates on the main map.** The main map stays open: every episode is
  reached from the hub (today `world-map.js` joins Town to Factory and Carnival, and Carnival to
  Graveyard). A boss beaten "early" counts. An item's other episodes closing once you have it is a
  choice you made, not a gate. **The finale's gate asks only for the three items.** A new quest may open new areas beyond the main map, RuneScape-style (Caelan,
  2026-10-30, §9). This replaces the old SA-6 line that the finale's was the one gate in the game.

## 2. Slots, not names

A beat binds to a **slot**, never to a specific monster. *"The Sewer's boss drops the Converter"*,
not *"the Were-Rat drops the Converter."* The Were-Rat is one entry in the Sewer boss's pool.

- **SL-1 Every slot has a pool.** At a new game the seeded RNG (`game/rng.js`) picks one entry per
  slot. The picks are saved, and the same seed gives the same picks.
- **SL-2 Picks draw from their own stream**, derived from the game seed, never from `game.rng`.
  Adding a pool or an entry must not shift a single combat roll, so the autoplay golden only moves
  when a pick actually changes what is on the map.
- **SL-3 A pool of one is a pool.** Today the Sewer boss pool is the Were-Rat alone. The framework
  ships with that, and the game plays exactly as it does now.
- **SL-4 A required item belongs to the slot, not the entry.** Every entry in a required-item slot
  drops that item. A test enforces it, so a new boss can never strand the quest.
- **SL-5 Slot kinds:** boss, mini-boss, set piece / location, character (NPC), mob (a spawn
  variant). *Later:* a randomizer mode that shuffles which slot holds which required item, and
  authored variants of buildings and regions.
- **SL-6 Anchors and mooks** (cosmology, principle 1). Boss, mini-boss and character slots hold
  anchors: one pick per game, irreplaceable once picked. Mob slots hold mooks, rolled per spawn
  from the zone's spawn table.
- **SL-7 New ideas become pool entries. They never change the structure.** An idea not being built
  yet goes on Caelan's private roadmap board as a card tagged *zone + slot*, not into this repo.

Slot ids are `<zone>.<kind>`, with a suffix when a zone has more than one of a kind
(`carnival.mob`, `sewer.miniboss.2`). The registry itself is `species-adventures.md` piece 1
(type registry, per-zone spawn tables, drop tables, respawn clock), built **as** the slot
framework rather than beside it.

## 3. What is locked and what is a pool

| Thing | Locked or pool | Today |
|---|---|---|
| The shape: the Town as hub, nine episodes (three per required item), Bank Street as finale | **Locked** (ruled 2026-11-03, §9) | six episodes exist as maps: Sewer, Canyon, Downtown, Carnival, Factory, Graveyard; three are unnamed (SP11). Bank Street = `bank-map.json` (SP7) |
| The Converter, quest 1's reward | **Locked**, name and id (SP10, ruled 2026-11-03, §9) | `catalytic_converter`, the Sewer boss's drop and the taxi's fix |
| Three required items, each from one quest in one of its three episodes, the boss fight a step inside it | **Locked** as three slots, named: stuffed animal (Carnival), flux capacitor (Factory), soul crystal (Graveyard) (ruled 2026-10-23, 2026-10-30, §9) | interim: the boss drops it |
| Which slot holds which required item | **Locked** (a randomizer mode may shuffle it later) | — |
| The ending: Financier → Final Arc → credits, then New Game+ | **Locked** (New Game+ ruled 2026-11-03, §9) | New Game+ not built |
| Night Kid, the Financier, Sun Man | **Locked** characters (the cosmology's cast spine) | — |
| Sewer boss | Pool | Were-Rat |
| Carnival / Factory / Graveyard boss | Pool | Bigfoot / Alien Invasion / The Deity, as first entries |
| Mini-bosses, set pieces, characters, mobs | Pools | Act 1's are pools of one |
| What is on a map: spawns, props, containers | Pool material | — |
| Maps off the spine: Wilderness, Borgir, Diner, Casino | Exist, carry no beat; candidate transition zones (SP12) | content there is pool material |
| The oil side area, past the barricade (ruled 2026-11-01, §9) | Optional, carries no beat | name is [TEXT]; content there is pool material |

## 4. The lock clause

A change to anything marked **Locked** above — the hub, the episodes, the required items, or the
finale and ending — must:

1. **name what it replaces**, and
2. **get Caelan's explicit ruling**, recorded in this file with its date.

Everything else is a pool entry and needs no structural ruling. Claude flags a request that would
touch a locked row *before* acting on it, and routes a new idea to a pool card instead.

## 5. How the other plans read now

| Plan | Reads as |
|---|---|
| `species-adventures.md` | Piece 1 is the slot framework (§2). The rest's status is SP3. |
| `cosmology-and-arc.md` | Canon. Its Final Arc is the finale. Two of its gates (Sun Man's first talk, the Final Arc trigger) assume transformations (SP9); its NG+ stays (SP2, ruled 2026-11-03). |
| `adventure-transition-plan.md` | Already superseded. |
| `game-zones.md` | Its five zones are the spine's; its Act table is replaced by §1. |
| `roadmap-2026-09.md` | Carries the spine: SP1–SP9 in §2, the slot registry and the recolor tool in §3, the rats, the Act 2 bosses and the finale in §4. The bosses left "post-1.0". |

## 6. Build order

One short-lived branch each, cut from `dev`, with a stop for Caelan's call between them.

1. **`docs/spine`** — this file, a CLAUDE.md section on the lock clause, and the roadmap.
2. **`feature/slot-registry`** (roadmap `SR`) — the registry, pools and seeded per-new-game picks,
   saved and reproducible. Rewire the Converter to the `sewer.boss` slot, with the Were-Rat its
   only entry. Nothing visible changes: `npm test` green, `npm run autoplay:check` matches the
   golden, and the game runs. Plus the SL-4 test. Its own spec first (`plans/slot-registry.md`).
3. **A recolor tool in `tools/`** (`RC`), in the style of `tools/gen_outlined_sheet.py`: one base
   sprite in, tinted variants out.
4. **Rat variants** (`RV`) placed through spawn tables, each a registry entry with its own kit and
   drops, run through `tools/balance-harness.mjs`.

**Not now:** a second Sewer boss. Step 2 builds the ability to add one, not the boss.

## 7. First content through the framework: rats

| Variant | Zone |
|---|---|
| Undead rat | Carnival |
| Frost rat | open (SP4) |
| Pouch rat | "the forest" (SP4) |
| Birthday rat, sludge rat, robot rat | Carnival |

All from one base sprite (`tinyDungeon` 3,10, the brown rat) through the step-3 tool.

## 8. Open rulings

Each is a row in `roadmap-2026-09.md` §2. Answers land here, dated, and strike the row there.

- **SP1 — The three required items' names.** RULED 2026-10-30, see §9.
- **SP2 — Remove New Game+, so the credits end the game?** RULED 2026-11-03: New Game+ stays, see §9.
- **SP3 — Does `species-adventures.md` become later work, with this file as the north star?** Its
  piece 1 stays, as the slot framework.
- **SP4 — The frost rat's zone? And is "the forest" the Wilderness map?** No forest zone exists,
  and the Wilderness is the closest.
- **SP5 — Texas Beholdem and Nessie as future Sewer boss-pool cards?** Caelan's 10-03 note made
  **Lonny** the Sewer's own Loch Ness-style serpent (she), with Nessie her long-lost love who
  lives elsewhere — so the Sewer card may be Lonny.
- **SP6 — Is the Canyon a detour or a required beat?** In the shipped game a car still on raw fuel
  crashes into the Canyon at the bridge, and one tamed with alcohol drives straight to Downtown.
- **SP7 — Bank Street = Downtown's First Blood Bank?** The cosmology puts Bank Street inside the
  Town, but the game's bank, the Financier's home, is an interior off Downtown.
- **SP8 — Make "meet the Financier" a quest stage?** RULED 2026-11-03, see §9: yes, the burger
  delivery's last stage is handing it to him.
- **SP9 — What opens Sun Man?** The cosmology gates his first conversation, and the Final Arc, on
  transformations. If species work is later (SP3), those need another trigger.
- **SP10 — What does the Act 1 chain become, now the Town is a hub?** RULED 2026-11-03, see §9:
  quest 1 stays as the opening.
- **SP11 — The nine episodes.** Which item can each of the Sewer, the Canyon and Downtown give,
  and what are the three episodes still unnamed? Waits until the first three episodes are built
  (Caelan, 2026-11-03).
- **SP12 — Which maps are transition zones?** The Wilderness, Borgir, the Diner and the Casino are
  the candidates, along with the oil side area. Decided together with SP11 (Caelan, 2026-11-03).

## 9. Rulings recorded here

- **2026-10-23 — The Act 2 items come from three quests.** Caelan: *"The boss fights will become
  part of the three quests."* Each Act 2 zone's required item comes from a quest that is given,
  taken or earned, and the zone's boss fight is a step inside that quest.
  - **Replaces** the Locked row *"each zone's boss drops one required item"* (§1 Act 2, the §1
    beat table, and the §3 row for the three Act 2 items).
  - The items still belong to slots: `carnival.boss`, `factory.boss`, `graveyard.boss` hold them
    (SL-4), so any boss in a pool still guarantees the item.
  - **Interim:** until the quests are built, each placeholder boss drops its item directly
    (`plans/ab1-act2-placeholder-bosses.md`).
- **2026-10-25 — Which zone's quest is which (superseded 2026-10-30, below).** The Graveyard's item is given, the Factory's is
  taken, and the Carnival's is earned.
- **2026-10-30 — The Act 2 items are named, and the Factory gives while the Graveyard takes.**
  Caelan named them: the Carnival's is a stuffed animal you win, the Graveyard's is a soul
  crystal, the Factory's is the flux capacitor. Ruling SP1R1 (swap them): you are given the flux
  capacitor at the end of the Factory, and you take the soul crystal in the Graveyard. The
  Carnival's stays earned. Answers SP1 (§8).
  - **Replaces** the 2026-10-25 entry above (Graveyard given, Factory taken, Carnival earned).
- **2026-10-30 — The main map stays open; a new quest may open new areas beyond it.** Caelan's
  answer on quest gates, RuneScape-style.
  - **Replaces** the SA-6 line that *"the one gate in the game is the finale's"* (§1). The three
    Act 2 zones stay open and the finale still asks for the three items; a quest may now gate an
    area beyond the main map.
- **2026-11-01 — The taxi driver's taxi replaces your car, and a side area opens past the
  barricade.** Rulings HO1R3 (option a: the taxi replaces your car; the Converter fixes his taxi,
  and he is how you cross) and HO1R4 (option a: a new side area past the barricade, off the spine;
  oil always unlocks it, and it is optional). Spec: `plans/taxi-driver.md`.
  - **Replaces** the Locked row in §1 Act 1, which read: *"Your car won't start → the Sewer → the
    Sewer boss drops the Converter → escape → the car runs → the bridge → the Canyon → Pike's
    grappling hook → Downtown → meet the Financier."* It now reads: *"The taxi driver's taxi won't
    start → the Sewer → the Sewer boss drops the Converter → escape → the taxi runs → the driver
    takes you across the bridge → the Canyon → Pike's grappling hook → Downtown → meet the
    Financier."* Three links change; nothing else in the row does.
  - **Stands as it was:** the Sewer, the Converter (still named `catalytic_converter`, still Act 1's
    required item), the Canyon, Pike's grappling hook and Downtown. The two §1 beat-table rows
    "The car won't start" and "The bridge" are reworded to match.
  - **Adds** to §3 (maps off the spine): the oil side area is optional and carries no beat. Its name
    is [TEXT].
- **2026-11-03 — A hub and nine episodes, three per required item; New Game+ stays.** Caelan
  pictures the zones as cartoon episodes. His rulings: the Town is a hub, and every other zone, the
  Sewer included, is an episode; there are nine, three per required item, and finishing one gives
  its item, changes that area and closes the item in its other two; the Carnival, Factory and
  Graveyard are built first, one per item, so the game can be won; New Game+ stays, as further
  seasons. Answers SP2 (§8).
  - **Replaces** the three acts: §1's *"Act 1 — Town"* (the taxi chain as the game's opening),
    *"Act 2 — Carnival, Factory, Graveyard, in any order"* and *"Act 3 — Bank Street ... The game
    ends."*, and the §3 rows *"The three acts, and their order"*, *"The zones on the spine"* and
    *"The Converter (Act 1's required item)"*.
  - **Stands as it was:** the three item names and how each is got, the finale at Bank Street
    (the Financier → the Final Arc → credits), slots and pools (§2), SA-1, and the open main map.
  - **Opens** SP10 (the Act 1 chain and the Converter), SP11 (the nine episodes) and SP12 (the
    transition zones). Until they are ruled, the shipped game plays as it does now.
- **2026-11-03 — Quest 1 stays as the opening (SP10).** Caelan's pick: everyone plays the taxi run
  once, as built, and the hub opens when the taxi runs. After it every road is open, and the
  Sewer, the Canyon and Downtown count as episodes when you go back. The Converter stays quest 1's
  reward and the taxi's fix. SP11 (the nine episodes) waits until the Carnival, Factory and
  Graveyard are built, and SP12 (the transition zones) is decided with it.
  - **Replaces** the §1 *Interim* paragraph, which held the Act 1 chain only until SP10, and the §3
    row *"The Converter: open (SP10)"*.
  - **Folds in** SP6 (is the Canyon required): it stays where quest 1 puts it today.
- **2026-11-03 — The burger is delivered to the Financier (SP8).** Caelan's pick (a): meeting the
  Financier is a quest stage. The 2026-10-03 blend ruling said delivering the burger *is*
  delivering the package, so the Financier, in the First Blood Bank, is who it is delivered to.
  Quest 1's last stage, `handoff`, now takes the order to him instead of the stranded traveler,
  and the 50 GP stays. This is the last beat of the opening (SP10, above). Spec:
  `plans/ae1-burger-to-financier.md`. Answers SP8 (§8).
  - **Replaces** the §1 beat-table cell *"not a quest stage today (SP8)"*, and the delivery going
    to the stranded traveler. No Locked row changes.
  - **Open:** what becomes of the traveler is not decided, and nor is whether the bank's Financier
    and the vault's (the finale's) are one character.
