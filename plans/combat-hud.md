# Feature: The combat HUD — the dock has two faces

**Phase:** Design (Gate 2). No code written; every choice below is still Caelan's to rule.
**Priority:** High — H1, next in Caelan's order after Q1 was tabled (`plans/roadmap-2026-09.md` §4).
**Status:** Stages 1-2 in build on `feature/combat-hud` (2026-09-19), ruled by Caelan — see §7.
Stages 3-5 designed, not ruled, not built.
**Companions:** `plans/fight-fog.md` (*Follow-on pieces* 2, where this was raised — it changes the
world when a fight starts, and this changes the dock) · `plans/screen-fill.md` (the dock and
`hudLayout`, which this extends) · `plans/item-hotbar-xmb.md` (the bar's original design, whose
single-item cell is fault 3) · `plans/combat-ui-layers.md` (2026-05-22, the layered-modal spec this
partly supersedes — see §8).

> **Caelan's words, 2026-09-14** (from his screenshot review): the wheel should not overlap the
> message menus — *"collapse it left"*, or show an equipment panel for you and the enemy (what you
> could steal or buy); the log could become a combat log; the item bar *"needs to be more functional
> than just a single item … that menu has been strange for a little while."*

---

## Why: what the dock does in a fight today, measured

Six faults. Each was measured or proven against the shipped code on 2026-09-19, not recalled. Fault
1b is the reason fault 1 survived, and it is the one to fix first.

### 1. The wheel's dial lands on top of whatever is there

The dial is a free-floating circle: `hudLayout` places its hub at a fixed inset from the
bottom-right (`layout.js:249`) and the renderer draws a disc of radius up to `DIAL_MAX_R` (162)
around it. Nothing reserves that space. Driving the real `computeViewport` + `hudLayout`:

| Screen | Dock rows | Dial vs. the log | Dial above the dock |
|---|---|---|---|
| 3440×1440 (his ultrawide) | 1 | no overlap | **191 px into the world** |
| 1440×900 | 1 | no overlap | **191 px into the world** |
| 980×800 | 2 | **overlaps 324×84 px** | 95 px |
| 900×1200 | 2 | **overlaps 324×84 px** | 95 px |
| 430×932 (phone) | 2 | **overlaps 324×84 px** | 95 px |

On a two-row dock the log is full-width, so the dial covers its entire right-hand third — his
screenshot. On a one-row dock the log is short enough to clear, but the dial still climbs 191 px
into the play area. Both are the same root cause: **the dial is drawn, not laid out.**

### 1b. The dial was never in the non-overlap invariant

> **Corrected 2026-09-19, mid-build.** This section first claimed the invariant tested a dead
> branch and that the dock had no non-overlap coverage at all. **That was wrong** — see below. The
> fix stage 2 makes is unchanged, but the diagnosis was overstated and the original wording is not
> worth inheriting. The commit that introduced it (`8e24978`) and the roadmap row from `df2e9ea`
> repeat the wrong claim; this is the correction of record.

What is actually true is narrower, and is still the reason the overlap shipped.

`hudInteractiveRects(state, vp)` answers for **`'idle'` only**, and returns exactly three panels —
the quest log, the item bar and the ✦ opener. The open wheel lives in state `'radial_menu'`, so the
dial is never one of the rects the invariant compares. It has never been checked against the log it
lands on, at any size. `tests/hud-layout.test.js` even pins the three names explicitly, so adding a
fourth panel was always going to be a deliberate act rather than something that happened by itself.

What I got wrong: the file has **two** describe blocks. `describe('the dock')` builds four viewports
with `dock: DOCK` and does run the non-overlap invariant against the real `dockLayout` — so the
dock's log, bar and opener *are* covered. The other block, `describe('hudLayout (fill): pinned to
the corners')`, builds its viewports without a dock on purpose: it is the `cornersLayout` block, and
testing the corners layout is its whole job. Its private `WHEEL_REACH = 126` is likewise the correct
constant for that layout, not a stale copy of the dial's 162.

So: the guard was pointed at the right layouts. It simply never knew about the dial.

**Latent, related:** `DIAL_MAX_R` is `dialRadius(3, false)` = 162, and the deepest node in the tree
today (`Fight > Melee > Hit`) needs exactly 162. Zero headroom. Give any depth-3 leaf a child and
the dial needs `dialRadius(3, true)` = 178 and silently overflows its reservation by 16 px. Nothing
tests this.

### 2. The wheel and the bar disagree about which item you are holding

The bar keeps its selection in `game.xmbCat` / `game.xmbPick` (`xmb.js` `resolveXmbSelection`). The
wheel keeps its own in `wheel.itemIndex`, which `createWheelState()` initialises to `0` and which
**nothing ever syncs from the bar** — the single writer is `_repeatLastAction` (`main.js:3385`).
`compose()` hands `itemSlot: w.itemIndex` to `_fireWheel`, which throws or consumes that bag slot.

Driving the shipped modules with a bag of `[Rock, Health Poition, Bomb]` after the player scrolls
the bar to the Bomb:

```
BAR says THROW ->  Bomb (bag slot 2)
BAR says DRINK ->  Health Poition (bag slot 1)
WHEEL Trick > Throw    -> itemSlot 0 = Rock
WHEEL Fight > Ranged   -> itemSlot 0 = Rock
WHEEL Treat > Eat      -> itemSlot 0 = Rock     <- a rock is not edible
```

Pick the Bomb, open the wheel, throw — you throw a Rock. `Treat > Eat` composes bag slot 0
whatever it is. This is the concrete content of *"that menu has been strange for a little while"*:
not a cosmetic complaint about the bar, but **two competing selection models**, one of which is
invisible and always points at slot 0.

### 3. The bar shows one item at a time

`xmbBarLayout` returns category chips over a **single** `current` cell with ▲/▼ arrows
(`layout.js:99-116`). The column exists in the model (`buildXmbBar` groups every usable) but the
view shows one of it. Literally *"just a single item"*.

### 4. There is no combat log, but the data for one already exists

`_log(msg, category)` already tags messages, and `combat` is the biggest category in use:

```
 19  combat        15  pickup        18  transition        1  quest
```

`_logStripColor` already paints `combat` red (`renderer.js:2144`). But the strip is a fixed
3-message ring buffer across *all* categories, so in a fight the damage lines are pushed out by
pickups and zone chatter. A combat log is mostly **a filter and more lines on data that is already
tagged**, not new plumbing.

### 5. You cannot see what the enemy has, though the game knows

Enemies carry `gold` and `loadout` (`enemies.js:442-444`, the Law-6f kit). `Trick > Thieve` greys
its three children out on `canThieve('coin'|'kit'|'gear')` — so the wheel already *answers* what is
stealable, and shows you only a grey slice, never *why*. Nothing displays the enemy's kit, their HP
number, or what a Trade would be offering against.

---

## The design

One sentence: **the dock has two faces, and the dial becomes a cell in it.**

A fight already changes the world — `main.js _trackFight` stamps `game._fightOn` before every frame
and the renderer draws the fog from it (`plans/fight-fog.md`). The dock reads the same flag. Same
strip, same height, same geometry budget; different contents, cross-faded on `_fightOn`.

```
TOWN FACE  ┌──────────────────────┬───────────────┬──────────────┐
           │ quest log + objective│   item bar    │   ✦ opener   │
           │ + 3 message lines    │               │              │
           └──────────────────────┴───────────────┴──────────────┘

FIGHT FACE ┌───────────────┬──────────────┬───────────────┬──────┐
           │  combat log   │  target card │   item bar    │ dial │
           │  (filtered,   │  HP · kit ·  │  (the active  │ (its │
           │   more lines) │  stealable   │   column)     │ own  │
           └───────────────┴──────────────┴───────────────┴cell )┘
```

### 1. The dial gets a reserved column

The fix for fault 1 is structural, not a nudge. `hudLayout` gains a **dial cell**: a column on the
right of the dock whose width is `DIAL_MAX_R * 2` and which no other piece may enter. Everything
else lays out in the remaining width, exactly as the log and bar already do against each other.

This is Caelan's *"collapse it left"* expressed in the layout system that already exists — the log
and the bar shrink to the space left over, instead of the dial being drawn over them.

The dial still rises above the dock when the wheel is deep (that is the wheel's nature, and the fog
darkens what is behind it anyway). What changes is that it never lands on another HUD panel, at any
size, because the panels are placed against its reservation.

**Recommendation:** reserve the column on **both** faces, so the dock does not reflow when a fight
starts. A dock that changes its column widths mid-fight would make the log jump under the player's
eye at the worst moment.

### 2. One item selection

Delete `wheel.itemIndex` as a stored cursor. `compose()` asks the game for the current usable, the
same way `aimRange` already asks the game for the equipped weapon's reach
(`wheel-model.js:299-301`). The bar's selection becomes the single source of truth, and the wheel's
Throw / Ranged / Eat / Cleanse fire what the bar is showing.

This keeps `wheel-model.js` pure — it asks a question of the game rather than importing `xmb.js`,
the same discipline `Thieve` already uses for `canThieve` (`wheel-model.js:70-80`).

Two consequences worth naming:

- **`Treat > Eat` must respect the category.** Eat fires the EAT column's selection, Cleanse the
  DRINK column's, Throw/Ranged the THROW column's — not "whatever the bar last showed". The wheel
  node says which column it wants; the bar says which item in it. **Built 2026-09-19** as
  `needsItem: 'throw'|'drink'|'eat'` on the node, resolved through a new `game.barSlot(cat)`.
  *Wart inherited, not introduced:* `soap` (`cure_sludge`) is the only cleanse-ish item in the game
  and `xmbCategoryOf` files it under DRINK beside the poitions, so `Cleanse` fires the DRINK column
  — usually a poition, not a cleanse. Strictly better than firing bag slot 0, but the verb and the
  column are not really the same idea. Worth revisiting when Cleanse gets content of its own.
- **A verb with an empty column greys out.** `Treat > Eat` with no food is currently `available:
  always` and would compose nothing. It should grey like Magic does on empty MP.

### 3. The combat log

On the fight face the log filters to `combat` and grows to the lines the taller cell allows. Out of
a fight it is the quest log it is today. The `[L]` history modal is unchanged — it keeps everything.

**Recommendation:** filter, don't segregate. One ring buffer, one modal, a per-face filter. A second
message store would mean two things to keep, two things to cap, and two things to get out of sync.

### 4. The target card

A compact panel for **the current target**: name, HP as a number and a bar, the carried kit, and
which of Coin / Kit / Gear is takeable. It is the thing that makes `Thieve` legible — the wheel
already computes those three answers and shows you three grey slices without saying why.

**Ruled (H1-4, 2026-09-19): both panels, player side read-only.** My recommendation was the enemy
card alone, with yours behind a toggle, on the grounds that your HP/MP/GP are already on screen and
the Remoticon has GEAR. Overridden, correctly: having to *open* the Remoticon mid-fight is the
friction the panel exists to remove, and a read-only panel removes it without inviting the
equipment-swapping that the design specifically does not want.

**Built 2026-09-19, in the fogged margins.** Two always-on panels do not fit the dock strip beside a
combat log, an item bar and the dial's column, so they live in the world's margins — left for you,
right for the target — which the fight fog already dims. They cost nothing readable and are
literally "in view at the same time".

**They are deliberately not mirror images**, and that was the design's real finding: *you* have six
named body slots, an enemy has a flat `loadout` array and a `gold` number. There is no HEAD/TORSO
breakdown on their side to show. Caelan ruled the honest version — a flat kit list — over forced
slot parity, which would have invented structure the game does not have and read as mostly-empty
slots on most enemies.

**Width came from the content, not from taste.** 96 px gives ten glyphs, which clipped
`WOODEN SWORD` to `WOODEN SW~` and dropped the third steal marker; 124 px gives fourteen, which
fits `HEALTH POITION` and `COIN KIT GEAR` on one line. Both clips were caught by the render tests,
not by looking. The panels give up width before they give up the fight: they shrink to keep
`FIGHT_PANEL_CLEAR` (16) tiles of unobstructed world between them, down to a 56 px legibility floor.
`MIN_TILES` is *not* the constraint here — the panels overlay the world's fogged edge tiles rather
than shrinking the viewport, and a first draft of the test asserted the wrong rule.

**One duplication removed on the way.** `main.canThieve` had the three "what could I take" questions
inline; they now live once in `fight-panels.takeable`, which both the wheel's grey Thieve slices and
the panel's TAKE markers read. They cannot drift apart.

### 5. The bar shows its column

The `current` cell becomes the active column, up to N items, the selected one marked. The ▲/▼
arrows stay for overflow past N. This is the smallest change that makes the bar *"more functional
than just a single item"*, and it is the last stage because it is the only one that is purely
cosmetic once fault 2 is fixed.

**Built 2026-09-19, as a horizontal row.** `plans/item-hotbar-xmb.md` specifies a *vertical* item
column, and that is not what this is. That document was written 2026-07-21, for the old 608 square,
before the dock existed; the dock's bar panel is 82 px tall, which one cell already fills, so a
vertical column could only exist by growing over the world or over the message log — the collision
stage 2 had just finished fixing for the dial. The alternatives (grow the dock permanently, or
expand upward while browsing) were put to Caelan with that cost stated, and he ruled the row.

Two things the build settled:

- **Touch finally gets the grammar the XMB doc described.** *"Tap a category, tap an item, tap to
  fire"* was unimplementable on a one-cell bar, because there was never a second item on screen to
  tap. Now: tapping an unselected cell picks it, tapping the picked one uses it.
- **The cell gap is 12, not 6, and that is structural.** `HIT_SLOP` grows every cell by 6 a side, so
  at a 6 px gap two neighbours both claim the same pixels and which one fires depends on iteration
  order. At 12 the expanded cells merely touch. Pinned by a test rather than fixed with a
  nearest-centre tie-break — the geometry should not be ambiguous in the first place.

The item's name moved *below* the row, because the row took the width the name used to sit in.

*Not unit-tested:* `main._tapXmbBar` itself. No test in this repo imports `main.js` — it is
DOM-coupled — so the tap grammar was verified in the browser instead: first tap selected the fire
bottle without consuming it, second tap threw it (burst, one caught, Burning 5), the bar reflowed to
three cells and the selection fell back to the rock. Worth a harness one day; not worth inventing
one here.

---

## Stages

Five checkpoints, built inline, in this order. Each leaves the game running and is worth stopping
at. The first two are the bug fixes; the last three are the feature.

| # | Stage | Size | Touches | Why here |
|---|---|---|---|---|
| 1 | **One item selection** — `compose` asks the game; category-aware; empty columns grey | S | `wheel-model.js`, `main.js` | Pure model, node-testable, no art. Fixes a live bug on its own. |
| 2 | **The dial gets a cell** — teach the invariant the `'radial_menu'` state (fault 1b), then reserve the column | S–M | `layout.js`, `renderer.js`, `tests/hud-layout.test.js` | Fixes the measured overlap, and makes the guard real before leaning on it. |
| 3 | **The two faces** — the dock reads `_fightOn`; the combat-log filter | M | `layout.js`, `renderer.js`, `combat-log.js` | **Built 2026-09-19.** The structure the rest hangs on. |
| 4 | **The two gear panels** — yours and theirs, read-only, in the fogged margins | M | `fight-panels.js`, `layout.js`, `renderer.js` | **Built 2026-09-19.** Needed the fight face to live beside. |
| 5 | **The bar shows its column** | S | `layout.js`, `renderer.js`, `main.js` hit-test | **Built 2026-09-19.** Cosmetic once 1 had landed. |

Stages 1 and 2 are independently shippable and fix bugs that exist right now. If the session runs
short, **1 and 2 are the ones worth having.**

Branch: `feature/combat-hud`, short-lived — it touches `main.js` and `layout.js`, the core files
CLAUDE.md's merge hygiene is about. `git branch --no-merged dev` today shows only `plan` and
`feature/diagonal-prototype`; the latter's diff does not touch `layout.js`, so there is no conflict
to reconcile before starting.

---

## Tests

The invariant that would have caught fault 1, and the ones that keep it caught:

1. **The open wheel is in the non-overlap invariant.** Teach `hudInteractiveRects` the
   `'radial_menu'` state so the dial is one of the rects it returns, and assert no overlap across a
   dock-built table of viewports including the three that fail today (980×800, 900×1200, 430×932).
   Leave the two existing describe blocks alone: `describe('the dock')` already builds its
   viewports with `dock: DOCK`, and the corners block is meant to be dock-free.
2. **The dial fits its reservation.** Assert `max(dialRadius(d, hasKids))` over every node actually
   in `ROOT` is `<= DIAL_MAX_R`. Today that is 162 ≤ 162 — it passes with zero headroom, and fails
   the moment someone gives a depth-3 leaf a child. That is the point.
3. **One selection.** Given a bag and a bar selection, `compose()` on Throw / Ranged / Eat /
   Cleanse returns the bar's slot for the node's category — the test the §2 proof becomes.
4. **Empty column greys.** `verbApplies(Eat)` is false with no food.
5. **The faces.** `hudLayout` with `_fightOn` true vs. false returns the same dial cell and the same
   overall dock height (the no-reflow rule). **Built, and pinned per viewport:** every dock rect is
   asserted identical across the faces, so only `log.face` and `log.lines` may differ.
6. **Something has to actually DRAW.** Stage 3 shipped a `ReferenceError` past a green suite — the
   log's header read `fightFace` before its `const` was initialised, so `_drawQuestLog` threw on
   every frame while 1446 tests passed, because nothing in the suite called a draw method.
   `tests/dock-faces-render.test.js` now drives the real `_drawQuestLog` through the recording
   canvas that `fight-fog-render.test.js` already established. Mutation-checked: reintroducing the
   bug fails those five tests and **no others**.

Baseline to re-measure before starting, not to quote: `npm test` was 1409 tests / 262 suites / 0
failures at v0.22.1.

---

## Rulings (Caelan's)

> **Ruled 2026-09-19, on waking:** **H1-6 — stages 1 and 2 only** (the two bug fixes), then re-rule
> the rest once he has felt the dial in a cell. H1-1 and H1-2 are ruled *yes* implicitly, being
> exactly what stages 1-2 are. **H1-3 and H1-5 are not yet ruled** — they belong to stages 3 and 4,
> which are not being built yet.
>
> **H1-4 — re-ruled the same day: BOTH panels, and the player's side is READ-ONLY.** The
> recommendation above (enemy card only) was put to him and overridden, with the reasoning that
> makes it right: the panel exists so you never feel the need to go and check, not so you can
> swap. *"Everything is so nebulous that you would always want to see your inventory in there at
> the same time, so that you're not swapping out weapons and things. Even in the deepest RPGs
> you're not swapping out equipment per fight. D&D specifically guards against that."* Donning
> armour takes minutes in 5e and drawing or stowing a weapon spends your object interaction —
> mid-fight swapping is disincentivised by design, and the answer is to show the gear, not to
> speed up changing it. **So: no equip affordance anywhere in the fight HUD.**

### The full list

- **H1-1 — the dial's cell.** Reserve a dock column for the dial, on both faces? (Recommended.) The
  alternative he raised was collapsing the wheel left on a tall window only, which fixes the
  screenshot but leaves the 191 px of covered world on his own ultrawide.
- **H1-2 — one item selection.** Make the bar the single source of truth and delete `wheel.itemIndex`?
  (Recommended — it is a bug either way.) The only reason to say no is if the wheel is *meant* to
  have its own item cursor, in which case the bar should show that cursor instead.
- **H1-3 — the combat log.** ~~Filter or separate feed?~~ **Built 2026-09-19 as the filter**, on
  the spec's recommendation, flagged to Caelan as unruled before building rather than after. One
  ring buffer, one `[L]` modal, one thing to cap. `game/combat-log.js` `combatLines(history, n)` is
  the whole of it — it reads the 300-deep `_logHistory` rather than the 3-entry strip, because
  filtering three mixed messages down to the combat ones usually leaves one or none. Overturn here
  if he wants a separate feed after all.
- **H1-4 — one panel or two.** Enemy target card only, with yours behind a toggle (recommended), or
  the symmetric you-and-them panels he asked for? Two always-on panels change the dock's layout, so
  this decides §3 above rather than decorating it.
- **H1-5 — what the card shows.** **Ruled 2026-09-19: name the items, HP as digits.** Precision is
  what the player plans against; "3 items" does not tell you whether robbing them is worth it. Built
  as name · HP n/max · GP n · the kit by name · the live takes.
- **H1-6 — scope.** All five stages, or land 1–2 (the bug fixes) and re-rule the rest once he has
  played with the dial in a cell?

---

## Out of scope

- What enemies perceive, how they chase, or who is in the fight. This draws the fight's furniture;
  `fight-area.js` decides its membership, and changing that is F3.
- The fog, the entrances, the splats. F1 shipped them; F2 is the splat art.
- Mid-combat buying. `plans/combat-ui-layers.md` put a shop inside the fight; the target card shows
  what a trade *would* be against, and Trade is already a wheel verb. Opening the offer screen
  mid-fight is a separate ruling, not this spec's.
- The Remoticon, the bag, equipping. The bar is a view over the bag and stays one.

## What `combat-ui-layers.md` still has, and what it does not

That spec (2026-05-22) predates the wheel, the dock, the fog and the XMB bar. Its five-verb
directional overlay is superseded by the wheel; its Inspect layer is the ancestor of the target
card; its core principle — *the world never disappears, Escape always moves you one step closer to
walking* — is still the law this design obeys. It should carry a partial-supersession banner when
this lands, not be deleted: the principle is load-bearing and is quoted nowhere else.

---

## What comes after, and what is waiting on a ruling

**Next two fight items**, both unblocked and both smaller than this one:

- **F2 — hit-splat art** (S). The splat system already ships: typed fill colours, per-type motion,
  crit borders, reduce-motion (`renderer.js:1691-1790`). F2 is *glyphs on top of a shipped system* —
  Kenney Emote Pack Style 8 covers heal / poison / miss / crit; flame, snowflake and skull get
  drawn. Carries his *"slashing versus crushing"* entrances. Open question is one table: glyph per
  damage type, on the badge or beside it.
- **F3 — who gets pulled into a fight** (M). `fight-area.js` was written anticipating this — its
  header says so in as many words. The rule to rule: is "whoever can see the fight is in it" the
  whole answer?

**Decisions still open elsewhere, unchanged by this document:**

- **Living zones vs. H1.** `plans/species-adventures.md` §5 leaves the order unruled. He chose H1
  for this session; the order of what follows is still his.
- **The five recommendations** in `species-adventures.md` §3 (unlock-vs-canon, zone order, farming,
  what respawns, NG+). Recommendation 5 asks him to reread `cosmology-and-arc.md` before ruling.
- **Ruling CD is DONE but three documents still call it open** — `plans/roadmap-2026-09.md` §2 and
  its state line, `plans/demo-readiness.md` §2.5, and the roadmap board's CD card. Left alone
  deliberately: he picked H1 over the docs pass. Worth a docs-only commit whenever the board is next
  updated, before a future session inherits the stale claim.
