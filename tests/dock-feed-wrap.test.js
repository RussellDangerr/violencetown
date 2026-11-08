// dock-feed-wrap.test.js — the dock's newest message wraps instead of being cut (fx41).
//
// Goes through what _drawQuestLog actually draws, on the two screens that matter:
// the 3440x1440 ultrawide and a phone. A recording font stands in for VT323 with the
// fallback advance Renderer._measurer uses when a font has no measure().

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Renderer, feedRows, PANEL_TEXT_INSET } from '../game/renderer.js';
import { hudLayout, DOCK } from '../game/layout.js';
import { computeViewport } from '../game/viewport.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

function recorder() {
    const state = { globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: null, strokeStyle: null, filter: 'none' };
    return new Proxy(state, {
        get(t, k) {
            if (k in t) return t[k];
            if (k === 'createImageData') return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
            return () => ((k === 'createRadialGradient' || k === 'createLinearGradient') ? { addColorStop() {} } : undefined);
        },
        set(t, k, v) { t[k] = v; return true; },
    });
}

const ULTRAWIDE = computeViewport({ cssW: 3440, cssH: 1440, dpr: 1, dock: DOCK });
const PHONE = computeViewport({ cssW: 390, cssH: 844, dpr: 3, dock: DOCK });

function rig(vp) {
    const drawn = [];
    const r = Object.assign(Object.create(Renderer.prototype), {
        ctx: recorder(), canvas: { width: vp.backingW, height: vp.backingH },
        viewport: vp, sprites: { uiPanel: null },
        font: { drawText: (ctx, text, x, y, o = {}) => drawn.push({ text, x, y, color: o.color }) },
        _fightFace: false, _hudFor: null, _hudFaceFor: null, _hudCache: null,
    });
    return { r, drawn };
}

// Quest 1's finale line, as the log stores it (dashes already ASCII).
const FINALE = '[The car coughs, sputters, then ROARS to life - and up north the bridge barricade rattles loose. It is revving way past redline, though. Nothing that hot is making the ramp.]';
const game = (messages) => ({
    map: { zoneName: 'TOWN' },
    _timeOfDay: () => '12:05',
    questEngine: { getHudText: () => 'GO TO THE BRIDGE' },
    _logHistory: [],
    _logStripMessages: messages,
});
const OLD = [
    { text: '[Picked up a Rock]', category: 'pickup' },
    { text: '[Hit the Wererat for 4]', category: 'combat' },
];
const width = (s) => s.length * 4.8;   // the measurer's fallback advance

// The feed rows drawn: everything below the header and objective lines.
function feedDrawn(vp, messages) {
    const { r, drawn } = rig(vp);
    r._drawQuestLog(game(messages));
    const log = hudLayout(vp).log;
    const rows = drawn.filter((d) => d.y >= log.y + PANEL_TEXT_INSET + 24 - 0.5 && d.text !== 'GO TO THE BRIDGE');
    return { log, rows, all: drawn };
}

for (const [name, vp] of [['3440x1440', ULTRAWIDE], ['a phone (390x844 @3x)', PHONE]]) {
    describe(`the dock feed on ${name}`, () => {
        test('the finale line reads in full, in order, with no cut mark', () => {
            const { rows } = feedDrawn(vp, [...OLD, { text: FINALE, category: 'transition' }]);
            const text = rows.map((d) => d.text).join(' ');
            assert.ok(text.endsWith(FINALE), `rows read ${JSON.stringify(rows.map((d) => d.text))}`);
            assert.ok(!text.includes('~'), 'nothing is cut');
        });

        test('it wraps (more than one row) because it cannot fit on one line here', () => {
            const { log, rows } = feedDrawn(vp, [{ text: FINALE, category: 'transition' }]);
            assert.ok(width(FINALE) > log.w - PANEL_TEXT_INSET * 2, 'the premise: it is too long for one line');
            assert.ok(rows.length >= 2, `drew ${rows.length} row(s)`);
        });

        test('every row sits inside the panel, on its own line, clear of the header and objective', () => {
            const { log, rows, all } = feedDrawn(vp, [...OLD, { text: FINALE, category: 'transition' }]);
            const ys = rows.map((d) => d.y);
            const headerBottom = Math.max(...all.filter((d) => !rows.includes(d)).map((d) => d.y)) + 12;
            for (let i = 0; i < ys.length; i++) {
                assert.ok(ys[i] >= headerBottom, `row ${i} at ${ys[i]} runs into the objective (ends ${headerBottom})`);
                assert.ok(ys[i] + 12 <= log.y + log.h - PANEL_TEXT_INSET + 0.5, `row ${i} at ${ys[i]} spills past the panel`);
                if (i) assert.ok(ys[i] - ys[i - 1] >= 12, 'rows overlap');
            }
            for (const d of rows) assert.ok(d.x + width(d.text) <= log.x + log.w - PANEL_TEXT_INSET + 0.5, `"${d.text}" runs past the panel's right edge`);
        });

        test('a wrapped finale costs older lines their place, never their single line', () => {
            const { log, rows } = feedDrawn(vp, [...OLD, { text: FINALE, category: 'transition' }]);
            assert.ok(rows.length <= log.lines, `${rows.length} rows in a ${log.lines}-line feed`);
            const olderShown = rows.filter((d) => OLD.some((m) => m.text === d.text));
            for (const d of olderShown) assert.ok(width(d.text) <= log.w, 'older rows are whole single lines');
        });

        test('the log stays clear of the item bar and the opener', () => {
            const hud = hudLayout(vp);
            const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
            const bar = { x: hud.bar.cx - 160, y: hud.bar.bottom - 78, w: 320, h: 82 };
            assert.ok(!hit(hud.log, bar), 'log overlaps the item bar');
            assert.ok(!hit(hud.log, hud.opener), 'log overlaps the opener');
        });
    });
}

describe('older messages keep one line each', () => {
    test('with short messages, nothing wraps and every one is drawn whole', () => {
        const msgs = [...OLD, { text: '[Picked up a Stick]', category: 'pickup' }];
        const { rows } = feedDrawn(ULTRAWIDE, msgs);
        assert.deepEqual(rows.map((d) => d.text), msgs.map((m) => m.text));
    });

    test('an older long message is still cut with ~, not wrapped', () => {
        const msgs = [{ text: FINALE, category: 'transition' }, { text: '[Picked up a Stick]', category: 'pickup' }];
        const { rows } = feedDrawn(PHONE, msgs);
        assert.equal(rows.length, 2, 'one line each');
        assert.ok(rows[0].text.endsWith('~'), 'the older one is cut');
        assert.equal(rows[1].text, '[Picked up a Stick]');
    });
});

describe('feedRows', () => {
    const m = (width) => (s) => s.length * width;
    test('a newest message taller than the budget takes the whole budget and cuts its last line', () => {
        const rows = feedRows([{ text: 'aaa bbb ccc ddd eee fff', category: 'x' }], 2, 8, m(1));
        assert.equal(rows.length, 2);
        assert.ok(rows[1].text.endsWith('~'));
    });
    test('wrapped lines share one message index, so they share one fade', () => {
        const rows = feedRows([{ text: 'o', category: 'x' }, { text: 'aaa bbb ccc', category: 'x' }], 3, 7, m(1));
        assert.deepEqual(rows.map((r) => r.i), [0, 1, 1]);
    });
    test('the budget is never exceeded', () => {
        const msgs = Array.from({ length: 6 }, (_, k) => ({ text: `m${k} ` + 'w '.repeat(k * 3), category: 'x' }));
        for (let b = 1; b <= 4; b++) assert.ok(feedRows(msgs, b, 20, m(1)).length <= b);
    });
    test('nothing in, nothing out', () => {
        assert.deepEqual(feedRows([], 3, 100, m(1)), []);
    });
});
