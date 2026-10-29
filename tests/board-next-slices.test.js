// board-next-slices.test.js — the loop hands out several picks a pass, never two
// that share a file (plans/loop-limits-ten.md).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    nextSlices, nextSlice, PICKS_PER_PASS, DOING_CAP, REVIEW_CAP, MAX_FAILS, openRulings, idleWait,
} from '../tools/roadmap-board/board-model.js';

const slice = (id, order, touches, extra = {}) => ({
    id, title: id, lane: 'ready', order, kind: 'slice', blockedBy: [], touches,
    acceptance: ['it works'], approved: { at: 1 }, ...extra,
});

describe('nextSlices', () => {
    test('ten picks a pass by default', () => {
        assert.equal(PICKS_PER_PASS, 10);
        const many = Array.from({ length: 14 }, (_, i) => slice(`S${i}`, i, [`game/f${i}.js`]));
        const r = nextSlices(many);
        assert.equal(r.reason, 'ok');
        assert.deepEqual(r.picks.map(c => c.id), many.slice(0, 10).map(c => c.id), 'Ready order, first ten');
    });

    test('never two picks that share a file', () => {
        const r = nextSlices([
            slice('A', 1, ['game/main.js', 'tests/a.test.js']),
            slice('B', 2, ['.\\game\\main.js']),
            slice('C', 3, ['game/sprites.js']),
        ]);
        assert.deepEqual(r.picks.map(c => c.id), ['A', 'C']);
        assert.match(r.skipped.find(s => s.id === 'B').why, /touches unmerged game\/main\.js/);
    });

    test('a slice with no touches never clashes', () => {
        const r = nextSlices([slice('A', 1, undefined), slice('B', 2, [])]);
        assert.deepEqual(r.picks.map(c => c.id), ['A', 'B']);
    });

    test('picks fill only the room the cap leaves', () => {
        const inFlight = Array.from({ length: REVIEW_CAP - 3 }, (_, i) =>
            ({ id: `R${i}`, title: 'r', lane: 'review', order: i, kind: 'slice', blockedBy: [] }));
        const ready = Array.from({ length: 6 }, (_, i) => slice(`S${i}`, i, [`game/g${i}.js`]));
        const r = nextSlices([...inFlight, ...ready]);
        assert.equal(r.wip, REVIEW_CAP - 3);
        assert.equal(r.review, REVIEW_CAP - 3);
        assert.equal(r.picks.length, 3);
        assert.equal(nextSlices([...inFlight, ...ready], { max: 2 }).picks.length, 2, 'max is a parameter');
    });

    test('at either cap there are no picks', () => {
        for (const [lane, cap] of [['doing', DOING_CAP], ['review', REVIEW_CAP]]) {
            const full = Array.from({ length: cap }, (_, i) =>
                ({ id: `F${i}`, title: 'f', lane, order: i, kind: 'slice', blockedBy: [] }));
            const r = nextSlices([...full, slice('S', 1, ['x.js'])]);
            assert.equal(r.reason, 'wip-cap', `${lane} at its cap`);
            assert.deepEqual(r.picks, []);
        }
    });

    test('each lane has its own cap, so a full Review alone does not use up Doing', () => {
        assert.equal(DOING_CAP, 10);
        assert.equal(REVIEW_CAP, 10);
        const review = Array.from({ length: REVIEW_CAP - 1 }, (_, i) =>
            ({ id: `R${i}`, title: 'r', lane: 'review', order: i, kind: 'slice', blockedBy: [] }));
        const doing = Array.from({ length: 5 }, (_, i) =>
            ({ id: `D${i}`, title: 'd', lane: 'doing', order: i, kind: 'slice', blockedBy: [] }));
        const ready = Array.from({ length: 6 }, (_, i) => slice(`S${i}`, i, [`game/g${i}.js`]));
        const r = nextSlices([...review, ...doing, ...ready]);
        assert.equal(r.reason, 'ok', '14 in flight is over 10, but neither lane is full');
        assert.equal(r.picks.length, 1, 'room is what the fuller lane leaves');
    });

    test('a slice that failed twice waits for his reply instead of being rebuilt', () => {
        assert.equal(MAX_FAILS, 2);
        const r = nextSlices([
            slice('A', 1, ['a.js'], { fails: 2 }),
            slice('B', 2, ['b.js'], { fails: 1 }),
        ]);
        assert.deepEqual(r.picks.map(c => c.id), ['B'], 'one failure is retried');
        assert.match(r.skipped.find(s => s.id === 'A').why, /failed 2 times/);
    });

    test('nothing pickable when every Ready slice is skipped', () => {
        const r = nextSlices([slice('S', 1, ['x.js'], { approved: undefined })]);
        assert.equal(r.reason, 'nothing-pickable');
        assert.deepEqual(r.picks, []);
    });

    test('nextSlice is the first of nextSlices', () => {
        const ready = [slice('A', 1, ['a.js']), slice('B', 2, ['b.js'])];
        const one = nextSlice(ready);
        assert.equal(one.pick.id, 'A');
        assert.equal(one.picks, undefined, 'nextSlice keeps its own shape');
        assert.deepEqual(one.skipped, [], 'and stops looking once it has its pick');
    });
});

describe('openRulings', () => {
    test('counts only rulings with options and no pick', () => {
        const cards = [
            { id: 'R1', kind: 'ruling', lane: 'ruling', options: [{ id: 'a' }] },
            { id: 'R2', kind: 'ruling', lane: 'ruling', options: [{ id: 'a' }], pick: { option: 'a' } },
            { id: 'R3', kind: 'ruling', lane: 'ruling', options: [] },
            { id: 'I1', kind: 'idea', lane: 'idea' },
            slice('S1', 1, ['a.js'], { approved: undefined }),
        ];
        assert.deepEqual(openRulings(cards).map(c => c.id), ['R1']);
    });
});

describe('idleWait', () => {
    const now = Date.UTC(2026, 9, 29, 12);
    const min = 60e3;
    test('short while he is active, an hour once he is away', () => {
        assert.equal(idleWait([], now), 3600, 'no touch at all');
        assert.equal(idleWait([{ id: 'A', verdict: { verdict: 'merge', at: now - 5 * min } }], now), 300);
        assert.equal(idleWait([{ id: 'A', triage: { choice: 'tweak', at: now - 60 * min } }], now), 1200);
        assert.equal(idleWait([{ id: 'A', feedback: [{ from: 'you', text: 'x', at: now - 3 * 60 * min }] }], now), 3600);
    });
    test("the loop's own picks, approvals and replies don't count as his", () => {
        const recent = now - min;
        assert.equal(idleWait([
            { id: 'A', approved: { at: recent, by: 'loop' } },
            { id: 'B', pick: { option: 'a', at: recent, note: 'picked by the loop under the standing delegation' } },
            { id: 'C', feedback: [{ from: 'claude', text: 'x', at: recent }] },
        ], now), 3600);
    });
    test('reads ISO timestamps too', () => {
        assert.equal(idleWait([{ id: 'A', approved: { at: new Date(now - min).toISOString() } }], now), 300);
    });
});
