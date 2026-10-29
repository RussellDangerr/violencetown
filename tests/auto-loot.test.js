// auto-loot.test.js — a kill's loot goes straight into your bag
// (plans/fx3-auto-loot-burst.md, FX3).
//
// Runs the REAL main.js methods (_handleEnemyDeath, _takeKillLoot,
// _addToInventory, _loadMap and their helpers) lifted onto a stand-in game,
// against the real sewer map, the way respawn-list.test.js does.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    recordKill, stepRespawns, deadIds, bossDropOnce, recordDrop, pendingDrops, takeDrop, dropLoadout,
    RESPAWN_STEPS,
} from '../game/drops.js';
import { GameMap } from '../game/map.js';
import { spawnEnemy } from '../game/enemies.js';
import { resolveSpawn, defaultPicks, requiredDropFor, dropLineFor } from '../game/slots.js';
import { transferGold } from '../game/trade.js';
import { ITEMS } from '../game/items.js';
import { addToInventory as addToInv } from '../game/inventory.js';
import { INVENTORY_SIZE, SAFE_SLOTS, PACK_PAGE, MAX_STACK } from '../game/data.js';
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

const MAPS = {};
const mapJson = (url) => (MAPS[url] ||= JSON.parse(readFileSync(new URL(`../game/${url}`, import.meta.url), 'utf8')));
const sfx = [];
const free = {
    loadMap: async (url) => new GameMap(mapJson(url), url),
    document: { getElementById: () => null }, audio: { playSfx(n) { sfx.push(n); }, playMusic() {} },
    spawnEnemy, resolveSpawn, deadIds, pendingDrops, recordDrop, takeDrop, recordKill, stepRespawns, bossDropOnce,
    transferGold, dropLoadout, requiredDropFor, dropLineFor, ITEMS, onSewerEnemyKilled() {},
    addToInv, SAFE_SLOTS, PACK_PAGE, MAX_STACK,
};
const M = {
    _loadMap: liveMethod('    async _loadMap(', free, { async: true }),
    _handleEnemyDeath: liveMethod('    _handleEnemyDeath(', free),
    _takeKillLoot: liveMethod('    _takeKillLoot(', free),
    _addToInventory: liveMethod('    _addToInventory(', free),
    _rememberKill: liveMethod('    _rememberKill(', free),
    _bossFirstFall: liveMethod('    _bossFirstFall(', free),
    _zoneChange: liveMethod('    _zoneChange(', free),
    _recordDrop: liveMethod('    _recordDrop(', free),
    _takeDropRecord: liveMethod('    _takeDropRecord(', free),
};

function game() {
    const g = {
        ...M,
        slots: defaultPicks(), map: null, _mapUrl: null, enemies: [], groundItems: [], logs: [], events: [],
        inventory: new Array(INVENTORY_SIZE).fill(null), bursts: [], saves: 0,
        _collectedItems: new Set(), _droppedItems: {}, _muggedIds: new Set(), _robbed: {},
        _respawnLists: {}, _bossDropsGiven: new Set(), _pendingFollowers: null, gold: 0,
        renderer: { dropFightFog() {} }, questEngine: null,
        _endBuybacks() {}, _advanceDayClock() {}, _openBridgeIfCarFixed() {}, _render() {},
        _resolveItemDef: (id) => ITEMS[id] || null,
        _log(m) { this.logs.push(m); }, _spawnEventWord() {}, _grantItem() {},
        emitGameEvent(type, data) { this.events.push({ ...data, event: type }); this.questEngine?.emit(type, data); },
        _saveMoment() { this.saves++; },
        _startLootBurst(x, y, defs) { this.bursts.push({ x, y, ids: defs.map(d => d.id) }); },
    };
    g.walkTo = async (url) => { g._zoneChange(); await g._loadMap(url); };
    g.kill = (id) => {
        const e = g.enemies.find(x => x.id === id);
        assert.ok(e, `${id} is in ${g._mapUrl}`);
        g.lastKit = dropLoadout(e.loadout, e.x, e.y).map(i => i.type);
        g.groundBefore = JSON.stringify(g.groundItems);
        e.entity.hp = 0; e.entity.alive = false;
        g._handleEnemyDeath(e);
        return e;
    };
    // The floor holds what the map put there, and nothing the kill added.
    g.groundUntouched = () => assert.equal(JSON.stringify(g.groundItems), g.groundBefore);
    g.bag = () => g.inventory.filter(Boolean).flatMap(s => Array(s.count).fill(s.itemDef.id));
    return g;
}

// The loadout a map enemy carries, as item ids (the kit it drops).
const kitOf = (url, id) => (mapJson(url).enemies.find(e => e.id === id).loadout || [])
    .map(x => (typeof x === 'string' ? x : x.id));

describe('a kill\'s loot goes straight into the bag', () => {
    let g;
    beforeEach(async () => { g = game(); sfx.length = 0; await g._loadMap('sewer-map.json'); });

    test('an enemy\'s unused kit lands in the bag and nothing is left on the ground', () => {
        const kit = kitOf('sewer-map.json', 'e1');
        assert.ok(kit.length > 0, 'e1 carries a kit to test with');
        g.kill('e1');
        g.groundUntouched();
        assert.deepEqual(g._droppedItems, {}, 'no ground drop is recorded for the zone');
        assert.deepEqual(g.bag().sort(), [...kit].sort());
    });

    test('the log names every item you got, after the kill\'s own lines', () => {
        g.kill('e1');
        const kit = kitOf('sewer-map.json', 'e1');
        const picked = g.logs.filter(l => l.startsWith('[Picked up '));
        assert.deepEqual(picked, kit.map(id => `[Picked up ${ITEMS[id].name}]`));
        assert.ok(g.logs.indexOf(`[They drop what they didn't get to use.]`) < g.logs.indexOf(picked[0]));
        assert.deepEqual(sfx.filter(n => n === 'pickup'), ['pickup'], 'one pickup sound per kill');
        assert.equal(g.saves, 1, 'the loot is saved at once');
    });

    test('the boss\'s required item and its fur go into the bag, and fire item_pickup', () => {
        g.kill('wererat');
        g.groundUntouched();
        assert.deepEqual(g.bag().sort(), [...g.lastKit, 'catalytic_converter', 'wererat_fur'].sort());
        const picks = g.events.filter(e => e.event === 'item_pickup').map(e => e.id);
        assert.ok(picks.includes('catalytic_converter') && picks.includes('wererat_fur'));
        // The kill is heard before the pickup, as with a walk-over.
        const kill = g.events.findIndex(e => e.event === 'enemy_killed');
        const pick = g.events.findIndex(e => e.event === 'item_pickup');
        assert.ok(kill >= 0 && kill < pick);
    });

    test('the quest moves on from the kill alone: no walk to the converter', () => {
        const qe = new QuestEngine(g);
        g.questEngine = qe;
        qe.state.flags.carExamined = true;
        qe.start('fix_car');
        assert.equal(qe.currentStageId(), 'recover_converter');
        g.kill('wererat');
        assert.equal(qe.currentStageId(), 'escape_sewer');
    });

    test('a respawned boss gives its items once, however often you beat it', async () => {
        g.kill('wererat');
        const count = () => g.bag().filter(id => id === 'catalytic_converter' || id === 'wererat_fur').length;
        assert.equal(count(), 2);
        for (let round = 0; round < 2; round++) {
            for (let i = 0; i < RESPAWN_STEPS; i++) await g.walkTo(i % 2 ? 'sewer-map.json' : 'town-map.json');
            await g._loadMap('sewer-map.json');
            assert.ok(g.enemies.some(e => e.id === 'wererat'), 'the boss is back');
            g.kill('wererat');
            assert.equal(count(), 2, `re-kill ${round + 1} gives nothing new`);
            assert.deepEqual(g.groundItems.filter(i => i.type === 'catalytic_converter' || i.type === 'wererat_fur'), []);
        }
    });

    test('a full bag grows another page rather than leaving loot behind (FX3R2)', () => {
        const filler = ITEMS.rock || Object.values(ITEMS)[0];
        for (let i = 0; i < g.inventory.length; i++) g.inventory[i] = { itemDef: { ...filler, id: `filler_${i}` }, count: MAX_STACK };
        const size = g.inventory.length;
        g.kill('wererat');
        g.groundUntouched();
        assert.ok(g.inventory.length > size, 'the bag grew a page');
        assert.ok(g.bag().includes('catalytic_converter'));
    });

    test('the burst starts at the body with every item the kill gave', () => {
        const e = g.kill('wererat');
        assert.equal(g.bursts.length, 1);
        assert.deepEqual({ x: g.bursts[0].x, y: g.bursts[0].y }, { x: e.x, y: e.y });
        assert.deepEqual([...g.bursts[0].ids].sort(), [...g.lastKit, 'catalytic_converter', 'wererat_fur'].sort());
        assert.ok(g.lastKit.length > 0, 'the boss carries a kit to test with');
    });

    test('a kill that gives nothing starts no burst and logs no pickup', () => {
        const e = spawnEnemy({ id: 'rat_99', type: 'Rat', x: 2, y: 2, hp: 1 });
        e.loadout = [];
        g.enemies.push(e);
        g.kill('rat_99');
        assert.deepEqual(g.bursts, []);
        assert.ok(!g.logs.some(l => l.startsWith('[Picked up ')));
    });

    test('an item that will not resolve still falls to the floor', () => {
        const left = g._takeKillLoot([{ type: 'no_such_thing', x: 3, y: 4, def: null }], { x: 3, y: 4 });
        assert.deepEqual(left.map(i => i.type), ['no_such_thing']);
    });
});
