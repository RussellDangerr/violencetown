// vendor-till-loot.test.js — killing a vendor loots the whole till
// (plans/vendor-till-loot.md).
//
// Pins TODAY's behaviour, which is the bug: a vendor's `gold` is its till
// (VENDOR_WALLET, 9999), and _handleEnemyDeath loots `gold` whole (Law 6). These
// assertions pass now and are meant to be flipped by the fix once Caelan rules.
//
// Runs the REAL main.js _handleEnemyDeath on the real sewer map, lifted onto a
// stand-in game the way auto-loot.test.js does.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    recordKill, stepRespawns, deadIds, bossDropOnce, recordDrop, pendingDrops, takeDrop, dropLoadout,
} from '../game/drops.js';
import { GameMap } from '../game/map.js';
import { spawnEnemy } from '../game/enemies.js';
import { resolveSpawn, defaultPicks, requiredDropFor, dropLineFor } from '../game/slots.js';
import { transferGold, NIGHT_SPAWNS } from '../game/trade.js';
import { healPurchase } from '../game/ai.js';
import { ITEMS } from '../game/items.js';
import { addToInventory as addToInv } from '../game/inventory.js';
import { INVENTORY_SIZE, SAFE_SLOTS, PACK_PAGE, MAX_STACK } from '../game/data.js';

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
const free = {
    loadMap: async (url) => new GameMap(mapJson(url), url),
    document: { getElementById: () => null }, audio: { playSfx() {}, playMusic() {} },
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
    _recordDrop: liveMethod('    _recordDrop(', free),
};

function game() {
    const g = {
        ...M,
        slots: defaultPicks(), map: null, _mapUrl: null, enemies: [], groundItems: [], logs: [], events: [],
        inventory: new Array(INVENTORY_SIZE).fill(null), bursts: [], equipment: {},
        _collectedItems: new Set(), _droppedItems: {}, _muggedIds: new Set(), _robbed: {},
        _respawnLists: {}, _bossDropsGiven: new Set(), _pendingFollowers: null, gold: 0,
        renderer: { dropFightFog() {} }, questEngine: null,
        _endBuybacks() {}, _advanceDayClock() {}, _openBridgeIfCarFixed() {}, _render() {},
        _resolveItemDef: (id) => ITEMS[id] || null,
        _log(m) { this.logs.push(m); }, _spawnEventWord() {}, _grantItem() {},
        emitGameEvent(type, data) { this.events.push({ ...data, event: type }); },
        _saveMoment() {}, _startLootBurst() {},
    };
    g.kill = (id) => {
        const e = g.enemies.find(x => x.id === id);
        assert.ok(e, `${id} is in ${g._mapUrl}`);
        e.entity.hp = 0; e.entity.alive = false;
        g._handleEnemyDeath(e);
        return e;
    };
    return g;
}

describe('killing a vendor loots its whole till (the bug, pinned)', () => {
    let g;
    beforeEach(async () => { g = game(); await g._loadMap('sewer-map.json'); });

    test('Carrion, the sewer vendor, carries the 9999 GP till as her wallet', () => {
        const carrion = g.enemies.find(e => e.id === 'carrion');
        assert.ok(carrion?.vendor, 'Carrion is a vendor in the sewer');
        assert.equal(carrion.gold, 9999);
    });

    test('her death pays the player all 9999 GP', () => {
        g.kill('carrion');
        assert.equal(g.gold, 9999);
        assert.ok(g.logs.includes('Looted 9999 GP.'), `log: ${JSON.stringify(g.logs)}`);
    });

    test('with a delivery cap worn it pays 14999 GP', () => {
        g.equipment = { top: ITEMS.delivery_cap_grey };
        g.kill('carrion');
        assert.equal(g.gold, 14999);
    });

    test('a rat\'s death in the same sewer pays only its few GP, for scale', () => {
        const rat = g.enemies.find(e => !e.vendor && e.gold > 0 && e.gold < 100);
        assert.ok(rat, 'the sewer has an ordinary enemy with a small purse');
        const purse = rat.gold;
        g.kill(rat.id);
        assert.equal(g.gold, purse);
    });
});

// One `gold` field is both the till and the wallet, so it is wrong in both
// directions: a vendor who never fights carries the 9999 till on its person,
// and a vendor who fights (damage > 0) gets the role-default kit from
// spawnEnemy instead, so its till is that kit's few GP.
describe('a vendor\'s till and its wallet are the same field', () => {
    const vendors = [];
    for (const url of ['sewer-map.json', 'canyon-map.json', 'factory-map.json', 'downtown-map.json', 'town-map.json']) {
        for (const s of mapJson(url).enemies ?? []) if (s.vendor) vendors.push([url, s]);
    }
    for (const s of NIGHT_SPAWNS) if (s.vendor) vendors.push([s.map, s]);
    const fights = (s) => (s.damage ?? 0) > 0 && !s.ambient;

    test('the maps and the Night seller name at least the eight known vendors', () => {
        assert.ok(vendors.length >= 8, `found ${vendors.length}`);
    });

    for (const [url, s] of vendors.filter(([, s]) => !fights(s))) {
        test(`${s.id} (${url}) never fights and carries the 9999 GP till`, () => {
            assert.equal(spawnEnemy(s, new Set()).gold, 9999);
        });
    }

    test('Pike and Puck fight, so their till is the role-default purse', () => {
        const fighting = vendors.filter(([, s]) => fights(s)).map(([, s]) => [s.id, spawnEnemy(s, new Set()).gold]);
        assert.deepEqual(Object.fromEntries(fighting), { pike: 30, puck: 3 });
    });
});

describe('a vendor turned hostile buys heals from its till', () => {
    test('at 40 HP, a 9999 GP wallet buys a 60 HP heal, and can do so over a hundred times', () => {
        const buy = healPurchase(40, 100, 9999);
        assert.deepEqual(buy, { spend: 60, heal: 60 });
        assert.ok(Math.floor(9999 / buy.spend) > 100);
    });
});
