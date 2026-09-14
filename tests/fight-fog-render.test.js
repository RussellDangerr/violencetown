// fight-fog-render.test.js — what the renderer draws for a fight (plans/fight-fog.md).
//
// renderer.js imports cleanly under node (tests/tile-render.test.js), so a
// recording canvas stands in for the real one: every call lands in a list with
// the paint state it was made under, and offscreen canvases come from a stub
// _offscreen. No DOM, no screenshot.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Renderer } from '../game/renderer.js';
import { TILE_PX } from '../game/data.js';
import { ENTRANCES, FOG_DENSITY, FOG_OUT_MS, IMPACT_MS, ZOOM_IN_MS, ZOOM_OUT_MS } from '../game/fight-entrance.js';
import * as Settings from '../game/settings.js';

// settings.js persists to localStorage, which node lacks.
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const rendererSrc = readFileSync(fileURLToPath(new URL('../game/renderer.js', import.meta.url)), 'utf8');
const renderFrameBody = (() => {
    const at = rendererSrc.indexOf('    renderFrame(game) {');
    return rendererSrc.slice(at, rendererSrc.indexOf('\n    }\n', at));
})();

// A 2D context that records: each method call lands in `calls` with the alpha,
// composite op and fill style it was made under.
function recorder() {
    const calls = [];
    const state = { globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: null, strokeStyle: null, filter: 'none' };
    const ctx = new Proxy(state, {
        get(t, k) {
            if (k in t) return t[k];
            if (k === 'createImageData') return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
            return (...a) => {
                calls.push({ fn: k, a, alpha: t.globalAlpha, op: t.globalCompositeOperation, fill: t.fillStyle });
                if (k === 'createRadialGradient' || k === 'createLinearGradient') return { addColorStop() {} };
            };
        },
        set(t, k, v) { t[k] = v; return true; },
    });
    return { ctx, calls };
}

// A renderer with a recording screen and recording offscreen canvases.
function rig(over = {}) {
    const main = recorder(), off = {};
    const r = Object.assign(Object.create(Renderer.prototype), {
        ctx: main.ctx, canvas: { width: 1920, height: 1080 },
        _scrollX: 0, _scrollY: 0, _shakeX: 0, _shakeY: 0, zone: 'TOWN',
        sprites: new Proxy({}, { get: () => ({ loaded: true, drawFrame: () => true }) }),
        _offscreen(name, w, h) {
            const c = (off[name] ??= { rec: recorder(), width: 0, height: 0, getContext() { return this.rec.ctx; } });
            c.width = w; c.height = h;
            return c;
        },
        ...over,
    });
    return { r, main, off };
}

const openMap = () => ({ isWalkable: () => true, isInBounds: () => true, zoneName: 'TOWN' });
// A fighter two tiles east of you, facing you.
const fighter = (over = {}) => ({ state: 'chasing', type: 'Rat', entity: { isAlive: () => true, hp: 10, maxHp: 10 },
    sightRange: 8, x: 12, y: 10, _lastDx: -1, _lastDy: 0, ...over });
function fightGame(over = {}) {
    return {
        map: openMap(), playerX: 10, playerY: 10, turn: 3, enemies: [fighter()], facing: 'down', _idleTick: 0,
        _fightOn: true, _fightStart: { kind: 'spotted', at: performance.now() - 5000, entrance: ENTRANCES.spotted },
        _fightEndedAt: null, ...over,
    };
}
const draws = (rec) => rec.calls.filter(c => c.fn === 'drawImage');

describe('the fight fog', () => {
    test('a fight lays one soft shadow, multiplied, at full density once it has rolled in', () => {
        const { r, main } = rig();
        r._drawFightFog(fightGame());
        const d = draws(main);
        assert.equal(d.length, 1);
        assert.equal(d[0].op, 'multiply');
        assert.ok(Math.abs(d[0].alpha - FOG_DENSITY) < 1e-9, `alpha ${d[0].alpha}`);
    });

    test("the mask is dark where they can't see and clear where they can", () => {
        const { r, off } = rig();
        r._drawFightFog(fightGame());
        const put = off.fogMask.rec.calls.find(c => c.fn === 'putImageData');
        const { area } = r._fog;
        const alphaAt = (x, y) => put.a[0].data[((y - area.y0) * area.w + (x - area.x0)) * 4 + 3];
        assert.equal(alphaAt(12, 10), 0, "the fighter's own tile");
        assert.equal(alphaAt(10, 10), 0, 'you, in front of it');
        assert.ok(alphaAt(14, 10) > 0, 'behind it');
    });

    test('the area is only recomputed when something it reads changes', () => {
        const { r } = rig();
        const g = fightGame();
        r._drawFightFog(g);
        const first = r._fog;
        r._drawFightFog(g);
        assert.equal(r._fog, first, 'nothing moved');
        g.enemies[0]._lastDx = 1;                                  // it turns round
        r._drawFightFog(g);
        assert.notEqual(r._fog, first);
    });

    test('while the fog rolls in the mask is rebuilt every frame; once it is in, never', () => {
        const { r, off } = rig();
        const g = fightGame({ _fightStart: { kind: 'spotted', at: performance.now() - 200, entrance: ENTRANCES.spotted } });
        r._drawFightFog(g); r._drawFightFog(g);
        const builds = () => off.fogMask.rec.calls.filter(c => c.fn === 'putImageData').length;
        assert.equal(builds(), 2);
        g._fightStart.at = performance.now() - 5000;
        r._drawFightFog(g); r._drawFightFog(g);
        assert.equal(builds(), 3, 'one settled build, then none');
    });

    test('the Wilderness keeps its own blackout', () => {
        const { r, main } = rig({ zone: 'WILDERNESS' });
        r._drawFightFog(fightGame());
        assert.equal(draws(main).length, 0);
    });

    test('when the fight ends the fog fades, then lets go of the area', () => {
        const { r, main } = rig();
        const g = fightGame();
        r._drawFightFog(g);
        Object.assign(g, { _fightOn: false, _fightEndedAt: performance.now() - FOG_OUT_MS / 2 });
        r._drawFightFog(g);
        const fading = draws(main)[1];
        assert.ok(fading.alpha > 0 && fading.alpha < FOG_DENSITY, `alpha ${fading.alpha}`);
        g._fightEndedAt = performance.now() - FOG_OUT_MS - 1;
        r._drawFightFog(g);
        assert.equal(draws(main).length, 2, 'no third draw');
        assert.equal(r._fog, null);
    });

    test('while it fades it stays on the ground, not on you', () => {
        const { r, main } = rig();
        const g = fightGame();
        r._drawFightFog(g);
        Object.assign(g, { _fightOn: false, _fightEndedAt: performance.now() - 50 });
        r._drawFightFog(g);
        g.playerX += 1;                                            // you step east
        r._drawFightFog(g);
        const [, before, after] = draws(main);
        assert.equal(after.a[1], before.a[1] - TILE_PX, 'the shadow slides one tile west on screen');
    });

    test('a zone change, a death or a restart drops it at once', () => {
        const { r, main } = rig();
        const g = fightGame();
        r._drawFightFog(g);
        r.dropFightFog();
        Object.assign(g, { _fightOn: false, _fightEndedAt: performance.now() });
        r._drawFightFog(g);
        assert.equal(draws(main).length, 1);
    });

    test('no fight, no fog', () => {
        const { r, main } = rig();
        r._drawFightFog(fightGame({ _fightOn: false, _fightStart: null }));
        assert.equal(draws(main).length, 0);
    });

    test("it sits in the spotlight's old slot: after the night grade, before the zone-exit markers", () => {
        const at = (s) => renderFrameBody.indexOf(s);
        assert.ok(at('this._drawLighting(game);') < at('this._drawFightFog(game);'));
        assert.ok(at('this._drawFightFog(game);') < at('this._drawTransitions(game);'));
    });

    test('the spotlight and its vignette are gone', () => {
        assert.ok(!rendererSrc.includes('_drawArena'), '_drawArena');
        assert.ok(!rendererSrc.includes('_arenaLevel'), '_arenaLevel');
    });
});
