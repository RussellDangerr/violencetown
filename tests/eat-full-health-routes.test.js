// eat-full-health-routes.test.js — fx55: the bottom bar's food and the bag's Eat row
// won't waste food at full health either (plans/fx55-bar-bag-eat-full-health.md).
//
// FX36 greyed the wheel's Eat at full health. Tapping or pressing Enter on the bar's food,
// and the Eat row of the bag's action list, still ate a Hot Dog for 0 HP. These tests lift
// the game's own methods and key branches out of main.js and run them for real (the
// technique of eat-choice.test.js): a real Enter keypress in IDLE, a real tap on the bar's
// cell, a real tap on a hotbar slot followed by a real Enter in the action list.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildXmbBar, resolveXmbSelection, xmbCategoryOf } from '../game/xmb.js';
import { ITEMS, resolveUse } from '../game/items.js';
import { xmbBarLayout, hudLayout, HIT_SLOP, DOCK } from '../game/layout.js';
import { computeViewport } from '../game/viewport.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const mainSrc = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
const classAt = mainSrc.indexOf('class Game {');

function liveMethod(signature, freeVars = {}) {
    const start = mainSrc.indexOf(signature, classAt);
    assert.ok(start > 0, `${signature} not found in main.js`);
    const end = mainSrc.indexOf('\n    }', start) + '\n    }'.length;
    const body = mainSrc.slice(start + signature.indexOf('('), end);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
}

// The one line of the IDLE key handler that says what Enter does.
function liveEnterKey(freeVars) {
    const at = mainSrc.indexOf("if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); this._useXmbCurrent(); return; }", classAt);
    assert.ok(at > 0, 'the IDLE Enter line was not found in main.js');
    const line = mainSrc.slice(at, mainSrc.indexOf('\n', at));
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function (e) { ${line} return 'fell-through'; }`)(...names.map(n => freeVars[n]));
}

// The ITEM_OVERLAY key branch, whole.
function liveOverlayKeys(freeVars) {
    const head = 'if (this.state === STATE.ITEM_OVERLAY) {';
    const from = mainSrc.indexOf(head, classAt);
    assert.ok(from > 0, 'the ITEM_OVERLAY key branch was not found in main.js');
    let depth = 0, i = from + head.length - 1;
    for (; i < mainSrc.length; i++) {
        if (mainSrc[i] === '{') depth++;
        else if (mainSrc[i] === '}' && --depth === 0) break;
    }
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function (e) { ${mainSrc.slice(from, i + 1)} }`)(...names.map(n => freeVars[n]));
}

const STATE = { IDLE: 'IDLE', ITEM_SELECTED: 'ITEM_SELECTED', ITEM_OVERLAY: 'ITEM_OVERLAY' };
let sfx = [];
const audio = { playSfx(name) { sfx.push(name); } };
const performance = { now: () => 0 };

const VP = computeViewport({ cssW: 3440, cssH: 1440, dpr: 1, dock: DOCK });
const HUD = hudLayout(VP, { fight: false });

const m = {
    _useXmbCurrent:        liveMethod('_useXmbCurrent() {', { buildXmbBar, resolveXmbSelection, STATE }),
    _tapXmbBar:            liveMethod('_tapXmbBar(pt) {', { buildXmbBar, resolveXmbSelection, xmbBarLayout, HIT_SLOP, audio }),
    _pointInRect:          liveMethod('_pointInRect(p, r, slop = 0) {'),
    _selectItem:           liveMethod('_selectItem(slot) {', { STATE }),
    _openItemOverlay:      liveMethod('_openItemOverlay() {', { STATE, audio, performance, contextualUses: () => [] }),
    _pickOverlay:          liveMethod('_pickOverlay(index) {', { STATE, audio, contextualUses: () => [] }),
};
const enterKey = liveEnterKey({ STATE });
const overlayKeys = liveOverlayKeys({ STATE, audio });

const HOT_DOG = ITEMS.hot_dog;          // food, heals 10
const BURGER = ITEMS.boardwalk_burger;  // food, heals 15
const stack = (itemDef, count = 1) => ({ itemDef, count });

// A food that heals nothing: same shape as a Hot Dog, no heal.
const PLAIN_FOOD = { id: 'plain_food', name: '[Plain Food]', category: 'ambro', useType: 'self', effect: 'none', consumable: true, fallbackColor: '#aa8866' };

function game({ hp, inventory, xmbCat = 'eat', xmbPick = {} }) {
    return {
        ...m,
        state: STATE.IDLE, inventory, xmbCat, xmbPick, equipment: {},
        playerHp: hp, playerMaxHp: 100, selectedSlot: -1,
        logs: [], used: [], turns: 0, renders: 0,
        overlayOptions: [], overlayCursor: 0,
        enemies: [],
        renderer: { _hud: () => HUD },
        _hud() { return HUD; },
        _log(msg) { this.logs.push(msg); },
        _render() { this.renders++; },
        _ensureParticleLoop() {}, _adjacentHostiles() { return []; },
        _advanceWorld() { this.turns++; },
        _removeFromSlot(i) { this.inventory[i] = null; },
        // The real resolver does the healing; the bag bookkeeping is the one thing stubbed.
        _doItemUse(def) {
            this.used.push(def.id);
            resolveUse(this, def, null, 1, 'weapon', this.selectedSlot);
            this.inventory[this.selectedSlot] = null;
            this.selectedSlot = -1;
            this.state = STATE.IDLE;
            this._advanceWorld();
        },
        pressEnter() { return enterKey.call(this, { code: 'Enter', preventDefault() {} }); },
        // A real tap on the bar's picked cell.
        tapPickedCell() {
            const bar = buildXmbBar(this.inventory);
            const sel = resolveXmbSelection(bar, this.xmbCat, this.xmbPick);
            const lay = xmbBarLayout(bar, HUD.bar, sel);
            const cell = lay.items.find(c => c.selected);
            assert.ok(cell, 'the bar shows no picked cell');
            return this._tapXmbBar({ x: cell.x + cell.w / 2, y: cell.y + cell.h / 2 });
        },
        // Tap hotbar slot i (what _tapHotbar does), then walk the action list to its first row.
        openBag(i, label = 'Eat') {
            this._selectItem(i);
            this._openItemOverlay();
            assert.equal(this.state, STATE.ITEM_OVERLAY);
            assert.equal(this.overlayOptions[0].label, label, `the first row is not ${label}`);
        },
        pressOverlayEnter() { overlayKeys.call(this, { code: 'Enter', preventDefault() {} }); },
    };
}

beforeEach(() => { sfx = []; });

describe('the bottom bar, at full health', () => {
    test('Enter on the bar\'s food uses nothing, passes no turn, and logs the line', () => {
        const g = game({ hp: 100, inventory: [stack(HOT_DOG)] });
        assert.equal(g.pressEnter(), undefined, 'Enter was not consumed by the bar');
        assert.deepEqual(g.used, []);
        assert.equal(g.turns, 0);
        assert.equal(g.inventory[0]?.itemDef.id, 'hot_dog', 'the Hot Dog was used up');
        assert.deepEqual(g.logs, ['[TEXT]']);
        assert.equal(g.playerHp, 100);
        assert.equal(g.selectedSlot, -1);
        assert.equal(g.state, STATE.IDLE);
    });

    test('a tap on the picked food cell uses nothing and logs the same line', () => {
        const g = game({ hp: 100, inventory: [stack(HOT_DOG)] });
        assert.equal(g.tapPickedCell(), true, 'the tap was not taken by the bar');
        assert.deepEqual(g.used, []);
        assert.equal(g.turns, 0);
        assert.equal(g.inventory[0]?.itemDef.id, 'hot_dog');
        assert.deepEqual(g.logs, ['[TEXT]']);
    });

    test('the food you picked on the bar is the one refused, and stays picked', () => {
        const g = game({ hp: 100, inventory: [stack(HOT_DOG), stack(BURGER)], xmbPick: { eat: 'boardwalk_burger' } });
        g.pressEnter();
        assert.deepEqual(g.used, []);
        assert.equal(g.xmbPick.eat, 'boardwalk_burger');
        assert.equal(g.inventory.filter(Boolean).length, 2);
    });

    test('a food that heals nothing is not refused', () => {
        const g = game({ hp: 100, inventory: [stack(PLAIN_FOOD)] });
        g.pressEnter();
        assert.deepEqual(g.used, ['plain_food']);
        assert.equal(g.turns, 1);
        assert.deepEqual(g.logs, []);
    });

    test('a drink that heals (bandage) is left to the old path, not refused', () => {
        const g = game({ hp: 100, inventory: [stack(ITEMS.bandage)], xmbCat: 'drink' });
        g._doItemUse = function (def) { this.used.push(def.id); };   // only whether the refusal lets it through
        assert.equal(xmbCategoryOf(ITEMS.bandage), 'drink');
        g.pressEnter();
        assert.deepEqual(g.used, ['bandage']);
        assert.ok(!g.logs.includes('[TEXT]'));
    });
});

describe('the bottom bar, hurt', () => {
    test('Enter eats the food you chose, once, and a turn passes', () => {
        const g = game({ hp: 50, inventory: [stack(HOT_DOG), stack(BURGER)], xmbPick: { eat: 'boardwalk_burger' } });
        g.pressEnter();
        assert.deepEqual(g.used, ['boardwalk_burger']);
        assert.equal(g.playerHp, 65);
        assert.equal(g.turns, 1);
        assert.equal(g.inventory[0]?.itemDef.id, 'hot_dog');
        assert.ok(!g.logs.includes('[TEXT]'));
    });

    test('a tap on the picked cell eats it', () => {
        const g = game({ hp: 99, inventory: [stack(HOT_DOG)] });
        assert.equal(g.tapPickedCell(), true);
        assert.deepEqual(g.used, ['hot_dog']);
        assert.equal(g.playerHp, 100);
        assert.equal(g.turns, 1);
    });
});

describe('the bag\'s Eat row', () => {
    test('at full health it uses nothing, passes no turn, and logs the same line', () => {
        const g = game({ hp: 100, inventory: [stack(HOT_DOG)] });
        g.openBag(0);
        g.pressOverlayEnter();
        assert.deepEqual(g.used, []);
        assert.equal(g.turns, 0);
        assert.equal(g.inventory[0]?.itemDef.id, 'hot_dog', 'the Hot Dog was used up');
        assert.deepEqual(g.logs, ['[TEXT]']);
        assert.equal(g.state, STATE.ITEM_SELECTED, 'the list should close back to the selected slot');
        assert.equal(g.playerHp, 100);
    });

    test('hurt, it eats the food in the slot you tapped', () => {
        const g = game({ hp: 60, inventory: [stack(HOT_DOG), stack(BURGER)] });
        g.openBag(1);
        g.pressOverlayEnter();
        assert.deepEqual(g.used, ['boardwalk_burger']);
        assert.equal(g.playerHp, 75);
        assert.equal(g.turns, 1);
        assert.equal(g.inventory[0]?.itemDef.id, 'hot_dog');
        assert.ok(!g.logs.includes('[TEXT]'));
    });

    test('a food that heals nothing is still eaten from the bag', () => {
        const g = game({ hp: 100, inventory: [stack(PLAIN_FOOD)] });
        g.openBag(0, 'Use');
        g.pressOverlayEnter();
        assert.deepEqual(g.used, ['plain_food']);
        assert.equal(g.turns, 1);
    });
});

describe('who the refusal covers', () => {
    test('a healing drink from the bag is not an Eat row, so it is not refused', () => {
        const g = game({ hp: 100, inventory: [stack(ITEMS.bandage)] });
        g.selectedSlot = 0;
        g._selectItem(0);
        g._openItemOverlay();
        assert.equal(g.overlayOptions[0].label, 'Drink');
        g._doItemUse = function (def) { this.used.push(def.id); };
        g.pressOverlayEnter();
        assert.deepEqual(g.used, ['bandage']);
        assert.ok(!g.logs.includes('[TEXT]'));
    });

    test('main.js leaves _doItemUse itself free of the check (the wheel shares it)', () => {
        const start = mainSrc.indexOf('_doItemUse(item) {', classAt);
        const body = mainSrc.slice(start, mainSrc.indexOf('\n    }', start));
        assert.ok(!body.includes('[TEXT]') && !body.includes('playerMaxHp'));
    });
});
