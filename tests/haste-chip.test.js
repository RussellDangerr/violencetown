import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Renderer, buffBarChips, HASTE_CHIP_LABEL, BUFF_CHIP } from '../game/renderer.js';
import { BitmapFont } from '../game/bitmap-font.js';
import { DOCK } from '../game/layout.js';
import { computeViewport } from '../game/viewport.js';
import { worldBeatPlan } from '../game/buffs.js';
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
    worldBeatPlan,
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
    ['_advanceWorld', ''], ['_armThrow', 'slot'], ['_doThrow', 'dir'], ['_doItemUse', 'item'],
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
        _hasteCharges: 0, _slowCharges: 0, _advanceWorldOnce() { this.beats++; },
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


globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
const FONT = new BitmapFont();

// A renderer whose font records each string it is asked to draw.
function rig() {
    const vp = computeViewport({ cssW: 3440, cssH: 1440, dpr: 1, dock: DOCK });
    const drawn = [];
    const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => { t[k] = v; return true; } });
    const r = Object.assign(Object.create(Renderer.prototype), {
        ctx, viewport: vp, canvas: { width: vp.backingW, height: vp.backingH },
        sprites: { uiPanel: null }, _fightFace: false, _hudFor: null, _hudFaceFor: null, _hudCache: null,
        font: { measure: (s, sc = 1) => FONT.measure(s, sc), drawText: (c, text, x, y) => drawn.push({ text, x, y }) },
    });
    return { r, drawn };
}
// What the buff bar says right now: [label, number] per chip.
function shown(g) {
    const { r, drawn } = rig();
    r._drawBuffBar(g);
    const out = [];
    for (let i = 0; i + 1 < drawn.length; i += 2) out.push([drawn[i].text, drawn[i + 1].text]);
    return out;
}

describe('fx49 — the haste chip', () => {
    test('no haste, no chip', () => {
        const g = makeGame();
        g.buffs = [];
        assert.deepEqual(shown(g), []);
        assert.equal(buffBarChips(g).length, 0);
    });

    test('drinking a Speed Poition from the bag with real keys shows a chip, and it counts down to gone', () => {
        const g = makeGame(h => put(h, 14, 'speed_poition'));
        g.buffs = [];
        pressMain(g, 14);
        // The drink is itself an action, and it spends one of the free ones.
        const left = ITEMS.speed_poition.poition.amount - 1;
        assert.ok(left >= 1, 'the poition leaves at least one free action');
        assert.equal(g._hasteCharges, left, g.logs.join(' | '));
        assert.equal(g.inventory[14], null, 'the poition was drunk');
        const label = HASTE_CHIP_LABEL.toUpperCase();
        assert.deepEqual(shown(g), [[label, `${left}`]]);
        for (let n = left - 1; n >= 0; n--) {
            g._advanceWorld();
            assert.equal(g._hasteCharges, n);
            assert.deepEqual(shown(g), n > 0 ? [[label, `${n}`]] : [], `after the action that leaves ${n}`);
        }
        assert.equal(g.beats, 0, 'the world stood still for every free action');
        g._advanceWorld();
        assert.equal(g.beats, 1, 'the next action moves the world again');
    });

    test('the chip sits after the real buffs and does not replace them', () => {
        const g = makeGame();
        g.buffs = [{ id: 'guard', name: 'Guard', turns: 2, type: 'buff' }];
        g._hasteCharges = 3;
        assert.deepEqual(shown(g), [['GUARD', '2'], [HASTE_CHIP_LABEL.toUpperCase(), '3']]);
    });
});
