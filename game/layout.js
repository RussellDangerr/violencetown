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

// ── Radial combat wheel (Omnitrix-style) ──
// (drawn by renderer._drawRadialMenu, polar hit-test by main._tapRadialMenu)
export const RADIAL_CENTER_X    = 304;
export const RADIAL_CENTER_Y    = 304;
export const RADIAL_INNER_R_MIN = 36;
export const RADIAL_INNER_R_MAX = 80;
export const RADIAL_OUTER_R_MIN = 84;
export const RADIAL_OUTER_R_MAX = 120;

// (action-wheel overhaul) Three concentric rings + a dead-center hub. Each ring
// is an [inner, outer] radius band in the 608px canvas space, centered at
// RADIAL_CENTER_*. Shared by renderer._drawRadialMenu (draw) and
// main._tapRadialMenu (hit-test) so the tap zones match what's drawn.
export const RING_HUB_R    = 22;
export const RING_ACTION_R = [26, 64];
export const RING_ITEM_R   = [66, 100];
export const RING_AIM_R    = [102, 132];

// ── Log strip (bottom-left) + [L] history modal panel ──
export const LOG_STRIP_RECT = { x: 6, y: 496, w: 300, h: 44 };   // y = HOTBAR_OY - 44 - 6
export const LOG_MODAL_RECT = { x: 24, y: 44, w: 560, h: 520 };
