// wheel-hint-banner.test.js — FX53: with the wheel open in a fight, the gold hint
// and the red enemy count each get their own line (plans/fx53-wheel-hint-count-rows.md).
//
// They used to be drawn at the same y (`strip - 16`), so the count covered the
// middle of the hint. These tests run the real _drawWheel on a recording canvas
// and read the rows it draws, at the ultrawide and at a phone's width.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Renderer, wheelBannerRows } from '../game/renderer.js';
import { BitmapFont } from '../game/bitmap-font.js';
import { hudLayout, DOCK } from '../game/layout.js';
import { computeViewport } from '../game/viewport.js';
import { createWheelState, isCombatActive } from '../game/wheel-model.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

function recorder() {
    const calls = [];
    const state = { globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: null, strokeStyle: null, filter: 'none' };
    const ctx = new Proxy(state, {
        get(t, k) {
            if (k in t) return t[k];
            return (...a) => {
                calls.push({ fn: k, a, fill: t.fillStyle });
                if (k === 'createRadialGradient' || k === 'createLinearGradient') return { addColorStop() {} };
            };
        },
        set(t, k, v) { t[k] = v; return true; },
    });
    return { ctx, calls };
}

const SIZES = {
    ultrawide: { cssW: 3440, cssH: 1440, dpr: 1 },
    phone:     { cssW: 390,  cssH: 844,  dpr: 3 },
};

const HINT = 'WHEEL OPEN  ·  MOVE KEYS STEER IT  ·  ESC TO CLOSE';
const TEXT_H = 12;   // a scale-1 line: fontSize 12

function rig(size) {
    const VP = computeViewport({ ...SIZES[size], dock: DOCK });
    const main = recorder();
    const font = new BitmapFont();
    const drawn = [];
    const real = font.drawText.bind(font);
    font.drawText = (ctx, text, x, y, o = {}) => { drawn.push({ text, x, y, color: o.color, order: main.calls.length }); real(ctx, text, x, y, o); };
    const r = Object.assign(Object.create(Renderer.prototype), {
        ctx: main.ctx, canvas: { width: VP.backingW, height: VP.backingH },
        viewport: VP, sprites: { uiPanel: null }, font,
        _fightFace: false, _hudFor: null, _hudFaceFor: null, _hudCache: null,
    });
    return { r, drawn, calls: main.calls, VP };
}

const foe = (name, x, state = 'chasing') => ({ x, y: 5, state, name, type: name.toLowerCase(), entity: { name, isAlive: () => true } });
const gameWith = (enemies) => ({ enemies, playerX: 5, playerY: 5, wheel: createWheelState(), state: 'radial_menu' });

for (const size of Object.keys(SIZES)) {
    describe(`the open wheel in a fight, at ${size} width`, () => {
        const { r, drawn, calls, VP } = rig(size);
        const game = gameWith([foe('Wererat', 7), foe('Rat', 9)]);
        r._drawWheel(game);
        const hud = hudLayout(VP);
        const hint = drawn.find((d) => d.text === HINT);
        const count = drawn.find((d) => d.text.startsWith('⚔ '));
        const rowsOf = (d) => ({ top: d.y, bottom: d.y + TEXT_H });

        test('it is a fight by the same check the renderer uses, and both banners are drawn', () => {
            assert.equal(isCombatActive(game), true);
            assert.ok(hint, 'the hint');
            assert.ok(count, 'the count');
            assert.equal(count.text, '⚔ 2  WERERAT');
            assert.equal(count.color, '#e8462f');
        });

        test('the hint and the count do not overlap', () => {
            const h = rowsOf(hint), c = rowsOf(count);
            assert.ok(c.bottom <= h.top, `count ${JSON.stringify(c)} must end above hint ${JSON.stringify(h)}`);
        });

        test("the count's row clears the dock: it ends above the hint row, which ends at the dock's top", () => {
            const bands = calls.filter((c) => c.fn === 'fillRect' && c.a[3] > 0 && c.a[0] === 0 && c.a[2] === VP.w);
            const hintBand = bands.find((c) => c.fill === 'rgba(0,0,0,0.55)');
            const countBand = bands.find((c) => c.fill === 'rgba(40,0,0,0.6)');
            assert.ok(hintBand && countBand);
            assert.equal(hintBand.a[1] + hintBand.a[3], hud.strip, 'the hint row sits on the dock');
            assert.equal(countBand.a[1] + countBand.a[3], hintBand.a[1], 'the count row sits on the hint row');
            assert.ok(countBand.a[1] + countBand.a[3] <= hud.strip);
        });

        test("the count's row clears the dial", () => {
            const dialLeft = hud.wheel.cx - hud.dialRadius(1, true);
            const right = count.x + r.font.measure(count.text, 1) / 2;
            assert.ok(right <= dialLeft, `count's right edge ${right} reaches the dial at ${dialLeft}`);
            const hintRight = hint.x + r.font.measure(HINT, 1) / 2;
            assert.ok(hintRight <= dialLeft, `hint's right edge ${hintRight} reaches the dial at ${dialLeft}`);
        });

        test('both rows are drawn before the dial, so neither band paints over it', () => {
            const dialAt = calls.findIndex((c) => c.fn === 'arc');
            assert.ok(dialAt > 0);
            assert.ok(hint.order <= dialAt && count.order <= dialAt);
            const countBand = calls.findIndex((c) => c.fn === 'fillRect' && c.fill === 'rgba(40,0,0,0.6)');
            assert.ok(countBand >= 0 && countBand < dialAt);
        });
    });
}

describe('the wheel open with no fight', () => {
    test('no count is drawn and the hint stays on its old row', () => {
        const { r, drawn, VP } = rig('ultrawide');
        const game = gameWith([foe('Rat', 7, 'idle')]);
        r._drawWheel(game);
        assert.equal(isCombatActive(game), false);
        assert.equal(drawn.some((d) => d.text.startsWith('⚔ ')), false);
        const hint = drawn.find((d) => d.text === HINT);
        assert.equal(hint.y, hudLayout(VP).strip - 16);
        assert.equal(hint.x, VP.w / 2);
    });
});

describe('wheelBannerRows', () => {
    const base = { strip: 620, vpW: 1720, dialLeft: 1388, hintW: 250 };
    test('no count: the hint keeps its old row and centre', () => {
        const rows = wheelBannerRows(base);
        assert.equal(rows.count, null);
        assert.deepEqual(rows.hint, { x: 860, y: 604, band: { y: 596, h: 24 } });
    });
    test('with a count: its row is the 26px above the hint row, same sideways rule', () => {
        const rows = wheelBannerRows({ ...base, countW: 58 });
        assert.equal(rows.count.band.y + rows.count.band.h, rows.hint.band.y);
        assert.ok(rows.count.y + TEXT_H <= rows.hint.band.y);
        assert.equal(rows.count.x, 860);
    });
    test('when the screen centre would run under the dial, both sit in the room left of it', () => {
        const rows = wheelBannerRows({ strip: 1492, vpW: 780, dialLeft: 300, hintW: 250, countW: 58 });
        assert.equal(rows.hint.x, 150);
        assert.equal(rows.count.x, 150);
        assert.ok(rows.count.x + 58 / 2 <= 300);
    });
});
