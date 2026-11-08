// act2-quests-live.test.js — the real main.js pieces behind the Act 2 quests (plans/ab3-act2-quests.md):
// the death handler's required-drop block run against a fallen boss, and the examine panel's
// title for each claim spot.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { GameMap } from '../game/map.js';
import { spawnEnemy } from '../game/enemies.js';
import { resolveSpawn, defaultPicks, requiredDropFor, dropLineFor } from '../game/slots.js';
import { dropLoadout, deadIds, pendingDrops, recordDrop, takeDrop, recordKill, stepRespawns, bossDropOnce } from '../game/drops.js';
import { transferGold } from '../game/trade.js';
import { ITEMS } from '../game/items.js';
import { addToInventory as addToInv } from '../game/inventory.js';
import { INVENTORY_SIZE, SAFE_SLOTS, PACK_PAGE, MAX_STACK } from '../game/data.js';
import { QuestEngine, ACT2_QUESTS } from '../game/quests.js';
import { resolveExamine } from '../game/examine.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const mainSrc = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
function liveMethod(signature, freeVars) {
    const at = mainSrc.indexOf(signature, mainSrc.indexOf('class Game {'));
    assert.ok(at > 0, `${signature} not found in main.js`);
    const body = mainSrc.slice(at + signature.indexOf('('), mainSrc.indexOf('\n    }', at) + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
}
const mapJson = (url) => JSON.parse(readFileSync(new URL(`../game/${url}`, import.meta.url), 'utf8'));

const free = {
    resolveSpawn, deadIds, pendingDrops, recordDrop, takeDrop, recordKill, stepRespawns, bossDropOnce,
    transferGold, dropLoadout, requiredDropFor, dropLineFor, ITEMS, onSewerEnemyKilled() {},
    addToInv, SAFE_SLOTS, PACK_PAGE, MAX_STACK, spawnEnemy, audio: { playSfx() {}, playMusic() {} },
};
const M = {
    _handleEnemyDeath: liveMethod('    _handleEnemyDeath(', free),
    _takeKillLoot: liveMethod('    _takeKillLoot(', free),
    _addToInventory: liveMethod('    _addToInventory(', free),
    _rememberKill: liveMethod('    _rememberKill(', free),
    _bossFirstFall: liveMethod('    _bossFirstFall(', free),
    _recordDrop: liveMethod('    _recordDrop(', free),
};

// A stand-in game standing in `url` with the zone's boss dead; the real handler then runs on it.
function fall(url, zoneName) {
    const data = mapJson(url);
    const map = new GameMap(data, url);
    const g = {
        ...M, slots: defaultPicks(), map, _mapUrl: url, enemies: [], groundItems: [], logs: [], turn: 0,
        inventory: new Array(INVENTORY_SIZE).fill(null), bursts: [],
        _collectedItems: new Set(), _droppedItems: {}, _muggedIds: new Set(), _robbed: {},
        _respawnLists: {}, _bossDropsGiven: new Set(), gold: 0,
        renderer: { dropFightFog() {} }, _render() {}, _saveMoment() {}, _spawnEventWord() {},
        _resolveItemDef: (id) => ITEMS[id] || null,
        _log(m) { this.logs.push(m); },
        _grantItem(id) { return addToInv(this.inventory, ITEMS[id], 1) !== false; },
        _startLootBurst() {}, emitGameEvent() {},
    };
    g.map.zoneName = zoneName;
    g.questEngine = new QuestEngine(g);
    g.questEngine.emit('map_entered', { map: url });
    const spawn = data.enemies.find(e => e.slot);
    const boss = spawnEnemy(resolveSpawn(spawn, defaultPicks()));
    boss.entity.hp = 0; boss.entity.alive = false;
    g.enemies = [boss];
    g.boss = boss;
    g.bag = () => g.inventory.filter(Boolean).map(s => s.itemDef.id);
    return g;
}

describe('the death handler hands an Act 2 boss\'s item to the quest', () => {
    for (const [zone, q] of Object.entries(ACT2_QUESTS)) {
        test(`${zone}: the fall moves the quest to its last step and drops nothing`, () => {
            const g = fall(q.map, zone);
            const item = requiredDropFor(g.boss, g.map.enemySpawns);
            assert.ok(item && ITEMS[item], 'the slot names an item');
            assert.equal(g.questEngine.act2Step(zone), 'boss');
            g._handleEnemyDeath(g.boss);
            assert.equal(g.questEngine.act2Step(zone), 'collect');
            assert.ok(!g.bag().includes(item), 'the item is not in the bag yet');
            assert.deepEqual(g.groundItems.filter(i => i.type === item), [], 'and not on the floor');
            assert.deepEqual(g._droppedItems, {}, 'no ground drop is recorded');
            assert.ok(!g.logs.includes(dropLineFor(g.boss, g.map.enemySpawns)), 'no drop line is told');
        });
    }

    test('a boss outside the quests still drops its item (the Sewer\'s boss)', () => {
        const g = fall('sewer-map.json', 'SEWER');
        const item = requiredDropFor(g.boss, g.map.enemySpawns);
        assert.equal(item, 'catalytic_converter');
        g._handleEnemyDeath(g.boss);
        assert.ok(g.bag().includes(item), 'the converter reaches the bag');
        assert.ok(g.logs.includes(dropLineFor(g.boss, g.map.enemySpawns)));
    });
});

describe('the examine panel names each claim spot without its id', () => {
    for (const [zone, q] of Object.entries(ACT2_QUESTS)) {
        test(`${zone}: the panel title is a placeholder, not the id`, () => {
            const map = new GameMap(mapJson(q.map), q.map);
            const g = { examinables: map.examinableSpawns.map(e => ({ ...e })), enemies: [], containers: [], groundItems: [], map };
            const spot = g.examinables.find(e => e.id === q.claimId);
            const r = resolveExamine(g, spot.x, spot.y);
            assert.equal(r.instanceId, q.claimId);
            assert.ok(!/act2|-/.test(r.title), `"${r.title}" still reads like an id`);
            assert.match(r.title, /^\[TEXT\]/);
        });
    }
});
