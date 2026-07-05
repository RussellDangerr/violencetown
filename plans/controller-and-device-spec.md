# Controller-first input model + the pull-out Device — SPEC

Status: **DESIGN SPEC (2026-07-05)** — no code yet. Companion interactive mockup:
`game/_design-controller-device.html`. This doc + the mockup are for reaction;
the build is a follow-up. Diagnosis + hooks come from the input & menu audits.

## Why

Input accreted across four half-overlapping mediums (keyboard, the radial wheel,
mouse/touch taps, a mobile d-pad+buttons) with **no logical layer** tying them
together. Result: ~70 distinct actions, **zero native gamepad support**, and hard
medium gaps — **11 keyboard-only** actions (bribe, dialogue nav, journal
scroll/tab, pause) and **18 touch-only** (buy/sell/offer, unequip, the ☰ menu,
quest-HUD tap). On a gamepad (Steam Deck) that incoherence has nowhere to go.

## Principles

1. **One logical layer, three physical bindings.** Define a fixed set of *logical
   buttons* sized to a standard gamepad. Keyboard, touch, and the Gamepad API each
   bind every logical button. Per-state dispatch reads *logical intents*, never raw
   keys. The pad's budget becomes a hard design constraint.
2. **Every action reachable on every medium.** No more single-medium orphans.
3. **Keep what's already console-native.** The radial wheel stays (RDR2/Mass
   Effect-style); it's re-grounded onto pad buttons, not replaced.
4. **Menus split by kind.** *Status* screens (items, gear, quests, map) fold into
   one pull-out **Device**; *world-interaction* surfaces (wheel, target wheel,
   dialogue, trade, examine) stay contextual.

---

## 1. Logical buttons (the budget)

| Logical | Xbox | PS | Deck | Meaning |
|--------|------|----|----|---------|
| **MOVE** (4-dir) | D-pad / LS | D-pad / LS | D-pad / LS | move·turn · cycle a wheel/menu · move a cursor · nudge the aim reticle |
| **CONFIRM** | A | ✕ | A | primary: interact the faced thing · drill/fire in the wheel · select · pick · buy/sell |
| **CANCEL** | B | ○ | B | back · close the wheel/device · leave a menu |
| **ITEM** | X | □ | X | quick-use the selected hotbar item · *hold* → the item overlay (use/throw/smash) |
| **FOCUS** | Y | △ | Y | open the **Target Wheel** on the faced target (its examine/talk/trade/hit verbs) |
| **WHEEL** | RB | R1 | R1 | open / close the **action wheel** |
| **CYCLE** | LB | L1 | L1 | cycle the selected hotbar slot · switch Device tab |
| **THROW** | RT | R2 | R2 | quick-throw the selected item, then aim with MOVE |
| **DEVICE** | Start ≡ | Options | ≡ | pull out / pocket the **Device** |
| **WAIT** | Back ⊟ | Share | ⊟ | pass one turn |
| *(reserved)* | LT · L3 · R3 | | | future: sprint / quick-turn / camera — **open, decide via mockup** |

## 2. Physical bindings

Keyboard has more keys than the pad, so it keeps familiar shortcuts *in addition*
to the logical set; touch gets an on-screen d-pad + a compact face-cluster. Every
logical intent is bound on all three.

| Logical | Gamepad (standard mapping) | Keyboard | Touch |
|--------|----------------------------|----------|-------|
| MOVE | D-pad (12–15) / LS axes | WASD · Arrows | on-screen d-pad |
| CONFIRM | A (0) | Space · Enter · **E** (world interact) | ⓐ face btn / tap target |
| CANCEL | B (1) | Esc | ⓑ face btn |
| ITEM | X (2) | **1–9** select · Space use | ⓧ face btn / tap hotbar |
| FOCUS | Y (3) | **F** | ⓨ face btn |
| WHEEL | RB (5) | **Space** (in world) | ✦ btn |
| CYCLE | LB (4) | **Tab** · `[` `]` | ◂▸ tab/cycle btn |
| THROW | RT (7) | (via wheel/overlay) | (via overlay) |
| DEVICE | Start (9) | **I** or **Tab** (long) | ☰ btn (repurposed) |
| WAIT | Back (8) | **T** | Device/long-press |
| Direct shortcuts (kbd only) | — | **J** Quests · **M** Map · **C** Gear · **L** Log | — |

> Keyboard keeps J/M/C/L as express shortcuts *into* the Device's tabs (and the Log)
> so muscle memory survives; on pad/touch you reach them via DEVICE + CYCLE.

## 3. Per-context action maps

The same logical buttons re-purpose by state — that's what makes the budget work.

### World (IDLE)
| Button | Action |
|--------|--------|
| MOVE | walk / turn one tile |
| CONFIRM (A) | interact the faced thing — talk / examine / trade, whichever fits (absorbs today's `E`) |
| FOCUS (Y) | open the Target Wheel on the faced target (full verb set) |
| WHEEL (RB) | open the action wheel (Fight / Trick / Treat) |
| ITEM (X) | quick-use selected hotbar item · hold → item overlay |
| THROW (RT) | quick-throw selected item → aim |
| CYCLE (LB) | cycle selected hotbar slot |
| DEVICE (≡) | pull out the Device |
| WAIT (⊟) | pass a turn |
| CANCEL (B) | (idle: nothing / future "ready" stance) |

### Action Wheel (open)
Maps 1:1 onto the existing `cycle` / `drill` / `back` grammar in `wheel-model.js`.
| Button | Action |
|--------|--------|
| MOVE ←→ | cycle the active ring (prev / next slice) |
| CONFIRM (A) | drill into a category · fire a leaf action |
| CANCEL (B) | back up one ring · close the wheel at the root |
| WHEEL (RB) | close the wheel |
| **Aim sub-state** MOVE | nudge the reticle (clamped to range) |
| **Aim** CONFIRM (A) | fire the aimed action |
| **Aim** CANCEL (B) | exit aim, back to the wheel |

*Feel option to prototype:* **hold-RT radial** (hold to open, MOVE to pick, release
to fire, B to cancel) vs. the tap-toggle above. Mock both; pick by feel.

### Target Wheel (FOCUS / tap-a-thing)
Stays **touch-first** (tap any world thing → its verbs). On pad it's FOCUS(Y) on
the faced target; MOVE spins verbs, CONFIRM fires, CANCEL closes. Its role largely
overlaps the action wheel + CONFIRM-interact, so it eases pad pressure rather than
demanding its own buttons.

### Device (open)
| Button | Action |
|--------|--------|
| CYCLE (LB) / WHEEL (RB) | previous / next tab (ITEMS ▸ GEAR ▸ QUESTS ▸ MAP) |
| MOVE | move the cursor within the tab (grid / list / map) |
| CONFIRM (A) | act on the focused thing — use item · equip/unequip · read entry |
| CANCEL (B) / DEVICE (≡) | pocket the Device |

### Dialogue
| Button | Action |
|--------|--------|
| MOVE ↑↓ | move the choice cursor |
| CONFIRM (A) | pick the choice |
| CANCEL (B) | leave the conversation |
*(Now works identically on keyboard, touch — tappable rows — and pad; closes the
dialogue-nav keyboard-only gap.)*

### Trade
| Button | Action |
|--------|--------|
| MOVE | move a cursor across the buy / sell / buyback grids |
| CONFIRM (A) | buy · sell · offer the focused cell |
| FOCUS (Y) | Bribe (raises mood) — was the `B` keyboard-only orphan |
| CANCEL (B) | close the window |
*(Buy/sell/offer become cursor+CONFIRM, closing the touch-only trade gap for
keyboard/pad; Bribe gets an on-screen affordance for touch.)*

### System
Pause folds into the Device (opening it soft-pauses the turn-based world) or a
Device "system" row (Wait / Help / Restart), so `P` and the ☰ sheet's
Wait/Help/Restart stop being medium-specific. Options/Log stay their own overlays
this pass (reachable from the Device's system row + keyboard L).

## 4. The Device

A handheld the character **pulls from a pocket** — slides up from the bottom of the
screen on open, drops back on close (the tactile "pull it out" beat). Tabs:

- **ITEMS** — the full inventory (the hotbar is the *quick* subset; this is the
  manage view). CONFIRM = use; hold/secondary = drop/throw.
- **GEAR** — the Vitruvian equipment screen (absorbs `[C]` `STATE.EQUIPMENT`).
  CONFIRM on a slot = equip/unequip (closes the unequip touch-only gap for pad/kbd).
- **QUESTS** — the journal checklist + witness log (absorbs `[J]`).
- **MAP** — the rudimentary world map (absorbs `[M]`).

DEVICE(≡) toggles it; CYCLE/RB switch tabs; MOVE navigates; CONFIRM acts; CANCEL
pockets it. **Retires:** the `[C]` equipment screen, the `[J]/[M]` journal entries,
and trims the ☰ sheet (Equipment leaves it). **Stays this pass:** the `[L]` message
log and the Options modal (their own overlays), the always-on HP/MP/GP + hotbar HUD.

*Open:* Quests + Map as **two tabs** vs. one tab with a sub-toggle (as the journal
is today). Mock both.

## 5. Closing the medium gaps (from the audit)

| Orphan (was) | Fixed by |
|--------------|----------|
| Buy / sell / offer — *touch only* | MOVE cursor + CONFIRM on the trade grid (all mediums) |
| Unequip — *touch only* | CONFIRM on a slot in the Device GEAR tab |
| ☰ menu access — *touch only* | DEVICE(≡) button on every medium |
| Quest-HUD tap — *touch only* | always-on HUD stays tappable; else DEVICE → QUESTS |
| Bribe (`B`) — *keyboard only* | FOCUS(Y) / an on-screen Bribe affordance in Trade |
| Dialogue nav / pick — *keyboard only* | MOVE + CONFIRM + tappable rows |
| Journal scroll / tab — *keyboard only* | MOVE scrolls, CYCLE/RB switch tabs, touch tap-scroll |
| Pause (`P`) — *keyboard only* | Device soft-pause / system row (all mediums) |
| Log scroll (touch coarse) | MOVE scrolls finely on all mediums |

## 6. Open sub-decisions (the mockup surfaces these)

- Wheel: **tap-toggle** vs **hold-RT radial** — feel test.
- `WAIT` on Back(⊟) vs. only the wheel's Flight→Wait.
- `LT / L3 / R3`: leave reserved, or assign (sprint / quick 180° turn / recenter).
- Quests + Map: **two tabs** vs. one tab + sub-toggle.
- Does opening the Device **soft-pause** the world? (turn-based → probably yes.)
- Hotbar: stays an always-on quick bar (recommended) vs. Device-only.
- Touch face-cluster: how many on-screen buttons, and where (right thumb reach).

## 7. Build hooks — DEFERRED to the follow-up plan

The audit mapped these so the build is shovel-ready:
- **`game/input.js` (new)** — the virtual-controller layer. Normalize keyboard
  (`main.js` keydown handler ~816–1111), touch (`index.html` `#touch-controls` +
  the `data-key` synthesis ~1113–1160), and **Gamepad API polling** (an rAF loop
  reading `navigator.getGamepads()`, "standard" mapping, edge-detect for
  press/release) into logical intents. The per-`STATE` dispatch then reads intents.
- **The Device** — a new `STATE.DEVICE` + `renderer._drawDevice`; its tab bodies
  reuse `_drawHotbar` / `_drawEquipmentModal` / `_drawJournal`. Retire
  `STATE.EQUIPMENT` and the `[C]/[J]/[M]` entry points; trim the ☰ sheet.
- **The wheel** — bind open/cycle/drill/back to logical intents; `wheel-model.js`
  is unchanged (its grammar already fits).
- **Touch** — replace the ad-hoc ✦/☰ with the face-cluster + DEVICE button.
- Regression risk is high (this rewires all input) → the follow-up plan does it in
  slices behind the logical layer, verifying each medium still reaches every action.
