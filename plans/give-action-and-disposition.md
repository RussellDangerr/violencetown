# Feature: Give Action + Disposition System
**Phase:** Phase 2 — Life in the City (follow-up to `feature/sewer-npc-skeleton`)
**Priority:** High (load-bearing for combat-as-conversation tone)
**Status:** Research (Gate 1)

> **Origin:** Idea surfaced 2026-05-21 during execution of `feature/sewer-npc-skeleton`. Caelan: "I think you should be able to trade an enemy in combat for an item that they're wearing or an item of lower value to change their disposition to the point where they will switch sides for you. Basically like a charm spell." Triggering reference: BG3's "bad deal raises merchant disposition" mechanic, applied to combat.

> **Connects to:** `plans/sewer-npc-skeleton.md` (the FSM scaffold this feature gates on). The disposition+preference fields will be stubbed into that ship's data; this feature adds the code that reads them.

> **Supersedes (in part):** The vaguer "reputation gates / archetypes" follow-up named in the sewer-NPC plan. This feature is a more concrete and player-facing version of that mechanic — disposition replaces the abstract "gate weight" with a number players can see and shift.

---

## Gate 1: Research & Discovery

### Genre References

1. **Baldur's Gate 3** — Merchant disposition rises when the player makes a bad deal (gives more than they receive). This inverts the usual capitalist logic and is one of BG3's most-loved unexpected mechanics. The core insight: disposition shift = *recipient's* perceived value of the gift, not market price. Players love it because it rewards generosity.

2. **Stardew Valley** — The cleanest preference-vector implementation in commercial games. Every villager has explicit loved / liked / neutral / disliked / hated item lists. Giving a loved item produces large affection swings; giving a hated one loses points. Proves that "different NPCs value different items" can be authored without exploding complexity — it's just a lookup table per archetype.

3. **Caves of Qud** — Faction reputation + gift system. You can buy your way into faction alliances by giving items the faction values (e.g., glass crafts to the Glassmakers, water to the Watervine Farmers). Subjective value pinned to faction identity. Demonstrates that gift-as-diplomacy scales to faction-level politics, not just per-NPC.

4. **Mount & Blade: Bannerlord** — Defeated enemies can be recruited into your warband. The mechanic is post-combat (after surrender) rather than mid-combat, but the verb is identical: turn an enemy into an ally through a transactional moment. Bannerlord's failure mode (recruits are unreliable and desert) is the right model — bribed allies should be hilariously fickle, not permanent upgrades.

5. **Disco Elysium** — Every named entity has independent feelings about you, surfaced through dialogue. Disposition isn't a single number but a vector across multiple axes (do they respect you, do they fear you, do they pity you). For Violencetown's combat-comedy tone, a single disposition number per NPC is sufficient; the Disco Elysium reference is here as a warning against scope creep into multi-axis tracking.

### Player Experience Goal

> "The funniest move in any fight should be the option you didn't think was a real option — paying a bandit to switch sides while his old crew watches in confusion. And you should know what it would cost before you do it."

### Technical Feasibility

**Affected modules:**
- `game/npc.js` (new in `feature/sewer-npc-skeleton`) — disposition field on the NPC class, `tickState` consults disposition when deciding HOSTILE → IDLE transition.
- `game/items.js` — new `Give` action type. Resembles `resolveThrow` but with a recipient-targeted, disposition-shift, and ownership-change instead of damage.
- `game/main.js` — UI integration for the give action (player selects item, selects adjacent NPC as target, confirms). Hover-preview overlay when item is selected and NPC is adjacent.
- `game/renderer.js` — disposition indicator over NPC heads (number, color swatch, or facial-expression sprite layer).
- `game/sewer-map.json` (and all future maps) — `disposition`, `values`, `flipThreshold`, `bribeable` fields per NPC.
- `game/data.js` — per-archetype default `values` vectors (Bandit values weapons, Fungus King values soap, Carrion values water, etc.). Per-instance overrides via map JSON.

**Known constraints:**
- Disposition shift must be deterministic given (giver, recipient, item) — no RNG. Players see a "+15" preview and giving the item must produce exactly +15, no wobble. This is the F.E.A.R. legibility principle: predictable systems read as fair.
- No save system exists; disposition resets on map reload, same as enemies/items. Persistent disposition is a separate future feature dependent on save/load.
- Mid-combat trade consumes a player turn (same as throw/use). NPCs react on their next turn.
- The hover-preview UI must be cheap to compute — runs every frame the player has an item selected and is adjacent to one or more NPCs.

**What already exists (or will, after `feature/sewer-npc-skeleton`):**
- The FSM whitelist pattern (`behavior: [...]`) — flipping a charmed NPC is "expand the whitelist to include allied behaviors and reverse the HOSTILE target filter."
- Item-use action pipeline in `items.js` — `Give` slots into this as a fifth use type alongside `selfUse`, `throw`, `melee`, (and the existing equip logic).
- Adjacency detection already runs for melee combat and chest-opening — can be reused for "what NPC am I next to?"

### Scope — Minimum Viable Feature

**In scope for first ship:**

- `Give` player action: when standing adjacent to an NPC, select an item from inventory and a "Give to [NPC name]" option appears in the item-use menu.
- Per-NPC `disposition: number` (-100 to +100, default -50 for hostile types, 0 for neutral, +50 for friendly).
- Per-archetype `values: { rock: 1, soap: 3, pipe: 8, bandage: 5, ... }` preference vectors stored in `data.js`. Per-NPC overrides allowed via map JSON.
- Disposition shift on give = `values[item_type] × shift_multiplier` (multiplier ~5 in early balancing).
- `flipThreshold: number` per NPC (default +30): when disposition ≥ flipThreshold, NPC's behavior whitelist gains `ALLIED` state and loses player from its hostile-target list.
- `ALLIED` FSM state (new) — same as HOSTILE but with a reversed target filter. Allies seek and attack the player's hostiles. They follow the player loosely (2-3 tile leash via greedy-step). They can be attacked back into HOSTILE if the player damages them.
- `bribeable: bool` per NPC (default true). Bribery-immune NPCs (Texas Beholdem, The Deity, named zealots) set this false and disposition is fixed regardless of gifts.
- **Hover-preview UI:** when the player has an item selected in their inventory and is adjacent to exactly one NPC, an overlay shows: "Give to Bandit — disposition +15 (current: -40, flip at: +30)." When the preview shift would cross the flip threshold, the line is highlighted: "+15 — FLIPS them!"
- Disposition indicator over each visible NPC's head: simple icon or color swatch (red/yellow/green). Hovering shows the number.

**Out of scope (explicit):**

- Multi-step trade UI (give 3 items at once, item-for-item exchange with merchants). Carrion's eventual trade interface is a separate feature; she uses the same `Give` mechanic but with `wants: [...]` shop logic on top.
- Disposition decay over time. First ship: disposition is permanent until shifted by another give-action or by damage. Decay can be added later.
- Multi-axis disposition (respect vs. fear vs. pity). Single scalar only.
- NPC-initiated trade. A bandit cannot walk up and offer you their sword in exchange for your help. Eventually possible; not this ship.
- Faction-level disposition. Bribing one bandit does not raise reputation with all bandits. Per-NPC only.
- Persistent disposition across map reloads — depends on save system.
- Allies that fight each other. Two NPCs the player has bribed may end up adjacent; for v1, they ignore each other regardless of original faction. Inter-NPC disposition is a future system.
- "Bidding war" — an enemy NPC offering items to one of your bribed allies to flip them back. Mechanically possible with this system but UX is complicated; defer.

### Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| **Bribery trivializes combat.** If every enemy is buyable, why ever fight? | High | (a) `bribeable: false` on zealots/bosses/cult enemies — narrative reason for the immunity. (b) `flipThreshold` scaled per NPC tier: bandit at +30, lieutenant at +60, boss at +200. (c) Subjective value: a bandit values weapons; you can't bribe him with the bandages he has zero use for. (d) Allies are unreliable — see next risk. |
| **Flipped allies are too powerful — a permanent free recruit.** | High | Allies follow on a leash (2-3 tiles) but the player can't issue tactical commands beyond "come along." They prioritize hostiles using their own FSM; they may aggro something the player wanted to skip. Damage from the player (even friendly fire) drops disposition fast and can re-flip them. Future feature: allies abandon you over time if you stop "paying" them. |
| **Hover-preview UI is computationally expensive.** Every frame, every adjacent NPC, every inventory item — that's a real combinatorial. | Medium | Compute lazily: only when the player has *selected* an item (one item, not all) AND is adjacent to exactly one NPC. Cache the preview across frames until either input changes. Worst case: 1 item × 1 NPC × disposition lookup per frame = trivial. |
| **Comedy-of-commerce tone requires polished log messages.** | Medium | Allocate explicit polish budget for the bark library: "Bandit pockets your pipe with great suspicion." "Fungus King: WHAT IS THIS WORTHLESS TRINKET, INSECT." Bad-deal moments need their own bark category. |
| **Players will exploit subjective value vs. objective value.** Buy cheap items, gift to high-preference NPCs for outsized disposition shifts. | Low | This is intended. The game is *about* finding what each NPC wants. If the player figures out that the Fungus King's miners flip for 1 unit of soap each, that's a discovered exploit and it's funny — congratulations, you've established a soap monopoly in a single zone. |

---

## Open Questions (For Gate 2)

1. **Decay or no decay?** Should disposition slowly drift back to its baseline over time (turns? real time? on map transition?), or stay where the last action put it? Decay creates pressure for repeated bribery but adds bookkeeping; no-decay is simpler and arguably funnier (the bandit who took your chestplate three hours ago is still loyal).

2. **What counts as "damaging" a flipped ally?** Direct attacks definitely. Friendly-fire from throws? Stepping on them with movement (probably not damage; probably just push)? Letting them die to an enemy (does the *failure to protect* drop disposition, or is that out-of-scope)?

3. **Inter-NPC trade.** If miners give soap to the King's chest, is that a `Give` event with the chest as the recipient? Or are containers different from NPCs in the type system? The unification is conceptually clean but might be over-engineering for v1. Recommend: same primitive, container is just an NPC with `behavior: []` (no states, no agency) and infinite `disposition` (gives don't matter).

4. **Visible disposition indicator: number, color, or expression?** A number is most legible but ugliest. A color swatch (red/yellow/green) reads instantly but is coarse. A facial-expression sprite layer is the most charming and the most expensive. Suggest: ship with color swatch + on-hover number, add expression sprites in a later polish pass.

5. **Default values per archetype.** Need to author the preference vectors for: Bandit, Wererat, Fungus King, Violet/Red/Ghost Fungus, Carrion, Texas Beholdem, Sewer Monster. This is content-design work, not engineering — needs a design pass before Gate 2 closes.

6. **Does giving a chest the same item raise the *chest's* disposition?** Trick question — chests don't have agency, so no. But the King's chest accumulates items; does the King's disposition rise as his chest fills? That would mean "tributing to a hierarchy" is a real reputation move, and a player could buy off the Fungus King by enriching his miners' deposits. Hilarious. Worth considering.

7. **Bribing your own allies (raising disposition above the flip threshold from already-positive).** Does that do anything? Probably: it makes them more loyal (harder to re-flip by enemies, willing to take more damage before turning). Could be a depth knob.

8. **Can you bribe Carrion the dehydrated-zombie merchant into giving you free goods?** She's a merchant — her flip behavior is "offers a discount" rather than "fights for you." This suggests the flip-action shouldn't be hardcoded to "becomes an ally"; it should be per-NPC, an `onFlip: "becomeAlly" | "offerDiscount" | "openSecretShop" | ...`. Significant scope item for Gate 2.

---

## Schema additions (stubbed into `feature/sewer-npc-skeleton`)

To keep this feature purely additive code when it ships, the following fields will be added to NPC entries in `sewer-map.json` as part of the current sewer-NPC build. The code that reads them comes in this feature.

```json
{
  "id": "e6", "type": "Fungus King",
  // ... existing fields ...
  "disposition": -80,
  "flipThreshold": 200,
  "bribeable": true,
  "values": { "soap": 20, "rock": 3, "pipe": 5, "bandage": 1 },
  "onFlip": "becomeAlly"
},
{
  "id": "e1", "type": "Violet Fungus",
  // ... miner fields ...
  "disposition": -30,
  "flipThreshold": 25,
  "bribeable": true,
  "values": { "soap": 8, "rock": 5, "bandage": 4, "pipe": 6 }
},
{
  "id": "carrion", "type": "Carrion",
  // ... existing fields ...
  "disposition": 10,
  "flipThreshold": 40,
  "bribeable": true,
  "values": { "water": 30, "bandage": 12, "soap": 8 },
  "onFlip": "offerDiscount"
}
```

(Note: `water` is not yet an item; placeholder for future content. The `values` map can contain item types that don't currently exist — they simply never trigger.)
