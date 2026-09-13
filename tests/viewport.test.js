// viewport.test.js — the screen's geometry (plans/screen-fill.md).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    computeViewport, DEFAULT_VIEW, MIN_TILES, ART_PX, MENU_SIZE,
    tileToScreen, screenToTile, offView, clientToScreen, toMenu, snapPx,
} from '../game/viewport.js';

// The six screens the spec's table is measured on: CSS size and DPR, then the
// tile size in screen px and the tiles on screen the rule must give.
const SCREENS = {
    "Caelan's monitor": { cssW: 3440, cssH: 1440, dpr: 1, tile: 64, cols: 53.75,  rows: 22.5 },
    '1080p':            { cssW: 1920, cssH: 1080, dpr: 1, tile: 48, cols: 40,     rows: 22.5 },
    '1440p':            { cssW: 2560, cssH: 1440, dpr: 1, tile: 64, cols: 40,     rows: 22.5 },
    'laptop':           { cssW: 1440, cssH: 900,  dpr: 2, tile: 80, cols: 36,     rows: 22.5 },
    'phone upright':    { cssW: 390,  cssH: 844,  dpr: 3, tile: 48, cols: 24.375, rows: 52.75 },
    'phone sideways':   { cssW: 844,  cssH: 390,  dpr: 3, tile: 48, cols: 52.75,  rows: 24.375 },
};
const at = (s, extra = {}) => computeViewport({ cssW: s.cssW, cssH: s.cssH, dpr: s.dpr, ...extra });

describe('fill: one rule picks the tile size', () => {
    for (const [name, s] of Object.entries(SCREENS)) {
        test(`${name}: ${s.tile}px tiles, ${s.cols} x ${s.rows} on screen`, () => {
            const vp = at(s);
            assert.equal(vp.k * 16, s.tile);
            assert.equal(vp.cols, s.cols);
            assert.equal(vp.rows, s.rows);
        });
    }

    test('fits at least MIN_TILES along the short side, at the largest whole scale that does', () => {
        for (const dpr of [1, 1.25, 1.5, 2, 3]) {
            for (let w = 360; w <= 3840; w += 97) {
                for (let h = 360; h <= 2160; h += 131) {
                    const vp = computeViewport({ cssW: w, cssH: h, dpr });
                    const short = Math.min(vp.backingW, vp.backingH);
                    assert.ok(Number.isInteger(vp.k) && vp.k >= 1, `k=${vp.k}`);
                    assert.ok(short / (16 * vp.k) >= MIN_TILES, `${w}x${h}@${dpr}: too few tiles`);
                    assert.ok(short / (16 * (vp.k + 1)) < MIN_TILES, `${w}x${h}@${dpr}: a bigger scale fits`);
                }
            }
        }
    });

    test('the backing store matches the canvas one to one (no resampling)', () => {
        for (const s of Object.values(SCREENS)) {
            const vp = at(s);
            assert.equal(vp.cssW * s.dpr, vp.backingW);
            assert.equal(vp.cssH * s.dpr, vp.backingH);
        }
    });

    test('art pixels land on whole backing px: the origin, the menu box and the scroll step', () => {
        for (const dpr of [1, 1.25, 1.5, 2, 3]) {
            for (let w = 360; w <= 3840; w += 113) {
                const vp = computeViewport({ cssW: w, cssH: Math.round(w * 0.6), dpr });
                for (const v of [vp.origin.x, vp.origin.y, vp.menu.x, vp.menu.y]) {
                    assert.ok(Number.isInteger(v * vp.scale), `${v} logical px is ${v * vp.scale} backing px`);
                }
                assert.ok(Number.isInteger(vp.snap * vp.scale), `snap ${vp.snap} at scale ${vp.scale}`);
            }
        }
    });

    test('you stand at the centre of the world area', () => {
        const vp = at(SCREENS['1080p']);           // 1280 x 720 logical
        assert.deepEqual(vp.origin, { x: 624, y: 344 });
        assert.deepEqual(vp.span, { iMin: -20, iMax: 20, jMin: -11, jMax: 11 });
    });

    test('a dock shrinks the world area and lifts you to its centre', () => {
        const dock = { oneRow: 100, twoRows: 196, minOneRowW: 1000 };
        const wide = at(SCREENS['1080p'], { dock });
        assert.equal(wide.dockRows, 1);
        assert.equal(wide.dockH, 100);
        assert.deepEqual(wide.world, { x: 0, y: 0, w: 1280, h: 620 });
        assert.equal(wide.origin.y, 294);
        const tall = at(SCREENS['phone upright'], { dock });
        assert.equal(tall.portrait, true);
        assert.equal(tall.dockRows, 2);
        assert.equal(tall.dockH, 196);
        // Wider than tall, but under minOneRowW logical px: two rows as well.
        const squarish = computeViewport({ cssW: 1100, cssH: 1000, dpr: 1, dock });
        assert.equal(squarish.portrait, false);
        assert.equal(squarish.dockRows, 2);
    });

    test('the menu box is centred and fully on screen', () => {
        for (const s of Object.values(SCREENS)) {
            const vp = at(s);
            assert.equal(vp.menu.w, MENU_SIZE);
            assert.equal(vp.menu.h, MENU_SIZE);
            assert.ok(vp.menu.x >= 0 && vp.menu.x + MENU_SIZE <= vp.w, `menu off screen across on ${s.cssW}x${s.cssH}`);
            assert.ok(vp.menu.y >= 0 && vp.menu.y + MENU_SIZE <= vp.h, `menu off screen down on ${s.cssW}x${s.cssH}`);
            assert.ok(Math.abs(vp.menu.x + MENU_SIZE / 2 - vp.w / 2) <= ART_PX);
        }
    });

    test('a nonsense dpr falls back to 1', () => {
        const one = computeViewport({ cssW: 1920, cssH: 1080, dpr: 1 });
        assert.deepEqual(computeViewport({ cssW: 1920, cssH: 1080, dpr: 0 }), one);
        assert.deepEqual(computeViewport({ cssW: 1920, cssH: 1080, dpr: NaN }), one);
    });
});

describe('conversions', () => {
    const views = [DEFAULT_VIEW, at(SCREENS["Caelan's monitor"]), at(SCREENS['phone upright'])];

    test('screenToTile inverts tileToScreen, mid-scroll too', () => {
        for (const vp of views) {
            for (const [sx, sy] of [[0, 0], [12, -20], [-31, 5]]) {
                for (let dx = -8; dx <= 8; dx++) for (let dy = -6; dy <= 6; dy++) {
                    const p = tileToScreen(vp, 50 + dx, 40 + dy, 50, 40, sx, sy);
                    const back = screenToTile(vp, { x: p.x + 5, y: p.y + 27 }, 50, 40, sx, sy);
                    assert.deepEqual(back, { x: 50 + dx, y: 40 + dy });
                }
            }
        }
    });

    test('clientToScreen maps the drawn rect onto the logical screen', () => {
        const vp = at(SCREENS['1080p']);
        const rect = { left: 10, top: 20, width: 1920, height: 1080 };
        assert.deepEqual(clientToScreen(vp, 10, 20, rect), { x: 0, y: 0 });
        assert.deepEqual(clientToScreen(vp, 1930, 1100, rect), { x: 1280, y: 720 });
        assert.equal(clientToScreen(vp, 5, 5, { left: 0, top: 0, width: 0, height: 0 }), null);
    });

    test("toMenu moves a screen point into the menu box's own space", () => {
        const vp = at(SCREENS['1080p']);
        assert.deepEqual(toMenu(vp, { x: vp.menu.x + 10, y: vp.menu.y + 20 }), { x: 10, y: 20 });
        assert.deepEqual(toMenu(DEFAULT_VIEW, { x: DEFAULT_VIEW.menu.x, y: DEFAULT_VIEW.menu.y }), { x: 0, y: 0 });
        assert.equal(toMenu(vp, null), null);
    });

    test("snapPx rounds to the viewport's step", () => {
        const even = at(SCREENS["Caelan's monitor"]);   // k = 4, so scale is 2
        assert.equal(even.snap, 1);
        assert.equal(snapPx(even, 3.4), 3);
        const odd = at(SCREENS['1080p']);          // k = 3, so scale is 1.5
        assert.equal(odd.snap, 2);
        assert.equal(snapPx(odd, 3.4), 4);
        assert.equal(snapPx(odd, 2.9), 2);
    });

    test('offView keeps a margin of m tiles past the span on every side', () => {
        const vp = at(SCREENS['1080p']);
        for (const m of [1, 2, 3, 4]) {
            assert.equal(offView(vp, vp.span.iMin - m, 0, m), false);
            assert.equal(offView(vp, vp.span.iMin - m - 1, 0, m), true);
            assert.equal(offView(vp, vp.span.iMax + m, 0, m), false);
            assert.equal(offView(vp, vp.span.iMax + m + 1, 0, m), true);
            assert.equal(offView(vp, 0, vp.span.jMax + m + 1, m), true);
        }
    });
});
