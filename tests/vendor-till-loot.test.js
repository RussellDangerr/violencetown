// vendor-till-loot.test.js — killing a vendor loots its purse, never its till
// (plans/vendor-till-loot.md, ruled option A).
//
// A vendor's till is the shop's money, kept in `till`; `gold` is the purse it
// carries. _handleEnemyDeath loots `gold` (Law 6, unchanged), so the till stays
// out of reach. Before the split one field was both, and Carrion's death paid 9999.
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
import { spawnEnemy, Enemy, VENDOR_WALLET, TOWNSFOLK_PURSE_MIN, TOWNSFOLK_PURSE_MAX } from '../game/enemies.js';
import { resolveSpawn, defaultPicks, requiredDropFor, dropLineFor } from '../game/slots.js';
import { transferGold, tradeHolder, NIGHT_SPAWNS } from '../game/trade.js';
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

const inPurseRange = (n) => n >= TOWNSFOLK_PURSE_MIN && n <= TOWNSFOLK_PURSE_MAX;

describe('killing a vendor loots her purse, not the till', () => {
    let g;
    beforeEach(async () => { g = game(); await g._loadMap('sewer-map.json'); });

    test('Carrion has the 9999 GP till apart from the purse she carries', () => {
        const carrion = g.enemies.find(e => e.id === 'carrion');
        assert.ok(carrion?.vendor, 'Carrion is a vendor in the sewer');
        assert.equal(carrion.till, VENDOR_WALLET);
        assert.ok(inPurseRange(carrion.gold), `purse ${carrion.gold}`);
    });

    test('her death pays the player only her purse', () => {
        const purse = g.enemies.find(e => e.id === 'carrion').gold;
        const carrion = g.kill('carrion');
        assert.equal(g.gold, purse);
        assert.ok(g.logs.includes(`Looted ${purse} GP.`), `log: ${JSON.stringify(g.logs)}`);
        assert.equal(carrion.till, VENDOR_WALLET, 'the till stays with the shop');
    });

    test('a delivery cap raises the purse by half, and still never reaches the till', () => {
        const purse = g.enemies.find(e => e.id === 'carrion').gold;
        g.equipment = { top: ITEMS.delivery_cap_grey };
        g.kill('carrion');
        assert.equal(g.gold, Math.ceil(purse * 1.5));
    });

    test('a rat\'s death in the same sewer still pays its purse, as Law 6 says', () => {
        const rat = g.enemies.find(e => !e.vendor && e.gold > 0 && e.gold < 100);
        assert.ok(rat, 'the sewer has an ordinary enemy with a small purse');
        const purse = rat.gold;
        g.kill(rat.id);
        assert.equal(g.gold, purse);
    });

    test('a vendor struck into a fight has only her purse to buy heals with, which is not enough', () => {
        const carrion = g.enemies.find(e => e.id === 'carrion');
        assert.equal(healPurchase(40, 100, carrion.gold), null);
    });
});

describe('every vendor has the till, and carries a purse or its kit', () => {
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
        test(`${s.id} (${url}) has the 9999 GP till and a townsperson's purse`, () => {
            const e = spawnEnemy(s, new Set());
            assert.equal(e.till, VENDOR_WALLET);
            assert.ok(inPurseRange(e.gold), `purse ${e.gold}`);
        });
    }

    test('Pike and Puck fight, so they carry their kit, and their till is the full one', () => {
        const fighting = vendors.filter(([, s]) => fights(s)).map(([, s]) => spawnEnemy(s, new Set()));
        assert.deepEqual(Object.fromEntries(fighting.map(e => [e.id, [e.gold, e.till]])),
            { pike: [30, VENDOR_WALLET], puck: [3, VENDOR_WALLET] });
    });

    test('a mugged vendor comes back with an empty purse and the till untouched (Law 6d)', () => {
        const carrion = mapJson('sewer-map.json').enemies.find(s => s.id === 'carrion');
        const e = spawnEnemy(carrion, new Set(['carrion']));
        assert.equal(e.gold, 0);
        assert.equal(e.till, VENDOR_WALLET);
    });
});

describe('trade pays into and out of the till', () => {
    const carrion = () => spawnEnemy(mapJson('sewer-map.json').enemies.find(s => s.id === 'carrion'), new Set());

    test('selling to a vendor is paid from the till, and buying pays into it', () => {
        const v = carrion(), player = { gold: 100 }, purse = v.gold;
        assert.ok(transferGold(tradeHolder(v), player, 40, 'offer'));
        assert.equal(v.till, VENDOR_WALLET - 40);
        assert.equal(player.gold, 140);
        assert.ok(transferGold(player, tradeHolder(v), 25, 'offer'));
        assert.equal(v.till, VENDOR_WALLET - 15);
        assert.equal(v.gold, purse, 'the purse is never touched by a trade');
    });

    test('a till cannot pay more than it holds', () => {
        const v = carrion(), player = { gold: 0 };
        v.till = 10;
        assert.equal(transferGold(tradeHolder(v), player, 11, 'offer'), false);
        assert.equal(v.till, 10);
    });

    test('anyone who is not a vendor trades from the purse they carry', () => {
        const npc = { gold: 50 };
        assert.equal(tradeHolder(npc), npc);
        const struck = carrion();
        struck.vendor = false;   // a vendor you struck won't keep shop (_onEntityHarmed)
        assert.equal(tradeHolder(struck), struck);
    });

    test('a chest\'s shim is vendor:true with no till, and reads as zero', () => {
        assert.equal(tradeHolder({ vendor: true, _container: {} }).gold, 0);
    });
});

describe('the till survives a save', () => {
    const carrionSpawn = () => mapJson('sewer-map.json').enemies.find(s => s.id === 'carrion');

    test('till and purse round-trip apart', () => {
        const e = spawnEnemy(carrionSpawn(), new Set());
        e.till = 9000; e.gold = 4;
        const back = Enemy.fromSave(JSON.parse(JSON.stringify(e.toSave())));
        assert.equal(back.till, 9000);
        assert.equal(back.gold, 4);
    });

    test('an old save that kept the till in gold loads with the till restored and an empty purse', () => {
        const old = spawnEnemy(carrionSpawn(), new Set()).toSave();
        delete old.till; old.gold = 9950;
        const back = Enemy.fromSave(old);
        assert.equal(back.till, VENDOR_WALLET);
        assert.equal(back.gold, 0);
    });

    test('an old save of a struck vendor (no longer a vendor, still holding 9999) loads broke', () => {
        const old = spawnEnemy(carrionSpawn(), new Set()).toSave();
        delete old.till; old.gold = 9999; old.vendor = false; old.stock = null;
        const back = Enemy.fromSave(old);
        assert.equal(back.gold, 0);
        assert.equal(back.till, 0);
    });

    test('an ordinary enemy\'s old save is untouched by the migration', () => {
        const back = Enemy.fromSave({ id: 'x', type: 'Rat', hp: 100, gold: 12 });
        assert.equal(back.gold, 12);
        assert.equal(back.till, 0);
    });
});
