# Violencetown — Unified Interaction Model + Controller + Remoticon — SPEC

Status: **DESIGN SPEC (2026-07-05)** — no game code yet; the build is a follow-up
(`writing-plans` produces the ordered plan from this). Diagnosis + hooks come from the
input & menu audits + the interaction-model brainstorm. Companion interactive mockup:
`game/_design-controller-device.html` (gitignored local; also published as an Artifact).

## Why

Input accreted across four half-overlapping mediums (keyboard, the radial wheel, mouse/touch
taps, a mobile on-screen d-pad) with **no logical layer**. Result: ~70 actions, **zero
native gamepad support**, and hard medium gaps — **11 keyboard-only** (bribe, dialogue nav,
journal scroll/tab, pause) and **18 touch-only** (buy/sell/offer, unequip, the ☰ menu,
quest-HUD tap). The mobile overlay controls also cause concrete pain: the iPhone double-tap
magnifier grabs the HTML buttons, the scale/screen-size is cramped, and there's no
confidence a bare tap "does everything." On a gamepad (Steam Deck) the incoherence has
nowhere to go.

## The interaction model — device-native, one atom underneath

The brainstorm's key unlock: **"mobile controls" and "a controller" are different devices,
and no device needs two schemes at once.** Everything resolves to one atom — **a *target* +
an *action*** — feeding the same surfaces (action wheel, target list, remoticon). Each
device gets its own *native* selection method (Caelan approved device-native divergence):

- **Pointer (desktop mouse + phone touch) — Baldur's Gate 3 × RuneScape.** Click/tap a tile
  → pathfind there. Click/tap a *thing* → pathfind adjacent + perform its **default action**,
  or pop the **target list** for the full options. Movement is click-to-destination
  (tick-walked); "path-then-act" falls out of it (click an enemy + Attack → walk over →
  strike). **No on-screen d-pad/buttons** — the only persistent on-screen UI is the
  action-wheel opener (bottom-right) + the Remoticon button. Identical on desktop and phone;
  **mobile goes landscape**, full screen.
- **Controller (Steam Deck / gamepad) — keep stick/d-pad walking.** Real sticks,
  facing/nearest-target auto-selection, one button to act. The *on-screen* d-pad is removed
  (a touch crutch); real pads use real inputs. Like BG3 on the Deck, a player *may* also
  click; the main method just has to be solid.
- **Keyboard — a power-user layer on desktop**, on top of the mouse.

All feed the **same logical intents**; the pointer never drives an emulated cursor on the
pad, and the pad never fakes a cursor — nothing to "reconcile." The cursor is a mouse-only
affordance; touch taps the point directly; the pad uses facing.

## The Remoticon (the "device" — with lore + two modes)

The pull-out device is the **REMOTICON** — an in-fiction remote/utility gadget: a wallet,
phone, and scanner in one, whose power is *information* and *selection*.

- **HOLSTERED (default — on the belt) = the HUD + world overlays.** Not a screen you open —
  the always-on layer: HP/MP/GP, buffs, the quest line, *and* each character's
  **disposition / hostility / your-options** readout on the world. In fiction the belt unit
  projects a light overlay; in game it's *why* the HUD + target readouts exist. **The
  existing HUD, disposition faces, and the target-option list ARE this one system** — a
  reframe, not new features.
- **IN-HAND (press REMOTICON) = the tabbed menu.** Projected screen; the player waves it
  (motion feel) to select. Opening it **soft-pauses** the turn-based world.

**Look:** a Nokia-candybar silhouette, **~90% screen** (thin bezel), **Game Boy Color LCD**
(color, not mono) — Snake-era hardware, GBC palette.

## Principles

1. **One logical layer, many bindings.** A fixed set of *logical intents* (§1). Gamepad,
   keyboard, and pointer each map to them; per-`STATE` dispatch reads intents, not raw keys.
2. **Every action reachable on every medium.** No single-medium orphans (§5).
3. **Keep what's console-native.** The radial action wheel stays; re-grounded onto intents.
4. **Two surfaces, two silhouettes.** The **action wheel** is the ONLY radial one; the
   **target menu is a LIST** (RuneScape-style) — so you never wonder "which wheel am I on?".
5. **Menus split by kind.** *Status* screens fold into the pull-out **Remoticon**;
   *world-interaction* surfaces (action wheel, target list, dialogue, trade, examine) stay contextual.

---

## 1. Logical intents (the budget)

| Logical | Xbox | PS | Deck | Meaning |
|--------|------|----|----|---------|
| **MOVE** (4-dir) | D-pad / LS | D-pad / LS | D-pad / LS | move·turn · cycle a wheel/list · move a cursor · nudge the aim reticle |
| **CONFIRM** | A | ✕ | A | primary: interact the faced thing · drill/fire in the wheel · pick · buy/sell |
| **CANCEL** | B | ○ | B | back · close the wheel/remoticon · leave a menu |
| **ITEM** | X | □ | X | quick-use the selected hotbar item · *hold* → the item overlay |
| **FOCUS** | Y | △ | Y | open the **Target List** on the faced target — its ordered options |
| **WHEEL** | RB | R1 | R1 | open / close the **action wheel** |
| **CYCLE** | LB | L1 | L1 | cycle the selected hotbar slot · switch Remoticon tab |
| **THROW** | RT | R2 | R2 | quick-throw the selected item, then aim with MOVE |
| **REMOTICON** | Start ≡ | Options | ≡ | pull out / pocket the **Remoticon** (in-hand menu; soft-pauses) |
| **WAIT** | Back ⊟ | Share | ⊟ | pass one turn |
| *(reserved)* | LT · L3 · R3 | | | **reserved for now** (future: sprint / quick-turn / camera) |

## 2. Physical bindings

Three mediums bind the intents. **Gamepad** is the tight budget. **Keyboard** keeps familiar
keys (it has room). **Pointer (mouse + touch)** mostly doesn't press "buttons" at all — it
**taps the world** (→ move / interact / target list) plus two on-screen affordances; menus
are directly tappable.

| Logical | Gamepad (standard) | Keyboard | Pointer (mouse + touch) |
|--------|--------------------|----------|-------------------------|
| MOVE | D-pad (12–15) / LS | WASD · Arrows | tap a tile → **path there** (no d-pad) |
| CONFIRM | A (0) | **Space** · Enter (also **E**) | tap a thing → default action · tap a menu row/cell |
| CANCEL | B (1) | **Esc** | tap outside / a Cancel row |
| ITEM | X (2) | **R** · **1–9** select | tap a hotbar slot |
| FOCUS | Y (3) | **F** | (a tap already opens the target list) |
| WHEEL | RB (5) | **Q** | the **action-wheel opener** (bottom-right) |
| CYCLE | LB (4) | `[` · `]` | tab buttons in the Remoticon |
| THROW | RT (7) | **G** | via the wheel / item overlay |
| REMOTICON | Start (9) | **Tab** (alt `~`) | the **Remoticon button** (replaces ☰) |
| WAIT | Back (8) | **T** | a Wait affordance (wheel / remoticon) |
| Express (kbd) | — | **C** Gear · **J** Quests · **M** Map (→ Remoticon tab) · **L** Log | — |

> **A = Space.** CONFIRM is the most-used action; Space is its keyboard home. Space *today*
> opens the wheel — but on a pad **A (confirm) and RB (wheel) are separate**, so keyboard
> mirrors that: the wheel moves to **Q**, Space becomes CONFIRM everywhere. Muscle memory
> survives where it counts — **inside the wheel, Space still fires**. `E` stays a
> world-interact alias.

## 3. Per-context action maps

### World (IDLE)
| Intent | Action |
|--------|--------|
| MOVE (pad/kbd) | walk / turn one tile · (pointer: tap a tile → path there) |
| CONFIRM | interact the faced thing (talk/examine/trade) · (pointer: tap a thing → default action) |
| FOCUS | open the **Target List** on the faced/tapped target (full options) |
| WHEEL | open the action wheel (Fight / Trick / Treat) |
| ITEM | quick-use selected hotbar item · hold → item overlay |
| THROW | quick-throw selected item → aim |
| CYCLE | cycle selected hotbar slot |
| REMOTICON | pull out the Remoticon |
| WAIT | pass a turn |

### Action Wheel (open) — maps 1:1 onto `wheel-model.js` `cycle`/`drill`/`back`
| Intent | Action |
|--------|--------|
| MOVE ←→ | cycle the active ring |
| CONFIRM | drill a category · fire a leaf |
| CANCEL | back a ring · close at the root |
| WHEEL | close the wheel |
| **Aim** MOVE / CONFIRM / CANCEL | nudge reticle / fire / exit aim |

Moved to the **bottom-right** of the viewport (thumb reach, phone + Deck). **Two open-modes
built (accessibility): hold-to-open radial *and* tap-toggle — toggled in Options** (outside
the Remoticon; likely the first player setting; stored in `settings.js`).

### Target List (FOCUS / click a thing) — a RuneScape menu, NOT a wheel
A vertical ordered LIST (only the action wheel is radial). Opened by FOCUS(Y) or by
clicking/tapping any world thing. MOVE ↑↓ + CONFIRM to pick; CANCEL closes. Ordered by
convention (default on top; `Walk here`/`Examine`/`Cancel` at the bottom):

| Target | List (top → bottom; top = default / bare-click) |
|--------|--------------------------------------------------|
| Friendly NPC | **Talk to** · Trade with · Bribe · Walk here · Examine · Cancel |
| Hostile NPC | **Attack** · Bribe · Throw at · Walk here · Examine · Cancel |
| Ground item | **Take** · Walk here · Examine · Cancel |
| Examinable / POI | **Examine** · Walk here · Cancel |
| Empty tile | **Walk here** · Cancel |

`Walk here` = path to that tile without interacting. Adjacency-gated verbs (Talk/Trade/
Bribe/Attack) **auto-path first, then fire** (BG3/RS drag-to-melee). Reuses
`targetVerbs(target, game)` from `wheel-model.js`, re-ordered + drawn as a list.
New `renderer._drawTargetList` + `STATE.TARGET_LIST` (retire `STATE.TARGET_WHEEL`).

### Remoticon (in-hand)
| Intent | Action |
|--------|--------|
| CYCLE / WHEEL | previous / next tab (ITEMS ▸ GEAR ▸ QUESTS ▸ MAP) |
| MOVE | navigate within the tab |
| CONFIRM | use item · equip/unequip · read entry |
| CANCEL / REMOTICON | pocket it |

### Dialogue / Trade
Dialogue: MOVE ↑↓ pick, CONFIRM choose, CANCEL leave (tappable rows too — closes the
keyboard-only gap). Trade: MOVE a cursor over the grids, CONFIRM buy/sell/offer, FOCUS(Y)
bribe (was the keyboard-only `B`), CANCEL close.

## 4. Pointer interaction detail (click-to-move + path-then-act) + mobile fixes

- **Click-to-move:** a tapped tile pathfinds via `pathing.js` `getGreedyStep`, walking
  tile-by-tick (the game's turn/tick system, RuneScape-style). No manual tile-stepping on
  pointer; stepping stays on the controller.
- **Click-to-interact:** a tap resolves via `_screenToTile` + `_targetAt(x,y)`: entity →
  path adjacent + default action (or the target list); ground item → path + Take; empty →
  Walk here. Adjacency verbs auto-path then fire.
- **Mobile fixes:** **remove `#touch-controls`** from `index.html`; add `touch-action:none`
  + `user-select:none` (+ `-webkit-user-select`) on the canvas to kill the iPhone magnifier
  / text-selection hijack; **landscape** layout; a first-run **"tap to move · tap things to
  act"** hint so a buttonless screen reads clearly.

## 5. Closing the medium gaps (from the audit)

| Orphan (was) | Fixed by |
|--------------|----------|
| Buy / sell / offer — *touch only* | MOVE cursor + CONFIRM on the trade grid (all mediums) |
| Unequip — *touch only* | CONFIRM on a slot in the Remoticon GEAR tab |
| ☰ menu access — *touch only* | REMOTICON button/intent on every medium |
| Quest-HUD tap — *touch only* | always-on HUD stays tappable; else REMOTICON → QUESTS |
| Bribe (`B`) — *keyboard only* | FOCUS(Y) in Trade / a Bribe row (all mediums) |
| Dialogue nav / pick — *keyboard only* | MOVE + CONFIRM + tappable rows |
| Journal scroll / tab — *keyboard only* | MOVE scrolls, CYCLE/WHEEL switch tabs, pointer tap-scroll |
| Pause (`P`) — *keyboard only* | Remoticon soft-pause (all mediums) |

## 6. Sub-decisions — RESOLVED (2026-07-05)

- ✅ Interaction: **device-native** — pointer = click-to-move/interact (BG3×RS); controller
  = keep stick/d-pad; keyboard = power-user layer. Divergence is by design.
- ✅ Target menu: a **RuneScape list**, not a wheel (only the action wheel is radial).
- ✅ Mobile: **scrap the on-screen d-pad/buttons**; pure tap; landscape.
- ✅ Wheel: **build BOTH** hold-radial + tap-toggle, **toggle in Options**; wheel moves to
  **bottom-right**.
- ✅ Remoticon: two modes (holstered-HUD / in-hand-menu); **soft-pause on open**; four tabs
  (**ITEMS · GEAR · QUESTS · MAP**, Quests & Map separate); **Nokia · ~90% screen · GBC**.
- ✅ Keyboard: every intent bound; **CONFIRM = Space**, wheel → **Q**.
- ✅ `LT / L3 / R3`: **reserved**.
- Still open (settle in build): `WAIT` on Back vs. wheel-only; exact first-run-hint copy;
  the Remoticon's projected-screen framing.

## 7. Build roadmap (for `writing-plans` to order into slices)

Large rework → **mergeable slices behind the logical layer**, regression-gating every slice
against the per-medium reachability matrix (every action reachable by mouse, touch, keyboard,
gamepad):

1. **Logical input layer** — new `game/input.js`: normalize keyboard (`main.js` keydown
   ~816–1111), touch/pointer (`_onCanvasPointerDown` ~1189–1673, `_screenToTile`/`_targetAt`),
   and **native Gamepad API** (rAF poll of `navigator.getGamepads()`, "standard" mapping,
   press/release edge-detect) into intents; per-`STATE` dispatch reads intents. No behavior
   change yet — the foundation.
2. **Pointer model** — click-to-move + click-to-interact (path-then-act via `getGreedyStep`);
   **remove `#touch-controls`**; landscape + canvas `touch-action`/`user-select` + first-run hint.
3. **Target list** — `renderer._drawTargetList` + `STATE.TARGET_LIST`, ordered per §3;
   reuse `targetVerbs`; retire `STATE.TARGET_WHEEL`.
4. **Action wheel** — move to bottom-right (`RADIAL_CENTER_*` in `layout.js`) + intent
   bindings + the Options open-mode toggle (`settings.js`). `wheel-model.js` grammar unchanged.
5. **Remoticon** — `STATE.DEVICE` + `renderer._drawDevice`; tab bodies reuse `_drawHotbar` /
   `_drawEquipmentModal` / `_drawJournal`; holstered-HUD reframe; soft-pause; GBC/Nokia look.
   Retire `STATE.EQUIPMENT` + `[C]/[J]/[M]` entries; trim the ☰ sheet.
6. **Native Gamepad API** — finalize polling → intents (may land inside slice 1).

**Verification:** the reachability matrix per slice; in-browser via `python dev-server.py
3001` + `window.__game` (pointer click-to-move/interact/path-then-act; a mobile landscape
viewport with no overlay controls + suppressed magnifier + canvas-landing taps; the target
list; wheel bottom-right; Remoticon open/soft-pause; gamepad intents if a pad is present);
`npm test` where `node` exists for the pure logic (intent normalization, target resolution,
list ordering, path-then-act). Build later via `using-git-worktrees` +
`subagent-driven-development`/`executing-plans` + `test-driven-development`.
