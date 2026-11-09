// board-shared-files.test.js — the big files may hold several slices at once
// (plans/loop-shared-file-picks.md); every other file still takes one.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { nextSlices, SHARED_FILES } from '../tools/roadmap-board/board-model.js';

const slice = (id, order, touches, extra = {}) => ({
    id, title: id, lane: 'ready', order, kind: 'slice', blockedBy: [], touches,
    acceptance: ['it works'], approved: { at: 1 }, ...extra,
});
const inReview = (id, touches) => ({ id, title: id, lane: 'review', order: 0, kind: 'slice', blockedBy: [], touches });

describe('SHARED_FILES', () => {
    test('main.js takes five and renderer.js three', () => {
        assert.equal(SHARED_FILES['game/main.js'], 5);
        assert.equal(SHARED_FILES['game/renderer.js'], 3);
    });

    test('five main.js slices build together; the sixth waits and says why', () => {
        const ready = Array.from({ length: 6 }, (_, i) => slice(`M${i}`, i, ['game/main.js', `tests/m${i}.test.js`]));
        const r = nextSlices(ready, { shared: SHARED_FILES });
        assert.deepEqual(r.picks.map(c => c.id), ['M0', 'M1', 'M2', 'M3', 'M4']);
        assert.equal(r.skipped.find(s => s.id === 'M5').why, 'touches busy game/main.js (5 of 5)');
    });

    test('slices already in flight count against the share', () => {
        const flight = [inReview('R1', ['game/main.js']), inReview('R2', ['.\\game\\main.js'])];
        const ready = Array.from({ length: 4 }, (_, i) => slice(`M${i}`, i, ['game/main.js']));
        const r = nextSlices([...flight, ...ready], { shared: SHARED_FILES });
        assert.deepEqual(r.picks.map(c => c.id), ['M0', 'M1', 'M2'], 'two in Review leave room for three');
        assert.match(r.skipped.find(s => s.id === 'M3').why, /game\/main\.js \(5 of 5\)/);
    });

    test('a file not in the map still takes one slice, even beside shared ones', () => {
        const r = nextSlices([
            slice('A', 1, ['game/main.js', 'game/items.js']),
            slice('B', 2, ['game/main.js', 'game/items.js']),
            slice('C', 3, ['game/main.js']),
        ], { shared: SHARED_FILES });
        assert.deepEqual(r.picks.map(c => c.id), ['A', 'C']);
        assert.match(r.skipped.find(s => s.id === 'B').why, /touches unmerged game\/items\.js/);
    });

    test('renderer.js stops at three while main.js still has room', () => {
        const ready = Array.from({ length: 4 }, (_, i) => slice(`R${i}`, i, ['game/main.js', 'game/renderer.js']));
        const r = nextSlices(ready, { shared: SHARED_FILES });
        assert.equal(r.picks.length, 3);
        assert.equal(r.skipped.find(s => s.id === 'R3').why, 'touches busy game/renderer.js (3 of 3)');
    });

    test('a card naming the same file twice counts once', () => {
        const ready = Array.from({ length: 5 }, (_, i) => slice(`M${i}`, i, ['game/main.js', './game/main.js']));
        assert.equal(nextSlices(ready, { shared: SHARED_FILES }).picks.length, 5);
    });

    test('with no map, main.js takes one slice as before', () => {
        const ready = [slice('A', 1, ['game/main.js']), slice('B', 2, ['game/main.js'])];
        assert.deepEqual(nextSlices(ready).picks.map(c => c.id), ['A']);
        assert.deepEqual(nextSlices(ready, { shared: {} }).picks.map(c => c.id), ['A']);
    });

    test('a share of one or a junk value is no share at all', () => {
        const ready = [slice('A', 1, ['game/x.js']), slice('B', 2, ['game/x.js'])];
        for (const n of [1, 0, -3, 2.5, '4', null]) {
            assert.deepEqual(nextSlices(ready, { shared: { 'game/x.js': n } }).picks.map(c => c.id), ['A'], `share ${n}`);
        }
    });

    test('the Doing cap still binds when shares are free', () => {
        const ready = Array.from({ length: 5 }, (_, i) => slice(`M${i}`, i, ['game/main.js']));
        assert.equal(nextSlices(ready, { shared: SHARED_FILES, doingCap: 2 }).picks.length, 2);
    });
});
