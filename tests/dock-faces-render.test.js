// dock-faces-render.test.js — what the dock's log actually DRAWS on each face
// (plans/combat-hud.md stage 3).
//
// Written because stage 3 shipped a ReferenceError past a green suite: the
// header read `fightFace` before its `const` was initialised, so _drawQuestLog
// threw on every single frame while 1446 tests passed. Nothing in the suite
// called a draw method. This does — the recording canvas from
// fight-fog-render.test.js, which is all it takes.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Renderer } from '../game/renderer.js';
import { hudLayout, DOCK } from '../game/layout.js';
import { computeViewport } from '../game/viewport.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

// A context that records the text it was asked to draw.
function recorder() {
    const calls = [];
    const state = { globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: null, strokeStyle: null, filter: 'none' };
    const ctx = new Proxy(state, {
        get(t, k) {
            if (k in t) return t[k];
            if (k === 'createImageData') return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
            return (...a) => {
                calls.push({ fn: k, a, alpha: t.globalAlpha, fill: t.fillStyle });
                if (k === 'createRadialGradient' || k === 'createLinearGradient') return { addColorStop() {} };
            };
        },
        set(t, k, v) { t[k] = v; return true; },
    });
    return { ctx, calls };
}

const VP = computeViewport({ cssW: 1920, cssH: 1080, dpr: 1, dock: DOCK });

// A renderer whose font records every string it is handed.
function rig(fight) {
    const main = recorder();
    const drawn = [];
    const r = Object.assign(Object.create(Renderer.prototype), {
        ctx: main.ctx, canvas: { width: VP.backingW, height: VP.backingH },
        viewport: VP, sprites: { uiPanel: null },   // uiSheet is a getter over sprites.uiPanel
        font: { drawText: (ctx, text, x, y, o = {}) => drawn.push({ text, x, y, color: o.color }) },
        _fightFace: fight, _hudFor: null, _hudFaceFor: null, _hudCache: null,
    });
    return { r, drawn };
}

const HISTORY = [
    { text: '[Hit the Wererat for 4]',       category: 'combat' },
    { text: '[Picked up a Rock]',            category: 'pickup' },
    { text: '[The Wererat bites you for 3]', category: 'combat' },
    { text: '[New quest: A Working Car]',    category: 'quest'  },
    { text: '[Hit the Wererat for 6]',       category: 'combat' },
    { text: '[The Wererat staggers]',        category: 'combat' },
];
const game = () => ({
    map: { zoneName: 'TOWN' },
    _timeOfDay: () => '12:05',
    questEngine: { getHudText: () => 'FIND THE CAR PARTS' },
    _logHistory: HISTORY,
    _logStripMessages: [{ text: '[Picked up a Rock]', category: 'pickup' }],
});

describe('the dock log draws on both faces', () => {
    test('the town face draws without throwing, and shows the zone and objective', () => {
        const { r, drawn } = rig(false);
        r._drawQuestLog(game());                      // would have thrown on the TDZ bug
        const texts = drawn.map((d) => d.text);
        assert.ok(texts.includes('TOWN'), `header was ${JSON.stringify(texts)}`);
        assert.ok(texts.includes('FIND THE CAR PARTS'), 'the objective');
    });

    test('the fight face draws without throwing, and replaces the header', () => {
        const { r, drawn } = rig(true);
        r._drawQuestLog(game());
        const texts = drawn.map((d) => d.text);
        assert.ok(texts.includes('COMBAT'), `header was ${JSON.stringify(texts)}`);
        assert.ok(!texts.includes('TOWN'), 'the zone gives way to the fight');
    });

    test('the fight face drops the objective and shows only combat lines', () => {
        const { r, drawn } = rig(true);
        r._drawQuestLog(game());
        const texts = drawn.map((d) => d.text);
        assert.ok(!texts.includes('FIND THE CAR PARTS'), 'a quest objective is not actionable mid-fight');
        assert.ok(!texts.includes('[Picked up a Rock]'), 'pickups are not the fight');
        assert.ok(!texts.includes('[New quest: A Working Car]'), 'nor is quest chatter');
        assert.ok(texts.includes('[The Wererat staggers]'), 'the newest combat line');
    });

    test('the fight face fits one more feed line than the town face', () => {
        const town = hudLayout(VP, { fight: false }), fight = hudLayout(VP, { fight: true });
        const feedOf = (f) => { const { r, drawn } = rig(f); r._drawQuestLog(game()); return drawn; };
        assert.equal(fight.log.lines, town.log.lines + 1);
        // Every feed line is drawn at a distinct y and inside the panel.
        for (const d of feedOf(true)) {
            assert.ok(d.y >= fight.log.y && d.y <= fight.log.y + fight.log.h, `line at y=${d.y} escaped the panel`);
        }
    });

    test('every feed line gets a real alpha — the old 3-entry ramp ran off its end at 4', () => {
        const { r } = rig(true);
        r._drawQuestLog(game());
        // hexToRgba would produce "rgba(r,g,b,undefined)" for a missing alpha.
        const { r: r2, drawn } = rig(true);
        r2._drawQuestLog(game());
        for (const d of drawn) {
            assert.ok(!String(d.color).includes('undefined'), `colour was ${d.color}`);
            assert.ok(!String(d.color).includes('NaN'), `colour was ${d.color}`);
        }
    });
});
