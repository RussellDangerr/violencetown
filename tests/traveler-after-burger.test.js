// traveler-after-burger.test.js — TT1: the Stranded Traveler leaves Downtown once the burger is
// delivered (plans/tt1-traveler-after-burger.md, ruling TT1R1 pick b).
//
// Runs the REAL main.js _zoneChange and _loadMap lifted onto a stand-in game, against the real
// downtown map, the way auto-loot.test.js does.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GameMap } from '../game/map.js';
import { spawnEnemy } from '../game/enemies.js';
import { resolveSpawn, defaultPicks } from '../game/slots.js';
import { deadIds, pendingDrops, stepRespawns } from '../game/drops.js';
import { QuestEngine } from '../game/quests.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const mainSrc = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
function liveMethod(signature, freeVars, { async = false } = {}) {
    const at = mainSrc.indexOf(signature, mainSrc.indexOf('class Game {'));
    assert.ok(at > 0, `${signature} not found in main.js`);
    const body = mainSrc.slice(at + signature.indexOf('('), mainSrc.indexOf('\n    }', at) + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return ${async ? 'async ' : ''}function ${body}`)(...names.map(n => freeVars[n]));
}
const mapJson = (url) => JSON.parse(readFileSync(new URL(`../game/${url}`, import.meta.url), 'utf8'));
const free = {
    loadMap: async (url) => new GameMap(mapJson(url), url),
    document: { getElementById: () => null }, audio: { playSfx() {}, playMusic() {} },
    spawnEnemy, resolveSpawn, deadIds, pendingDrops, stepRespawns,
};
const load = liveMethod('    async _loadMap(', free, { async: true });
const zoneChange = liveMethod('    _zoneChange(', free);

function game(qe) {
    const g = {
        _loadMap: load, _zoneChange: zoneChange,
        slots: defaultPicks(), map: null, _mapUrl: null, enemies: [], groundItems: [],
        _collectedItems: new Set(), _droppedItems: {}, _muggedIds: new Set(), _robbed: {},
        _respawnLists: {}, _pendingFollowers: null, gold: 0, questEngine: qe,
        renderer: { dropFightFog() {} },
        _endBuybacks() {}, _advanceDayClock() {}, _openBridgeIfCarFixed() {}, _render() {},
        _resolveItemDef: () => null, _log() {}, emitGameEvent() {}, _saveMoment() {},
    };
    g.walkTo = async (url) => { g._zoneChange(); await g._loadMap(url); };
    return g;
}
const traveler = (g) => g.enemies.find(e => e.id === 'dt-recipient');

describe('the Stranded Traveler after the burger is delivered', () => {
    test('before the delivery he stands in Downtown, as today', async () => {
        const g = game(new QuestEngine());
        await g.walkTo('town-map.json');
        await g.walkTo('downtown-map.json');
        assert.ok(traveler(g), 'he is there');
    });

    test('after deliver_burger is complete, walking into Downtown finds him gone', async () => {
        const qe = new QuestEngine();
        qe.state.completed.push('deliver_burger');
        const g = game(qe);
        await g.walkTo('town-map.json');
        await g.walkTo('downtown-map.json');
        assert.equal(traveler(g), undefined);
        assert.ok(g.enemies.length > 0, 'the rest of Downtown is still populated');
    });

    test('it holds after a save and reload', async () => {
        const qe = new QuestEngine();
        qe.state.completed.push('deliver_burger');
        const saved = JSON.parse(JSON.stringify(qe.serialize()));
        const qe2 = new QuestEngine();
        qe2.restore(saved);
        const g = game(qe2);
        await g.walkTo('downtown-map.json');
        assert.equal(traveler(g), undefined);
    });

    test('only his spawn is gated', () => {
        const gated = mapJson('downtown-map.json').enemies.filter(e => e.goneAfter);
        assert.deepEqual(gated.map(e => e.id), ['dt-recipient']);
    });
});
