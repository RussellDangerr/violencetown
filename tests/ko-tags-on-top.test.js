// ko-tags-on-top.test.js — KO tags draw after every body, prop and marker
// (plans/fx48-ko-tags-on-top.md). The real _drawActors draws a frame into a
// recording canvas; every call is logged in order, and each KO tag must come
// after everything else that was drawn.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Renderer, koLabelText } from '../game/renderer.js';
import { Enemy } from '../game/enemies.js';
import { DOCK } from '../game/layout.js';
import { computeViewport } from '../game/viewport.js';
import { BitmapFont } from '../game/bitmap-font.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const font = new BitmapFont();
const VP = computeViewport({ cssW: 3440, cssH: 1440, dpr: 1, dock: DOCK });

function rig() {
    const log = [];
    const state = { globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: null, strokeStyle: null, filter: 'none' };
    const ctx = new Proxy(state, {
        get(t, k) {
            if (k in t) return t[k];
            if (k === 'createImageData') return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
            return (...a) => {
                if (k === 'fillRect') log.push({ kind: 'rect', x: a[0], y: a[1] });
                return /Gradient/.test(k) ? { addColorStop() {} } : undefined;
            };
        },
        set(t, k, v) { t[k] = v; return true; },
    });
    const r = Object.assign(Object.create(Renderer.prototype), {
        ctx, canvas: { width: VP.backingW, height: VP.backingH }, viewport: VP, sprites: {},
        font: {
            drawText: (c, text, x, y) => log.push({ kind: String(text).startsWith('[KO]') ? 'ko' : 'text', text: String(text), x, y }),
            measure: (t, s) => font.measure(t, s),
        },
        _scrollX: 0, _scrollY: 0, _fightFace: false, _hudFor: null, _hudFaceFor: null, _hudCache: null,
        _playerScreenPos: () => ({ ppx: VP.origin.x, ppy: VP.origin.y, groundPy: VP.origin.y }),
        _drawPlayerSprite() { log.push({ kind: 'player' }); },
        _drawPropSprite() { log.push({ kind: 'prop' }); },
    });
    return { r, log };
}

function body(id, x, y) {
    const e = new Enemy({ id, type: 'Sewer Rat', x, y, gold: 0 });
    e.entity.hp = 0; e.entity.alive = false;
    return e;
}
function ally(id, x, y) {
    const e = new Enemy({ id, type: 'Sewer Rat', x, y, gold: 0 });
    e._ally = true;
    return e;
}
const game = (enemies, propSpawns = []) => ({
    playerX: 10, playerY: 10, facing: 'right', _fightOn: false, wheel: null, _idleTick: 0, _animating: false,
    equipment: { weapon: null, top: null, bottom: null, front: null, back: null, sides: null },
    enemies, _damageNumbers: [], map: { propSpawns },
});

describe('KO tags draw on top of the frame', () => {
    test('a body with a living ally and a body south of it: every tag is drawn after everything else', () => {
        const enemies = [
            body('b0', 12, 8),
            body('b1', 12, 9),            // a body right beside and below the first
            ally('a0', 12, 10),           // an ally one tile south of b1, its markers draw into b1's tag
            body('b2', 14, 10),
        ];
        const { r, log } = rig();
        const spy = r._drawEnemySprite;
        r._drawEnemySprite = function (...a) { log.push({ kind: 'enemy' }); return spy.apply(this, a); };
        r._drawActors(game(enemies, [{ type: 'tree', x: 14, y: 11 }]));

        const kos = log.map((l, i) => ({ ...l, i })).filter(l => l.kind === 'ko');
        const others = log.map((l, i) => ({ ...l, i })).filter(l => l.kind !== 'ko');
        assert.ok(kos.length >= 2, 'tags were drawn');
        assert.ok(others.some(l => l.kind === 'enemy') && others.some(l => l.kind === 'prop') && others.some(l => l.kind === 'player'),
            'bodies, a prop and the player were drawn');
        assert.ok(others.some(l => l.kind === 'rect'), 'the ally drew its markers');
        const lastOther = Math.max(...others.map(l => l.i));
        const firstKo = Math.min(...kos.map(l => l.i));
        assert.ok(firstKo > lastOther, `a KO tag drew at call ${firstKo}, before another draw at call ${lastOther}`);
    });

    test('each fallen body still gets exactly one tag, at the same place', () => {
        const spread = [body('a', 7, 10), body('b', 10, 13), body('c', 13, 10)];
        const { r, log } = rig();
        r._drawActors(game(spread));
        const kos = log.filter(l => l.kind === 'ko');
        assert.equal(kos.length, 3);
        assert.deepEqual(kos.map(k => k.text).sort(), spread.map(koLabelText).sort());
    });

    test('drawn on its own, outside a frame, a body still draws its own tag', () => {
        const e = body('solo', 11, 10);
        const { r, log } = rig();
        r._drawEnemySprite(game([e]), e, 0, 0, 0);
        assert.equal(log.filter(l => l.kind === 'ko').length, 1);
    });
});
