// effect-loop.test.js — the transient-visual-effects loop's one tick.
//
// The loop used to re-arm itself on the line AFTER the render. A render that
// threw (createRadialGradient throws on a non-finite argument, and one reached
// it) skipped that line and left the "already running" flag set, so nothing
// could ever restart it: every hit-splat, heal halo and glow for the rest of
// the session silently stopped animating. One bad frame must cost one frame.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { makeEffectLoop } from '../game/effect-loop.js';

const boom = () => { throw new Error('non-finite'); };

describe('one tick of the effects loop', () => {
    test('re-arms while effects are still in flight, and stops once they are not', () => {
        let more = true;
        const loop = makeEffectLoop({ render: () => {}, hasMore: () => more });
        assert.equal(loop.tick(), true);
        more = false;
        assert.equal(loop.tick(), false);
    });

    test('draws the frame, every tick', () => {
        let drawn = 0;
        const loop = makeEffectLoop({ render: () => drawn++, hasMore: () => drawn < 3 });
        loop.tick(); loop.tick();
        assert.equal(drawn, 2);
    });

    test('a frame that throws still re-arms the loop', () => {
        const loop = makeEffectLoop({ render: boom, hasMore: () => true });
        assert.equal(loop.tick(), true);
        assert.equal(loop.tick(), true);
    });

    test('a frame that throws does not let the error escape', () => {
        const loop = makeEffectLoop({ render: boom, hasMore: () => true });
        assert.doesNotThrow(() => loop.tick());
    });

    test('a frame that throws is reported, with a running count so the caller can hush it', () => {
        const seen = [];
        const loop = makeEffectLoop({
            render: boom,
            hasMore: () => true,
            onFrameError: (e, n) => seen.push([e.message, n]),
        });
        loop.tick(); loop.tick(); loop.tick();
        assert.deepEqual(seen, [['non-finite', 1], ['non-finite', 2], ['non-finite', 3]]);
    });

    test('a throwing frame does not change whether the loop had more to draw', () => {
        const loop = makeEffectLoop({ render: boom, hasMore: () => false });
        assert.equal(loop.tick(), false);
    });

    test('asks once per tick whether anything is left', () => {
        let asked = 0;
        const loop = makeEffectLoop({ render: () => {}, hasMore: () => { asked++; return true; } });
        loop.tick();
        assert.equal(asked, 1);
    });

    // main.js's _render runs _trackFight, which calls _ensureParticleLoop when a
    // fight starts or ends — so the LAST frame can legitimately start new work
    // (the fight fog's fade). It can only do that if main has already dropped
    // its "already running" flag, which means hearing about the settle first.
    test('says it has settled before the last frame draws', () => {
        const order = [];
        const loop = makeEffectLoop({
            render: () => order.push('render'),
            hasMore: () => false,
            onSettled: () => order.push('settled'),
        });
        loop.tick();
        assert.deepEqual(order, ['settled', 'render']);
    });

    test('stays quiet about settling while effects are still in flight', () => {
        let settled = 0;
        const loop = makeEffectLoop({ render: () => {}, hasMore: () => true, onSettled: () => settled++ });
        loop.tick();
        assert.equal(settled, 0);
    });
});
