# Feature: Combat Wheel — Effects & Reactions Layer

**Phase:** Phase 2 — Life in the City (combat feel)
**Priority:** Critical (the wheel's *navigation* shipped; this is what it actually *does to people*)
**Status:** Design + Plan — Gate 2 (co-designed in conversation 2026-06-15)

> **Origin:** The circular-XMB wheel ([combat-wheel-rework.md](combat-wheel-rework.md)) is built and live on `main`
> (FIGHT/TRICK/TREAT/FLIGHT, one grammar: `↑` forward · `↓` back · `←→` cycle, ending in a reticle).
> But the *model is pure navigation — it never touches an entity.* Everything that "executes on the people
> around the player" happens in `Game._fireWheel`'s switch ([game/main.js:2077](../game/main.js)). A code audit
> (2026-06-15) found that of the wheel's leaves, only **FLIGHT** is fully honest; FIGHT is Melee-only, TRICK is
> half-wired, and **TREAT is broken on production**. This plan makes the four headline verbs real and gives the
> world a way to *react*.

> **Relationship to canon:** Builds directly on [combat-wheel-rework.md](combat-wheel-rework.md) (navigation/UI,
> shipped). Keeps Inspect / mid-combat commerce deferred per [combat-ui-layers.md](combat-ui-layers.md). The
> "universal agency / BG3 — throw a potion at the strongest character" pillar from the rework spec is the north
> star here: the wheel should let you act on *anyone* nearby, friend or foe.

---

## The "people around the player"

All actors are one unified list: `game.enemies[]` ([game/enemies.js:24](../game/enemies.js) — scalar `x,y`, no
multi-tile footprint). Each is roughly:

```
{ x, y, vendor?, disposition?,
  behavior: [ 'HOSTILE' | 'IDLE' | 'ALLIED' , ... ],   // the friend/foe signal
  entity:   { hp, maxHp, isAlive(), takeDamage(), addBuff() } }
```

`behavior` is the friend/foe truth: `'HOSTILE'` present → enemy; otherwise a friend (ally, vendor, dialogue NPC).
The canonical foe filter `Game._adjacentHostiles` ([game/main.js:2106](../game/main.js)) already encodes "no
behavior array = legacy hostile; else hostile iff `HOSTILE` in array." Every offensive verb should route through it.

---

## Design decisions (locked 2026-06-15)

1. **Heal bug fix is P0** of this build (not a separate hotfix).
2. **Friend/foe = the "Plus Ultra" confirm.** Riding the wheel's own grammar instead of a modal dialog.
3. **1.0 scope = solidify the wired four (Melee/Throw/Treat/Flight) + reactions.** Ranged/Magic/Hide stay greyed
   `dep:true` stubs; multi-tile entities are post-1.0.
4. **Give + bribe fold into TRICK→Trade** as the single adjacent-NPC hub (shop + give + bribe).

### The "Plus Ultra" friendly-hit confirm

Today Melee/Throw `find` *any* entity on the target tile with no foe gate ([game/main.js:2084](../game/main.js)) —
you can silently clock a vendor. We don't want to *forbid* harming a friend (universal agency), we want to make it
**deliberate**, using the layer machine the player already knows.

- Add a layer: `LAYER.CONFIRM` after `AIM` ([game/wheel-model.js:39](../game/wheel-model.js)).
- On the AIM layer, `↑` normally returns `'fire'`. New rule: if the resolved target tile holds a **non-hostile**
  entity *and the leaf is offensive* (Melee/Throw/Ranged/Magic), `forward()` instead advances to `CONFIRM` rather
  than firing.
- The CONFIRM ring shows the target's face/name + a warning ("Strike **Puck**? They're not your enemy."). A
  **second, deliberate `↑`** commits. `↓`/`Esc` backs out — no turn spent.
- Hostiles fire on the first `↑` with zero friction. Friendly *non-offensive* verbs (heal/cleanse an ally, give)
  never trigger CONFIRM.
- The committed friendly hit is exactly where the reaction bus flips the victim hostile — *you* started it.

> Open nuance to confirm with Caelan: treat **every** non-hostile (neutral NPC, vendor, ally) as a "friend"
> requiring Plus Ultra? This plan assumes **yes** (simplest, and matches "go plus ultra to hit a *friend*").

---

## Cross-cutting systems (the spine)

Build these once; every option leans on them.

### A. Reaction / aggro bus *(highest priority)*
A single entry point harm flows through:

```
_onEntityHarmed(target, { byPlayer, kind })   // kind: 'attack' | 'throw' | 'shove' | 'splash'
```

- If `target` is not already `HOSTILE`: push `'HOSTILE'` onto `target.behavior`, set its aggro target = player,
  and (stretch) alert other friends within N tiles so a crowd turns on you together.
- Vendors: harming flips them hostile and closes/locks the shop.
- Call sites: `combatAttack` ([game/main.js ~2292](../game/main.js)), the shove path in `_doMove`
  ([game/main.js ~1497](../game/main.js)), and `resolveThrow`'s splash loop ([game/items.js:281](../game/items.js)).
- **Today harm is silent** unless the target was already hostile — this bus is *the* thing that makes the wheel
  feel like it acts on the world.

### B. Friend/foe resolution at fire time
Route Melee/Throw/Ranged/Magic target lookup through `_adjacentHostiles` semantics + the Plus Ultra CONFIRM layer
for non-hostiles. No more silent `enemies.find(...)`.

### C. Generic AoE helper
Lift the hand-inlined 3×3 out of `resolveThrow` ([game/items.js:281-302](../game/items.js)) into
`entitiesAt(tile)` / `entitiesInRadius(tile, r)` on the game object, so Throw, Magic, and future verbs share one
enumeration. Honors (eventually) multi-tile footprints in one place.

### D. Reticle fidelity (real placement)
`_throwAt` ([game/main.js:2046](../game/main.js)) collapses the precise reticle tile to a `Math.sign` direction via
`_aimDir` ([game/main.js:2042](../game/main.js)), so "real placement" is *not* honored — the burst lands down a
direction, not on the tile. Carry the exact `aimTile` into `resolveThrow` and center the AoE there. Add line-of-sight
(`hasLineOfSight` already exists, [game/enemies.js:132](../game/enemies.js)) for thrown/ranged reach.

### E. Friendly-target path
Heal/cleanse/buff are self-only ([game/items.js:208-248](../game/items.js)). Add an "apply to the entity on the aim
tile" branch so TREAT can reach an ally. (Pairs with the Plus Ultra rule: helping a friend is frictionless; only
*harming* one needs the extra layer.)

### F. Feedback polish
Floating damage numbers, an AoE preview overlay on the AIM layer ([game/renderer.js ~1506](../game/renderer.js)),
corpse cleanup.

---

## Per-option spec (the wired four)

For each: **target → effect code → turn cost → reaction**. ✅ = exists, build = new.

### FIGHT → Melee  ✅ (needs foe gate + reaction)
- **Target:** adjacent tile (`aimType:'adjacent'`, range 1), auto-aimed to nearest hostile.
- **Effect:** `combatAttack(enemy, equipment.weapon.damage)` → `takeDamage`; splat/flash/stagger/shake/KO anim
  ([game/main.js:2292-2350](../game/main.js)); `_advanceWorld()`.
- **Turn:** 1.
- **Build:** route target through foe gate + Plus Ultra; on hit call `_onEntityHarmed` (aggro neutrals).

### TRICK → Throw  ⚠️ (works down a direction; make it real-placement + reactive)
- **Target:** reticle, range = `item.range` (~5). **Currently collapsed to a direction.**
- **Effect:** `resolveThrow` ([game/items.js:259-312](../game/items.js)) — `combatAttack(dmg/2,{omni})` per HOSTILE
  in the 3×3; heal applies to the player tile only.
- **Turn:** 1.
- **Build:** honor `aimTile` (center AoE there, via helper C); `_onEntityHarmed` for everyone in the splash (incl.
  neutrals → chaos); AoE preview (F). Decide whether splash hurts friends (Plus Ultra applies if the *center* is a friend).

### TREAT → Eat / Cleanse  ⚠️ **BROKEN — P0 fix**
- **Bug:** ring is always empty — `itemAllowedForLeaf` admits `resolveUse` items only if `useType.includes('use')`
  ([game/wheel-model.js:59](../game/wheel-model.js)), but every consumable is `useType:'self'`
  ([game/items.js:41-116](../game/items.js)). `forward()` then refuses to advance ([game/wheel-model.js:98](../game/wheel-model.js)).
- **Fix:** change line 59 to admit `useType.includes('self')` (and keep `'use'` as an alias if any item ever uses it).
- **Effect (once fixed):** `resolveUse` → `resolveSelfUse` heals `playerHp`, +N splat ([game/items.js:237-248](../game/items.js)).
- **Then (E):** allow targeting an ally tile to heal/cleanse a companion.

### FLIGHT → Defend  ✅ done
`addBuff('guard',2)` halves incoming for 2 turns ([game/main.js:2091, 2436](../game/main.js)). No work.

### FLIGHT → Wait  ✅ done
`_advanceWorld()`.

### FLIGHT → Run  ✅ (optional polish)
- **Target:** auto-aims to the walkable adjacent tile farthest from the nearest hostile
  ([game/wheel-model.js:148-155](../game/wheel-model.js)).
- **Effect:** `_doMove` ([game/main.js:1469](../game/main.js)); can shove via `stepEntity`.
- **Reaction gap:** shove provokes nothing and `_isHeavy` is always false ([game/main.js:1583](../game/main.js)).
- **Optional:** route shove through `_onEntityHarmed('shove')`; Caelan's earlier "dash of 3 tiles" sprint; a real
  heavy flag so bandit-captain types bounce you.

### TRICK → Trade  ⚠️ (no valid target today; becomes the NPC hub)
- **Target:** adjacent NPC, opens only if `npc.vendor` ([game/main.js:2094-2100](../game/main.js)) — **no map sets
  `vendor:true`**, so it always says "no one to trade with."
- **Build:** author a vendor (flag Puck or a new NPC); route **Give** (`_doGive` [game/main.js:1950](../game/main.js))
  and **bribe** (`give-action.js:62-149`) into this leaf; wire `_discountMode` (computed but never read,
  [give-action.js:126-138](../game/give-action.js)) into trade pricing ([trade.js:30-75](../game/trade.js)).

### Deferred (stay greyed `dep:true`)
- **FIGHT → Ranged:** needs a ranged weapon (`available()` requires `equipment.weapon.ranged`), a `rangedAttack`
  case (no case today → "isn't ready yet"), LOS, projectile, force-aggro. `_aimRange` has no ranged branch.
- **FIGHT → Magic:** deepest — MP inert, no `knownSpells`, no spell catalog, no status engine
  (Poison/Stun/Slow declared but never tick, [game/enemies.js:103-107](../game/enemies.js)).
- **FLIGHT → Hide:** needs a hide buff `resolveEnemyTurns` honors (skip LOS-acquire, [game/enemies.js:209-220](../game/enemies.js))
  + a rule for what breaks it.
- **Multi-tile entities (1×3 / 2×2):** entities are scalar `x,y`; needs footprints + grid occupancy. Post-1.0.

---

## Build order

- **P0 — Heal fix.** One-line gate change at [game/wheel-model.js:59](../game/wheel-model.js). Unbreaks TREAT
  (currently dead on production).
- **P1 — Reaction/aggro bus (A) + Plus Ultra CONFIRM layer (B).** The chaos engine + intentional-friendly-hit. Makes
  every offensive verb affect the world.
- **P2 — Trade hub (Trade + Give + bribe) + author a vendor.**
- **P3 — Generic AoE helper (C) + real-placement throw (D).**
- **P4 — Friendly-target path (E)** so TREAT reaches allies; **feedback polish (F)** as it lands.
- **Deferred:** Ranged, Magic, Hide, multi-tile.

## Verification

No node test runner in this sandbox — pure `wheel-model.js` logic is verified by executing the real module in the
browser (drive via `window.__game`, dispatch `keydown`/`keyup` on `document`; restart `dev-server.py 3001` for fresh
modules; shim `requestAnimationFrame` when the tab is backgrounded). Effect/reaction behavior is verified in-browser
against `game.enemies[]` state (hp, behavior flips, turn advance). Keep `wheel-model.js` pure so its logic stays
unit-testable if a runner returns.

## Open questions for Caelan

1. **Plus Ultra scope:** does *every* non-hostile (neutral NPC, vendor, ally) require the confirm, or only true allies?
   (This plan assumes every non-hostile.)
2. **Throw splash on friends:** if the burst center is a foe but a friend is in the 3×3, do they take splash freely,
   or does any friend-in-radius trigger Plus Ultra?
3. **Crowd aggro:** when you harm one neutral, do nearby friends of the same kind also turn on you, or only the victim?
4. **Run polish in 1.0?** sprint-3 + shove-aggro + heavy flag, or leave Run as-is for now?
