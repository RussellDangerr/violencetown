> **SUPERSEDED 2026-09-01** by `plans/unified-offer-screen.md`. The schema and UI described below
> (`shopInventory`, `buyMultiplier`, `tradeThreshold`, `ITEM_GIVE_DIR`, Down-to-Give) were never
> built and have been abandoned. What actually shipped is the unified offer screen: one verb, *make
> an offer*, with two trays and signed gold. Kept for the design reasoning, not as a description of
> the code.

# Feature: Economy & Merchants — Subjective Value Trade
**Phase:** Phase 2 — Life in the City (extends `feature/give-action-and-disposition`)
**Priority:** High (economy is the connective tissue between items, NPCs, and zone identity)
**Status:** Research (Gate 1)

> **Origin:** Gap analysis against early CRPG wiki structures (Arena, Battlespire, Redguard). Every one shipped with a Buying and Selling guide. Violencetown already has the mechanical foundation — the give-action's per-NPC `values` vectors ARE a subjective price system — but there's no trade UI, no merchant inventory, no currency formalization.

> **Connects to:** `plans/give-action-and-disposition.md` (the disposition/bribery system this extends — merchants are NPCs whose `onFlip` is `"offerDiscount"` or `"openShop"`), `plans/ground-items-inventory.md` (items need somewhere to come from besides ground loot), `plans/game-zones.md` (each zone's economy is shaped by its element and scarcity), `plans/cosmology-and-arc.md` (moonblock/sunblock is the central economic plotline).

> **Design DNA constraint:** Value in Violencetown is **subjective**. What an item is worth depends entirely on who you're trading with. Soap is worthless on Street but priceless in the Sewer. Water is nothing to a vampire but everything to Carrion. This is already encoded in the give-action's `values` vectors. The economy formalizes it without flattening it into a universal price table.

---

## Gate 1: Research & Discovery

### Genre References

1. **Caves of Qud** — Barter system with faction-valued currencies. Water is the universal medium of exchange, but different factions also accept faction-specific trade goods (glass crafts, artifacts, etc.). The insight: a "universal currency" can coexist with subjective value if the universal currency is itself a scarce resource with gameplay implications. In Violencetown, gold fills this role — but gold increases Boredom on Street, making it a cursed currency. You want gold for trade but hate holding it.

2. **Stardew Valley** — Different merchants stock different goods at different prices. Pierre sells seeds; Krobus sells void items; the Traveling Cart has random rare stock at inflated prices. Each merchant has a personality expressed through their inventory and pricing. Proves that 5-6 distinct merchants with curated stock lists feel like a full economy. Violencetown has 5 zones and ~5-6 merchant-candidates already designed (Carrion, street vendor, circus barker, factory quartermaster, graveyard keeper, Jersey's diner counter).

3. **Recettear** — The insight is that merchants have their OWN economies. They buy low and sell high. They have stock they need to move and items they need to acquire. A merchant who needs soap will pay more for soap. This is literally the `values` vector — each merchant's willingness to pay is already encoded.

4. **Sunless Sea** — Port-to-port trade where knowledge of what each port wants is the skill. Buy mushroom wine in Venderbight, sell it in the Iron Republic. The player's understanding of the trade network IS the progression (Outer Wilds principle applied to economy). In Violencetown, understanding that the Sewer values soap and the Circus values Fun items is the same kind of geographic trade knowledge.

5. **Baldur's Gate 3** — The "bad deal raises merchant disposition" mechanic that inspired the give-action. BG3 proves that letting players overpay is a valid player expression — generosity as a social strategy. The give-action already does this; the economy formalizes the other direction (selling, buying, price negotiation).

6. **Mother 3** — The currency shifts across the game. Early chapters use barter; Chapter 4 introduces money and the world changes. The arrival of money is itself a plot point. In Violencetown, the vampires' economic control IS the antagonist's weapon — the moonblock scheme is economic warfare. The economy isn't just a system; it's a narrative.

### Player Experience Goal

> "Every zone has its own currency-of-desperation. Soap in the Sewer, water for Carrion, sunblock on the Street. Gold works everywhere but it's making you boring. The best trades are the ones where you know what someone wants before they say it."

### Technical Feasibility

**Affected modules:**
- `game/items.js` — Items need `baseValue: number` (gold equivalent for sell-back purposes), `tags: []` (for merchant stock filtering). Both largely exist already; `baseValue` may need to be added.
- `game/npc.js` — Merchant NPCs need: `shopInventory: []` (list of item types they sell, with stock counts), `buyList: []` (item types they'll buy), `priceMultiplier: number` (zone scarcity modifier). The existing `values` vector from the give-action spec handles willingness-to-buy; `shopInventory` handles what they sell.
- `game/ui.js` — Trade UI panel. When the player interacts with a merchant NPC (`[E]` on adjacent tile after disposition threshold), a trade panel opens. Left side: player inventory. Right side: merchant inventory. Price shown for each item. Confirm to execute trade.
- `game/main.js` — Gold tracking. `player.gold: number`. Gold pickup from ground, gold from selling items, gold spent on buying. Gold displayed in status panel.
- `game/data.js` — Per-zone scarcity tables (what's rare where), merchant archetype definitions, item `baseValue` assignments.
- `game/renderer.js` — Merchant indicator (a `$` or shop icon over NPC heads when disposition is above trade threshold).

**Known constraints:**
- The give-action's `values` vector is per-NPC, not per-merchant-class. This is correct — each merchant has individual preferences. But it means merchant pricing can't be centralized; it's always an NPC-level lookup. This is fine for 5-6 merchants but would need refactoring for 50+.
- No save system — merchant stock resets on reload. Same as all other NPC state. Acceptable for now.
- The trade UI must be simple enough to execute in one tick. If trading takes multiple ticks (browsing, selecting, confirming), the tick timer needs to pause during trade mode — same as the journal panel.
- Gold as Boredom fuel (the Town mechanic) means the player is incentivized to spend gold as fast as they earn it. This is good — it creates velocity in the economy. But it means merchants need things worth buying, or gold just converts to Boredom with no outlet.
- Item scarcity must be real. If soap spawns freely on the ground in the Sewer, buying soap from a merchant is pointless. Merchants sell what the *ground* doesn't provide — or they sell convenience (higher quality, guaranteed availability, curated selection).

**What already exists:**
- Per-NPC `values` vectors (designed in give-action spec, stubbed into sewer-map.json). This IS the buy-side price system.
- `onFlip: "offerDiscount"` designed for Carrion — the first merchant behavior is already specced.
- Item definitions in `data.js` with `damage`, `heal`, `fuel` values. Need `baseValue` added.
- Ground item spawn system with biome-weighted loot tables. Merchant inventories are a parallel loot source with curated instead of random selection.
- Disposition threshold system — merchants "open" when disposition crosses `flipThreshold`. The give-action spec already designed this: you bribe a merchant into being willing to trade.

### Scope — Minimum Viable Feature

**In scope for first ship:**

**Currency:**
- `player.gold: number` — gold is the universal medium. Earned by selling items, found on ground (gold coins as a new ground-loot item type), dropped by defeated enemies.
- Gold display in the status panel (always visible).
- On Street: gold passively increases the Bored gauge. The more gold you hold, the faster Boredom accumulates. This creates a pressure to spend.
- Gold coins on the ground in Town are a trap: picking them up is instinctive but makes your Boredom problem worse. (Connects to the existing game-zones.md design: "Coins appear on the ground as your money increases... they're a trap disguised as loot.")

**Merchants (NPC subtype):**
- Merchant NPCs are regular NPCs with additional fields:
  ```
  "shopInventory": [
    { "type": "bandage", "stock": 3, "sellPrice": 15 },
    { "type": "soap", "stock": 2, "sellPrice": 40 }
  ],
  "buyMultiplier": 0.5,
  "tradeThreshold": 20
  ```
- `shopInventory` — what the merchant sells, with stock counts and prices.
- `buyMultiplier` — fraction of `baseValue` the merchant pays when buying from the player. Modified by the `values` vector: if the merchant has a high `values` entry for an item type, their buy price goes up proportionally. Buy price = `baseValue × buyMultiplier × (1 + values[type] / 10)`.
- `tradeThreshold` — minimum disposition to open the trade panel. Below this, the NPC won't trade (but can still receive gifts via the give-action to raise disposition toward the threshold).
- When player presses `[E]` adjacent to a merchant above `tradeThreshold`: trade mode activates instead of the regular interact.

**Trade UI:**
- DOM overlay (like the journal panel). Tick timer pauses during trade.
- Two columns: Player Inventory (left), Merchant Stock (right).
- Each item shows: name, player's gold, price to buy (from merchant) or sell price (to merchant).
- Buy: click item in merchant column → gold decreases, item moves to player inventory, merchant stock decreases.
- Sell: click item in player column → gold increases, item removed from player inventory.
- "Close" button or `[Escape]` exits trade mode, tick resumes.
- Sell price visible per item accounts for the merchant's subjective `values` preference: if Carrion values water at 30 and her `buyMultiplier` is 0.5, selling her water gives you `baseValue × 0.5 × (1 + 30/10) = baseValue × 2.0` — she's paying DOUBLE base price for water because she's desperate for it. This is the BG3 "bad deal raises disposition" mechanic inverted: the merchant's desperation raises the price they'll pay.

**Zone-Scarcity Pricing:**
- Items have a `baseValue` in `data.js` (universal reference price).
- Merchant sell prices are authored per-merchant (not computed). Each merchant's stock is hand-curated with prices that reflect zone scarcity.
- The player discovers that soap costs 5 gold from a Street vendor but Sewer merchants don't sell it at all (because they don't have it — they WANT it). Selling soap to a Sewer NPC via the give-action earns disposition, not gold. Selling soap to Carrion earns gold AND disposition (because she's a merchant with a `values` entry for soap).
- This teaches geographic trade knowledge: buy cheap on Street, sell (or gift) dear in the Sewer.

**First Merchants (MVF):**
1. **Carrion** (Sewer) — Already designed. Trades when disposition ≥ 40. Buys: water (premium), bandages, soap. Sells: sewer scrap, glow-moss (new consumable, lights dark tiles), mystery meat (heals but with a sludge side-effect).
2. **Jersey's Diner Counter** (Street) — Buy food items (heals), coffee (speeds up next tick — stretch). Jersey himself doesn't man the counter; it's a background NPC or an interactable object. Simple fixed-price menu.
3. **Stretch: Circus Barker** (Circus) — Sells Fun items (balloon animals, cotton candy, tickets). Buying from them raises Fun gauge. The prices are outrageous and that's the joke.

**Out of scope (explicit):**

- Merchant restocking. Stock depletes and stays depleted (until reload, when everything resets). Restock-on-timer is a future feature.
- Dynamic pricing (prices change based on supply/demand). All prices are authored and static.
- Player-to-player trade or multiplayer economy.
- Haggling / price negotiation UI. First ship: prices are take-it-or-leave-it.
- Crafting with purchased materials. Buying components is in scope; combining them is the crafting feature.
- Auction house, marketplace, or any centralized trade hub.
- NPC-to-NPC trade (NPCs buying from each other to simulate an economy). The FSM's WORKING state (miners depositing soap) is a visual hint of NPC economic activity, but there's no actual value exchange between NPCs.
- Moonblock/sunblock as purchasable items. Moonblock is sold "over the counter" in lore, but formalizing it as a shop item requires the consumable-effects system (what does applying moonblock DO mechanically?). Defer to the consumables feature.
- Stolen goods fence / black market.

### Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| **Subjective pricing is confusing.** Players expect one price per item; seeing different prices at different merchants breaks expectations. | High | Lean into it. The trade UI shows both the base value and the merchant's price, making the premium/discount visible. Tooltip: "Carrion pays 2× for water — she's desperate." The confusion becomes the discovery: "Oh, I can exploit this." Genre precedent: Caves of Qud, Sunless Sea, even real-world economics. |
| **Gold + Boredom creates a death spiral on Street.** Player earns gold → Boredom increases → player is forced to spend → no good items to buy → Boredom wins. | High | Merchants on Street must sell things worth buying. Jersey's diner sells food (heals — always useful). The Street vendor sells consumables that lower Boredom directly (entertainment items, games, distractions). Spending gold on Street is the Boredom pressure valve. The economy IS the element-management system for Street. |
| **Merchants feel empty with only 3-5 items each.** | Medium | Curated > comprehensive. Three items that each tell a story about the merchant's identity (Carrion sells sewer scrap + glow-moss + mystery meat — all sewer-native) feel richer than 20 generic items. Stardew's Krobus sells 4 items and feels like a full shop. |
| **Give-action and trade UI feel redundant.** Both transfer items from player to NPC. Why two systems? | Medium | Give-action is one-directional (player→NPC) and disposition-focused. Trade is bidirectional and gold-focused. They serve different verbs: "I want to make this NPC like me" (give) vs. "I want to exchange goods for mutual benefit" (trade). The systems can coexist because the incentives differ. Give-action can transfer items to non-merchants; trade requires merchant status. |
| **No save system means merchant stock and gold reset on reload.** | Medium | Same constraint as everything else. The economy is ephemeral until Phase 5 (saves). Within a session, the economy functions — the player can earn, spend, and trade. Session persistence turns ephemeral trades into persistent wealth. |
| **Players hoard gold to sell later, never spending.** | Low | The Boredom mechanic punishes hoarding on Street. In other zones, holding gold has no downside — but there's nothing to spend it on outside of merchants, so holding is just delayed spending. If the player wants to carry 500 gold into the Circus, they can — but they'll burn through Fun before they can spend it. Zone elements are the natural spending pressure. |

---

## Open Questions (For Gate 2)

1. **Gold or barter-first?** Should the economy launch with gold as the universal currency, or should the first ship be pure barter (item-for-item exchange, no gold at all)? Gold is simpler to implement and more familiar. Pure barter is more thematic (Violencetown is a broken city — why would currency work?) and connects more directly to the `values` vectors. Recommendation: gold for v1, with the `values`-based price modification making it feel like barter-with-a-number-attached.

2. **Merchant disposition decay.** If you bribe a merchant to open their shop (raising disposition to `tradeThreshold`), does their willingness persist forever? Or does disposition decay mean you have to keep bribing them to maintain access? Decay creates a "subscription" model for merchant access, which is thematic (protection money, repeat customer) but tedious. No-decay is simpler. Connects to the same open question in the give-action spec.

3. **Moonblock as currency.** Moonblock is sold everywhere in-universe ("over the counter"). It's worthless as sunblock but the vampires push it. Could moonblock be a secondary currency on Street — vendors accept it because the vampires say it has value, even though it mechanically does nothing? This would make moonblock literally fiat currency backed by vampire authority. Thematically perfect; mechanically complex.

4. **Robbery as economy verb.** Can the player rob a merchant? Kill them and take their stock? This is the Skyrim problem — if merchants are killable, the player bypasses the economy. Options: (a) merchants are unkillable (breaks immersion), (b) killing a merchant drops their stock but permanently closes that trade route (consequences), (c) merchant stock is hidden until trade mode (you can't see what they have until they trust you, so killing them gives you nothing). Option (c) is most Violencetown-coded: trust before trade.

5. **Inter-zone trade routes.** The dream scenario: buy soap cheap on Street, carry it into the Sewer, sell to Carrion for premium gold, carry gold back to Street, buy something to lower Boredom. A trade-route loop that rewards geographic knowledge. Is this intended? If so, the pricing needs to be balanced so the loop is profitable but not infinite-money. The sludge exposure from carrying items through the Sewer is the natural cost.

6. **Creature-specific trade interactions.** Does the Wererat get different prices in the Sewer? Can the Robot access Factory vending machines that humans can't? Per-creature merchant interactions connect to the "per-character map variation" design principle but multiply the authoring surface.

7. **The Financier as anti-merchant.** The Financier runs the economy. He doesn't sell items — he sells *services* (loans, contracts, insurance). The vampire economy is financial instruments, not goods. "I'll lend you 200 gold at 50% interest, compounding per zone transition." This is a different kind of merchant — a debt engine. Massive scope, but perfectly on-brand. Defer to a dedicated Financier-economy feature.
