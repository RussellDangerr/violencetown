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
// composite op, fill style and imageSmoothingEnabled it was made under. This is
// a flat state bag, not a real save()/restore() stack — save/restore land in
// `calls` like any other method but don't push/pop state — so a call's recorded
// `smoothing`/`alpha` reflects whatever the code most recently set, not what a
// real canvas would have after a restore(). That's enough to check "was this
// draw made under smoothing/alpha X", which is what C1/C2 need.
function recorder() {
    const calls = [];
    const state = { globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: null, strokeStyle: null, filter: 'none' };
    const ctx = new Proxy(state, {
        get(t, k) {
            if (k in t) return t[k];
            if (k === 'createImageData') return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
            return (...a) => {
                calls.push({ fn: k, a, alpha: t.globalAlpha, op: t.globalCompositeOperation, fill: t.fillStyle, smoothing: t.imageSmoothingEnabled });
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

describe('the threat overlay in a fight', () => {
    function overlay(game) {
        const { r, main } = rig({ sprites: {}, _ditherPattern: (colour) => `stipple ${colour}` });
        r._drawThreatOverlay({ map: openMap(), playerX: 10, playerY: 10, turn: 1, wheel: null,
            _inCombat: () => !!game._fightOn, ...game });
        return main.calls;
    }
    const stippled = (calls) => calls.filter(c => c.fn === 'fillRect' && String(c.fill).startsWith('stipple'));

    test('a fight draws no stipple and no vignette', () => {
        const calls = overlay({ enemies: [fighter()], _fightOn: true });
        assert.equal(stippled(calls).length, 0);
        assert.equal(calls.filter(c => c.fn === 'createRadialGradient').length, 0);
    });

    test('and keeps the facing chevron and the "sees you" thread', () => {
        const calls = overlay({ enemies: [fighter()], _fightOn: true });
        assert.ok(calls.filter(c => c.fn === 'stroke').length >= 2, 'the chevron and the thread');
        assert.ok(calls.some(c => c.fn === 'setLineDash'), 'the thread is dashed');
    });

    test('outside a fight the stipple draws as it always did', () => {
        // Suspicious and facing away: it has no sight of you, so the phase is HAZE.
        const calls = overlay({ enemies: [fighter({ state: 'suspicious', _lastDx: 1 })], _fightOn: false });
        assert.ok(stippled(calls).length > 0);
        assert.ok(stippled(calls).every(c => c.fill === 'stipple rgb(2,2,8)'), 'HAZE: the dark stipple on safe ground');
    });
});

describe('body-only sprites, for the silhouettes', () => {
    function drawn(who, bodyOnly) {
        const frames = [];
        const { r, main } = rig({ sprites: new Proxy({}, { get: () => ({ loaded: true, drawFrame: (...a) => { frames.push(a); return true; } }) }) });
        const now = performance.now();
        const game = fightGame({ _playerHitFlashUntil: now + 500 });
        if (who === 'enemy') {
            const e = fighter({ entity: { isAlive: () => true, hp: 5, maxHp: 10 }, _hitFlashUntil: now + 500,
                buffs: [{ name: 'Blind', type: 'debuff' }], disposition: -10, gold: 150 });
            r._drawEnemySprite(game, e, 64, 32, now, { bodyOnly });
        } else {
            r._drawPlayerSprite(game, 0, 0, now, { bodyOnly });
        }
        return { frames: frames.length, fills: main.calls.filter(c => c.fn === 'fillRect' || c.fn === 'fill').length };
    }

    test('an enemy drawn body-only is the sprite alone: no flash, bar, badges, face or pips', () => {
        assert.deepEqual(drawn('enemy', true), { frames: 1, fills: 0 });
        assert.ok(drawn('enemy', false).fills > 0, 'the full draw has them');
    });

    test('so is the player', () => {
        assert.deepEqual(drawn('player', true), { frames: 1, fills: 0 });
        assert.ok(drawn('player', false).fills > 0, 'the full draw has the hit flash');
    });
});

describe('the entrance', () => {
    const at = (entrance, ms, over = {}) => fightGame({ _fightStart: { kind: entrance.kind, at: performance.now() - ms, entrance }, ...over });
    const filled = (rec, colour) => rec.calls.some(c => (c.fn === 'fillRect' || c.fn === 'fill') && c.fill === colour);

    test('struck: a cream close-up, you and them in black', () => {
        const { r, main, off } = rig();
        r._drawEntrance(at(ENTRANCES.struck, 30));
        assert.ok(filled(main, '#efe6d2'), 'the cream screen');
        assert.ok(off.entranceSil.rec.calls.some(c => c.fn === 'fillRect' && c.op === 'source-in'), 'the silhouettes, filled solid');
        assert.ok(draws(main).some(c => c.a[0] === off.entranceSil), 'blown up over the cream');
    });

    test('spotted: a red screen and a white slash', () => {
        const { r, main } = rig();
        r._drawEntrance(at(ENTRANCES.spotted, 30));
        assert.ok(filled(main, '#c8242b'), 'the red screen');
        assert.ok(filled(main, '#fff4e0'), 'the slash');
    });

    test('the punch is smoothed; the impact card under it is not (C1)', () => {
        // struck lifts from ms=0 (zoom peaks at 1.08), so at ms=30 the impact
        // card and the punch are both on screen in the same _drawEntrance call —
        // exactly the frame C1 is about (plans/entrance-feel-pass.md C1).
        const { r, main, off } = rig();
        r._drawEntrance(at(ENTRANCES.struck, 30));
        const sil = draws(main).find(c => c.a[0] === off.entranceSil);
        const punch = draws(main).find(c => c.a[0] === off.entranceSnap);
        assert.equal(sil.smoothing, false, 'the silhouettes stay crisp');
        assert.equal(punch.smoothing, true, 'the re-scaled snapshot is filtered, not nearest-neighbour');
    });

    test('the bw/redblack card tapers out over its last 35%, silhouettes included (C2)', () => {
        // Same shape as flash's `1 - t` fade, just delayed to the last third so
        // the card holds solid before it goes (plans/entrance-feel-pass.md C2).
        const taperAt = (ms) => 1 - Math.min(1, Math.max(0, (ms / IMPACT_MS - 0.65) / 0.35));

        const early = rig();
        early.r._drawEntrance(at(ENTRANCES.spotted, 20));
        const earlyFill = early.main.calls.find(c => c.fn === 'fillRect' && c.fill === '#c8242b');
        assert.equal(earlyFill.alpha, 1, 'holds solid before the last 35%');

        const late = rig();
        const lateMs = IMPACT_MS - 10;   // t ~= 0.909, well into the taper window
        late.r._drawEntrance(at(ENTRANCES.spotted, lateMs));
        const expected = taperAt(lateMs);
        // `at()` stamps _fightStart.at from performance.now() and _drawEntrance
        // reads performance.now() again a moment later, so the real elapsed ms
        // (and so `t`) runs a hair over `lateMs` — hence a tolerance, not an
        // exact match. 0.01 is ~100x the jitter actually observed and still two
        // orders of magnitude tighter than "taper missing entirely" (alpha 1).
        const EPS = 0.01;
        const lateFill = late.main.calls.find(c => c.fn === 'fillRect' && c.fill === '#c8242b');
        const lateSlash = late.main.calls.find(c => c.fn === 'fill' && c.fill === '#fff4e0');
        const lateSil = draws(late.main).find(c => c.a[0] === late.off.entranceSil);
        assert.ok(Math.abs(lateFill.alpha - expected) < EPS, `background alpha ${lateFill.alpha} vs ${expected}`);
        assert.ok(Math.abs(lateSlash.alpha - expected) < EPS, 'the slash fades with the background');
        assert.ok(Math.abs(lateSil.alpha - expected) < EPS, 'the silhouettes leave with the rest of the card, not stuck opaque');
        assert.equal(late.main.ctx.globalAlpha, 1, 'reset when the card is done, like flash does');
    });

    test('search: a white flash, no silhouettes, no zoom', () => {
        const { r, main, off } = rig();
        r._drawEntrance(at(ENTRANCES.search, 30));
        assert.ok(filled(main, '#fff8e8'));
        assert.equal(off.entranceSil, undefined);
        assert.equal(off.entranceSnap, undefined);
    });

    test('after the impact the frame punches in about you', () => {
        const { r, main, off } = rig();
        r._drawEntrance(at(ENTRANCES.spotted, IMPACT_MS + 20));
        const punch = draws(main).find(c => c.a[0] === off.entranceSnap);
        assert.ok(punch, 'the zoomed copy of the frame');
        assert.ok(punch.a[3] > 1920, `wider than the screen: ${punch.a[3]}`);
        assert.ok(!filled(main, '#c8242b'), 'the impact frame is over');
    });

    test('it is all over by 360 ms', () => {
        const { r, main } = rig();
        r._drawEntrance(at(ENTRANCES.spotted, ZOOM_IN_MS + ZOOM_OUT_MS + 1));
        assert.equal(main.calls.length, 0);
    });

    test('no entrance, or no fight, draws nothing', () => {
        const { r, main } = rig();
        r._drawEntrance(fightGame({ _fightStart: { kind: 'spotted', at: performance.now() - 30, entrance: null } }));
        r._drawEntrance(at(ENTRANCES.spotted, 30, { _fightOn: false }));
        assert.equal(main.calls.length, 0);
    });

    test('reduce motion draws nothing', () => {
        Settings.set('reduceMotion', true);
        try {
            const { r, main } = rig();
            r._drawEntrance(at(ENTRANCES.spotted, 30));
            assert.equal(main.calls.length, 0);
        } finally {
            Settings.set('reduceMotion', false);
        }
    });

    test('the Wilderness still gets its entrance; only the fog is skipped there', () => {
        const { r, main } = rig({ zone: 'WILDERNESS' });
        r._drawEntrance(at(ENTRANCES.spotted, 30));
        assert.ok(filled(main, '#c8242b'));
    });

    test('renderFrame draws it last, over the HUD and any menu', () => {
        const last = renderFrameBody.lastIndexOf('this._drawEntrance(game);');
        assert.ok(last > renderFrameBody.indexOf('this._drawDock();'));
        assert.ok(last > renderFrameBody.indexOf('this._drawCloseButton('));
    });
});
