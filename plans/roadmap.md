# Violencetown — Feature Roadmap & Build Order
**Date:** 2026-06-10
**Status:** ACTIVE — the running roadmap / lightweight ticket board. Synthesized from the June 2026 build session + existing plans. Complements `road-to-1.0.md` (the ship plan) and `game-zones.md` / `adventure-transition-plan.md` (the big vision); does not replace them.

> **Legend:** ✅ shipped (on `dev`) · 🔨 in progress · ✍️ designed, not built · 🌫️ parked (needs its own design pass).
> **§3 is the path** (recommended build order). §1–2 are the inventory; §4 the dependencies.

---

## 1. Where we are — shipped to `dev` (2026-06-10)
- ✅ **Action wheel** — three concentric rings (action / item / direction), rotate-to-pointer spin, bump-to-attack removed, double-tap-repeat, touch controls.
- ✅ **Combat feel-pass** — thrown **3×3 burst** (half effect to all valid targets, respect-the-target) + the **Sludge Sack**; **typed hit-splats** (color = damage type, per-type motion, directional/omni fan; per-hit "POW" spam dropped).
- ✅ **World structure** — directional re-layout (**W** Factory · **E** Sewer · **S** Carnival→Graveyard→Wilderness · **N** blocked bridge), coherent/de-confused entrances, **Wilderness blackout**, **Puck** placed (inert merchant).
- ✅ *(earlier)* critical-path stabilization (no soft-locks), audio (music + SFX), options / pause / reduce-motion.

## 2. Feature inventory (everything on the table)

### Trade & economy
- 🔨 **Trade Slice 1 — grid shop.** Pricing core (`trade.js`) committed. Remaining: the satchel **window** (canvas), tap-to-buy/sell, **8-band disposition pricing**, **gold bribery** + trade-floor, open/close ([E] on a vendor), Puck's stock, the smiley AGGRO readout.
- ✍️ **AGGRO surfaced.** The disposition→behavior **band ladder** (−100 kill-everything … +100 give-their-life: worse prices, opportunistic attacks, jump-into-fights, trip fleeing foes, fight-for-you) + the **visual smiley meter** over NPC heads. The engine (`give-action.js` flip) exists; the band-behaviors + visual are unbuilt.
- ✍️ **Trade Slice 2 — equipment + barter.** Persistent **stat-gear** (5 armor slots + weapon), **"disposition-when-worn"**, **NPC loadouts + NPC gold**, the **drag-to-swap** barter (+ multi-select/swipe), the tank-top / gold-chest-plate items. (Full spec: memory `trade-system-design`.)
- ✍️ **Gold economy depth.** Income anchor (E≈8–15/encounter), recurring sinks, **Gold-Card tiers**, **gold-as-liability** (Street Boredom), travel tolls, an early time-boxed debt, `baseValue` rebalance. (Research done: memory `gold-weighting-and-bribery-research`.)
- 🌫️ **Trade Slice 3 — loot.** Item **drop rates**, **recovery-on-death** (~20%), the Fallout loot-scaling problem. Undefined — needs a brainstorm before building.
- ✍️ **The reversible trade window** *(designed 2026-07-03 → `chapter-two-…-cohesion.md` Phase 6).* GIVE **folds into TRADE** (delete the give verb; give inside the window, incl. 0-GP / quest items with a quest-point marker); the trade window becomes the **one surface** (merchants **and** bandit chests); an **~5-min buyback window** at locked prices makes buy/sell **reversible** (Borderlands × Outward), and that timer **is** the **disposition tick clock**. Biggest/most bug-prone piece: the buyback ledger + timer + decay.
- ✍️ **Item value tiers.** **Grey / Green / Blue / Purple / Orange** rarity → rough damage/GP bands, legible worth at a glance. Same work as wheel **§12.3** item-`class` dev-table — build together; tiers drive examine text + trade prices.
- ✍️ **Special-buyer NPCs.** No quest-item tab — quest items are regular items with special buyers. **Macc** the raccoon mechanic (Town shop) buys the Cataclysmic Converter (500 GP) & sells the canyon chain (100 GP); the Converter is also throwable for huge damage. (→ `…-cohesion.md` Phase 3 + 6d.)

### 1.0 ship — the car-fix arc, finished in the new world
- ✍️ **Wire the ending.** Car fixed → the **North bridge unlocks** → crossing it = win/credits. The re-layout made the bridge the goal; confirm the existing ending (from stabilization) still fires and align it to the bridge.
- ✍️ **Critical-path re-verify.** The 10-minute scripted run on the NEW geometry: start → Sewer (E) for the converter → fix the car → cross the bridge (N) → ending; no soft-locks introduced by the re-layout.
- ✍️ **Onboarding.** First-60s teaches move / fight / goal through play (the visible bridge-objective + Puck help); one guaranteed satisfying beat.
- ✍️ **Ship-prep.** itch.io landing page, capsule art, a gameplay GIF.

### Post-1.0 expansion — the big vision (`game-zones.md`, adventure plan)
- ✍️ **Zone deep content** — per zone: enemy roster, a boss, the element hazard. Bosses: Financier (Street), Texas Beholdem (Sewer), Bigfoot (Carnival), Alien Invasion (Factory), The Deity (Graveyard).
- ✍️ **Element meters** — Boredom (Street) · Sludge (Sewer) · Fun (Carnival) · Goo (Factory) · Death (Graveyard).
- ✍️ **Party / creature system** — creatures join as party members (Wererat / Clown / Robot / Skeleton).
- ✍️ **Light + Lantern** — a light source (sold by Puck) that makes the dark Wilderness explorable; turns the soft border into real content.
- ✍️ **Combat verbs** — Cleave (melee AoE, the "half-to-all" rule the throw burst already uses), Skill / MP (the MP bar exists but is inert).
- ✍️ **More merchants** — Carrion (Sewer, `onFlip: offerDiscount`), Jersey's diner (Street), per `economy-merchants.md`.

## 3. Recommended build order — the optimal path

**Strategic anchor:** the #1 win is **ship something real** (memories `gander-goals-for-violencetown`, `violencetown-1.0-scope`). The game is *close* — stabilization, audio, options are done; the world and combat are now rich. So the optimal path **reaches a shippable 1.0 fast, then expands** — finishing the in-flight trade work first because it's nearly done and gives the new world a point (gold + Puck).

**▸ MILESTONE 1 — "It ends" (ship-critical, do first)**
1. **Wire the ending** — car → bridge unlocks → cross → win/credits. Without it the arc has no payoff in the new geometry. *Highest priority.*
2. **Re-verify the critical path** end-to-end on the new world (scripted run; fix any re-layout soft-locks).

**▸ MILESTONE 2 — "A reason to deal" (finish in-flight + legibility)**
3. **Finish Trade Slice 1** (grid shop) — Puck deals; gold finally has a sink.
4. **AGGRO meter + bands surfaced** — the smiley over NPC heads + the disposition→behavior ladder. Makes disposition/bribery legible and the world feel alive.

**▸ MILESTONE 3 — "Ship 1.0"**
5. **Onboarding** (first-60s).
6. **Ship-prep** (itch.io page, capsule art, GIF) → **tag v1.0 and SHIP.** ← the "ship something real" win.

**▸ POST-1.0 (expansion, rough order)**
7. **Trade Slice 2** — equipment + drag-swap + stat-gear + NPC loadouts (the barter magic).
8. **Gold economy depth** — sinks, Gold Card, Boredom-on-gold.
9. **Zone deep content, one zone at a time** — Sewer (most-built) → Factory (Puck/aliens) → Carnival (cryptids) → Graveyard → Street (Financier). Each: enemies + boss + element.
10. **Element meters** → **party/creature system** → **light/Lantern** → **combat verbs (Cleave/Skill)** → **more merchants**.
11. **Trade Slice 3 (loot)** once its drop-rate/recovery design is settled.

## 4. Key dependencies
- The **ending** (M1) gates a coherent shippable game — first, always.
- **Trade Slice 2** needs the **equipment foundation** (persistent stat-gear, NPC loadouts/gold) — don't start the drag-swap before it exists.
- **AGGRO bands** (M2.4) build on the existing `give-action.js` flip; the **visual meter** is shared by the shop and the overworld, so build it once.
- **Zone bosses / element meters** are independent per zone — shippable zone-by-zone.
- **Light/Lantern** unlocks the **Wilderness** as real content (today a soft "too dangerous" border).

## 5. Notes
- This is the lightweight tickets board for now (Wild West — re-order freely as priorities shift).
- **"Ship 1.0" is a milestone, not the finish line** — it's the proof we can ship, after which the big vision (zones / party / story) gets built on a public foundation that already works.
