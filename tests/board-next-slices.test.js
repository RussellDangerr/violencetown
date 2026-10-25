// board-next-slices.test.js — the loop hands out several picks a pass, never two
// that share a file (plans/loop-limits-ten.md).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { nextSlices, nextSlice, PICKS_PER_PASS, WIP_CAP } from '../tools/roadmap-board/board-model.js';

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
        const inFlight = Array.from({ length: WIP_CAP - 3 }, (_, i) =>
            ({ id: `R${i}`, title: 'r', lane: 'review', order: i, kind: 'slice', blockedBy: [] }));
        const ready = Array.from({ length: 6 }, (_, i) => slice(`S${i}`, i, [`game/g${i}.js`]));
        const r = nextSlices([...inFlight, ...ready]);
        assert.equal(r.wip, WIP_CAP - 3);
        assert.equal(r.picks.length, 3);
        assert.equal(nextSlices([...inFlight, ...ready], { max: 2 }).picks.length, 2, 'max is a parameter');
    });

    test('at the cap there are no picks', () => {
        const full = Array.from({ length: WIP_CAP }, (_, i) =>
            ({ id: `D${i}`, title: 'd', lane: 'doing', order: i, kind: 'slice', blockedBy: [] }));
        const r = nextSlices([...full, slice('S', 1, ['x.js'])]);
        assert.equal(r.reason, 'wip-cap');
        assert.deepEqual(r.picks, []);
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
