// respawn-list.test.js — what you kill stays dead, then comes back a few at a
// time over 7 zone changes (plans/ks1-respawn-list.md).
//
// The list maths are the pure helpers in drops.js. The game side runs the REAL
// main.js methods (_loadMap, _handleEnemyDeath, _zoneChange and their helpers)
// lifted onto a stand-in game, against the real sewer map, so "leave and come
// back" is the same code a door runs.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    RESPAWN_STEPS, recordKill, stepRespawns, deadIds, sanitizeRespawnLists, bossDropOnce,
    recordDrop, pendingDrops, takeDrop, dropLoadout,
} from '../game/drops.js';
import { GameMap } from '../game/map.js';
import { spawnEnemy } from '../game/enemies.js';
import { resolveSpawn, defaultPicks, requiredDropFor, dropLineFor } from '../game/slots.js';
import { transferGold } from '../game/trade.js';
import { ITEMS } from '../game/items.js';
import { serialize, migrate, loadInto } from '../game/save.js';
import { QuestEngine } from '../game/quests.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

// ── The list maths ──────────────────────────────────────────────────────────

// Run `steps` zone changes; return how many of `url`'s kills are back after each.
function backPerStep(lists, url, steps) {
    const out = [];
    for (let i = 0; i < steps; i++) out.push((stepRespawns(lists)[url] || []).length);
    return out;
}

describe('the respawn list', () => {
    test('everything is back after 7 zone changes (one constant)', () => {
        assert.equal(RESPAWN_STEPS, 7);
    });

    test('a lone kill stays dead when you leave and come straight back', () => {
        const lists = {};
        recordKill(lists, 'sewer', 'e1');
        stepRespawns(lists);   // leave
        stepRespawns(lists);   // come back
        assert.ok(deadIds(lists, 'sewer').has('e1'));
    });

    test('a lone kill waits every step, and is back on the 7th', () => {
        const lists = {};
        recordKill(lists, 'sewer', 'e1');
        assert.deepEqual(backPerStep(lists, 'sewer', 7), [0, 0, 0, 0, 0, 0, 1]);
        assert.deepEqual(lists, {}, 'an emptied zone leaves the list');
    });

    test('seven kills come back one per zone change', () => {
        const lists = {};
        for (let i = 1; i <= 7; i++) recordKill(lists, 'sewer', `e${i}`);
        assert.deepEqual(backPerStep(lists, 'sewer', 7), [1, 1, 1, 1, 1, 1, 1]);
    });

    test('a cleared zone refills a few at a time, first killed first', () => {
        const lists = {};
        for (const id of ['a', 'b', 'c']) recordKill(lists, 'sewer', id);
        const order = [];
        for (let i = 0; i < 7; i++) order.push(...(stepRespawns(lists).sewer || []));
        assert.deepEqual(order, ['a', 'b', 'c']);
    });

    test('for any number of kills: never all at once early, all back by step 7', () => {
        for (let n = 1; n <= 40; n++) {
            const lists = {};
            for (let i = 0; i < n; i++) recordKill(lists, 'z', `k${i}`);
            const per = backPerStep(lists, 'z', RESPAWN_STEPS);
            assert.equal(per.reduce((a, b) => a + b, 0), n, `n=${n}: all back after ${RESPAWN_STEPS}`);
            assert.ok(per.slice(0, 2).reduce((a, b) => a + b, 0) < n, `n=${n}: some still dead after two`);
            assert.ok(Math.max(...per) < n || n === 1, `n=${n}: not everything in one step`);
        }
    });

    test('a fresh batch is not hurried along by an older one in the same zone', () => {
        const lists = {};
        recordKill(lists, 'sewer', 'old');
        for (let i = 0; i < 6; i++) stepRespawns(lists);
        recordKill(lists, 'sewer', 'new');
        assert.deepEqual(stepRespawns(lists), { sewer: ['old'] });
        assert.ok(deadIds(lists, 'sewer').has('new'));
        assert.deepEqual(backPerStep(lists, 'sewer', 7), [0, 0, 0, 0, 0, 1, 0]);
    });

    test('every zone takes the step, not just the one you are in', () => {
        const lists = {};
        recordKill(lists, 'sewer', 'e1');
        recordKill(lists, 'town', 'townie');
        for (let i = 0; i < 7; i++) stepRespawns(lists);
        assert.deepEqual(lists, {});
    });

    test('a kill already waiting is not listed twice', () => {
        const lists = {};
        assert.equal(recordKill(lists, 'sewer', 'e1'), true);
        assert.equal(recordKill(lists, 'sewer', 'e1'), false);
        assert.equal(lists.sewer.length, 1);
    });

    test('the same kills give the same refill every time (no dice)', () => {
        const run = () => {
            const lists = {};
            for (let i = 0; i < 11; i++) recordKill(lists, 'z', `k${i}`);
            return Array.from({ length: 7 }, () => stepRespawns(lists).z || []);
        };
        assert.deepEqual(run(), run());
    });

    test('a saved list is cleaned: junk entries, duplicates and empty zones go', () => {
        assert.deepEqual(sanitizeRespawnLists({
            sewer: [{ id: 'e1', age: 2 }, { id: 'e1', age: 3 }, null, 5, { id: 7 }, { id: 'e2', age: -1 }],
            town: [], bad: 'x',
        }), { sewer: [{ id: 'e1', age: 2 }, { id: 'e2', age: 0 }] });
        assert.deepEqual(sanitizeRespawnLists(null), {});
        assert.deepEqual(sanitizeRespawnLists([1, 2]), {});
    });
});

describe('a boss drops its items once', () => {
    test('bossDropOnce is true the first time only', () => {
        const given = new Set();
        assert.equal(bossDropOnce(given, 'sewer', 'wererat'), true);
        assert.equal(bossDropOnce(given, 'sewer', 'wererat'), false);
        assert.equal(bossDropOnce(given, 'canyon', 'pike'), true);
    });
});

describe('loot keeps its real count', () => {
    test('three of one item on one tile come back as three', () => {
        const dropped = {};
        for (let i = 0; i < 3; i++) recordDrop(dropped, 'sewer', 'mystery_meat', 4, 9);
        assert.equal(dropped.sewer.length, 1, 'still one record for the tile');
        assert.equal(pendingDrops(dropped, new Set(), 'sewer').length, 3);
    });

    test('taking one leaves the rest to come back', () => {
        const dropped = {};
        for (let i = 0; i < 3; i++) recordDrop(dropped, 'sewer', 'mystery_meat', 4, 9);
        assert.equal(takeDrop(dropped, 'sewer', 'mystery_meat', 4, 9), true);
        assert.equal(pendingDrops(dropped, new Set(), 'sewer').length, 2);
        takeDrop(dropped, 'sewer', 'mystery_meat', 4, 9);
        assert.deepEqual(dropped.sewer, [{ type: 'mystery_meat', x: 4, y: 9 }], 'a count of one is left off');
        takeDrop(dropped, 'sewer', 'mystery_meat', 4, 9);
        assert.deepEqual(dropped, {});
        assert.equal(takeDrop(dropped, 'sewer', 'mystery_meat', 4, 9), false, 'nothing left to take');
    });

    test('an item no drop record covers is not a drop', () => {
        assert.equal(takeDrop({}, 'sewer', 'rock', 1, 1), false);
    });
});

// ── The game side: real main.js methods on a stand-in game ──────────────────

const mainSrc = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
function liveMethod(signature, freeVars, { async = false } = {}) {
    const at = mainSrc.indexOf(signature, mainSrc.indexOf('class Game {'));
    assert.ok(at > 0, `${signature} not found in main.js`);
    const body = mainSrc.slice(at + signature.indexOf('('), mainSrc.indexOf('\n    }', at) + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return ${async ? 'async ' : ''}function ${body}`)(...names.map(n => freeVars[n]));
}

const MAPS = {};
const mapJson = (url) => (MAPS[url] ||= JSON.parse(readFileSync(new URL(`../game/${url}`, import.meta.url), 'utf8')));
const stubDocument = { getElementById: () => null };
const audio = { playSfx() {}, playMusic() {} };

const free = {
    loadMap: async (url) => new GameMap(mapJson(url), url),
    document: stubDocument, audio, spawnEnemy, resolveSpawn, deadIds, pendingDrops,
    recordDrop, takeDrop, recordKill, stepRespawns, bossDropOnce,
    transferGold, dropLoadout, requiredDropFor, dropLineFor, ITEMS, onSewerEnemyKilled() {},
};
const M = {
    _loadMap: liveMethod('    async _loadMap(', free, { async: true }),
    _handleEnemyDeath: liveMethod('    _handleEnemyDeath(', free),
    _rememberKill: liveMethod('    _rememberKill(', free),
    _bossFirstFall: liveMethod('    _bossFirstFall(', free),
    _zoneChange: liveMethod('    _zoneChange(', free),
    _recordDrop: liveMethod('    _recordDrop(', free),
    _takeDropRecord: liveMethod('    _takeDropRecord(', free),
};

function game() {
    const g = {
        ...M,
        slots: defaultPicks(), map: null, _mapUrl: null, enemies: [], groundItems: [], logs: [],
        _collectedItems: new Set(), _droppedItems: {}, _muggedIds: new Set(), _robbed: {},
        _respawnLists: {}, _bossDropsGiven: new Set(), _pendingFollowers: null, gold: 0,
        renderer: { dropFightFog() {} }, questEngine: null,
        _endBuybacks() {}, _advanceDayClock() {}, _openBridgeIfCarFixed() {}, _render() {},
        _resolveItemDef: (id) => ITEMS[id] || null,
        _log(m) { this.logs.push(m); }, _spawnEventWord() {}, emitGameEvent() {}, _grantItem() {},
    };
    // A real door: the lists take a step, then the next map loads.
    g.walkTo = async (url) => { g._zoneChange(); await g._loadMap(url); };
    g.kill = (id) => {
        const e = g.enemies.find(x => x.id === id);
        assert.ok(e, `${id} is in ${g._mapUrl}`);
        e.entity.hp = 0; e.entity.alive = false;
        g._handleEnemyDeath(e);
    };
    g.ids = () => g.enemies.map(e => e.id);
    return g;
}

describe('the sewer, walked through real doors', () => {
    let g;
    beforeEach(async () => { g = game(); await g._loadMap('sewer-map.json'); });

    test('kill something, leave and come straight back: it is still dead', async () => {
        assert.ok(g.ids().includes('e1'));
        g.kill('e1');
        await g.walkTo('town-map.json');
        await g.walkTo('sewer-map.json');
        assert.ok(!g.ids().includes('e1'));
        assert.equal(g.enemies.length, mapJson('sewer-map.json').enemies.length - 1);
    });

    test('a cleared sewer refills a few at a time and is full after 7 zone changes', async () => {
        const all = g.ids();
        for (const id of all) g.kill(id);
        const seen = [];
        for (let step = 1; step <= 7; step++) {
            await g.walkTo(step % 2 ? 'town-map.json' : 'sewer-map.json');
            await g._loadMap('sewer-map.json');   // look in (a peek, not a zone change)
            seen.push(g.enemies.length);
        }
        assert.ok(seen[0] < all.length, 'not refilled at once');
        assert.ok(seen.some(n => n > 0 && n < all.length), `partly refilled on the way: ${seen}`);
        for (let i = 1; i < seen.length; i++) assert.ok(seen[i] >= seen[i - 1], `never shrinks: ${seen}`);
        assert.equal(seen[6], all.length, 'everything is back after 7');
    });

    test('a beaten boss drops the converter and fur once, however often it respawns', async () => {
        const drops = () => g.groundItems.filter(i => i.type === 'catalytic_converter' || i.type === 'wererat_fur').length;
        g.kill('wererat');
        assert.equal(drops(), 2, 'first kill: converter + fur');
        // Take them, so only a new drop could put them back.
        for (const gi of [...g.groundItems]) g._takeDropRecord(gi.type, gi.x, gi.y);
        for (let round = 0; round < 3; round++) {
            for (let i = 0; i < RESPAWN_STEPS; i++) await g.walkTo(i % 2 ? 'sewer-map.json' : 'town-map.json');
            await g._loadMap('sewer-map.json');
            assert.ok(g.ids().includes('wererat'), 'the boss is back');
            g.kill('wererat');
            assert.equal(drops(), 0, `re-kill ${round + 1} drops nothing new`);
        }
    });

    test('loot left on a tile keeps its real count across visits', async () => {
        for (let i = 0; i < 3; i++) {
            g._recordDrop('mystery_meat', 4, 9);
            g.groundItems.push({ type: 'mystery_meat', x: 4, y: 9, def: ITEMS.mystery_meat });
        }
        await g.walkTo('town-map.json');
        await g.walkTo('sewer-map.json');
        const meat = () => g.groundItems.filter(i => i.type === 'mystery_meat' && i.x === 4 && i.y === 9).length;
        assert.equal(meat(), 3);
        g._takeDropRecord('mystery_meat', 4, 9);
        await g.walkTo('town-map.json');
        await g.walkTo('sewer-map.json');
        assert.equal(meat(), 2);
    });

    test('a spawn the game made on the fly is never listed', async () => {
        g.enemies.push(spawnEnemy({ id: 'rat_99', type: 'Rat', x: 2, y: 2, hp: 1 }));
        g.kill('rat_99');
        assert.deepEqual(g._respawnLists, {});
    });
});

// ── The save ────────────────────────────────────────────────────────────────

function saveGame(g) {
    return Object.assign(g, {
        turn: 0, rng: null, playerX: 1, playerY: 10, playerHp: 100, playerMaxHp: 100,
        playerMp: 100, playerMaxMp: 100, facing: 'down', equipment: {}, tempEquips: [], buffs: [],
        inventory: [], containers: [], _tileDiffs: [], _pendingTransition: null, _sewerEscape: null,
        setTile() {}, questEngine: new QuestEngine(g),
    });
}

describe('the save keeps the respawn lists', () => {
    test('a save and reload keeps who is still dead and which boss already dropped', async () => {
        const g = saveGame(game());
        await g._loadMap('sewer-map.json');
        g.kill('e1'); g.kill('wererat');
        g._zoneChange();
        const blob = JSON.parse(JSON.stringify(serialize(g)));
        assert.deepEqual(blob.world.respawnLists, { 'sewer-map.json': [{ id: 'e1', age: 1 }, { id: 'wererat', age: 1 }] });
        assert.deepEqual(blob.world.bossDropsGiven, ['sewer-map.json|wererat']);

        const g2 = saveGame(game());
        await loadInto(g2, blob);
        assert.deepEqual(g2._respawnLists, g._respawnLists);
        assert.deepEqual([...g2._bossDropsGiven], ['sewer-map.json|wererat']);
        // The restored map load already leaves them out.
        await g2._loadMap('sewer-map.json');
        assert.ok(!g2.ids().includes('e1') && !g2.ids().includes('wererat'));
    });

    test('nothing killed: the save carries no respawn fields at all', async () => {
        const g = saveGame(game());
        await g._loadMap('sewer-map.json');
        const world = serialize(g).world;
        assert.ok(!('respawnLists' in world));
        assert.ok(!('bossDropsGiven' in world));
    });

    test('an old save with no respawn lists loads with nothing waiting', async () => {
        const g = saveGame(game());
        await g._loadMap('sewer-map.json');
        const blob = JSON.parse(JSON.stringify(serialize(g)));
        assert.deepEqual(migrate(blob).world.respawnLists, {});
        const g2 = saveGame(game());
        g2._respawnLists = { stale: [{ id: 'x', age: 0 }] };
        await loadInto(g2, blob);
        assert.deepEqual(g2._respawnLists, {});
        assert.equal(g2._bossDropsGiven.size, 0);
        await g2._loadMap('sewer-map.json');
        assert.equal(g2.enemies.length, mapJson('sewer-map.json').enemies.length, 'everyone spawns, as before');
    });
});
