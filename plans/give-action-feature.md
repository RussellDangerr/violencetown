> **SUPERSEDED 2026-09-01** by `plans/unified-offer-screen.md`. The schema and UI described below
> (`shopInventory`, `buyMultiplier`, `tradeThreshold`, `ITEM_GIVE_DIR`, Down-to-Give) were never
> built and have been abandoned. What actually shipped is the unified offer screen: one verb, *make
> an offer*, with two trays and signed gold. Kept for the design reasoning, not as a description of
> the code.

# Feature: Give Action + Disposition (Phase A)
**Phase:** Phase 2 — Life in the City (follow-up to `feature/sewer-npc-skeleton`)
**Priority:** High
**Status:** Design (Gate 2)

> **Gate-1 reference:** `plans/give-action-and-disposition.md`. This doc is the engineering blueprint, not the design pitch. Read Gate-1 first for the *why*.

> **Canon reference:** `plans/cosmology-and-arc.md`. Disposition is the runtime expression of the cosmology — it's how the player's identity and choices ripple through every NPC's reaction.

---

## Phased rollout

The Gate-1 doc scoped a feature with both *bribery-as-neutralization* and *bribery-as-recruitment* (active allies that fight for you). This doc splits into two ships:

- **Phase A (THIS feature, `feature/give-action`):** Give action exists. Disposition shifts. When disposition crosses threshold, the NPC is *neutralized* — HOSTILE is removed from their behavior whitelist, they stop attacking the player. They do not actively help. Bribery-immune NPCs (`bribeable: false`) reject the offering visibly. Carrion (`onFlip: "offerDiscount"`) gains a discount-mode flag for the future merchant interface.
- **Phase B (`feature/active-allies`, future):** ALLIED FSM state actively follows the player at a leash, attacks the player's hostiles. Damage from the player can flip them back to HOSTILE. Hover-preview UI shows would-be-shifts before committing.

Splitting at "neutralization vs active recruitment" gives a clean MVP that's *useful in its own right* (defusing fights with bribery is meaningful gameplay even without recruits) and lets the harder UX work (preview UI, ally pathfinding, target filters) ship as its own focused feature.

---

## Gate 2 Design

### System Design

**Two pure functions** (no side effects on the world other than mutating the recipient NPC):

```js
// give-action.js

export const SHIFT_MULTIPLIER = 5;

// Returns { shift, newDisposition, wouldFlip } for a hypothetical give.
// Used by the eventual hover-preview UI (Phase B). Pure.
export function previewGive(item, recipient) { ... }

// Mutates recipient. Returns { accepted, flipped, log }.
// accepted: false means recipient rejected (bribeable:false).
// flipped: true means disposition crossed flipThreshold and onFlip fired.
export function applyGive(item, recipient) { ... }
```

**Disposition shift formula:**

```
shift = (recipient.values[item.id] ?? 0) * SHIFT_MULTIPLIER
newDisposition = (recipient.disposition ?? 0) + shift
wouldFlip = newDisposition >= (recipient.flipThreshold ?? 30)
```

Example: Player gives soap to Fungus King.
- King's `values.soap = 20`. Shift = 20 × 5 = 100.
- King's disposition was -80. New disposition = +20.
- King's flipThreshold = 200. wouldFlip = false (not nearly enough).
- The King accepts the soap; disposition rises significantly; still wants to kill you. The player learns through experimentation that the King is *very expensive* to flip.

Example: Player gives bandage to Carrion (low value but she's near-friendly already).
- Carrion's `values.bandage = 12`. Shift = 12 × 5 = 60.
- Carrion's disposition was +10. New disposition = +70.
- Carrion's flipThreshold = 40. wouldFlip = true.
- Carrion flips — `onFlip: "offerDiscount"` fires, `_discountMode = true` set on her instance. Phase B's merchant UI will check this flag.

**`applyFlip` handler:**

```js
function applyFlip(recipient) {
    switch (recipient.onFlip) {
        case 'becomeAlly':
            // Phase A: just remove HOSTILE from the whitelist.
            // The NPC's FSM dispatch in enemies.js will see no HOSTILE,
            // so they stop attacking. They stand in IDLE.
            // Phase B will add ALLIED to the whitelist for active behavior.
            recipient.behavior = (recipient.behavior || ['HOSTILE'])
                .filter(s => s !== 'HOSTILE');
            recipient.state = 'idle';   // reset legacy chase state
            recipient.fsmState = null;  // force FSM re-init on next tick
            break;
        case 'offerDiscount':
            recipient._discountMode = true;
            // No FSM change — Carrion was never hostile to begin with.
            break;
        default:
            // Unknown onFlip — no-op. Logs a dev warning once.
            console.warn(`[give-action] Unknown onFlip "${recipient.onFlip}" on ${recipient.id}`);
    }
}
```

### Integration Map

```
main.js
  ├─ _openItemOverlay()             ← add "Give" option for Down when adjacent NPC exists
  ├─ _pickOverlay('down')           ← route to ITEM_GIVE_DIR state
  └─ _doGive(dir) (NEW)             ← resolve recipient, call applyGive, emit log

give-action.js (NEW)
  ├─ previewGive(item, recipient)   ← pure; used by Phase B hover-preview
  ├─ applyGive(item, recipient)     ← mutates recipient; returns result
  └─ applyFlip(recipient)           ← internal; routes onFlip behavior

enemies.js / npc.js                 ← no code changes for Phase A
                                      (the behavior-whitelist mechanic already
                                      handles HOSTILE removal correctly — the
                                      FSM dispatch routes flipped NPCs through
                                      npc.js, which sees no HOSTILE in whitelist
                                      and leaves them in IDLE)

renderer.js                         ← no changes for Phase A
                                      (disposition indicator over NPC heads is
                                      a Phase B polish)
```

The cleanest piece of this design: **Phase A requires zero changes to npc.js or the FSM**. The behavior-whitelist primitive we built last feature *already* expresses "this NPC can/can't be hostile." Flipping just modifies the whitelist. The FSM cycles through its existing transitions and naturally produces non-hostile behavior. This is the whitelist primitive paying off exactly as designed.

### Data Schema

**No new map JSON fields.** All required fields were stubbed in feature/sewer-npc-skeleton:
- `disposition: number`
- `flipThreshold: number`
- `bribeable: boolean`
- `values: { [item_id]: number }`
- `onFlip: 'becomeAlly' | 'offerDiscount' | ...`

This is the whole point of the stub-now-wire-later pattern from Gate-1.

**New runtime field:**
- `recipient._wasFlipped: boolean` — set true when the NPC first flips. Prevents repeated flip-bark spam if the player keeps giving past the threshold.
- `recipient._discountMode: boolean` — set true on Carrion-style flips. Read by future merchant UI.

### UI/UX Specification

**Item-use overlay (existing flow):**

Player presses `4` to select soap → presses Space → overlay appears with four directional options. Existing options:
- Up: Use (drink/apply/use)
- Right: Throw
- Left: Smash (only if adjacent enemy exists)
- Down: *(was reserved)*

**New for this feature:**
- Down: **Give** — only shown if an adjacent NPC exists. Label is "Give" or "Give to [X]" if exactly one NPC is adjacent.

**On selecting Give:**
- If exactly one adjacent NPC: skip direction-pick step, apply give immediately. Cleaner UX when there's no ambiguity.
- If multiple adjacent NPCs: enter `ITEM_GIVE_DIR` state, show direction prompt (like Throw). Player picks direction. Game finds NPC at `(playerX + dir.dx, playerY + dir.dy)`.

**Log messages:**

| Scenario | Log line |
|---|---|
| No recipient at chosen tile | `[No one there to give to.]` |
| `bribeable: false` | `[The {type} ignores your offering.]` |
| Accepted, no flip | `[The {type} pockets the {item.name}. Disposition +{shift}.]` |
| Accepted, flipped (becomeAlly) | `[The {type} pockets the {item.name} — they stop snarling at you.]` |
| Accepted, flipped (offerDiscount) | `[Carrion sips the {item.name}. "...much obliged. I'll work you a deal next time."]` |

The disposition number is *visible* in the log, satisfying the Gate-1 legibility goal at the cheapest UI cost. A proper visual indicator (number over NPC's head, color swatch) is Phase B.

**Item consumption:** The given item is *consumed* from the player's inventory (single unit, like Throw). Not stored on the recipient in Phase A. If the player gives 3 soap, they give 1 (the action consumes one item, not the whole stack). The recipient doesn't "carry" what they receive; the gift is purely a disposition-modifying event.

### Save/Load Impact

None for Phase A. No save system exists yet. On map reload, all disposition shifts and flips reset to spawn-data values. Persistent disposition is on the list of save-system-dependent future features.

### Edge Cases

1. **Player gives an item the NPC doesn't value.** `values[item.id]` is undefined → `?? 0` → shift = 0. Log: "[The Bandit pockets the soap. Disposition +0.]" Awkward but correct. Polish-pass option: write a "they don't seem to care" branch when shift = 0.
2. **Player gives an item to a bribery-immune NPC.** `bribeable: false` → log rejection, item is NOT consumed, no disposition change. (The player keeps the item — they tried to bribe, the NPC refused.)
3. **Multiple adjacent NPCs, player picks direction with no NPC.** Log: "[No one there to give to.]" Item NOT consumed. Turn NOT advanced. Player can retry.
4. **NPC is in legacy chase mode (no `behavior` field).** `applyFlip` sets `behavior = ['ALLIED']` (was null, filter([HOSTILE]) returned []; then default has ALLIED... wait, this needs care). Resolution: legacy enemies (no behavior field) become FSM-controlled on flip. `behavior` becomes a fresh array with HOSTILE-removed. The legacy chase code stops firing for them. They become IDLE. This is correct — a flipped bandit is now in the FSM dispatch path.
5. **Player gives to an NPC that's already flipped.** `_wasFlipped` was already true. Disposition still shifts (becomes more loyal). No second flip-bark. Optional polish: emit "[They smile.]" or similar.
6. **Player gives to themselves.** Impossible — adjacency check requires another entity. Down-direction option simply won't appear if no adjacent NPC.
7. **Player gives a weapon they're wielding.** The wielded weapon is `equipment.weapon`, separate from inventory. Inventory items are what the give flow accesses. The wielded weapon can't be given. (Unequipping is a separate flow; out of scope.)
8. **Two NPCs share a tile.** Cannot happen — the pathfinding occupancy check prevents NPCs from co-occupying tiles. If somehow it does (bug), the `find()` call returns the first match.
9. **NPC dies after disposition shifted but before flip-on-next-turn.** Disposition is just a number; dying clears the NPC. No leak. The `_wasFlipped` flag dies with them.
10. **Player gives to Carrion (already friendly).** Disposition is already +10. Shift +60 makes it +70 (past threshold of 40). She flips with offerDiscount. Subsequent gives shift disposition more but don't refire the flip. Correct behavior.

### "Done When"

A concrete play-scenario that proves the feature works end-to-end:

1. Player walks into the soap-mine region. Two Violet Fungus miners are working. Player selects soap from inventory.
2. Player presses Space — overlay appears. Down direction labeled "Give." (Workers are adjacent or in range.)
3. Player presses Down → selects nearest adjacent Violet Fungus.
4. Log: "[The Violet Fungus pockets the soap. Disposition +40.]" Soap consumed from inventory.
5. Player gives another soap. Log: "[The Violet Fungus pockets the soap — they stop snarling at you.]" Disposition crosses flip threshold; `_wasFlipped = true`; HOSTILE removed from behavior.
6. Player walks away. The flipped Violet Fungus does NOT chase. It continues wandering/working in the soap-mine region but no longer treats the player as threat.
7. Other Violet Fungus (not given to) is unchanged — chases / works as before.
8. Player tries to give soap to the Fungus King. Log: "[The Fungus King pockets the soap. Disposition +100.]" King's disposition was -80, now +20. Still well below his threshold of 200. He's now *less* angry but still attacks. The player has learned: the King is expensive.
9. Player tries to give bandage to Carrion (water is unavailable, bandage is her second-favorite). Log: "[Carrion sips the bandage. ...much obliged. I'll work you a deal next time.]" Disposition rises past threshold. Discount mode is set (visible in dev tools; not yet used by anything). She's now "extra friendly" — visible in future merchant UI.

If all of those work cold-boot, the feature ships.

---

## Implementation Order

Each step leaves the game in a playable state. No big-bang merges.

1. **`game/give-action.js`** (new file) — `previewGive`, `applyGive`, `applyFlip`. Pure functions. Exported. Commit: `feat(give-action): disposition shift + flip logic (data layer)`.
2. **Wire `Give` into the item-use overlay** in `main.js`. Add ITEM_GIVE_DIR state, `_doGive(dir)` handler, conditional Down-option in `_openItemOverlay`. Commit: `feat(give-action): Give option in item overlay`.
3. **Smoke-test the Carrion case** — adjust her or the offered item if her disposition / threshold balancing reveals issues. Commit only if balancing changes are needed.

Phase A ships at step 2. Subsequent polish (clearer messages, hover preview, allied behavior) is Phase B and beyond.

---

## Files referenced

- `plans/give-action-and-disposition.md` — Gate-1 research
- `plans/cosmology-and-arc.md` — narrative canon: disposition's role in the cosmology
- `plans/sewer-npc-skeleton.md` — the prior feature that stubbed the disposition data fields
- `game/sewer-map.json` — disposition data lives on each NPC entry
- `game/main.js` — item-use overlay; the entry point for the Give action
- `game/items.js` — item definitions; read for item names/ids in the give flow
- `game/enemies.js` — the FSM dispatch already routes flipped NPCs correctly without modification

---

## Pending decisions (not blocking Phase A ship)

- **Hover-preview UI** — what does it actually look like in canvas? Phase B design call.
- **Disposition decay** — does it drift back to baseline over time? Currently locked at "no decay" for Phase A; revisit if playtest reveals stickiness issues.
- **Active ally behavior** — ALLIED FSM state mechanics. Phase B feature.
- **Bribed allies turning back** — does a hostile bandit re-bribing your ally flip them back? Phase B at earliest.
