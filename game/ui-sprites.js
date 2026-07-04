// ui-sprites.js — UI sprite helpers
// Uses Modern UI Style 1 (warm parchment) for all zones.
// The 32px 9-slice panel at (0,0) on the sheet is used for large panels only.
// Small UI elements use hand-matched parchment colors instead of forced 9-slice.

// ── Parchment Color Palette (sampled from Style 1 sheet) ─────────────────────

export const UI = {
    // Panel colors — DARK-ORNATE (Fantasy UI Borders). Panels are dark stone
    // with a gold ornate frame; text is light. The inset wells (panelBgDark)
    // sit a step DARKER than the panel fill so drawInset bars/slots still read.
    panelBg:     '#2a2620',   // panel stone fill — matches the atlas base center
    panelBgDark: '#14110b',   // inset wells for slots/bars (darker than panelBg)
    panelBorder: '#8b7340',   // gold-brown border (strokeRect chrome)
    panelBorderLight: '#d4b96a',

    // Text colors — light on dark
    gold:    '#d4b96a',
    text:    '#e8dcc0',   // primary light cream text on dark panels
    textLight: '#a89878', // muted secondary
    white:   '#f4ecd8',
    dim:     '#8a7d60',   // quiet hints (still legible on the dark stone)

    // Status (colored + self-contained — unchanged)
    hpGreen: '#55aa44',
    hpRed:   '#cc4422',
    hpBg:    '#3a2010',
    debuff:  '#cc5533',
    buff:    '#44aa44',
};

// ── 9-Slice Panel Pieces (16px cells in a 48×48 grid per variant) ──────────
//
// The panel atlas (game/assets/ui_panel.png) is 48×144 — three vertically
// stacked variants: base (y=0), dark (y=48), glow (y=96). Each variant is
// a 3×3 grid of 16×16 cells. Smaller corners than the original 32px design
// so HP / hotbar / log / buff-bar panels (most <64px tall) can still use
// the 9-slice without their corners overlapping. P[piece] gives base-coords;
// PANEL_VARIANT_OY offsets the grid down for the dark/glow variants.

const P = {
    tl: { x: 0,  y: 0,  w: 16, h: 16 },
    t:  { x: 16, y: 0,  w: 16, h: 16 },
    tr: { x: 32, y: 0,  w: 16, h: 16 },
    l:  { x: 0,  y: 16, w: 16, h: 16 },
    c:  { x: 16, y: 16, w: 16, h: 16 },
    r:  { x: 32, y: 16, w: 16, h: 16 },
    bl: { x: 0,  y: 32, w: 16, h: 16 },
    b:  { x: 16, y: 32, w: 16, h: 16 },
    br: { x: 32, y: 32, w: 16, h: 16 },
};

export const PANEL_VARIANT_OY = {
    base: 0,
    dark: 48,
    glow: 96,
};

// ── Item display colors ──────────────────────────────────────────────────────

export const ITEM_COLORS = {
    rock:             { bg: '#8a8878', letter: 'R' },
    soap:             { bg: '#6688bb', letter: 'S' },
    sludge_sack:      { bg: '#9a52c8', letter: 'K' },
    pipe:             { bg: '#707070', letter: 'P' },
    bandage:          { bg: '#bb6666', letter: 'B' },
    foil_hat:         { bg: '#c8c8d0', letter: 'H' },
    cardboard_cuirass:{ bg: '#b58a56', letter: 'A' },
    latex_gloves:     { bg: '#9fc7e8', letter: 'G' },
    red_cape:         { bg: '#c03030', letter: 'C' },
    shoe_bags:        { bg: '#3a3a3a', letter: 'F' },
    ray_gun:          { bg: '#4aa0a0', letter: 'Z' },
    fearmur:          { bg: '#d8d0b8', letter: 'J' },
    gator_tail:       { bg: '#6b7a4a', letter: 'Y' },
    lion_whip:        { bg: '#b8863a', letter: 'W' },
    boardwalk_burger: { bg: '#cc8844', letter: '🍔' },
    mystery_meat:     { bg: '#884444', letter: 'M' },
    tunnel_mushroom:  { bg: '#997755', letter: '🍄' },
    hot_dog:          { bg: '#cc6633', letter: 'H' },
    catalytic_converter: { bg: '#9a8a6a', letter: 'C' },
    alcohol:          { bg: '#8a5a2a', letter: 'A' },
    grappling_hook:   { bg: '#9a7b4a', letter: 'G' },
};

// ── Draw helpers ─────────────────────────────────────────────────────────────

function spr(ctx, sheet, s, oy, dx, dy, dw, dh) {
    // `oy` shifts source-Y by the variant offset (0/96/192 for base/dark/glow).
    ctx.drawImage(sheet.img, s.x, s.y + oy, s.w, s.h, dx, dy, dw ?? s.w, dh ?? s.h);
}

// Draw a large ornate 9-slice panel (for splash, win, dialogs, modals).
// `variant` selects which 96px band of the atlas to sample:
//   'base' — parchment with gold trim (default)
//   'dark' — dark fill for tooltips / overlays
//   'glow' — brighter gold trim for active highlights
export function drawPanelBig(ctx, sheet, x, y, w, h, variant = 'base') {
    if (!sheet?.loaded) {
        drawPanelFallback(ctx, x, y, w, h);
        return;
    }
    const s = 16; // cell size (matches the P.* w/h above)
    const oy = PANEL_VARIANT_OY[variant] ?? 0;
    spr(ctx, sheet, P.tl, oy, x, y, s, s);
    spr(ctx, sheet, P.tr, oy, x + w - s, y, s, s);
    spr(ctx, sheet, P.bl, oy, x, y + h - s, s, s);
    spr(ctx, sheet, P.br, oy, x + w - s, y + h - s, s, s);
    spr(ctx, sheet, P.t,  oy, x + s, y, w - 2*s, s);
    spr(ctx, sheet, P.b,  oy, x + s, y + h - s, w - 2*s, s);
    spr(ctx, sheet, P.l,  oy, x, y + s, s, h - 2*s);
    spr(ctx, sheet, P.r,  oy, x + w - s, y + s, s, h - 2*s);
    spr(ctx, sheet, P.c,  oy, x + s, y + s, w - 2*s, h - 2*s);
}

// Draw a small parchment panel. Uses the 9-slice atlas when a sheet is
// passed, falling back to the original flat parchment fill for callers
// that don't have the sheet (or for very small panels where 32×32 corners
// would dominate).
export function drawPanelSmall(ctx, x, y, w, h, sheet = null, variant = 'base') {
    // 32 is the smallest size where the 9-slice math leaves any center to
    // render (corners are 16×16; below 32px the top-left and top-right
    // would overlap and the parchment look degenerates). Smaller panels —
    // throw-direction targets, badge pills — keep the flat fallback which
    // reads cleanly at small sizes.
    if (sheet?.loaded && w >= 32 && h >= 32) {
        drawPanelBig(ctx, sheet, x, y, w, h, variant);
        return;
    }
    ctx.fillStyle = UI.panelBgDark;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = UI.panelBg;
    ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
    ctx.strokeStyle = UI.panelBorder;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
}

// Fallback if sprites not loaded
export function drawPanelFallback(ctx, x, y, w, h) {
    ctx.fillStyle = '#1a1610';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = UI.panelBorder;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
}

// Draw a dark inset box (for slots, bars, log areas)
export function drawInset(ctx, x, y, w, h) {
    ctx.fillStyle = UI.panelBgDark;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#1a1610';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
}
