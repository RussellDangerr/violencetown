# Cross-Game Study → Actionable Changes for Violencetown

**Purpose.** A running backlog of concrete, transferable changes distilled from studying the
source of other games. Each source game gets its own section; every item is written to be
*actionable* — what to do, which VT file(s) it touches, effort, impact, dependencies, and the
fit/risk against VT's firm decisions. This doc is the **input** to a later implementation plan;
it is not the plan itself.

**How this doc grows.**
1. One `## Source N —` section per game studied. Pixel Dungeon is first.
2. Keep the same item format across games so a later cross-game prioritization pass is clean.
3. When we're done gathering, do a prioritization pass → write the real implementation plan as a
   *separate* doc (on the `plan` branch, per project convention; use the planning workflow).

**Item ID scheme.** `<GAME>-<n>` (e.g. `PD-1`) so the later plan can reference items by handle.

**Status legend.** ☐ candidate · ▶ chosen for a plan · ⚙ in progress · ✅ done · ✋ needs Caelan's call · ⏸ hold (studied; don't build yet) · ⛔ guardrail (a decision to *honor*, not a change)

---

## Prioritization snapshot (living — refine during the cross-game pass)

| Tier | Rationale | Items |
|---|---|---|
| **1 — do these** | Correctness + structural-debt wins. Small/medium, low risk, several fix real bugs; one unblocks cheap future texture. | PD-1, PD-2, PD-3, PD-4, PD-5, **CD-2**, **CD-5**, NH-3 (into PD-3) |
| **2 — strong, when content/texture is the focus** | High value, additive, fiction/portfolio fit — some gated on Tier 1. | PD-6 (needs PD-3), PD-9, PD-10, PD-11, **OL-1**, **OL-5** (pairs PD-2), **OL-4** (rides PD-2), **CD-3**, NH-4 (→PD-10) |
| **3 — design-gated** | Highest creative upside but a scope/design decision, not a refactor. | PD-8 ✋, CD-1 ✋, CD-7 ✋, **NH-1** ✋ (storage spec for PD-8) |
| **4 — do-when-needed / lower priority** | Real but speculative, or larger refactors for modest gain. | PD-7, PD-12, PD-13, PD-14, PD-15, PD-16, OL-2, OL-3, OL-6, OL-7, CD-6, CD-4 ⏸, NH-5 (→PD-16), FE-1, FE-2, FE-3, NH-2 ⏸ |

---

## Source 1 — Pixel Dungeon (watabou/pixel-dungeon, Java)

**Framing.** PD and VT solve the same problems from *opposite* constraints — PD is procedural,
permadeath, single-hero, world-freezes-between-inputs; VT is hand-authored, continuous-save, and
built around a town that lives while you stand still. So most of PD's headline cleverness (float-time
scheduler, nested Bag-items, save-every-tile, reflection restore) is a **trap** for VT. The value is a
small set of *locality* and *dispatch* patterns VT already half-implements — plus one likely bug the
study surfaced. (Full research: 8 PD subsystems × studied source, 5 VT subsystems mapped, 2026-07-11.)

### Actionable items

**PD-1 · Last-seen-tile pursuit** — ☐ · effort **S (~10 lines)** · impact **High**
- **Now:** on line-of-sight loss, enemies head *home* (`chasing`→`returning`) — snaps the instant you round a corner.
- **Do:** set `_lastSeenTile` every turn `hasLineOfSight` is true; on LOS drop, greedy-step toward it; only fall to `returning` on *reaching* it or when `getGreedyStep` fails. (PD's `Hunting` state = one conditionally-refreshed `int target`.)
- **Where:** `enemies.js:272–364`; reuse `pathing.js getGreedyStep`.
- **Why:** believable pursuit, and directly unblocks the parked zone-pursuit code (`_captureFollowers`/`_injectFollowers`/`_zonePursuit`).
- **Fit/risk:** grid/turn/vanilla, philosophy-neutral. Keep per-enemy Bresenham LOS (see ⛔ G-7). Resist scope creep into a blackboard/patrol-memory system — the whole point is *one field*.

**PD-2 · Unified ownership check — fixes a likely bug** — ☐ · effort **S** · impact **High**
- **Bug (static-read, verify in-browser):** `rock` and `sludge_sack` are `useType:'throw'` **and** `equipSlot:'sides'` (`items.js:16–17,29–30`), but `haveThrow` scans `game.inventory` only (`wheel-model.js:369`) — so equipping a throwable into its slot makes its **own Throw verb silently vanish while worn**.
- **Do:** add a read-only `ownedItems()` generator (or `hasItem(pred)`) walking equipment + tempEquips + inventory as one sequence; point `haveThrow` (and future has-item checks) at it. Keep the two stores separate.
- **Where:** `wheel-model.js:369`; helper near `main.js _addToInventory` (:3336).
- **Fit/risk:** additive, vanilla, closes a whole "checked the bag, not the slot" class. Keep it read-only.

**PD-3 · Consolidate the two AI paths into one FSM** — ☐ · effort **M** · impact **High (structural)**
- **Now:** two systems for one concept — legacy if-chain chase over `enemy.state` (`enemies.js:272–364`) *and* a real switch-FSM (`npc.js tickNpcState`). `STATE.HOSTILE` is declared but unrouted (`npc.js:33`); hostility always falls back to legacy.
- **Do:** make legacy chase a real `HOSTILE` case in `tickNpcState`, so `npc.js` is the single source of truth; `enemies.js` keeps only the shared primitives (`getGreedyStep`, `hasLineOfSight`, `fleeStep`).
- **Where:** `npc.js` switch (~:64); `enemies.js:264–364` dispatch collapses to "call tickNpcState."
- **Why:** kills VT's biggest AI wart and gives every future behavior (PD-6) one obvious home.
- **Fit/risk:** consolidation of code VT already runs. Keep the whitelist-as-capability-gate (Carrion `=[IDLE]`) — that's *ahead* of PD. Do **not** adopt PD's inner-class-per-state OO or its `enemy = hero-unless-charmed` targeting; VT's reaction bus + disposition are richer. Smoke-test chase/leash/aggro after (CLAUDE.md: "a merge is done when the game RUNS").

**PD-4 · Buff behavior hook (co-locate status logic)** — ☐ · effort **M** · impact **Med-High**
- **Now:** buffs are inert `{id,turns,type}` records; `_tickBuffs` only decrements and hardcodes `recover` (`main.js:405,411`). Every other status is smeared: sludge DoT (`main.js:3187`), `feared` (`enemies.js:244`), `blind` (~`:347`), `guard` (`:3054`).
- **Do:** a `game/buffs.js` table where each def optionally carries `onTick(owner,game)`/`onExpire(owner,game)`; `_tickBuffs` / enemy `tickBuffs` call them generically after `turns--`. Same array shape → one table serves player and enemy.
- **Where:** `main.js:395–420` + the `:3186` DoT block; `enemies.js tickBuffs:174`; new `buffs.js`.
- **Fit/risk:** borrow PD's *co-location, not its scheduler* — keep integer `turns--`, do **not** import float `spend()`. Keep `blind` as a read-at-attack-site rider (a per-turn hook can't express "halve outgoing damage"). Pairs with PD-12.

**PD-5 · Co-locate the enemy save contract** — ☐ · effort **M** · impact **Med (kills a recurring bug class)**
- **Now:** `serEnemy` (`save.js:100–127`) is a distant hand-mirror of the ~30-field `Enemy` constructor; comments at `:111–119` record **two already-shipped bugs** from missing fields (`name`/`dialogueId`, then `vendor`/`stock`) that silently degraded NPCs/vendors on reload.
- **Do:** move the field list onto the class — `Enemy.toSave()` + static `Enemy.fromSave(s)` adjacent to the constructor; `serEnemy`/`hydrateEnemy` become thin callers.
- **Where:** `enemies.js Enemy`; `save.js serEnemy:100` + `hydrateEnemy:~290`.
- **Fit/risk:** locality refactor only. Do **not** generalize into Bundlable-for-everything (only `Enemy` drifts; items/world round-trip via ids). Reject PD's reflection/FQN restore (⛔ G-6).

**PD-6 · Flee / steal / doze as cheap opt-in states** — ☐ · effort **M** · impact **Med (texture)** · **dep: PD-3**
- **Do:** once the FSM is unified, add FLEEING and STEALING cases gated by the per-NPC `behavior` whitelist (authors opt in). STEALING = grab on adjacency → flip to FLEEING → drop on death/hit. Refactor the `feared` handler to just set `fsmState=FLEEING`.
- **Where:** `npc.js` STATE+switch (~:64); reuse `pathing.js fleeStep`; `behavior` arrays in map JSON.
- **Fit/risk:** a fleeing enemy is breathing room, a thief is a chase/bribe hook — texture, not drains. Default to binary LOS acquisition; **skip PD's stealth detection roll** (keeps determinism). If a roll is ever wanted, draw from seeded `game.rng`, never `Math.random`. Never inflict uncounterable fear/sleep on the *player*.

**PD-7 · Give inventory items the pull-model the Target List already has** — ☐ · effort **M** · impact **Med**
- **Now:** VT reinvented PD's `Item.actions()` at the *world-target* layer (`wheel-model.js targetVerbs`/`defaultVerb`), but `items.js resolveUse` (~:384) is still a flat `switch(useType)`.
- **Do:** mirror `targetVerbs` with `itemActions(itemDef, game)` returning Use/Equip(or Unequip)/Throw/Give/Drop from fields + live state; `resolveUse` becomes the dispatcher behind them.
- **Where:** `wheel-model.js` (new `itemActions`), `items.js resolveUse`, the item-overlay path in `main.js`.
- **Fit/risk:** reuses VT's own shipped philosophy. Keep `{key,resolver}` verb objects — no stringly-typed `if(action.equals())` chain. Scope to when item interactions actually grow (Give-from-bag, Drop, multi-verb), not speculatively.

**PD-8 · A persisted learned-skill axis ("ring builds")** — ✋ · effort **M + design call** · impact **High (creative)**
- **Now:** abilities are gear-derived (validates the no-subclass call), but `_refreshGrantedSkills` (`main.js:3661`) clobbers on every equip and isn't persisted — no durable player-chosen progression field.
- **Do:** add a persisted `learnedTricks/learnedSpells` Set; change the cache to **merge not clobber** (`granted = [...new Set([...learned, ...weaponGrants])]`); persist via save.js's four-touch pattern.
- **Where:** `main.js _refreshGrantedSkills:3661`; `save.js` serialize/migrate/validate/loadInto; `wheel-model.js` predicates light up for free.
- **Fit/risk:** milestone-granted, permanent, *additive* = a pure gift (buffs-feel-given). Merge-not-clobber means a plain weapon never strips a learned trick.
- **✋ Decision for Caelan:** this is net-new *scope* (a build axis), not a refactor. Is this the "ring builds" vision from memory? **Permanent vs respec must be decided before serializing** — VT's continuous saves make un-choosing a live question (unlike PD's permadeath fork).

**PD-9 · Statistics ledger + a hand-authored "Rap Sheet"** — ☐ · effort **M** · impact **Med (fiction/portfolio)**
- **Now:** VT has the quest witness-log but no Statistics/Badges. It already has the substrate PD lacked upfront: `game.emitGameEvent(type,payload)` (`main.js:776`) at ~30 sites.
- **Do:** `game/statistics.js` = flat counters subscribing to `emitGameEvent`; `game/badges.js` = a hand-authored table of Violencetown-flavored deeds (`{id,label,desc,test:(stats,game)=>bool}`), validated read-only, awarded through one funnel (bark + persisted flag).
- **Where:** new `statistics.js` + `badges.js`; subscribe at the `emitGameEvent` choke point; surface as a Remoticon tab or a QUESTS panel.
- **Fit/risk:** big meta-texture-per-line; a "rap sheet" fits the fiction *and* the recruiter pitch. Observers only → can never gate or dead-stall. Collapse PD's two-HashSet/`badges.dat` machinery to plain flags in VT's one continuous save. Keep the table small; never let a badge gate.

**PD-10 · Dedupe-on-insert witness log** — ☐ · effort **S** · impact **Med (substrate for living-world chatter)**
- **Now:** `_note` (`quests.js:143`) appends unconditionally. One-time events already flow through `examine` and `map_entered`.
- **Do:** a second dedupe-on-insert log (or `_note` with an optional key) keyed by `(eventType, stable authored id)` — logged from the same emit sites, callers stay dumb. (PD's `Journal.add` returns early on a duplicate.)
- **Where:** `quests.js _note` + a serialized `firstSeen` Set; `zoneName` is on every `GameMap` / in `WORLD_ZONES`.
- **Fit/risk:** key by the **stable authored id** (zoneName/examinable/npc), never a coordinate (PD keys by depth only because its world regenerates). Cap/serialize like the journal trim. This is the concrete substrate for the deferred living-world-chatter thread.

**PD-11 · Real stepwise save migration — build it *before* the next schema change** — ☐ · effort **M** · impact **Med (durability)**
- **Now:** `migrate()` (`save.js:161`) has only the v1 identity path; the stepwise branch is a bare stub; `SAVE_VERSION=1`.
- **Do:** scaffold `while (r.version < SAVE_VERSION) upgrade[r.version](r)` now, so the first real field change ships *with* its migration instead of silently defaulting.
- **Where:** `save.js migrate:161–177` + `SAVE_VERSION`.
- **Fit/risk:** PD is the **cautionary example** here (it writes a version then ignores it — fine for throwaway permadeath runs, wrong for a persistent narrative RPG). Complements the existing clamp-everything `validate()`. Fits the ship-it / portfolio-durability goals.

**PD-12 · Buff stacking vocabulary (extend vs reset)** — ☐ · effort **S** · impact **Low-Med** · pairs with PD-4
- **Now:** `addBuff` (`main.js:399`) always resets `turns` on re-application; no "extend, don't reset" verb.
- **Do:** add a `{mode:'reset'|'extend'|'ignore'}` flag, default today's `reset`; `extend` = `turns = max(turns, new)`. A buff def (PD-4) can name its default mode.
- **Fit/risk:** extend-vs-reset is a *felt* difference and reinforces buffs-feel-given (re-applying a gift shouldn't silently shorten it). Additive, low risk.

**PD-13 · One target-pick callback seam** — ☐ · effort **M** · impact **Low-Med (refactor)** · pairs with PD-14
- **Now:** two aiming affordances — reticle aim baked into the wheel (`aimType`) and a separate Target List — with no shared "pick a cell/target" seam.
- **Do:** one swap-in `pickTarget(onSelect, {prompt})` seam both install into, so new aimed verbs supply a callback rather than new input handling. (PD's single `CellSelector`.)
- **Where:** `_bindInput` keydown + `_onCanvasPointerDown`.
- **Fit/risk:** copy PD's single-channel *idea*, not its `static GameScene.cellSelector` global (⛔ G-8). Worth doing alongside PD-14, not alone.

**PD-14 · Modal-descriptor table (finish what CLOSE_PANEL started)** — ☐ · effort **L** · impact **Med (refactor)**
- **Now:** `CLOSE_PANEL` (`renderer.js:421`) already funnels ✕/tap-outside/Esc through `_closeCurrentMenu` (`main.js:1592`), but adding a modal STATE still needs a four-place edit (STATE enum + keydown + pointerdown + close case + `renderFrame` arm).
- **Do:** push the registry all the way — a `STATE → {draw, onKey, onPointer, closeRect}` descriptor table, so a new overlay is one data entry.
- **Fit/risk:** formalizes an instinct VT already proved. Copy the registry idea, **not** PD's mutable static globals. Scope as an incremental table migration on the monolith's hottest surface; re-verify in-browser each step.

**PD-15 · Tile-behavior descriptor (kill the car special-casing)** — ☐ · effort **M** · impact **Low-Med**
- **Now:** `data.js TILES` already *is* PD's `Terrain.flags[]` (`walkable/hazard/destructible`), but the car (tile 19) is special-cased in ≥3 places — `_targetAt` remap (`main.js:2598`), the examine branch, `_carApproachPath` (`:2722`).
- **Do:** give multi-tile objects one data descriptor (`{footprint, examinableId, approachFrom}`) read generically — collapse the three car cases into one "solid world object" concept, the way `BARRICADE.destructible` already works.
- **Fit/risk:** the pattern VT already uses, extended one notch. Do **not** adopt PD's precomputed static parallel boolean arrays — premature for VT's small maps; per-call `getTileDef` is fine.

**PD-16 · Build-time map-stamp vocabulary** — ☐ · effort **L** · impact **Speculative (do-when-bottleneck)**
- **Do:** take PD's primitive alphabet (`set`/`fill`/`drawInside`) as **human-driven, build-time** `tools/` scripts — `fillRect(tile)`, `stampBuilding(x,y,w,h)` (walls+door+interior+examinable+light) — that emit the same static JSON `loadMap` already consumes. Start with two functions.
- **Fit/risk:** threads the no-proc-gen needle **only** while strictly build-time/static-JSON — guard hard against any `build()` at load time or RNG recombination. Value is speculative: VT hand-authors fine today. **Build only when the per-building hand-entry tax is a demonstrated bottleneck** for a new Chapter-Two zone.

### ⛔ Guardrails — decisions to *honor* (not changes)

- **G-1 Keep the dual-clock; reject PD's single float-time scheduler.** It would freeze the ambient town between inputs — the exact capability PD structurally lacks. If per-enemy speed is ever needed, bolt a combat-only energy accumulator (`_energy += speed; while(_energy>=1){act(); _energy-=1;}`) into `resolveEnemyTurns`, no queue, no float time.
- **G-2 No procedural generation at runtime.** VT hand-authors by choice. Borrow PD's room *vocabulary* only as build-time human tooling (PD-16); never BSP + RNG recombination.
- **G-3 No punishing Hunger-style drains; buffs feel *given*.** PD models Hunger/Poison/Regen as scheduled actors precisely to unify drains — VT has none by design. Do not promote buffs to actors; never inflict uncounterable fear/sleep on the player.
- **G-4 Keep the flat fixed satchel; no `Bag extends Item` tree.** PD's nested bags are tuned for permadeath scarcity/loss. Any future categorized storage = a *view/filter* over the one array.
- **G-5 Keep diff-against-authored-map save.** VT saves `tileDiffs`/`collectedItems`/containers against the hand-authored baseline — *superior* to PD's whole-tile dump. Any future "unify serialization" must not drag in full-map save.
- **G-6 Keep string-id + `_resolveItemDef` rehydration.** Reject PD's reflection/FQN-class restore.
- **G-7 Keep per-enemy Bresenham `hasLineOfSight`.** Don't copy PD's single-observer `Level.fieldOfView` singleton.
- **G-8 No mutable static globals** (PD's `Dungeon.hero`, static `cellSelector`) — a testability liability PD's own code flags.

### ✅ Validating parallels — where PD confirms VT is already right (no action)

- Target List ≈ PD's `Item.actions()`/`defaultAction` + generic `WndItem`. (PD-7 just extends it inward to items.)
- Diff-against-authored-map save is *superior* to PD for a hand-authored world.
- `data.js TILES` already is PD's `Terrain.flags[]` (identity vs. behavior kept orthogonal).
- Data-driven quest `matches()` + the `emitGameEvent` bus ≈ PD's "content dispatched by data, not switches" — VT's biggest scaling lesson, already internalized.
- Symmetric player/enemy buff arrays + the `behavior`-whitelist FSM match PD's unified models; the whitelist-as-capability-gate is *ahead* of PD.
- The dual-clock is architecturally sound — it produces the living town PD's model can't.

---

## Source 2 — The Rohrer pair (One Hour One Life + The Castle Doctrine)

**Framing.** Both Jason Rohrer games run essentially ONE architecture — all content as flat data rows + a transition table selected by a generic dispatcher + an in-engine editor that edits the runtime's own structs + deterministic re-simulation from stored inputs — and that single skeleton served an MMO survival crafting sim (OHOL) *and* an asymmetric-PvP burglary puzzle (CD). So the transferable thing for VT is the **pattern** (data-driven dispatch, reverse indexing, author-time validation, tools that share the runtime's data model), not the mechanics. VT is far enough from both that most of their *content* does NOT transfer: OHOL's category/probability/decay machinery and CD's power-flood + SHA1 cycle-detection + server-resim exist to tame combinatorial, community-authored, adversarial content VT (dozens of items, one author, hand-authored maps) will never have. The strongest yield is a cluster of author-time validation/tooling ideas plus a few small dispatch and world-sim consolidations VT already half-runs. (Research: OHOL transition/object/time/editor subsystems + CD grid-sim/replay/editor, mapped against VT's data-driven core, 2026-07-11.)

### Actionable items

#### Data-driven dispatch

**OL-1 · Reverse index over give/quest tables ("who wants what I'm holding")** — ☐ · effort **S** · impact **Med (legibility)**
- **Now:** VT's give economy is forward-only — `previewGive` reads `recipient.values?.[itemId]` per-NPC (`give-action.js`), and `quests.js matches(stage.on.match, payload)` runs forward per active stage. Nothing answers the inverse: "which NPCs here want the Soap I'm carrying," "which stage does picking up THIS item advance."
- **Do:** at load (memoized), invert the rows VT already authors — `valuesReverse[itemId] = [{npcId, weight}]` across the live enemy set, `questReverse[eventKey] = [{questId, stageId}]` over `QUESTS[*].stages[*].on`. Expose one `whoWants(itemId)`. This is OHOL's `producesMap` built over the same `TransRecord`s as `usesMap` (`transitionBank.cpp`).
- **Where:** `give-action.js` (invert `recipient.values`), `quests.js` (invert `QUESTS` stage `on` conditions), consumed by an Examine inspect line (`examine.js` `_fireResolver` case `'examine'`) and the deferred bestiary (OL-3).
- **Why:** turns the bribe/give system from "try items until one flips them" into a legible, hand-authored hint; gives the deferred bestiary a real data source.
- **Fit/risk:** pure read-only derivation over hand-authored rows — no RNG, no procedural gen. At VT's item count this is a **clarity/API** win, not perf; sell it as legibility. Keep the hint opt-in (Examine line / debug card), never a floating "give me!" marker that spoils discovery. Safe only while NPC `values` stay static spawn data — document that the index is build-once.

**CD-1 · Unified `(heldItem, target) → result` dispatch (retire bespoke `_interactX`)** — ✋ · effort **M** · impact **Med** · _cross-game (both; CD's grammar is the clearer source)_
- **Now:** `_interactCar` (`main.js:2027`) hand-codes the ceremony TWICE (converter→fix, alcohol→carFuel): `findIndex` → `_removeFromSlot` → set flag → `playSfx` → `_log` → `_render`, and its trigger is a hardcoded tile-19 special-case in `_tryMove` (`main.js:~1908`). The parked pipe declares `canJamDoors` (`items.js:60`) and the canyon `chain`/`grappling_hook` are homeless `useType:'none'` items — each destined to reinvent the same find-consume-flag-log dance + its own tile check.
- **Do:** a thin hand-authored `worldInteractions` registry keyed by target (examinable/tile id): `{ requires, consume, result(game) }`; one `_interactObject(target)` runs the match or falls through to examine. Rows stay authored set-pieces; only the DISPATCH + boilerplate unify. This is CD's `ACTOR # OBJECT:STATE => result` (`transitions.txt`) sized to VT's ~5 interactions.
- **Where:** `main.js` `_interactCar:2027` → two rows; the tile-19 branch in `_tryMove` → generic "bumped an interactable"; plugs into `wheel-model.js targetVerbs` as a first-class Use/Apply verb so `_actOnTarget`'s walk-adjacent-first flow is reused.
- **Why:** every future "use X on the world" becomes a data row + tiny fn with consistent consume/log/adjacency, and OL-1's reverse index then covers world objects ("the canyon lip wants a grappling hook").
- **Fit/risk:** good fit **only if kept thin** — hand-authored rows honor no-proc-gen; deterministic. Hard line: if you find yourself writing category placeholders or a `.txt` loader for FIVE interactions you've overshot (see G-9). A named `_interactCar` reads top-to-bottom; keep result fns tiny and co-located so the set-piece stays greppable.
- **✋ Decision for Caelan:** premature for the car alone. **Build the registry only when the SECOND real item-on-world interaction (canyon grapple) is actually on the roadmap** — until then keep `_interactCar` explicit.

**OL-5 · Size-based fit + one ownership rule (the Rohrer half of PD-2)** — ☐ · effort **S** · impact **Med** · pairs with **PD-2**
- **Now:** VT has THREE storage surfaces with no shared rule — the fixed inventory array, the named-slot equipment map, and the trade satchel/containers. The brief's `haveThrow` bug (scans `game.inventory` only, `wheel-model.js:369`) is the symptom of "no unified do-I-own-X iterator."
- **Do:** OHOL collapses backpacks/plates/carts to one arithmetic check `containSize <= slotSize` and one id-based "do I have X." Adopt the *rule*, not nested bags: a read-only `ownedItems()`/`hasItem(pred)` walking equipment + tempEquips + inventory as one sequence (this IS PD-2's iterator), plus — if trade/satchel ever grows tiers — a single size-fits-slot predicate instead of per-surface special-casing.
- **Where:** `wheel-model.js:369` (point `haveThrow` at it); helper near `main.js _addToInventory`; trade.js if the fit-rule is needed.
- **Why:** closes the whole "checked the bag, not the slot" class and gives one place to answer ownership/fit.
- **Fit/risk:** additive, vanilla, read-only. Honors G-4 (flat fixed satchel — the size rule is a *predicate*, never a `Bag extends Item` tree).

**OL-6 · Bare-hands / default sentinel in the verb resolver** — ☐ · effort **S** · impact **Low-Med**
- **Now:** `targetVerbs`/`_fireResolver` compute actions from live state, but "use hand on thing" vs "use held item on thing" are separate code shapes; a no-match target has no single fallthrough.
- **Do:** OHOL/CD reserve sentinel keys in ONE table (`actor 0` = bare-hands, `-1` = time, `-2` = default). Reserve a bare-hands/default sentinel so the empty-hand action and the held-item action resolve through the identical `worldInteractions`/`targetVerbs` path, and an unmatched target routes to a single default (examine/flavor) instead of ad-hoc guards.
- **Where:** `wheel-model.js targetVerbs`/`defaultVerb`; `main.js _fireResolver`; composes with CD-1's `_interactObject` fallthrough.
- **Why:** removes branchy "if holding X else bare-hand" logic; one resolver arm per case.
- **Fit/risk:** small clarity win. Take the sentinel *technique* only — do NOT overload one god-table with combat/dialogue (G-12).

#### Determinism & content validation

**CD-2 · Static content-solvability validator in `tools/` (the anchor)** — ☐ · effort **M** · impact **High**
- **Now:** VT content is a web of raw string ids with NO cross-check — quest stages match `{id:'catalytic_converter'}`/`{npc:'dt-recipient'}`/`targetZone:'DOWNTOWN'`, transitions carry `toMap:'diner-map.json'`, examinables grant item ids, map enemies carry `stock:[…]`/`dialogueId`. A typo or an unreachable stage fails **silently**, often only when the player physically reaches it — the exact dead-stall the quest engine's per-stage `autoSatisfy` predicates + `forceComplete` escape hatch (verified, 7 sites in `quests.js`) exist reactively to survive.
- **Do:** one dev-only `tools/validate_content.mjs` (plain node ESM reading the data modules — same spirit as `sprite-picker.html`/`tools/gen_*.py`) that walks every module once and asserts, per quest: **(a) reachability** — each stage's `on.type` has ≥1 emit site whose payload can satisfy its `match` (OHOL's `producesMap` reverse-index idea: build event→consuming-stages; any stage with an empty pre-image is a guaranteed dead-stall); **(b) dead references** — every `stock`/quest-match/examinable-grant id ∈ `ITEMS`, `dialogueId` ∈ `DIALOGUE`, `toMap` ∈ the map-file set, `match.npc` ∈ some map's enemy ids; **(c) connectivity** — the `transitions[]` graph reaches every `targetZone` from spawn (an island map is flagged). This is CD's `self_test` "prove it's solvable" gate transposed from a runtime PvP publish-wall to a single-player LINT step; optionally emit a content digest/hash so a stamp shows "validator last passed at content-hash X" (composes with **PD-16**, CD's `self_test_house_map_hash` staleness idea).
- **Where:** new `tools/validate_content.mjs` importing `quests.js`, `items.js`, `dialogue.js`, `wheel-model.js`, `world-map.js WORLD_ZONES` + all `game/*-map.json`; runnable in the existing node-test CI.
- **Why:** catches the entire silent dead-content class (waited-on event nothing emits, typo'd item id, orphan `dialogueId`, `toMap` nowhere, unreachable zone) at author-time in seconds instead of via a dead-stalled playtest — turning "I hope Chapter 2 is beatable" into a checkable invariant, high value for a portfolio piece a recruiter might play. It is the cheap, honest slice of CD's completability gate and **supersedes the full record/replay "completability tape"** (a static check verifies a solution COULD exist without the god-object headless-driver cost; CD's own caveat is that tape-proofs fit linear puzzles, not multi-path narrative).
- **Fit/risk:** excellent — vanilla, no build, strictly read-only, VERIFIES (never generates) hand-authored content. Two real costs, both named: emit-site payloads can't be fully inferred from the 4777-line `main.js`, so keep a small hand-maintained manifest of what each of the ~12 `emitGameEvent` sites emits, co-located and dumb; and scripted `onEnter`/`onComplete` side-effects (`_openBridgeIfCarFixed`, `_sewerEscapeSetpiece` spawns) create ids a static scan won't see, so carry an author-declared "provided dynamically" allowlist. Emit WARN, not a hard gate, so intentional forward-references (Phase-D no-op hooks) don't block dev. Reject CD's SHA1/signature/server-resim machinery (pure anti-cheat for untrusted authors). Optional extension: read authored map-validity flags (CD's `mandatory`/`permanent`/"path-to-exit") off the `data.js TILES` table so "this examinable must be reachable" is data the tool enforces.

**CD-3 · Heartbeat determinism audit (name VT's one leak)** — ☐ · effort **S** · impact **Med (insight)**
- **Now:** VT is a DUAL clock. In combat it matches CD exactly — `_advanceWorld` hand-winds one beat per turn, fully input-driven. But in free-roam a `setInterval(WORLD_TICK_MS=500)` heartbeat (`main.js:~508`, inside the `494–531` block) advances day-clock, ambient wander (which pulls seeded `rng` in `npc.js`), and disposition decay on **real elapsed time** — so the number of ambient beats between two inputs depends on how long the player idled, and the in-combat block (`main.js:3157–3167`) re-winds the same day/ambient/disposition BY HAND.
- **Do:** no build — an audit. CD's replay is bit-exact only because nothing wall-clock-driven mutates state (`step()` is UI housekeeping; outcome = f(initial_state, move_list)). Adopt the framing "the clock is just another actor": before trusting ANY determinism claim, grep every `setInterval`/`Date.now`/`performance.now` that touches game state. VT has exactly one such coupling and it is the whole ballgame. Default to scoping any determinism work to the turn-quantized combat loop where VT is already deterministic.
- **Where:** `main.js:~508` heartbeat + `npc.js` ambient wander / `_tickDispositionDecay`; the in-combat re-wind at `main.js:3157–3167`.
- **Why:** prevents the classic "it desyncs sometimes and nobody knows why," and names the single coupling that separates VT's replayable half from its real-time half so any future determinism effort targets it deliberately.
- **Fit/risk:** pure insight, respects everything (G-1 dual-clock stays). Do NOT quantize the heartbeat to chase bit-exact free-roam — that would destroy the living town for a payoff VT (no PvP, no anti-cheat) doesn't need.

**CD-4 · Input-tape combat replay (hold — principle only, build nothing)** — ⏸ · effort **L** · impact **deferred**
- **Now:** the determinism substrate exists (flat combat, ~4 `rng` sites, `rngState` persisted in `save.js:58/238`), and `save.js` already captures the "initial state" half of a tape. No recorder exists; player intent is discarded after each turn.
- **Do:** **do not build speculatively.** Hold ONE portable rule for if a concrete recurring combat bug ever proves hard to repro by hand: CD's `ReplayRobHouseGridDisplay` *subclasses* the live engine — the replayer IS the game with a tape-feeder bolted on, never a parallel sim that can drift. Any future recorder logs input tokens at the `_advanceWorld` boundary and feeds them back through the SAME loop.
- **Where:** would hang off `_advanceWorld`/`emitGameEvent`; `save.js` supplies the snapshot unchanged.
- **Why:** a faithful bug-repro for combat set-pieces (sewer escape) — but the completability motive it was proposed for is already covered cheaper by CD-2.
- **Fit/risk:** a full record/replay subsystem is L-effort for a single-player game with no PvP/anti-cheat need, works only for the combat sub-loop (CD-3: the heartbeat breaks free-roam), and is exactly the "own a small mini-engine, not a framework" line. Justify only against a real, recurring, hard-to-repro combat bug — never as substrate for a completability harness.

#### World-sim as data

**CD-5 · Factor one `_worldBeat()` seam** — ☐ · effort **M** · impact **Med (structural)**
- **Now:** the "advance the world one beat" body is DUPLICATED — the free-roam heartbeat (`main.js:494–531`) and the in-combat block (`main.js:3157–3167`) each hand-wind day-ease + ambient + disposition-decay. CD advances the whole sim in exactly one place (`moveRobber → applyTransitionsAndProcess`; per-frame `step()` is UI-only).
- **Do:** extract the body into one `_worldBeat()` called by both the heartbeat timer AND the combat per-turn path. Pure internal DRY refactor, no player-facing change.
- **Where:** `main.js` — collapse `508`-region body and `3157–3167` into one method; the two DRIVERS (timer vs per-turn) stay (G-1).
- **Why:** one authoritative place for any world-over-time rule; kills the "works in combat, not free-roam" bug class the current duplication invites, and de-risks OL-2. Stands on its own latent-bug merit.
- **Fit/risk:** perfect fit — vanilla, turn-driven, *reduces* code. Watch the mode-specific guards (free-roam gates ambient to `STATE.IDLE` + not-animating; combat doesn't) — pass them as params or apply at the caller, or ambient fires at the wrong time.

**CD-6 · Tile STATE plane over the static authored map (deferred principle)** — ☐ · effort **M** · impact **Low-Med** · dep: CD-5
- **Now:** CD stores each cell as parallel arrays: `mHouseMapIDs` (immutable authored) + `mHouseMapCellStates` (live mutable). VT half-does this — `save.js` already persists `tileDiffs` as a sparse diff over the authored map (superior to a full dump) — but at runtime mutable tile state is ad hoc: `BARRICADE` carries `destructible` on the TILE DEF (`data.js:33`) and clearing rewrites the id; `PORTCULLIS` is a whole separate tile id just to encode "sealed."
- **Do:** *when a THIRD distinct mutable-tile case appears*, adopt CD's split — a small runtime `tileState` map (`'x,y' → tiny state obj`) layered over the static id grid, so barricade intact/cleared and a future lever on/off live there, not as new tile ids. It serializes as the SAME sparse diff `save.js` already writes.
- **Where:** `data.js BARRICADE`; any future switch/lever; dovetails `save.js tileDiffs`.
- **Why:** stops the tile-id namespace bloating with state-variant ids (PORTCULLIS-style) and unifies "what changed" into one diffable plane.
- **Fit/risk:** authored level untouched, only player deltas in the plane; deterministic. **Not a now-build** — the door-jam does NOT motivate it (it already stores state in `this._jammedDoor = {x,y,toMap,integrity,intruders}`, `main.js:353/692`), so VT has exactly one mutable-tile case and it's already handled without pain. Refuse CD's power-flood + turn-settle + SHA1 cycle-detection (no adversarial circuits in a hand-authored world). If adopted, route all tile mutation through one setter so id-swap and state-write don't desync.

**OL-2 · Timed tile transitions as a tiny declarative table (deferred intent)** — ☐ · effort **M** · impact **Low-Med** · dep: CD-5
- **Now:** every timed world change is hand-coded imperatively — `_tickJammedDoor()` is literally a hand-written timed tile transition (door bursts after N turns), the bridge opens via direct `setTile` loops (`main.js:760`), the sewer set-piece flips `PORTCULLIS`/`BARRICADE` by hand. OHOL expresses fire→embers→ash, sapling→crop as ordinary rows whose "actor" is a `-1` time sentinel with `autoDecaySeconds` — no per-object `update()` code.
- **Do:** *when a THIRD bespoke `_tick`-a-tile appears* (YAGNI), a `TILE_TRANSITIONS = [{from, to, afterTurns}|{from, to, atPhase}]` scanned once per `_worldBeat()`, plus a per-cell age counter. "Puddle dries," "lamp lights at dusk" become DATA rows beside the `data.js TILES` flag table; `_tickJammedDoor` could later fold in.
- **Where:** `data.js` (new table beside `TILES`) + one loop in `_worldBeat()`; uses the existing `setTile → _tileDiff → save` path for persistence.
- **Why:** designers add ambient texture by editing a table; the engine stops growing a `_tick*` method per idea.
- **Fit/risk:** fits ONLY as neutral texture — a puddle drying / lamp lighting is buffs-feel-given-neutral, **never a drain** (G-11). Do NOT import OHOL's per-cell ETA priority-queue + `mapTime.db` + epoch machinery (exists for a massive unobserved server; VT's map is tiny and fully loaded — a plain per-beat scan is correct). The `atPhase:'dusk'` variant is blocked on the day clock exposing discrete phase-crossing events (it currently eases continuously).

**CD-7 · Data-flag line-of-sight for zone-pursuit / stealth (gap — candidate, not mandate)** — ✋ · effort **L** · impact **Speculative** · _names a real gap_
- **Now:** the parked zone-pursuit uses a fixed 3×3 threshold visibility buffer; VT has no LOS/vision derivation. CD tags cell states with a `visionBlocking` property and derives a robbery fog-of-war shroud by generic per-cell flag query (`isMapPropertySet`), never per-object code.
- **Do:** *if the stealth/zone-pursuit thread is picked up*, add a `blocksSight` flag to `data.js TILES` (the table already carries `walkable/hazard/destructible`) and derive enemy vision from it, rather than the fixed 3×3 box — spread/derive, don't store.
- **Where:** `data.js TILES` (new flag); enemy sight in `npc.js`/`enemies.js`; the parked `_zonePursuit` code.
- **Why:** the single most concrete unlessoned MECHANIC that could serve the deferred stealth thread, and it extends VT's existing flag-table culture one notch.
- **Fit/risk:** turn-driven combat LOS is cheap; **real-time free-roam LOS is heavy** and would pull against the dual-clock — so scope to the turn-quantized combat/pursuit loop only. Keep per-enemy Bresenham (G-7), reading the flag as the sight mask; do NOT build a CD-style single-observer FOV singleton.
- **✋ Decision for Caelan:** this is gated on the zone-pursuit/stealth thread actually being greenlit — flag, don't build.

#### Authoring tooling

**OL-3 · Bestiary / content-graph `_design` HTML viewer (imports the LIVE modules)** — ☐ · effort **L** · impact **Med (fiction/portfolio)** · _cross-game (both)_
- **Now:** the bestiary/creature-card debug view is a deferred want; enemies already carry rich data (hp/damage/behavior/barks/disposition/values/vendor/stock/`dialogueId`); `examine.js` has an `_openInspect` layered panel; and `game/_design-controller-device.html` is a proven precedent (self-contained HTML served on `:3001` because Node/companion tooling won't run here).
- **Do:** Rohrer's editors are compiled from the SAME source and edit the SAME structs the runtime simulates (`EditorObjectPage : GamePage` editing `ObjectRecord`; CD's `EditHousePage` embeds the very `HouseGridDisplay` it plays) — the tool can't drift because it IS the engine. Reproduce that guarantee in vanilla ESM: `game/_design-bestiary.html` that `import`s `items.js`, the enemy config, `wheel-model.js`, and fetches the map JSONs, rendering creature/item cards cross-referencing spawns × drops × behavior × dialogue × the verbs `targetVerbs` would offer. Read-only viewer, not an editor.
- **Where:** `game/_design-bestiary.html` (sibling of `_design-controller-device.html`); optional `_design-content-graph.html` for the item↔npc↔quest↔map web; doubles as the surfacing UI for CD-2 (dangling refs render as red cards) and OL-1 (whoWants).
- **Why:** satisfies the deferred bestiary and gives one glanceable map of the hand-authored world — which enemy has no dialogue, which item is spawned nowhere, which map is an island.
- **Fit/risk:** matches the established serve-static-design-HTML pattern; vanilla, no build, debug-only, additive. It MUST import the modules, never re-declare field lists — the moment it hand-copies the shape it starts drifting (the exact anti-pattern Rohrer's shared-struct design avoids).

**OL-4 · Verb×target coverage table (surfaces the `haveThrow` gap)** — ☐ · effort **S** · impact **Med** · pairs with **PD-2**/**OL-5**
- **Now:** OHOL's `getAllUses(id)` enumerates every interaction on an object straight from data — coverage is a queryable property. VT already lives this shape (`wheel-model.js targetVerbs`/`orderedTargetVerbs`) but has a known latent hole the brief flags: `haveThrow` (`wheel-model.js:369`) scans `game.inventory` only, so a throwable equipped into its slot hides its own Throw verb — invisible without a systematic view.
- **Do:** a debug panel (rows = target archetypes: item / hostile / friendly-with-dialogue / vendor / examinable; columns = every verb) computed by calling the real `targetVerbs` against synthetic representative targets, rendering the actual matrix and highlighting empties.
- **Where:** a panel inside OL-3's `_design-bestiary.html`, reusing the pure `wheel-model.js` functions directly. (The underlying FIX is the PD-2/OL-5 ownership iterator; this is the VISIBILITY tool that makes the class of gap obvious.)
- **Why:** makes verb-coverage regressions (a whole verb silently missing for a target type) visible at author-time, and confirms VT's data-driven verb dispatch is already the right architecture.
- **Fit/risk:** reuses existing pure functions, no runtime, vanilla, debug-only. The synthetic targets must be representative (a throwable both in-bag AND equipped) or the view under-reports.

**OL-7 · Data-driven equipment sprite layers (gap — verify first)** — ☐ · effort **M** · impact **Low** · _names a real gap_
- **Now:** OHOL's `ObjectRecord` holds parallel per-sprite arrays (position/rotation/hflip/color/parent + visibility flags like `spriteInvisibleWhenHolding/Worn`) so a paper-doll composites purely from data; the caveat says a hand-authored RPG can borrow "layered sprite parts + per-layer transform arrays" for characters/equipment WITHOUT the aging machinery. VT has an equipment map and gear-derived state but no lesson examined composing the character/equipment *visual* as data-driven layers.
- **Do:** first verify VT isn't already layering equipment sprites; if not and if visible worn gear is ever wanted, express the composite as data layers (base body + per-slot equipment sprite with a small transform), not bespoke draw code per item.
- **Where:** `renderer.js` character draw; the equipment map; item defs in `items.js` (a `sprite`/layer field).
- **Why:** worn-gear visuals become authoring, not engine edits.
- **Fit/risk:** keep it data-authored, not procedural; drop OHOL's age-window/body-part-tag machinery entirely (person-as-aging-object plumbing). Speculative — only if visible equipment is on the roadmap.

### ⛔ Guardrails (Rohrer-specific — decisions to honor, not changes)

- **G-9 No OneLife-scale crafting / tech-tree or its scale machinery.** Category placeholders + reverse-category fallback, `getPTrans` probability sets/`actorChangeChance`, `numUses`/dummy-id generation, and `autoDecaySeconds`/`epochAutoDecay` timed decay exist to tame combinatorial explosion across THOUSANDS of community objects. VT has dozens of items and one author, so explicit `switch` arms are clearer; probability sets violate no-RNG determinism; timed food decay is "an annoyance tax." Keep VT's `resolveUse`/`applyFlip`/`_fireResolver` explicit; the ONLY table-shaped additions worth making are OL-1's reverse index and CD-1's thin dispatch.
- **G-10 No runtime procedural world; no speculatively-built propagation/flood engine.** VT hand-authors by choice and has ZERO fields (light is a global ease, sludge a static flag). Do not build a generic grid-flood for a game with nothing to flood — that's a YAGNI violation the study talks itself out of. If a SECOND field ever becomes real, one flood function reusing `pathing.js` BFS + `TILES` flags, with a bounded `maxSteps` and **no** CD checksum/cycle-detection (no adversarial circuits to tame).
- **G-11 No punishing decay/hunger; timed world changes stay neutral or ship with counterplay.** VT has no hunger by design and buffs must feel GIVEN. Any timed tile change (OL-2) is texture — a puddle drying, a lamp lighting — never a drain; any offensive/hazard field needs authored escape (VT's instinct already exists: pipe-jam, shoe-bag sludge immunity), or it stays a neutral field (light) only.
- **G-12 Don't rewrite VT into an entity+transition engine wholesale.** Both games route NPC AI / dialogue / branching quests / reputation OUTSIDE the transition table (OHOL handles them elsewhere; CD's grammar is physical tiles only). VT's several small purpose-built systems — `quests.js matches()`, `wheel-model.js targetVerbs`, `give-action.js`/`trade.js` on the one disposition quantity — are CORRECT, not a failure to unify. Extend data-driven dispatch to MECHANICAL/environmental transitions (OL-2, CD-1) only; resist the urge these two elegant single-table engines invite to fold combat/dialogue/quests into one `(actor,target)→result` grammar.
- **G-13 Fields are not tiles.** If any spread (fire/gas/light/noise) is ever added, it lives on a SEPARATE transient plane recomputed each `_worldBeat()`, NEVER through `setTile`/`_tileDiffs` — routing transient wetness/light through the save diff (`main.js:740`) would bloat every save and mismark momentary state as a permanent authored edit. `tileDiffs` = durable authored edits (saved); a field = derived transient (never saved, recomputed on load).
- **G-14 Keep consolidated JS dicts / JSON maps.** Rohrer stores content as thousands of tiny filename-keyed per-record files (`objects/3.txt`, `transitions/5_12.txt`) via `FolderCache` — MMO/community-scale plumbing. VT's small, closed, single-author corpus is better served by one `ITEMS` dict, ~13 map JSONs, one `QUESTS` dict. Add read-time indices and viewers OVER them (OL-1, CD-2, OL-3); never shatter `items.js` into per-item files, and never fold `give-action`/`trade`/`quests`/combat into one transition schema.

### ✅ Validating parallels (where a shipped Rohrer game confirms VT is already right)

- **VT's data-driven Target-List verbs ≈ transition dispatch.** `resolveUse` (flat `switch(useType)`), `_fireResolver` (dispatch on a data `resolver` string), `applyFlip` (switch on NPC `onFlip` mode), `quests.js matches()` (generic event matcher, flow defined as data independent of content), and `targetVerbs` (actions computed from live state) are exactly OHOL's `getTrans`/CD's `isPropertySet(id,state,prop)` shape — behavior as data rows selected by a generic dispatcher, no per-object switch-of-behaviors. VT already runs the portable core.
- **`rngState` determinism ≈ replay determinism.** No-roll flat combat (damage − armor, min 1), `resolveEnemyTurns` iterating in array order, a seeded `game.rng`, and `rngState` persisted for exact resume (`save.js`) are precisely the turn-quantized, integer-state, seeded prerequisites CD's bit-exact re-simulation needs. VT is deterministic in the combat loop today (CD-3 names the one free-roam leak).
- **`data.js TILES` flag table ≈ CD's property vocabulary / OHOL's field-typed objects.** `walkable/hazard/destructible` queried generically is CD's `isPropertySet` and OHOL's "one wide record, all variety in data, every subsystem reads `getObject(id)` by field."
- **`save.js` (diffs + seed + id-rehydration + clamp) ≈ "store generative inputs, regenerate the rest."** Two shipped Rohrer games independently validate VT's serialization: CD stores a move-list + seed and re-simulates (even replay music from `mMusicSeed`, not recorded); OHOL stores ids + a state layer and recomputes. VT persists `rngState`, `tileDiffs` (diff-over-dump), `_resolveItemDef` id-rehydration (not reflection), re-derives skills via `_refreshGrantedSkills`, and clamps in `validate()`. Effort belongs on the validator, not second-guessing `save.js`.
- **Author-time tooling culture ≈ "the editor shares the runtime's data model."** `sprite-picker.html`, `tools/gen_*.py`, and the served `_design-*.html` precedent already embody Rohrer's guarantee that a tool editing the runtime's own data can't emit content the engine can't read — OL-3/OL-4/CD-2 extend it, they don't introduce it.

### Where these slot in the plan

Relative to the PD tiers (Tier 1 = PD-1..5), the strongest Rohrer items rank as follows. **CD-2 (static content validator) is Tier 1** — it belongs beside PD-1..5: cheap, vanilla, read-only, no runtime, and it attacks the exact dead-stall class the quest engine's `autoSatisfy`/`forceComplete` scar tissue papers over, converting "I hope Chapter 2 is beatable" into a CI invariant (high portfolio-durability value). It also absorbs three would-be separate lessons (dead-reference resolution, quest reachability, map connectivity) into one tool. **CD-5 (`_worldBeat()` seam) is Tier 1–2** — a small DRY refactor that *reduces* code and fixes a verified latent free-roam/combat divergence, with independent merit and no design risk. **OL-1 (reverse index) is Tier 2** — a small legibility win that makes the give/bribe economy bidirectional and feeds the deferred bestiary. Note also that **OL-4 rides PD-2/OL-5**: it's the cheap viewer that makes the `haveThrow` ownership bug visible, so it should be planned alongside that fix. Everything else is design-gated (CD-1 ✋, CD-7 ✋), do-when-needed (CD-6, OL-2, OL-7 gated on a third case / roadmap), or explicit holds (CD-4 ⏸).

---

## Source 3 — NetHack / Falcon's Eye (zirkoni fork)

**Framing.** NetHack is the closest-shape study yet: Falcon's Eye is a graphical, mouse-driven skin
bolted over an unchanged turn engine — structurally the same split VT lives in — so it mostly
*confirms* lessons already mined rather than adding many. Its genuine gifts are three: (a) the
canonical `struct prop` intrinsic/extrinsic/blocked spec that hands **PD-8** a concrete data model
and de-risks it; (b) the `pline()`/rumors flavor substrate and the `.des` authoring DSL, which
sharpen **PD-10** and **PD-16** with real producer-side and grammar detail; and (c) hard validation
that VT's shipped pointer model (tap→BFS→walk) matches how a real graphical roguelike (`jtp` autopilot
queue) grafts a mouse onto a keyboard turn engine. Be clear-eyed that **most of NetHack does NOT
transfer** — the identification/hunger/permadeath soup, the palette-indexed isometric renderer, the
combinatorial monster/object flag sprawl, and runtime generation are all traps VT already declined.

### Actionable items (net-new or upgrades)

#### Ring builds / property & capability model

**NH-1 · The property-model spec for PD-8** — ✋ · effort **M** · impact **High**
- **Sharpens PD-8** — it does not restate it. PD-8 said "merge gear-derived + a durable learned Set, don't clobber"; NetHack shows *precisely how*: store by source in parallel fields, union at read, persist sources not the merged view.
- **Now:** `_refreshGrantedSkills` (`main.js:3661`) does `knownSpells = [...new Set([...BASE_SPELLS, ...gs])]` — it **overwrites** the whole skill list from the equipped weapon every call, so a durable learned trick has no field to survive in and vanishes the instant a plain weapon is equipped.
- **Do:** model each ability from separate SOURCE sets — a new persisted `learnedSpells`/`learnedTricks` (NetHack's `intrinsic`) and the transient gear grant (its `extrinsic`, kept exactly as today) — and change the two clobber lines to a **union**: `knownSpells = [...new Set([...BASE_SPELLS, ...this.learnedSpells, ...gs])]`. Because learned and gear live in disjoint sets, unequipping clears only its own contribution (NetHack's `&= ~w_mask`) and can never strip a learned skill. Collapse the scattered `.includes` predicates behind ONE `hasSkill(id)` accessor so a future third source slots in at a single site.
- **Where:** `main.js:3661` (union + `hasSkill`/`hasTrick`); `main.js` state init (~:185); `save.js` serialize/validate/migrate/loadInto — persist **only** the learned Sets and keep re-deriving `knownSpells` on load (VT already does this at `save.js:253`, exactly NetHack's `set_wear()` replay); `wheel-model.js:38-65` predicates route through the accessor.
- **Source:** `include/prop.h` `struct prop { long intrinsic, extrinsic, blocked; }`; `include/youprop.h` read-time query macros; `src/worn.c setworn()`; `src/do_wear.c set_wear()` (recompute-on-load, never serialize the merged view).
- **Why:** turns "gear-derived abilities" into a real, persisted, additive progression axis (the "ring builds" north star) with a proven, tiny data model — no new query surface, since the wheel already reads at call time. One refinement from the study: gear kept keyed *by source* also fixes a latent buff-stacking bug class (analogous to PD-2's ownership-iterator).
- **Fit/risk:** on VT's validated gear-derived direction and buffs-feel-given — a learned skill is a permanent additive GIFT gear can only add to. Deterministic (Sets, no RNG). **Live design call before serializing:** permanent vs respec-able (VT's continuous saves make un-learning a real question NetHack's permadeath sidesteps). Boolean-union only — numeric/stacking buffs sum per source elsewhere, they don't fit this model. Use string-id Sets, not NetHack's 32-bit slot masks.
- **Relates to:** PD-8 (this is its storage + persistence spec).

**NH-2 · Reversible skill-suppression (the `blocked` third field)** — ⏸ · effort **S** · impact **Med**
- **Net-new axis** PD-8 didn't name; extends the same struct as NH-1. VT has no suppression concept today (buffs are a flat `{id,turns}` array, nothing can temporarily deny an ability).
- **Now/Do:** IF VT ever wants an enemy "silence", a hazard tile that jams tricks, or gear that lends one skill but locks another, model it as a `suppressed` Set consulted in the SAME accessor: `hasSkill(id) = (learned.has(id) || gear.has(id)) && !suppressed.has(id)`. Masking at read time never destroys the learned/gear source, so the ability is **structurally guaranteed** to return the moment the block clears (NetHack's `&& !BStealth`).
- **Where:** the `&& !suppressed.has(id)` clause in NH-1's `hasSkill`; a `suppressed` Set ticked down in `_advanceWorld` like buffs. Purely additive — nothing consumes it until a denial mechanic is authored.
- **Source:** `include/youprop.h` `#define Stealth ((HStealth || EStealth) && !BStealth)`.
- **Why:** gives designers a reversible "deny a skill" lever for encounter variety (a boss that silences your Magic ring) that is provably counterable by construction, avoiding the resentment of a stat drain.
- **Fit/risk:** fits buffs-feel-given ONLY under a counterable framing — **the single canonical guardrail (G-18): every block source must be visibly telegraphed and time-boxed** (a world-clock buff that expires, a removable equip, or a cleanse item), never a permanent hidden mask. Speculative: do NOT build until a concrete encounter needs it; the value is knowing the clean shape when it does.
- **Relates to:** NH-1 (same accessor); honors G-11 counterplay.

**NH-3 · Split immutable CAPABILITY from mutable STATE in the AI whitelist** — ☐ · effort **M** · impact **Med (structural)**
- **Sharpens PD-3/PD-6** by telling the unified FSM how to structure its gates. VT's `behavior` array conflates three namespaces: disposition (`HOSTILE`), current FSM activity (`IDLE`/`WANDER`/`WORKING`), and faction (`ALLIED`) in one bag, queried as BOTH "what state now" (`npc.js:52-77`) AND "what disposition" (`behavior.includes('HOSTILE')` at `main.js:614,3110,3559`; `wheel-model.js:159,305`). One `.includes` can't tell "is allowed to" from "is currently".
- **Do:** when PD-3 unifies the two AI paths, give the whitelist an **immutable capability** set on the authored type (`canTurnHostile`, `canFlee`, `canSteal` — NetHack's M1/M2, what an NPC is *allowed* to do) separate from a **mutable current-state** field (the FSM node). The FSM reads capability as the transition GATE ("may this NPC enter HOSTILE?") and state as the live node. "Carrion can't turn hostile" becomes `canTurnHostile:false` — a permanent capability the FSM never offers, not a transient state. PD-6's flee/steal/doze become capability opt-ins checked before the state machine enters those nodes.
- **Where:** do this AS PART OF PD-3's FSM consolidation (`enemies.js:44-112` ctor + `:264` dispatch; `npc.js:52-77`; the `HOSTILE` reads across `main.js`/`wheel-model.js`) — not a separate sweep, to avoid churning core files twice.
- **Source:** `include/monflag.h` M1_ (physical capability) / M2_ (disposition) / M3_ (wants) OR'd bitmasks; `src/monst.c` MON rows queried by generic AI, never by species.
- **Why:** makes the consolidated FSM's transitions legible and composable (new NPC archetypes = a capability-flag combo in authored data, no new code), and removes the ambiguity where one `.includes` conflates "is allowed to" with "is currently".
- **Fit/risk:** keep the flag set SMALL and curated — NetHack's ~76 flags serve emergent permadeath soup; VT wants a handful of legible capabilities. Resist re-folding disposition back into the capability set.
- **Relates to:** PD-3 (its flag vocabulary), PD-6 (its opt-in home).

#### Flavor & authored content

**NH-4 · The producer end for PD-10: authored line-pools + a state-weighted sampler behind one emit seam** — ☐ · effort **M** · impact **Med**
- **Completes PD-10.** PD-10 is only the dedupe-on-insert *consumer* (a witness log that rejects duplicate insertions). NetHack supplies the missing *producer*: authored pools sampled by trigger, plus `Norep()` — the dedup discipline generalized to emission.
- **Now/Do:** add a pure `game/flavor.js` = `{ pools, sampleLine(poolKey, ctx) }`. Pools are plain JSON keyed by a trigger taxonomy **VT must author itself** (NetHack's emergent-trigger density does not transfer — with ~30 emit sites the keys are things like district/zone, time-of-day, NPC-mood-from-disposition, quest-stage, reputation). `sampleLine` filters by ctx keys then draws with `game.rng` (stay deterministic for exact-resume; keep NetHack's "weight the draw by state" idea, **drop** the true/false-rumor + Luck gimmick — that's identification-flavored and VT rejects it). One `emitLine(text,{channel,speaker})` seam owns routing + a small recent-line ring buffer so ambient repetition never grates (NetHack's single-line `toplines` compare generalized to N). Two storage tiers: tiny barks inline in the def, large gossip pools in a sibling JSON an author edits without touching code.
- **Where:** new `game/flavor.js` (pure, testable like `wheel-model.js`); wired into the 500ms ambient heartbeat and the `emitGameEvent` bus; surfaced through the existing `quests.js` `_note` → Quest-Log / Remoticon QUESTS path; pools authored as a sibling JSON (precedent: `downtown-map.json`).
- **Source:** `src/rumors.c getrumor()/outrumor()` (same pool routed through BY_ORACLE/BY_COOKIE/BY_PAPER framings); `src/pline.c vpline()` + `Norep()` (`if (no_repeat && !strcmp(line, toplines)) return;`); `dat/rumors.tru`.
- **Why:** turns the deferred living-world thread into a shippable ~1-file system that makes "a town that lives while you stand still" literal; writers add lines as data; the dedup-in-the-seam prevents the classic ambient-spam annoyance for free.
- **Fit/risk:** hand-authored, vanilla, no build step; deterministic via persisted `rngState`; "texture-feels-alive-not-nagging" mirrors buffs-feel-given. The trigger taxonomy is the real design work — start with 2-3 context keys; throttle per channel so the heartbeat can't spam.
- **Relates to:** PD-10 (its producer + emit-side dedup).

**NH-5 · A build-time authored-map DSL for PD-16: ascii terrain + typed overlay statements, compiled to the JSON `loadMap` already eats** — ☐ · effort **L** · impact **Med**
- **The concrete grammar PD-16 named.** NetHack's `.des` files supply the vocabulary and the compile-to-static-data discipline.
- **Now/Do:** author maps in three legible layers (matching what VT half-does): (1) terrain as the tile grid carrying only `data.js` TILES ids; (2) a short list of typed overlay statements — `place-object`/`place-npc`/`place-trigger` — instead of bespoke set-piece code, so contents are edited without redrawing terrain and the whole placement set is greppable/diffable; (3) REGION-style typed rectangles that stamp one property onto a box (spawn-eligibility, trigger area, lighting/mood, no-go mask) — far cheaper than per-tile authoring and a natural companion to CD-6's runtime STATE plane. A new `tools/gen_map.py` (sibling to `gen_font.py`/`gen_ui_panel.py`) compiles this OFFLINE into the exact static `*-map.json` `loadMap` ingests — **zero runtime parser, honoring the no-runtime-gen rule**; the `tileDiffs` save contract is untouched. **Drop** the `random`/`place[n]` machinery and the room/corridor auto-connector (permadeath-replayability features VT rejects); use tile-id names, not ASCII glyphs. Keep NetHack's two-DSL split: per-area map DSL separate from the world-graph manifest VT already has (`WORLD_ZONES`).
- **Where:** new `tools/gen_map.py` → `*-map.json` consumed unchanged by `loadMap` (`map.js`); replaces ad-hoc `sewer-setpiece.js` wiring; `data.js` TILES + a new REGION table; `world-map.js`/`WORLD_ZONES` as the existing area graph.
- **Source:** `dat/sokoban.des`/`medusa.des`/`tower.des` (MAP…ENDMAP terrain block + OBJECT/MONSTER/TRAP/REGION statements); `util/lev_comp.y` + `util/lev_main.c write_level_file` (build-time compile, engine ships only a loader); `dat/dungeon.def` via `dgn_comp` (separate world-graph DSL).
- **Why:** makes new areas (Ch2 Ph4 Downtown/diner/bank/casino playground, MQ2 content) far cheaper and less error-prone to author — terrain you eyeball, contents you list; the REGION primitive gives cheap per-zone lighting/ambient hooks that feed day/night and NH-4's district keys.
- **Fit/risk:** compiles to the SAME static JSON — deterministic, no runtime gen, `tileDiffs` contract untouched. Upfront compiler cost: scope it to the handful of statement types VT reads; a plain text→JSON transform, not a mini-engine.
- **Relates to:** PD-16 (its grammar), CD-6 (REGION as authoring companion to the STATE plane).

#### Graphical & pointer (mostly validation)

**FE-1 · Fixed-order per-layer draw + a per-sprite anchor descriptor (retire the car/tall-prop special passes)** — ☐ · effort **M** · impact **Med**
- **Net-new**, and it removes PD-15's car special-case by making "oversized sprite" first-class. `renderer.js` already runs TWO bespoke versions of the same job — a tall-prop base-anchored pass (`:978`) and a deferred 2×2 car pass (`:673`) — both doing "anchor an oversized sprite off its footprint tile".
- **Do:** generalize both into ONE data-driven descriptor: a sprite carries `{footprintTile, anchorOffsetX, anchorOffsetY, layer}`, and the renderer paints declared layers (floor → decoration → wall → dropped-item → actor → effect/cursor) in fixed order, drawing each oversized sprite at footprint + anchor. The car (PD-15) and the waiting `z_trees*.png` then stop being special cases — just sprites with a footprint and an anchor. Skip FE's glyph-decode first stage (VT maps its own ids straight to atlas rects).
- **Where:** `renderer.js _drawTiles` (`:610`) + the tall-prop (`:978`) and deferred-car (`:673`) passes; `sprites.js` id→atlas mapping extended with anchor/layer fields; PD-15's car tile descriptor.
- **Source:** `win/jtp/winjtp.c` parallel per-cell layer buffers `jtp_mapglyph_cmap/obj/mon[y][x]` painted in fixed z-order; `win/jtp/jtp_win.c jtp_get_tile` → `jtp_tilestats` `xmod/ymod` anchor offsets.
- **Why:** collapses two bespoke passes into one rule, lets the waiting tree assets and any future tall NPC drop in as data, and removes the car special-case (PD-15) by making "oversized sprite" a first-class descriptor.
- **Fit/risk:** top-down — take the layered-composite + anchor discipline, **NOT** FE's iso transform. Keep a small fixed layer enum. The palette-shade / Dijkstra per-tile lighting half is a trap: resist it, VT chose the global light-ease.
- **Relates to:** PD-15 (kills the car special-case), OL-7 (same "presentation is a descriptor" idea, applied to the map composite).

**FE-2 · Far-target / auto-explore travel + a mode-shared examine pipeline (VALIDATES the pointer model)** — ☐ · effort **M** · impact **Med**
- **Lead with the validation:** FE grafts a mouse onto NetHack with ZERO new movement logic — `jtp_find_path` only fills a queue and `jtp_nh_poskey` drains it one step per engine cycle, so multi-tile travel inherits every per-step rule for free. This is exactly VT's shipped tap→BFS-path→auto-walk and long-press Target List; VT arrived at FE's architecture independently, which is the confidence signal.
- **Do (net-new deltas only):** (1) travel to a chosen FAR target and "travel-to-nearest-interesting"/auto-explore by filling the SAME BFS queue with a different goal square — the pather changes, the drain point doesn't; (2) fold examine into the SAME hover/pointer pipeline via a mode flag ("Examine mode" reuses the pointer code rather than duplicating it), sharing one seam with the long-press Target List. Do NOT copy FE's keystroke-encoding indirection (`jtp_keys`) — that exists only because NetHack's sole input vocabulary is command chars; VT invokes verbs directly.
- **Where:** `pathing.js` (far-target + nearest-interesting goal selection); the pointer/hover code in `renderer.js`/`main.js`; `examine.js` reusing the hover loop under a mode flag.
- **Source:** `win/jtp/winjtp.c jtp_nh_poskey` autopilot drain; `win/jtp/jtp_win.c jtp_find_path` → `jtp_movebuffer`/`jtp_move_length`.
- **Why:** confirms the shipped interaction spine is on a proven track, and adds two cheap affordances (far-travel/auto-explore, shared examine mode) with no new movement logic — each reuses an existing seam.
- **Fit/risk:** fits the shipped path-then-act model and turn/grid loop. Define VT's OWN auto-walk interrupt policy (NetHack aborts on monster-sighting; VT's cadence differs). Scope auto-explore to travel-to-far-target first, or it wanders un-VT. Don't over-invest in mouseover-identify — FE needs it for glyph ambiguity; VT's bespoke art doesn't.
- **Relates to:** PD-13 (one target-pick seam), the shipped pointer model. **The default-verb cursor lives in FE-3, not here** — this item owns only the travel/examine deltas.

**FE-3 · Contextual pointer hint: telegraph the default verb before the tap** — ☐ · effort **S** · impact **Low-Med**
- **Net-new** polish on the shipped pointer model. Today tap-a-thing-does-default only reveals whether it will Take/Talk/Hit/Examine *on commit* — the player taps to discover.
- **Do:** on hover (desktop) or touch-down-before-release (mobile), resolve the thing under the pointer through the SAME `defaultVerb` the tap will use, and render a tiny hint — a cursor variant or one-word label near the target. It's a read-only preview of a value VT already computes, so draw and act can't drift. FE proves the affordance costs no new UI surface — it rides the cursor.
- **Where:** `renderer.js` (draw the hint at the hovered tile); `main.js` pointer/hover handling; reads `wheel-model.js defaultVerb`. Purely presentational — no change to action semantics.
- **Source:** `win/jtp/jtp_win.c jtp_choose_target_cursor()` + `jtp_map_square_description()` (per-frame contextual cursor telegraphing the click's outcome).
- **Why:** closes the last ambiguity in the shipped pointer model — players see the consequence of a tap before tapping, most valuable on touch where mis-taps are costly.
- **Fit/risk:** keep it a cursor swap or single word, not a hover-panel (that's the long-press Target List). Gate the pre-tap preview to touch-down-before-release on mobile so it adds no tap; on touch, surface the verb as a brief press label.
- **Relates to:** the shipped pointer model, PD-13.

### 🔁 NetHack corroborates (no new work)

- **Capability bitmask ≈ behavior whitelist.** The three-namespace M1_/M2_/M3_ flag taxonomy (`include/monflag.h`) independently confirms NH-3's capability/state split — same idea, no separate item.
- **`struct prop` three-field store ≈ PD-8.** Two further restatements of the intrinsic/extrinsic/blocked model land in the study; both corroborate NH-1 and add nothing beyond one salvaged note (gear keyed *by slot* stacks cleanly — a store-shape fix analogous to PD-2's ownership-iterator bug), already folded into NH-1.
- **Wide data-row + template/instance defs ≈ `items.js` / `data.js` TILES.** NetHack's `OBJECT(...)`/`MON(...)` rows (immutable `objclass`/`permonst` shared per type, per-copy deltas on `struct obj`) confirm VT's flat-record content defs and its instinct to keep item defs immutable with instance state separate — a discipline VT already follows, not a new item.
- **`Norep()` + rumors pools ≈ PD-10.** `src/pline.c` single-spine dedup + `src/rumors.c` authored pools corroborate PD-10's dedupe-on-insert; NH-4 is the concrete producer, not a duplicate lesson.
- **`.des` layered authoring ≈ PD-16.** The MAP-block-plus-typed-statements grammar confirms PD-16's build-time-only stance; NH-5 is its concrete form.
- **`jtp` autopilot queue ≈ the shipped pointer model.** `jtp_find_path` filling a buffer that `jtp_nh_poskey` drains one step per turn is exactly VT's tap→BFS→per-beat walk — validation, captured in FE-2.

### ⛔ Guardrails (NetHack-specific — decisions to honor, not changes)

- **G-15 No isometric rewrite.** VT is top-down by choice. Take FE's layered-composite + per-sprite anchor discipline (FE-1); leave the `JTP_MAP_XMOD/YMOD` diamond transform and palette-indexed shade tables — 1990s indexed-color tech VT's alpha canvas replaces.
- **G-16 No hunger / identification tedium.** The `known/dknown/bknown` id bits, BUC gambling, corpse nutrition, and erosion columns exist for NetHack's tedium loop. VT drops them; copy only the data-row + source-separation *architecture*, never the emergent-soup design that permadeath + identification bring.
- **G-17 No runtime level generation.** The `.des` DSL is BUILD-TIME only (`lev_comp` → static `.lev`; NH-5 → static JSON via `tools/gen_map.py`). Never ship a DSL parser or the `random`/`RANDOM_PLACES` machinery into the running game — that serves permadeath replayability VT rejects.
- **G-18 Suppression/blocked must stay counterable.** NH-2's masking layer is buffs-feel-given ONLY if every block source is visibly telegraphed and time-boxed. If any block is ever made permanent or hidden it becomes a punishing drain — the exact thing VT forbids. This is the single canonical statement of the rule; don't build an uncounterable version from looser wording.

### Where these slot in the plan

Most NetHack value is **UPGRADES that de-risk existing items, not new Tier-1 work** — say so plainly.
The **single most valuable NetHack contribution is NH-1**, the `struct prop` data-model + persist-sources
spec for **PD-8**: it converts PD-8 from an abstract "merge not clobber" into a precise, tiny, proven
architecture with a single `hasSkill` seam the wheel already reads at call time — but it inherits PD-8's
Tier-3 design gate (the permanent-vs-respec call must be made before serializing the learned Set), so it
stays ✋, not Tier 1. **NH-3 folds into PD-3 (Tier 1)** as the FSM's capability/state vocabulary — do it
inside that consolidation, never as a standalone sweep. **NH-4 upgrades PD-10** and **NH-5 upgrades
PD-16** (both Tier 2 / do-when-content-is-the-focus; NH-5 is L-effort, gated on actually authoring Ch2
areas). **FE-2 is validation-first** — it confirms the shipped pointer model is on a proven track and adds
two cheap reuse-an-existing-seam deltas (Tier 4). **FE-1** rides PD-15 (do-when-the-tree-assets-land) and
**FE-3** is small presentational polish (Tier 4). **NH-2 is an explicit hold (⏸)** — the clean shape of a
reversible-denial layer, to be built only when a concrete encounter needs it. No NetHack item displaces the
existing Tier-1 set (PD-1..5, CD-2, CD-5); they sharpen items already on the board.

---

## Open design decisions (need Caelan's call before planning)

- **PD-8 / NH-1** — is the persisted learned-skill axis the "ring builds" vision? NetHack's `struct prop` hands us the concrete storage spec (NH-1: persist learned sources, union at read, never clobber). The open call before serializing: permanent, respec-able, or slot-limited?
- **Meta surface** — do Statistics/Badges (PD-9) and the witness log (PD-10) live in a new Remoticon tab or inside QUESTS?
- **Refactor appetite** — are the L-effort consolidations (PD-14) worth doing for their own sake, or only folded into feature work that already touches those surfaces?
- **CD-1** — build the unified `worldInteractions` dispatch now, or keep `_interactCar` explicit until the canyon-grapple interaction is actually on the roadmap? (Study leans: wait for the 2nd real item-on-world interaction.)
- **CD-7** — is the zone-pursuit / stealth thread greenlit? The data-flag line-of-sight (`blocksSight` on `TILES`) is gated on it.

---

## Continuation roadmap (2026-07-11 — post-foundation + PD-3)

**Done + merged to dev:** foundation batch (PD-1,2,4,5 · CD-2,5) + PD-3+NH-3 (AI consolidation). Remaining backlog packaged into 5 themed passes, built one at a time (brainstorm → spec → subagent-driven build). **Recommended order A → B → C → D**, with E folded in opportunistically.

- **A · Your toolkit** — PD-8/NH-1 (persisted learned-skill axis) + NH-2 (reversible suppression / the `blocked` field) + PD-7/OL-6 (item pull-model + bare-hands sentinel). One "what can I do right now" grammar over abilities + items. Files: `main.js` (`_refreshGrantedSkills`), `wheel-model.js` (verb/availability predicates + a `hasSkill` accessor), `save.js`. **⛔ design-gated:** learned skills permanent / respec-able / slot-limited (decide before serializing). *[STARTED 2026-07-11]*
- **B · Enemies worth fighting** — PD-6 (flee/steal/doze opt-in states on the clean FSM) + CD-7 (data-flag `blocksSight` LOS) + finish the parked zone-pursuit. The PD-3 payoff. Files: `npc.js`/`enemies.js` (the `capabilities` set). **⛔ gate:** CD-7 needs the stealth/zone-pursuit thread greenlit.
- **C · A town that lives** — PD-9 (Statistics + Badges "rap sheet") + PD-10/NH-4 (dedupe witness log + flavor line-pools = living-world chatter) + OL-2 (timed tile transitions). Rides the `emitGameEvent` bus + CD-5's `_worldBeat` (both done). Additive, low-risk, high fiction/portfolio value.
- **D · Author-time leverage** — OL-3 (bestiary / content-graph `_design` viewer) + OL-4 (verb×target coverage) + OL-1 (reverse index "who-wants-what") + PD-16/NH-5 (build-time map DSL). Leverages the CD-2 validator; do before hand-authoring a big new zone. Debug-only.
- **E · Structure & polish (fold-in)** — PD-15/FE-1 (kill car special-casing via tile/sprite descriptors) · PD-13/PD-14 (target-pick seam + modal-descriptor table) · PD-11 (save-migration scaffold) · FE-2/FE-3 (auto-travel + pre-tap verb hint) · PD-12 (buff extend-vs-reset). Do-when-in-that-surface.
- **Held (gated on a concrete trigger):** CD-1 (2nd item-on-world interaction), CD-4 (input-tape replay), CD-6 (tile-state plane), OL-7 (equipment sprite layers). *(OL-5's ownership half shipped inside PD-2; FE-2 mostly validates the pointer model.)*
