// viewport.js — the screen: how big it is in pixels and in tiles, where the
// world shows through, where you stand on it, and where menus go.
//
// The one source of truth for screen geometry (plans/screen-fill.md). The
// renderer draws with it and main.js hit-tests with it, so a tap lands where
// the thing was drawn: the contract layout.js keeps for panels. Pure: no DOM,
// no game state, node-testable like perception.js.
//
// Units. A logical px is what the renderer draws in: a tile is TILE_PX (32)
// logical px and one art pixel (the art is 16x16) is 2. `scale` is the canvas
// transform, backing-store px per logical px. `k` is backing-store px per art
// pixel; pixel art stays crisp only while k is a whole number.

import { TILE_PX, CANVAS_PX } from './data.js';

export const ART_PX = TILE_PX / 16;    // logical px per art pixel: 2
export const MIN_TILES = 20;           // the rule: at least this many tiles along the short side
export const MENU_SIZE = CANVAS_PX;    // menus keep their 608x608 layouts, in a centred box

// The scales a screen allows (plans/zm1-zoom-steps.md). Every step is a whole
// k, so pixel art stays crisp. 1 is the farthest. The automatic scale (the
// tile rule above) is one of the steps. Closer may go past that rule's floor,
// but only as far as menus still fit: they keep their 608x608 layouts, so the
// closest step is the largest k that leaves MENU_SIZE logical px along the
// short side. On many screens that is the automatic step itself.
export function zoomRange(backingW, backingH) {
    const short = Math.min(backingW, backingH);
    const auto = Math.max(1, Math.floor(short / (16 * MIN_TILES)));
    const closest = Math.max(auto, Math.floor(short / (MENU_SIZE / ART_PX)));
    return Object.freeze({ min: 1, auto, max: closest });
}

// A saved zoom is a whole number or nothing (nothing = automatic).
const asZoom = (v) => (Number.isInteger(v) && v >= 1 && v <= 64) ? v : null;

// The step one Closer (dir +1) or Farther (dir -1) from `k`, kept inside the range.
export function stepZoom(range, k, dir) {
    const next = (Number.isInteger(k) ? k : range.auto) + (dir > 0 ? 1 : -1);
    return Math.min(range.max, Math.max(range.min, next));
}

// What to save for a chosen step: choosing the automatic step saves nothing,
// so the setting keeps following the screen.
export function zoomToSave(range, k) {
    return (asZoom(k) === null || k === range.auto) ? null : k;
}

// The zoom is kept on the device under its own key, apart from the save file
// and from settings.js. `storage` is a localStorage, passed in so this stays
// pure; every access is wrapped so private mode or a quota never throws.
export const ZOOM_KEY = 'violencetown.zoom';

export function readZoom(storage) {
    try {
        const raw = storage && storage.getItem(ZOOM_KEY);
        return raw ? asZoom(JSON.parse(raw)) : null;
    } catch (e) {
        return null;
    }
}

export function writeZoom(storage, k) {
    try {
        if (!storage) return;
        if (asZoom(k) === null) storage.removeItem(ZOOM_KEY);
        else storage.setItem(ZOOM_KEY, JSON.stringify(k));
    } catch (e) {
        console.warn('[zoom] not saved', e);
    }
}

// Round a logical coordinate to whole art pixels, which land on whole
// backing-store px at every k.
const toArt = (v) => ART_PX * Math.round(v / ART_PX);

// Fill cssW x cssH with as many tiles as fit, at the largest whole scale that
// still shows MIN_TILES along the short side. `dock` ({ oneRow, twoRows,
// minOneRowW }, logical px) is the strip along the bottom the world does not
// show through: one row on a wide screen, two rows on an upright one or one
// narrower than minOneRowW. `zoom` (a whole scale, optional) overrides the
// automatic scale; it is clamped to the screen's steps, and unset is automatic.
export function computeViewport({ cssW, cssH, dpr = 1, dock = null, zoom = null } = {}) {
    const d = (Number.isFinite(dpr) && dpr > 0) ? dpr : 1;
    // A screen we cannot measure has to fall back the way a bad dpr does. Every
    // radial gradient the renderer builds is placed from origin/w/h, and
    // createRadialGradient THROWS on a non-finite argument — so one NaN reaching
    // here takes down the whole frame (and the effects loop drawing it) rather
    // than drawing something slightly wrong. Unmeasurable gets the same 1px
    // floor a 0px screen already gets.
    const px = (v) => (Number.isFinite(v) ? v : 0);
    const backingW = Math.max(1, Math.floor(px(cssW) * d));
    const backingH = Math.max(1, Math.floor(px(cssH) * d));
    const cssOut = { w: backingW / d, h: backingH / d };
    const range = zoomRange(backingW, backingH);
    const chosen = asZoom(zoom);
    const k = chosen === null ? range.auto : Math.min(range.max, Math.max(range.min, chosen));
    const scale = k / ART_PX;
    const w = backingW / scale, h = backingH / scale;
    const portrait = h > w;
    const dockRows = !dock ? 0 : (portrait || w < dock.minOneRowW) ? 2 : 1;
    const dockH = dockRows === 2 ? dock.twoRows : dockRows === 1 ? dock.oneRow : 0;
    const world = { x: 0, y: 0, w, h: h - dockH };
    const origin = {
        x: toArt(world.x + world.w / 2 - TILE_PX / 2),
        y: toArt(world.y + world.h / 2 - TILE_PX / 2),
    };
    return Object.freeze({
        cssW: cssOut.w, cssH: cssOut.h, backingW, backingH,
        scale, k: scale * ART_PX, zoom: range, w, h, cols: w / TILE_PX, rows: h / TILE_PX,
        world, origin, dockH, dockRows, portrait,
        // The tiles, relative to yours, that are at least partly on screen.
        span: {
            iMin: -Math.ceil(origin.x / TILE_PX), iMax: Math.ceil((w - origin.x) / TILE_PX) - 1,
            jMin: -Math.ceil(origin.y / TILE_PX), jMax: Math.ceil((h - origin.y) / TILE_PX) - 1,
        },
        menu: {
            x: Math.max(0, toArt((w - MENU_SIZE) / 2)),
            y: Math.max(0, toArt((h - MENU_SIZE) / 2)),
            w: MENU_SIZE, h: MENU_SIZE,
        },
        // A logical offset that is a multiple of this lands on whole backing px.
        snap: Number.isInteger(scale) ? 1 : ART_PX,
        // Logical px per CSS px, to size page elements that overlay the canvas.
        logicalPerCss: (backingW / cssOut.w) / scale,
    });
}

// The screen a renderer draws on before main hands it a viewport, and in
// tests that build renderers by hand: a 1080p monitor.
export const DEFAULT_VIEW = computeViewport({ cssW: 1920, cssH: 1080, dpr: 1 });

// Where tile (tx, ty) lands on screen, logical px, for a camera on (px, py)
// that has scrolled (sx, sy) logical px partway through a step.
export function tileToScreen(vp, tx, ty, px, py, sx = 0, sy = 0) {
    return { x: vp.origin.x + (tx - px) * TILE_PX - sx, y: vp.origin.y + (ty - py) * TILE_PX - sy };
}

// The tile under a screen point: the inverse of tileToScreen.
export function screenToTile(vp, pt, px, py, sx = 0, sy = 0) {
    return {
        x: px + Math.floor((pt.x + sx - vp.origin.x) / TILE_PX),
        y: py + Math.floor((pt.y + sy - vp.origin.y) / TILE_PX),
    };
}

// Is the tile (dx, dy) from yours more than `m` tiles off screen? The
// renderer's per-pass cull; `m` is the margin a pass leaves for overhang.
export function offView(vp, dx, dy, m) {
    // A tile we cannot place is not on screen. Every comparison below is false
    // for NaN, so without this the cull would wave a NaN offset through as
    // "visible" and the draw that follows would throw.
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return true;
    return dx < vp.span.iMin - m || dx > vp.span.iMax + m || dy < vp.span.jMin - m || dy > vp.span.jMax + m;
}

// A pointer's client coordinates to screen logical px, through the canvas's
// drawn rect. Null before the canvas has laid out.
export function clientToScreen(vp, clientX, clientY, rect) {
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    return { x: (clientX - rect.left) * (vp.w / rect.width), y: (clientY - rect.top) * (vp.h / rect.height) };
}

// A screen point to the menu box's own 608x608 space, where menu layouts live.
export function toMenu(vp, pt) {
    return pt && { x: pt.x - vp.menu.x, y: pt.y - vp.menu.y };
}

// Round a logical offset (camera scroll, screen shake) to the viewport's step.
export function snapPx(vp, v) {
    return Math.round(v / vp.snap) * vp.snap;
}
