// bag-primary-action.test.js — fx37: the bag's main button does something for
// every item.
//
// The Pipe used to be a "melee" item with nothing to wield it, and a throw item's
// Use called the resolver with no direction (a "no direction" line; in the hotbar
// overlay the Rock was even spent on it). Now the Pipe equips, and a throw item's
// main button arms the throw for the next direction key.
//
// main.js touches `document` at import, so — as in device-keys.test.js — the real
// methods are lifted out of the source and bound onto a small game object. The
// keys are real too: the Remoticon is driven through _deviceKey, and the throw's
// direction goes through the REAL keydown listener lifted from _bindInput.

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
        addBuff() {}, hasBuff() { return false; }, _spawnHitSplat() {}, _layPuddle() { return 1; },
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

describe('fx37 — the Pipe is a weapon you can equip', () => {
    test('the Pipe is a hammer-class weapon with an Equip button', () => {
        assert.equal(ITEMS.pipe.useType, 'equip');
        assert.equal(ITEMS.pipe.equipSlot, 'weapon');
        assert.equal(ITEMS.pipe.weaponClass, 'hammer');
        assert.equal(ITEMS.pipe.damage, 12, 'no tuning number moved');
        assert.deepEqual(itemActions(ITEMS.pipe, 'pack')[0], { id: 'equip', label: 'Equip' });
    });

    test('Equip on the Pipe wields it, and the sword goes back into the slot it came from', () => {
        const g = makeGame(h => put(h, 14, 'pipe'));
        pressMain(g, 14);
        assert.equal(g.equipment.weapon, ITEMS.pipe, 'the Pipe is in hand');
        assert.equal(g.inventory[14].itemDef, WEAPONS.wooden_sword, 'the sword took the Pipe\'s slot');
        assert.ok(g.logs.some(l => /Equipped/.test(l)), g.logs.join(' | '));
        assert.ok(!g.logs.some(l => /no direction/.test(l)));
    });

    test('the GEAR tab\'s weapon plate offers the Pipe too', () => {
        const g = makeGame(h => { put(h, 14, 'pipe'); });
        const opts = equipOptions('weapon', WEAPONS.wooden_sword, g.inventory);
        assert.ok(opts.some(o => o.id === 'pipe'));
    });
});

describe('fx37 — a throw item\'s main button arms the throw', () => {
    test('Use on a Rock arms the throw: the menu closes, nothing is spent, no turn passes', () => {
        const g = makeGame(h => put(h, 12, 'rock', 3));
        pressMain(g, 12);
        assert.equal(g.state, STATE.ITEM_THROW_DIR);
        assert.equal(g.selectedSlot, 12);
        assert.equal(g.inventory[12].count, 3);
        assert.equal(g.beats, 0);
        assert.ok(g.logs.some(l => /\[Rock\] — pick a direction/.test(l)), g.logs.join(' | '));
        assert.ok(!g.logs.some(l => /no direction/.test(l)));
    });

    test('the next direction key throws it: one rock leaves the stack and the turn passes', () => {
        const g = makeGame(h => put(h, 12, 'rock', 3));
        pressMain(g, 12);
        key(g, 'ArrowRight');
        assert.equal(g.state, STATE.IDLE);
        assert.equal(g.inventory[12].count, 2);
        assert.equal(g.beats, 1);
        assert.equal(g.rattled, 1, 'the rock clatters like any thrown rock');
        assert.ok(g.logs.some(l => /Threw \[Rock\]|splatters|bursts/.test(l)), g.logs.join(' | '));
        assert.ok(!g.logs.some(l => /no direction/.test(l)));
    });

    test('the last rock is spent by the throw, not by arming it', () => {
        const g = makeGame(h => put(h, 12, 'rock', 1));
        pressMain(g, 12);
        assert.ok(g.inventory[12], 'still in the bag while armed');
        key(g, 'ArrowUp');
        assert.equal(g.inventory[12], null);
    });

    test('Escape cancels an armed throw and keeps the rock', () => {
        const g = makeGame(h => put(h, 12, 'rock', 2));
        pressMain(g, 12);
        key(g, 'Escape');
        assert.equal(g.state, STATE.IDLE);
        assert.equal(g.inventory[12].count, 2);
        assert.equal(g.beats, 0);
    });

    test('the hotbar overlay\'s Use arms the throw too, and does not spend the item', () => {
        const g = makeGame(h => { put(h, 3, 'rock', 2); h.state = STATE.ITEM_OVERLAY; h.selectedSlot = 3; });
        g._doItemUse(ITEMS.rock);
        assert.equal(g.state, STATE.ITEM_THROW_DIR);
        assert.equal(g.inventory[3].count, 2);
        assert.equal(g.beats, 0);
        assert.ok(!g.logs.some(l => /no direction/.test(l)));
    });

    test('Fire Blood keeps its Drink, not an armed throw', () => {
        assert.equal(armsThrow(ITEMS.fire_blood), false);
        assert.equal(itemActions(ITEMS.fire_blood, 'pack')[0].id, 'drink');
    });
});

describe('fx37 — no main button ends in a "no direction" line', () => {
    const ids = Object.keys(ITEMS).filter(id => !ITEMS[id].questItem);

    test('there are items to check, of each kind this slice touches', () => {
        assert.ok(ids.length >= 20);
        assert.ok(ids.some(id => ITEMS[id].useType === 'throw'));
        assert.ok(ids.some(id => ITEMS[id].useType === 'equip'));
    });

    for (const id of ids) {
        test(`${id}: the main button, pressed by keys`, () => {
            const g = makeGame(h => put(h, 12, id, 2));
            pressMain(g, 12);
            assert.ok(!g.logs.some(l => /no direction/i.test(l)), `${id}: ${g.logs.join(' | ')}`);
            // A throw item left the Remoticon armed; whatever happens next, the
            // same still holds once a direction is pressed.
            if (g.state === STATE.ITEM_THROW_DIR) {
                key(g, 'ArrowLeft');
                assert.ok(!g.logs.some(l => /no direction/i.test(l)), `${id}: ${g.logs.join(' | ')}`);
            }
        });
    }
});
