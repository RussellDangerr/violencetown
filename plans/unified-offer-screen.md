# The Unified Offer Screen — design spec

**Status:** design approved 2026-08-22. Supersedes the trade-window presentation shipped in
Chapter Two Phase 6. Implementation plan lives in `plans/unified-offer-screen-implementation.md`.

**Branch:** `feature/unified-offer-screen` off `dev` (`83bb440`).

---

## 1. The one-sentence version

Buying, selling, giving and bribing collapse into a single verb — **make an offer** — presented on one
screen where the NPC's disposition is the visual centerpiece and every item finally carries its name,
its value and its description.

---

## 2. Why

### The unification already half-exists, and nobody can see it

There is exactly one barter surface in the game: `STATE.TRADE` (`game/main.js:77`), drawn by
`renderer._drawTradeModal` (`game/renderer.js:2772-2919`), hit-tested by `Game._tapTrade`
(`game/main.js:5491`). It already runs three modes off the same panel and the same cell geometry,
derived from two booleans at `renderer.js:2794-2795`:

```js
const container = !!npc._container;
const offerMode = !container && !npc.vendor;
```

| Mode | Trigger | What it is |
| --- | --- | --- |
| shop | `npc.vendor` | BUY grid + SELL grid + buyback + bribe |
| offer | any other living NPC | **the entire Give verb** |
| loot | a chest | TAKE grid at price 0 |

The standalone Give verb, its wheel node and `STATE.ITEM_GIVE_DIR` were already deleted in Phase 6a
(`main.js:69`, `wheel-model.js:54` carry the retirement comments). So the work is not "build a
unified screen." The unified screen exists and is **presented as two anonymous icon grids**, which
makes the unification invisible.

### The screen cannot show what the player needs

- **Disposition** is a 9px procedural smiley plus one uppercase word (`renderer.js:2806-2807`). The
  raw signed number appears in exactly one place in the whole game — the dialogue header
  (`renderer.js:3065`). The band multipliers that set every price are never shown at all.
- **Value** is a bare number under an icon with no name attached to it.
- **Descriptions** never appear. All 28 items in `ITEMS` have one written (51–161 chars); the trade
  window shows zero of them.

### It has real, live defects

Verified empirically in-browser on 2026-08-22 with 22 sellable stacks in the bag:

- `TRADE_SELL_ORIGIN = {320,156}`, `TRADE_ROW_STRIDE = 80`, `TRADE_CELL_H = 72`, panel bottom = 564,
  canvas = 608. Cell 15 lands at `y=556` with height 72. **Only 15 of 50 bag slots are reachable.**
  Nothing scrolls; the only scroll state on the Game object is `_logModalScroll`.
- Buy index 9 overlaps the buyback row; buy index 12 overlaps the bribe button. `_tapTrade` tests
  bribe first (`main.js:5497`), so the bribe button steals taps from a buy cell that is drawn on top
  of it.
- The renderer resolves cells with a bare `ITEMS[stock[i]]` (`renderer.js:2821-2822`) while
  `_containerStock` resolves with `_resolveItemDef` (`main.js:3764`). **A weapon in a chest occupies
  a stock index and a keyboard cursor stop, draws nothing, and can never be taken.**
- `_takeItemAt` (`main.js:2924-2926`) does `ITEMS[gi.type]` and on a miss runs
  `groundItems.splice(idx,1); return;` — **it silently deletes the item off the floor with no log.**
  Three weapons are authored as ground items (`lion_whip` circus, `fearmur` graveyard, `gator_tail`
  sewer).

### You cannot give a merchant anything

`_offerFromTrade` has exactly one caller (`main.js:5529`), gated on `offerMode`, and
`offerMode = !npc.vendor`. On a merchant every satchel tap sells; on anyone else every satchel tap
gives. There is no path anywhere in the codebase to gift a vendor — yet **Puck is `vendor: true` and
carries hand-authored `values: {rock:1, soap:4, bandage:3, hot_dog:2}`** (`game/factory-map.json:40`) that
the player can never reach. The only lever on a merchant's mood today is bribing with raw gold.

---

## 3. The model

**Trade and give are the same function.** There is one verb: *make an offer*.

The player stages items into two trays — **you give** and **you take** — plus gold into the give
tray. A running balance settles the exchange. Whether an offer reads as a purchase, a sale, a gift or
a bribe is nothing but the shape of that balance:

| Give tray | Take tray | Reads as |
| --- | --- | --- |
| gold | goods | a purchase |
| goods | gold | a sale |
| goods, nothing taken | — | a gift |
| gold, nothing taken | — | a bribe |
| goods + gold | goods | a barter with a sweetener |

**Any surplus in the NPC's favour converts to disposition.** That is the whole mechanic. It is why
the four verbs were ever separate and why they no longer need to be.

This is a return to the original 2026-06-09 design, which specified *"multi-select by tapping several
then swipe them together"* and *"a smiley AGGRO meter + the overpay/bribe amount in coins"*. The
shipped build simplified the multi-select away; this restores it.

---

## 4. The economy rule

This is the only new economy rule. Everything else — `band`, `buyPrice`, `sellPrice`,
`transferGold` — is unchanged.

### 4.1 Surplus

```
givenValue = Σ over given items of  sellPrice(item, disposition) × (npc.values[item.id] ?? 1)
           + givenGold
takenValue = Σ over taken items of  buyPrice(item, disposition)

surplus    = max(0, givenValue − takenValue)
```

Authored `values` weights become a **multiplier**, so an item an NPC actually wants punches far above
its market price, while an item they have no opinion about still counts at face value. Gold's
multiplier is always 1. This is what makes the give tray meaningful on the five merchants (Macc,
Hooch, Pike, Corner Merchant, Newsstand Kid) who have no `values` block authored at all — every
authored vendor except Puck.

### 4.2 Surplus to points — the rising curve

Per the 2026-06-09 Outward research: cheap entry, rising marginal cost toward a flip, deterministic,
no RNG.

```
T  = npc.flipThreshold ?? 100
p(d) = clamp01((d − (−100)) / (T − (−100)))
costPerPoint(d) = 1 + 4 × p(d)          // 1 GP/pt at the floor → 5 GP/pt at the threshold
```

Points are awarded one at a time, each deducting `costPerPoint(currentDisposition + awarded)` from the
surplus pool, until the pool cannot afford the next point. Deterministic, monotonic, integer output.
Iteration is bounded at 400 points as a runaway guard.

### 4.3 The gold ceiling — replaces the memo's per-encounter cap

The `gold-weighting-and-bribery-research` memo proposed a ~+30 per-encounter cap on gold-bought
disposition. **This spec replaces that with a structural ceiling**, and the deviation is deliberate:

```
goldCeiling = (disposition < T) ? T − 1 : Infinity
```

Gold-sourced points may never carry an NPC **across** an uncrossed `flipThreshold`. Item-sourced
points are uncapped and can cross freely.

Rationale for the change: it needs no new persisted state and no per-encounter bookkeeping; it
encodes the memo's actual intent ("gifts stay the cheap/clever path, raw gold is the pricey universal
one") more directly than a number; and it closes a live exploit the numeric cap would not — today the
Wererat boss has no `bribeable` flag, no `flipThreshold` and no `disposition`, so **six +5 bribes at
10 GP flips the sewer boss into an ally for 60 GP**. The `Infinity` branch exists so NPCs already at
or above their own threshold (Puck is `disposition: 60, flipThreshold: 0`) are not frozen out of gold
entirely.

### 4.4 Refusals — who gold and gifts do not work on

Three cases the surplus rule must handle explicitly. Each is a live gap today.

**`bribeable: false`** — gold in the give tray generates **zero** goodwill. It still pays for goods
normally; it simply buys no affection. This fixes a live bug: `_bribeTarget` (`main.js:2910`) respects
the flag but **`_bribeVendor` (`main.js:5474-5486`) never checks it**, so the Ghost Fungus
(`game/sewer-map.json:33`, the only NPC in the game authored `bribeable: false`) is bribeable through
the trade window today. The new model must not inherit that.

**`disposition == null`** — the NPC is untracked. No meter renders, and the give tray **refuses
staging with a stated reason** rather than accepting the item. Today, giving to a null-disposition NPC
silently creates the field at 0 and spawns an over-head smiley on someone who was never meant to have
one.

**Items worth nothing to this NPC** — an item with `baseValue: 0` and no `npc.values` entry cannot be
staged into the give tray, and the row says why. Today such an item is accepted and consumed for +0,
with the log cheerfully reading `Disposition +0`. All three zero-value items in the catalogue
(`items.js:234, 250, 314`) are quest-flagged and so already blocked by §7.3; this rule exists so
future content cannot reopen the hole.

The through-line is the buff-design rule: never let the player throw something into a void. A refusal
is always stated, always on the row, always before the item is spent.

### 4.5 What does not change

- `buyPrice` / `sellPrice` / the six `band` rows / `TRADE_FLOOR = -50` — untouched.
- `transferGold` still conserves and still refuses when the payer cannot cover.
- Buying and selling still do not move disposition on their own. Only **surplus** does.

---

## 5. The screen

Fixed bezel `{x:24, y:44, w:560, h:520}` — the same rect as `DEVICE_RECT`, `LOG_MODAL_RECT` and
`EQUIPMENT_MODAL_RECT`, which are today four byte-identical literals sharing no constant. This work
unifies them into one exported `MODAL_RECT` and registers the offer screen in `CLOSE_PANEL` as a
constant (no live-rect stashing needed, since the panel is static).

Usable inner height 504. Band budget:

| Band | Height | Contents |
| --- | ---: | --- |
| Header | 48 | mood face · NPC name (scale 2) · disposition meter · GP (scale 2) · ✕ chip |
| Column headers | 14 | `<NPC>'S GOODS` / `YOUR SATCHEL` |
| Lists | 240 | two 268-wide scrolling columns, 6 rows of 40 |
| Trays | 60 | YOU GIVE (6 slots) / YOU TAKE (6 slots), 36px cells |
| Description | 56 | name · tier · value · wrapped description · goodwill weight |
| Ledger | 48 | giving / taking summary · balance · MAKE THE OFFER |
| Hint | 14 | key legend |

Total 480 plus gaps, inside 504.

### 5.1 The disposition meter — the centerpiece

A 320×12 bar with tick marks at every band boundary (−50, −25, 0, +25, +50, +75).

- **Solid fill** = current disposition, coloured by band.
- **Dashed gold extension** = where the staged offer will land them, updating live as items are staged.
- **Beside it:** `+60 → +80 ADORING` — current, projected, and the projected band name.
- **Beside that, the payoff:** `BUY ×1.2 → ×1.0` and `SELL ×0.60 → ×0.70`.

The player watches prices improve as they stage a gift. The game has never shown this.

**Display clamp.** `applyGive` is unclamped (`give-action.js:97`) and the Fungus King is authored
`disposition: -80, flipThreshold: 200` (`game/sewer-map.json:34`), so clamping the underlying value to
±100 would make him permanently unflippable. The meter therefore clamps **display only**, to
`max(100, flipThreshold)` per NPC. His bar stays legible; the math is untouched; nothing is
re-authored.

### 5.2 Rows

268 wide × 40 tall. Left-edge 3px tier bar in the rarity colour · 24px icon · name · tier name ·
price right-aligned. Stack counts render as `[Soap] ×3`. A staged row gets the gold halo plus a
`staged ×2` line. Scroll thumbs are proportional, so a 7-item shop and a 22-stack satchel read
differently at a glance.

### 5.3 The description strip

Never empty. With an item selected it carries, in one place, all three things this project set out to
make obvious:

```
[Soap]   RARE   15 GP BASE · PUCK PAYS 9        PUCK VALUES THIS ×4 · +20 EACH
Industrial-grade lye bar. Cuts through sludge.
Given rather than sold, two of these tip him into ADORING.
```

With nothing selected it shows the NPC's mood line instead of dead space.

Text is measured with `font.measure('X', scale)` the way `_drawDialogueModal` does
(`renderer.js:3019`). **The `/8` idiom is forbidden** — `_wrapText` measures in characters and every
call site outside the dialogue modal divides pixels by a hardcoded 8, a fossil of the retired 8×8
bitmap atlas. The real VT323 advance is `scale × 4.8`, so those wraps are ~40% narrower than the
space allows.

### 5.4 The ledger bar

```
GIVING   2 × [Soap]  +  30 GP          BALANCE                 [ MAKE THE OFFER ]
TAKING   1 × [Bandage]                 +18 IN HIS FAVOUR
```

The commit button disables with a stated reason rather than failing silently:

- `YOU'RE 21 GP SHORT` — the player cannot cover a negative balance.
- `HIS TILL IS 40 GP SHORT` — the NPC cannot cover what they owe. Checked **before** commit;
  `transferGold` returning false must never be discovered mid-transaction.
- `HE WON'T DEAL` — disposition below `TRADE_FLOOR`. See 5.5.
- `NOTHING STAGED` — both trays empty.

### 5.5 Below the trade floor

At `disposition < -50`, `canTrade` refuses. The lists still render and the **give tray still works**,
so a hostile NPC is a puzzle rather than a wall: gift or bribe them up until they will deal. This is
the same lens as the buff-design rule — options given, never taken away.

### 5.6 Modes

One screen, one state. What differs is which trays are live:

| Partner | Take tray | Give tray | Notes |
| --- | --- | --- | --- |
| vendor | their `stock` | full | buyback row folds into their goods, flagged `bought back` |
| any other living NPC | empty, disabled with a reason | full | this is the old offer mode |
| chest | its `contents`, priced 0 | **disabled** | take-only; two-way containers are out of scope |

---

## 6. Interaction

### 6.1 Pointer

One tap on a row **stages** one unit and selects it (populating the description strip). One tap on a
staged tray slot un-stages it. Committing is a separate, explicit action.

This replaces one-tap-commits. The Phase 6c ruling made the 5-minute buyback window the substitute
for a confirm dialog; staging is now the first safety net and buyback demotes to the second. The
buyback ledger, its per-unit LIFO price stacks and its `BUYBACK_MS = 5*60*1000` timer are otherwise
unchanged.

Note the touch precedent this follows: `_tapHotbar`'s one-tap-opens-options was an explicit fix for
Caelan's top complaint (`main.js:1834`), while TARGET_LIST and ITEM_OVERLAY use two-step select-then-
fire. The offer screen is one-tap-stages, which matches the hotbar's directness while keeping commit
deliberate.

### 6.2 Keyboard

Pointer and keys funnel into one `_offerActivate(zone, index)`, preserving the explicit rule at
`main.js:5520-5522` that the two can never drift.

| Key | Action |
| --- | --- |
| `Tab` | switch side (their goods ↔ your satchel) |
| `↑ ↓` / `W S` | move row, scrolling the viewport when the cursor leaves it |
| `← →` / `A D` | move between the lists and the tray slots |
| `Space` | stage / un-stage the highlighted thing |
| `Enter` | commit the offer |
| `E` / `Esc` | close |

Deliberately **not** inherited: the DEVICE's tap-only bodies. Its ITEMS grid, GEAR chooser and RINGS
sockets have no keyboard grammar at all; the offer screen keeps full parity.

### 6.3 The close contract

Non-negotiable, both halves:

1. appear in `_closeCurrentMenu()`'s switch (`main.js:1676-1690`) — the single Cancel hook behind
   universal `Escape`, the ✕ chip and tap-outside;
2. register the panel rect in `renderer.js`'s `CLOSE_PANEL` table (`renderer.js:430-440`).

The opener must also repeat the `state === STATE.IDLE` dance the wheel and `_fireTargetVerb` use
(`main.js:3312`, `2818`), and the closer must call `_resumeHeldWalk()`.

**Closing discards the basket.** Nothing is committed until `MAKE THE OFFER` is pressed, so Escape is
always safe and never needs a confirm.

---

## 7. Data

### 7.1 Basket state

```js
game._offer = {
  npc,                       // the partner (or the duck-typed container shim)
  give: [{ slot, count }],   // indices into game.inventory
  take: [{ source, index, count }],   // 'stock' | 'buyback' | 'contents'
  gold: 0,                   // gold staged into the give tray
  selection: { side, index } | null,
  scroll: { theirs: 0, yours: 0 },
}
```

RAM-only. Cleared on close. **Never persisted — no save-format change.** `save.js` and
`Enemy.toSave()` are untouched by this work.

### 7.2 Deriving the satchel

The current `_tradeSell` snapshot (`main.js:5128`) is taken at open and hand-refreshed by five
separate assignments; any missed refresh drifts the hit-test away from the draw. It is deleted. The
satchel list is derived from `game.inventory` inside the layout function every frame, so draw and
hit-test cannot disagree by construction.

Unlike `_tradeSellList`, the derived list **keeps `count`**, so a stack of 9 rocks is one row reading
`[Rock] ×9` and staging can move more than one unit.

### 7.3 Quest items

Unchanged in behaviour, clearer in presentation. A quest item may be staged into the give tray only
when `questEngine.expectsDelivery(def.id, npc.id)`; otherwise its row carries the protection glyph and
refuses staging. Quest items never contribute GP value.

`specialBuys` (Macc's 500 GP for the catalytic converter) is honoured where it already applies and
gains a distinct row marker so the payoff is visible. **The `!questItem` guard at `main.js:5434` stays
exactly as-is** — the converter is quest-flagged and must not become sellable while the car-fix arc
depends on it. The existing comment already records that this re-enables itself when the converter
loses the flag.

---

## 8. Modules

Following the `layout.js` contract already enforced by `tests/device-layout.test.js` and
`tests/hud-layout.test.js`: a pure function takes a container rect plus read-only state and returns
plain rects in the fixed 608×608 space; `renderer.js` imports it to draw and `main.js` imports the
same function to hit-test; neither side stores geometry.

| File | Change |
| --- | --- |
| `game/offer.js` | **new, pure.** Basket model: stage, un-stage, balance, surplus, the goodwill curve, validity + refusal reasons. No renderer or Game imports. |
| `game/trade.js` | keeps `band`/`buyPrice`/`sellPrice`/`transferGold`/`burnGold`/`mood`. Header comment corrected: it claims "8 AGGRO levels every 25 points"; the table has **6**. |
| `game/give-action.js` | `applyGive` becomes a thin caller over the shared curve so flip logic stays in one place. `previewGive` — written, exported, documented as the hover seam, and consumed by nothing since it was authored — finally gets its consumer. |
| `game/layout.js` | `offerLayout(panelRect, model)` → header, meter, per-row rects, tray slots, description, ledger, button. Adds shared `MODAL_RECT`. Deletes the `TRADE_*` grid constants. |
| `game/renderer.js` | `_drawOfferScreen` replaces `_drawTradeModal` + `_drawTradeCell`. Built on `_drawDialogueModal`'s measure-then-draw and its clip-and-thumb scroll viewport (`renderer.js:3110-3145`) — the only scroll implementation in the codebase. |
| `game/main.js` | `_openOffer` / `_closeOffer` / `_tapOffer` / `_offerActivate` / `_commitOffer`. |

### Deleted

`_buyFromVendor`, `_sellToVendor`, `_bribeVendor`, `_tapTrade`, `_tradeActivate`, `_tradeSlots`,
`_clampTradeCursor`, `_tradeSellList`, `_offerFromTrade`, `_drawTradeModal`, `_drawTradeCell`, the
`TRADE_*` grid constants, and `_doGive` (`main.js:2589`) which has had no callers since Phase 6a.

`_bribeTarget` (`main.js:2910`) and the wheel bribe resolver (`main.js:3319`) are the two surviving
duplicate bribe implementations. They keep working and are **out of scope** for this spec; the
duplication is noted in `plans/next-session-open-work.md` rather than fixed here.

---

## 9. Defects fixed as a consequence

These are not extras; each one blocks the screen from working as designed.

1. **Reachability.** Scrolling lists reach all 50 bag slots, up from 15.
2. **Overlapping hit rects.** The layout function is covered by a non-overlap test under `HIT_SLOP`,
   which the current geometry fails.
3. **Weapons become first-class.** The five `WEAPONS` entries have no `baseValue`, `description`,
   `category` or `tier`, so `sellPrice` returns null for every weapon and `buyPrice` returns 1 GP. On
   a screen where every row shows a value and a description that is not survivable. They get the
   missing fields, and every trade-path lookup switches from bare `ITEMS[id]` to `_resolveItemDef`.
4. **The silent ground-item deletion.** Fixing (3) makes `_takeItemAt`'s `ITEMS[gi.type]` miss
   impossible, which stops the whip, the fearmur and the gator tail being deleted off the floor
   without a log line.
5. **Chests are unreachable by tap.** `_targetAt` has no container case and `pathing.stepFree` treats
   a container tile as blocked (`pathing.js:40`), so `findPath` to a chest returns null and **on
   touch there is currently no way to open a chest at all.** Fixed by adding the container case;
   containers stay take-only.
6. **The sewer-fare hostility trap.** `applySewerFareGive` (`give-action.js:194-212`) turns the NPC
   hostile and clears `vendor`, but nothing closes the screen — the player is left standing in an
   offer window belonging to someone now chasing them. Committing an offer that turns the partner
   hostile must close the screen and discard the basket.
7. **Stranded stock on de-vendored NPCs.** `give-action.js:207` and `main.js:4058` set
   `vendor = false` without clearing `stock`, leaving invisible-but-tappable cells and a cursor
   parked on a blank rect. Clear `stock` when de-vendoring.

---

## 10. Testing

No local Node on this machine, so `npm test` runs elsewhere; in-browser verification is the local net.

**New:**
- `tests/offer.test.js` — staging and un-staging, stack counts, balance sign, surplus floored at 0,
  the `values` multiplier, the rising curve's monotonicity and determinism, the gold ceiling
  (including the `Infinity` branch for Puck), quest-item refusal, every commit-refusal reason.
- `tests/offer-layout.test.js` — every returned rect inside the panel; no two hit-testable rects
  overlap once expanded by `HIT_SLOP`; row count and scroll offsets behave at 0, 1 and 50 items.

**Backfilled:** `tests/trade.test.js`. `tests/wallets.test.js` is currently the only test importing
from `trade.js` and it imports only `transferGold`/`burnGold` — **`band`, `buyPrice`, `sellPrice`,
`bribeStepCost`, `canTrade` and `mood` have zero coverage.** A pricing-adjacent change cannot land
without a net.

**Extended:** `tests/save-roundtrip.test.js` asserts `_offer` is absent from the save and that
disposition round-trips.

---

## 11. Verification

In-browser at `localhost:3001`, console clean, on each of:

- **Puck** — vendor with authored `values`; stage 2 soap, watch the meter run 60 → 80 and the
  multipliers move `×1.2 → ×1.0`; commit; confirm the prices actually change afterward.
- **A plain Violencian** — no vendor, no `values`; confirm the take tray is disabled with a reason and
  the give tray still generates goodwill from GP value alone.
- **A chest** — take-only, give tray disabled, and reachable **by tap**, not only by bumping.
- **Someone below −50** — lists render, take tray refuses, give tray works, and gifting up past the
  floor unlocks trading in the same sitting.
- **Scroll** — all 50 bag slots reachable; thumb proportions correct at 1 item and at 50.
- **The Fungus King** — meter renders legibly against `flipThreshold: 200` without clamping his math.
- **Glyph check** — the meter draws `→` and `×`. `_log` normalises Unicode to ASCII for the bitmap
  surfaces (`main.js:5556+`) but `font.drawText` passes it straight to VT323, whose coverage for these
  is unverified from source. `_drawCloseButton` draws its ✕ as two strokes precisely because of this
  doubt. **Confirm in-browser or substitute ASCII.**

---

## 12. Out of scope

Named explicitly so the next reader does not assume they were forgotten:

- **Two-way containers.** There is no put-item-into-container path anywhere in the codebase. Adding
  one is a new mechanic, not a reskin, and collides with the systems audit's standing "freeze the
  verb list" brake.
- **Drag-to-swap equipment barter**, NPC equipment loadouts, and disposition-when-worn gear — Slice 2
  of the original trade design, still parked.
- **Haggling, per-merchant markup, weight.** Price inputs stay `baseValue` and `disposition`.
- **Buy/sell moving disposition on their own.** Only surplus does. `reactToTransaction`'s deliberate
  `default: return null` for non-give, non-bribe stays.
- **De-duplicating the three bribe implementations.**
- **Turn cost.** `_offerFromTrade` and `_bribeVendor` are free today (the trade path never calls
  `_advanceWorld`) while `_bribeTarget` and the wheel bribe cost a turn. Committing an offer inherits
  the current free-in-menu behaviour. Ruling **A3** ("is the world turn a real budget?") is still owed
  and would change this.
- **`npc.giftLog`** — appended on every give and bribe, persisted verbatim, read by nothing, growing
  unbounded across a playthrough. Left alone.
- **`npc._discountMode`** — written by `applyFlip` (`give-action.js:298`), read by nothing. Carrion's
  `onFlip: 'offerDiscount'` stays inert.

---

## 13. Doc reconciliation

`plans/economy-merchants.md` and `plans/give-action-feature.md` on `dev` describe schemas and UI
(`shopInventory`, `buyMultiplier`, `tradeThreshold`, `ITEM_GIVE_DIR`, Down-to-Give) that **do not
exist and were abandoned**, with no supersede notes. The spec for what actually shipped lives only on
the `plan` branch, at `git show plan:plans/chapter-two-downtown-canyon-and-cohesion.md` (§Trade-window
decisions at :77, §Phase 6a–6e at :295–413).

Both dev-side docs get a supersede header pointing here as part of this work, so the next reader does
not rebuild a deleted verb.

---

## 14. Decisions of record

| # | Decision | Made by |
| --- | --- | --- |
| 1 | Scope is presentation + flow; the goodwill curve is the one economy change, and it is forced by the model. | Caelan |
| 2 | Trade and give are the same function, condensed into one menu — not two tabs. | Caelan |
| 3 | Model A: one offer basket, two trays, explicit commit. | Caelan |
| 4 | Surplus converts via GP value with authored `values` as a multiplier — not authored-preferences-only. | Caelan |
| 5 | Layout: two lists, then trays, then ledger. | Caelan |
| 6 | The description strip is kept as well as the trays; lists drop to 6 rows to pay for it. | Claude |
| 7 | Gold ceiling at `flipThreshold − 1` replaces the memo's +30 per-encounter cap. | Claude — **flagged for veto** |
| 8 | The meter clamps display only, to `max(100, flipThreshold)`; underlying math stays unclamped. | Claude |
| 9 | Weapons become first-class tradeable items. | Claude |
| 10 | Chests stay take-only, but become reachable by tap. | Claude |
| 11 | `bribeable: false` blocks gold-sourced goodwill, closing a live hole where `_bribeVendor` ignores the flag. | Claude |
| 12 | An untracked NPC (`disposition == null`) shows no meter and refuses gifts, instead of silently gaining the field at 0. | Claude |
| 13 | Every refusal is stated on the row before the item is spent — never a silent `+0`. | Claude |
