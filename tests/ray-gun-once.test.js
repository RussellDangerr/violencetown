// ray-gun-once.test.js - the Alien hands over the Ray Gun once (plans/fx30-ray-gun-once.md).
//
// Runs the REAL main.js death path (_handleEnemyDeath, _takeKillLoot, _addToInventory,
// _loadMap and their helpers) lifted onto a stand-in game, against the real Factory map,
// the way auto-loot.test.js does.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    recordKill, stepRespawns, deadIds, bossDropOnce, recordDrop, pendingDrops, takeDrop, dropLoadout,
} from '../game/drops.js';
import { GameMap } from '../game/map.js';
import { spawnEnemy } from '../game/enemies.js';
import { resolveSpawn, defaultPicks, requiredDropFor, dropLineFor } from '../game/slots.js';
import { transferGold } from '../game/trade.js';
import { ITEMS, hasItemDef } from '../game/items.js';
import { WEAPONS } from '../game/weapons.js';
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

const FACTORY = 'factory-map.json';
const MAPS = {};
const mapJson = (url) => (MAPS[url] ||= JSON.parse(readFileSync(new URL(`../game/${url}`, import.meta.url), 'utf8')));
const free = {
    loadMap: async (url) => new GameMap(mapJson(url), url),
    document: { getElementById: () => null }, audio: { playSfx() {}, playMusic() {} },
    spawnEnemy, resolveSpawn, deadIds, pendingDrops, recordDrop, takeDrop, recordKill, stepRespawns, bossDropOnce,
    transferGold, dropLoadout, requiredDropFor, dropLineFor, ITEMS, hasItemDef, onSewerEnemyKilled() {},
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
    _takeDropRecord: liveMethod('    _takeDropRecord(', free),
    // main.js's one-line lens: hasItem(pred) { return hasItemDef(this, pred); }
    hasItem(pred) { return hasItemDef(this, pred); },
};
M._alreadyHasRayGun = liveMethod('    _alreadyHasRayGun(', free);

function game() {
    const g = {
        ...M,
        slots: defaultPicks(), map: null, _mapUrl: null, enemies: [], groundItems: [], logs: [], events: [],
        inventory: new Array(INVENTORY_SIZE).fill(null), equipment: {}, tempEquips: [], bursts: [],
        _collectedItems: new Set(), _droppedItems: {}, _muggedIds: new Set(), _robbed: {},
        _respawnLists: {}, _bossDropsGiven: new Set(), _pendingFollowers: null, gold: 0,
        renderer: { dropFightFog() {} }, questEngine: null,
        _endBuybacks() {}, _advanceDayClock() {}, _openBridgeIfCarFixed() {}, _render() {},
        _resolveItemDef: (id) => ITEMS[id] || WEAPONS[id] || null,
        _log(m) { this.logs.push(m); }, _spawnEventWord() {}, _grantItem() {},
        emitGameEvent(type, data) { this.events.push({ ...data, event: type }); },
        _saveMoment() {},
        _startLootBurst(x, y, defs) { this.bursts.push(defs.map(d => d.id)); },
    };
    g.killAlien = () => {
        const e = g.enemies.find(x => x.boss);
        assert.ok(e && e.loadout.includes('ray_gun'), 'the Alien is here, gun in his kit');
        e.entity.hp = 0; e.entity.alive = false;
        g._handleEnemyDeath(e);
    };
    g.bag = () => g.inventory.filter(Boolean).flatMap(s => Array(s.count).fill(s.itemDef.id));
    g.guns = () => [
        ...g.bag().filter(id => id === 'ray_gun'),
        ...g.groundItems.filter(i => i.type === 'ray_gun').map(() => 'ray_gun'),
        ...Object.values(g.equipment).filter(d => d && d.id === 'ray_gun').map(() => 'ray_gun'),
    ];
    return g;
}

// The key the old floor gun left in a save's collectedItems.
const OLD_FLOOR_KEY = `${FACTORY}|3|2|ray_gun`;

describe('the Alien hands over the Ray Gun once', () => {
    let g;
    beforeEach(async () => { g = game(); await g._loadMap(FACTORY); });

    test('a fresh game still gets the Ray Gun from him', () => {
        g.killAlien();
        assert.deepEqual(g.guns(), ['ray_gun']);
        assert.ok(g.bursts.flat().includes('ray_gun'));
    });

    test('a save that took the old floor gun gets no second one', () => {
        g._collectedItems.add(OLD_FLOOR_KEY);
        g.killAlien();
        assert.deepEqual(g.guns(), []);
        assert.ok(!g.bursts.flat().includes('ray_gun'));
        assert.ok(!g.logs.includes('[Picked up [Ray Gun]]'));
    });

    test('a Ray Gun in the bag means no second one', () => {
        g._addToInventory(WEAPONS.ray_gun);
        g.killAlien();
        assert.deepEqual(g.guns(), ['ray_gun'], 'still just the one');
    });

    test('a Ray Gun already equipped means no second one', () => {
        g.equipment.weapon = WEAPONS.ray_gun;
        g.killAlien();
        assert.deepEqual(g.guns(), ['ray_gun'], 'still just the one, in his hand');
    });

    test('the rest of his kit still drops', () => {
        const rest = g.enemies.find(x => x.boss).loadout.filter(id => id !== 'ray_gun');
        assert.ok(rest.length > 0, 'his kit holds more than the gun');
        g._collectedItems.add(OLD_FLOOR_KEY);
        g.killAlien();
        const bag = g.bag();
        for (const id of rest) assert.ok(bag.includes(id), `${id} still dropped`);
    });

    test('a gun key from another zone does not count', () => {
        g._collectedItems.add('town-map.json|3|2|ray_gun');
        g.killAlien();
        assert.deepEqual(g.guns(), ['ray_gun']);
    });
});
