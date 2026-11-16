// dialogue-overlay.test.js — FX63: talking to someone hides their faced label, and the
// dialogue window stays clear of the dock (plans/fx63-dialogue-label-and-dock.md).
//
// The real _openDialogue / _closeDialogue / _dialogueChoices are lifted out of main.js (which
// touches `document` at import) and opened on Mince, who is read from the real dialogue table.
// The real Renderer draws the window with a recording font.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Renderer } from '../game/renderer.js';
import { getDialogue } from '../game/dialogue.js';
import { computeViewport } from '../game/viewport.js';
import { DOCK, dialogueBottom } from '../game/layout.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');

function liveMethod(name, params, freeVars) {
    const signature = `${name}(${params}) {`;
    const at = mainSrc.indexOf(signature);
    assert.ok(at > 0, `${name}(${params}) not found in main.js`);
    const closeAt = mainSrc.indexOf('\n    }', at);
    const body = mainSrc.slice(at + name.length, closeAt + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
}

const STATE = { IDLE: 'idle', DIALOGUE: 'dialogue' };
const audio = { playSfx() {} };

function rig(vp) {
    const texts = [];
    const ctx = new Proxy({}, {
        get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })),
        set: (t, k, v) => { t[k] = v; return true; },
    });
    const font = {
        measure: (s, sc = 1) => String(s).length * 4.8 * sc,
        drawText: (_c, s, x, y, o = {}) => texts.push({ s: String(s), x, y, scale: o.scale ?? 1 }),
    };
    const r = Object.assign(Object.create(Renderer.prototype), { ctx, sprites: {}, font, viewport: vp });
    r._fillScreen = () => {};
    r._drawMoodFace = () => {};
    r._wrapText = (s) => [String(s)];
    return { r, texts };
}

function game(renderer) {
    const mince = { type: 'mince', name: 'Mince', dialogueId: 'mince', x: 5, y: 5, disposition: 0 };
    const g = {
        state: STATE.IDLE, renderer, inventory: [], facing: 'left', playerX: 6, playerY: 5, _animating: false,
        _render() {}, _resumeHeldWalk() {}, mince,
    };
    g._openDialogue = liveMethod('_openDialogue', 'npc', { STATE, getDialogue, audio });
    g._closeDialogue = liveMethod('_closeDialogue', '', { STATE });
    g._dialogueChoices = liveMethod('_dialogueChoices', '', { getDialogue });
    return g;
}

const bigVp = computeViewport({ cssW: 3440, cssH: 1440, dpr: 1, dock: DOCK });
const phoneVp = computeViewport({ cssW: 390, cssH: 844, dpr: 1, dock: DOCK });

describe('FX63 the faced label while talking', () => {
    test('shown when you face Mince, hidden once a real dialogue with him is open, back when it closes', () => {
        const { r } = rig(bigVp);
        const g = game(r);
        assert.equal(r._facedLabelShows(g, g.mince), true);
        g._openDialogue(g.mince);
        assert.equal(g.state, STATE.DIALOGUE);
        assert.equal(g._dialogueNpc, g.mince);
        assert.equal(r._facedLabelShows(g, g.mince), false);
        g._closeDialogue();
        assert.equal(r._facedLabelShows(g, g.mince), true);
    });

    test('the entity pass asks that rule before drawing the tag', () => {
        const src = readFileSync(fileURLToPath(new URL('../game/renderer.js', import.meta.url)), 'utf8');
        assert.match(src, /!pest && this\._facedLabelShows\(game, e\)/);
    });
});

describe('FX63 the dialogue window and the dock', () => {
    for (const [name, vp] of [['3440x1440', bigVp], ['phone 390x844', phoneVp]]) {
        test(`${name}: Mince's window sits inside the menu box and above the dock`, () => {
            const { r, texts } = rig(vp);
            const g = game(r);
            g._openDialogue(g.mince);
            r._drawDialogueModal(g);
            const R = r._dialogueRect;
            assert.ok(texts.some(t => t.s === 'MINCE'), 'the window names Mince');
            assert.ok(R.y >= 0 && R.x >= 0 && R.x + R.w <= vp.menu.w && R.y + R.h <= vp.menu.h, 'inside the menu box');
            const dockTop = vp.h - vp.dockH;
            assert.ok(vp.menu.y + R.y + R.h <= dockTop, `bottom ${vp.menu.y + R.y + R.h} is above the dock at ${dockTop}`);
            assert.equal(R.y + R.h, dialogueBottom(vp));
        });
    }

    test('3440x1440 really did overlap before: the box ran into the dock', () => {
        assert.ok(bigVp.menu.y + 592 > bigVp.h - bigVp.dockH);
        assert.ok(dialogueBottom(bigVp) < 592);
    });

    test('a screen with no dock keeps the old bottom edge', () => {
        assert.equal(dialogueBottom(computeViewport({ cssW: 1920, cssH: 1080, dpr: 1 })), 592);
    });
});
