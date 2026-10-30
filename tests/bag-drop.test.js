// bag-drop.test.js — FX25: the bag's Drop puts the stack on the ground under you.
//
// Drop used to empty the slot and the item was gone. Now the whole stack lands on
// the player's tile through the runtime drop record (drops.js), and one log line
// names it. These tests drive Drop through the Remoticon's real key handler
// (_deviceKey: cursor to the slot, Enter, across to Drop, Enter), then walk off and
// back onto the tile through the real _tryPickup, and leave the zone and come back
// through the real pendingDrops, which _loadMap uses to re-inject drops.
//
// main.js touches `document` at import, so, as in device-keys.test.js, the real
// methods are lifted out of the source and bound onto a small game object.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ITEMS } from '../game/items.js';
import { WEAPONS } from '../game/weapons.js';
import { addToInventory, zoneOf, pageCount, slotOnPage, pageOfSlot, moveToZone } from '../game/inventory.js';
import { INVENTORY_SIZE, SAFE_SLOTS, PACK_PAGE, MAX_STACK } from '../game/data.js';
import { itemActions } from '../game/inspector.js';
import { recordDrop, pendingDrops, takeDrop } from '../game/drops.js';
import {
    HIT_SLOP, DEVICE_TABS, deviceTabRect, cycleDeviceTab, deviceBodyRect, deviceBagSlotRects, deviceBagPagerRects,
    deviceEquipLayout, deviceRingsLayout, inspectorActionRects, gearOptionRects, nearestRectInDir,
} from '../game/layout.js';

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');

function liveMethod(name, params, freeVars) {
    const signature = `${name}(${params}) {`;
    const at = mainSrc.indexOf(signature);
    assert.ok(at > 0, `${name}(${params}) not found in main.js`);
    const closeAt = mainSrc.indexOf('\n    }', at);
    assert.ok(closeAt > at, `${name} body never closes`);
    const body = mainSrc.slice(at + name.length, closeAt + '\n    }'.length);
    const names = Object.keys(freeVars);
    const factory = new Function(...names, `'use strict'; return function ${body}`);
    return factory(...names.map(n => freeVars[n]));
}

function liveConst(name) {
    const m = new RegExp(`\\nconst ${name}\\s*=\\s*`).exec(mainSrc);
    assert.ok(m, `const ${name} not found in main.js`);
    const from = m.index + m[0].length;
    const end = mainSrc.indexOf('\n};', from);
    return new Function(`'use strict'; return ${mainSrc.slice(from, end + 2)}`)();
}

const STATE = liveConst('STATE');
const DIRS = liveConst('DIRS');
const audio = { playSfx() {} };
const cfg = { size: INVENTORY_SIZE, safeSlots: SAFE_SLOTS, maxStack: MAX_STACK, pageSize: PACK_PAGE };
const FREE = {
    STATE, DIRS, audio, HIT_SLOP, DEVICE_TABS, deviceTabRect, cycleDeviceTab, deviceBodyRect,
    deviceBagSlotRects, deviceEquipLayout, deviceRingsLayout, inspectorActionRects, gearOptionRects,
    nearestRectInDir, itemActions, zoneOf, moveToZone, SAFE_SLOTS, INVENTORY_SIZE, PACK_PAGE, pageCount,
    slotOnPage, pageOfSlot, deviceBagPagerRects, MAX_STACK, recordDrop, takeDrop,
};
const LIVE = [
    ['_deviceActivate', 'zone, index'], ['_deviceTargets', ''], ['_deviceFocus', 't, i'],
    ['_deviceKey', 'code'], ['_removeFromSlot', 'slot'], ['_dropToGround', 'stack'],
    ['_recordDrop', 'type, x, y'], ['_takeDropRecord', 'type, x, y'], ['_tryPickup', ''],
].map(([n, p]) => [n, liveMethod(n, p, FREE)]);

const URL_A = 'sewer-map.json';

// A game in the open Remoticon, standing on (5,5) of one zone.
function makeGame(setup = () => {}) {
    const g = {
        state: STATE.DEVICE, _deviceTab: 'items', _deviceSel: null,
        inventory: new Array(INVENTORY_SIZE).fill(null),
        equipment: { weapon: WEAPONS.wooden_sword, top: null, bottom: null, front: null, back: null, sides: null },
        playerX: 5, playerY: 5, groundItems: [], _droppedItems: {}, _collectedItems: new Set(),
        _mapUrl: URL_A, map: { itemSpawns: [] }, _lootReel: null, _lootBursts: [],
        logs: [], beats: 0, saves: 0, events: [],
        _log(m) { this.logs.push(m); },
        _render() {}, _resumeHeldWalk() {}, _advanceWorld() { this.beats++; },
        _saveMoment() { this.saves++; },
        emitGameEvent(name, data) { this.events.push([name, data.id]); },
        _addToInventory(def) { return addToInventory(this.inventory, def, cfg); },
    };
    for (const [n, fn] of LIVE) g[n] = fn;
    setup(g);
    return g;
}
const put = (g, i, id, count = 1) => { g.inventory[i] = { itemDef: ITEMS[id], count }; };
const centre = r => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const press = (g, ...codes) => { for (const c of codes) g._deviceKey(c); };

// Walk the keyboard cursor to bag slot `want` with arrow presses only.
function walkTo(g, want) {
    let t = g._deviceTargets();
    if (t.cur < 0) { press(g, 'ArrowRight'); t = g._deviceTargets(); }
    const goal = t.ids.indexOf(want);
    assert.ok(goal >= 0, `no target ${want} on this level`);
    for (let n = 0; n < 40 && t.cur !== goal; n++) {
        const a = centre(t.rects[t.cur]), b = centre(t.rects[goal]);
        const dx = b.x - a.x, dy = b.y - a.y;
        press(g, Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft') : (dy > 0 ? 'ArrowDown' : 'ArrowUp'));
        t = g._deviceTargets();
    }
    assert.equal(t.cur, goal, `cursor never reached ${want}`);
}

// The real keys: cursor to the slot, open its actions, across to Drop, confirm.
const dropBySlot = (g, slot) => { walkTo(g, slot); press(g, 'Enter', 'ArrowRight', 'ArrowRight', 'Enter'); };

// Leave the zone and come back: a fresh ground built the way _loadMap rebuilds it.
function reenter(g) {
    g.groundItems = [];
    for (const s of g.map.itemSpawns) {
        if (g._collectedItems.has(`${g._mapUrl}|${s.x}|${s.y}|${s.type}`)) continue;
        g.groundItems.push({ type: s.type, x: s.x, y: s.y, def: ITEMS[s.type] });
    }
    for (const d of pendingDrops(g._droppedItems, g._collectedItems, g._mapUrl)) {
        g.groundItems.push({ type: d.type, x: d.x, y: d.y, def: ITEMS[d.type] });
    }
}
const here = g => g.groundItems.filter(i => i.x === 5 && i.y === 5).map(i => i.type);
const held = (g, id) => g.inventory.reduce((n, s) => n + (s && s.itemDef.id === id ? s.count : 0), 0);

describe('FX25 — Drop through the bag\'s real keys', () => {
    test('the whole stack lands on your tile, the slot empties, and the log names it', () => {
        const g = makeGame(x => put(x, 12, 'bandage', 3));
        dropBySlot(g, 12);
        assert.equal(g.inventory[12], null, 'the slot is empty');
        assert.deepEqual(here(g), ['bandage', 'bandage', 'bandage'], 'three bandages lie under you');
        assert.deepEqual(g._droppedItems[URL_A], [{ type: 'bandage', x: 5, y: 5, count: 3 }]);
        assert.deepEqual(g.logs, [`[Dropped ${ITEMS.bandage.name} x3]`]);
        assert.equal(g.saves, 1, 'the moment is saved, so a reload keeps it');
        assert.equal(g.beats, 0, 'dropping costs no world turn, as before');
    });

    test('a single item reads without a count', () => {
        const g = makeGame(x => put(x, 14, 'foil_hat'));
        dropBySlot(g, 14);
        assert.deepEqual(here(g), ['foil_hat']);
        assert.deepEqual(g.logs, [`[Dropped ${ITEMS.foil_hat.name}]`]);
    });

    test('a safe-slot item drops too', () => {
        const g = makeGame(x => put(x, 2, 'bandage', 2));
        dropBySlot(g, 2);
        assert.equal(g.inventory[2], null);
        assert.equal(here(g).length, 2);
    });

    test('standing there does not take it back: no pickup, no reel, no burst', () => {
        const g = makeGame(x => put(x, 12, 'bandage', 2));
        dropBySlot(g, 12);
        assert.equal(held(g, 'bandage'), 0);
        assert.equal(here(g).length, 2);
        assert.equal(g._lootReel, null);
        assert.deepEqual(g._lootBursts, []);
    });

    test('step off and back on: it is picked up again, the record clears, and no reel starts', () => {
        const g = makeGame(x => put(x, 12, 'bandage', 3));
        dropBySlot(g, 12);
        g.playerX = 6; g._tryPickup();
        assert.equal(held(g, 'bandage'), 0, 'the next tile has nothing for you');
        g.playerX = 5; g._tryPickup();
        assert.equal(held(g, 'bandage'), 3, 'the whole stack comes back');
        assert.deepEqual(here(g), []);
        assert.equal(g._droppedItems[URL_A], undefined, 'the drop record is spent');
        assert.equal(g._lootReel, null);
        assert.deepEqual(g._lootBursts, []);
        assert.equal(g.events.filter(e => e[0] === 'item_pickup').length, 3);
    });

    test('it survives leaving the zone and coming back, and is still there to pick up', () => {
        const g = makeGame(x => put(x, 12, 'bandage', 2));
        dropBySlot(g, 12);
        reenter(g);
        assert.deepEqual(here(g), ['bandage', 'bandage']);
        g._tryPickup();
        assert.equal(held(g, 'bandage'), 2);
        reenter(g);
        assert.deepEqual(here(g), [], 'once taken, it stays taken');
    });

    test('dropping an item back where you took it from the map keeps it, not doubled', () => {
        // An authored bandage at (5,5) that was taken: its collected marker would hide a dropped copy.
        const g = makeGame(x => {
            x.map = { itemSpawns: [{ type: 'bandage', x: 5, y: 5 }] };
            x._collectedItems.add(`${URL_A}|5|5|bandage`);
            put(x, 12, 'bandage', 2);
        });
        dropBySlot(g, 12);
        reenter(g);
        assert.equal(here(g).length, 2, 'two bandages, not one lost and not three');
        g._tryPickup();
        assert.equal(held(g, 'bandage'), 2);
        reenter(g);
        assert.deepEqual(here(g), [], 'and nothing is left behind once they are taken');
    });

    test('a stale taken-marker with no authored spawn does not hide the dropped copy', () => {
        const g = makeGame(x => { x._collectedItems.add(`${URL_A}|5|5|bandage`); put(x, 12, 'bandage'); });
        dropBySlot(g, 12);
        reenter(g);
        assert.deepEqual(here(g), ['bandage']);
    });

    test('a quest item is offered no Drop and stays in the bag', () => {
        const quest = Object.values(ITEMS).find(d => d.questItem);
        assert.ok(quest, 'there is a quest item to test with');
        assert.deepEqual(itemActions(quest, 'pack'), [], 'the bag offers it no actions at all');
        const g = makeGame(x => { x.inventory[12] = { itemDef: quest, count: 1 }; });
        walkTo(g, 12);
        press(g, 'Enter', 'ArrowRight', 'ArrowRight', 'Enter');
        assert.equal(g.inventory[12].itemDef, quest);
        assert.deepEqual(g.groundItems, []);
        // and the ground method refuses it on its own, too
        g._dropToGround({ itemDef: quest, count: 1 });
        assert.deepEqual(g.groundItems, []);
    });
});
