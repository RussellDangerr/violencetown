import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { appendRun, buildRow, historyLines, readRows, runIdOf } from '../tools/autoplay-sim-log.mjs';

const scripts = {
    quest: { n: 4, metrics: { finished: { mean: 0.75, margin: 0.4 }, turn: { mean: 100, margin: 5 }, deaths: { mean: 1.5, margin: 0.9 } }, broken: [{ seed: 3, why: 'x' }] },
    loops: { n: 2, metrics: {}, broken: [] },
};
const at = Date.UTC(2026, 10, 15, 9, 30, 5, 123);

test('buildRow keeps the numbers the log promises', () => {
    const r = buildRow({ at, sha: 'abc1234', dirty: 1, command: 'check', seeds: [1, 4], scripts, moved: { quest: ['turn'] }, changed: { quest: 2 }, minutes: 1.234 });
    assert.equal(r.id, '20261115T093005-abc1234');
    assert.equal(r.dirty, true);
    assert.deepEqual(r.seeds, [1, 4]);
    assert.equal(r.minutes, 1.2);
    assert.deepEqual(r.scripts.quest, { n: 4, finished: 0.75, turn: { mean: 100, margin: 5 }, deaths: { mean: 1.5, margin: 0.9 }, broken: [3], moved: ['turn'], changed: 2 });
    assert.equal(r.scripts.loops.finished, null);
    assert.deepEqual(r.scripts.loops.moved, []);
});

test('a write row has no moved names and no changed count', () => {
    const r = buildRow({ at, sha: null, dirty: false, command: 'write', seeds: [1, 4], scripts, minutes: 0 });
    assert.equal(r.scripts.quest.changed, null);
    assert.equal(runIdOf(at, null), '20261115T093005-nosha');
});

test('appendRun adds a row and keeps the per-seed lines; history is newest first', () => {
    const dir = path.join(mkdtempSync(path.join(tmpdir(), 'simlog-')), 'runs');
    const a = buildRow({ at, sha: 'aaaaaaa1', dirty: false, command: 'write', seeds: [1, 4], scripts, minutes: 1 });
    const b = buildRow({ at: at + 60000, sha: 'bbbbbbb2', dirty: true, command: 'check', seeds: [1, 4], scripts, moved: { quest: ['turn', 'deaths'], loops: [] }, minutes: 1 });
    appendRun(dir, a, [{ script: 'quest', seed: 1, turn: 5 }]);
    appendRun(dir, b, [{ script: 'quest', seed: 1, turn: 6 }]);
    assert.equal(readRows(dir).length, 2);
    assert.equal(JSON.parse(readFileSync(path.join(dir, `${b.id}.jsonl`), 'utf8')).turn, 6);
    const lines = historyLines(readRows(dir));
    assert.equal(lines.length, 2);
    assert.match(lines[0], /^2026-11-15 09:31 {2}bbbbbbb\+ {2}quest 75% loops — {2}2 MOVED$/);
    assert.match(lines[1], /aaaaaaa {3}quest 75% loops — {2}write$/);
});

test('readRows on a missing folder is empty', () => {
    assert.deepEqual(readRows(path.join(tmpdir(), 'no-such-simlog-dir')), []);
});
