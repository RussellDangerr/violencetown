# Violencetown — Chapter Two: Downtown, the Canyon & Systems Cohesion

## ✅ BUILT / SHIPPED STATUS (updated 2026-07-04) — read this first

Most of this plan is now **built and either shipped or merged to dev**. Current: **main = v0.12.0
(LIVE)**, **dev** has everything below + a v0.13.0 ship pending.

- **Phase 6 (6a–6d, the reversible economy) — BUILT + SHIPPED in v0.12.0 (live).** give→trade (offer
  mode), chests→trade (loot mode), the ~5-min buyback window (per-unit LIFO price stacks) + the
  disposition tick clock, value tiers (Grey→Orange) + special-buyer **Macc**. A pre-prod adversarial
  review caught + fixed **8 ship-blockers before launch** — a deterministic **gold-dup** (buyback
  last-write-wins price → per-unit price stacks), **two permanent quest soft-locks** (Macc special-buy
  + offer-mode give-away of the sole car-fix Converter), a dead-player auto-walk regression, and
  save/load dropping vendor fields. **Decision: quest items are protected EVERYWHERE** (offer +
  specialBuys guard `!questItem`; Macc's Converter-buy is inert on this build and **auto-re-enables**
  when the Converter stops being a questItem). 6e (economy tuning) is still open/post-1.0.
- **Phases 1–3 (transaction spine, bridge cutscene + alcohol side-mission, Canyon + Pike + grappling
  hook) — BUILT + MERGED to dev (2026-07-04).** The Armory arc (the *previous* plan's Phases 1–4)
  also merged. Both were reconciled against the shipped v0.12.0 economy.
- **ECONOMY RECONCILIATION (Caelan's calls, 2026-07-04):** the plan's Phase-1 **transaction spine is
  FUSED UNDERNEATH** Phase 6, not instead of it — `transferGold` (strict conservation + funded NPC
  wallets, VENDOR_WALLET) is the gold-movement layer; the buyback ledger + give-fold sit on top; ALL
  gold routes through transferGold and buy/sell still record buyback credits. This is what "Phase 6
  extends Phase 1's spine" always meant — Phase 6 was only built on raw gold because the spine wasn't
  merged yet. **Give-fold kept** (`_tryTradeWith` no longer gates non-vendors; `_offerFromTrade` routes
  through `reactToTransaction`). **Both canyon items kept** (chain = Macc rappel-DOWN; grappling_hook =
  Pike escape UP — complementary, resolving Open-decision #2's canyon-route question).
- **STILL OPEN / NOT BUILT:** Phase 0 (world re-route + Factory tiles, Caelan-driven), **Phase 4
  (Downtown + MQ2 burger delivery)**, **Phase 5 (the real GRAPPLE_ANCHOR swing mechanic** — the canyon
  escape is currently a data-gated `requires` transition placeholder). 6e economy tuning.
- **Process note that earned its keep:** run an adversarial pre-prod review before shipping economy/
  core changes (it caught the 8 blockers); a merge is only done when the game RUNS (git auto-merge hid
  a dropped import + a dropped brace during the arc merges). See repo `CLAUDE.md` "Branch & merge
  hygiene".

The rest of this doc is the original plan (design intent + the phases). Where a phase says "designed,
not built," check the status above — 1–3 and 6 are done.

## Context

The armory arc (Phases 1–4 of the previous plan — Sewer armor, GP/MP skills, Fear, Weapons) is
**built, verified, and pushed** on five stacked branches (equipment-armor → sewer-armor-set →
skill-economy → fear-system → weapons-armory), awaiting Caelan's merge. This new plan is the next
arc, and it has two intertwined goals Caelan named explicitly:

1. **New content** — Main Quest 2, a bridge cutscene, the Downtown zone, the Canyon fail-branch with
   Pike + the grappling hook, and multi-path quest solving.
2. **Systems cohesion** — a gap analysis (done, 4 research agents) found the transaction systems
   (throw / give / trade / sell / bribe) are **five disconnected implementations** with no shared
   spine. Caelan wants them to feel like one idea ("hand an item/money to a target, get something
   back") and the "no one to trade" bug fixed — **without** building full per-NPC inventories yet.

The previous plan's **Phase 5 (world re-routing + Factory tiles)** was never built; it carries
forward here as **Phase 0** (still Caelan-hand-authored).

### Resolved design decisions (locked with Caelan this session)
- **The bridge subversion:** the Cataclysmic Converter makes the car **too fast** (mushroom cloud out
  the back). Driving the bridge naively → you punch **straight through** the wooden bridge and smash
  into the far canyon wall → fall into the **Canyon**. You'd *expect* a triumphant ramp; you get a
  crash. This is the default, and it's a **reward-branch**, not a punishment (Pike + the hook are down
  there).
- **Player agency via a fuel side-mission:** buy a **bottle of alcohol**, pour it in the gas tank →
  it **slows the car** enough to actually **ramp the bridge** → land in **Downtown**. A **breadcrumb**
  teaches the fuel lesson: **alcohol burns fast & weak; oil burns slow & dense** (energy-dense). So
  fuel choice changes the car's speed and the bridge outcome.
- **Geography:** the wooden bridge spans the canyon connecting old **Town** ⟷ **Downtown**. Ramp
  success → Downtown (start MQ2). Crash-through → the Canyon below.
- **Grappling hook, three ways:** buy from Pike (1,000 GP), quest for it, or kill him and take it —
  all converge on one `item_pickup` event (the hook is the *symbol* of success, not the mechanism).
- **Amusement-park theory:** the hook OPENS areas; never tease a chest/ledge you can't reach on a
  first visit. Anchors are visibly examinable; a gap is walkable after you swing; no locked doors.
- **NPC trade / inventories deferred:** Caelan will hand-author curated merchant stock later with more
  items; **do NOT** procedurally generate NPC inventories now.

### Trade-window decisions (locked 2026-07-03 — the "reversible economy" pass; detailed in the new Phase 6)
- **GIVE is removed; it folds into TRADE.** The give verb bloats the menus and duplicates what Trade
  already does. Handing an item to any NPC — including for **0 GP** (your boss, a sack of sludge) or a
  **quest item** (marked with a quest-point symbol, not a gold price) — happens **inside the trade
  window**. The `give-action.js` *math* stays (it's what shifts disposition / flips an ally); only the
  give VERB / node / UI dies. (Supersedes the two-wheels spec's Give verb — see Phase 6 + that doc's note.)
- **The trade window is the ONE item-transaction surface** — merchants **and** bandit chests both open
  it. No separate loot UI. "Loot the corpse" = a trade window whose stock is the chest's contents.
- **Trades are reversible** — an ~**5-minute buyback window** at **locked prices** (Borderlands buyback ×
  Outward's confirm-heavy barter, hybridized): everything you buy/sell can be refunded/re-bought at the
  exact price for that window, so the player can freely test item + gold combos to manage disposition
  before committing. The buyback timer **is** the **disposition tick clock**.
- **No quest-item tab; quest items are regular items.** The Cataclysmic Converter is an ordinary item —
  it just has no *ordinary* buyer. Legibility comes from **surfacing all options** (a 0-GP item a
  specific NPC wants teaches "this has a special use"), not from a segregated tab. Special-buyer NPCs +
  a Grey/Green/Blue/Purple/Orange **value-tier** convention make worth legible (see Phase 6).
- **Macc the raccoon mechanic** (new Town NPC) is the archetype special-buyer: buys the Converter for
  **500 GP**, and **sells a chain (100 GP) that opens a rappel route through the Canyon** — a fourth path
  that ties the economy to the mobility unlock (see Phase 3 + Phase 6). The Converter is also **throwable
  for huge damage** — another "true, freely-chosen option," not a locked quest object.
- **Economy tuning target:** Outward-tight **silver-to-item ratios** — reuse the `gold-weighting-and-
  bribery-research` findings; balance `baseValue` + the `trade.js` bands, don't restructure.

**Intended outcome:** a cohesive economy spine + a two-path bridge arc (Downtown vs. Canyon) that
embodies "many ways to play," with the grappling hook as a carefully-introduced mobility unlock, and a
**reversible, legible trade window** that is the single home for buying, selling, gifting, and looting.

---

## Phase 0 — World re-routing & Factory tiles  (carried from the old Phase 5; Caelan-driven)

Transition edits, two NEW zones, and a sprite-cell repaint; Caelan hand-authors the map geometry
(Claude scaffolds the maps + wiring). Current built topology: Factory = west dead-end off Town, Sewer =
east, Carnival = south (→ Graveyard → Wilderness), Borgir = interior.

- **NEW zone — Park** (Caelan, this session): a zone **between Town and the Factory** on the west arm →
  **Town ⟷ Park ⟷ Factory**. Park fills the "gates the Factory" role the plan had tentatively floated
  for the Carnival, so **the Carnival does NOT move** — it stays on the south arm exactly as it is
  (**Town ⟷ Carnival ⟷ Graveyard ⟷ Wilderness**, unchanged). This *supersedes* the old
  Carnival-west / graveyard-first re-route. Park = base Town, not Downtown.
- **NEW zone — Cave** (Caelan, this session): south of the **Sewer**, entered through **a hole in the
  wall** → **Sewer ⟷ Cave**. A dark cave with a boss + a friendly NPC (see the Bestiary doc). Opts into
  the Wilderness `_drawDarkness` treatment.
- **Resulting topology:**
  ```
                         [Downtown]           (north bridge — Chapter Two)
                             |
  [Factory] — [Park] — [TOWN] — [Sewer] —(hole)— [Cave]
                             |
                         [Carnival] — [Graveyard] — [Wilderness]
  ```
  All are `transitions`-array edits (the engine is generic — `_loadMap`/`getTransition`, no code) plus
  two new `park-map.json` / `cave-map.json` files. Wiring them *coherently* (edges, labels, walkable
  landings, the sewer hole) is map-edge authoring = Caelan's pass.
- **Factory tile overhaul:** `FACTORY_FLOOR/WALL/CONVEYOR_VIS` (data.js ids 40–43) currently proxy
  with generic Tiny Dungeon stone/wood; re-pick sprite cells in `sprites.js ZONE_TILE_SPRITE_MAP`
  toward metallic/machinery reads. Claude can prep candidate cells; Caelan picks.
- **Bestiary:** the creatures for Cave / Carnival / Park / Factory live in `plans/bestiary.md` (started
  this session). Several need new mechanics (Weredigo invisibility + blind combat; the Ruffian's
  steal-and-flee; the friendly Bear NPC) — flagged there.

---

## Phase 1 — Transaction cohesion: the shared economy spine  ← FOUNDATION, BUILD FIRST

The gap analysis (agent report) found: `_removeFromSlot` is the only shared idiom; gold moves via raw
`this.gold ±= x` in **5 places**; NPC reactions diverge; NPCs have **no gold or inventory**. Build the
spine first so all new merchant/quest content (Pike, Downtown, the alcohol vendor) rides it.

- **Fix the "no one to trade" bug** — `main.js` wheel `trade` resolver (~L2443) collapses "no NPC" and
  "NPC-not-a-vendor" into one message via `if (npc && npc.vendor)`. Replace with a `_tryTradeWith(npc)`
  that emits three distinct outcomes: no one there / "the {type} doesn't trade" / "{type} won't deal —
  sweeten the mood" (`canTrade`), else open. Mirrors the GIVE/BRIBE "check existence first" pattern.
- **`transferGold(from, to, amount, reason)`** (new, in `trade.js`) — one gold-flow function; refactor
  the 5 raw sites (BRIBE ~L2462, BUY ~L3650, SELL ~L3672, `_bribeVendor` ~L3688, dialogue-cost ~L3613)
  to call it. Introduce a **real `npc.gold`** (stub, starts 0) so gold actually moves to the NPC —
  makes future "NPC pays you back / restocks" possible.
- **`reactToTransaction(npc, type, payload)`** (new, in `give-action.js`) — unify the NPC-reaction seam
  (disposition shift + `applyFlip`) that GIVE and BRIBE currently reach two different ways
  (`applyGive` vs `applyDispositionDelta`). One call site each; keep `applyFlip`/`applyGive` as
  internal helpers.
- **Stub NPC state for the future** — add `this.gold = 0` and `this.giftLog = []` to the `Enemy`
  constructor (`enemies.js`) + save/load (save schema prepared, never mutated destructively). This is
  the hook for later per-NPC inventories **without building them now**.
- **Unify the mental model** (docs/comments, not a rewrite): throw/give/trade/sell/bribe all read as
  "an item or money leaves you toward a target; the target reacts." Throw stays combat (item detonates)
  but is acknowledged in the same family. No behavior change to throw.
- **Explicitly OUT of scope:** per-NPC inventories, procedural loadouts, NPCs consuming/re-selling
  given items, finite vendor stock. (Deferred per Caelan.)

**Reuse:** `_removeFromSlot`, `applyFlip`, `applyDispositionDelta`, `canTrade`/`buyPrice`/`sellPrice`
(`trade.js`), `_openTrade`. **Files:** `game/trade.js`, `game/give-action.js`, `game/main.js`,
`game/enemies.js`, `game/save.js`. **Verify:** no behavior regressions in buy/sell/bribe/give; trading a
mob now says "doesn't trade" not "no one there"; a bribe/purchase moves gold onto `npc.gold`.

---

## Phase 2 — The bridge cutscene, the too-fast car & the alcohol side-mission

The single hook point is the bridge-crossing check in the `_doMove` animation callback (`main.js`
~L1666: `ny===0 && nx 14–19 && carFixed` → currently `_endChapterOne()`). Replace it with a fuel-gated
branch.

- **Car speed state** — after the Cataclysmic Converter is installed, the car is **too fast**
  (`game` flag e.g. `carFuel = 'raw'`). Pouring alcohol sets `carFuel = 'alcohol'` (slowed). The bridge
  branch reads this:
  - `carFuel !== 'alcohol'` → **crash-through cutscene** → load the Canyon (Phase 3).
  - `carFuel === 'alcohol'` → **ramp cutscene** → load Downtown (Phase 4), start MQ2.
- **The cutscenes** reuse the `_endChapterOne` pattern (STATE-driven; block input, `_stopAutoRepeat`) +
  `_triggerScreenShake` + `_flash` + sequenced `_log` beats (no camera pan — the fixed 608 viewport
  stays centered; drama is shake/flash/text/SFX). Add a `STATE.CUTSCENE` (or reuse RESOLVING) that
  gates input during the beat.
  - Crash: "[The converter SCREAMS — you're going too fast — the bridge SPLINTERS —]" + heavy shake +
    red flash → `_loadCanyon()`.
  - Ramp: "[The engine burbles, tamed — you hit the ramp clean and SAIL over the canyon —]" + gold
    flash → `_loadMap('downtown-map.json', ...)` + `_startMainQuest2()`.
- **The alcohol side-mission (player agency):**
  - A **vendor sells a bottle of alcohol** (item `alcohol`, `useType:'self'` or a car-interaction
    consumable). Likely a Town/Borgir vendor (decision §Open).
  - **Pour it in the gas tank** — extend `_interactCar` (`main.js` ~L1752, tile 19 bump): if you hold
    alcohol and the car's fixed, an option pours it → `carFuel='alcohol'` + a log beat. Reuse the car
    examinable/interaction dispatch.
  - **The breadcrumb** — an examinable (a fuel drum / a mechanic's note near the car or in Borgir):
    "[Alcohol burns FAST and mean — gone in a flash, barely a push. Oil's the opposite: slow, dense,
    burns forever. You'd want oil in a real engine... but you want SLOW right now.]" Teaches the lesson
    without spelling out the puzzle. (Oil = a parked future fuel mechanic, §Open.)
- **Fuel = the Cataclysmic Converter lore:** the converter is *too* energy-dense → too fast. Alcohol
  dilutes/slows it. This grounds the joke and sets up oil as a later "proper fuel."

**Reuse:** `_endChapterOne`/STATE pattern, `_triggerScreenShake`, `_flash`, `_animateMove`,
`_interactCar`, the examinable + `grants`/breadcrumb system, `_loadMap`. **Files:** `game/main.js`
(bridge branch, `_playBridgeCutscene`, `carFuel`, `_interactCar` pour-option), `game/items.js`
(`alcohol`), the map(s) for the breadcrumb + alcohol vendor. **Verify:** naive drive → crash → canyon;
alcohol'd drive → ramp → Downtown; the breadcrumb reads before you need it.

---

## Phase 3 — The Canyon zone + Pike + the grappling hook (the multi-path archetype)

- **Canyon zone** (`game/canyon-map.json`, new) — entered **only** via `_loadCanyon()` (a programmatic
  forced-load on crash-through; no walkable door), like the zone-pursuit follower injection precedent.
  Dark/claustrophobic (opt into the Wilderness `_drawDarkness` treatment). The player lands mid-fall;
  spawn a couple of hostile canyon creatures so the beat is "fight your way out."
- **Pike** — an ageless prospector. Lore: floated his covered wagon across the river (back when it was
  a river), sank, and the river's strange magic (or the saltwater) preserved his soul — he hasn't aged.
  His covered wagon + a big **rope** (the grappling hook) are his.
- **The grappling hook, 3 ways** (all converge on `emitGameEvent('item_pickup', {id:'grappling_hook'})`
  → a `canyon_escape` quest gate advances regardless of path):
  - **BUY** — Pike as `vendor:true`, `stock:['grappling_hook']`; `grappling_hook` item `baseValue:1000`.
    **Already works** on the Phase-1 spine (no new code).
  - **KILL** — Pike also a fightable NPC with `tag:'pike_boss'`; extend `_handleEnemyDeath` with a
    tagged drop (mirror the Wererat converter drop, ~5 LOC).
  - **QUEST** — a dialogue choice starts a Pike task (e.g., clear his old mine shaft / recover
    something) that rewards the hook. Needs a **small, general dialogue-consequence hook**: extend
    `_pickDialogueChoice` (`main.js` ~L3606) to honor `choice.onPick(game,npc)` and/or `choice.questId`
    (~5 LOC) + a `pike_*` quest in `quests.js`. This hook is reusable for all future multi-path quests.
- **Escape = the hook's first use** (amusement-park theory: get it, immediately use it — no teasing) —
  a GRAPPLE_ANCHOR (Phase 5) on the canyon wall lets you swing/climb **up to Downtown** (the far side
  you crashed into) or back to Town (§Open). This teaches the mechanic in-context.
- **A fourth path — Macc's chain (2026-07-03).** The player doesn't have to crash or pay Pike 1,000 GP:
  **Macc the raccoon mechanic** (a Town mechanic shop — see Phase 6) sells a **chain for 100 GP** that
  **rappels the canyon wall** — a cheap, deliberate route that hands the player agency instead of a
  forced fall. Macc's **dialogue exposes the option** ("that converter'll punch you clean off the bridge…
  unless you've got a way down — I've got chain"). Mechanically the chain is a **lighter grapple**: it
  reuses the Phase-5 GRAPPLE_ANCHOR path (descend/traverse) rather than being a separate system. Keeps
  the "many ways" promise: crash (default) · alcohol-ramp (avoid the canyon) · Macc's chain (rappel in on
  purpose) · Pike's hook (climb out). All roads still converge on the `canyon_escape` gate.

**Reuse:** vendor/trade (Phase 1), `_handleEnemyDeath` tag-drop, dialogue system, `emitGameEvent` +
quest gate, `autoSatisfy` (tolerant if the hook's already in the bag). **Files:** `game/canyon-map.json`,
`game/main.js` (`_loadCanyon`, `_handleEnemyDeath` drop, dialogue hook), `game/quests.js`,
`game/dialogue.js`, `game/items.js`. **Verify:** each of buy/kill/quest hands over the hook and opens
the canyon exit; the escape swing works.

---

## Phase 4 — Downtown zone + Main Quest 2 (the burger delivery)

- **Downtown** (`game/downtown-map.json`, new) — across the bridge; "the real part of town." Bank, the
  **vampire**, a couple of buildings, **better merchants** (curated stock — no procedural loadouts;
  apply the Phase-6 **special-buyer** pattern here too — some Downtown merchants pay for things Town
  won't), **city lights** (neon via the `lights` array + night lightmap), a **casino**. Caelan
  hand-authors the layout; Claude scaffolds the JSON + wires the bridge-landing transition.
- **Main Quest 2 — deliver a burger + fries to a target** (makes the Borgir courier premise real; today
  it's lore only). New `deliver_food` quest in `quests.js`: obtain burger+fries → find the target in
  Downtown → hand it over. **Multi-path completion** (give-item OR a dialogue hand-off) via a new
  `give_item` / `npc_dialogue_choice` event + the `autoSatisfy` convergence pattern.
- Ties the "yellow card / taxi licence" lore (Borgir counter) toward a longer spine (future chapters).

**Reuse:** map schema, `_loadMap`/transitions, quest engine, the Phase-1 trade spine (better merchants),
dialogue, the Phase-3 dialogue-consequence hook, day/night lightmap. **Files:** `game/downtown-map.json`,
`game/quests.js`, `game/main.js` (`_startMainQuest2`, `give_item` event), `game/dialogue.js`,
`game/items.js` (fries). **Verify:** ramp lands in Downtown + MQ2 starts; the delivery completes via
give and via dialogue.

---

## Phase 5 — The grappling-hook mobility mechanic (careful, amusement-park-safe)

- **GRAPPLE_ANCHOR tile** (`data.js`, new id, `walkable:false`, `grappleable:true`) + a bump handler in
  `_doMove` (mirrors the CAR tile-19 / BARRICADE tile-23 dispatch): bump an anchor → `STATE.GRAPPLE_AIM`
  → pick a direction → swing across the gap to the far walkable tile (`_animateMove` the arc).
- **Amusement-park compliance (the whole point):** every anchor is **visibly examinable** ("[a rusty
  chain ring — something could swing from here]"), the destination is **walkable after** the swing (no
  further gate), and you **never** see a chest/ledge that's teased-but-locked before you have the hook.
  The hook OPENS areas; it never creates "I wish I had the item" moments.
- The **canyon escape (Phase 3)** is the first, tutorializing instance. Later zones can seed anchors to
  open optional pockets — but only introduce a hook-gated area *after* the hook exists in the world.
- **Gate the hook's use** on having it (inventory/equipped); an anchor bumped without the hook gives a
  gentle "you'd need a hook and a good arm" (not a locked-door tease).

**Reuse:** `_doMove` bump dispatch, `_animateMove`, `_tileFreeForShove`, examinables, STATE pattern.
**Files:** `game/data.js`, `game/sprites.js` (anchor tile art), `game/main.js` (`_interactGrappleAnchor`,
STATE), maps (anchor placements). **Verify:** swing across a gap; bump without the hook is a soft no;
no teased-locked content anywhere the hook isn't yet available.

---

## Phase 6 — Economy cohesion & the reversible trade window (2026-07-03)

The trade-window brain-dump, filed against the current code (verified by a 4-reader recon, 2026-07-03).
This **extends Phase 1's spine** rather than replacing it: Phase 1 unified *gold flow + NPC reactions*;
Phase 6 unifies *the surfaces* (give/loot fold into trade) and adds *reversibility + legibility*. It is
**designed, not built** — build it after Phase 1 lands (it rides `transferGold` / `reactToTransaction`).

### 6a — GIVE folds into TRADE (delete the verb; keep the math)

Recon confirms **no quest or dialogue on `dev` depends on GIVE as its own verb** (the only quest,
`fix_car`, gates on examine/item_pickup/map_entered/interact_car). So the fold is safe. `give-action.js`
(`applyGive`, `applyDispositionDelta`, `applyFlip`) **stays** — Trade calls it. Only the give *surface* dies.

- **DELETE (verb / node / UI):** the Player-Wheel `give` node (`wheel-model.js:50`); the Target-Wheel
  `give` verb push (`wheel-model.js:331`); `resolver==='give'` from the two `social` OR-sets
  (`wheel-model.js:281`, `:308`); the `case 'give'` in `_fireTargetVerb` (`main.js:2296`) and `_wheelFire`
  (`main.js:2535`); the ITEM_OVERLAY Down=Give affordance (`main.js:1998`) + `_pickOverlay` give case
  (`:2055`); the whole `ITEM_GIVE_DIR` machinery (STATE `main.js:50`, key handler `:783`, tap routing
  `:1426`/`:1520`, `_doGiveDir` `:2151`, renderer dispatch `renderer.js:408`); the `give:'♥'` wheel icon
  (`renderer.js:1988`). Keep `_doGive` (`main.js:2132`) as the **internal** routine the window calls.
- **WIDEN the trade window to reach non-vendors + offer for 0 GP:** `_openTrade` (`main.js:3459`) currently
  `return`s unless `npc.vendor`. Add an **"offer" mode** when `npc.vendor` is falsy: hide buy/sell columns,
  show only a satchel→NPC **offer** column. On confirm route through `applyGive(item, npc)` (i.e.
  `reactToTransaction(npc,'give',{item})` once the spine merges — the spine's `'give'` transaction *type*
  already anticipates this) → consume the item, fire the flip/disposition log, advance the world.
- **Quest-item marker:** quest items already carry `questItem` (`trade.js:60` → `sellPrice` returns null).
  Render them in the offer column with a **quest-point symbol instead of a gold price** — the "0 GP /
  different symbol" Caelan described. (A future MQ2 delivery = offering the right questItem to the right
  NPC emits a new quest event — that wiring is NEW, filed under Phase 4.)
- **Reroute the entry points:** Target-Wheel `⇄ Trade` (`wheel-model.js:329`) widens its gate from
  `e.vendor && adj` to **`adj`** (any adjacent NPC — non-vendors must be trade-able to receive gifts).
  Player-Wheel Trick→Trade (`wheel-model.js:51` → `_wheelFire 'trade'` `main.js:2528`) already calls
  `_openTrade`; it just needs the widened `_openTrade`. **Bribe stays separate** (gold-out, no item).
- **Cross-cutting:** supersede the two-wheels spec's Give verb (§2/§5/§6/§12 — note added there); after the
  fold the Target Wheel's gold cluster is Bribe + Trade (a §13-style "are two gold wedges confusing?"
  open decision). ⚠️ **Armory-arc conflict:** the unmerged Armory arc also rewrites the Trick children in
  `wheel-model.js`; do the give-removal **in the same pass** as slotting Boo!/Ray-Blast/Hire-Lire.

### 6b — One surface: bandit chests route through the trade window

Today chests are a **separate instant no-UI dump** — `_openContainer` (`main.js:2810`) bump-empties
`container.contents` into the bag, no modal. Route them through the window instead: model a chest as a
**zero-cost vendor** whose `stock` is `container.contents` and whose "buy" **moves + removes** the item
(instead of minting from `ITEMS` and charging gold). Gaps to close (recon): (1) a **finite-stock /
decrement-source** branch in the buy handler (vendor stock is infinite today); (2) a **disposition
bypass** (chests have no `npc.disposition`, so skip the `canTrade`/pricing guards); (3) **normalize**
container entries (strings-or-`{type}`) into the `stock` shape `_tapTrade` reads. Bandit "loot the corpse"
becomes the same reversible window as shopping — which is also where buyback (6c) applies.

### 6c — Reversibility: the ~5-min buyback window + the disposition tick clock

The centerpiece. **No buyback ledger or shop timer exists today** (recon); buy/sell are fire-and-forget
`this.gold ±= price` (Phase 1 replaces those with `transferGold`). Disposition is **frozen between
explicit actions** — no clock anywhere. Add both, sharing one timer:

- **Buyback ledger, keyed to the NPC + a timestamp** (survives closing/re-opening within the window). In
  `_openTrade` (`main.js:3462`, beside the `_tradeSell` snapshot): `npc._buyback ??= { openedAt, entries:[] }`;
  reuse it if `now - openedAt < BUYBACK_MS` (~5 min), else re-lock. It records **qty owned + the locked
  price** at the moment the window opened — the anti-glitch guarantee Caelan asked for (the game
  definitively remembers ownership state, so each item is priced as player-owned vs. shop-owned).
  - **On SELL** (`_sellToVendor` `:3604`): push `{ itemId, refundPrice, qty++ }` so the player can re-buy
    at the price they got, not the current market price.
  - **On re-BUY** (`_buyFromVendor` `:3586`): if the item has a live ledger entry with `qty>0` and the
    window is unexpired, charge the **locked** price and decrement — bypassing `buyPrice(...,current
    disposition)`. Otherwise fall through to the normal buy.
  - **Render** a third buyback row (`_tapTrade` `:3644` already loops buy/sell cells — add a buyback loop).
    Show the **visual countdown timer**. Lore joke: it's all **store credit** anyway (gold *points* =
    credit cards) — the timer is your "return window."
- **Disposition tick clock — same timer.** Attach to the existing free-roam heartbeat
  (`setInterval(WORLD_TICK_MS)` `main.js:415`, inside the `IDLE && !_inCombat()` guard beside
  `_ambientTick`), and hand-wind it per committed turn in combat (`_advanceWorld` `:2618`, where the day
  clock already winds) so it drifts in fights too. It does **not** fire every tick — it nudges disposition
  toward a resting value on the shop-timer cadence. Route mutations through `applyDispositionDelta`
  (`give-action.js:107`) to keep the flip logic consistent. **Prices/mood read `npc.disposition` live
  every render — zero read-side plumbing needed.**
- ⚠️ **Un-ally gap (flag):** `applyDispositionDelta` only auto-fires the **upward** ally flip; a downward
  decay past the ally threshold would **not** un-ally today. If decay should cost loyalty, add the
  symmetric downward handling (an Open decision — see below).
- **Confirm-vs-buyback (resolves an old tension):** memory `trade-system-design` says "single-tap = the
  commit, **no confirm**"; Outward uses a hard "press T to confirm." The **buyback window supersedes the
  need for a hard confirm** — everything is reversible for 5 minutes, so instant tap-to-commit stays and
  the safety net is the timer, not a modal. (Keep a confirm only if a *destructive/irreversible* trade
  ever exists.)

### 6d — Legibility: no quest-item tab; value tiers; special buyers

- **No quest-item tab.** Quest items are **regular items** with `questItem:true` (can't be *sold*, can be
  *offered*). The player learns "this is special" by **seeing all their options**, not from a segregated
  UI — a 0-GP item a specific NPC will take is a deliberate, discoverable signal.
- **Value-tier convention — Grey / Green / Blue / Purple / Orange** (Borderlands rarity), each a rough
  damage/GP band, so worth is legible at a glance. This is the **item-`class`/dev-table** work already
  filed as wheel **§12.3** (task #56) — do them together; the tiers drive both the examine text and the
  trade prices.
- **Special-buyer NPCs — Macc the raccoon mechanic** (Town mechanic shop): buys the **Cataclysmic
  Converter for 500 GP** (nobody else will), and sells the **canyon chain (100 GP, Phase 3)**. The
  Converter is **also throwable for huge damage** — the point is *true, freely-chosen* options, legibly
  presented, beat an undroppable-quest-item straitjacket. Macc's dialogue exposes the canyon-chain path.

### 6e — Economy tuning (balance, not structure)

Outward-tight **silver-to-item ratios**: tune `baseValue` per item + the `trade.js` BANDS (`buy` 1.0–2.4 /
`sell` 0.70–0.40). No structural change — fold in the `gold-weighting-and-bribery-research` verdicts
(rising-marginal-cost bribery, per-encounter cap, ~40% sell-back, income anchor E≈8–15/encounter) when
this balance pass happens. Largely post-1.0.

**Reuse:** Phase-1 `transferGold`/`reactToTransaction`, `applyGive`/`applyDispositionDelta`, `_openTrade`/
`_tapTrade`, `buyPrice`/`sellPrice`/`canTrade`, `_openContainer`, the `WORLD_TICK_MS` heartbeat, `questItem`.
**Files:** `game/wheel-model.js`, `game/renderer.js`, `game/main.js`, `game/trade.js`, `game/give-action.js`,
`game/items.js` (Macc's stock, value tiers). **Verify (in-browser):** give-verb gone but you can hand any
NPC an item via the trade window (0-GP + quest-point marker); a chest opens the trade window; buy→refund at
the same price within the window, sell→re-buy at the locked price, timer counts down; disposition drifts on
the shop cadence; Macc buys the Converter for 500 and sells the chain.

**Build note:** 6a (give-fold) and 6b (chests) are Phase-1-adjacent cohesion and can land early; 6c
(buyback + clock) is the biggest, most bug-prone piece (ledger correctness, timer, decay) — give it its own
branch + a careful Done-When. Each sub-phase = its own `feature/*` branch; Caelan merges each.

---

## Suggested build order

1. **Phase 1 (transaction spine)** — foundation; everything merchant/quest rides it. Low risk, high
   cohesion payoff, fixes the live "no one to trade" bug.
2. **Phase 2 (bridge + fuel side-mission)** — the arc's fork; small, self-contained, high delight.
3. **Phase 3 (Canyon + Pike + hook)** — the multi-path archetype; proves the reusable dialogue hook.
4. **Phase 5 (grappling mechanic)** — pairs with Phase 3's escape (build the mechanic when the canyon
   needs it).
5. **Phase 4 (Downtown + MQ2)** — the biggest content zone; Caelan hand-authors layout.
6. **Phase 0 (world re-routing + Factory tiles)** — Caelan-driven, any time.

Each phase = its own `feature/*` branch off `dev` (or stacked if it needs unmerged deps); Caelan makes
the merge call. Planning-doc edits go on the `plan` branch. Naming guard clean before any merge.

## Open decisions (Caelan's call, per-phase)

1. **Where is the alcohol sold?** A Town/Borgir vendor, a new roadside merchant, or the casino later?
2. **Canyon escape destination** — grapple **up to Downtown** (canyon = the hard route to Downtown) or
   back to **Town** (then still need the alcohol to reach Downtown)? Recommend up-to-Downtown (both
   paths reward reaching Downtown).
3. **Oil as a future fuel** — is oil a real later item/mechanic (energy-dense, a "proper" fuel upgrade),
   or purely flavor in the breadcrumb?
4. **The vampire's role** in Downtown — merchant, quest-giver, bank-linked, or a boss?
5. **Pike's quest task** — what's the job (clear his mine shaft, fetch something, chase off a critter)?
6. **Is the crash-through always the naive default**, i.e., is the Canyon effectively a first-time
   near-guarantee unless you've done the alcohol mission? (That's the current design; confirm.)
7. **Per-NPC inventories / finite stock / NPCs reselling gifts** — still deferred; when Caelan has the
   item roster, revisit on the Phase-1 spine.
8. **Buyback window length & clock model (Phase 6c)** — ~5 min real-time (fits the `WORLD_TICK_MS`
   pattern) vs. turn-based? And does disposition drift *up*, *down*, or *toward a per-NPC resting value*?
9. **Un-ally on decay (Phase 6c)** — should disposition decaying past the ally threshold **revert** an
   ally (adds symmetric downward-flip handling), or do allies stay bought once flipped?
10. **Two gold wedges (Phase 6a)** — after Give folds away, Bribe + Trade are both gold on the Target
    Wheel. Fine, or does one need a distinct tone? (mirrors two-wheels spec §13.)
11. **Where is Macc's shop?** A Town street storefront (as described) — confirm it's Town, not Downtown,
    and whether the Converter-sale (500 GP) is his only hook or he anchors a small side-quest.

## Verification (per phase, in-browser)

Dev server restart after any `.js` edit (ES-module cache). Screenshot tool times out on the animated
canvas — verify via `window.__game` drives + `getImageData`/log probes; modals/cutscene beats are
static-render-friendly. Per-phase "done when":
- **P1:** buy/sell/bribe/give unchanged; "trade a mob" → "doesn't trade"; gold lands on `npc.gold`.
- **P2:** naive drive → crash → canyon; alcohol'd drive → ramp → Downtown; breadcrumb readable first.
- **P3:** all three hook paths converge; escape swing works.
- **P4:** ramp → Downtown + MQ2; delivery completes via give and dialogue.
- **P5:** swing a gap; soft-no without the hook; no teased-locked content.
