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
| less than you take | goods | a **bad deal** — they accept, and resent it |

Gold appears in whichever tray it belongs to, so a sale is `give: [2 soap], gold: −18` and a purchase
is `gold: +30, take: [bandage]`. Same field, same arithmetic, opposite sign.

**Any imbalance converts to disposition.** Surplus in their favour buys goodwill; a shortfall costs
it. That is the whole mechanic, and it is why the four verbs were ever separate and no longer need to
be. A bad deal is a move the player is allowed to make, not an error the screen blocks.

This is a return to the original 2026-06-09 design, which specified *"multi-select by tapping several
then swipe them together"* and *"a smiley AGGRO meter + the overpay/bribe amount in coins"*. The
shipped build simplified the multi-select away; this restores it.

---

## 4. The economy rule

This is the only new economy rule. Everything else — `band`, `buyPrice`, `sellPrice`,
`transferGold` — is unchanged.

### 4.1 The balance

**Gold is signed and sits on whichever side it belongs to.** `offer.gold > 0` is gold the player
hands over; `offer.gold < 0` is gold the NPC pays out. Without the negative half the model cannot
express a sale at all, which is the single most common thing a player does in a shop.

**Market value and gift value are two different numbers.** The `values` weight is affection, not
money: Puck pays 9 GP for a bar of soap he sells at 18, and his `soap: 4` does not make him pay 72.
Weighting the settlement price was an error in an earlier draft of this spec — it would have let the
player mint gold out of an NPC's fondness.

```
marketGiven = Σ over given items of  sellPrice(item, disposition) × count  +  max(0, offer.gold)
marketTaken = Σ over taken items of  buyPrice(item, disposition)  × count  +  max(0, −offer.gold)
giftValue   = Σ over given items of  sellPrice(item, disposition) × count × (npc.values[id] ?? 1)

balance     = marketGiven − marketTaken          // this is what settles the gold
```

The weight enters only when a **surplus** is converted to goodwill (§4.2): gold in the tray pays the
bill first, whatever is left over is the surplus, and the item share of that surplus is amplified by
the average weight of the items given (`giftValue / marketItemsGiven`). So selling soap at the asking
price moves nothing, while handing the same soap over for free moves +16.

The balance is signed, and **both signs move disposition**:

| balance | name | effect |
| --- | --- | --- |
| `> 0` | surplus | goodwill, §4.2 |
| `= 0` | a straight trade | disposition unmoved |
| `< 0` | deficit — a **bad deal** | resentment, §4.4 |

A negative balance is **not a refusal**. It is an offer the NPC will take while thinking less of you.
That is what makes the balance a two-way lever rather than a wall, and it is why the meter has
something to say in both directions.

**The balance auto-settles to zero as you stage.** Put a bandage in the take tray and the screen
drops the 30 GP it costs into the give tray for you; put two soap in the give tray and it drops the
18 GP Puck owes you into the take tray. The player then *deliberately* drags it off zero — take back
some of the gold to buy goodwill, or short him to buy nothing. Settling is the default and the
imbalance is the decision, which is what keeps ordinary shopping fast while making generosity and
lowballing both explicit acts.

Authored `values` weights become a **multiplier**, so an item an NPC actually wants punches far above
its market price, while an item they have no opinion about still counts at face value. Gold's
multiplier is always 1. This is what makes the give tray meaningful on the five merchants (Macc,
Hooch, Pike, Corner Merchant, Newsstand Kid) who have no `values` block authored at all — every
authored vendor except Puck.

### 4.2 Surplus to points — the rising curve

Per the 2026-06-09 Outward research: cheap entry, rising marginal cost toward a flip, deterministic,
no RNG.

```
CEIL = max(100, npc.flipThreshold ?? 30)      // the same number the meter clamps to
p(d) = clamp01((d − (−100)) / (CEIL − (−100)))
costPerPoint(d) = 1 + 4 × p(d)                // 1 GP/pt at the floor → 5 GP/pt at the ceiling
```

Points are awarded one at a time, each deducting `costPerPoint(currentDisposition + awarded)` from the
surplus pool, until the pool cannot afford the next point. Deterministic, monotonic, integer output.
Iteration is bounded at 400 points as a runaway guard.

**The denominator is `CEIL`, not `flipThreshold`.** An earlier draft of this spec used the threshold
and it is wrong: Puck is authored `flipThreshold: 0`, so `p` clamps to 1 at every disposition above
zero and he sits permanently at the maximum 5 GP/pt. Using the ceiling makes the curve mean "affection
gets harder the more they already like you", which holds for every NPC whether or not they have a
flip left to buy — and it makes the meter's display range and the curve's range the same number.
Caught by running the real numbers in `game/_design-offer.html`; the flip itself stays protected
separately by §4.3.

### 4.3 The gold ceiling — replaces the memo's per-encounter cap

The `gold-weighting-and-bribery-research` memo proposed a ~+30 per-encounter cap on gold-bought
disposition. **This spec replaces that with a structural ceiling**, and the deviation is deliberate:

```
T = npc.flipThreshold ?? 30                    // the threshold itself, NOT §4.2's CEIL
goldCeiling = (disposition < T) ? T − 1 : Infinity
```

`?? 30` is not a new number: it is the default `previewGive` and `applyDispositionDelta` already use
(`give-action.js:49`, `:235`). An earlier draft of this spec said `?? 100`, which would have silently
disagreed with the flip logic it sits beside. For `CEIL` the default is immaterial — `max(100, …)`
swallows it — but for the gold ceiling it decides where gold stops, so it must match.

Gold-sourced points may never carry an NPC **across** an uncrossed `flipThreshold`. Item-sourced
points are uncapped and can cross freely.

Rationale for the change: it needs no new persisted state and no per-encounter bookkeeping; it
encodes the memo's actual intent ("gifts stay the cheap/clever path, raw gold is the pricey universal
one") more directly than a number; and it closes a live exploit the numeric cap would not — today the
Wererat boss has no `bribeable` flag, no `flipThreshold` and no `disposition`, so **six +5 bribes at
10 GP flips the sewer boss into an ally for 60 GP**. The `Infinity` branch exists so NPCs already at
or above their own threshold (Puck is `disposition: 60, flipThreshold: 0`) are not frozen out of gold
entirely.

### 4.4 Deficit to resentment — the bad deal

The exact mirror of §4.2, using the same `p(d)`:

```
resentCostPerPoint(d) = 5 − 4 × p(d)          // 5 GP/pt at the floor → 1 GP/pt at the ceiling
```

Points are removed one at a time by the same loop, same determinism.

**Resentment rounds UP against the player; goodwill rounds DOWN.** Any remaining shortfall, however
small, costs one more whole point — while in §4.2 you only earn points you have fully paid for. Both
directions round in the NPC's favour, which is the principle worth stating once and applying
everywhere. This is not cosmetic: rounding resentment down instead refuses almost every bad deal over
a fractional remainder. Caught in the preview, where a −29 GP lowball absorbed 14 points at ≈27 GP and
then bounced on the leftover 2 GP.

**The asymmetry is the design.** Goodwill costs *more* as an NPC warms to you; resentment costs
*less*. At Puck's +60 that is 4.2 GP per point to gain against 1.8 per point to lose — betrayal runs
about 2.3× cheaper than affection, which is the feel we want. At the bottom it inverts: someone who
already dislikes you is cheap to win over and expensive to offend further, because they are braced
for it. So the system self-stabilises instead of spiralling.

Two bounds, both required:

```
RESENT_MAX_PER_OFFER = 25        // one offer can cost at most 25 points
RESENT_FLOOR         = −25       // no amount of bad dealing goes below this
```

They close the loop on each other. At the floor there is no resentment left to absorb a deficit, so
the lowball lever stops being offered rather than becoming a free lunch — the commit button refuses
with `HE WON'T TAKE ANOTHER BAD DEAL`. And because `RESENT_FLOOR` sits above `TRADE_FLOOR = -50`, a
bad dealer is never locked out of a shop; the prices just get punishing (`×1.9 buy / ×0.45 sell` in
the `wary` band). Options narrowed, never removed.

**Verified numbers** (from the preview, not estimated):

- Dropping Puck the full 25 points costs a shortfall of exactly **51 GP** — a real insult in a shop
  where a bandage is 30.
- Swapping a 1 GP rock for a 30 GP bandage is a −29 balance → **−15 disposition, accepted**, carrying
  Puck 60 → 45 and `warm` → `friendly`, so his buy multiplier worsens ×1.2 → ×1.4 and his sell
  multiplier ×0.60 → ×0.55. The player pays for the lowball in every price thereafter.

**Untracked and container partners cannot be shortchanged.** An NPC with `disposition == null`
(§4.5) has no resentment to spend, so a deficit against them must be covered in full — otherwise the
lowball would be free. Containers do no disposition math at all: contents are priced 0 and the give
tray is disabled.

**An open ruling this makes more pressing.** `applyDispositionDelta` only auto-fires the *upward*
ally flip; decay past the threshold does not un-ally today, noted in the Phase 6 evolution and still
open as decision #9. Bad deals hand the player a fast way to drive an ally's disposition down, so an
ally you repeatedly shortchange stays an ally. Out of scope here — flagged so the ruling gets made.

### 4.5 Refusals — who gold and gifts do not work on

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

### 4.6 What does not change

- `buyPrice` / `sellPrice` / the six `band` rows / `TRADE_FLOOR = -50` — untouched.
- `transferGold` still conserves and still refuses when the payer cannot cover.
- Buying and selling still do not move disposition on their own. Only an **unbalanced** offer does — surplus up, deficit down.

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
| Lists | 240 | two 264-wide scrolling columns with a 16px gutter, 6 rows of 40 |
| Trays | 60 | YOU GIVE (6 slots) / YOU TAKE (6 slots), 36px cells |
| Description | 56 | name · tier · value · wrapped description · goodwill weight |
| Ledger | 48 | giving / taking summary · balance · MAKE THE OFFER |
| Hint | 14 | key legend |

Total 480 plus gaps, inside 504.

### 5.1 The disposition meter — the centerpiece

A 320×12 bar with tick marks at every band boundary (−50, −25, 0, +25, +50, +75).

- **Solid fill** = current disposition, coloured by band.
- **Dashed gold extension, rightward** = where a surplus offer will land them.
- **Dashed red retreat, leftward, drawn inside the existing fill** = what a bad deal will cost them.
  Same affordance, mirrored; the player sees the damage before committing, never after.
- **Beside it:** `+60 → +76 ADORING` in green, or `+60 → +35 FRIENDLY` in red.
- **Beside that, the payoff or the price:** `BUY ×1.2 → ×1.0` when you overpay,
  `BUY ×1.2 → ×1.4` in red when you shortchange.

The player watches prices improve as they stage a gift. The game has never shown this.

**The ceiling is per-NPC, and it is one number for both the meter and the value.**
`applyGive` is unclamped (`give-action.js:97`) but `applyDispositionDelta` hard-clamps to ±100, and
the Fungus King is authored `disposition: -80, flipThreshold: 200` (`game/sewer-map.json:34`) — so a
flat ±100 clamp makes him permanently unflippable.

An earlier draft of this section called the fix a *display-only* clamp and claimed "the math is
untouched." That was wrong: the offer screen commits through `applyDispositionDelta`, so the flat
clamp does touch the math and would have silently stranded him. The ceiling is therefore real, not
cosmetic — `dispositionCeil(npc) = max(100, flipThreshold ?? 30)` bounds **both** the drawn meter and
the legal value, and `applyDispositionDelta` clamps to `[-100, dispositionCeil(npc)]`.

For every NPC except the King that ceiling is exactly 100, so this changes nothing anywhere else. It
also means goodwill can never project past the top of the bar it is drawn on, which is what stops the
screen promising a `+400` swing on a meter 200 wide.

### 5.2 Rows

264 wide × 40 tall. Left-edge 3px tier bar in the rarity colour · 24px icon · name · tier name ·
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

A negative balance does **not** disable the button. It arms it with a warning, because taking a bad
deal is a legitimate move (§4.4):

```
GIVING   1 x [Rock]                    BALANCE                 [ MAKE THE OFFER ]
TAKING   1 x [Bandage]                 29 GP SHORT             -16 . HE'LL REMEMBER THIS
```

The button only *disables*, always with a stated reason, when the offer genuinely cannot happen:

- `HE WON'T TAKE ANOTHER BAD DEAL` — the deficit needs more resentment than `RESENT_MAX_PER_OFFER`
  or `RESENT_FLOOR` has left. This is the shortfall's real ceiling.
- `HE CAN'T BE SHORTCHANGED` — an untracked (`disposition == null`) partner or a container, where
  there is no resentment to spend, so the balance must be covered in full.
- `HIS TILL IS 40 GP SHORT` — the NPC cannot cover what they owe **you**. Checked *before* commit;
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

**Node is available locally** — v24.18.0 / npm 11.16.0. An earlier note in this project's memory
claimed otherwise and this spec repeated it; both were stale. Baseline on `feature/unified-offer-screen`
before any of this work: **404 tests, 87 suites, 0 failures, 395ms.**

```bash
npm test                          # the whole suite (node --test)
node --test tests/offer.test.js   # one file
```

Every task in the implementation plan is therefore genuinely test-driven: the failing test can be run
and seen to fail before the code exists.

**New:**
- `tests/offer.test.js` — staging and un-staging, stack counts, balance sign, surplus floored at 0,
  the `values` multiplier, the rising curve's monotonicity and determinism, the gold ceiling
  (including the `Infinity` branch for Puck), quest-item refusal, every commit-refusal reason.
- `tests/offer-layout.test.js` — every returned rect inside the panel; the two-part overlap invariant
  below; row count and scroll offsets behave at 0, 1 and 50 items.

**The overlap invariant is per-group, not global.** An earlier draft of this spec asserted "no two
hit-testable rects overlap once expanded by `HIT_SLOP`", which is impossible for anything tiled —
two adjacent 40px rows expanded by 6 each necessarily overlap by 12. The correct pair of assertions:

1. **Siblings inside a tiled group** (list rows, tray slots) tile exactly at **zero** slop. Slop
   between siblings would be ambiguous anyway — which row did the tap mean?
2. **Across groups** (a list vs a tray vs the button vs the ✕ chip) nothing overlaps once expanded
   by `HIT_SLOP`. Slop is a group-boundary affordance, not an inter-sibling one.

This surfaced a real geometry constraint: **the gutter between the two columns must exceed
`2 × HIT_SLOP`.** At the 8px gutter the columns' expanded hit rects met in the gap, so a tap 4px into
the gutter was ambiguous. Columns are 264 wide with a 16px gutter, verified passing.

**Backfilled:** `tests/trade.test.js`. `tests/wallets.test.js` is currently the only test importing
from `trade.js` and it imports only `transferGold`/`burnGold` (16 tests, 3 suites) — **`band`,
`buyPrice`, `sellPrice`, `bribeStepCost`, `canTrade` and `mood` have zero coverage.** A
pricing-adjacent change cannot land without a net.

**Extended:** `tests/save-roundtrip.test.js` asserts `_offer` is absent from the save and that
disposition round-trips.

---

## 11. Verification

### The design preview

`game/_design-offer.html` renders this screen at 608×608 against the **real** modules — real `ITEMS`,
real `buyPrice`/`sellPrice`/`band`/`mood`, real `UI` palette and `drawInset`/`drawPanelSmall` chrome,
real VT323 metrics — with Puck copied verbatim from `game/factory-map.json:40`. It is not a drawing of
the screen; it is the screen's arithmetic, and it prints a pass/fail fit report beneath the canvas.

Serve with `python dev-server.py 3001` and open `http://localhost:3001/_design-offer.html` (the dev
server's root is `game/`, not the repo root).

Append `?bad` to the URL to flip it from the overpay scenario to the lowball one and exercise §4.4.

It is **local-only and untracked** — `.gitignore:88` excludes `game/_design-*.html` by project
convention, so it will not be in a fresh clone. Regenerate it from this section if you need it.
All **14** checks pass in both scenarios with a clean console. Three of them were failures it caught,
now recorded as corrections to this spec: the curve denominator (§4.2), the overlap invariant and the
column gutter (§10), and the resentment rounding direction (§4.4).

### In the game


With `npm test` green, then in-browser at `localhost:3001`, console clean, on each of:

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
- **Buy/sell moving disposition on their own.** Only an unbalanced offer does. `reactToTransaction`'s deliberate
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
| 14 | A bad deal is a legitimate move: a deficit is accepted and converts to resentment rather than disabling the commit button. | Caelan |
| 15 | Bad deals are bounded twice — at most 25 points per offer, and never below −25 total. | Caelan |
| 16 | Resentment uses §4.2's curve mirrored (`5 − 4p`), so betrayal is cheaper than affection when they like you and dearer when they don't. | Claude |
| 17 | Untracked and container partners cannot be shortchanged, since they have no resentment to spend. | Claude |
| 18 | Rounding always favours the NPC — goodwill rounds down, resentment rounds up. | Claude |
| 19 | Gold is a single signed field, not two — negative means the NPC pays out. Without it the model cannot express a sale. | Claude |
| 20 | The balance auto-settles to zero as items are staged; the player drags it off zero deliberately. | Claude |
| 21 | The per-NPC ceiling is real, not display-only — it bounds the meter, the curve, and the committed value alike. | Claude |
| 22 | Goodwill is capped at the headroom to that ceiling, so a projection can never exceed the bar it is drawn on. | Claude |
