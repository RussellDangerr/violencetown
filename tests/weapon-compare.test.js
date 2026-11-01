// weapon-compare.test.js — FX44: comparing weapons (plans/fx44-weapon-compare.md).
//
// A weapon shows one compare block wherever you meet it: damage against the
// weapon in your right hand, its hands and class, its reach and pull, and the
// skills it grants. This file checks the block's model, then drives the three
// places a player sees it the way a player does:
//
//   the bag      Tab opens it, arrow keys land on a weapon, the inspector panel draws
//   examine      E at a weapon on the ground, the examine panel draws
//   the shop     the trade screen, arrow keys onto a row, the description strip draws
//
// main.js touches `document` at import, so (as in title-space.test.js) the real
// _bindInput and the methods it reaches are lifted out of the source and bound
// onto a small game object. They register on a real EventTarget standing in for
// `document`, and the tests dispatch keydown events through it: nothing here
// calls _openDevice, _deviceKey or doExamine directly. What is drawn is read off
// the real Renderer, with a font that records the text it is asked to draw.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ITEMS, resolveUse, unequipItem } from '../game/items.js';
import { WEAPONS } from '../game/weapons.js';
import { zoneOf, moveToZone, pageCount, slotOnPage, pageOfSlot } from '../game/inventory.js';
import { INVENTORY_SIZE, SAFE_SLOTS, PACK_PAGE, MAX_STACK } from '../game/data.js';
import { itemActions, equipOptions } from '../game/inspector.js';
import { weaponCompare, weaponCompareLines, isComparableWeapon, doExamine } from '../game/examine.js';
import { emptyOffer } from '../game/offer.js';
import {
    HIT_SLOP, DEVICE_TABS, deviceTabRect, cycleDeviceTab, deviceBodyRect, deviceBagSlotRects, deviceBagPagerRects,
    deviceEquipLayout, deviceRingsLayout, inspectorActionRects, inspectorPanelRect, gearOptionRects, nearestRectInDir,
    MODAL_RECT, offerLayout, OFFER_ROWS_VISIBLE,
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

// ── The model ────────────────────────────────────────────────────────────────

const SWORD = WEAPONS.wooden_sword;
const strip = s => s.replace(/[\[\]]/g, '');

describe('weaponCompare — the block', () => {
    test('damage reads against the weapon in hand, up or down', () => {
        assert.equal(weaponCompare(WEAPONS.gator_tail, SWORD).damage, '16 dmg (+6 vs Wooden Sword)');
        assert.equal(weaponCompare(SWORD, WEAPONS.gator_tail).damage, '10 dmg (-6 vs Gator Tail)');
    });

    test('equal damage says so, and a bare hand has no difference to show', () => {
        assert.equal(weaponCompare(SWORD, SWORD).damage, '10 dmg (same as Wooden Sword)');
        assert.equal(weaponCompare(SWORD, null).damage, '10 dmg');
        assert.equal(weaponCompare(SWORD, undefined).damage, '10 dmg');
    });

    test('a non-physical weapon names its damage type', () => {
        assert.equal(weaponCompare(WEAPONS.ray_gun, SWORD).damage, 'energy 22 dmg (+12 vs Wooden Sword)');
    });

    test('hands and class come from the class table; reach and pull from the weapon', () => {
        assert.equal(weaponCompare(WEAPONS.fearmur, SWORD).build, '1 hand, hammer');
        assert.equal(weaponCompare(WEAPONS.lion_whip, SWORD).build, '1 hand, whip, reach 3, pulls 1');
        const twoHander = { id: 'big', name: '[Big]', equipSlot: 'weapon', damage: 30, weaponClass: 'great_sword' };
        assert.equal(weaponCompare(twoHander, SWORD).build, '2 hands, great sword');
    });

    test('granted skills are named from the skill tables, with their cost', () => {
        assert.equal(weaponCompare(WEAPONS.fearmur, SWORD).grants, 'Grants: Boo! (8 MP)');
        assert.equal(weaponCompare(WEAPONS.ray_gun, SWORD).grants, 'Grants: Ray Blast (6 GP)');
        assert.equal(weaponCompare(WEAPONS.lion_whip, SWORD).grants, 'Grants: Hire Lire (50 GP)');
        assert.equal(weaponCompare(WEAPONS.gator_tail, SWORD).grants, null);
    });

    test('everything that is not a weapon gets no block', () => {
        assert.equal(weaponCompare(ITEMS.soap, SWORD), null);
        assert.equal(weaponCompare(ITEMS.rock, SWORD), null);
        assert.equal(weaponCompareLines(null, SWORD), null);
        assert.equal(isComparableWeapon(ITEMS.bandage), false);
        assert.equal(isComparableWeapon(ITEMS.pipe), true);
    });

    test('every weapon the game ships builds a block with a hand count', () => {
        for (const def of [...Object.values(WEAPONS), ITEMS.pipe]) {
            const c = weaponCompare(def, SWORD);
            assert.ok(c, `${def.id} has no block`);
            assert.match(c.build, /^[12] hands?/, def.id);
        }
    });
});

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
    ['_deviceCycleTab', 'dir'], ['_closeDevice', ''], ['_openDevice', "tab = 'items'"],
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

// ── The bag ──────────────────────────────────────────────────────────────────

describe('the bag: Tab, arrow keys, and the inspector panel', () => {
    const body = deviceBodyRect();
    const panel = inspectorPanelRect(body);
    const buttonsTop = inspectorActionRects(body)[0].y;

    function bagGame(page, stack) {
        return makeGame(page, g => { stack.forEach((def, i) => { g.inventory[i] = { itemDef: def, count: 1 }; }); });
    }

    test('Tab opens the bag; the first arrow lands on a weapon and its block is drawn', () => {
        const page = makePage();
        const g = bagGame(page, [WEAPONS.fearmur, WEAPONS.lion_whip]);
        press(page, 'Tab');
        assert.equal(g.state, STATE.DEVICE, 'Tab did not open the bag');
        press(page, 'ArrowRight');
        assert.deepEqual(g._deviceSel, { tab: 'items', index: 0 });

        const { r, texts } = rig();
        r._drawDevice(g);
        const lines = said(texts);
        assert.ok(lines.includes('14 dmg (+4 vs Wooden Sword)'), lines.join(' | '));
        assert.ok(lines.includes('1 hand, hammer'));
        assert.ok(lines.includes('Grants: Boo! (8 MP)'));
        assert.ok(!lines.includes('14 dmg'), 'the bare stat line is still drawn');
    });

    test('the next arrow moves to the next weapon and the block follows', () => {
        const page = makePage();
        const g = bagGame(page, [WEAPONS.fearmur, WEAPONS.lion_whip]);
        press(page, 'Tab');
        press(page, 'ArrowRight');
        press(page, 'ArrowRight');
        assert.equal(g._deviceSel.index, 1);
        const { r, texts } = rig();
        r._drawDevice(g);
        const lines = said(texts);
        assert.ok(lines.includes('12 dmg (+2 vs Wooden Sword)'));
        assert.ok(lines.includes('1 hand, whip, reach 3, pulls 1'));
        assert.ok(lines.includes('Grants: Hire Lire (50 GP)'));
        assert.ok(!lines.includes('14 dmg (+4 vs Wooden Sword)'), 'the last weapon\'s block is still up');
    });

    test('the difference follows what is in the right hand', () => {
        const page = makePage();
        const g = bagGame(page, [WEAPONS.fearmur]);
        g.equipment.weapon = WEAPONS.gator_tail;
        press(page, 'Tab');
        press(page, 'ArrowRight');
        const { r, texts } = rig();
        r._drawDevice(g);
        assert.ok(said(texts).includes('14 dmg (-2 vs Gator Tail)'), said(texts).join(' | '));
    });

    test('every drawn line sits inside the panel and above the buttons', () => {
        const page = makePage();
        const g = bagGame(page, [WEAPONS.lion_whip]);   // the longest block: three lines
        press(page, 'Tab');
        press(page, 'ArrowRight');
        const { r, texts, font } = rig();
        r._drawDevice(g);
        const mine = texts.filter(t => /dmg|hand|Grants/.test(t.s));
        assert.equal(mine.length, 3);
        for (const t of mine) {
            assert.ok(t.x >= panel.x && t.x + font.measure(t.s, t.scale) <= panel.x + panel.w, `${t.s} runs off the panel`);
            assert.ok(t.y + 12 <= buttonsTop, `${t.s} runs into the buttons`);
        }
        // and the zone label under them does too
        const zone = texts.find(t => /^(SAFE|PACK)/.test(t.s) && t.y > panel.y);
        assert.ok(zone && zone.y + 12 <= buttonsTop, 'the SAFE/PACK label runs into the buttons');
    });

    test('a thing that is not a weapon keeps its old stat line', () => {
        const page = makePage();
        const g = bagGame(page, [ITEMS.bandage]);
        press(page, 'Tab');
        press(page, 'ArrowRight');
        const { r, texts } = rig();
        r._drawDevice(g);
        assert.ok(said(texts).includes('Heals 25 HP'), said(texts).join(' | '));
        assert.ok(!said(texts).some(s => /Grants|\bhands?\b/.test(s)));
    });
});

// ── Examine ──────────────────────────────────────────────────────────────────

describe('examine: E at a weapon on the ground', () => {
    function groundGame(page, type) {
        // facing down from (5,5): the tile in front is (5,6)
        return makeGame(page, g => { g.groundItems = [{ type, x: 5, y: 6 }]; });
    }

    test('E opens the examine panel; it carries the description and the block', () => {
        const page = makePage();
        const g = groundGame(page, 'fearmur');
        press(page, 'KeyE');
        assert.equal(g.state, STATE.INSPECT, 'E did not open the examine panel');
        assert.match(g.inspect.body, /^A single femur/);
        assert.match(g.inspect.body, /14 dmg \(\+4 vs Wooden Sword\)\n1 hand, hammer\nGrants: Boo! \(8 MP\)$/);

        const { r, texts } = rig();
        r._drawInspectPanel(g);
        const lines = said(texts);
        assert.ok(lines.includes('14 dmg (+4 vs Wooden Sword)'), lines.join(' | '));
        assert.ok(lines.includes('1 hand, hammer'));
        assert.ok(lines.includes('Grants: Boo! (8 MP)'));
    });

    test('the log line is the one it always was', () => {
        const page = makePage();
        const g = groundGame(page, 'fearmur');
        press(page, 'KeyE');
        assert.equal(g.logs.length, 1);
        assert.match(g.logs[0], /^\[\[Fearmur\] \(\w+\)\. A single femur/);
        assert.doesNotMatch(g.logs[0], /dmg/);
    });

    test('the panel is tall enough for its lines, which stay inside it', () => {
        const page = makePage();
        const g = groundGame(page, 'lion_whip');
        press(page, 'KeyE');
        const { r, texts, font } = rig();
        r._drawInspectPanel(g);
        const block = texts.filter(t => /dmg|hand|Grants/.test(t.s));
        assert.equal(block.length, 3);
        const close = texts.find(t => /CLOSE/.test(t.s));
        for (const t of block) {
            assert.ok(t.y + 12 <= close.y, `${t.s} runs into the close hint`);
            assert.ok(t.x + font.measure(t.s, t.scale) < 24 + 400 + 200, 'sanity: within the canvas');
        }
    });

    test('an ordinary item on the ground is described as before', () => {
        const page = makePage();
        const g = groundGame(page, 'soap');
        press(page, 'KeyE');
        assert.equal(g.inspect.body, ITEMS.soap.description);
    });
});

// ── The shop ─────────────────────────────────────────────────────────────────

describe('the shop: the description strip for the highlighted row', () => {
    const L = offerLayout(MODAL_RECT);

    function shopGame(page, stock) {
        return makeGame(page, g => {
            g._offerNpc = {
                type: 'Smith', vendor: true, stock, disposition: 60, values: {},
                entity: { isAlive: () => true },
            };
            g._offer = { ...emptyOffer(), scroll: { theirs: 0, yours: 0 }, selection: null, goldPinned: false };
            g._offerCursor = { side: 'yours', index: 0 };
            g.state = STATE.TRADE;
            g._offerBlocker = () => null;
            g._goldTray = () => null;
            g._stagedCount = () => 0;
            g._audio = audio;
        });
    }

    function stripLines(r, texts, g) {
        r._drawOfferDescription(g, L);
        return texts.filter(t => t.y >= L.desc.y && t.y < L.desc.y + L.desc.h);
    }

    test('Right, Down: the row\'s weapon shows damage against the one in hand, hands, class', () => {
        const page = makePage();
        const g = shopGame(page, ['gator_tail']);
        press(page, 'ArrowRight');     // to their goods
        press(page, 'ArrowDown');      // onto the first row
        assert.deepEqual(g._offer.selection, { side: 'theirs', index: 0 });
        const { r, texts } = rig();
        const rows = stripLines(r, texts, g);
        const lines = said(rows);
        assert.ok(lines.some(s => s.startsWith('16 dmg (+6 vs Wooden Sword)') && s.includes('1 hand, hammer')), lines.join(' | '));
    });

    test('a weapon that grants a skill names it on the row under', () => {
        const page = makePage();
        const g = shopGame(page, ['ray_gun']);
        press(page, 'ArrowRight');
        press(page, 'ArrowDown');
        const { r, texts } = rig();
        const lines = said(stripLines(r, texts, g));
        assert.ok(lines.some(s => s.startsWith('energy 22 dmg (+12 vs Wooden Sword)') && s.includes('1 hand, wand')), lines.join(' | '));
        assert.ok(lines.includes('Grants: Ray Blast (6 GP)'));
    });

    test('your own weapon in your satchel gets the same block', () => {
        const page = makePage();
        const g = shopGame(page, ['gator_tail']);
        g.inventory[0] = { itemDef: WEAPONS.lion_whip, count: 1 };
        press(page, 'ArrowDown');      // yours, row 0
        assert.deepEqual(g._offer.selection, { side: 'yours', index: 0 });
        const { r, texts } = rig();
        const lines = said(stripLines(r, texts, g));
        assert.ok(lines.some(s => s.startsWith('12 dmg (+2 vs Wooden Sword)') && s.includes('reach 3, pulls 1')), lines.join(' | '));
        assert.ok(lines.includes('Grants: Hire Lire (50 GP)'));
    });

    test('every drawn line sits inside the strip', () => {
        const page = makePage();
        const g = shopGame(page, ['lion_whip']);
        press(page, 'ArrowRight');
        press(page, 'ArrowDown');
        const { r, texts, font } = rig();
        const rows = stripLines(r, texts, g);
        assert.ok(rows.length >= 3, 'header and two rows');
        for (const t of rows) {
            assert.ok(t.x >= L.desc.x && t.x + font.measure(t.s, t.scale) <= L.desc.x + L.desc.w, `${t.s} runs off the strip`);
            assert.ok(t.y + 12 <= L.desc.y + L.desc.h, `${t.s} runs off the bottom of the strip`);
        }
    });

    test('something that is not a weapon keeps its description there', () => {
        const page = makePage();
        const g = shopGame(page, ['soap']);
        press(page, 'ArrowRight');
        press(page, 'ArrowDown');
        const { r, texts } = rig();
        const lines = said(stripLines(r, texts, g));
        assert.ok(lines.some(s => s.startsWith('Industrial-grade lye bar')), lines.join(' | '));
        assert.ok(!lines.some(s => /\bdmg\b/.test(s)));
    });
});
