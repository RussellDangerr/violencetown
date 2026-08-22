# Systems Audit — August 2026

**Written 2026-08-21**, against `dev` at `dda2f8c` (post-`v0.20.0`).

This is a **stock-take, not a spec**. It counts what exists, names where the surface is
outrunning the play, and proposes an order of operations. Nothing here overrides the Laws
(`plans/balancing-bible.md`) or settles the open rulings — several of the findings *sharpen*
those rulings, and they are still Caelan's to make.

Companion docs: `plans/balancing-bible.md` (the Laws), `git show plan:plans/next-session-open-work.md`
(parked work, referenced below by its A1–E item ids), `plans/gold-standard-design.md`.

---

## 0. The vocabulary this audit uses

Two words get used loosely in game criticism and they are worth separating, because the whole
audit turns on the difference.

- **Complexity** is how much you must hold in your head to play at all. It is a **floor**.
- **Depth** is how long the game keeps rewarding attention. It is a **ceiling**.

Nobody has ever quit a game for being too deep. They quit for the floor.

Depth is **combinatorial** — it comes from elements interacting. Complexity is **additive** — it
comes from elements existing. So the useful metric for a system is not how many things it
contains but **how many edges it has into other systems**:

> **Count edges, not nodes.**

An element with no edges adds floor and no ceiling. Most of the findings below are edge counts.

---

## 1. Inventory

### Machinery — built, tested, documented

Radial wheel (4-level node tree, ~20 leaves — `game/wheel-model.js:25`) · 8-Law balance bible +
Challenge GP + `tools/balance-harness.mjs` with golden diffs · visible wallets + the 1 GP : 1 HP
peg · Poition category (6 stats, 2 runtime families, one sign-flip seam — `game/items.js`) ·
DoT/buff tick system (`game/buffs.js`) · enemy kits + `resolveLoadout` · the disposition /
give / trade / bribe transaction spine · Remembrance Rings + tag-keyed fusion · MP spells +
GP tricks · summons · transforms · haste/slow charges · 5-zone positional targeting · defeat
scenarios · layered examine · REMOTICON / XMB hotbar · target list · quest engine · save ·
pathing / AI · audio · accessibility settings.

**29 test files, 3,880 lines of tests.**

### Content — what actually runs inside the machinery

| Thing | Count |
|---|---|
| Items | **28** |
| Weapons | 5 |
| Spells | 3 |
| Tricks | 4 |
| **Rings** | **2** |
| **Fusions** | **1** |
| Buff defs | ~10 |
| Maps | 12 (5 are 12×12 placeholder rooms: 1 enemy, 0 items) |
| Spawns | 34 |
| **Map transitions** | **28** |
| **Gated transitions** | **1** |

### Design surface

**54 plan files, 17,731 lines** — roughly 1:1 with the 19,801 lines of game JS. Seven ABC
decisions open since 2026-04-01; four rulings blocking content since 2026-07-25.

---

## 2. The finding that dominates everything else

From `tools/balance-golden.txt`:

- **`ttk_informed` is 1–3 turns for every enemy in the game.** The maximum is 3 (`sewer/e6`,
  `sewer/wererat`). Everything else is 1 or 2.
- **`ttd` — turns for an enemy to drop the player — runs 9 to 100**, or `-` (never).
- **19 of 34 spawns deal zero damage.** Only 15 entities in the game can hurt the player at all.
- `borgir/borgir_boss` deals **0 damage** and dies in **2** turns.

So the real shape of a Violencetown fight is: **the player kills it in two decisions, and it
could not have killed the player in twenty.**

### Why this is the root cause and not a symptom

Law 4 is written against a **five-turn reference fight**. The roster delivers one to three. Every
system that needs a fight to have a *middle* therefore never executes:

| System | Why it is inert | Parked item |
|---|---|---|
| Poitions | Nothing threatens you enough to drink one | — |
| DoTs | Fight ends before the second tick | — |
| Enemy kits | Enemy is dead before its second turn | B2 |
| Visible wallets | No time to watch pips drain | B2 |
| Haste / slow charges | No turn economy to manipulate | — |
| Ring passives | Too few turns for a % modifier to matter | — |
| Positional multipliers | No repositioning happens in 2 turns | — |
| Law 5 (bosses spend) | Never run — no boss exists | B1 |

**This is not a content problem and not a balance-polish problem.** It is a container problem:
an enormous verb vocabulary with no fight long enough to speak in. It is close to a single-lever
change (armor bands / damage), and fixing it **retroactively switches on roughly five releases
of already-shipped code**.

> **Nothing else in this document is worth doing first.**

**Target:** `ttk_informed` of **5–8** against the reference loadout, and a `ttd` that constitutes
a real threat rather than a rounding error. Re-run the harness; the golden diff is the check.

---

## 3. Where the surface is ballooning

Ranked by cost-to-value, worst first.

### 3.1 Rings — the purest node with no edges

`plans/remembrance-rings-implementation.md` (1,059 lines) + `plans/ring-builds-implementation.md`
(728 lines) + `game/rings.js` (172) + `game/ring-data.js` (37) produce **two rings and one
fusion.**

The architecture is genuinely right — `FUSIONS` keys on **tags**, not ids, so one recipe covers a
family. That is the correct shape and it is the seed of §5 below. But there are **three tags in
the entire game** (`vermin`, `sewer`, `fire`). A two-ring build system is a menu with two entries.

**Decide:** author ~12 rings and ~8 fusions, or cut the system and reclaim the surface. A
half-built build system is the most expensive thing in the repo.

### 3.2 No elite and no boss exist

`ROLE_BANDS` defines **elite** (armor +5…+10, 100–200 GP) and the spec defines **boss**
(500–2,500 GP). The roster has neither — every fighter is vermin, fodder, or standard. Law 5
(bosses break the band by **spending**, not by pooling HP) is the most interesting idea in the
bible and has **never executed once**. See B1.

A boss is also the only fight naturally long enough to display the machinery from §2. **One good
boss is worth more than the entire elite tier.**

### 3.3 The parallel build

`game/main-TheDangerrZone.js` (2,134) + `renderer-TheDangerrZone.js` (1,090) +
`enemies-TheDangerrZone.js` (297) + `data-TheDangerrZone.js` (79) ≈ **3,600 lines** of the
v0.7.0 procedural-taxi version, living inside `game/` and **maintained in lockstep** — the
poition commit (`a9e63ca`, 2026-07-25) touched it.

That is a tax on every core change.

**Decide:** if it is a deliberate portfolio artifact, freeze it at a tag and stop paying the tax.
If it is not, delete it. Either is fine; paying maintenance on an undecided fossil is not.

### 3.4 Law 0 is doing combat accounting on furniture

19 of 34 spawns are shopkeepers and townsfolk at `hp 100 / armor -80 / dmg 0`, each one passing
through the balance harness and each one occupying a golden row. The Law is correct; applying it
to scenery is bookkeeping without a payoff.

**Decide:** a `noncombatant: true` marker that exits the harness early, or accept the rows as the
price of one uniform rule. (There is a real argument for keeping it uniform — Law 0's whole point
is that *anything* can be hit. But then the golden should probably segregate them.)

### 3.5 Rulings are gating content

Four open rulings have blocked work for a month. A1 alone has kept **Pike unauthored**. These are
cheap calls holding up expensive work — clearing them is the highest value-per-minute item in the
repo after §2.

---

## 4. Where the fun already is — and it is not combat

Combat is the generic part of this game. The wheel is well-engineered, but it resolves to a menu
of damage options pointed at enemies that die in two hits, and nothing about it is unlike a
hundred other games.

**The distinctive system in this codebase is the transaction spine.** Disposition, give, trade,
bribe, the wallet you can *see* on a nameplate and mug, poisoned food that flips an NPC hostile
(`game/give-action.js`), `sewerFare` mystery meat that **heals** a sewer-dweller and **harms**
everyone else (`game/items.js`).

That cluster is the one place where systems already have real edges into each other, and it is
the one place that produces a *"the developer thought of this"* moment. Hand-feeding a poisoned
burger to a vendor to flip them hostile so you can take the wallet you had been staring at is a
NetHack moment — **and it works today.**

**Recommendation:** treat this as the main system, not a side one. Let combat be the *consequence
of social failure* rather than the main course. Every design hour spent adding edges here returns
more than an hour spent adding combat verbs.

---

## 5. Locks and keys — the web/timeline test

### The test

> **A lock with one key is a timeline. A lock with four keys is a web node.**

The freedom players praise in CRPGs is not a bigger simulation — it is **key multiplicity**. Deus
Ex's design rule was that every obstacle has at least three routes. That is cheap. It does not
require new systems; it requires that a door accept more than one kind of key.

### Key families available in Violencetown *today*

All five already exist as shipped systems:

| Family | Shipped as |
|---|---|
| **Violence** | the wheel's FIGHT tree |
| **Resource** | gold, `bribe`, `trade`, buyout (Law 6c, spec'd) |
| **Social** | disposition, `give`, food, poison-flip |
| **Item / traversal** | `grappling_hook`, `requires` on a transition |
| **Knowledge** | *nothing yet* — see 5.3 |

### 5.1 The zone gate pass

**28 transitions across 12 maps. Exactly one carries a requirement.**

| Gate | Keys accepted | Verdict |
|---|---|---|
| `canyon → downtown` (`requires: grappling_hook`) | **3 routes to the key** — see 5.2 | **web** |
| All 27 others | unconditional | ungated |

The map is currently **fully open with one gate**. That is not automatically wrong — an open map
is the right substrate for a web — but it means **there is presently no structure to come back
to.** The "I couldn't beat that before and now I can" beat does not exist anywhere in the game.

### 5.2 The canyon is already the design — in exactly one room

`game/quests.js:30` (`canyon_escape`) + `game/dialogue.js:15` (Pike):

- **Buy** — 1,000 GP, and the price is *modulated by disposition* ("give or take how much I like
  you"). A resource key with a social key wired into its cost. **This is a real edge and it is the
  best single interaction in the game.**
- **Deal** — clear the two canyon critters, rope handed over free.
- **Kill** — put Pike down, the rope drops.

One lock, three routes, three different key families, and the buy route is *priced by* the social
system. That is the Deus Ex rule, shipped and working.

**It exists in one room out of twelve.** It is not a feature to invent — it is a **template to
make standard.** Every substantive gate from here should be built to this shape.

### 5.3 `puzzleWall` is the bombable rock, spec'd and never placed

`plans/balancing-bible.md:58` and `:116` define `puzzleWall: true` as the declared escape hatch
for armor outside `[-90, +10]`. Grep finds it in **the plans and the lint only — no enemy in the
game declares it.**

Under Law 0 this is a complete, already-built gating primitive:

- Armor **+10** vs. the wooden sword's 10 damage → `max(1, 10 − 10)` = **1 damage/turn** = a
  100-turn wall. To the player this reads, correctly, as *impossible*.
- It opens the moment the player brings **fire**, or the Ray Gun's 22, or discovers the thing is
  `flammable`.

That is the Zelda rock **and** the knowledge gate, using machinery already shipped, with a lint
flag already written for it. It is the cheapest new content in the repo.

### 5.4 The tag layer is the web

The N² problem: hand-authoring *every door × every key* does not scale. **A tag layer makes
multi-key locks free.**

One `flammable` door opens to the fireball, the Fire Ring, the Ember Rat, a thrown lantern, or a
lit sludge trail — **five keys for the price of one authored property.**

Today, items carry one-off booleans read by exactly one consumer each: `sewerFare`,
`sludgeImmune`, `pullsAggro`. Those are the *right instincts implemented as special cases*.
`ring-data.js` already has the general form.

**Proposal — push the `tags` vocabulary down to items, enemies, and tiles:**
`flammable`, `metal`, `porous`, `wet`, `rigid`, `vermin`, `undead`, `conducts`.

Then `fire × flammable` and `sludge × porous` resolve generically, and the questions that started
this — *how does fire interact with wood, how does a metal helmet interact with sludge, how does
the ground differ per location* — have somewhere to resolve. **Today they resolve to nothing:**
`damageType: 'fire'` only picks a hit-splat colour, and maps are raw tile integers with no
properties.

General system for the space, plus a deliberate budget of **hand-written exceptions** in the
places players poke first. The general system creates the possibility; the exceptions create the
delight.

---

## 6. The asset nobody planned: there is no scalar

**Violencetown has no XP and no levels.** (Grep for `xp` / `experience` / `levelUp` /
`playerLevel` across `game/*.js` returns nothing but an unrelated word in `buffs.js`.) And **Law 0
fixes every combatant at 100 HP**, with armor as the only durability axis, bounded at ±10.

This matters more than it looks. A level is a **scalar** — one number, total order — and a total
order *is* a timeline. It forces the designer into a trap with no exit:

- **Don't scale** → old zones die (the Fallout 4 / dead-content problem, at map scale).
- **Do scale** → progress becomes invisible (the Oblivion problem: bandits in glass armor).

Both failure modes are the scalar's fault. The escape is not better scaling — it is **not having
the scalar**, which Violencetown already, accidentally, does not have.

**Consequence:** "come back later and beat it" **cannot** be a numbers story here, because the
numbers do not move. It must be a **keys** story. That is the harder design and it is also the
one that produces a web instead of a timeline — and this codebase is already standing in the
right place for it. **Do not add levels.**

### The fixed-budget corollary

> **A fixed budget turns additive unlocks into multiplicative decisions.**

Ten unlocks with no scarce resource is a to-do list — the player does all ten. Ten unlocks against
a fixed budget is *choose three of ten* = 120 distinct sessions. Scarcity is what makes unlocks
multiply instead of stack.

**Violencetown's budget is the world turn** — `_advanceWorld`, 44 call sites in `main.js`.

Which makes open ruling **A3 far larger than a UI question.** "Does opening the REMOTICON cost a
world turn?" is really **"is the turn a real budget?"**

- **Free bag** → the turn is not scarce, nothing competes for it, and every system added from here
  stays additive forever.
- **Costed bag** → the turn becomes the scarce resource: drink or swing, feed or flee, read the
  bag or take the hit. Every future system then multiplies against it automatically.

The parked note is right that Law 7's free-bag guarantee is what makes BG3's post-combat panic
structurally impossible, and that is worth keeping. **Proposed middle: the bag is free out of
combat and costs a turn in combat.** The no-panic guarantee is kept exactly where the panic lives;
a real budget appears exactly where decisions are made.

§2 and this ruling compose: **a 5–8 turn fight in which the bag costs a turn** is a fight where
the poitions, kits, wallets and DoTs all have to compete for the same scarce thing.

---

## 7. Proposed order of operations

1. **Fix fight length.** `ttk_informed` → 5–8; make `ttd` a genuine threat. Unlocks five releases
   of already-written code. *(§2 — do this first, alone if necessary.)*
2. **Clear the four rulings** (A1–A4). Cheap, and they are gating content.
3. **Rule on A3 as a budget question**, not a UI question. Proposed: free out of combat, costed
   in combat. *(§6)*
4. **Build one boss properly** — and make it the fight that finally runs Law 5. *(B1)*
5. **Make enemies eat their own kits.** *(B2 — diegetic, visible, the payoff the pips were
   built for.)*
6. **Place the first `puzzleWall`.** Cheapest new content in the repo. *(§5.3)*
7. **Tag layer** on items / enemies / tiles, then the material layer. *(§5.4)*
8. **Rings: author or cut.** Decide this month. *(§3.1)*
9. **Resolve TheDangerrZone** — freeze at a tag or delete. *(§3.3)*
10. **Freeze the verb list.** No new wheel nodes, no new categories, no new subsystems until the
    existing ~20 leaves have terrain and tag interactions. One verb explored to exhaustion beats
    a new verb, every time.

---

## 8. Questions this audit raises but does not settle

- **§3.3** — Is TheDangerrZone a deliberate portfolio artifact or a fossil?
- **§3.4** — Does Law 0 apply to non-combatants for harness purposes, or do they exit early?
- **§3.1** — Rings: author to ~12, or cut?
- **§6 / A3** — Is the free-bag guarantee combat-scoped, or absolute?
- **§5.1** — Should any of the other 27 transitions be gated at all, or is an open map with a
  small number of *interior* multi-key locks the better shape?

---

## 9. Next artifact

The natural follow-on is an **affordance matrix**: verbs (the ~20 wheel leaves) down one axis,
tags (§5.4) across the other, every cell filled in. The discipline is that **a blank cell is a
decision, not an oversight** — "nothing happens" gets written down explicitly.

Its second job is diagnostic: it makes it visually obvious when a proposed element would land
with **zero edges**, which catches the ballooning at design time instead of after implementation.
