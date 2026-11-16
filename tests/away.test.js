// away.test.js (CK1) — the hours since the save's savedAt: the helper, and the real
// serialize -> writeSave -> readSaveRaw path with the clock moved forward.

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { hoursAway, readAway, MAX_AWAY_HOURS, MS_PER_HOUR } from '../game/away.js';
import { serialize, writeSave, readSaveRaw } from '../game/save.js';

const realNow = Date.now;
function installStorage() {
    const store = new Map();
    globalThis.localStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { store.set(k, String(v)); },
        removeItem: (k) => { store.delete(k); },
        clear: () => store.clear(),
    };
}
function miniGame() {
    return {
        turn: 3, rng: { getState: () => 7 }, map: { url: 'town-map.json' },
        playerX: 1, playerY: 1, playerHp: 10, playerMaxHp: 10, playerMp: 5, playerMaxMp: 5,
        facing: 'down', gold: 0,
        equipment: { weapon: null, left: null, top: null, bottom: null, front: null, back: null, sides: null },
        tempEquips: [], buffs: [], inventory: [], groundItems: [], containers: [], enemies: [],
        _tileDiffs: [], questEngine: null,
    };
}

describe('hoursAway', () => {
    const t0 = 1_700_000_000_000;
    test('whole hours, rounded down', () => {
        assert.equal(hoursAway(t0, t0), 0);
        assert.equal(hoursAway(t0, t0 + MS_PER_HOUR - 1), 0);
        assert.equal(hoursAway(t0, t0 + MS_PER_HOUR), 1);
        assert.equal(hoursAway(t0, t0 + 5.9 * MS_PER_HOUR), 5);
    });
    test('a clock set backwards gives 0', () => {
        assert.equal(hoursAway(t0, t0 - 10 * MS_PER_HOUR), 0);
    });
    test('capped at the placeholder top of 7 days', () => {
        assert.equal(MAX_AWAY_HOURS, 168);
        assert.equal(hoursAway(t0, t0 + 400 * 24 * MS_PER_HOUR), 168);
    });
    test('a missing or garbled stamp gives 0', () => {
        for (const bad of [undefined, null, 'x', NaN, Infinity]) assert.equal(hoursAway(bad, t0), 0);
    });
});

describe('through the real save and load path', () => {
    beforeEach(installStorage);
    afterEach(() => { Date.now = realNow; });

    test('save, move the clock forward, read: hours away', () => {
        const t0 = 1_800_000_000_000;
        Date.now = () => t0;
        writeSave(miniGame());
        Date.now = () => t0 + 30 * MS_PER_HOUR + 5000;
        const g = {};
        const n = readAway(g, readSaveRaw().savedAt);
        assert.equal(n, 30);
        assert.equal(g.hoursAway, 30);
    });
    test('a clock set back before the save gives 0; a year later is capped', () => {
        const t0 = 1_800_000_000_000;
        Date.now = () => t0;
        writeSave(miniGame());
        Date.now = () => t0 - 5 * MS_PER_HOUR;
        assert.equal(readAway({}, readSaveRaw().savedAt), 0);
        Date.now = () => t0 + 365 * 24 * MS_PER_HOUR;
        assert.equal(readAway({}, readSaveRaw().savedAt), MAX_AWAY_HOURS);
    });
    test('the save grows no new field for it', () => {
        assert.equal('hoursAway' in serialize(miniGame()), false);
    });
});

describe('main.js reads it once per return, not by timers', () => {
    const src = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
    test('wired on load and on coming back to the tab', () => {
        assert.match(src, /readAway\(this, raw\.savedAt\)/);
        assert.equal((src.match(/this\._noteAway\?\.\(raw\)/g) || []).length, 2);
    });
});
