// poison-cure.test.js — ps2: Soap used from the bag, by real keys, ends Poisoned at once.
//
// Harness lifted from bag-primary-action.test.js (main.js touches `document` at import).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ITEMS, resolveUse, resolveThrow, unequipItem } from '../game/items.js';
import { WEAPONS } from '../game/weapons.js';
import { addToInventory, moveToZone, zoneOf, pageCount, slotOnPage, pageOfSlot } from '../game/inventory.js';
import { INVENTORY_SIZE, SAFE_SLOTS, PACK_PAGE, MAX_STACK } from '../game/data.js';
import { itemActions, equipOptions, armsThrow } from '../game/inspector.js';
import { slotRing, unslotRing } from '../game/rings.js';
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

// The keydown listener _bindInput registers first: every key the player presses
// goes through it. Lifted whole by brace matching, so a key reaches the same
// state branches (DEVICE, ITEM_THROW_DIR, ...) it does in the page.
function liveKeydown(freeVars) {
    const open = mainSrc.indexOf('_bindInput() {');
    assert.ok(open > 0, '_bindInput not found');
    const head = "document.addEventListener('keydown', (e) => {";
    const at = mainSrc.indexOf(head, open);
    assert.ok(at > 0, 'the keydown listener is not found in _bindInput');
    let depth = 1, i = at + head.length;
    for (; i < mainSrc.length && depth > 0; i++) {
        if (mainSrc[i] === '{') depth++;
        else if (mainSrc[i] === '}') depth--;
    }
    const body = mainSrc.slice(at + head.length, i - 1);
    const names = Object.keys(freeVars);
    const factory = new Function(...names, `'use strict'; return function (e) {${body}}`);
    return factory(...names.map(n => freeVars[n]));
}

const STATE = liveConst('STATE');
const DIRS = liveConst('DIRS');
const audio = { playSfx() {} };
const FREE = {
    STATE, DIRS, audio, HIT_SLOP, DEVICE_TABS, deviceTabRect, cycleDeviceTab, deviceBodyRect,
    deviceBagSlotRects, deviceEquipLayout, deviceRingsLayout, inspectorActionRects, gearOptionRects,
    nearestRectInDir, itemActions, equipOptions, zoneOf, moveToZone, SAFE_SLOTS, INVENTORY_SIZE, PACK_PAGE, pageCount, slotOnPage, pageOfSlot, deviceBagPagerRects,
    MAX_STACK, resolveUse, resolveThrow, unequipItem, slotRing, unslotRing,
};
const LIVE = [
    ['_tapDevice', 'pt'], ['_deviceActivate', 'zone, index'], ['_deviceTargets', ''],
    ['_deviceFocus', 't, i'], ['_deviceKey', 'code'], ['_deviceBack', ''],
    ['_deviceCycleTab', 'dir'], ['_closeDevice', ''], ['_closeCurrentMenu', ''],
    ['_scrollJournal', 'delta'], ['_pointInRect', 'p, r, slop = 0'], ['_removeFromSlot', 'slot'],
    ['_slotRing', 'slotKey, ringId'], ['_unslotRing', 'slotKey'],
    ['_armThrow', 'slot'], ['_doThrow', 'dir'], ['_doItemUse', 'item'],
].map(([n, p]) => [n, liveMethod(n, p, FREE)]);
const keydown = liveKeydown(FREE);

const cfg = { size: INVENTORY_SIZE, safeSlots: SAFE_SLOTS, maxStack: MAX_STACK };

// A game in the open Remoticon, on an open floor at (5,5).
function makeGame(setup = () => {}) {
    const g = {
        state: STATE.DEVICE, _deviceTab: 'items', _deviceSel: null, _journalScroll: 0, selectedSlot: -1,
        inventory: new Array(INVENTORY_SIZE).fill(null),
        equipment: { weapon: WEAPONS.wooden_sword, left: null, top: null, bottom: null, front: null, back: null, sides: null },
        tempEquips: [], ownedRings: new Set(), ringSlots: {}, ringTier: 1,
        playerHp: 5, playerMaxHp: 20, playerX: 5, playerY: 5,
        map: { isWalkable: () => true }, enemies: [], _physicalHeld: new Set(), _animating: false,
        logs: [], beats: 0, grants: 0, rattled: 0,
        _log(m) { this.logs.push(m); },
        _render() {}, _resumeHeldWalk() {}, _saveMoment() {}, _noteHeld() {},
        _advanceWorld() { this.beats++; },
        _applyFireBlood() {},
        _refreshGrantedSkills() { this.grants++; },
        _rockClatter() { this.rattled++; },
        addBuff(id) { this.buffs.add(id); }, buffs: new Set(), hasBuff(id) { return this.buffs.has(id); }, removeBuff(id) { this.buffs.delete(id); }, _spawnHitSplat() {}, _layPuddle() { return 1; },
        combatAttack() { return 'hit'; }, _entitiesInRadius() { return []; },
        _addToInventory(def) { return addToInventory(this.inventory, def, cfg); },
    };
    for (const [n, fn] of LIVE) g[n] = fn;
    setup(g);
    return g;
}
const put = (g, i, id, count = 1) => { g.inventory[i] = { itemDef: ITEMS[id], count }; };
const press = (g, ...codes) => { for (const c of codes) g._deviceKey(c); };
// A real key reaching the page's keydown listener.
const key = (g, code) => keydown.call(g, { code, target: { tagName: 'BODY' }, repeat: false, preventDefault() {} });

const centre = r => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
function walkTo(g, want) {
    let t = g._deviceTargets();
    if (t.cur < 0) { press(g, 'ArrowRight'); t = g._deviceTargets(); }
    const goal = t.ids.indexOf(want);
    assert.ok(goal >= 0, `no target ${want} on this level`);
    for (let n = 0; n < 40 && t.cur !== goal; n++) {
        const a = centre(t.rects[t.cur]), b = centre(t.rects[goal]);
        const dx = b.x - a.x, dy = b.y - a.y;
        const code = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft') : (dy > 0 ? 'ArrowDown' : 'ArrowUp');
        const before = t.cur;
        press(g, code);
        t = g._deviceTargets();
        if (t.cur === before) {
            press(g, Math.abs(dx) >= Math.abs(dy) ? (dy > 0 ? 'ArrowDown' : 'ArrowUp') : (dx > 0 ? 'ArrowRight' : 'ArrowLeft'));
            t = g._deviceTargets();
        }
    }
    assert.equal(t.cur, goal, `cursor never reached ${want}`);
}
// Select the bag slot and press the item's main (first) button, all by keys.
const pressMain = (g, slot) => { walkTo(g, slot); press(g, 'Enter', 'Enter'); };

describe('ps2 — Soap cures poison', () => {
    test('Poisoned: Soap from the bag ends Poisoned at once and says so', () => {
        const g = makeGame(h => { put(h, 12, 'soap'); h.buffs.add('poison'); });
        pressMain(g, 12);
        assert.equal(g.hasBuff('poison'), false);
        assert.ok(g.logs.some(l => /poison cured/.test(l)), g.logs.join(' | '));
    });

    test('Not poisoned: Soap does what it did, no cure line', () => {
        const g = makeGame(h => put(h, 12, 'soap'));
        pressMain(g, 12);
        assert.equal(g.hasBuff('poison'), false);
        assert.ok(g.logs.some(l => /already clean/i.test(l)), g.logs.join(' | '));
        assert.ok(!g.logs.some(l => /poison cured/.test(l)));
    });

    test('Poisoned and sludged: poison ends now, sludge is still left for end of turn', () => {
        const g = makeGame(h => { put(h, 12, 'soap'); h.buffs.add('poison'); h.buffs.add('sludge'); });
        pressMain(g, 12);
        assert.equal(g.hasBuff('poison'), false);
        assert.equal(g.hasBuff('sludge'), true);
        assert.ok(g.logs.some(l => /sludge will be neutralized/.test(l)), g.logs.join(' | '));
    });

    test('Poisoned, another item leaves poison alone', () => {
        const g = makeGame(h => { put(h, 12, 'bandage'); h.buffs.add('poison'); });
        pressMain(g, 12);
        assert.equal(g.hasBuff('poison'), true);
    });
});
