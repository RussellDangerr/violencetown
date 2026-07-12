# Interaction / UI Polish — NEXT UP

Three small interaction improvements Caelan wants next. All land on **`dev`** (where the car/converter fixes + the dialogue overhaul already live — `dev` tip `fcc8230`). No local Node → verify in-browser (`python dev-server.py 3001` + `window.__game`, restart the server per `.js` edit; screenshots for the visual tweaks). Priority order below.

## 1. One tap on a hotbar item pulls up its action options  ⟵ the real fix

**Now:** `_tapHotbar` (`game/main.js:1693`) is **two-step**: tap a slot → *selects* it (`_selectItem`, `main.js:2266` → `STATE.ITEM_SELECTED`); tap the **same** slot again → `_openItemOverlay()` (`main.js:2271`), which builds `overlayOptions` (a directional Use / Throw / Smash menu) and is tappable via `_tapItemOverlay` (`main.js:1725`, hit-testing `OVERLAY_RECTS`). A number key (1-9) only selects. So a single click "does nothing" (just selects) — Caelan's complaint.

**Want:** clicking/tapping an item's hotkey should immediately pull up that item's options.

**Change:** in `_tapHotbar`, a tap on a **filled** slot → select **and** `_openItemOverlay()` in one step (collapse the 1709-1713 branch so the first tap on a slot-with-an-item opens the overlay). Reuse `_openItemOverlay` / `overlayOptions` / `_tapItemOverlay` unchanged — the options are already tappable. Empty slot → no-op (or select, harmless).

**Design questions to confirm with Caelan first:**
- Does pressing the **number key** (1-9) also open the overlay, or keep number = select + Space = open (the keyboard idiom)? (`main.js:970` is Space→`_openItemOverlay`; `main.js:2266` is `_selectItem`.)
- The overlay is currently a **directional** 4-option menu (up/left/down/right = Use/Smash/…). Fine to keep, or should the item options render as a **tappable list** (like the Target List / the new dialogue rows) for clarity on mobile? (Bigger design call — ask.)

**Hooks:** `_tapHotbar` (1693), `_selectItem` (2266), `_openItemOverlay` (2271), `_tapItemOverlay` (1725), `overlayOptions` (ctor 278), `OVERLAY_RECTS` (layout.js). `_drawItemOverlay` renders it (`renderer.js:1862`).

## 2. Dialogue sizing tweaks (quick one-number knobs)

All in the dialogue code just added (`renderer.js _drawDialogueModal` + `layout.js DIALOGUE_RECT`). Implement a pass, screenshot, tune with Caelan:
- **Bigger disposition badges/tags** (`+8 :)`, `once`, `5 GP` — currently `scale: 1`): in `_drawDialogueModal`, bump the badge + tag `drawText(..., { scale: 1 })` → `scale: 2`; then widen the right-column reserve in `labelChars` (currently `Math.floor((R.w - 128) / 16)` — increase the 128) so labels don't collide, and move the badge/tag x-offsets (`R.x + R.w - 92`, `R.x + R.w - 20`) left to fit.
- **Box smaller / wider:** `DIALOGUE_RECT` in `layout.js` (`{ x:56, y:72, w:496, h:464 }`) — shrink for more tap-out margin (Caelan liked more margin), or widen for fewer label wraps. One line.
- **Taller rows / more spacing:** `padY` (9) and `lineH` (18) in `_drawDialogueModal`.

## 3. (Optional — deprioritized) Left/right = Proceed/Back in dialogue

Caelan **floated this but leaned against it.** Dialogue is single-level (there's no "back" to go to), so ←/→ have little to do. **Skip unless he asks.** If pursued: the dialogue keyboard handler is `main.js:1026-1040` (currently ↑/↓ or W/S = cursor, Space/Enter = pick, E/Esc = leave).

---

**Done-when:** tapping any hotbar item opens its action options in one tap; the dialogue badges/tags/box/rows are sized to Caelan's liking (screenshot-approved); left/right is only touched if he changes his mind. Verify each in-browser, 0 console errors.
