// autoplay-stats.test.js — the many-seeds autoplay's numbers
// (plans/sim1-autoplay-many-seeds.md).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { metricsOf, summarize, aggregate, compare, Z95 } from '../tools/autoplay-stats.mjs';

const run = (turn, hpLost, finished = true, extra = {}) => ({
    finished, turn, deaths: 0,
    stages: [{ id: 'fight', turns: turn, hpLost, gold: 3 }],
    ...extra,
});

describe('metricsOf', () => {
    test('flattens a run: finished as 1/0, run numbers, and stage.field', () => {
        assert.deepEqual(metricsOf(run(40, 12)), {
            finished: 1, turn: 40, deaths: 0, 'fight.turns': 40, 'fight.hpLost': 12, 'fight.gold': 3,
        });
    });
    test('a run that did not finish counts 0, and keeps what it reached', () => {
        const m = metricsOf({ finished: false, turn: 9, deaths: 1, stages: [] });
        assert.equal(m.finished, 0);
        assert.equal(m.turn, 9);
    });
    test('only numbers are kept', () => {
        const m = metricsOf({ finished: true, stages: [{ id: 's', turns: 2, note: 'x', bag: [] }] });
        assert.deepEqual(Object.keys(m).sort(), ['finished', 's.turns']);
    });
});

describe('summarize', () => {
    test('mean, sample sd and the 95% margin of the mean', () => {
        const s = summarize([2, 4, 4, 4, 5, 5, 7, 9]);
        assert.equal(s.n, 8);
        assert.equal(s.mean, 5);
        assert.equal(s.sd, 2.138);
        assert.equal(s.margin, Math.round(Z95 * (s.sd) / Math.sqrt(8) * 1000) / 1000);
    });
    test('one value has no spread; none has nothing', () => {
        assert.deepEqual(summarize([3]), { n: 1, mean: 3, sd: 0, margin: 0 });
        assert.equal(summarize([]).mean, null);
    });
});

describe('aggregate', () => {
    test('finish rate is the mean of finished', () => {
        const a = aggregate([run(10, 1), run(12, 1), run(14, 1, false), run(16, 1)]);
        assert.equal(a.n, 4);
        assert.equal(a.metrics.finished.mean, 0.75);
    });
    test('a stage only some runs reached has its own n', () => {
        const a = aggregate([run(10, 1), { finished: false, turn: 3, deaths: 1, stages: [] }]);
        assert.equal(a.metrics.turn.n, 2);
        assert.equal(a.metrics['fight.turns'].n, 1);
    });
    test('run-level metrics list before stage metrics', () => {
        const names = Object.keys(aggregate([run(10, 1)]).metrics);
        assert.deepEqual(names.slice(0, 3), ['deaths', 'finished', 'turn']);
    });
});

describe('compare', () => {
    const spread = (center, n = 40) => Array.from({ length: n }, (_, i) => run(center + (i % 5) - 2, 10 + (i % 3)));

    test('the same runs move nothing', () => {
        const a = aggregate(spread(50));
        assert.equal(compare(a, a).moved.length, 0);
    });
    test('a shift far past the noise moves', () => {
        const r = compare(aggregate(spread(50)), aggregate(spread(60)));
        const turn = r.moved.find((m) => m.name === 'turn');
        assert.ok(turn, 'turn moved');
        assert.equal(turn.delta, 10);
        assert.ok(turn.noise < 10);
    });
    test('a shift inside the noise does not', () => {
        const noisy = (c) => Array.from({ length: 6 }, (_, i) => run(c + [-30, 30, -20, 20, -10, 10][i], 10));
        const r = compare(aggregate(noisy(50)), aggregate(noisy(55)));
        assert.ok(!r.moved.some((m) => m.name === 'turn'));
        assert.ok(r.steady.some((m) => m.name === 'turn'));
    });
    test('a sure but tiny shift (under 2%) does not count', () => {
        const exact = (c) => Array.from({ length: 50 }, () => run(c, 10));
        const r = compare(aggregate(exact(1000)), aggregate(exact(1010)));
        assert.ok(!r.moved.some((m) => m.name === 'turn'));
    });
    test('a finish rate that drops moves', () => {
        const fin = (k) => Array.from({ length: 40 }, (_, i) => run(10, 1, i < k));
        const r = compare(aggregate(fin(40)), aggregate(fin(20)));
        assert.ok(r.moved.some((m) => m.name === 'finished' && m.delta === -0.5));
    });
    test('a stage only one side has is listed, not compared', () => {
        const a = aggregate([run(10, 1)]);
        const b = aggregate([{ finished: true, turn: 10, deaths: 0, stages: [{ id: 'new', turns: 2 }] }]);
        const r = compare(a, b);
        assert.ok(r.appeared.includes('new.turns'));
        assert.ok(r.gone.includes('fight.turns'));
    });
});
