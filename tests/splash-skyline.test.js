// splash-skyline.test.js — SK1: the title screen's skyline stays inside its sky
// (plans/sk1-title-skyline-in-sky.md).
//
// The sky runs from x=24 to x=296 on the 320x220 splash canvas; the panel's
// frame sits just outside it. The real _drawSplashCityscape is run against a
// stand-in context that records every rect it fills, and none may cross either
// edge. (A drawing check, so a stand-in context is the right tool here.)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Renderer } from '../game/renderer.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const SKY_L = 24, SKY_R = 296;
const BUILDING = ['#2a1e14', '#100a08'];     // the far and near rows' fills
const WINDOW = '#d4b96a';
const MOON = '#d4b96a';

function drawnRects() {
    const rects = [];
    const ctx = {
        fillStyle: '#000',
        createLinearGradient: () => ({ addColorStop() {} }),
        fillRect(x, y, w, h) { rects.push({ x, y, w, h, fill: this.fillStyle }); },
    };
    const r = Object.assign(Object.create(Renderer.prototype), { ctx });
    r._drawSplashCityscape(ctx);
    return rects;
}

describe('the splash skyline stays inside its sky', () => {
    const rects = drawnRects();

    test('it draws something (a check that finds nothing proves nothing)', () => {
        assert.ok(rects.length > 100, `only ${rects.length} rects drawn`);
        assert.ok(rects.some(r => BUILDING.includes(r.fill)), 'no building rects');
        assert.ok(rects.some(r => r.fill === WINDOW), 'no window or moon rects');
    });

    test('no rect crosses the sky\'s left or right edge', () => {
        for (const r of rects) {
            assert.ok(r.w > 0 && r.h > 0, `empty rect ${JSON.stringify(r)}`);
            assert.ok(r.x >= SKY_L, `rect pokes left of x=${SKY_L}: ${JSON.stringify(r)}`);
            assert.ok(r.x + r.w <= SKY_R, `rect pokes right of x=${SKY_R}: ${JSON.stringify(r)}`);
        }
    });

    test('both rows still reach the sky\'s right edge (cut, not dropped)', () => {
        for (const fill of BUILDING) {
            const reach = Math.max(...rects.filter(r => r.fill === fill).map(r => r.x + r.w));
            assert.equal(reach, SKY_R, `${fill} row stops short at x=${reach}`);
        }
    });

    test('and the left edge', () => {
        for (const fill of BUILDING) {
            const first = Math.min(...rects.filter(r => r.fill === fill).map(r => r.x));
            assert.equal(first, SKY_L);
        }
    });

    test('the moon is drawn whole', () => {
        const moon = rects.filter(r => r.fill === MOON && r.w > 1);
        assert.equal(moon.length, 5);
    });
});

// The hint's room. VT323 only draws in a browser, so the glyph boxes below were
// measured there (SK1: the splash drawn with one text at a time, minus the same
// splash with no text, at 2x backing; offsets are from each drawText y, in
// logical px). This test pins the y values the renderer passes and checks the
// gaps those measured boxes leave.
describe('PRESS SPACE OR CLICK BELOW has room', () => {
    const GLYPH = {   // [top offset, bottom offset] of the drawn glyph pixels, from y
        'GAME START': [5.5, 28],               // the 3x text; drawn first at its shadow's y, whose glyphs sit lowest
        'PRESS SPACE OR CLICK BELOW': [1.5, 8.5],
        'BY CAELAN GANDER': [1.5, 8.5],
    };
    const words = [];
    const ctx = new Proxy({ fillStyle: '#000' }, {
        get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })),
        set: (t, k, v) => { t[k] = v; return true; },
    });
    const r = Object.assign(Object.create(Renderer.prototype), {
        ctx, sprites: { uiPanel: null },
        font: { drawText: (c, text, x, y) => words.push({ text, y }) },
    });
    r.renderSplash({ getContext: () => ctx });

    const box = (text) => {
        const w = words.find(x => x.text === text);
        assert.ok(w, `${text} not drawn`);
        return { top: w.y + GLYPH[text][0], bottom: w.y + GLYPH[text][1] };
    };

    test('at least 2px clear above it (GAME START\'s shadow copy is the lowest)', () => {
        const gs = box('GAME START'), hint = box('PRESS SPACE OR CLICK BELOW');
        assert.ok(hint.top - gs.bottom >= 2, `gap above is ${hint.top - gs.bottom}`);
    });

    test('at least 2px clear below it', () => {
        const hint = box('PRESS SPACE OR CLICK BELOW'), by = box('BY CAELAN GANDER');
        assert.ok(by.top - hint.bottom >= 2, `gap below is ${by.top - hint.bottom}`);
    });
});
