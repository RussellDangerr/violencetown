# Feature: The XMB usable-bar — item · hotbar · equipment redesign

**Phase:** Interaction / UI — the inventory surface.
**Priority:** High (unblocks equipping, which is currently broken; and the flat hotbar actively
fights the "pick up everything" feel).
**Status:** Design (approved 2026-07-21, in brainstorm with Caelan).
**Relates to:** `plans/interaction-ui-polish.md` (the hotbar-tap thread) and the Remoticon device
(`STATE.DEVICE`). Supersedes the flat auto-fill hotbar behaviour.

> **Decisions (Caelan, 2026-07-21):**
> - **Items sort themselves.** Pick up everything; the system routes each item to its home. The bar
>   holds only *usable* things, always inviting "what could I throw / what should I drink?"
> - **Gear never touches the bar.** On pickup, auto-equip if the body slot is free; else the spare
>   waits in GEAR. Swap by tapping GEAR.
> - **The bar is an XMB.** Horizontal categories × a vertical item column. First item of a type seeds
>   its category; more of that type become scrollable in the column.
> - **Always-live HUD strip**, replacing today's flat hotbar. Item-use *leaves the combat wheel*.
> - **Shift+arrows navigate the bar** — bare arrows/WASD still walk. (Inside the Remoticon, which
>   pauses the world, plain arrows are free.)

---

## Why

The bottom bar auto-fills flat from `game.inventory` — every pickup, gear included, lands on it
undifferentiated. Three concrete failures from the last playtest:

1. **Gear can't be equipped from the Remoticon.** `_tapDevice` has no `items` branch (tapping a
   hotbar item in the ITEMS tab does nothing), and the GEAR branch `return`s on an empty slot. The
   only working equip path is the bottom-HUD hotbar → `STATE.ITEM_OVERLAY` → Use → `resolveUse('equip')`.
2. **The Remoticon can't be tab-navigated with arrows/WASD.** The device keydown handles
   `Tab` / `[` `]` / `C·J·M·R` only — no Left/Right or A/D.
3. **Equipment appears on the hotbar on pickup** — the bar should never hold gear.

## Vision

Frictionless. Items sort themselves. Pick up everything, use liberally. The bar shows only usable
things and is always quietly asking a question — *what bomb could I throw, what potion should I drink?*

## Three item classes → three homes

Routed on pickup by `useType`:

| Class | `useType` | Home |
|-------|-----------|------|
| **Gear** | `equip` | Auto-equip if the body slot is free; else spare in **GEAR**. **Never** on the bar. |
| **Usable** | `throw`, `self`, `melee` | The **XMB bar**, categorized. Full stock also visible in the **Bag**. |
| **Quest / key / inert** | `none` | **Bag** only (e.g. `wererat_fur`). |

## The XMB usable-bar (the centerpiece)

- **Always-live bottom strip**, replacing the flat hotbar.
- **Horizontal categories × a vertical item column.** Initial categories: **THROW** / **DRINK** /
  **EAT** (extensible).
- **Auto-stock.** The first item of a type seeds its category's "current" slot; further items of the
  same type become scrollable in that column. (Health Potion auto-stocks DRINK; Strength Potion
  joins the DRINK column once obtained and stocked.)
- **Keyboard navigation:** bare arrows/WASD still **walk**. **Shift+←/→** changes category;
  **Shift+↑/↓** scrolls the item column. Mouse-wheel over the bar scrolls too.
- **Fire:** one key uses/throws the highlighted item (key TBD in the plan). Reuses the existing
  resolvers — see below.
- **Touch:** tap a category, tap an item, tap to fire — no modifier.
- **Memory:** remembers the last-selected item per category.
- **Empty categories hidden** until the first item of that type is obtained.

## Combat wheel change

Item-use **leaves** the wheel. Today the wheel carries item leaves — `ranged` + `throw`
(→ `resolveThrow`) and `treat`→`eat` (→ `resolveUse`) in `wheel-model.js`. Those entry points move
to the XMB. The wheel keeps Hit / Cleave, non-item Tricks, ring-active tricks (`rat_form`,
`ember_rat`), and aiming.

**The resolvers themselves don't change.** `resolveThrow` (reticle-aimed 3×3 burst) and
`resolveUse` (self-consume) are simply invoked *from the XMB* instead of the wheel. This keeps new
code small — the redesign is mostly a new invocation surface plus routing, not new combat math.

## Remoticon changes (fixes bugs 1 & 2)

- **ITEMS tab → the Bag.** Full inventory, browse/organize. Usables also live on the bar; the Bag is
  the complete picture.
- **GEAR tab → worn slots + spare gear.** Tapping a spare equips/swaps it — the missing equip path.
  (Fixes bug 1.)
- **Device keydown gains ←/→ + A/D → cycle tabs.** Plain arrows are safe here because the Remoticon
  pauses the world. (Fixes bug 2.)

## Pickup routing

On pickup, classify by `useType` → gear / usable / quest → route to its home (auto-equip, XMB
category, or Bag) and log a differentiated line ("Equipped X" / "X → THROW" / "Stashed X") so the
player sees where it went.

## Out of scope / deferred

- **Give** — a target-contextual social action; stays with trade / target verbs, not on the XMB.
- **Category taxonomy beyond THROW/DRINK/EAT** (Smash? tools/keys?) — extensible; add as content grows.

## Open questions for the plan

- **The fire key** — which key uses the highlighted XMB item in the live world (Space already opens
  the wheel).
- **DRINK vs EAT source of truth** — a small item field (e.g. `consumeKind: 'drink' | 'eat'`) vs.
  derived. Both are `useType:'self'` today.
