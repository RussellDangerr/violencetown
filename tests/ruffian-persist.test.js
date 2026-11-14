import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Enemy, spawnEnemy, muggerRecords } from '../game/enemies.js';

const def = { id: 'ruf1', type: 'Ruffian', x: 3, y: 3, hp: 20, maxHp: 20, damage: 3, gold: 5, loadout: [], tag: 'mugger' };

describe('BS2 the Ruffian keeps your gold', () => {
    test('a record is taken from a mugger who took gold, and respawn gives it back', () => {
        const live = spawnEnemy(def, new Set());
        live._tookGold = 10; live.gold += 10;
        const rec = muggerRecords([live], {});
        assert.deepEqual(rec, { ruf1: 10 });
        const back = spawnEnemy(def, new Set(), null, null, rec);
        assert.equal(back.gold, 5 + 10);
        assert.equal(back._tookGold, 10);
    });
    test('without a record he spawns as the map made him', () => {
        const e = spawnEnemy(def, new Set(), null, null, {});
        assert.equal(e.gold, 5);
        assert.ok(!(e._tookGold > 0));
    });
    test('a dead one, or one who lost the gold, drops out; other zones are kept', () => {
        const live = spawnEnemy(def, new Set());
        live._tookGold = 10; live.gold = 15;
        live.entity.alive = false;
        assert.deepEqual(muggerRecords([live], { ruf1: 10, other: 4 }), { other: 4 });
        const broke = spawnEnemy(def, new Set()); broke._tookGold = 10; broke.gold = 0;
        assert.deepEqual(muggerRecords([broke], { ruf1: 10 }), {});
    });
    test('a looted (mugged) one does not get it back', () => {
        const e = spawnEnemy(def, new Set(['ruf1']), null, null, { ruf1: 10 });
        assert.equal(e.gold, 0);
    });
    test('the took-gold mark survives his own save and load', () => {
        const live = spawnEnemy(def, new Set());
        live._tookGold = 10;
        const back = Enemy.fromSave(JSON.parse(JSON.stringify(live.toSave())));
        assert.equal(back._tookGold, 10);
        const clean = Enemy.fromSave(JSON.parse(JSON.stringify(spawnEnemy(def, new Set()).toSave())));
        assert.ok(!(clean._tookGold > 0));
    });
});

// FX61: the record lives in the one zone-change step, so every way out of a zone keeps it, once.
import { readFileSync } from 'node:fs';
const mainSrc = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
function method(sig, free, isAsync = false) {
    const at = mainSrc.indexOf(sig, mainSrc.indexOf('class Game {'));
    assert.ok(at > 0, `${sig} not found`);
    const body = mainSrc.slice(at + sig.indexOf('('), mainSrc.indexOf('\n    }', at) + 6);
    const names = Object.keys(free);
    return new Function(...names, `'use strict'; return ${isAsync ? 'async ' : ''}function ${body}`)(...names.map(n => free[n]));
}
function fxGame() {
    const timers = [];
    const free = {
        muggerRecords, STATE: { IDLE: 'idle', RESOLVING: 'res' }, audio: { playSfx() {} },
        setTimeout: (fn) => timers.push(fn), stepRespawns: () => ({}),
    };
    const live = spawnEnemy(def, new Set());
    live._tookGold = 10; live.gold += 10;
    const g = {
        enemies: [live], _tookGold: {}, _respawnLists: {}, timers, loads: [], recorded: 0, state: 'idle',
        _stopAutoRepeat() {}, _flash() {}, _triggerScreenShake() {}, _render() {}, _log() {},
        async _loadMap(url) { this.loads.push(url); }, _startMainQuest2() {},
        emitGameEvent() {}, questEngine: null,
    };
    // _recordMuggers is a one-line method: pin its source, then count the calls.
    assert.ok(mainSrc.includes('_recordMuggers() { this._tookGold = muggerRecords(this.enemies, this._tookGold); }'));
    g._recordMuggers = function () { g.recorded++; this._tookGold = muggerRecords(this.enemies, this._tookGold); };
    g._zoneChange = method('    _zoneChange() {', free);
    g._crashToCanyon = method('    async _crashToCanyon() {', free, true);
    g._rampToDowntown = method('    async _rampToDowntown() {', free, true);
    g._rideTo = method('    _rideTo(toMap, toX, toY) {', free);
    return g;
}

describe('FX61 every zone change records muggers, once', () => {
    test('the crash into the Canyon keeps the gold', async () => {
        const g = fxGame();
        await g._crashToCanyon();
        assert.deepEqual(g._tookGold, { ruf1: 10 });
        assert.equal(g.recorded, 1);
    });
    test('the ramp into Downtown keeps the gold', async () => {
        const g = fxGame();
        await g._rampToDowntown();
        assert.deepEqual(g._tookGold, { ruf1: 10 });
        assert.equal(g.recorded, 1);
    });
    test('a taxi ride keeps the gold, once', async () => {
        const g = fxGame();
        g._rideTo('x-map.json', 1, 1);
        await g.timers.pop()();
        assert.deepEqual(g._tookGold, { ruf1: 10 });
        assert.equal(g.recorded, 1);
    });
    test('the door step records once', () => {
        const g = fxGame();
        g._zoneChange();
        assert.deepEqual(g._tookGold, { ruf1: 10 });
        assert.equal(g.recorded, 1);
    });
    test('main.js calls the record only inside the zone-change step', () => {
        const calls = mainSrc.match(/this\._recordMuggers\??\.?\(\)/g) ?? [];
        assert.equal(calls.length, 1);
        const at = mainSrc.indexOf('    _zoneChange() {');
        assert.match(mainSrc.slice(at, mainSrc.indexOf('\n    }', at)), /_recordMuggers/);
    });
});
