import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    snapshotOf, keepSnapshot, readSnapshots, reportLines, isValid, BONES_KEY, BONES_CAP,
} from '../game/bones.js';

const store = (init = {}) => {
    const m = { ...init };
    return {
        getItem: (k) => (k in m ? m[k] : null),
        setItem: (k, v) => { m[k] = String(v); },
        _m: m,
    };
};
const fakeGame = (over = {}) => ({
    playerHp: 7, playerMaxHp: 20, playerMp: 3, playerMaxMp: 10, gold: 42, turn: 120,
    equipment: { weapon: { id: 'wooden_sword' }, left: null }, map: { url: 'town-map.json' },
    _visitedZones: new Set(['town', 'sewer']), ...over,
});

test('a snapshot holds stats, gear ids, gold, place and progress', () => {
    const s = snapshotOf(fakeGame());
    assert.equal(isValid(s), true);
    assert.equal(s.gold, 42);
    assert.deepEqual(s.gear, { weapon: 'wooden_sword' });
    assert.equal(s.map, 'town-map.json');
    assert.equal(s.zones, 2);
});

test('only the newest 3 are kept', () => {
    const st = store();
    for (let i = 1; i <= 5; i++) keepSnapshot(st, snapshotOf(fakeGame({ turn: i })));
    const list = readSnapshots(st);
    assert.equal(list.length, BONES_CAP);
    assert.deepEqual(list.map((s) => s.turn), [3, 4, 5]);
});

test('broken, old and mis-shaped snapshots are ignored, never thrown', () => {
    for (const bad of ['not json', '{"a":1}', 'null', '[1,"x",null,{"v":0}]', '[{"v":1,"at":1}]']) {
        assert.deepEqual(readSnapshots(store({ [BONES_KEY]: bad })), [], bad);
    }
    const good = snapshotOf(fakeGame());
    const st = store({ [BONES_KEY]: JSON.stringify([{ v: 0 }, good, 'junk']) });
    assert.equal(readSnapshots(st).length, 1);
    assert.equal(keepSnapshot(st, { v: 99 }), false);
    const broken = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); } };
    assert.deepEqual(readSnapshots(broken), []);
    assert.equal(keepSnapshot(broken, good), false);
});

test('the report is three [TEXT] lines for a good snapshot, none for a bad one', () => {
    assert.deepEqual(reportLines(snapshotOf(fakeGame())), ['[TEXT]', '[TEXT]', '[TEXT]']);
    assert.deepEqual(reportLines({ v: 0 }), []);
    assert.deepEqual(reportLines(null), []);
});

test('Restart in main.js snapshots before clearSave, skips seeded resets, and reports', () => {
    const src = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
    const body = src.slice(src.indexOf('async _fullReset('));
    const snap = body.indexOf('keepSnapshot(');
    const clear = body.indexOf('clearSave();');
    assert.ok(snap > 0 && snap < clear, 'snapshot comes before the wipe');
    assert.match(body.slice(0, clear), /seed == null/);
    assert.match(body, /reportLines\(bones\)/);
});
