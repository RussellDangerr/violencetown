// two-hander-in-world.test.js - the Great Sword is in the world and wielding it fills both hands
// (plans/gw1-great-sword-factory-boss.md; GW1R1 a, GW1R2 a, GW1R3 b).
//
// Real input end to end: the Factory's boss falls through main.js's real death path (the loot
// flies to the bag), then the GEAR tab is driven through _tapDevice / _deviceKey, the entry
// points a tap and a key press reach. main.js touches `document` at import, so the live methods
// are lifted from its source, the way ray-gun-once.test.js and left-hand-plate.test.js do.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    recordKill, stepRespawns, deadIds, bossDropOnce, recordDrop, pendingDrops, takeDrop, dropLoadout,
} from '../game/drops.js';
import { GameMap } from '../game/map.js';
import { spawnEnemy } from '../game/enemies.js';
import { resolveSpawn, defaultPicks, requiredDropFor, dropLineFor, ENTRIES, SLOTS } from '../game/slots.js';
import { transferGold } from '../game/trade.js';
import { ITEMS, hasItemDef, resolveUse, gearOptions } from '../game/items.js';
import { WEAPONS, WEAPON_CLASSES, weaponClassOf } from '../game/weapons.js';
import { ITEM_SPRITES } from '../game/sprites.js';
import {
    addToInventory as addToInv, moveToZone, zoneOf, pageCount, slotOnPage, pageOfSlot,
} from '../game/inventory.js';
import { INVENTORY_SIZE, SAFE_SLOTS, PACK_PAGE, MAX_STACK } from '../game/data.js';
import { itemActions, equipOptions } from '../game/inspector.js';
import { slotRing, unslotRing } from '../game/rings.js';
import {
    HIT_SLOP, DEVICE_TABS, deviceTabRect, cycleDeviceTab, deviceBodyRect, deviceBagSlotRects,
    deviceBagPagerRects, deviceEquipLayout, deviceRingsLayout, inspectorActionRects, gearOptionRects,
    nearestRectInDir,
} from '../game/layout.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const mainSrc = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
function liveMethod(signature, freeVars, { async = false } = {}) {
    const at = mainSrc.indexOf(signature, mainSrc.indexOf('class Game {'));
    assert.ok(at > 0, `${signature} not found in main.js`);
    const body = mainSrc.slice(at + signature.indexOf('('), mainSrc.indexOf('\n    }', at) + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return ${async ? 'async ' : ''}function ${body}`)(...names.map(n => freeVars[n]));
}
function liveConst(name) {
    const m = new RegExp(`\\nconst ${name}\\s*=\\s*`).exec(mainSrc);
    assert.ok(m, `const ${name} not found in main.js`);
    const from = m.index + m[0].length;
    return new Function(`'use strict'; return ${mainSrc.slice(from, mainSrc.indexOf('\n};', from) + 2)}`)();
}

const STATE = liveConst('STATE');
const DIRS = liveConst('DIRS');
const FACTORY = 'factory-map.json';
const MAPS = {};
const mapJson = (url) => (MAPS[url] ||= JSON.parse(readFileSync(new URL(`../game/${url}`, import.meta.url), 'utf8')));
const free = {
    loadMap: async (url) => new GameMap(mapJson(url), url),
    document: { getElementById: () => null }, audio: { playSfx() {}, playMusic() {} },
    spawnEnemy, resolveSpawn, deadIds, pendingDrops, recordDrop, takeDrop, recordKill, stepRespawns, bossDropOnce,
    transferGold, dropLoadout, requiredDropFor, dropLineFor, ITEMS, hasItemDef, onSewerEnemyKilled() {},
    addToInv, SAFE_SLOTS, PACK_PAGE, MAX_STACK,
    STATE, DIRS, HIT_SLOP, DEVICE_TABS, deviceTabRect, cycleDeviceTab, deviceBodyRect, deviceBagSlotRects,
    deviceEquipLayout, deviceRingsLayout, inspectorActionRects, gearOptionRects, nearestRectInDir,
    itemActions, equipOptions, zoneOf, moveToZone, INVENTORY_SIZE, pageCount, slotOnPage, pageOfSlot,
    deviceBagPagerRects, resolveUse, slotRing, unslotRing, weaponClassOf,
    unequipItem: (g, slot) => (g.equipment[slot] ? (g._addToInventory(g.equipment[slot]), g.equipment[slot] = null) : null),
};
const LIVE = {
    _loadMap: liveMethod('    async _loadMap(', free, { async: true }),
    _handleEnemyDeath: liveMethod('    _handleEnemyDeath(', free),
    _takeKillLoot: liveMethod('    _takeKillLoot(', free),
    _addToInventory: liveMethod('    _addToInventory(', free),
    _rememberKill: liveMethod('    _rememberKill(', free),
    _bossFirstFall: liveMethod('    _bossFirstFall(', free),
    _recordDrop: liveMethod('    _recordDrop(', free),
    _takeDropRecord: liveMethod('    _takeDropRecord(', free),
    _tapDevice: liveMethod('    _tapDevice(', free),
    _deviceActivate: liveMethod('    _deviceActivate(', free),
    _deviceTargets: liveMethod('    _deviceTargets(', free),
    _deviceFocus: liveMethod('    _deviceFocus(', free),
    _deviceKey: liveMethod('    _deviceKey(', free),
    _pointInRect: liveMethod('    _pointInRect(', free),
    _removeFromSlot: liveMethod('    _removeFromSlot(', free),
    hasItem(pred) { return hasItemDef(this, pred); },
};
const handsBody = /_handsOf\(def\) \{ (return [^\n]*?;) \}/.exec(mainSrc);
assert.ok(handsBody, '_handsOf not found in main.js');
LIVE._handsOf = new Function('weaponClassOf', `return function (def) { ${handsBody[1]} }`)(weaponClassOf);

function game() {
    const g = {
        ...LIVE,
        slots: defaultPicks(), map: null, _mapUrl: null, enemies: [], groundItems: [], logs: [], events: [],
        inventory: new Array(INVENTORY_SIZE).fill(null),
        equipment: { weapon: WEAPONS.wooden_sword, left: null, top: null, bottom: null, front: null, back: null, sides: null },
        tempEquips: [], bursts: [], ownedRings: new Set(), ringSlots: {},
        state: STATE.DEVICE, _deviceTab: 'gear', _deviceSel: null,
        _collectedItems: new Set(), _droppedItems: {}, _muggedIds: new Set(), _robbed: {},
        _respawnLists: {}, _bossDropsGiven: new Set(), _pendingFollowers: null, gold: 0,
        renderer: { dropFightFog() {} }, questEngine: null,
        _endBuybacks() {}, _advanceDayClock() {}, _openBridgeIfCarFixed() {}, _render() {}, _advanceWorld() {},
        _refreshGrantedSkills() {}, _saveMoment() {},
        _resolveItemDef: (id) => ITEMS[id] || WEAPONS[id] || null,
        _log(m) { this.logs.push(m); }, _spawnEventWord() {}, _grantItem() {},
        emitGameEvent(type, data) { this.events.push({ ...data, event: type }); },
        _startLootBurst(x, y, defs) { this.bursts.push(defs.map(d => d.id)); },
    };
    g.killAlien = () => {
        const e = g.enemies.find(x => x.boss);
        assert.ok(e, 'the Factory boss is here');
        e.entity.hp = 0; e.entity.alive = false;
        g._handleEnemyDeath(e);
    };
    g.bagIds = () => g.inventory.filter(Boolean).flatMap(s => Array(s.count).fill(s.itemDef.id));
    return g;
}

const body = deviceBodyRect();
const centre = r => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const layout = deviceEquipLayout(body);
const tap = (g, r) => g._tapDevice(centre(r));

describe('the Great Sword in the world', () => {
    test('it is a two-handed sword-class weapon at the ruled 20, under the Ray Gun and over the 16s', () => {
        const w = WEAPONS.great_sword;
        assert.ok(w, 'WEAPONS holds it');
        assert.equal(w.damage, 20);
        assert.equal(w.weaponClass, 'great_sword');
        assert.equal(WEAPON_CLASSES.great_sword.hands, 2);
        assert.deepEqual([...WEAPON_CLASSES.great_sword.attackKinds], ['slash', 'stab']);
        assert.ok(w.damage < WEAPONS.ray_gun.damage && w.damage > WEAPONS.gator_tail.damage);
        assert.match(w.name, /^\[.*\]$/, 'a bracket placeholder name');
        assert.ok(ITEM_SPRITES.great_sword, 'it has a picture');
    });

    test('the Factory boss carries it in his kit and swings it, and no other boss does', () => {
        assert.ok(SLOTS['factory.boss'].pool.some(p => p.entry === 'alien_invasion'));
        const e = spawnEnemy({ ...ENTRIES.alien_invasion, id: 'a', x: 1, y: 1 });
        assert.ok(e.loadout.includes('great_sword'));
        assert.ok(e.equipped.includes('great_sword'));
        for (const [id, entry] of Object.entries(ENTRIES)) {
            if (id === 'alien_invasion') continue;
            assert.ok(!(entry.loadout || []).includes('great_sword'), `${id} must not carry it`);
            assert.ok(!(entry.equipped || []).includes('great_sword'), `${id} must not swing it`);
        }
    });
});

describe('from his fall to both hands, by real input', () => {
    let g;
    beforeEach(async () => { g = game(); await g._loadMap(FACTORY); });

    test('winning at the Factory puts the Great Sword in your bag', () => {
        assert.ok(!g.bagIds().includes('great_sword'));
        g.killAlien();
        assert.ok(g.bagIds().includes('great_sword') || g.groundItems.some(i => i.type === 'great_sword'),
            'it drops when he falls');
        assert.ok(g.bursts.flat().includes('great_sword'));
    });

    test('a tap on the left-hand plate, then on its row, wields it in both hands', () => {
        g.killAlien();
        assert.ok(g.bagIds().includes('great_sword'));
        tap(g, layout.leftHand);
        assert.ok(g._deviceSel.open && g._deviceSel.slotKey === 'left');
        const rows = gearOptions(g, 'left');
        const at = rows.findIndex(o => o.id === 'great_sword');
        assert.ok(at >= 0, 'the chooser lists it');
        tap(g, gearOptionRects(body, rows.length)[at]);
        assert.equal(g.equipment.weapon, WEAPONS.great_sword, 'the right hand holds it');
        assert.equal(g.equipment.left, WEAPONS.great_sword, 'and so does the left');
        assert.equal(g.equipment.weapon, g.equipment.left, 'one def, in both');
        assert.deepEqual(g.bagIds().filter(id => id === 'great_sword'), [], 'it left the bag');
        assert.ok(g.bagIds().includes('wooden_sword'), 'the Wooden Sword it pushed out is in the bag');
    });

    test('the keyboard does the same: Enter on the plate, Enter on the row', () => {
        g.killAlien();
        g._deviceSel = { tab: 'gear', slotKey: 'left' };
        g._deviceKey('Enter');
        const rows = gearOptions(g, 'left');
        g._deviceSel.option = rows.findIndex(o => o.id === 'great_sword');
        assert.ok(g._deviceSel.option >= 0);
        g._deviceKey('Enter');
        assert.equal(g.equipment.weapon, WEAPONS.great_sword);
        assert.equal(g.equipment.left, WEAPONS.great_sword);
    });

    test('wielding a one-hander afterwards frees both hands', () => {
        g.killAlien();
        tap(g, layout.leftHand);
        const rows = gearOptions(g, 'left');
        tap(g, gearOptionRects(body, rows.length)[rows.findIndex(o => o.id === 'great_sword')]);
        assert.equal(g.equipment.left, WEAPONS.great_sword);

        // The left plate now lists only one-handers (no Bare row on half a two-hander); pick the sword.
        tap(g, layout.leftHand);
        const rows2 = gearOptions(g, 'left');
        const at = rows2.findIndex(o => o.id === 'wooden_sword');
        assert.ok(at >= 0, 'the Wooden Sword is offered');
        tap(g, gearOptionRects(body, rows2.length)[at]);
        assert.equal(g.equipment.left, WEAPONS.wooden_sword, 'the one-hander is in the hand you chose');
        assert.equal(g.equipment.weapon, null, 'the other hand is free');
        assert.notEqual(g.equipment.weapon, WEAPONS.great_sword);
        assert.notEqual(g.equipment.left, WEAPONS.great_sword);
        assert.equal(g.bagIds().filter(id => id === 'great_sword').length, 1, 'the Great Sword is back in the bag, once');
    });
});
