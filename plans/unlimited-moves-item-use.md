# Feature: Unlimited Moves for Throwing & Item Use
**Phase:** Combat Integration — applies from Sewer (Act 2) onward
**Priority:** High
**Status:** Research

> **Design Rationale:** Throwing and item use should be **free actions** — they do not consume the player's turn. This drives interaction before committing to a movement, creating richer tactical decisions per turn. Pixel Dungeon does this: using potions, throwing items, and reading scrolls don't end your turn. The player can throw a pepper bomb, use a bandage, AND then move — all in one turn.

---

## Gate 1: Research & Discovery

### Genre References

1. **Pixel Dungeon (Shattered)** — Using items (potions, scrolls) and throwing items are free actions. Only movement and melee attacks end the turn. This means the player can set up elaborate combos: throw a potion of paralytic gas, use a scroll of rage, THEN step into the fray. Item use as free action creates depth without adding complexity to the turn structure.

2. **Caves of Qud** — Some actions cost a full turn, others are "free" (toggling abilities, swapping gear). The distinction between free and turn-consuming actions is a core tactical lever. Players learn to front-load free actions before committing their move.

3. **DCSS (Dungeon Crawl Stone Soup)** — Quaffing potions and reading scrolls cost a turn, but throwing is a distinct action. The contrast with Pixel Dungeon's model shows there's design space in either direction. We choose Pixel Dungeon's model because it matches Violencetown's "environment IS your moveset" philosophy — more free interactions = more environmental engagement.

4. **Into the Breach** — Certain actions (repairing, using items) don't consume the mech's movement. This creates "bonus action" moments that feel rewarding and encourage creative play.

5. **Brogue** — Throwing is a full action, but items can be used without movement. Hybrid approach.

### Player Experience Goal

"Before you commit to moving, you can set the stage — throw a frying pan, chug a bandage, toss a smoke bomb. The turn is your move. Everything else is preparation."

### Technical Feasibility

**Affected Modules:**
- `player.js` — Action queue needs to distinguish between **free actions** (throwing, item use) and **turn-consuming actions** (movement, attack, wait). Free actions resolve immediately without advancing the turn.
- `main.js` — Turn resolution must allow multiple free actions before processing the turn-consuming action. The turn doesn't advance until a movement/attack/wait is committed.
- `ui.js` — Action Preview tree needs to show free actions as always-available options alongside movement options, visually distinct from turn-consuming choices.

**Known Constraints:**
- Free actions must still resolve in sequence (can't throw two items simultaneously)
- NPCs should NOT get free item use — keeps the system simple and gives the player an advantage that feels earned (or: NPCs get their own free actions as a future enhancement)
- The Action Preview tree already branches — free actions add branches that don't collapse the tree (you can still move after using an item)

**Interaction with ABC Decision Matrix:**
- **Category 1: 1B (Pixel Dungeon Hybrid)** is LOCKED per `adventure-transition-plan.md`. Free actions resolve instantly. World doesn't advance. Move when ready. This is exactly Pixel Dungeon's model, and it is exactly what this brief is built on.

### Scope — Minimum Viable Feature

**In scope:**
- **Throwing items** is a free action: select item from inventory, select target tile, item is thrown. Does not end the turn.
- **Using items** is a free action: use a consumable (bandage, matches, etc.). Does not end the turn.
- **Picking up items** is a free action: grab an item from the current tile without consuming movement.
- Player can perform multiple free actions per turn (throw + use + pickup, then move)
- Free actions resolve immediately and update the game state before the turn-consuming action

**Out of scope for this pass:**
- NPC free actions (NPCs still get one action per turn, period)
- Crafting as a free action (TBD — may be free or may consume a turn)
- Environmental interaction (shoving furniture) — TBD, likely turn-consuming since it involves physical displacement
- Equipping/swapping gear mid-turn (TBD)

### Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Degenerate combos** — player throws 10 items then moves | Medium | Natural limit: inventory size. You can only throw what you're carrying. If needed, add a soft cap (e.g., 2-3 free actions per turn) but start uncapped and playtest. |
| **Action Preview complexity** — tree becomes too wide with free actions always available | Medium | Visually separate free actions from movement options. Free actions sit in a persistent sidebar/panel, not in the branching tree. Or: tree shows free actions as a "pre-step" layer before movement branches. |
| **Pacing disruption** — turns take too long if player agonizes over free actions | Low | Enemy pressure naturally limits deliberation. Free actions are fast to execute — select and confirm. |

---

## Action Classification

### Free Actions (do not consume turn)
| Action | Notes |
|--------|-------|
| **Throw item** | Select from inventory → select target tile → resolve |
| **Use item** | Consume a consumable (bandage, food, etc.) |
| **Pick up item** | Grab item from current tile into inventory |
| **Drop item** | Remove from inventory, place on current tile |

### Turn-Consuming Actions (end the turn, advance the turn counter)
| Action | Notes |
|--------|-------|
| **Move** | Step to adjacent tile (NESW + diagonals) |
| **Melee attack** | Attack adjacent tile (or move-into-occupied-tile) |
| **Wait** | Explicitly skip turn |
| **Shove/environmental** | Physical displacement of objects (TBD — may change) |

### TBD (decide during Gate 2)
| Action | Leaning toward |
|--------|---------------|
| **Crafting** | Free action (encourages experimentation) |
| **Equip/swap gear** | Free action (Pixel Dungeon allows this) |
| **Open/close doors** | Turn-consuming (positional significance) |
| **Barricade** | Turn-consuming (significant tactical action) |

---

## How This Changes the Action Preview

**Before (one action per turn):**
```
Turn options:
├── Move N
├── Move S  
├── Move E
├── Move W
├── Attack (if adjacent enemy)
├── Pick up item
├── Use item
└── Wait
```
All options are mutually exclusive. Pick one, turn ends.

**After (free actions + turn-consuming action):**
```
Free actions available (do any/all before moving):
├── Throw [Frying Pan] at tile (3,2)
├── Use [Bandage] (heal 15 HP)
├── Pick up [Crowbar] from ground
└── Drop [Broken Bottle]

Then choose your turn action:
├── Move N
├── Move S
├── Move E
├── Move W
├── Attack Bandit (E)
└── Wait
```
Free actions are a preparation layer. The turn-consuming action is the commitment.

---

## Open Questions (For Gate 2)

- Should there be a soft cap on free actions per turn? (Start uncapped, playtest)
- Does throwing provoke NPC reactions before your move resolves? (Probably not — everything resolves at turn end)
- Can you throw an item you just picked up in the same turn? (Yes — that's the fun part)
- How does this interact with the Smooth Talker creature? Is dialogue a free action?
- Should NPC free actions be a future enhancement for boss-tier enemies?
