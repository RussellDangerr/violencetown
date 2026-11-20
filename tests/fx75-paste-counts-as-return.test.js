// fx75-paste-counts-as-return.test.js (FX75) — a pasted save code is a return, like Continue.
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { restedOnReturn, readAway, BENCH_TILE, MS_PER_HOUR, RESTED_LINE } from '../game/away.js';
import { writeSave, readSaveRaw, encodeSaveCode, decodeSaveCode } from '../game/save.js';

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
function miniGame() {
    const g = {
        turn: 3, rng: { getState: () => 7 },
        map: { url: 'town-map.json', getTile: (x, y) => (x === 5 && y === 5 ? BENCH_TILE : 1) },
        playerX: 5, playerY: 6, playerHp: 7, playerMaxHp: 10, playerMp: 2, playerMaxMp: 5,
        facing: 'down', gold: 12,
        equipment: { weapon: null, left: null, top: null, bottom: null, front: null, back: null, sides: null },
        tempEquips: [], buffs: [], inventory: [], groundItems: [], containers: [], enemies: [],
        _tileDiffs: [], questEngine: null, log: [],
    };
    g._log = (m) => g.log.push(m);
    g.addBuff = addBuff;
    g._noteAway = noteAway;
    g._applyRested = applyRested;
    return g;
}

describe('a pasted save counts as coming back', () => {
    beforeEach(installStorage);
    afterEach(() => { Date.now = realNow; });

    const t0 = 1_800_000_000_000;
    function savedFiveHoursAgo() {
        Date.now = () => t0;
        const g = miniGame();
        writeSave(g);
        const code = encodeSaveCode(g);
        Date.now = () => t0 + 5 * MS_PER_HOUR + 1000;
        return code;
    }

    test('same hoursAway and rested top-up as Continue', () => {
        const code = savedFiveHoursAgo();
        const cont = miniGame();
        cont._noteAway(readSaveRaw()); cont._applyRested();
        const d = decodeSaveCode(code);
        assert.ok(d.ok);
        const pasted = miniGame();
        pasted._noteAway(d.raw); pasted._applyRested();
        assert.equal(pasted.hoursAway, 5);
        assert.equal(pasted.hoursAway, cont.hoursAway);
        assert.equal(pasted.buffs.length, 1);
        assert.deepEqual(pasted.buffs, cont.buffs);
        assert.deepEqual(pasted.log, [RESTED_LINE]);
        assert.deepEqual(pasted.log, cont.log);
    });

    test('a refused paste gives nothing to read', () => {
        assert.equal(decodeSaveCode('not a code').ok, false);
        const g = miniGame();
        assert.equal(g.hoursAway, undefined);
        assert.equal(g.buffs.length, 0);
    });
});

describe('both paste handlers in main.js', () => {
    const lines = mainSrc.split('\n');
    const calls = lines.map((l, i) => (l.includes('_noteAway?.(') && l.includes('(FX75)') ? i : -1)).filter(i => i >= 0);

    test('two handlers read the away stamp and apply rest', () => {
        assert.equal(calls.length, 2);
        for (const i of calls) assert.match(lines[i], /_applyRested\?\.\(\)/);
    });
    test('each sits after the refusal return and before writeSave', () => {
        for (const i of calls) {
            assert.match(lines[i - 1], /if \(!res\.ok\).*return;/);
            assert.match(lines[i + 1], /writeSave\(this\);/);
        }
    });
});
