# Feature: Combat UI — Layered Modal System
**Phase:** Phase 2 — Life in the City
**Priority:** Critical (defines how ALL combat interactions feel)
**Status:** Design (Gate 1)

> **Origin:** Design session 2026-05-22. The combat overlay already exists as a Persona-style slide-in (Attack/Defend). This spec expands it into a full layered modal system that handles combat options, enemy inspection, mid-combat shopping, and multi-enemy encounters — all without leaving the world view.

> **Connects to:** `plans/economy-merchants.md` (mid-combat buying uses the same trade logic), `plans/give-action-and-disposition.md` (Give is one of the combat options), `plans/stats-consumables-library.md` (stats affect combat math and are visible in inspect panels).

> **Core principle:** Escape always moves you one step closer to walking. From any depth of menu, the player always knows "hit Escape, get closer to the world." The world never disappears. The sewer is always behind the menus.

---

## The Five Combat Verbs

When the player bumps an enemy (or an enemy reaches the player), the combat overlay presents:

| Direction | Verb | Effect |
|---|---|---|
| **Up** | **Attack** | Strike with equipped weapon. Consumes turn. |
| **Right** | **Throw** | Throw selected item at target. Consumes turn. Free action if item selected. |
| **Left** | **Defend** | Guard — halve incoming damage for this turn. Consumes turn. |
| **Down** | **Inspect** | Open the enemy's equipment/inventory panel. Does NOT consume turn. |
| **Escape** | **Run** | Attempt to move one tile away from the enemy. Consumes turn. Enemy still gets their action. |

**Wait** is implicit: if no combat option is selected and the player presses Space, they wait (same as the existing idle-turn mechanic). The five verbs cover the full decision space: hurt them (Attack/Throw), protect yourself (Defend), learn about them (Inspect), or leave (Run).

**Key change from current:** Inspect replaces the current empty down-slot in the combat overlay. Give moves into the Inspect panel (you Give from within the inspect view, not from the top-level combat menu). Run is Escape, which is intuitive — Escape from combat = run away.

---

## Layer Architecture

### Layer 0: Walking (STATE.IDLE)

The world. WASD moves you. 1-9 selects items. Space waits. The hotbar is always visible. Contextual prompts appear when adjacent to interactables:

- Adjacent to enemy: faint "[bump to engage]" hint
- Adjacent to item: "[E] Pick up" (already exists)
- Adjacent to NPC: "[E] Talk" or "[bump to engage]" depending on hostility
- Adjacent to container: "[E] Open" (already exists)

These prompts are small text below the player tile — not buttons, not modal. Just ambient UI that says "there's something here." Disappears when you move away.

### Layer 1: Combat Overlay (STATE.COMBAT_OVERLAY)

**Trigger:** Player bumps an enemy tile (already implemented).

**Display:** Five options slide in around the player tile using the existing Persona-style animation (80ms ease-out). The world dims to ~60% brightness. Enemy HP bar is visible above their tile.

```
              ↑ Attack (Wooden Sword, 10 dmg)
                      
← Defend              → Throw
                      
              ↓ Inspect
              
              [Esc] Run
```

**Multi-enemy:** If multiple enemies are adjacent when combat triggers, a left/right selector appears at the top of the overlay showing which enemy is targeted. Arrow keys still pick verbs; a separate key (Tab? Q/E?) cycles the target. The targeted enemy gets a highlight border.

**Navigation:** Arrow keys select a verb. Enter or pressing the direction key confirms. Escape = Run (attempt to move away, enemies get their turn).

**No turn consumed** by opening or navigating this menu. You can sit in the overlay as long as you want — combat is turn-based, not real-time. The pressure comes from the decision, not a timer.

### Layer 2: Inspect Panel (STATE.INSPECT)

**Trigger:** Player selects Inspect (down) from the combat overlay.

**Display:** A panel slides in from the right side of the screen. The combat overlay dims but remains visible (Escape peels back to it). The world is still faintly visible behind both layers.

The panel shows the **enemy's full loadout** — RuneScape-style equipment screen:

```
╔══════════════════════════════════╗
║  [Bandit]  HP: 35/50             ║
║  Disposition: -40  (hostile)     ║
╠══════════════════════════════════╣
║  EQUIPMENT                       ║
║  ┌─────┐ ┌─────┐ ┌─────┐       ║
║  │ Top │ │Front│ │Sides│       ║
║  │     │ │Chest│ │     │       ║
║  │     │ │plate│ │     │       ║
║  └─────┘ └──┬──┘ └─────┘       ║
║         ┌───┴───┐               ║
║         │Bottom │               ║
║         │ Boots │               ║
║         └───────┘               ║
║  Weapon: [Rusty Knife] 8 dmg    ║
╠══════════════════════════════════╣
║  LOOT (drop chance on kill)      ║
║  • Chestplate   55% survives    ║
║  • Rusty Knife  70% survives    ║
║  • 3x Bandage   90% survives    ║
╠══════════════════════════════════╣
║  [Enter] Select item             ║
║  [G] Give item to this NPC       ║
║  [Esc] Back to combat            ║
╚══════════════════════════════════╝
```

**Navigation:** Arrow keys move between equipment slots. Each slot shows: item name, stats, buy price (gold cost to purchase mid-combat), and drop chance (% probability the item survives if you kill the enemy instead of buying it).

**The decision at every slot:** "Do I spend 80g to guarantee this chestplate, or do I gamble on the 55% drop? If I buy it, the bandit's defense drops immediately — making the fight easier. But 80g goes to the Financier's ledger via the Gold Card."

### Layer 3: Item Action (STATE.ITEM_ACTION)

**Trigger:** Player selects an item slot in the Inspect panel and presses Enter.

**Display:** A small option box appears next to the selected item:

```
  Bandit's Chestplate
  Guard +5 | Durability: 3/5
  ─────────────────────────
  ↑ Buy (80g)        — your gold: 230
  → Use [Soap] on it — remove enchantment
  ← Compare to yours — you: [Leather Vest] Guard +3
  ↓ Back
```

**Options are contextual:**
- **Buy** always appears if you have enough gold. Price = item's base value × merchant-hostility multiplier (hostile enemies charge more than friendly merchants, but the option exists regardless).
- **Use [item] on it** appears if you have an item selected in your inventory (1-9) that has an interaction with equipment (soap removes enchantments, solvent reduces durability, etc.). The currently selected inventory item determines what appears here.
- **Compare** shows your equivalent slot's item side-by-side.
- **Back** returns to the Inspect panel.

**Buying consumes a turn.** The transaction happens, the enemy's equipment updates visually, and combat returns to Layer 1 with the enemy now weakened. The gold transfer goes through the Gold Card (all gold goes to Bank Street — the Financier's cut is automatic and invisible to the player, but visible in lore).

---

## Multi-Enemy Encounters

When multiple enemies are adjacent:

**Layer 1 (Combat Overlay):** A target selector appears at the top:

```
  ◄ [Ghost Fungus]  2/3  [Violet Fungus] ►
  
         ↑ Attack (Wooden Sword, 10 dmg)
  ← Defend              → Throw
         ↓ Inspect
         [Esc] Run
```

- Tab (or Q/E) cycles between adjacent enemies.
- The targeted enemy gets a pulsing gold border on the game map.
- Attack/Throw/Inspect all target the currently selected enemy.
- Defend is self-targeted (always protects you, not targeted).
- Run attempts to move away from ALL adjacent enemies.

**Layer 2 (Inspect):** Shows the currently targeted enemy's loadout. Tab still cycles targets from within the Inspect panel — the panel redraws with the new enemy's gear when you switch.

---

## Run Mechanics

**Escape from Layer 1 (Combat Overlay) = Run.**

- The player attempts to move one tile in the direction AWAY from the targeted enemy (opposite of the bump direction).
- If that tile is walkable and unoccupied: player moves, turn consumed, all adjacent enemies get their actions (they may chase).
- If that tile is blocked: run fails, "Can't run — blocked!" message, turn is still consumed (you tried and failed), enemies act.
- Running from multiple enemies: move away from the most recently bumped enemy. Other enemies still get their turns.

This is important: **Run is never free.** You always lose your turn to attempt it. Enemies always act after a run attempt. Running is a tactical retreat with a cost, not a free escape. The player who runs is choosing to take damage now in exchange for repositioning.

---

## Snappiness Requirements

Caelan's directive: "the options tree and the navigation of those keyboard shortcuts and options need to be snappy."

**Animation budgets:**
- Layer 1 slide-in: 80ms (already implemented, feels fast)
- Layer 2 slide-in: 100ms (panel from right side)
- Layer 3 option box: 60ms (small, fast)
- Layer peel-back (Escape): 50ms (faster than entry — closing should be snappier than opening)
- Target switch (Tab): 0ms transition, instant highlight change

**Input responsiveness:**
- Every input registers on keydown, not keyup. No input buffering during animations — if the player presses a key during a 100ms slide-in, the animation completes instantly and the input is processed. Never make the player wait for an animation to finish.
- Double-tap optimization: pressing Up twice in rapid succession from IDLE should bump + Attack without the player needing to wait for the overlay to fully animate. The overlay appears AND the attack resolves — the player sees the result, not the menu.
- Escape from any depth to IDLE: if the player mashes Escape 3 times quickly, all layers peel off in rapid succession (50ms each = 150ms total) and they're back to walking. No "are you sure?" prompts. No confirmation dialogs. Escape means escape.

**The PlayStation XMB reference (Caelan's "Grammy-winning PlayStation"):**
- Left/Right moves between CATEGORIES (Target selection, Equipment slots, Loot list)
- Up/Down moves between ITEMS within a category
- Enter selects, Escape backs out
- The cursor trails with a slight ease-out lag (30ms) that gives the interface weight without slowing it down
- Sound design: each cursor move gets a tiny tick sound. Each layer open gets a whoosh. Each Escape gets a softer reverse-whoosh. Audio is 50% of snappiness perception.

---

## Open Questions (for Gate 2)

1. **Does Inspect consume a turn?** Current spec says no — you can inspect for free, only buying/attacking consumes. This means the player can study every enemy for free before committing. Is that too generous? Alternative: first Inspect is free, subsequent Inspects consume a turn (representing "taking your eyes off the fight").

2. **Enemy pricing hostility multiplier.** How much more does a hostile enemy charge vs. a friendly merchant? Recommendation: hostile enemies charge 2× base value (they're not selling willingly — you're essentially bribing them to disarm). Friendly merchants charge 1× or less. This makes mid-combat buying expensive but available.

3. **What happens to bought equipment?** Goes directly into your inventory? Auto-equips if better than current? Or goes into a "purchased" holding area that you equip after combat? Recommendation: auto-equip if better (matches the existing auto-equip design pillar), otherwise goes to inventory.

4. **Can enemies buy YOUR equipment mid-combat?** The reverse transaction. An enemy inspects you, decides they want your sword, and offers gold (which goes to the Financier anyway). This is mechanically terrifying and narratively perfect — but the UI for "enemy is shopping your gear" is complex. Defer to a future "NPC commerce AI" feature.

5. **Alchemy on purchased items.** Caelan described buying a chestplate for 100g then using alchemy to break it down. Where does alchemy happen? In combat (Layer 3 option: "Break down")? Or only at the Library/a workbench? Recommendation: alchemy is an out-of-combat activity, like the Library. You buy in combat, break down at a station. This keeps combat decisions focused on "buy or gamble" without adding a third axis of "buy and immediately recycle."

6. **Loot survival chance visibility.** Does the player ALWAYS see drop chances, or only after Inspect? If always visible (in the combat overlay), combat becomes a spreadsheet. If only after Inspect, there's a tension between "spend a turn to learn" and "just fight." Recommendation: drop chances visible only in the Inspect panel (Layer 2). The information rewards curiosity.

7. **Run direction.** Currently spec'd as "opposite of bump direction." But what if the player bumped from the west and wants to run north? Should Run present a direction picker (like Throw)? Or always flee opposite? Recommendation: Escape runs opposite, but if blocked, the player gets a direction prompt for their retreat. This handles corners.
