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

// ── Log strip (bottom-left) + [L] history modal panel ──
export const LOG_STRIP_RECT = { x: 6, y: 496, w: 300, h: 44 };   // y = HOTBAR_OY - 44 - 6
export const LOG_MODAL_RECT = { x: 24, y: 44, w: 560, h: 520 };

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
export const TRADE_BRIBE_RECT  = { x: 52, y: 506, w: 200, h: 34 };

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
