// poison-cure.test.js — ps2: Soap used from the bag, by real keys, ends Poisoned at once.
//
// Harness lifted from bag-primary-action.test.js (main.js touches `document` at import).
// Every key goes through the keydown listener _bindInput registers (Tab opens the device,
// arrows walk the bag, Enter selects, Enter again presses the item's main button).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ITEMS, resolveUse, resolveThrow, unequipItem } from '../game/items.js';
import { buffBarChips } from '../game/renderer.js';
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
    const lineEnd = mainSrc.indexOf('\n', at);
    const oneLiner = mainSrc.slice(at, lineEnd).trimEnd().endsWith('}');   // e.g. hasBuff(id) { return ...; }
    const closeAt = oneLiner ? lineEnd : mainSrc.indexOf('\n    }', at);
    assert.ok(closeAt > at, `${name} body never closes`);
    const body = mainSrc.slice(at + name.length, oneLiner ? lineEnd : closeAt + '\n    }'.length);
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
// state branches (IDLE's Tab, DEVICE, ...) it does in the page.
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
const LIVE_NAMES = [
    ['_tapDevice', 'pt'], ['_deviceActivate', 'zone, index'], ['_deviceTargets', ''],
    ['_deviceFocus', 't, i'], ['_deviceKey', 'code'], ['_deviceBack', ''],
    ['_deviceCycleTab', 'dir'], ['_closeDevice', ''], ['_closeCurrentMenu', ''],
    ['_scrollJournal', 'delta'], ['_pointInRect', 'p, r, slop = 0'], ['_removeFromSlot', 'slot'],
    ['_slotRing', 'slotKey, ringId'], ['_unslotRing', 'slotKey'],
    ['_armThrow', 'slot'], ['_doThrow', 'dir'], ['_doItemUse', 'item'],
    ['_openDevice', "tab = 'items'"], ['_digitToSlot', 'code'], ['_bagFirstFilled', ''],
    ['addBuff', "id, name, turns, type = 'buff', extra = {}"], ['removeBuff', 'id'], ['hasBuff', 'id'],
];

// The end-of-turn soap check, lifted from _advanceWorldOnce (the lines that clear sludge).
const soapAt = mainSrc.indexOf('if (this._soapUsedThisTurn && this.hasBuff');
assert.ok(soapAt > 0, 'the end-of-turn soap check is not found in main.js');
const soapEnd = mainSrc.indexOf('this._soapUsedThisTurn = false;', soapAt) + 'this._soapUsedThisTurn = false;'.length;
const endOfTurn = new Function(`'use strict'; return function () {${mainSrc.slice(soapAt, soapEnd)}}`)();

// Live methods and the keydown listener, bound to the branch's items.js.
const bound = {
    live: LIVE_NAMES.map(([n, p]) => [n, liveMethod(n, p, FREE)]),
    keydown: liveKeydown(FREE),
};

const cfg = { size: INVENTORY_SIZE, safeSlots: SAFE_SLOTS, maxStack: MAX_STACK };

// A game on an open floor at (5,5), world running; the player pulls the device out with Tab.
function makeGame(setup = () => {}) {
    const g = {
        state: STATE.IDLE, _soapUsedThisTurn: false, _deviceTab: 'items', _deviceSel: null, _journalScroll: 0, selectedSlot: -1,
        inventory: new Array(INVENTORY_SIZE).fill(null),
        equipment: { weapon: WEAPONS.wooden_sword, left: null, top: null, bottom: null, front: null, back: null, sides: null },
        tempEquips: [], ownedRings: new Set(), ringSlots: {}, ringTier: 1,
        playerHp: 5, playerMaxHp: 20, playerX: 5, playerY: 5,
        map: { isWalkable: () => true }, enemies: [], _physicalHeld: new Set(), _animating: false,
        logs: [], beats: 0, grants: 0, rattled: 0, buffs: [],
        _log(m) { this.logs.push(m); },
        _render() {}, _resumeHeldWalk() {}, _saveMoment() {}, _noteHeld() {},
        _advanceWorld() { this.beats++; endOfTurn.call(this); },
        _applyFireBlood() {},
        _refreshGrantedSkills() { this.grants++; },
        _rockClatter() { this.rattled++; },
        _spawnHitSplat() {}, _layPuddle() { return 1; },
        combatAttack() { return 'hit'; }, _entitiesInRadius() { return []; },
        _addToInventory(def) { return addToInventory(this.inventory, def, cfg); },
    };
    for (const [n, fn] of bound.live) g[n] = fn;
    g._keydown = bound.keydown;
    setup(g);
    return g;
}
const put = (g, i, id, count = 1) => { g.inventory[i] = { itemDef: ITEMS[id], count }; };
// A real key reaching the page's keydown listener.
const key = (g, code) => g._keydown.call(g, { code, target: { tagName: 'BODY' }, repeat: false, preventDefault() {} });
const press = (g, ...codes) => { for (const c of codes) key(g, c); };
const poison = g => g.addBuff('poison', 'Poison', 3, 'debuff');
const sludge = g => g.addBuff('sludge', 'Sludge', 3, 'debuff');
const chipIds = g => buffBarChips(g).map(c => c.id);

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
// Tab opens the device, walk the arrows to the bag slot, Enter selects it, Enter presses
// the item's main (first) button: all real keys.
const useFromBag = (g, slot) => {
    press(g, 'Tab');
    assert.equal(g.state, STATE.DEVICE, 'Tab opened the device');
    walkTo(g, slot);
    press(g, 'Enter', 'Enter');
};

describe('ps2 — Soap cures poison', () => {
    test('Poisoned: Soap from the bag ends Poisoned at once, the chip goes, and it says so', () => {
        const g = makeGame(h => { put(h, 12, 'soap'); poison(h); });
        assert.ok(chipIds(g).includes('poison'), 'the chip shows before');
        useFromBag(g, 12);
        assert.equal(g.hasBuff('poison'), false);
        assert.ok(!g.buffs.some(b => b.id === 'poison'));
        assert.ok(!chipIds(g).includes('poison'), 'the buff-bar chip list no longer has Poisoned');
        assert.ok(g.logs.some(l => /poison cured/.test(l)), g.logs.join(' | '));
        assert.equal(g.inventory[12], null, 'the Soap is spent');
    });

    test('Poisoned and sludged: poison ends now, sludge clears at end of turn as before', () => {
        const g = makeGame(h => { put(h, 12, 'soap'); poison(h); sludge(h); });
        useFromBag(g, 12);
        assert.ok(!chipIds(g).includes('poison'));
        assert.equal(g.hasBuff('sludge'), false, 'the end-of-turn soap check cleared the sludge');
        assert.ok(g.logs.some(l => /sludge will be neutralized/.test(l)), g.logs.join(' | '));
        assert.ok(g.logs.some(l => /Soap neutralized sludge/.test(l)), g.logs.join(' | '));
    });

    test('Poisoned, another item leaves poison alone', () => {
        const g = makeGame(h => { put(h, 12, 'bandage'); poison(h); });
        useFromBag(g, 12);
        assert.equal(g.hasBuff('poison'), true);
        assert.ok(chipIds(g).includes('poison'));
    });

    // "Does what it does today": results recorded once by running these same keys against
    // items.js as it was before this change (dev 69c3614), kept here as literal values.
    describe('not poisoned: exactly what Soap did before the change', () => {
        const EQUIP_BEFORE = { weapon: 'wooden_sword', left: null, top: null, bottom: null, front: null, back: 'soap', sides: null };
        const RECORDED = {
            clean: {
                logs: ['[[Soap] equipped to back for 3 turns] [Already clean]'],
                beats: 1, slot: null, buffs: [], hp: 5, equip: EQUIP_BEFORE,
            },
            sludged: {
                logs: ['[[Soap] equipped to back for 3 turns] [Soap applied \u2014 sludge will be neutralized]', '[Soap neutralized sludge]'],
                beats: 1, slot: null, buffs: [], hp: 5, equip: EQUIP_BEFORE,
            },
        };
        const run = (setup) => {
            const g = makeGame(h => { put(h, 12, 'soap'); setup(h); });
            useFromBag(g, 12);
            const equip = Object.fromEntries(Object.entries(g.equipment).map(([k, v]) => [k, v ? v.id : null]));
            return { logs: g.logs, beats: g.beats, slot: g.inventory[12], buffs: g.buffs.map(b => b.id), hp: g.playerHp, equip };
        };
        for (const [name, setup] of [['clean', () => {}], ['sludged', sludge]]) {
            test(name, () => {
                const a = run(setup);
                assert.deepEqual(a, RECORDED[name]);
                assert.ok(!a.logs.some(l => /poison cured/.test(l)));
            });
        }
    });
});
