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

export const CANVAS_INTERNAL_PX = 608;   // mirrors data.js CANVAS_PX
export const HIT_SLOP = 6;               // tap-zone expansion (Apple 44pt min target)

// ── Item-use overlay — 4 directional option panels around the player tile ──
// (drawn by renderer._drawItemOverlay, hit-tested by main._tapItemOverlay)
export const OVERLAY_RECTS = {
    up:    { x: 260, y: 234, w: 88, h: 32 },
    down:  { x: 260, y: 344, w: 88, h: 32 },
    left:  { x: 188, y: 288, w: 88, h: 32 },
    right: { x: 344, y: 288, w: 88, h: 32 },
};

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

// ── Radial "sunburst" combat wheel ──
// Concentric rings centred on RADIAL_CENTER_*: a hub, the greyed decision-stack
// rings growing inward, one bright active ring, and a partial preview arc above
// the top pointer. Shared by renderer._drawWheel (draw) and main._tapRadialMenu
// (hit-test). The preview-arc band and pointer are derived adaptively in
// renderer._drawWheel from wheelRingR(depth).
export const RADIAL_CENTER_X = 304, RADIAL_CENTER_Y = 304;
export const WHEEL_HUB_R    = 34;            // centre 'MENU' disc radius
export const WHEEL_RING_W    = 40;           // radial thickness of each full ring
export const WHEEL_RING_GAP  = 5;            // gap between adjacent rings
export const WHEEL_RING0_R0  = 40;           // inner edge of the first ring out from the hub
export const WHEEL_TILE_GAP  = 0.03;         // angular gap between tiles (radians)
// Ring k's [inner, outer] radius (k = 0 nearest the hub).
export function wheelRingR(k) { const r0 = WHEEL_RING0_R0 + k * (WHEEL_RING_W + WHEEL_RING_GAP); return [r0, r0 + WHEEL_RING_W]; }

// ── Quest Log panel (bottom-left) + [L] history modal panel ──
// One consolidated "Quest Log" box holding the zone/time/turn header, the active
// objective, and the last few log-feed lines. Sits above the hotbar (HOTBAR_OY
// = 546). Shared by renderer._drawQuestLog (draw) and main.js (tap → [L] history).
export const QUESTLOG_RECT = { x: 6, y: 436, w: 340, h: 104 };
export const LOG_MODAL_RECT = { x: 24, y: 44, w: 560, h: 520 };
export const JOURNAL_RECT   = { x: 24, y: 44, w: 560, h: 520 };   // (Phase 4) quest journal + world-map tab
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
// (drawn by renderer._drawEquipmentModal, hit-tested by main._tapEquipmentScreen).
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
