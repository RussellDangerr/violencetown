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
import { TILE_PX } from './data.js';
import { DEFAULT_VIEW } from './viewport.js';   // (screen-fill) the default viewport for the HUD helpers

export const CANVAS_INTERNAL_PX = 608;   // mirrors data.js CANVAS_PX
export const HIT_SLOP = 6;               // tap-zone expansion (Apple 44pt min target)

// The one modal bezel. LOG_MODAL_RECT, EQUIPMENT_MODAL_RECT and
// DEVICE_RECT were four separate literals of this identical rect; they now alias
// it, so the panel can be retuned in one place. Frozen because that sharing means
// a stray `.w =` on any one of the five names would silently retune all five.
export const MODAL_RECT = Object.freeze({ x: 24, y: 44, w: 560, h: 520 });

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

// The throw prompt's four targets around the player's tile, wherever the
// viewport puts it. THROW_RECTS are the same targets around the old square's
// centre (304, 304).
export function throwRects(vp = DEFAULT_VIEW) {
    const dx = vp.origin.x + TILE_PX / 2 - CANVAS_INTERNAL_PX / 2;
    const dy = vp.origin.y + TILE_PX / 2 - CANVAS_INTERNAL_PX / 2;
    const at = (r) => ({ x: r.x + dx, y: r.y + dy, w: r.w, h: r.h });
    return { up: at(THROW_RECTS.up), down: at(THROW_RECTS.down), left: at(THROW_RECTS.left), right: at(THROW_RECTS.right) };
}

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
// `anchor` is where hudLayout puts the bar: its centre x, and the bottom of
// its current-item cell. The default is the old square's (304, 588).
export const XMB_ANCHOR_CLASSIC = Object.freeze({ cx: CANVAS_INTERNAL_PX / 2, bottom: HOTBAR_OY + HOTBAR_SLOT_H });
export const XMB_CELL = 32;        // one item cell in the row; 32 leaves the
                                   // selected item's NAME a line beneath the row,
                                   // which is where it went when the row took the
                                   // width the name used to sit in
// 12, not 6: HIT_SLOP grows every cell by 6 a side, so a narrower gap makes
// two neighbours claim the same pixels and which one fires depends on iteration
// order. At 12 the expanded cells merely touch, which rectsOverlap calls clear.
export const XMB_CELL_GAP = 12;

// `sel` is { colIndex, itemIndex } — which column is active and which of its
// items is picked (xmb.js resolveXmbSelection produces exactly that shape).
// Omitted, it means the first item of the first column.
//
// (combat-hud stage 5) The active column is laid out as a ROW of cells rather
// than the single "current" cell this returned before — Caelan: the bar "needs
// to be more functional than just a single item". `current` is kept as an alias
// of the selected cell, because main hit-tests it to fire.
//
// The row is horizontal where plans/item-hotbar-xmb.md says vertical. That doc
// predates the dock and was written for the old 608 square; the dock's bar panel
// is 82px tall, which one cell already fills, so a vertical column could only
// exist by growing over the world or the message log — the collision stage 2
// fixed for the dial. Caelan ruled the row (2026-09-19).
export function xmbBarLayout(bar, anchor = XMB_ANCHOR_CLASSIC, sel = null) {
    const cols = (bar && bar.columns) || [];
    const cx = anchor.cx;
    const bottom = anchor.bottom;
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

    const colIndex = Math.max(0, Math.min(sel ? (sel.colIndex | 0) : 0, n - 1));
    const items = (cols[colIndex] && cols[colIndex].items) || [];
    const pick = Math.max(0, Math.min(sel ? (sel.itemIndex | 0) : 0, items.length - 1));

    // The row never grows wider than the chips above it, so the bar's panel —
    // which is sized from the chips — always contains it.
    const stride = XMB_CELL + XMB_CELL_GAP;
    const fit = totalW > 0 ? Math.max(1, Math.floor((totalW + XMB_CELL_GAP) / stride)) : 1;
    const shown = Math.min(items.length, fit);
    const overflow = items.length > shown;

    // Window the row around the selection so the picked item is always on it.
    const first = overflow ? Math.max(0, Math.min(pick - (shown >> 1), items.length - shown)) : 0;
    const rowW = shown > 0 ? shown * stride - XMB_CELL_GAP : 0;
    const rowX = Math.round(cx - rowW / 2);
    const cells = [];
    for (let k = 0; k < shown; k++) {
        const index = first + k;
        const it = items[index];
        cells.push({
            index, id: it && it.itemDef ? it.itemDef.id : null, slot: it ? it.slot : -1,
            count: it ? it.count : 0, selected: index === pick,
            x: rowX + k * stride, y: itemY, w: XMB_CELL, h: XMB_CELL,
        });
    }

    const chosen = cells.find((c) => c.selected) || null;
    const current = chosen
        ? { x: chosen.x, y: chosen.y, w: chosen.w, h: chosen.h }
        : { x: Math.round(cx - iconSize / 2), y: itemY, w: iconSize, h: iconSize };
    const rowRight = cells.length ? cells[cells.length - 1].x + XMB_CELL : current.x + current.w;
    const up   = { x: rowRight + 10, y: itemY - 4,              w: 18, h: 14 };
    const down = { x: rowRight + 10, y: itemY + XMB_CELL - 10,  w: 18, h: 14 };
    return { chips, items: cells, current, up, down, bottom, overflow };
}

// The XMB usable-bar's background PANEL rect for `n` visible category chips
// (1-3), mirroring renderer.js:1978-1980. n=3 is the worst case (widest). The
// bar is centered on canvas-center x=304; chip stride is XMB_CHIP_W(96)+6.
export function xmbBarPanelRect(n = 3, anchor = XMB_ANCHOR_CLASSIC) {
  const chipW = 96, gap = 6, stride = chipW + gap;   // 102
  const totalChips = n * stride - gap;               // n=3 -> 300
  const left = anchor.cx - totalChips / 2 - 10;      // n=3, classic -> 144
  const right = anchor.cx + totalChips / 2 + 10;     // n=3, classic -> 464
  const top = anchor.bottom - 78;                    // chipY - 6: classic 510
  const bottom = anchor.bottom + 4;                  // the panel's bottom edge: classic 592
  return { x: left, y: top, w: right - left, h: bottom - top };
}

// The set of HUD panels on screen in a given game-state name. Each entry
// { name, rect } is a surface the player is meant to read or hit. The
// invariant: no two of these may overlap (under HIT_SLOP), or a tap is
// ambiguous and — as the dial over the log showed — a panel is unreadable.
// 'radial_menu' is here because the open dial is DRAWN over the dock even
// though only the wheel takes taps then: the collision that mattered was
// visual, not a stolen tap. 'idle' is the
// only always-live combination (message log + usable bar); the modal states
// are exclusive overlays tested separately if they gain persistent siblings.
export function hudInteractiveRects(state, vp = DEFAULT_VIEW) {
  const rects = [];
  if (state === 'idle' || state === 'radial_menu') {
    const hud = hudLayout(vp);
    rects.push({ name: 'questlog', rect: hud.log });
    rects.push({ name: 'xmb', rect: xmbBarPanelRect(3, hud.bar) });
    // The open wheel replaces its own opener: the dial is drawn over where the
    // ✦ sits, and the ✦ is not tappable while the wheel is up.
    if (state === 'radial_menu') rects.push({ name: 'dial', rect: dialRect(hud) });
    else if (hud.opener) rects.push({ name: 'opener', rect: hud.opener });
  }
  return rects;
}

// ── Radial "sunburst" combat wheel ──
// Concentric rings centred on hudLayout's wheel hub: a hub, the greyed
// decision-stack rings growing inward, one bright active ring, and a partial
// preview arc above the top pointer. Shared by renderer._drawWheel (draw) and
// main._tapRadialMenu (hit-test). The preview-arc band and pointer are derived
// adaptively in renderer._drawWheel from wheelRingR(depth).
// hudLayout keeps the open wheel clear of the screen's edges and the item bar
// using its real max span (WHEEL_REACH, below): the deepest ACTIVE ring is
// wheelRingR(2) (outer 120) at depth 3 (Fight→Melee — no depth-4 ring exists in
// wheel-model.js), with the 1.05 open-overshoot 126. Re-measure if
// wheel-model.js gains a 4th ring.
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

// ── The HUD, placed for a viewport (plans/screen-fill.md) ──
// Where every HUD piece sits on a given screen: the renderer draws there and
// main.js hit-tests there, the same contract as the rects in this file.
const HUD_M = 6;               // margin from the screen's edge, logical px
const HUD_GAP = 12;            // between stacked panels: two HIT_SLOPs, so tap zones never touch
const PAGE_BUTTONS_CSS = 60;   // the ☰ ▤ page buttons' column, top-right: right 8 + width up to 44 + gap 8 (CSS px)
const WHEEL_REACH = 126;       // the open wheel's widest reach from its hub, with the open overshoot
const BAR_HALF = 160;          // the item bar's widest half-width: three chips (300) / 2 + 10
const BAR_ABOVE = 78;          // the bar's panel runs from 78 above its anchor's bottom …
const BAR_BELOW = 4;           // … to 4 below it (xmbBarPanelRect)

// `opts.fight` picks the dock's FIGHT face (plans/combat-hud.md stage 3): the
// same geometry down to the pixel, with the log showing the combat feed instead
// of the quest objective. Nothing moves when a fight starts — a dock that
// reflowed would shift the log under the player's eye at the worst moment — so
// the face only ever changes `log.face` and `log.lines`.
export function hudLayout(vp = DEFAULT_VIEW, opts = {}) {
    const fight = !!opts.fight;
    return vp.dockRows ? dockLayout(vp, fight) : cornersLayout(vp, fight);
}

// How many feed lines a log cell shows. The fight face spends the objective's
// line on one more message: a quest objective is not actionable mid-fight.
function logFace(fight, base) {
    return { face: fight ? 'combat' : 'quest', lines: fight ? base + 1 : base };
}

// The HUD pinned to the screen's corners and edges: HP top-left, the buffs
// top-right beside the page buttons, the log bottom-left and the item bar
// bottom-centre on one line, the wheel opening bottom-right. A narrow screen
// stacks the log above the bar and lifts the wheel above the bar's row.
function cornersLayout(vp, fight = false) {
    const { w, h } = vp;
    const cx = w / 2;
    const barBottom = h - 16 - BAR_BELOW;              // the bar's panel ends 16 px up, as in the old square
    const barTop = barBottom - BAR_ABOVE;
    const sideBySide = HUD_M + QUESTLOG_RECT.w + HUD_GAP <= cx - BAR_HALF;
    const logBottom = sideBySide ? h - 16 : barTop - HUD_GAP;
    const log = { x: HUD_M, y: logBottom - QUESTLOG_RECT.h, w: QUESTLOG_RECT.w, h: QUESTLOG_RECT.h, ...logFace(fight, 2) };
    const wheelBeside = w - HUD_M - 2 * WHEEL_REACH >= cx + BAR_HALF + HUD_GAP;
    const wheel = { cx: w - HUD_M - WHEEL_REACH, cy: (wheelBeside ? h - 16 : barTop - HUD_GAP) - WHEEL_REACH };
    return {
        hp: { x: HUD_M, y: HUD_M },
        buffsRight: w - HUD_M - Math.ceil(PAGE_BUTTONS_CSS * vp.logicalPerCss), buffsTop: HUD_M,
        log, bar: { cx, bottom: barBottom }, wheel, strip: h, dialRadius,
    };
}

// ── The dock (stage 3 of plans/screen-fill.md) ──
// A full-width strip along the bottom: the log on the left, the item bar in
// the middle, the wheel's ✦ opener on the right. On an upright or narrow
// screen it has two rows: the log above, the item bar and the opener below.
// The world stops at its top edge: main passes DOCK to computeViewport.
export const DOCK = Object.freeze({ oneRow: 100, twoRows: 196, minOneRowW: 1000 });
const DOCK_PAD = 8;                     // between the dock's edges and its pieces
const LOG_H3 = 84;                      // header + objective + three 12px message lines + 12px padding top and bottom
const OPENER = 72;                      // the ✦ button
const BAR_H = BAR_ABOVE + BAR_BELOW;    // the item bar's panel: 82
const WHEEL_DOWN_MAX = 120;             // the BACK tile's reach below the hub at the deepest ring, wheelRingR(2)[1]
const DIAL_MARGIN = 12;

// The two marks above the wheel, as offsets above its hub: the flapper pointer
// just past the outermost ring, and — at a leaf, which draws no preview ring —
// the "▲ FIRE" cue above the pointer, so the pointer never covers it. Each
// mark is about 12px tall.
export function wheelTopMarks(outerMost) {
    return { pointerTop: outerMost + 14, cueTop: outerMost + 30 };
}

// The dial the wheel sits on, sized for the wheel as it is drawn: with
// children to preview, the outermost ring is the preview ring and the pointer
// tops it; at a leaf, the FIRE cue tops the active ring.
export function dialRadius(depth, hasKids) {
    const marks = wheelTopMarks(wheelRingR(hasKids ? depth : depth - 1)[1]);
    return (hasKids ? marks.pointerTop : marks.cueTop) + DIAL_MARGIN;
}
export const DIAL_MAX_R = dialRadius(3, false);   // a leaf at the deepest ring: 162

// (combat-hud stage 2) The open wheel's dial as a rect: the disc's bounding box
// around the hub. The dial is a circle, so this is conservative — which is what
// we want from a "nothing may land here" reservation.
export function dialRect(hud, r = DIAL_MAX_R) {
    return { x: hud.wheel.cx - r, y: hud.wheel.cy - r, w: 2 * r, h: 2 * r };
}

// The x at which the dial's reserved column begins. Nothing else in the dock
// may start at or past it. Before this the dial was drawn, not laid out, and on
// a two-row dock it covered the right-hand third of the full-width log.
export function dialColumnLeft(w) { return w - DOCK_PAD - 2 * DIAL_MAX_R; }

// ── The two fight panels (plans/combat-hud.md stage 4) ──────────────────────
// Left is you, right is the target. They sit in the world's MARGINS, which the
// fight fog already dims, so they cost nothing readable — and they are where
// "in view at the same time" actually means in view. Vertically centred in the
// world, which keeps them clear of the HP panel and the buff bar without
// needing to know either one's size.
// 124 = 14 glyphs at 8px plus the 6px pad each side: enough for HEALTH POITION
// and for COIN KIT GEAR on one line. At 96 both clipped, which is how it was found.
export const FIGHT_PANEL_W = 124;   // the width they want, where there is room
export const FIGHT_PANEL_MIN_W = 56; // below this the text stops being readable
export const FIGHT_PANEL_H = 176;   // header + six two-line slot rows; the target side fits inside it
export const FIGHT_PANEL_CLEAR = 16; // tiles of unobstructed world kept between the two
const FIGHT_PANEL_M = 8;            // from the screen's edge

// The panels OVERLAY the world's fogged edge tiles; they do not shrink the
// viewport, so MIN_TILES (20, the tile rule computeViewport honours) is not the
// constraint here. What matters is that the fight itself stays unobstructed, so
// they give up width to keep FIGHT_PANEL_CLEAR tiles clear between them, down
// to the point where the text would stop being readable.
export function fightPanelRects(vp = DEFAULT_VIEW) {
    const worldH = vp.h - (vp.dockH || 0);
    const h = Math.min(FIGHT_PANEL_H, Math.max(0, worldH - 2 * FIGHT_PANEL_M));
    const y = Math.max(FIGHT_PANEL_M, Math.round((worldH - h) / 2));
    const room = Math.floor((vp.w - FIGHT_PANEL_CLEAR * TILE_PX - 2 * FIGHT_PANEL_M) / 2);
    const w = Math.max(FIGHT_PANEL_MIN_W, Math.min(FIGHT_PANEL_W, room));
    return {
        w, h,
        left:  { x: FIGHT_PANEL_M, y, w, h },
        right: { x: vp.w - FIGHT_PANEL_M - w, y, w, h },
    };
}

function dockLayout(vp, fight = false) {
    const { w, h } = vp;
    const dialLeft = dialColumnLeft(w);
    // The item bar centres in the dock MINUS the dial's column, so a narrow
    // dock slides it left rather than letting it run under the wheel. On a wide
    // dock there is room to spare and this is the screen's centre as before.
    const cx = Math.min(w / 2, dialLeft - HUD_GAP - BAR_HALF);
    const dock = { x: 0, y: h - vp.dockH, w, h: vp.dockH, rows: vp.dockRows };
    // The wheel's hub never moves as the wheel deepens: far enough in from the
    // right for the biggest dial, low enough that the deepest BACK tile ends
    // just inside the dock.
    const wheel = { cx: w - DOCK_PAD - DIAL_MAX_R, cy: h - DOCK_PAD - WHEEL_DOWN_MAX - 1 };
    let log, barBottom, openerY;
    if (dock.rows === 2) {
        // The log stops at the dial's column instead of spanning the dock.
        log = { x: DOCK_PAD, y: dock.y + DOCK_PAD, w: dialLeft - HUD_GAP - DOCK_PAD, h: LOG_H3, ...logFace(fight, 3) };
        const rowTop = log.y + log.h + HUD_GAP;           // the second row: the item bar and the opener
        barBottom = rowTop + BAR_ABOVE;
        openerY = rowTop + (BAR_H - OPENER) / 2;
    } else {
        barBottom = dock.y + (dock.h - BAR_H) / 2 + BAR_ABOVE;
        log = { x: DOCK_PAD, y: dock.y + DOCK_PAD, w: Math.min(cx - BAR_HALF, dialLeft) - HUD_GAP - DOCK_PAD, h: LOG_H3, ...logFace(fight, 3) };
        openerY = dock.y + (dock.h - OPENER) / 2;
    }
    // Under the hub where it fits; otherwise just clear of the item bar.
    const openerX = Math.min(Math.max(wheel.cx - OPENER / 2, cx + BAR_HALF + HUD_GAP), w - DOCK_PAD - OPENER);
    return {
        hp: { x: HUD_M, y: HUD_M },
        buffsRight: w - HUD_M - Math.ceil(PAGE_BUTTONS_CSS * vp.logicalPerCss), buffsTop: HUD_M,
        log, bar: { cx, bottom: barBottom }, wheel, strip: dock.y,
        dock, opener: { x: openerX, y: openerY, w: OPENER, h: OPENER },
        dialRadius,
    };
}

// Which HUD piece an IDLE tap lands on: the opener, the log, the dock's bare
// chrome ('dock'), or null for the world. One function, so main.js routes taps
// by the rects the renderer draws. The world's tiles run on under the dock, so
// a 'dock' tap must not reach tap-to-move. (The item bar keeps its own
// chip-level test in main._tapXmbBar, which runs before the 'dock' check.)
export function hitHud(hud, pt, slop = HIT_SLOP) {
    const inR = (r) => r && pt.x >= r.x - slop && pt.x <= r.x + r.w + slop && pt.y >= r.y - slop && pt.y <= r.y + r.h + slop;
    if (inR(hud.opener)) return 'opener';
    if (inR(hud.log)) return 'log';
    if (hud.dock && pt.y >= hud.dock.y) return 'dock';
    return null;
}
export const LOG_MODAL_RECT = MODAL_RECT;
// (Target List) A compact centred RuneScape-style verb menu. Height is computed
// per-target in the renderer (44px title band + one ROW_H row per verb).
export const TARGET_LIST_RECT  = { x: 180, y: 150, w: 248 };
export const TARGET_LIST_ROW_H = 30;
export function targetListRowRect(i) {
  return { x: TARGET_LIST_RECT.x + 10, y: TARGET_LIST_RECT.y + 44 + i * TARGET_LIST_ROW_H, w: TARGET_LIST_RECT.w - 20, h: TARGET_LIST_ROW_H - 4 };
}

// The dialogue window has no constant here on purpose: it is sized to its
// content at draw time (bottom-anchored, growing with the option count) — see
// renderer._drawDialogueModal, which stashes the live rect on this._dialogueRect
// for the ✕ / tap-outside menu grammar.
//
// The trade window's two-grid geometry lived here until the offer screen
// replaced it. TRADE_MODAL_RECT went with it: it was an alias of MODAL_RECT and
// nothing named it any more.

// ── Equipment screen (Stage 3 — read-only Vitruvian dress-up) ──
// (drawn by renderer._drawEquipmentModal, hit-tested by main._tapDevice via deviceEquipLayout).
// One big ornate panel; a centred figure box with the 6 equip slots ringing it.
// Each slot rect carries its own `label` and the `game.equipment` key it reads.
export const EQUIPMENT_MODAL_RECT = MODAL_RECT;

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
export const DEVICE_RECT = MODAL_RECT;
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

// ── The unified offer screen ─────────────────────────────────────────────────
//
// One panel: a header with the disposition meter, two scrolling goods lists, the
// give/take trays, an always-populated description strip, and the ledger band.
// renderer._drawOfferScreen (draw) and main._tapOffer (hit-test) read this SAME
// function, so a row's tap zone can never drift from where it was painted.
// offerRowIndexAt / offerTraySlotAt do the hit-testing here too, so the slop
// policy pinned by tests/offer-layout.test.js can't drift out of sync with it.
//
// The numbers come from game/_design-offer.html, which renders this at 608x608
// against real VT323 metrics and prints a fit report. Non-overlap is pinned by
// tests/offer-layout.test.js.
//
// Everything is derived from `P` (both position and size) rather than the fixed
// canvas, so a same-size panel moved elsewhere on the 608x608 canvas gets a pure
// translation of this same layout.
export const OFFER_ROWS_VISIBLE = 6;
export const OFFER_ROW_H = 40;
export const OFFER_TRAY_SLOTS = 6;

export function offerLayout(panelRect) {
    const P = panelRect || MODAL_RECT;
    const px = P.x + 8, pr = P.x + P.w - 8;
    const gutter = 16;                       // gutter MUST exceed 2 * HIT_SLOP
    const colW = (pr - px - gutter) / 2;
    // YOUR satchel on the LEFT, their goods on the RIGHT -- Caelan's call,
    // 2026-09-01. It puts each column directly above the tray it stages into
    // (yours -> YOU GIVE on the left, theirs -> YOU TAKE on the right), so both
    // staging motions are vertical instead of crossing the panel diagonally,
    // while the trays keep reading YOU GIVE -> YOU TAKE left-to-right in the
    // same order as the ledger's GIVING / TAKING. The cost is the Fallout-3
    // convention of the vendor's stock on the left, which he traded away
    // knowingly.
    const leftX = px, rightX = px + colW + gutter;

    const listY = P.y + 102;
    const rows = (ox) => Array.from({ length: OFFER_ROWS_VISIBLE }, (_, i) => ({
        x: ox, y: listY + i * OFFER_ROW_H, w: colW, h: OFFER_ROW_H,
    }));
    const trayY = P.y + 360;
    const tray = (ox) => Array.from({ length: OFFER_TRAY_SLOTS }, (_, i) => ({
        x: ox + i * 42, y: trayY, w: 36, h: 36,
    }));
    const listH = OFFER_ROWS_VISIBLE * OFFER_ROW_H;

    // 460, not 464: the band is three rows deep when a bad deal is staged
    // (GIVING / TAKING on the left, BALANCE / figure / "they'll remember this"
    // on the right), and at 464 the third row's baseline landed exactly on the
    // hint line with no gap at all.
    const ledgerY = P.y + 460;
    const buttonW = 156, buttonX = pr - buttonW;

    return {
        panel: P,
        meterBar:          { x: px, y: P.y + 60, w: 320, h: 12 },
        // The two multiplier rows the header stacks beside the meter. They used
        // to be `mb.y - 5` / `mb.y + 8` invented inside the renderer, which put
        // the band's real bottom (68 + a 12px glyph box = 80) somewhere the
        // containment suite could not see -- and a colHeadY that cleared the
        // 12px BAR still landed on top of the SELL row.
        meterMulTopY:       P.y + 55,
        meterMulBotY:       P.y + 68,
        // 86, not 94: drawText's y is the TOP of the glyph box, so a scale-1
        // header at 94 ran to 106 and bit 4px into the first row at 102 -- the
        // staged row's border clipped the header's descenders.
        colHeadY:           P.y + 86,
        yours:              rows(leftX),
        theirs:             rows(rightX),
        yoursScrollTrack:   { x: leftX + colW - 5,  y: listY, w: 3, h: listH },
        theirsScrollTrack:  { x: rightX + colW - 5, y: listY, w: 3, h: listH },
        trayLabelY:         P.y + 346,
        giveTray:           tray(leftX),
        takeTray:           tray(rightX),
        desc:               { x: px, y: P.y + 400, w: pr - px, h: 54 },
        // label at ledger.x, value at ledgerValueX, BALANCE at ledgerBalanceX —
        // gives the renderer a truncation bound so a long give-list can't run
        // into the balance figure.
        // h is the whole band, not one row: 3 rows of 14 plus the last row's
        // text height. An earlier 20 described only the first row, which made
        // the containment test pass over a band that actually ran 22px further.
        ledger:             { x: px, y: ledgerY, w: buttonX - px - 8, h: 42 },
        ledgerRowH:         14,
        ledgerValueX:       px + 56,
        ledgerBalanceX:     px + 268,
        button:             { x: buttonX, y: ledgerY - 2, w: buttonW, h: 40 },
        hintY:              P.y + 506,
    };
}

function _ptInRect(pt, r) {
    return pt.x >= r.x && pt.x < r.x + r.w && pt.y >= r.y && pt.y < r.y + r.h;
}

// Resolve a tap point to a data index within one scrolling list column, or -1.
// ZERO slop — rows tile with no real gap, so expanding any one of them would
// overlap its neighbour and make the tap ambiguous (the thing this module
// exists to prevent). `scroll` is the data index of the first visible row.
export function offerRowIndexAt(L, pt, side, scroll) {
    const rows = side === 'yours' ? L.yours : L.theirs;
    for (let i = 0; i < rows.length; i++) {
        if (_ptInRect(pt, rows[i])) return i + (scroll || 0);
    }
    return -1;
}

// Resolve a tap point to a slot index within one tray, or -1. ZERO slop here
// too, though tray slots already have a real 6px gap (36px slots, 42px
// stride) — a tap landing in that gap is genuinely ambiguous and returns -1
// rather than guessing which neighbour it meant.
export function offerTraySlotAt(L, pt, side) {
    const slots = side === 'take' ? L.takeTray : L.giveTray;
    for (let i = 0; i < slots.length; i++) {
        if (_ptInRect(pt, slots[i])) return i;
    }
    return -1;
}
