// ko-labels.test.js — KO tags under fallen enemies never overlap
// (plans/fx7-ko-labels-no-overlap.md). The pure picker is checked on its own,
// then the real _drawActors + _drawEnemySprite draw a row of bodies into a
// recording canvas and every drawn tag's box is checked against every other.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Renderer, koLabelsShown, koLabelText, KO_LABEL_H } from '../game/renderer.js';
import { Enemy } from '../game/enemies.js';
import { DOCK } from '../game/layout.js';
import { computeViewport } from '../game/viewport.js';
import { TILE_PX } from '../game/data.js';
import { BitmapFont } from '../game/bitmap-font.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const font = new BitmapFont();
const measure = (t) => font.measure(t, 1);
const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const box = (l) => ({ x0: l.cx - l.w / 2, x1: l.cx + l.w / 2, y0: l.y, y1: l.y + l.h });

describe('koLabelsShown', () => {
    test('the nearer of two overlapping tags is kept, whatever order they come in', () => {
        const near = { key: 'near', cx: 100, y: 50, w: 60, h: 12, dist: 10 };
        const far = { key: 'far', cx: 132, y: 50, w: 60, h: 12, dist: 40 };
        assert.deepEqual([...koLabelsShown([far, near])], ['near']);
        assert.deepEqual([...koLabelsShown([near, far])], ['near']);
    });

    test('tags that do not overlap are all kept', () => {
        const ls = [
            { key: 'a', cx: 0, y: 0, w: 60, h: 12, dist: 3 },
            { key: 'b', cx: 60, y: 0, w: 60, h: 12, dist: 2 },     // edges touch, no overlap
            { key: 'c', cx: 0, y: 12, w: 60, h: 12, dist: 1 },     // the row below
        ];
        assert.deepEqual([...koLabelsShown(ls)].sort(), ['a', 'b', 'c']);
    });

    test('a tie in distance keeps the one given first', () => {
        const a = { key: 'a', cx: 0, y: 0, w: 60, h: 12, dist: 5 };
        const b = { key: 'b', cx: 10, y: 0, w: 60, h: 12, dist: 5 };
        assert.deepEqual([...koLabelsShown([a, b])], ['a']);
        assert.deepEqual([...koLabelsShown([b, a])], ['b']);
    });

    test('no two kept tags overlap, for a crowd of random tags', () => {
        let seed = 7;
        const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
        const ls = Array.from({ length: 60 }, (_, i) => ({
            key: i, cx: Math.floor(rnd() * 400), y: Math.floor(rnd() * 200), w: 40 + Math.floor(rnd() * 60), h: 12, dist: rnd() * 100,
        }));
        const kept = ls.filter(l => koLabelsShown(ls).has(l.key)).map(box);
        assert.ok(kept.length > 1);
        for (let i = 0; i < kept.length; i++)
            for (let j = i + 1; j < kept.length; j++) assert.ok(!overlaps(kept[i], kept[j]), `${i} and ${j} overlap`);
    });
});

// ── the real draw path, into a recording canvas ─────────────────────────────
const VP = computeViewport({ cssW: 3440, cssH: 1440, dpr: 1, dock: DOCK });
function rig() {
    const state = { globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: null, strokeStyle: null, filter: 'none' };
    const ctx = new Proxy(state, {
        get(t, k) {
            if (k in t) return t[k];
            if (k === 'createImageData') return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
            return () => (/Gradient/.test(k) ? { addColorStop() {} } : undefined);
        },
        set(t, k, v) { t[k] = v; return true; },
    });
    const drawn = [];
    const r = Object.assign(Object.create(Renderer.prototype), {
        ctx, canvas: { width: VP.backingW, height: VP.backingH }, viewport: VP, sprites: {},
        font: { drawText: (c, text, x, y) => drawn.push({ text: String(text), x, y }), measure: (t, s) => font.measure(t, s) },
        _scrollX: 0, _scrollY: 0, _fightFace: false, _hudFor: null, _hudFaceFor: null, _hudCache: null,
        _playerScreenPos: () => ({ ppx: VP.origin.x, ppy: VP.origin.y, groundPy: VP.origin.y }),
        _drawPlayerSprite() {},
    });
    const kos = () => drawn.filter(d => d.text.startsWith('[KO]'))
        .map(d => ({ ...d, cx: d.x, w: measure(d.text), h: KO_LABEL_H }));
    return { r, kos };
}
function body(id, x, y) {
    const e = new Enemy({ id, type: 'Sewer Rat', x, y, gold: 0 });
    e.entity.hp = 0; e.entity.alive = false;
    return e;
}
const game = (enemies) => ({
    playerX: 10, playerY: 10, facing: 'right', _fightOn: false, wheel: null, _idleTick: 0, _animating: false,
    equipment: { weapon: null, top: null, bottom: null, front: null, back: null, sides: null },
    enemies, _damageNumbers: [], map: { propSpawns: [] },
});

describe('_drawActors draws KO tags that never overlap', () => {
    test('a row of bodies side by side: the drawn tags do not overlap, and the nearest keeps its tag', () => {
        // Five rats in a row east of the player, one tile apart — the sewer after the waves.
        const row = [11, 12, 13, 14, 15].map((x, i) => body(`r${i}`, x, 10));
        assert.ok(measure(koLabelText(row[0])) > TILE_PX, 'the fixture needs a tag wider than a tile');
        const { r, kos } = rig();
        r._drawActors(game(row));
        const tags = kos();
        assert.ok(tags.length >= 2, 'some tags were drawn');
        assert.ok(tags.length < row.length, 'the row is tight enough that some tags must be left out');
        for (let i = 0; i < tags.length; i++)
            for (let j = i + 1; j < tags.length; j++)
                assert.ok(!overlaps(box(tags[i]), box(tags[j])), `tags at x=${tags[i].x} and x=${tags[j].x} overlap`);
        const nearestCx = VP.origin.x + 1 * TILE_PX + TILE_PX / 2;
        assert.ok(tags.some(t => t.x === nearestCx), 'the body nearest the player keeps its tag');
    });

    test('a cluster of bodies around the player: no two drawn tags overlap', () => {
        const spots = [[9, 9], [10, 9], [11, 9], [9, 11], [10, 11], [11, 11], [12, 10], [8, 10], [13, 10], [12, 11]];
        const { r, kos } = rig();
        r._drawActors(game(spots.map(([x, y], i) => body(`c${i}`, x, y))));
        const tags = kos();
        assert.ok(tags.length >= 2, 'some tags were drawn');
        for (let i = 0; i < tags.length; i++)
            for (let j = i + 1; j < tags.length; j++)
                assert.ok(!overlaps(box(tags[i]), box(tags[j])), `tags ${i} and ${j} overlap`);
    });

    test('bodies far enough apart all keep their tags', () => {
        const spread = [body('a', 7, 10), body('b', 10, 13), body('c', 13, 10)];
        const { r, kos } = rig();
        r._drawActors(game(spread));
        assert.equal(kos().length, 3);
    });

    test('drawn on its own, outside a frame, a body still draws its tag', () => {
        const e = body('solo', 11, 10);
        const { r, kos } = rig();
        r._drawEnemySprite(game([e]), e, 0, 0, 0);
        assert.equal(kos().length, 1);
        assert.equal(r._koShown ?? null, null);
    });
});
