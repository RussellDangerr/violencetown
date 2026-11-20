// continue-line.test.js — CT1: the title line that says where and when the save was left.
// _continueLine and its zone table are lifted out of main.js and run against the real
// game/save.js over an in-memory localStorage.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { writeSave, readSaveRaw } from '../game/save.js';

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');

function zoneTable() {
    const m = /\nconst CONTINUE_ZONE_NAMES\s*=\s*/.exec(mainSrc);
    assert.ok(m, 'CONTINUE_ZONE_NAMES not found');
    const from = m.index + m[0].length;
    return new Function(`'use strict'; return ${mainSrc.slice(from, mainSrc.indexOf('\n};', from) + 2)}`)();
}
const TABLE = zoneTable();

function lift() {
    const sig = '_continueLine(now = Date.now()) {';
    const at = mainSrc.indexOf(sig);
    assert.ok(at > 0, '_continueLine not found');
    const end = mainSrc.indexOf('\n    }', at) + '\n    }'.length;
    const body = mainSrc.slice(at + '_continueLine'.length, end);
    return new Function('readSaveRaw', 'CONTINUE_ZONE_NAMES', `'use strict'; return function ${body}`)(readSaveRaw, TABLE);
}

let store;
beforeEach(() => {
    store = new Map();
    globalThis.localStorage = {
        getItem: k => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { store.set(k, String(v)); },
        removeItem: k => { store.delete(k); },
    };
});

function stage(mapUrl) {
    const g = {
        turn: 3, equipment: {}, inventory: [], _log() {}, map: { url: mapUrl },
        playerX: 1, playerY: 1, tempEquips: [], buffs: [],
    };
    assert.equal(writeSave(g), true);
    return readSaveRaw();
}
const HOUR = 3600e3;

test('a real save gives the zone and how long ago', () => {
    const raw = stage('sewer-map.json');
    const line = lift().call({}, raw.savedAt + 2 * HOUR + 5000);
    assert.equal(line, 'Saved game: SEWER, 2 hours ago');
});

test('the age steps: under an hour, one hour, days', () => {
    const raw = stage('town-map.json');
    const f = lift();
    assert.match(f.call({}, raw.savedAt + 60000), /TOWN, under 1 hour ago$/);
    assert.match(f.call({}, raw.savedAt + HOUR), /TOWN, 1 hour ago$/);
    assert.match(f.call({}, raw.savedAt + 72 * HOUR), /TOWN, 3 days ago$/);
});

test('no save gives no line', () => {
    assert.equal(lift().call({}), null);
});

test('a broken save gives no line and throws nothing', () => {
    store.set('violencetown.save', '{not json');
    assert.equal(lift().call({}), null);
});

test('every map file has a zone name', () => {
    const dir = fileURLToPath(new URL('../game/', import.meta.url));
    const maps = readdirSync(dir).filter(f => f.endsWith('-map.json'));
    assert.ok(maps.length > 10);
    for (const f of maps) assert.ok(TABLE[f], `${f} has no zone name for the title line`);
});

test('the title shows the line with CONTINUE and the confirm appends it', () => {
    const html = readFileSync(fileURLToPath(new URL('../game/index.html', import.meta.url)), 'utf8');
    assert.ok(html.includes('id="splash-continue-line"'));
    assert.ok(mainSrc.includes("'Restart from the beginning? This erases your current save.' + (where ?"));
});
