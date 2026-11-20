// mk2-delivery-cap-sources.test.js — each delivery cap has exactly one source
// (plans/mk2-delivery-cap-sources.md). Grey lies on the Diner floor; blue is the Newsstand Kid's.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GameMap } from '../game/map.js';
import { ITEMS } from '../game/items.js';
import { addToInventory as addToInv } from '../game/inventory.js';
import { INVENTORY_SIZE, SAFE_SLOTS, PACK_PAGE, MAX_STACK } from '../game/data.js';
import { buyPrice, transferGold, carriedGold } from '../game/trade.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const dir = fileURLToPath(new URL('../game/', import.meta.url));
const mapJson = (f) => JSON.parse(readFileSync(dir + f, 'utf8'));
const mapFiles = readdirSync(dir).filter(f => f.endsWith('-map.json'));
const mainSrc = readFileSync(dir + 'main.js', 'utf8');

function liveMethod(signature) {
    const at = mainSrc.indexOf(signature, mainSrc.indexOf('class Game {'));
    assert.ok(at > 0, `${signature} not found in main.js`);
    const body = mainSrc.slice(at + signature.indexOf('('), mainSrc.indexOf('\n    }', at) + '\n    }'.length);
    return new Function('addToInv', 'SAFE_SLOTS', 'PACK_PAGE', 'MAX_STACK', 'audio',
        `'use strict'; return function ${body}`)(addToInv, SAFE_SLOTS, PACK_PAGE, MAX_STACK, { playSfx() {} });
}

// Every place a cap id appears as a floor item, a shelf row, a container's contents or a grant.
function sourcesOf(id) {
    const found = [];
    for (const f of mapFiles) {
        const m = mapJson(f);
        for (const it of m.items || []) if (it.type === id) found.push(`${f} floor`);
        for (const e of m.enemies || []) if ((e.stock || []).includes(id)) found.push(`${f} shop ${e.id}`);
        for (const c of m.containers || []) if ((c.contents || []).some(x => (x.type || x) === id)) found.push(`${f} container`);
        for (const x of m.examinables || []) if (x.grants === id) found.push(`${f} grants`);
    }
    return found;
}

describe('one source for each cap', () => {
    test('grey: the Diner floor, and nowhere else', () => {
        assert.deepEqual(sourcesOf('delivery_cap_grey'), ['diner-map.json floor']);
    });
    test('blue: the Newsstand Kid, and nowhere else', () => {
        assert.deepEqual(sourcesOf('delivery_cap_blue'), ['downtown-map.json shop dt-merch2']);
    });
});

describe('the blue cap on the Newsstand Kid shelf', () => {
    const kid = mapJson('downtown-map.json').enemies.find(e => e.id === 'dt-merch2');

    test('it is listed beside his bandage', () => {
        assert.deepEqual(kid.stock, ['bandage', 'delivery_cap_blue']);
    });
    test('at his neutral mood it costs 16 GP', () => {
        assert.equal(buyPrice(ITEMS.delivery_cap_blue, kid.disposition), 16);
    });
});

describe('the grey cap on the Diner floor', () => {
    const json = mapJson('diner-map.json');
    const spawn = json.items.find(i => i.type === 'delivery_cap_grey');

    test('it can be walked to from where you enter', () => {
        const map = new GameMap(json, 'diner-map.json');
        const seen = new Set([`${map.spawn.x},${map.spawn.y}`]);
        const todo = [[map.spawn.x, map.spawn.y]];
        while (todo.length) {
            const [x, y] = todo.pop();
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const k = `${x + dx},${y + dy}`;
                if (!seen.has(k) && map.isWalkable(x + dx, y + dy)) { seen.add(k); todo.push([x + dx, y + dy]); }
            }
        }
        assert.ok(seen.size > 10, 'the walk found a floor');
        assert.ok(seen.has(`${spawn.x},${spawn.y}`), 'the cap tile is on that floor');
    });

    test('taking it puts one in the bag, once, and the record keeps it gone', () => {
        const g = {
            inventory: new Array(INVENTORY_SIZE).fill(null), logs: [], _mapUrl: 'diner-map.json',
            _collectedItems: new Set(), playerX: spawn.x, playerY: spawn.y, saves: 0,
            groundItems: [{ type: spawn.type, x: spawn.x, y: spawn.y, def: ITEMS.delivery_cap_grey }],
            _log(m) { this.logs.push(m); }, emitGameEvent() {}, _saveMoment() { this.saves++; },
            _takeDropRecord: () => false,
        };
        g._addToInventory = liveMethod('    _addToInventory(');
        g._tryPickup = liveMethod('    _tryPickup(');
        g._tryPickup();
        g._tryPickup();
        const held = g.inventory.filter(Boolean).filter(s => s.itemDef.id === 'delivery_cap_grey');
        assert.equal(held.reduce((n, s) => n + s.count, 0), 1);
        assert.equal(g.groundItems.length, 0);
        assert.equal(g.saves, 1, 'a save moment was asked for');
        // The zone load skips a spawn whose key is recorded (main.js _loadMap).
        assert.ok(g._collectedItems.has(`diner-map.json|${spawn.x}|${spawn.y}|${spawn.type}`));
        assert.match(mainSrc, /_collectedItems\.has\(`\$\{url\}\|\$\{s\.x\}\|\$\{s\.y\}\|\$\{s\.type\}`\)\) continue/);
    });
});

describe('the cap\'s purse perk', () => {
    const loot = (equipment) => {
        const foe = { gold: 8 }, you = { gold: 0, equipment };
        assert.ok(transferGold(foe, you, 8, 'loot'));
        return you.gold;
    };
    test('worn, a looted purse is half as big again; unworn, unchanged', () => {
        assert.equal(loot({ top: ITEMS.delivery_cap_grey }), 12);
        assert.equal(loot({ top: ITEMS.delivery_cap_blue }), 12);
        assert.equal(loot({}), 8);
        assert.equal(carriedGold(8, {}), 8);
    });
});
