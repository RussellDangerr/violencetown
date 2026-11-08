// bag-cursor-start.test.js — FX43: the bag opens with the cursor on your first item
// (plans/fx43-bag-cursor-first-item.md).
//
// main.js touches `document` at import, so (as in weapon-compare.test.js) the real
// _bindInput and the methods it reaches are lifted out of the source and bound onto a
// small game object. They register on a real EventTarget standing in for `document`,
// and the tests press keys through it: nothing here calls _openDevice directly. The
// footer is read off the real Renderer, with a font that records what it draws.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ITEMS, resolveUse, unequipItem } from '../game/items.js';
import { WEAPONS } from '../game/weapons.js';
import { zoneOf, moveToZone, pageCount, slotOnPage, pageOfSlot } from '../game/inventory.js';
import { INVENTORY_SIZE, SAFE_SLOTS, PACK_PAGE, MAX_STACK } from '../game/data.js';
import { itemActions, equipOptions } from '../game/inspector.js';
import { doExamine } from '../game/examine.js';
import { emptyOffer } from '../game/offer.js';
import {
    HIT_SLOP, DEVICE_TABS, deviceTabRect, cycleDeviceTab, deviceBodyRect, deviceBagSlotRects, deviceBagPagerRects,
    deviceEquipLayout, deviceRingsLayout, inspectorActionRects, inspectorPanelRect, gearOptionRects, nearestRectInDir,
    MODAL_RECT, offerLayout, OFFER_ROWS_VISIBLE, DEVICE_RECT,
} from '../game/layout.js';
import { Renderer } from '../game/renderer.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

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

const SWORD = WEAPONS.wooden_sword;
const STATE = liveConst('STATE');
const DIRS = liveConst('DIRS');
const audio = { playSfx() {} };

// ── The page: a document, the lifted input handler, a recording renderer ─────

class Key extends Event {
    constructor(type, code) {
        super(type, { bubbles: true, cancelable: true });
        this.code = code;
        this.key = code;
        this.repeat = false;
        this.ctrlKey = false; this.metaKey = false; this.altKey = false; this.shiftKey = false;
    }
}

const FREE = {
    STATE, DIRS, audio, HIT_SLOP, DEVICE_TABS, deviceTabRect, cycleDeviceTab, deviceBodyRect,
    deviceBagSlotRects, deviceBagPagerRects, deviceEquipLayout, deviceRingsLayout, inspectorActionRects,
    gearOptionRects, nearestRectInDir, itemActions, equipOptions, zoneOf, moveToZone, SAFE_SLOTS,
    INVENTORY_SIZE, PACK_PAGE, MAX_STACK, pageCount, slotOnPage, pageOfSlot, resolveUse, unequipItem,
    doExamine, defaultVerb: () => null, OFFER_ROWS_VISIBLE,
};
const LIVE = [
    ['_tapDevice', 'pt'], ['_deviceActivate', 'zone, index'], ['_deviceTargets', ''],
    ['_deviceFocus', 't, i'], ['_deviceKey', 'code'], ['_deviceBack', ''],
    ['_deviceCycleTab', 'dir'], ['_closeDevice', ''], ['_openDevice', "tab = 'items'"], ['_bagFirstFilled', ''],
    ['_closeCurrentMenu', ''], ['_pointInRect', 'p, r, slop = 0'],
    ['_openInspect', 'desc'], ['_closeInspect', ''],
    ['_offerTheirsList', ''], ['_offerYoursList', ''], ['_offerSelection', ''], ['_offerScrollBy', 'side, delta'],
].map(([n, p]) => [n, liveMethod(n, p, FREE)]);

function makeGame(page, setup = () => {}) {
    const g = {
        state: STATE.IDLE, _deviceTab: 'items', _deviceSel: null, _bagPage: 0, _journalScroll: 0,
        inventory: new Array(INVENTORY_SIZE).fill(null),
        equipment: { weapon: SWORD, left: null, top: null, bottom: null, front: null, back: null, sides: null },
        tempEquips: [], ownedRings: new Set(), ringSlots: {}, ringTier: 1,
        playerX: 5, playerY: 5, facing: 'down', gold: 100,
        examinables: [], enemies: [], containers: [], groundItems: [],
        map: { getTile: () => 0, isInBounds: () => true, propSpawns: [] },
        _physicalHeld: new Set(), _heldDirKeys: [], _animating: false, _paused: false,
        logs: [], renders: 0,
        _log(m) { this.logs.push(m); },
        _render() { this.renders++; },
        _resumeHeldWalk() {}, _stopAutoRepeat() {}, _targetAt: () => null,
        _digitToSlot: () => -1, _noteHeld() {}, _buybackList: () => [],
        emitGameEvent() {},
        _resolveItemDef(id) { return WEAPONS[id] || ITEMS[id] || null; },
    };
    for (const [n, fn] of LIVE) g[n] = fn;
    setup(g);
    g._bindInput = liveMethod('_bindInput', '', { ...FREE, document: page.document, window: page.window });
    g._bindInput();
    return g;
}

function makePage() {
    const document = new EventTarget();
    return { document, window: new EventTarget() };
}

function press(page, code) {
    const down = new Key('keydown', code);
    page.document.dispatchEvent(down);
    page.document.dispatchEvent(new Key('keyup', code));
    return down;
}

// A renderer whose font records each line it is asked to draw, with where.
function rig() {
    const texts = [];
    const ctx = new Proxy({}, {
        get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })),
        set: (t, k, v) => { t[k] = v; return true; },
    });
    const font = {
        measure: (s, sc = 1) => String(s).length * 4.8 * sc,
        drawText: (_c, s, x, y, opts = {}) => texts.push({ s: String(s), x, y, scale: opts.scale ?? 1, align: opts.align }),
    };
    const r = Object.assign(Object.create(Renderer.prototype), { ctx, sprites: {}, font });
    return { r, texts, font };
}
const said = texts => texts.map(t => t.s);


const bagGame = (page, stack) => makeGame(page, g => { for (const [i, def] of Object.entries(stack)) g.inventory[i] = { itemDef: def, count: 1 }; });

describe('opening the bag', () => {
    test('the cursor starts on the first filled slot, not on an empty one', () => {
        const page = makePage();
        const g = bagGame(page, { 2: ITEMS.soap, 5: ITEMS.rock });
        press(page, 'Tab');
        assert.equal(g.state, STATE.DEVICE);
        assert.deepEqual(g._deviceSel, { tab: 'items', index: 2 });
    });

    test('slot 0 filled: the cursor is on it', () => {
        const page = makePage();
        const g = bagGame(page, { 0: WEAPONS.fearmur, 1: WEAPONS.lion_whip });
        press(page, 'Tab');
        assert.deepEqual(g._deviceSel, { tab: 'items', index: 0 });
    });

    test('the first arrow press moves from there, not to slot 1', () => {
        const page = makePage();
        const g = bagGame(page, { 2: ITEMS.soap, 3: ITEMS.rock });
        press(page, 'Tab');
        press(page, 'ArrowRight');
        assert.deepEqual(g._deviceSel, { tab: 'items', index: 3 });
        press(page, 'ArrowLeft');
        assert.deepEqual(g._deviceSel, { tab: 'items', index: 2 });
    });

    test('a pack item on a later row is found when the safe row is empty', () => {
        const page = makePage();
        const g = bagGame(page, { [SAFE_SLOTS + 1]: ITEMS.soap });
        press(page, 'Tab');
        assert.deepEqual(g._deviceSel, { tab: 'items', index: SAFE_SLOTS + 1 });
    });

    test('an empty bag opens with no selection and the arrows still work', () => {
        const page = makePage();
        const g = bagGame(page, {});
        press(page, 'Tab');
        assert.equal(g.state, STATE.DEVICE);
        assert.equal(g._deviceSel, null);
        press(page, 'ArrowRight');
        assert.deepEqual(g._deviceSel, { tab: 'items', index: 0 });
    });

    test('closing and opening again lands on the first item again', () => {
        const page = makePage();
        const g = bagGame(page, { 4: ITEMS.soap, 6: ITEMS.rock });
        press(page, 'Tab');
        press(page, 'ArrowRight');
        press(page, 'Tab');
        assert.equal(g.state, STATE.IDLE);
        press(page, 'Tab');
        assert.deepEqual(g._deviceSel, { tab: 'items', index: 4 });
    });

    test('the other tabs open with no selection, as before', () => {
        // Their openers (_openJournal and friends) call _openDevice with the tab's name.
        for (const tab of ['gear', 'quests', 'map', 'rings']) {
            const page = makePage();
            const g = bagGame(page, { 2: ITEMS.soap });
            g._openDevice(tab);
            assert.equal(g.state, STATE.DEVICE, tab);
            assert.equal(g._deviceTab, tab);
            assert.equal(g._deviceSel, null, `${tab} should open with no selection`);
        }
    });

    test('flipping to the bag from another tab still starts with no selection, as before', () => {
        const page = makePage();
        const g = bagGame(page, { 2: ITEMS.soap });
        g._openDevice('gear');
        g._deviceCycleTab(-1);
        assert.equal(g._deviceTab, 'items');
        assert.equal(g._deviceSel, null);
    });
});

describe('the bag footer', () => {
    const R = deviceBodyRect();
    function footer(tab) {
        const page = makePage();
        const g = bagGame(page, { 1: ITEMS.soap });
        g._deviceTab = tab;
        const { r, texts, font } = rig();
        r._drawDevice(g);
        const line = texts.find(t => t.s.includes('ESC CLOSE'));
        return { line, font };
    }

    test('the ITEMS footer names tabs, arrows, Space and Esc', () => {
        const { line } = footer('items');
        assert.ok(line, 'no footer drawn');
        for (const part of ['[ ] TABS', '↑↓ PICK', 'SPACE', 'ESC CLOSE']) assert.ok(line.s.includes(part), `${part} missing from "${line.s}"`);
    });

    test('the footer sits inside the panel', () => {
        const { line, font } = footer('items');
        const w = font.measure(line.s, line.scale);
        assert.ok(line.x - w / 2 >= DEVICE_RECT.x && line.x + w / 2 <= DEVICE_RECT.x + DEVICE_RECT.w, `"${line.s}" is ${w}px wide`);
    });

    test('the other tabs keep the old footer', () => {
        for (const tab of ['gear', 'quests', 'map', 'rings']) {
            assert.equal(footer(tab).line.s, '[ ] TABS   ESC CLOSE', tab);
        }
    });
});
