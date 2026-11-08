// intent-label.test.js — the label over the character you face sits clear of
// its awareness marker (plans/fx10-label-clear-of-alert.md).
//
// The bump label ("GOON · HIT") is drawn in the actor pass; the awareness
// marker (? ! alert) is drawn after it, by the threat overlay, in the rows just
// above the same head. The real draw methods run here against a recording
// canvas: the label's backing box and the marker's sprite box must not overlap
// for any state that draws a marker, and with no marker the label stays put.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Enemy } from '../game/enemies.js';
import { TILE_PX } from '../game/data.js';
import { DOCK } from '../game/layout.js';
import { computeViewport } from '../game/viewport.js';
import {
    Renderer, awarenessMarkRect, showsAwarenessMark, intentLabelRect, INTENT_LABEL_H,
} from '../game/renderer.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const VP = computeViewport({ cssW: 3440, cssH: 1440, dpr: 1, dock: DOCK });

function rig() {
    const state = { globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: null, strokeStyle: null, filter: 'none' };
    const rects = [];
    const frames = [];
    const texts = [];
    const ctx = new Proxy(state, {
        get(t, k) {
            if (k === 'fillRect') return (x, y, w, h) => rects.push({ x, y, w, h, style: t.fillStyle });
            if (k in t) return t[k];
            if (k === 'createImageData') return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
            return () => (/Gradient/.test(k) ? { addColorStop() {} } : undefined);
        },
        set(t, k, v) { t[k] = v; return true; },
    });
    const emotes = { loaded: true, drawFrame: (c, col, row, x, y, w, h) => frames.push({ x, y, w, h }) };
    const r = Object.assign(Object.create(Renderer.prototype), {
        ctx, canvas: { width: VP.backingW, height: VP.backingH }, viewport: VP, sprites: { emotes },
        font: { drawText: (c, text, x, y) => texts.push({ text: String(text), x, y }), measure: (t) => String(t).length * 6 },
        _scrollX: 0, _scrollY: 0, _fightFace: true, _hudFor: null, _hudFaceFor: null, _hudCache: null,
    });
    return { r, rects, frames, texts };
}

// A hostile with eyes, one tile east of the player, who faces it.
function scene(state) {
    const e = new Enemy({ id: 'g1', type: 'Violet Fungus', x: 6, y: 5, gold: 0 });
    e.state = state;
    e._lastDx = -1; e._lastDy = 0;
    const g = {
        playerX: 5, playerY: 5, facing: 'right', turn: 1, wheel: null, _idleTick: 0, _animating: false,
        _fightOn: true, _inCombat: () => true, _damageNumbers: [],
        equipment: { weapon: null, top: null, bottom: null, front: null, back: null, sides: null },
        enemies: [e], containers: [], groundItems: [],
        map: { width: 20, height: 20, isWalkable: () => true },
    };
    // Where both passes put this tile on screen (the overlay's own formula).
    const px = VP.origin.x + (e.x - g.playerX) * TILE_PX;
    const py = VP.origin.y + (e.y - g.playerY) * TILE_PX;
    return { e, g, px, py };
}

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// Draw the faced enemy, then the threat overlay, exactly as a frame does.
function drawFrame(state) {
    const { e, g, px, py } = scene(state);
    const { r, rects, frames, texts } = rig();
    r._drawEnemySprite(g, e, px, py, 0);
    r._drawThreatOverlay(g);
    const label = texts.find(t => t.text.includes(' · '));
    const box = rects.find(b => b.style === '#000000cc' && b.h === INTENT_LABEL_H);
    return { e, px, py, label, box, mark: frames[0] };
}

describe('the bump label and the awareness marker', () => {
    for (const state of ['suspicious', 'searching', 'chasing']) {
        test(`a ${state} enemy you face: the label box sits wholly above the marker`, () => {
            const { label, box, mark } = drawFrame(state);
            assert.ok(label, 'the faced enemy is labelled');
            assert.ok(box, 'the label has its backing box');
            assert.ok(mark, 'the overlay drew an awareness marker');
            assert.ok(!overlaps(box, mark), `label ${JSON.stringify(box)} overlaps marker ${JSON.stringify(mark)}`);
            assert.ok(box.y + box.h <= mark.y, 'the label is above the marker, not beside or below it');
            // The text sits inside its own box.
            assert.ok(label.y >= box.y && label.y < box.y + box.h);
        });
    }

    test('a calm enemy you face: no marker, and the label stays where it always was', () => {
        const { label, box, mark, px, py } = drawFrame('idle');
        assert.equal(mark, undefined, 'a calm watcher draws no marker');
        assert.ok(label && box);
        assert.equal(label.y, py - 20);
        assert.equal(box.y, py - 22);
        const tw = label.text.length * 6;
        assert.equal(box.x, Math.round(px + TILE_PX / 2 - tw / 2) - 3);
        assert.equal(box.w, tw + 6);
    });

    test('the raised label still centres over the head, as wide as before', () => {
        const calm = drawFrame('idle');
        const hunt = drawFrame('chasing');
        assert.equal(hunt.box.x, calm.box.x);
        assert.equal(hunt.box.w, calm.box.w);
        assert.equal(hunt.label.x, calm.label.x);
    });
});

describe('the helpers both passes share', () => {
    test('showsAwarenessMark follows the overlay: eyes, not an ally, a state with a marker', () => {
        const e = new Enemy({ id: 'g', type: 'Violet Fungus', x: 1, y: 1, gold: 0 });
        e.state = 'chasing';
        assert.equal(showsAwarenessMark(e), true);
        assert.equal(showsAwarenessMark({ ...e, state: 'idle' }), false);
        assert.equal(showsAwarenessMark({ ...e, state: 'returning' }), false);
        assert.equal(showsAwarenessMark({ ...e, _ally: true }), false);
        assert.equal(showsAwarenessMark({ ...e, sightRange: 0 }), false);
        assert.equal(showsAwarenessMark(null), false);
    });

    test('for any label width, a raised label never meets the marker', () => {
        for (const tw of [6, 60, 120, 300]) {
            const raised = intentLabelRect(100, 100, tw, true);
            const mark = awarenessMarkRect(100, 100);
            assert.ok(!overlaps(raised, mark), `width ${tw}`);
        }
    });

    test('the unraised label is the one the marker used to cover', () => {
        const flat = intentLabelRect(100, 100, 120, false);
        assert.ok(overlaps(flat, awarenessMarkRect(100, 100)));
    });
});
