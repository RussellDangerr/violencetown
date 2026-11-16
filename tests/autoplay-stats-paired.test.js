// The paired test (plans/sim2-per-seed-numbers.md). The card names tests/autoplay-stats.test.js,
// which already carries the older group tests; the paired ones sit beside it.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { aggregate, compare, pairedCompare, rowsByScript, rowLines } from '../tools/autoplay-stats.mjs';

// Seeds 1..n, each { m: value(seed) }.
const seeds = (n, f) => Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, { m: f(i + 1) }]));

describe('pairedCompare', () => {
    test('a small shift every seed shares is MOVED, though the seeds vary far more than the shift', () => {
        const base = seeds(30, (s) => 100 + (s * 37 % 41));
        const now = seeds(30, (s) => 100 + (s * 37 % 41) + 3);
        const p = pairedCompare(base, now);
        assert.equal(p.moved.length, 1);
        assert.equal(p.moved[0].delta, 3);
        // the two-group test cannot see it
        const agg = (rows) => aggregate(Object.values(rows).map((r) => ({ finished: true, turn: r.m, stages: [] })));
        assert.equal(compare(agg(base), agg(now)).moved.filter((x) => x.name === 'turn').length, 0);
    });
    test('seeds that only trade places are not a move', () => {
        assert.equal(pairedCompare(seeds(20, (s) => s), seeds(20, (s) => 21 - s)).moved.length, 0);
    });
    test('identical runs move nothing', () => {
        const p = pairedCompare(seeds(10, (s) => s), seeds(10, (s) => s));
        assert.equal(p.moved.length, 0);
        assert.equal(p.pairs, 10);
    });
    test('the 2% floor holds back a sure but tiny shift', () => {
        const base = seeds(20, (s) => 1000 + s);
        assert.equal(pairedCompare(base, seeds(20, (s) => 1000 + s + 1)).moved.length, 0);
        assert.equal(pairedCompare(base, seeds(20, (s) => 1000 + s + 30)).moved.length, 1);
    });
    test('a baseline of 0 needs one whole unit', () => {
        assert.equal(pairedCompare(seeds(10, () => 0), seeds(10, () => 0.5)).moved.length, 0);
        assert.equal(pairedCompare(seeds(10, () => 0), seeds(10, () => 1)).moved.length, 1);
    });
    test('names up to 5 seeds that moved most, with before and after', () => {
        const [m] = pairedCompare(seeds(20, () => 10), seeds(20, (s) => 10 + (s <= 8 ? s : 0))).moved;
        assert.deepEqual(m.top.map((t) => t.seed), [8, 7, 6, 5, 4]);
        assert.deepEqual(m.top[0], { seed: 8, was: 10, now: 18 });
    });
    test('only seeds both runs share are paired', () => {
        const now = Object.fromEntries(Object.entries(seeds(20, (s) => s)).filter(([k]) => k > 5));
        const p = pairedCompare(seeds(10, (s) => s), now);
        assert.equal(p.pairs, 5);
        assert.equal(p.steady[0].n, 5);
    });
    test('a number only one side has is appeared or gone, not compared', () => {
        const p = pairedCompare({ 1: { a: 1 }, 2: { a: 1 } }, { 1: { b: 1 }, 2: { b: 1 } });
        assert.deepEqual(p.gone, ['a']);
        assert.deepEqual(p.appeared, ['b']);
    });
    test('a lone pair cannot say anything about noise, so it never moves', () => {
        assert.equal(pairedCompare(seeds(1, () => 1), seeds(1, () => 99)).moved.length, 0);
    });
});

describe('seeds file rows', () => {
    test('rowLines then rowsByScript round-trips, seeds ascending', () => {
        const per = { 10: { finished: 1, turn: 5 }, 2: { finished: 0, turn: 9, 'x.y': 3 } };
        const lines = rowLines('quest', per);
        assert.deepEqual(lines.map((l) => l.seed), [2, 10]);
        assert.deepEqual(lines[0], { script: 'quest', seed: 2, finished: 0, turn: 9, 'x.y': 3 });
        assert.deepEqual(rowsByScript(lines), { quest: { 2: per[2], 10: per[10] } });
    });
});
