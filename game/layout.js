// layout.js — single source of truth for in-canvas UI geometry.
//
// Both the renderer (which DRAWS these surfaces) and main.js (which HIT-TESTS
// taps against them) import from here, so a tap always lands where the panel
// is actually drawn. Previously each module kept its own copy and they drifted
// — the item-overlay "Use" and the throw/give "up" targets both ended up a
// full tile above their panels, so touch users couldn't hit them. Keeping the
// geometry in one neutral module (no game-logic imports) removes that risk.
//
// All values are in the fixed 608x608 internal canvas coordinate space.

// (ring Task 5) rings.js is a PURE slot model (no game/DOM deps), so importing it
// keeps this module dependency-light while letting the hands geometry derive from
// the one source of truth for the unlock ladder + adjacency.
import { unlockedSlots, adjacentPairs, HANDS } from './rings.js';

export const CANVAS_INTERNAL_PX = 608;   // mirrors data.js CANVAS_PX
export const HIT_SLOP = 6;               // tap-zone expansion (Apple 44pt min target)

// Pure rect intersection — true iff a and b share positive area. Edge-touching
// (a.right === b.left) is NOT overlap, so panels may abut without clipping.
export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

// Grow a rect by `slop` on every side — used to test the TAP zone (HIT_SLOP)
// for overlap, not just the drawn rect, so no tap can land ambiguously.
export function expandRect(r, slop) {
  return { x: r.x - slop, y: r.y - slop, w: r.w + 2 * slop, h: r.h + 2 * slop };
}

// ── Item-use overlay — a compact tappable list of the item's actions ──
// (drawn by renderer._drawItemOverlay, hit-tested by main._tapItemOverlay).
// Was four directional panels around the player tile; now a vertical verb list
// like the Target List, so ONE tap on a hotbar item opens options big enough to
// tap on mobile. Height is computed per-item in the renderer (44px title band +
// one ROW_H row per option).
export const ITEM_OVERLAY_RECT  = { x: 196, y: 176, w: 216 };
export const ITEM_OVERLAY_ROW_H = 30;
export function itemOverlayRowRect(i) {
  return { x: ITEM_OVERLAY_RECT.x + 10, y: ITEM_OVERLAY_RECT.y + 44 + i * ITEM_OVERLAY_ROW_H, w: ITEM_OVERLAY_RECT.w - 20, h: ITEM_OVERLAY_ROW_H - 4 };
}

// ── Throw / Give direction prompt — 4 cardinal 32x32 targets ──
// (drawn by renderer._drawThrowPrompt, hit-tested by main._tapThrowPrompt)
export const THROW_RECTS = {
    up:    { x: 288, y: 254, w: 32, h: 32 },
    down:  { x: 288, y: 338, w: 32, h: 32 },
    left:  { x: 254, y: 288, w: 32, h: 32 },
    right: { x: 338, y: 288, w: 32, h: 32 },
};

// ── Hotbar — 9 inventory slots along the bottom ──
// Panel origin (OX/OY) + slot positions, all derived from one formula so the
// drawn slots and the tap zones can't diverge.
export const HOTBAR_SLOT_W = 42;
export const HOTBAR_SLOT_H = 42;
export const HOTBAR_GAP    = 3;
export const HOTBAR_SLOTS  = 9;
export const HOTBAR_PAD    = 16;                                   // extra panel width beyond the slots
export const HOTBAR_STRIDE = HOTBAR_SLOT_W + HOTBAR_GAP;           // 45
export const HOTBAR_TOTAL_W = HOTBAR_SLOTS * HOTBAR_STRIDE - HOTBAR_GAP + HOTBAR_PAD; // 418
export const HOTBAR_OX = (CANVAS_INTERNAL_PX - HOTBAR_TOTAL_W) / 2;   // 95  (panel origin x)
export const HOTBAR_OY = CANVAS_INTERNAL_PX - HOTBAR_SLOT_H - 20;     // 546 (panel origin y)
export const HOTBAR_X_START = HOTBAR_OX + 8;                         // 103 (first slot x)
export const HOTBAR_Y       = HOTBAR_OY + 2;                         // 548 (slot y)

// ── XMB usable-bar (bottom HUD) ────────────────────────────────────────────
// A horizontal row of category chips over a single "current item" cell, aligned
// to the bottom where the flat hotbar used to sit (HOTBAR_OY..+SLOT_H).
export const XMB_CHIP_W   = 96;
export const XMB_CHIP_H   = 20;
export const XMB_CHIP_GAP = 6;
export const XMB_ITEM_H   = 46;   // current-item cell height (icon + name band)

// Geometry for the XMB bar given a built bar ({columns:[{key,label,items}]}).
// Returns { chips:[{key,label,x,y,w,h}], current:{x,y,w,h}, up, down, bottom }.
export function xmbBarLayout(bar) {
    const cols = (bar && bar.columns) || [];
    const cx = CANVAS_INTERNAL_PX / 2;
    const bottom = HOTBAR_OY + HOTBAR_SLOT_H;                 // 588 — align with old hotbar bottom
    const chipY = bottom - XMB_ITEM_H - XMB_CHIP_H - 6;
    const n = cols.length;
    const totalW = n > 0 ? n * XMB_CHIP_W + (n - 1) * XMB_CHIP_GAP : 0;
    const startX = Math.round(cx - totalW / 2);
    const chips = cols.map((c, i) => ({
        key: c.key, label: c.label,
        x: startX + i * (XMB_CHIP_W + XMB_CHIP_GAP), y: chipY, w: XMB_CHIP_W, h: XMB_CHIP_H,
    }));
    const iconSize = XMB_ITEM_H - 6;                          // 40
    const itemY = chipY + XMB_CHIP_H + 6;
    const current = { x: Math.round(cx - iconSize / 2), y: itemY, w: iconSize, h: iconSize };
    const up   = { x: current.x + current.w + 10, y: itemY - 4,               w: 18, h: 14 };
    const down = { x: current.x + current.w + 10, y: itemY + current.h - 10,  w: 18, h: 14 };
    return { chips, current, up, down, bottom };
}

// The XMB usable-bar's background PANEL rect for `n` visible category chips
// (1-3), mirroring renderer.js:1978-1980. n=3 is the worst case (widest). The
// bar is centered on canvas-center x=304; chip stride is XMB_CHIP_W(96)+6.
export function xmbBarPanelRect(n = 3) {
  const chipW = 96, gap = 6, stride = chipW + gap;   // 102
  const totalChips = n * stride - gap;               // n=3 -> 300
  const left = 304 - totalChips / 2 - 10;            // n=3 -> 144
  const right = 304 + totalChips / 2 + 10;           // n=3 -> 464
  const top = 510, bottom = 592;                     // chipY-6 .. current-bottom+10
  return { x: left, y: top, w: right - left, h: bottom - top };
}

// The set of INTERACTIVE HUD panels visible+tappable in a given game-state
// name. Each entry { name, rect } is what a tap can hit. The invariant: no two
// of these may overlap (under HIT_SLOP), or a tap is ambiguous. 'idle' is the
// only always-live combination (message log + usable bar); the modal states
// are exclusive overlays tested separately if they gain persistent siblings.
export function hudInteractiveRects(state) {
  const rects = [];
  if (state === 'idle') {
    rects.push({ name: 'questlog', rect: QUESTLOG_RECT });
    rects.push({ name: 'xmb', rect: xmbBarPanelRect(3) });
  }
  return rects;
}

// ── Radial "sunburst" combat wheel ──
// Concentric rings centred on RADIAL_CENTER_*: a hub, the greyed decision-stack
// rings growing inward, one bright active ring, and a partial preview arc above
// the top pointer. Shared by renderer._drawWheel (draw) and main._tapRadialMenu
// (hit-test). The preview-arc band and pointer are derived adaptively in
// renderer._drawWheel from wheelRingR(depth).
// (interaction polish) Compact wheel tucked into the BOTTOM-RIGHT corner, so it
// no longer dominates the screen and sits opposite the bottom-left message log
// (QUESTLOG_RECT, right edge x=346). Clearance is LOCKED to the wheel's real max
// span: the deepest ACTIVE ring is wheelRingR(2) (outer 120) at depth 3 (Fight→
// Melee — no depth-4 ring exists in wheel-model.js), ▲FIRE cue / flapper above the
// top pointer. At (477,416) with the 1.05 open-overshoot (max radius 126): right
// 477+126=603 < 608; left 477-126=351 > 346 (clears the log); bottom 416+126=542
// < HOTBAR_OY 546; top clears 0. Re-measure if wheel-model.js gains a 4th ring.
export const RADIAL_CENTER_X = 477, RADIAL_CENTER_Y = 416;
export const WHEEL_HUB_R    = 24;            // centre 'MENU' disc radius
export const WHEEL_RING_W    = 28;           // radial thickness of each full ring
export const WHEEL_RING_GAP  = 4;            // gap between adjacent rings
export const WHEEL_RING0_R0  = 28;           // inner edge of the first ring out from the hub
export const WHEEL_TILE_GAP  = 0.03;         // angular gap between tiles (radians)
// Ring k's [inner, outer] radius (k = 0 nearest the hub).
export function wheelRingR(k) { const r0 = WHEEL_RING0_R0 + k * (WHEEL_RING_W + WHEEL_RING_GAP); return [r0, r0 + WHEEL_RING_W]; }

// ── Quest Log panel (bottom-left) + [L] history modal panel ──
// One consolidated "Quest Log" box holding the zone/time/turn header, the active
// objective, and the last few log-feed lines. Sits above the hotbar (HOTBAR_OY
// = 546). Shared by renderer._drawQuestLog (draw) and main.js (tap → [L] history).
// h chosen so the panel's HIT_SLOP-expanded bottom (y + h + 6) clears the XMB
// usable-bar's HIT_SLOP-expanded top (510 - 6 = 504): 436 + 62 + 6 = 504.
// Enforced by tests/hud-layout.test.js's non-overlap invariant.
export const QUESTLOG_RECT = { x: 6, y: 436, w: 340, h: 62 };
export const LOG_MODAL_RECT = { x: 24, y: 44, w: 560, h: 520 };
// (Target List) A compact centred RuneScape-style verb menu. Height is computed
// per-target in the renderer (44px title band + one ROW_H row per verb).
export const TARGET_LIST_RECT  = { x: 180, y: 150, w: 248 };
export const TARGET_LIST_ROW_H = 30;
export function targetListRowRect(i) {
  return { x: TARGET_LIST_RECT.x + 10, y: TARGET_LIST_RECT.y + 44 + i * TARGET_LIST_ROW_H, w: TARGET_LIST_RECT.w - 20, h: TARGET_LIST_ROW_H - 4 };
}

// ── Trade window (Puck's shop — trade Slice 1) ──
// (drawn by renderer._drawTradeModal, hit-tested by main._tapTrade). Two 3-wide
// grids side by side: BUY (the vendor's stock) on the left, SELL (the player's
// bag) on the right. One cell-rect helper feeds both the draw and the hit-test.
export const TRADE_MODAL_RECT = { x: 24, y: 44, w: 560, h: 520 };
// The dialogue window is sized to its content at draw time (bottom-anchored, grows
// with the option count) — see renderer._drawDialogueModal, which stashes the live
// rect on this._dialogueRect for the ✕ / tap-outside menu grammar.
export const TRADE_COLS       = 3;
export const TRADE_CELL_W     = 64;
export const TRADE_CELL_H     = 72;
export const TRADE_COL_STRIDE = 72;
export const TRADE_ROW_STRIDE = 80;
export const TRADE_BUY_ORIGIN  = { x: 52,  y: 156 };
export const TRADE_SELL_ORIGIN = { x: 320, y: 156 };
// (Phase 6c) BUYBACK row — sold items you can re-buy at the locked price, drawn
// below the two grids and above the bribe button. One row of up to TRADE_COLS.
export const TRADE_BUYBACK_ORIGIN = { x: 52, y: 416 };
export const TRADE_BRIBE_RECT  = { x: 52, y: 506, w: 200, h: 34 };

// ── Equipment screen (Stage 3 — read-only Vitruvian dress-up) ──
// (drawn by renderer._drawEquipmentModal, hit-tested by main._tapDevice via deviceEquipLayout).
// One big ornate panel; a centred figure box with the 6 equip slots ringing it.
// Each slot rect carries its own `label` and the `game.equipment` key it reads.
export const EQUIPMENT_MODAL_RECT = { x: 24, y: 44, w: 560, h: 520 };

// Centred ~140×300 figure box inside the modal (the mannequin + Vitruvian
// circle/square draw relative to this).
export const EQUIP_FIGURE_RECT = {
    x: EQUIPMENT_MODAL_RECT.x + (EQUIPMENT_MODAL_RECT.w - 140) / 2,   // 234
    y: EQUIPMENT_MODAL_RECT.y + 120,                                  // 164
    w: 140,
    h: 300,
};

// The 6 slot plates ringing the figure. `key` indexes game.equipment; `label`
// is the body-zone caption. `zone` (0..1 of the figure box) is where the
// connector line points on the mannequin.
export const EQUIP_SLOT_RECTS = [
    { key: 'top',    label: 'HEAD',    x: 256, y: 60,  w: 96, h: 48, zone: { fx: 0.5, fy: 0.06 } },  // above
    { key: 'sides',  label: 'ARMS',    x: 60,  y: 240, w: 96, h: 48, zone: { fx: 0.08, fy: 0.42 } }, // left
    { key: 'front',  label: 'TORSO',   x: 452, y: 240, w: 96, h: 48, zone: { fx: 0.92, fy: 0.42 } }, // right
    { key: 'back',   label: 'BACK',    x: 60,  y: 380, w: 96, h: 48, zone: { fx: 0.2,  fy: 0.68 } }, // lower-left
    { key: 'bottom', label: 'FEET',    x: 452, y: 380, w: 96, h: 48, zone: { fx: 0.5,  fy: 0.98 } }, // below (right stack)
    { key: 'weapon', label: 'WEAPON',  x: 256, y: 480, w: 96, h: 48, zone: { fx: 0.5,  fy: 0.55 } }, // bottom-center
];

// Rect for the `index`-th cell of a grid anchored at `origin` (BUY or SELL).
export function tradeCellRect(origin, index) {
    const col = index % TRADE_COLS;
    const row = Math.floor(index / TRADE_COLS);
    return {
        x: origin.x + col * TRADE_COL_STRIDE,
        y: origin.y + row * TRADE_ROW_STRIDE,
        w: TRADE_CELL_W,
        h: TRADE_CELL_H,
    };
}

// (menu grammar) The always-visible ✕ / Back chip — a ~30px tappable target at a
// panel's top-right inner corner, the device-agnostic exit on every Menu. Drawn by
// renderer._drawCloseButton and hit-tested in main._onCanvasPointerDown, both off
// the SAME panel rect so the button and its hit-zone can't drift.
export function closeButtonRect(r) {
    return { x: r.x + r.w - 36, y: r.y + 6, w: 30, h: 30 };
}

// ── Remoticon device (Slice 3) — one tabbed, soft-pausing overlay ─────────────
// Reuses the proven full-panel bezel. A title/✕ band sits at the top (the ✕ chip
// from closeButtonRect lives there), a tab strip sits BELOW it (so it can't
// collide with the chip), and the body region below that hosts one of the four
// existing draw bodies (ITEMS/GEAR/QUESTS/MAP). Geometry lives here so
// renderer._drawDevice (draw) and main.js (hit-test) share ONE source of truth.
export const DEVICE_RECT = { x: 24, y: 44, w: 560, h: 520 };
export const DEVICE_TABS = ['items', 'gear', 'quests', 'map', 'rings'];
export const DEVICE_TAB_H = 30;                        // tab-strip height
const DEVICE_TAB_TOP = DEVICE_RECT.y + 38;             // below the title/✕ band (the chip ends at y+36)
const DEVICE_TAB_PAD = 14;                             // strip inset from the frame sides

// The `i`-th tab's hit/draw rect, evenly dividing the strip below the title band.
export function deviceTabRect(i) {
    const stripX = DEVICE_RECT.x + DEVICE_TAB_PAD;
    const tabW = (DEVICE_RECT.w - DEVICE_TAB_PAD * 2) / DEVICE_TABS.length;
    return { x: stripX + i * tabW, y: DEVICE_TAB_TOP, w: tabW - 4, h: DEVICE_TAB_H };
}

// The body region below the tab strip that hosts the active tab's draw body.
export function deviceBodyRect() {
    const top = DEVICE_TAB_TOP + DEVICE_TAB_H + 8;
    return { x: DEVICE_RECT.x + 14, y: top, w: DEVICE_RECT.w - 28, h: DEVICE_RECT.y + DEVICE_RECT.h - 12 - top };
}

// The ITEMS-tab bag as two zones, returned in SLOT-INDEX order (0..9 = SAFE
// row, 10..49 = PACK grid), so main._tapDevice's `inventory[i]` indexing and
// the renderer stay in lockstep. 10 columns; SAFE is the top row, PACK is the
// four rows below it with a gap band between. Non-overlap is pinned by
// tests/device-layout.test.js.
export function deviceBagSlotRects(bodyRect) {
    const COLS = 10, SLOT = 38, GAP = 6, STRIDE = SLOT + GAP;   // 44; 10*44-6 = 434 < body.w
    const gridW = COLS * STRIDE - GAP;
    const ox = Math.round(bodyRect.x + (bodyRect.w - gridW) / 2);
    const safeY = bodyRect.y + 30;                 // below the "SAFE" label
    const packY = safeY + SLOT + 24;               // gap band + "PACK" label
    const rects = [];
    for (let i = 0; i < 50; i++) {
        const inSafe = i < 10;
        const col = inSafe ? i : (i - 10) % COLS;
        const row = inSafe ? 0 : Math.floor((i - 10) / COLS);
        const y = inSafe ? safeY : packY + row * STRIDE;
        rects.push({ x: ox + col * STRIDE, y, w: SLOT, h: SLOT });
    }
    return rects;
}

// The inspector panel sits below the bag grid (which ends ~y382) in the lower
// band of the device body — it MUST NOT overlap the bag slots. Enforced by
// tests/device-layout.test.js.
export function inspectorPanelRect(bodyRect) {
  return { x: bodyRect.x + 8, y: bodyRect.y + 300, w: bodyRect.w - 16, h: 120 };
}
// Up to 3 action buttons in a row along the bottom of the inspector panel.
export function inspectorActionRects(bodyRect) {
  const p = inspectorPanelRect(bodyRect);
  const n = 3, bw = 96, gap = 12, rowW = n * bw + (n - 1) * gap;
  const ox = p.x + (p.w - rowW) / 2, y = p.y + p.h - 34;
  const rects = [];
  for (let i = 0; i < n; i++) rects.push({ x: ox + i * (bw + gap), y, w: bw, h: 26 });
  return rects;
}

// Pure tab cycle (wraps both ways); an unknown current tab resets to the first.
export function cycleDeviceTab(current, dir) {
    const i = DEVICE_TABS.indexOf(current);
    if (i < 0) return DEVICE_TABS[0];
    return DEVICE_TABS[(i + dir + DEVICE_TABS.length) % DEVICE_TABS.length];
}

// (Slice 3) GEAR tab — map the equipment figure + 6 slot plates from the full
// modal space into the (shorter) device body, PROPORTIONALLY, so nothing
// overflows the tab strip or the frame. A pure dy-shift would push the bottom
// WEAPON plate off; scaling fits it. renderer._drawEquipmentModal (draw) and
// main._tapDevice (hit-test) both read this ONE helper, so the plates and their
// tap zones can never drift.
export function deviceEquipLayout(bodyRect) {
    const M = EQUIPMENT_MODAL_RECT;
    const sx = bodyRect.w / M.w, sy = bodyRect.h / M.h;
    const map = (r) => ({
        ...r,
        x: bodyRect.x + (r.x - M.x) * sx,
        y: bodyRect.y + (r.y - M.y) * sy,
        w: r.w * sx,
        h: r.h * sy,
    });
    return { figure: map(EQUIP_FIGURE_RECT), slots: EQUIP_SLOT_RECTS.map(map) };
}

// The GEAR chooser's option rows — a centered column living in the clear
// vertical band between the HEAD plate (top) and the WEAPON plate (bottom). A
// right-side column would collide with the TORSO/FEET plates, which scale to the
// right edge; centering a narrow column keeps it clear of the flanking
// ARMS/TORSO/BACK/FEET plates too. gap = 2×HIT_SLOP so adjacent rows' tap zones
// never overlap (matches inspectorActionRects). Assumes few rows per slot — the
// current catalog gives ≤2 (one equip item + Bare); a slot that ever gained many
// items would need this uncapped column capped or scrolled. Pinned by
// tests/device-layout.test.js.
export function gearOptionRects(bodyRect, n) {
  const w = 200, x = bodyRect.x + (bodyRect.w - w) / 2;
  const rowH = 26, gap = 12;
  const y0 = bodyRect.y + 60;
  const rects = [];
  for (let i = 0; i < n; i++) rects.push({ x, y: y0 + i * (rowH + gap), w, h: rowH });
  return rects;
}

// (Remembrance Rings, Task 5) The SKILLS tab body IS THE HANDS — two hands split
// the body left/right, five fingers fan across each (thumbs facing inward), tips
// staggered anatomically. A socket sits at every UNLOCKED finger's tip; unrevealed
// fingers are returned bare (socket:null) so nothing hints they exist. Links join
// within-hand adjacent unlocked sockets (the fusion/resonance seams).
//
// Returns:
//   hands:   [{ hand, label, palmX, palmW, palmY, fingers:[{ finger, key, cx,
//                tipY, palmY, unlocked, ringId, socket }] }]   — for the silhouette
//   sockets: [{ key, hand, finger, x, y, w, h, ringId }]        — UNLOCKED only; the
//                                                                 shared draw+hit-test contract
//   links:   [{ a, b, ax, ay, bx, by }]                         — renderer marks fusible
//
// renderer._drawDeviceRings (draw) and main._tapDevice (hit-test) read the SAME
// `sockets`, so a ring's tap zone can never drift from its drawn well. Fusibility
// is display-only, so the renderer computes it (keeps this module content-free).
export function deviceRingsLayout(bodyRect, game) {
    const tier = (game && game.ringTier) || 0;
    const unlockedKeys = new Set(unlockedSlots(tier).map(s => s.key));
    const ringOf = (key) => (game && game.ringSlots && game.ringSlots[key]) || null;

    const socketW = 40, socketH = 34;
    const handW   = bodyRect.w / 2;
    const palmY   = bodyRect.y + bodyRect.h - 70;   // baseline the fingers rise from
    const reach   = bodyRect.h - 190;               // the longest finger's rise above the palm

    // Relative tip height per finger (anatomical stagger) and the L→R draw order
    // per hand — thumbs face inward so the two hands read as a mirrored pair.
    const REACH = { thumb: 0.42, index: 0.80, middle: 1.0, ring: 0.86, pinky: 0.58 };
    const orderFor = (hand) => hand === 'left'
        ? ['thumb', 'index', 'middle', 'ring', 'pinky']
        : ['pinky', 'ring', 'middle', 'index', 'thumb'];

    const socketByKey = {};
    const hands = HANDS.map((hand, hi) => {
        const originX = bodyRect.x + hi * handW;
        const order = orderFor(hand);
        const slotW = handW / (order.length + 1);   // even spread with a slotW margin each side
        const fingers = order.map((finger, fi) => {
            const cx = originX + slotW * (fi + 1);
            const tipY = palmY - reach * REACH[finger];
            const key = `${hand}:${finger}`;
            const unlocked = unlockedKeys.has(key);
            const ringId = unlocked ? ringOf(key) : null;
            const socket = unlocked
                ? { key, hand, finger, x: cx - socketW / 2, y: tipY - socketH / 2, w: socketW, h: socketH, ringId }
                : null;
            if (socket) socketByKey[key] = socket;
            return { finger, key, cx, tipY, palmY, unlocked, ringId, socket };
        });
        return { hand, label: hand.toUpperCase(), palmX: originX + slotW * 0.6, palmW: handW - slotW * 1.2, palmY, fingers };
    });

    const sockets = Object.values(socketByKey);
    const links = adjacentPairs(tier).map(({ a, b }) => {
        const sa = socketByKey[a], sb = socketByKey[b];
        return {
            a, b,
            ax: sa.x + sa.w / 2, ay: sa.y + sa.h / 2,
            bx: sb.x + sb.w / 2, by: sb.y + sb.h / 2,
        };
    });

    return { hands, sockets, links };
}
