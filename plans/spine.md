# The Spine — the shape of the whole game

**Date:** 2026-10-11
**Status:** RULED — the structure is Caelan's, from the 2026-10-11 design session. Nine smaller
rulings are still open (§8); each is a ruling row `SP1`–`SP9` in `roadmap-2026-09.md` §2.
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

**Act 1 — Town.** Built and playable.
Your car won't start → the Sewer → **the Sewer boss drops the Converter** → escape → the car
runs → the bridge → the Canyon → Pike's grappling hook → Downtown → meet the Financier.

**Act 2 — Carnival, Factory, Graveyard, in any order.**
Each zone gives one **required item** (names open, SP1 — until then: *item A, B, C*), earned
through that zone's quest: one is given, one taken, one earned, and the zone's boss fight is a
step inside it (ruled 2026-10-23, §9). *Interim:* until the quests are built, the boss drops the
item directly.

**Act 3 — Bank Street.**
The three items open the finale → the Financier → the Final Arc (`cosmology-and-arc.md`: the
Bite, Sun Man's coaching, phase 2 against Monstrous Sun Man) → credits. **The game ends.**

| Beat | Binds to slot | Required item | In code today |
|---|---|---|---|
| The car won't start | — | — | `quests.js` `fix_car`, stage `examine_car` |
| Sewer boss | `sewer.boss` | the Converter (`catalytic_converter`) | Were-Rat, `tag: 'wererat_boss'`; the drop is `main.js` `_handleEnemyDeath` |
| Escape the sewer | `sewer.setpiece` | — | `_sewerEscapeSetpiece` |
| The bridge | — | — | `_openBridgeIfCarFixed`, the bridge cutscene |
| Out of the Canyon | `canyon.npc` | the grappling hook | `canyon_escape`; Pike (SP6: the Canyon is a branch today) |
| Meet the Financier | — | — | not a quest stage today (SP8) |
| Carnival quest, its boss a step | `carnival.boss` | item A | placeholder boss (first entry: Bigfoot) drops it directly — interim |
| Factory quest, its boss a step | `factory.boss` | item B | placeholder boss (first entry: Alien Invasion) drops it directly — interim |
| Graveyard quest, its boss a step | `graveyard.boss` | item C | placeholder boss (first entry: The Deity) drops it directly — interim |
| The finale | — | A + B + C | not built (`bank-map.json` holds a placeholder Financier) |

It keeps two standing rulings from `species-adventures.md`:
- **SA-1 Fixed maps.** Every zone is a hand-authored map. No map generation.
- **SA-6 No "come back later" gates.** The three Act 2 zones stay open (they already are:
  `world-map.js` joins Town to Factory and Carnival, and Carnival to Graveyard). A boss beaten
  "early" counts. **The one gate in the game is the finale's**, and it asks only for the three items.

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
| The three acts, and their order | **Locked** | — |
| The zones on the spine: Town, Sewer, Canyon, Downtown, Carnival, Factory, Graveyard, Bank Street | **Locked** | all eight maps exist (Bank Street = `bank-map.json`, SP7) |
| The Converter (Act 1's required item) | **Locked**, name and id | `catalytic_converter` |
| Three Act 2 required items, one per zone quest, its boss fight a step inside it | **Locked** as three slots; names open (ruled 2026-10-23, §9) | SP1; interim: the boss drops it |
| Which slot holds which required item | **Locked** (a randomizer mode may shuffle it later) | — |
| The ending: Financier → Final Arc → credits | **Locked** | SP2 (New Game+) |
| Night Kid, the Financier, Sun Man | **Locked** characters (the cosmology's cast spine) | — |
| Sewer boss | Pool | Were-Rat |
| Carnival / Factory / Graveyard boss | Pool | Bigfoot / Alien Invasion / The Deity, as first entries |
| Mini-bosses, set pieces, characters, mobs | Pools | Act 1's are pools of one |
| What is on a map: spawns, props, containers | Pool material | — |
| Maps off the spine: Wilderness, Borgir, Diner, Casino | Exist, carry no beat | content there is pool material |

## 4. The lock clause

A change to anything marked **Locked** above — the zones on the spine, the acts or their order,
the required items, or the ending — must:

1. **name what it replaces**, and
2. **get Caelan's explicit ruling**, recorded in this file with its date.

Everything else is a pool entry and needs no structural ruling. Claude flags a request that would
touch a locked row *before* acting on it, and routes a new idea to a pool card instead.

## 5. How the other plans read now

| Plan | Reads as |
|---|---|
| `species-adventures.md` | Piece 1 is the slot framework (§2). The rest's status is SP3. |
| `cosmology-and-arc.md` | Canon. Its Final Arc is Act 3. Two of its gates (Sun Man's first talk, the Final Arc trigger) assume transformations (SP9); its NG+ is SP2. |
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

- **SP1 — The three required items' names.** One idea: each is proof of the Financier's scheme.
  They stay *item A, B, C* until named.
- **SP2 — Remove New Game+, so the credits end the game?** (species-adventures §3 rec. 5)
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
- **SP8 — Make "meet the Financier" a quest stage?** Today Act 1's quests end with the burger
  delivery, and the Financier is an optional placeholder conversation. The 10-03 *blend* ruling
  said delivering the burger *is* delivering the package, so he could be who it's delivered to.
- **SP9 — What opens Sun Man?** The cosmology gates his first conversation, and the Final Arc, on
  transformations. If species work is later (SP3), those need another trigger.

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
- **2026-10-25 — Which zone's quest is which.** The Graveyard's item is given, the Factory's is
  taken, and the Carnival's is earned.
