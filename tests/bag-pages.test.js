// bag-pages.test.js — BG1: the bag grows another page whenever it runs out
// (plans/bg1-bag-grows-pages.md). A full PACK opens a new page of PACK slots
// instead of refusing; the SAFE row stays 10 slots and shows on every page;
// the bag screen pages with , . PageUp PageDown and the arrows beside the
// PACK grid; a save keeps every page; defeat rules are unchanged.
//
// main.js touches `document` at import, so (as in device-keys.test.js) the
// real methods are lifted out of the source and bound onto a small game.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ITEMS, resolveUse, unequipItem } from '../game/items.js';
import { WEAPONS } from '../game/weapons.js';
import {
    addToInventory, moveToZone, zoneOf, addPage, pageCount, slotOnPage, pageOfSlot, pagedSize,
} from '../game/inventory.js';
import { INVENTORY_SIZE, SAFE_SLOTS, PACK_PAGE, MAX_STACK } from '../game/data.js';
import { itemActions, equipOptions } from '../game/inspector.js';
import { slotRing, unslotRing } from '../game/rings.js';
import { partitionInventory } from '../game/defeat-scenarios.js';
import {
    HIT_SLOP, DEVICE_TABS, deviceTabRect, cycleDeviceTab, deviceBodyRect, deviceBagSlotRects, deviceBagPagerRects,
    deviceEquipLayout, deviceRingsLayout, inspectorActionRects, inspectorPanelRect, gearOptionRects, nearestRectInDir,
    rectsOverlap,
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

const STATE = liveConst('STATE');
const DIRS = liveConst('DIRS');
const audio = { playSfx() {} };
const FREE = {
    STATE, DIRS, audio, HIT_SLOP, DEVICE_TABS, deviceTabRect, cycleDeviceTab, deviceBodyRect,
    deviceBagSlotRects, deviceBagPagerRects, deviceEquipLayout, deviceRingsLayout, inspectorActionRects,
    gearOptionRects, nearestRectInDir, itemActions, equipOptions, zoneOf, moveToZone, SAFE_SLOTS,
    INVENTORY_SIZE, PACK_PAGE, MAX_STACK, pageCount, slotOnPage, pageOfSlot, resolveUse, unequipItem,
    slotRing, unslotRing, addToInv: addToInventory,
};
const LIVE = [
    ['_addToInventory', 'itemDef'], ['_tapDevice', 'pt'], ['_deviceActivate', 'zone, index'],
    ['_deviceTargets', ''], ['_deviceFocus', 't, i'], ['_deviceKey', 'code'], ['_deviceBack', ''],
    ['_deviceCycleTab', 'dir'], ['_closeDevice', ''], ['_openDevice', "tab = 'items'"],
    ['_scrollJournal', 'delta'], ['_pointInRect', 'p, r, slop = 0'], ['_removeFromSlot', 'slot'],
].map(([n, p]) => [n, liveMethod(n, p, FREE)]);

const FIXED = { size: INVENTORY_SIZE, safeSlots: SAFE_SLOTS, maxStack: MAX_STACK };
const grows = (inv) => ({ size: inv.length, safeSlots: SAFE_SLOTS, maxStack: MAX_STACK, pageSize: PACK_PAGE });
const PC = { safeSlots: SAFE_SLOTS, pageSize: PACK_PAGE };
const ROCK = { id: 'rock' };
const SOAP = { id: 'soap' };
const emptyBag = () => new Array(INVENTORY_SIZE).fill(null);
const fullPack = () => {
    const inv = emptyBag();
    for (let i = SAFE_SLOTS; i < INVENTORY_SIZE; i++) inv[i] = { itemDef: { id: `junk_${i}` }, count: 1 };
    return inv;
};

function makeGame(setup = () => {}) {
    const g = {
        state: STATE.DEVICE, _deviceTab: 'items', _deviceSel: null, _journalScroll: 0, _bagPage: 0,
        inventory: emptyBag(),
        equipment: { weapon: WEAPONS.wooden_sword, top: null, bottom: null, front: null, back: null, sides: null },
        tempEquips: [], ownedRings: new Set(), ringSlots: {}, ringTier: 1,
        playerHp: 5, playerMaxHp: 20, logs: [], renders: 0,
        _log(m) { this.logs.push(m); },
        _render() { this.renders++; }, _resumeHeldWalk() {},
        _advanceWorld() {}, _applyFireBlood() {}, _refreshGrantedSkills() {}, _saveMoment() {},
    };
    for (const [n, fn] of LIVE) g[n] = fn;
    setup(g);
    return g;
}
const put = (g, i, id, count = 1) => { g.inventory[i] = { itemDef: ITEMS[id], count }; };
// A game whose bag has grown to two pages, with soap first on page 2.
const twoPages = () => makeGame(g => {
    for (let i = SAFE_SLOTS; i < INVENTORY_SIZE; i++) put(g, i, 'rock', MAX_STACK);
    g._addToInventory(ITEMS.soap);
});

const body = deviceBodyRect();
const centre = r => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

// ── the model ───────────────────────────────────────────────────────────────

describe('a growing bag never refuses', () => {
    test('the page is one PACK grid: 40 slots, the SAFE row stays 10', () => {
        assert.equal(PACK_PAGE, 40);
        assert.equal(SAFE_SLOTS, 10);
        assert.equal(INVENTORY_SIZE, SAFE_SLOTS + PACK_PAGE);
    });

    test('a full PACK adds a page and the item lands first on it', () => {
        const inv = fullPack();
        assert.equal(addToInventory(inv, ROCK, grows(inv)), true);
        assert.equal(inv.length, INVENTORY_SIZE + PACK_PAGE);
        assert.equal(inv[INVENTORY_SIZE].itemDef, ROCK);
        assert.ok(inv.slice(INVENTORY_SIZE + 1).every(s => s === null), 'the rest of page 2 is empty');
    });

    test('a full PACK opens a page rather than filling a free SAFE slot', () => {
        const inv = fullPack();
        addToInventory(inv, ROCK, grows(inv));
        assert.ok(inv.slice(0, SAFE_SLOTS).every(s => s === null), 'SAFE was filled behind your back');
    });

    test('a whole bag full of everything still takes more, page after page', () => {
        const inv = emptyBag();
        const N = INVENTORY_SIZE + 2 * PACK_PAGE + 5;    // well past three pages
        for (let i = 0; i < N; i++) assert.equal(addToInventory(inv, { id: `thing_${i}` }, grows(inv)), true);
        assert.equal(inv.filter(Boolean).length, N);
        assert.equal(pageCount(inv.length, PC), 4);
    });

    test('merging into a stack still comes first, on any page', () => {
        const inv = fullPack();
        addPage(inv, PC);
        inv[INVENTORY_SIZE + 3] = { itemDef: ROCK, count: 4 };
        assert.equal(addToInventory(inv, ROCK, grows(inv)), true);
        assert.equal(inv[INVENTORY_SIZE + 3].count, 5);
        assert.equal(inv.length, INVENTORY_SIZE + PACK_PAGE, 'a page was added for nothing');
    });

    test('a free slot on an earlier page is used before a new page opens', () => {
        const inv = fullPack();
        addPage(inv, PC);
        for (let i = INVENTORY_SIZE; i < inv.length; i++) inv[i] = { itemDef: SOAP, count: MAX_STACK };
        inv[12] = null;                                  // a hole on page 1
        addToInventory(inv, ROCK, grows(inv));
        assert.equal(inv[12].itemDef, ROCK);
        assert.equal(inv.length, INVENTORY_SIZE + PACK_PAGE);
    });

    test('without pageSize the bag is the old fixed one: it refuses when full', () => {
        const inv = new Array(INVENTORY_SIZE).fill(null).map(() => ({ itemDef: SOAP, count: MAX_STACK }));
        assert.equal(addToInventory(inv, ROCK, FIXED), false);
        assert.equal(inv.length, INVENTORY_SIZE);
    });

    test('moving an item out of SAFE into a full PACK adds a page', () => {
        const inv = fullPack();
        inv[2] = { itemDef: ROCK, count: 1 };
        assert.equal(moveToZone(inv, 2, 'pack', grows(inv)), true);
        assert.equal(inv[2], null);
        assert.equal(inv[INVENTORY_SIZE].itemDef, ROCK);
    });

    test('protecting into a full SAFE row still fails: SAFE never grows', () => {
        const inv = emptyBag();
        for (let i = 0; i < SAFE_SLOTS; i++) inv[i] = { itemDef: SOAP, count: 1 };
        inv[SAFE_SLOTS] = { itemDef: ROCK, count: 1 };
        assert.equal(moveToZone(inv, SAFE_SLOTS, 'safe', grows(inv)), false);
        assert.equal(inv.length, INVENTORY_SIZE);
    });
});

describe('pages are views over the one flat bag', () => {
    test('pageCount: one page to start, one more per 40 PACK slots', () => {
        assert.equal(pageCount(INVENTORY_SIZE, PC), 1);
        assert.equal(pageCount(INVENTORY_SIZE + PACK_PAGE, PC), 2);
        assert.equal(pageCount(INVENTORY_SIZE + 2 * PACK_PAGE, PC), 3);
        assert.equal(pageCount(9, PC), 1, 'a short old bag is still one page');
    });

    test('slotOnPage: the SAFE row is the same on every page; the PACK shifts by a page', () => {
        for (let page = 0; page < 3; page++) {
            for (let v = 0; v < SAFE_SLOTS; v++) assert.equal(slotOnPage(v, page, PC), v);
            assert.equal(slotOnPage(SAFE_SLOTS, page, PC), SAFE_SLOTS + page * PACK_PAGE);
            assert.equal(slotOnPage(INVENTORY_SIZE - 1, page, PC), INVENTORY_SIZE - 1 + page * PACK_PAGE);
        }
    });

    test('pageOfSlot inverts slotOnPage for every PACK slot', () => {
        for (let page = 0; page < 3; page++) {
            for (let v = SAFE_SLOTS; v < INVENTORY_SIZE; v++) assert.equal(pageOfSlot(slotOnPage(v, page, PC), PC), page);
        }
        assert.equal(pageOfSlot(3, PC), -1, 'SAFE is on no one page');
    });

    test('pagedSize: a save loads into whole pages, never fewer than 50 slots', () => {
        assert.equal(pagedSize(9, INVENTORY_SIZE, PC), INVENTORY_SIZE);
        assert.equal(pagedSize(INVENTORY_SIZE, INVENTORY_SIZE, PC), INVENTORY_SIZE);
        assert.equal(pagedSize(INVENTORY_SIZE + 1, INVENTORY_SIZE, PC), INVENTORY_SIZE + PACK_PAGE);
        assert.equal(pagedSize(INVENTORY_SIZE + PACK_PAGE, INVENTORY_SIZE, PC), INVENTORY_SIZE + PACK_PAGE);
        assert.equal(pagedSize(INVENTORY_SIZE + PACK_PAGE + 1, INVENTORY_SIZE, PC), INVENTORY_SIZE + 2 * PACK_PAGE);
        assert.equal(pagedSize(undefined, INVENTORY_SIZE, PC), INVENTORY_SIZE);
    });
});

// ── the game's own _addToInventory ──────────────────────────────────────────

describe("main.js's _addToInventory grows the bag", () => {
    test('a pickup into a full PACK grows the live bag in place', () => {
        const g = makeGame(x => { for (let i = SAFE_SLOTS; i < INVENTORY_SIZE; i++) put(x, i, 'rock', MAX_STACK); });
        const bag = g.inventory;
        assert.equal(g._addToInventory(ITEMS.soap), true);
        assert.equal(g.inventory, bag, 'the bag array was replaced, not grown');
        assert.equal(g.inventory.length, INVENTORY_SIZE + PACK_PAGE);
        assert.equal(g.inventory[INVENTORY_SIZE].itemDef, ITEMS.soap);
    });

    test('the offer screen has no bag-full blocker any more', () => {
        assert.ok(!/bagFull\s*:/.test(mainSrc), 'main.js still hands commitBlocker a bagFull');
        assert.ok(!mainSrc.includes('_offerTakeFitsBag('), 'the fits-the-bag check is still there');
    });
});

// ── defeat ──────────────────────────────────────────────────────────────────

describe('defeat rules are unchanged', () => {
    test('SAFE is kept and every PACK page is at risk', () => {
        const inv = emptyBag();
        addPage(inv, PC);
        inv[0] = { itemDef: ITEMS.soap, count: 1 };                  // SAFE
        inv[SAFE_SLOTS] = { itemDef: ITEMS.rock, count: 1 };         // PACK page 1
        inv[INVENTORY_SIZE + 5] = { itemDef: ITEMS.bandage, count: 2 }; // PACK page 2
        const { safe, atRisk } = partitionInventory(inv, WEAPONS.wooden_sword, SAFE_SLOTS);
        assert.deepEqual(safe.map(e => e.i), [0]);
        assert.deepEqual(atRisk.map(e => e.i), [SAFE_SLOTS, INVENTORY_SIZE + 5]);
    });

    test('a quest item on page 2 is still kept', () => {
        const quest = Object.values(ITEMS).find(d => d.questItem);
        assert.ok(quest, 'fixture: a quest item exists');
        const inv = emptyBag();
        addPage(inv, PC);
        inv[INVENTORY_SIZE + 1] = { itemDef: quest, count: 1 };
        const { safe, atRisk } = partitionInventory(inv, WEAPONS.wooden_sword, SAFE_SLOTS);
        assert.deepEqual(safe.map(e => e.i), [INVENTORY_SIZE + 1]);
        assert.equal(atRisk.length, 0);
    });
});

// ── the bag screen ──────────────────────────────────────────────────────────

describe('the bag screen pages', () => {
    test('the arrows sit beside the PACK, inside the body, clear of every slot and the inspector', () => {
        const p = deviceBagPagerRects(body);
        const slots = deviceBagSlotRects(body);
        const grow = (r) => ({ x: r.x - HIT_SLOP, y: r.y - HIT_SLOP, w: r.w + 2 * HIT_SLOP, h: r.h + 2 * HIT_SLOP });
        for (const r of [p.prev, p.next]) {
            assert.ok(r.x >= body.x && r.x + r.w <= body.x + body.w, 'an arrow leaves the body');
            assert.ok(r.y >= slots[SAFE_SLOTS].y && r.y + r.h <= slots[INVENTORY_SIZE - 1].y + slots[INVENTORY_SIZE - 1].h,
                'an arrow is not beside the PACK grid');
            for (const s of slots) assert.ok(!rectsOverlap(grow(r), grow(s)), 'an arrow tap zone overlaps a slot');
            assert.ok(!rectsOverlap(r, inspectorPanelRect(body)), 'an arrow is under the inspector');
            assert.ok(r.w >= 24 && r.h >= 24, 'an arrow is too small to tap');
        }
        assert.ok(p.prev.x + p.prev.w <= slots[SAFE_SLOTS].x, 'prev is not left of the PACK');
        assert.ok(p.next.x >= slots[SAFE_SLOTS + 9].x + slots[SAFE_SLOTS + 9].w, 'next is not right of the PACK');
    });

    test('the bag opens on page 1', () => {
        const g = twoPages();
        g._bagPage = 1;
        g.state = STATE.IDLE;
        g._openDevice('items');
        assert.equal(g._bagPage, 0);
    });

    test('a tap on the next arrow turns to page 2; prev turns back', () => {
        const g = twoPages();
        const p = deviceBagPagerRects(body);
        g._tapDevice(centre(p.next));
        assert.equal(g._bagPage, 1);
        g._tapDevice(centre(p.next));
        assert.equal(g._bagPage, 1, 'paged past the last page');
        g._tapDevice(centre(p.prev));
        assert.equal(g._bagPage, 0);
        g._tapDevice(centre(p.prev));
        assert.equal(g._bagPage, 0, 'paged before the first page');
    });

    test('with one page, the arrows are not there to tap', () => {
        const g = makeGame(x => put(x, SAFE_SLOTS, 'rock'));
        const p = deviceBagPagerRects(body);
        g._tapDevice(centre(p.next));
        assert.equal(g._bagPage, 0);
        assert.equal(g.renders, 0, 'a tap on nothing redrew');
    });

    for (const [fwd, back] of [['Period', 'Comma'], ['PageDown', 'PageUp']]) {
        test(`keys ${back} / ${fwd} turn the page`, () => {
            const g = twoPages();
            g._deviceKey(fwd);
            assert.equal(g._bagPage, 1);
            g._deviceKey(back);
            assert.equal(g._bagPage, 0);
        });
    }

    test('the page keys only page on the bag tab', () => {
        const g = twoPages();
        g._deviceTab = 'gear';
        g._deviceKey('Period');
        assert.equal(g._bagPage, 0);
    });

    test('the page keys collide with no other bag key', () => {
        for (const code of ['Comma', 'Period', 'PageUp', 'PageDown']) {
            assert.ok(!(code in DIRS), `${code} is a direction`);
            assert.ok(!['Tab', 'BracketLeft', 'BracketRight', 'KeyC', 'KeyJ', 'KeyM', 'KeyR', 'Space', 'Enter'].includes(code));
        }
    });

    test('a tap on page 2 selects the page-2 slot it shows', () => {
        const g = twoPages();
        g._deviceKey('Period');
        const rects = deviceBagSlotRects(body);
        g._tapDevice(centre(rects[SAFE_SLOTS]));
        assert.deepEqual(g._deviceSel, { tab: 'items', index: INVENTORY_SIZE });
        assert.equal(g.inventory[g._deviceSel.index].itemDef, ITEMS.soap);
    });

    test('a tap on the SAFE row selects the same slot on either page', () => {
        const g = twoPages();
        put(g, 3, 'bandage');
        g._deviceKey('Period');
        g._tapDevice(centre(deviceBagSlotRects(body)[3]));
        assert.deepEqual(g._deviceSel, { tab: 'items', index: 3 });
    });

    test('the keyboard cursor walks the page on screen, and keeps its spot when the page turns', () => {
        const g = twoPages();
        g._deviceKey('ArrowRight');                       // shows the cursor on the first slot
        for (let i = 0; i < 3; i++) g._deviceKey('ArrowDown');
        const t1 = g._deviceTargets();
        const spot = t1.cur;
        assert.ok(spot >= SAFE_SLOTS, 'fixture: the cursor is on the PACK');
        assert.equal(g._deviceSel.index, spot);
        g._deviceKey('PageDown');
        const t2 = g._deviceTargets();
        assert.equal(t2.cur, spot, 'the cursor jumped on the screen');
        assert.equal(g._deviceSel.index, spot + PACK_PAGE);
        assert.equal(t2.ids[SAFE_SLOTS], INVENTORY_SIZE, 'the first PACK position is not slot 50 on page 2');
    });

    test('Space on a page-2 item opens its actions, and they act on that slot', () => {
        const g = twoPages();
        g._deviceKey('PageDown');
        g._tapDevice(centre(deviceBagSlotRects(body)[SAFE_SLOTS]));   // the soap
        g._deviceKey('Space');
        assert.equal(g._deviceSel.action, 0);
        const actions = itemActions(ITEMS.soap, 'pack');
        const drop = actions.findIndex(a => a.id === 'drop');
        assert.ok(drop >= 0, 'fixture: soap can be dropped');
        g._deviceActivate('action', drop);
        assert.equal(g.inventory[INVENTORY_SIZE], null, 'the drop did not empty the page-2 slot');
    });
});

// ── the drawn bag ───────────────────────────────────────────────────────────

// A renderer whose ctx records fills and whose font records text.
function rig() {
    const fills = [], texts = [];
    const ctx = new Proxy({ fillRect: (x, y, w, h) => fills.push({ x, y, w, h }) }, {
        get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })),
        set: (t, k, v) => { t[k] = v; return true; },
    });
    const r = Object.assign(Object.create(Renderer.prototype), {
        ctx, sprites: {},
        font: { measure: (s, sc = 1) => String(s).length * 4.8 * sc, drawText: (_c, s, x, y) => texts.push({ s: String(s), x, y }) },
    });
    return { r, fills, texts };
}

describe('the bag draws the page you are on', () => {
    const rects = deviceBagSlotRects(body);
    // The fallback icon square a filled slot draws when no sprite sheet is loaded.
    const iconAt = (fills, rect) => fills.some(f => f.x === rect.x + 9 && f.y === rect.y + 11 && f.w === 22 && f.h === 22);
    const game = (page) => {
        const inventory = new Array(INVENTORY_SIZE + PACK_PAGE).fill(null);
        inventory[INVENTORY_SIZE] = { itemDef: ITEMS.soap, count: 1 };   // first on page 2
        return { inventory, _bagPage: page, _deviceSel: null, equipment: {} };
    };

    test('page 1 shows an empty first PACK slot and the label 1/2', () => {
        const { r, fills, texts } = rig();
        r._drawHotbar(game(0), body);
        assert.ok(!iconAt(fills, rects[SAFE_SLOTS]), 'page 2 item drawn on page 1');
        assert.ok(texts.some(t => t.s === '1/2'), `no 1/2 label: ${texts.map(t => t.s).join(' | ')}`);
        assert.ok(texts.some(t => t.s === '<') && texts.some(t => t.s === '>'), 'the arrows were not drawn');
    });

    test('page 2 shows the page-2 item in the first PACK slot and the label 2/2', () => {
        const { r, fills, texts } = rig();
        r._drawHotbar(game(1), body);
        assert.ok(iconAt(fills, rects[SAFE_SLOTS]), 'the page-2 item was not drawn');
        assert.ok(texts.some(t => t.s === '2/2'));
    });

    test('a one-page bag draws no pager at all', () => {
        const { r, texts } = rig();
        r._drawHotbar({ inventory: new Array(INVENTORY_SIZE).fill(null), _bagPage: 0, _deviceSel: null, equipment: {} }, body);
        assert.ok(!texts.some(t => /^\d+\/\d+$/.test(t.s) || t.s === '<' || t.s === '>'), 'a pager on a one-page bag');
        assert.ok(texts.some(t => t.s === 'PACK'), 'fixture: the bag was drawn');
    });

    test('a stale page past the end draws the last page', () => {
        const { r, texts } = rig();
        r._drawHotbar(game(7), body);
        assert.ok(texts.some(t => t.s === '2/2'));
    });
});
