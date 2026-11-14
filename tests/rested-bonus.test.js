// rested-bonus.test.js (WP1) — quit beside a Town bench, come back an hour later, start rested.
// Goes through the real serialize -> writeSave -> (moved clock) -> readSaveRaw -> readAway path,
// and the game's own addBuff / _applyRested / _noteAway lifted out of main.js.

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { besideBench, restedOnReturn, RESTED_BUFF, RESTED_LINE, BENCH_TILE, readAway, MS_PER_HOUR } from '../game/away.js';
import { serialize, writeSave, readSaveRaw } from '../game/save.js';
import { sumBuffStat } from '../game/buffs.js';

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');
const classAt = mainSrc.indexOf('class Game {');
function liveMethod(signature, freeVars = {}) {
    const start = mainSrc.indexOf(signature, classAt);
    assert.ok(start > 0, `${signature} not found in main.js`);
    const end = mainSrc.indexOf('\n    }', start) + '\n    }'.length;
    const body = mainSrc.slice(start + signature.indexOf('('), end);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
}
const addBuff = liveMethod('addBuff(id, name, turns', {});
const applyRested = liveMethod('_applyRested()', { restedOnReturn });
const noteAway = liveMethod('_noteAway(raw)', { readAway });

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

// A tiny town: a bench at (5,5). The map answers getTile like the real one.
function townMap(url = 'town-map.json') {
    return { url, getTile: (x, y) => (x === 5 && y === 5 ? BENCH_TILE : 1) };
}
function miniGame(x, y, url) {
    const g = {
        turn: 3, rng: { getState: () => 7 }, map: townMap(url),
        playerX: x, playerY: y, playerHp: 7, playerMaxHp: 10, playerMp: 2, playerMaxMp: 5,
        facing: 'down', gold: 12,
        equipment: { weapon: null, left: null, top: null, bottom: null, front: null, back: null, sides: null },
        tempEquips: [], buffs: [], inventory: [], groundItems: [], containers: [], enemies: [],
        _tileDiffs: [], questEngine: null,
        log: [],
        _log(m) { this.log.push(m); },
        addBuff, _applyRested: applyRested, _noteAway: noteAway,
    };
    return g;
}
// Save in game A, move the clock, then "return" in game B at the same spot (a fresh load).
function leaveAndReturn(x, y, hours, url) {
    const t0 = 1_800_000_000_000;
    Date.now = () => t0;
    const a = miniGame(x, y, url);
    assert.equal(writeSave(a), true);
    Date.now = () => t0 + hours * MS_PER_HOUR + 1000;
    const b = miniGame(x, y, url);
    const raw = readSaveRaw();
    b._noteAway(raw);
    b._applyRested();
    return { a, b, raw };
}

describe('besideBench', () => {
    test('the four sides count, the bench tile itself and the diagonals do not', () => {
        const m = townMap();
        for (const [x, y] of [[4, 5], [6, 5], [5, 4], [5, 6]]) assert.equal(besideBench(m, x, y), true);
        for (const [x, y] of [[4, 4], [6, 6], [1, 1]]) assert.equal(besideBench(m, x, y), false);
        assert.equal(besideBench(null, 1, 1), false);
    });
});

describe('rested on return, through the real save', () => {
    beforeEach(installStorage);
    afterEach(() => { Date.now = realNow; });

    test('beside the bench, back after 2 hours: the buff and one log line', () => {
        const { b } = leaveAndReturn(4, 5, 2);
        assert.equal(b.buffs.length, 1);
        assert.deepEqual(
            { id: b.buffs[0].id, turns: b.buffs[0].turns, stat: b.buffs[0].stat, amount: b.buffs[0].amount },
            { id: RESTED_BUFF.id, turns: 5, stat: 'strength', amount: 6 });
        assert.equal(sumBuffStat(b.buffs, 'strength'), 6);
        assert.deepEqual(b.log, [RESTED_LINE]);
    });

    test('away under an hour: nothing', () => {
        const { b } = leaveAndReturn(4, 5, 0.9);
        assert.equal(b.buffs.length, 0);
        assert.equal(b.log.length, 0);
    });

    test('not beside a bench: nothing', () => {
        const { b } = leaveAndReturn(2, 2, 30);
        assert.equal(b.buffs.length, 0);
        assert.equal(b.log.length, 0);
    });

    test('a bench-shaped spot in another zone: nothing', () => {
        const { b } = leaveAndReturn(4, 5, 30, 'sewer-map.json');
        assert.equal(b.buffs.length, 0);
    });

    test('five long absences in a row give one buff, not five', () => {
        const t0 = 1_800_000_000_000;
        const g = miniGame(4, 5);
        let t = t0;
        for (let i = 0; i < 5; i++) {
            Date.now = () => t;
            writeSave(g);
            t += 10 * MS_PER_HOUR;
            Date.now = () => t;
            g._noteAway(readSaveRaw());
            g._applyRested();
        }
        assert.equal(g.buffs.length, 1);
        assert.equal(sumBuffStat(g.buffs, 'strength'), 6);
        assert.equal(g.buffs[0].turns, 5);
    });

    test('reading the same save stamp twice gives it once', () => {
        const { b } = leaveAndReturn(4, 5, 3);
        b._applyRested();
        assert.equal(b.log.length, 1);
    });

    test('the news on loading the zone clears hoursAway first: rested still comes', async () => {
        const { tellAwayNews } = await import('../game/away.js');
        const t0 = 1_800_000_000_000;
        Date.now = () => t0;
        writeSave(miniGame(4, 5));
        Date.now = () => t0 + 5 * MS_PER_HOUR;
        const b = miniGame(4, 5);
        b._noteAway(readSaveRaw());
        tellAwayNews(b, (m) => b.log.push(m));   // what the zone load does
        assert.equal(b.hoursAway, 0);
        b._applyRested();
        assert.equal(b.buffs.length, 1);
        assert.equal(b.log.at(-1), RESTED_LINE);
    });

    test('being away costs nothing beyond the buff', () => {
        const { a, b } = leaveAndReturn(4, 5, 50);
        for (const k of ['gold', 'playerHp', 'playerMp', 'playerX', 'playerY', 'turn']) assert.equal(b[k], a[k], k);
        assert.equal(b.inventory.length, 0);
    });

    test('a game that never went away (virtual clock: 0 hours) gets nothing', () => {
        const g = miniGame(4, 5);
        g.hoursAway = 0;
        assert.equal(restedOnReturn(g, (m) => g.log.push(m)), false);
        assert.equal(g.buffs.length, 0);
    });
});

describe('wired into main.js', () => {
    test('both returns call it: the tab coming back, and after a loaded save', () => {
        assert.match(mainSrc, /this\._noteAway\?\.\(raw\); this\._applyRested\?\.\(\)/);
        assert.match(mainSrc, /await loadInto\(this, raw\)[\s\S]{0,600}this\._applyRested\?\.\(\)/);
    });
});
