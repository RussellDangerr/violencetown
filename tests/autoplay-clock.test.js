// autoplay-clock.test.js — the autoplay's virtual clock (plans/quest1-autoplay.md §3).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createClock, FRAME_MS } from '../game/autoplay/clock.js';

describe('the virtual clock', () => {
    test('time moves only when advanced', () => {
        const c = createClock({ start: 1000 });
        assert.equal(c.now(), 1000);
        c.advance(250);
        assert.equal(c.now(), 1250);
    });

    test('a timeout fires once, at its time and not before', () => {
        const c = createClock({ start: 0 });
        const at = [];
        c.setTimeout(() => at.push(c.now()), 100);
        c.advance(99);
        assert.deepEqual(at, []);
        c.advance(1);
        assert.deepEqual(at, [100]);
        c.advance(500);
        assert.deepEqual(at, [100]);
    });

    test('an interval fires every period until cleared', () => {
        const c = createClock({ start: 0 });
        const at = [];
        const id = c.setInterval(() => at.push(c.now()), 500);
        c.advance(1600);
        assert.deepEqual(at, [500, 1000, 1500]);
        c.clearInterval(id);
        c.advance(1000);
        assert.deepEqual(at, [500, 1000, 1500]);
    });

    test('clearTimeout also clears an interval, as in a browser', () => {
        const c = createClock({ start: 0 });
        let n = 0;
        const id = c.setInterval(() => n++, 10);
        c.clearTimeout(id);
        c.advance(100);
        assert.equal(n, 0);
    });

    test('timeouts due at the same instant fire in the order they were set', () => {
        const c = createClock({ start: 0 });
        const order = [];
        c.setTimeout(() => order.push('a'), 50);
        c.setTimeout(() => order.push('b'), 50);
        c.setTimeout(() => order.push('c'), 10);
        c.advance(50);
        assert.deepEqual(order, ['c', 'a', 'b']);
    });

    test('a timeout set from a callback fires in the same advance if it falls inside it', () => {
        const c = createClock({ start: 0 });
        const at = [];
        c.setTimeout(() => { at.push(c.now()); c.setTimeout(() => at.push(c.now()), 30); }, 20);
        c.advance(100);
        assert.deepEqual(at, [20, 50]);
    });

    test('animation frames run on frame boundaries, one frame per request', () => {
        const c = createClock({ start: 0 });
        const at = [];
        const loop = (t) => { at.push(t); if (at.length < 3) c.requestAnimationFrame(loop); };
        c.requestAnimationFrame(loop);
        c.advance(FRAME_MS * 5);
        assert.deepEqual(at, [FRAME_MS, FRAME_MS * 2, FRAME_MS * 3]);
    });

    test('a cancelled frame never runs', () => {
        const c = createClock({ start: 0 });
        let ran = false;
        const id = c.requestAnimationFrame(() => { ran = true; });
        c.cancelAnimationFrame(id);
        c.advance(100);
        assert.equal(ran, false);
    });

    test("the game's 150 ms step settles inside 160 ms", () => {
        const c = createClock({ start: 10000 });
        const begin = c.now();
        let done = false;
        const tick = (t) => { if (t - begin >= 150) done = true; else c.requestAnimationFrame(tick); };
        c.requestAnimationFrame(tick);
        c.advance(160);
        assert.equal(done, true);
    });

    test('a throwing callback is reported and the rest still run', () => {
        const errors = [];
        const c = createClock({ start: 0, onError: (e) => errors.push(e.message) });
        const ran = [];
        c.setTimeout(() => { throw new Error('bad frame'); }, 10);
        c.setTimeout(() => ran.push('next'), 10);
        c.advance(10);
        assert.deepEqual(errors, ['bad frame']);
        assert.deepEqual(ran, ['next']);
    });

    test('a timer that reschedules itself at the same instant fails loudly instead of hanging', () => {
        const c = createClock({ start: 0 });
        const spin = () => c.setTimeout(spin, 0);
        c.setTimeout(spin, 0);
        assert.throws(() => c.advance(1), /rescheduling itself/);
    });

    test('the methods work unbound, the way window.setTimeout is called', () => {
        const c = createClock({ start: 0 });
        const { setTimeout: later, now } = c;
        let hit = false;
        later(() => { hit = true; }, 5);
        c.advance(5);
        assert.equal(hit, true);
        assert.equal(now(), 5);
    });
});
