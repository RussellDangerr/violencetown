# REMOTICON overhaul — inventory zones + equipment inspector (design)

**Status:** Draft — awaiting Caelan's review
**Date:** 2026-07-24
**Branch:** `feature/remoticon-overhaul` (from `dev` @ `0220293`)
**Motivating bugs:** (1) the 9-slot bag fills up and blocks pickups (the cape couldn't be picked
up); (2) the GEAR tab equips "whatever's first" on tap with no screen showing options or stats.

## The idea in one paragraph

The REMOTICON gets two things: a **50-slot bag split into a 10-slot SAFE zone (kept on defeat) and
a 40-slot PACK zone (at-risk)**, and a **unified tap-to-inspect interaction** — tapping any item or
gear slot selects it and shows an inspector panel with its stats and action buttons, instead of
acting immediately. The inspector is one component reused across the ITEMS and GEAR tabs, so the
whole device speaks one grammar: tap to inspect, then choose.

## Decisions locked in brainstorming

- Safe-slot mechanic: **two zones, tap-to-protect** (not drag — the device is tap-only).
- Equipment UI: **inspector panel** (approach A), which also becomes the inventory interaction.
- Quest items: **free** — always safe wherever they sit, and they do NOT consume the 10 SAFE slots.
- Stack cap: **stays 99** (`MAX_STACK` unchanged — the 50 slots alone fix the pickup bug).
- `Drop` action: **in** (a 50-slot bag needs a way to ditch junk).

---

## Part 1 — Inventory data model

### Slots and zones
- `INVENTORY_SIZE: 9 → 50` (`game/data.js`). `MAX_STACK` unchanged at 99.
- Zone boundary is by index, via a new constant `SAFE_SLOTS = 10` (`game/data.js`):
  - **SAFE zone** = slots `0 … 9` (gold corner, kept on defeat).
  - **PACK zone** = slots `10 … 49` (at-risk — eligible to be taken per the defeater's rule).
- The zone split is a property of the SLOT, not the item — this is the shift from today's
  per-item `isSafe`. Items keep their own always-safe traits ON TOP (quest/essential).

### Safety on defeat (the "gold corner" promise)
`partitionInventory(inventory, equippedWeapon, safeSlots)` (`game/defeat-scenarios.js`) marks an
entry **safe** when EITHER:
- its slot index `< SAFE_SLOTS` (it's in the SAFE zone), OR
- `isSafe(itemDef, equippedWeapon)` is true today (quest item, essential, or the equipped weapon).

So a quest item shows a gold corner and survives wherever it sits, and never eats a SAFE slot —
exactly the "free" ruling. Everything in PACK that isn't intrinsically safe is at-risk.

### Pickup routing (`_addToInventory`, `game/main.js`)
Order preserved-but-extended: (1) merge into an existing stack of the same id with room, either
zone; (2) else first free **PACK** slot (`10 … 49`); (3) else first free **SAFE** slot (`0 … 9`);
(4) else the bag is genuinely full → `[Your bag is full.]`. PACK-first keeps SAFE as deliberate,
player-curated protection rather than a dumping ground; SAFE-overflow only happens when PACK is
full, and landing in a safe slot is harmless (extra-safe).

### Protect / unprotect (new)
A pure helper `moveToZone(inventory, fromSlot, zone, safeSlots)` (`game/main.js` or a small
inventory module) moves a stack to the first free slot of the target zone:
- **Protect:** PACK stack → first free SAFE slot. If SAFE is full → refuse, `[Safe slots full.]`.
- **Unprotect:** SAFE stack → first free PACK slot. If PACK is full → refuse, `[Pack is full.]`.
- Quest items already read as safe; their inspector shows "Always kept" and offers no Protect
  (moving them changes nothing about their safety), keeping the action honest.

---

## Part 2 — The unified inspector (tap-to-inspect)

Today `_onDeviceClick` for the ITEMS tab equips/uses on tap. New model: **tap selects a slot into
`this._deviceSel = { tab, index }`; the renderer draws an inspector panel for the selection; a
second tap on an action button in that panel performs the action.** No drag, no long-press.

### ITEMS tab
- The bag renders as two labeled zones: a `SAFE (10)` row/block with gold-corner slots, and a
  `PACK (40)` grid below. The device body is large (the current tab shows one row of 9 with vast
  empty space), so 50 slots + a panel fit comfortably.
- Tap a filled slot → inspector panel shows: item name, description, stat line (heal / damage /
  armor / granted skill), stack count, and its zone. Action buttons by item kind:
  - Consumable → `[Use] [Protect|Unprotect] [Drop]`
  - Gear (`useType:'equip'`) → `[Equip] [Protect|Unprotect] [Drop]`
  - Quest item → stat/desc only, label "Always kept" (no Drop, no Protect)
- `[Use]` / `[Equip]` reuse the existing `resolveUse` path; `[Drop]` removes the stack (one unit or
  the whole stack — see Open Questions); `[Protect]`/`[Unprotect]` call `moveToZone`.
- The old "tap = immediately use/equip" is replaced by "tap = select". The in-combat **usable bar**
  at the bottom of the screen is untouched — that stays the fast-use surface; the REMOTICON is the
  management surface.

### GEAR tab (the equipment screen)
- Keep the stick-figure paper doll and its slots (head, torso, arms, back, feet, weapon).
- Tap a slot → inspector panel lists **every bag item whose `equipSlot` matches**, each with its
  stat delta vs the currently-worn piece (`Foil Hat +2 → Tin Crown +4`), plus a `[Bare]` unequip
  row. The panel also shows the worn item's full stats (armor, granted tricks/spells).
- Tap an option row → equip it; the displaced piece re-bags (existing `resolveUse`/unequip logic).
  This replaces today's "empty plate → wear first spare" guesswork with a real chooser.

### One component, two tabs
The inspector is a single renderer function `drawInspector(ctx, rect, selection, game)` plus a
single hit-test `inspectorActionAt(pt, ...)`. ITEMS and GEAR differ only in what populates the
panel (item actions vs slot options). This keeps the interaction identical and the code in one
place — the same reason the Rings tab and GEAR tab already share `deviceBodyRect()`.

---

## Files touched (map)

| File | Change |
|---|---|
| `game/data.js` | `INVENTORY_SIZE 9→50`; add `SAFE_SLOTS = 10`. `MAX_STACK` unchanged. |
| `game/defeat-scenarios.js` | `partitionInventory` takes `safeSlots`; slot `< safeSlots` ⇒ safe. |
| `game/main.js` | `_addToInventory` PACK-first routing; `moveToZone` helper; `_deviceSel` state; `_onDeviceClick` becomes select + inspector-action dispatch for ITEMS/GEAR; drop path. |
| `game/renderer.js` | two-zone bag draw; `drawInspector` panel; GEAR options list with deltas; the "gold corner = kept if defeated" helper text updates to name the zones. |
| `game/layout.js` | slot-rect helpers for 50 slots in two zones; inspector-panel rect; option-row rects. |
| `tests/*` | inventory-zone routing, protect/unprotect, partition-by-zone, defeat safety, equip-delta computation (all pure-logic, `node --test`). |

## Testing strategy

The logic is pure and Node-testable even though the draw isn't (main.js touches `document`): extract
`_addToInventory` routing, `moveToZone`, the zone-aware `partitionInventory`, and equip-delta
computation as pure functions and unit-test them. Layout/inspector geometry gets the same
"local mirror + smoke test" treatment the codebase already uses for canvas UI. The existing
`tests/inventory-stacking.test.js` and `tests/device-equip.test.js` / `tests/device-layout.test.js`
are the models to extend.

## Open questions (small, for the plan)

1. **Drop granularity:** `[Drop]` removes one unit, or the whole stack? Recommendation: whole stack
   with no confirm for now (junk-dumping); a held-quantity picker is future polish.
2. **Zone layout shape:** SAFE as a single row of 10 above a 4×10 PACK grid, vs a left SAFE column.
   Recommendation: SAFE row on top (reads as "the protected shelf"), PACK grid below. Final pixel
   placement is a frontend-design call during implementation.
3. **Inspector placement:** right-side panel (landscape) given the square canvas. Confirmed by the
   device being large; exact rect is a layout detail.

## Non-goals

- No change to the in-combat usable bar, the wheel, combat math, or the economy.
- No drag-and-drop (tap-only device).
- No new quest-pouch sub-screen (quest items stay in the bag, free-safe).
- Boss frame, statline buyout, and other Gold-Standard deferrals are unrelated and untouched.
