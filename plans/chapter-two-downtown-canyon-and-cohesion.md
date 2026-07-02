# Violencetown — Chapter Two: Downtown, the Canyon & Systems Cohesion

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

**Intended outcome:** a cohesive economy spine + a two-path bridge arc (Downtown vs. Canyon) that
embodies "many ways to play," with the grappling hook as a carefully-introduced mobility unlock.

---

## Phase 0 — World re-routing & Factory tiles  (carried from the old Phase 5; Caelan-driven)

Data-only transition edits + a sprite-cell repaint; Caelan hand-authors the map geometry.
- **Target topology:** West arm **Town ⟷ Carnival ⟷ Factory** (Carnival gates the Factory); South arm
  **Town ⟷ Graveyard ⟷ Wilderness** (graveyard first). These are `transitions`-array edits in the
  `*-map.json` files (the transition engine is generic — `_loadMap`/`getTransition`, no code). Wiring
  them *coherently* (doors on the right edges, matching labels, walkable landings) is map-edge
  authoring = Caelan's pass.
- **Factory tile overhaul:** `FACTORY_FLOOR/WALL/CONVEYOR_VIS` (data.js ids 40–43) currently proxy
  with generic Tiny Dungeon stone/wood; re-pick sprite cells in `sprites.js ZONE_TILE_SPRITE_MAP`
  toward metallic/machinery reads. Claude can prep candidate cells; Caelan picks.
- Note: this now sits alongside the **new bridge → Downtown** link (Phase 2/4).

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

**Reuse:** vendor/trade (Phase 1), `_handleEnemyDeath` tag-drop, dialogue system, `emitGameEvent` +
quest gate, `autoSatisfy` (tolerant if the hook's already in the bag). **Files:** `game/canyon-map.json`,
`game/main.js` (`_loadCanyon`, `_handleEnemyDeath` drop, dialogue hook), `game/quests.js`,
`game/dialogue.js`, `game/items.js`. **Verify:** each of buy/kill/quest hands over the hook and opens
the canyon exit; the escape swing works.

---

## Phase 4 — Downtown zone + Main Quest 2 (the burger delivery)

- **Downtown** (`game/downtown-map.json`, new) — across the bridge; "the real part of town." Bank, the
  **vampire**, a couple of buildings, **better merchants** (curated stock — no procedural loadouts),
  **city lights** (neon via the `lights` array + night lightmap), a **casino**. Caelan hand-authors the
  layout; Claude scaffolds the JSON + wires the bridge-landing transition.
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

## Verification (per phase, in-browser)

Dev server restart after any `.js` edit (ES-module cache). Screenshot tool times out on the animated
canvas — verify via `window.__game` drives + `getImageData`/log probes; modals/cutscene beats are
static-render-friendly. Per-phase "done when":
- **P1:** buy/sell/bribe/give unchanged; "trade a mob" → "doesn't trade"; gold lands on `npc.gold`.
- **P2:** naive drive → crash → canyon; alcohol'd drive → ramp → Downtown; breadcrumb readable first.
- **P3:** all three hook paths converge; escape swing works.
- **P4:** ramp → Downtown + MQ2; delivery completes via give and dialogue.
- **P5:** swing a gap; soft-no without the hook; no teased-locked content.
