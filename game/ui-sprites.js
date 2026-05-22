// ui-sprites.js — UI sprite helpers
// Uses Modern UI Style 1 (warm parchment) for all zones.
// The 32px 9-slice panel at (0,0) on the sheet is used for large panels only.
// Small UI elements use hand-matched parchment colors instead of forced 9-slice.

// ── Parchment Color Palette (sampled from Style 1 sheet) ─────────────────────

export const UI = {
    // Panel colors (matching the 9-slice panel fill)
    panelBg:     '#c8b888',   // the inner parchment fill
    panelBgDark: '#2a2218',   // dark variant for slots/bars
    panelBorder: '#8b7340',   // gold-brown border
    panelBorderLight: '#b8a060',

    // Text colors
    gold:    '#d4b96a',
    text:    '#5a4a30',   // dark text on parchment (readable!)
    textLight: '#8a7848',
    white:   '#f0e8d0',
    dim:     '#6a5a3a',

    // Status
    hpGreen: '#55aa44',
    hpRed:   '#cc4422',
    hpBg:    '#3a2010',
    debuff:  '#cc5533',
    buff:    '#44aa44',
};

// ── 9-Slice Panel Pieces (32px borders, from assembled panel at 0,0) ─────────

const P = {
    tl: { x: 0,  y: 0,  w: 32, h: 32 },
    t:  { x: 32, y: 0,  w: 32, h: 32 },
    tr: { x: 64, y: 0,  w: 32, h: 32 },
    l:  { x: 0,  y: 32, w: 32, h: 32 },
    c:  { x: 32, y: 32, w: 32, h: 32 },
    r:  { x: 64, y: 32, w: 32, h: 32 },
    bl: { x: 0,  y: 64, w: 32, h: 32 },
    b:  { x: 32, y: 64, w: 32, h: 32 },
    br: { x: 64, y: 64, w: 32, h: 32 },
};

// ── Item display colors ──────────────────────────────────────────────────────

export const ITEM_COLORS = {
    rock:             { bg: '#8a8878', letter: 'R' },
    soap:             { bg: '#6688bb', letter: 'S' },
    pipe:             { bg: '#707070', letter: 'P' },
    bandage:          { bg: '#bb6666', letter: 'B' },
    boardwalk_burger: { bg: '#cc8844', letter: '🍔' },
    mystery_meat:     { bg: '#884444', letter: 'M' },
    tunnel_mushroom:  { bg: '#997755', letter: '🍄' },
    hot_dog:          { bg: '#cc6633', letter: 'H' },
};

// ── Draw helpers ─────────────────────────────────────────────────────────────

function spr(ctx, sheet, s, dx, dy, dw, dh) {
    ctx.drawImage(sheet.img, s.x, s.y, s.w, s.h, dx, dy, dw ?? s.w, dh ?? s.h);
}

// Draw a large ornate 9-slice panel (for splash, win, dialogs)
export function drawPanelBig(ctx, sheet, x, y, w, h) {
    if (!sheet?.loaded) {
        drawPanelFallback(ctx, x, y, w, h);
        return;
    }
    const s = 32;
    spr(ctx, sheet, P.tl, x, y, s, s);
    spr(ctx, sheet, P.tr, x + w - s, y, s, s);
    spr(ctx, sheet, P.bl, x, y + h - s, s, s);
    spr(ctx, sheet, P.br, x + w - s, y + h - s, s, s);
    spr(ctx, sheet, P.t,  x + s, y, w - 2*s, s);
    spr(ctx, sheet, P.b,  x + s, y + h - s, w - 2*s, s);
    spr(ctx, sheet, P.l,  x, y + s, s, h - 2*s);
    spr(ctx, sheet, P.r,  x + w - s, y + s, s, h - 2*s);
    spr(ctx, sheet, P.c,  x + s, y + s, w - 2*s, h - 2*s);
}

// Draw a clean small panel (parchment fill + border, no 9-slice)
export function drawPanelSmall(ctx, x, y, w, h) {
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
