// device-keys.test.js — C3: a keyboard cursor in the Remoticon.
//
// Every Remoticon action now goes through one step, _deviceActivate. A tap
// (_tapDevice) only resolves a point into a (zone, index); a key (_deviceKey)
// only moves a cursor and, on confirm, hands the cursor's (zone, index) to the
// same step. This file drives every action BOTH ways on two identical games and
// demands the same outcome, so the two paths cannot drift apart.
//
// main.js touches `document` at import, so — as in offer-wiring.test.js — the
// real methods are lifted out of the source and bound onto a small game object.
// The item, ring and layout functions they call are the real ones.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ITEMS, resolveUse, unequipItem } from '../game/items.js';
import { WEAPONS } from '../game/weapons.js';
import { addToInventory, moveToZone, zoneOf, pageCount, slotOnPage, pageOfSlot } from '../game/inventory.js';
import { INVENTORY_SIZE, SAFE_SLOTS, PACK_PAGE, MAX_STACK } from '../game/data.js';
import { itemActions, equipOptions } from '../game/inspector.js';
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

const STATE = liveConst('STATE');
const DIRS = liveConst('DIRS');
const audio = { playSfx() {} };
const FREE = {
    STATE, DIRS, audio, HIT_SLOP, DEVICE_TABS, deviceTabRect, cycleDeviceTab, deviceBodyRect,
    deviceBagSlotRects, deviceEquipLayout, deviceRingsLayout, inspectorActionRects, gearOptionRects,
    nearestRectInDir, itemActions, equipOptions, zoneOf, moveToZone, SAFE_SLOTS, INVENTORY_SIZE, PACK_PAGE, pageCount, slotOnPage, pageOfSlot, deviceBagPagerRects,
    MAX_STACK, resolveUse, unequipItem, slotRing, unslotRing,
};
const LIVE = [
    ['_tapDevice', 'pt'], ['_deviceActivate', 'zone, index'], ['_deviceTargets', ''],
    ['_deviceFocus', 't, i'], ['_deviceKey', 'code'], ['_deviceBack', ''],
    ['_deviceCycleTab', 'dir'], ['_closeDevice', ''], ['_closeCurrentMenu', ''],
    ['_scrollJournal', 'delta'], ['_pointInRect', 'p, r, slop = 0'], ['_removeFromSlot', 'slot'],
    ['_slotRing', 'slotKey, ringId'], ['_unslotRing', 'slotKey'],
].map(([n, p]) => [n, liveMethod(n, p, FREE)]);

const cfg = { size: INVENTORY_SIZE, safeSlots: SAFE_SLOTS, maxStack: MAX_STACK };

// A game in the open Remoticon. `setup` stocks it; both paths get the same one.
function makeGame(setup = () => {}) {
    const g = {
        state: STATE.DEVICE, _deviceTab: 'items', _deviceSel: null, _journalScroll: 0,
        inventory: new Array(INVENTORY_SIZE).fill(null),
        equipment: { weapon: WEAPONS.wooden_sword, top: null, bottom: null, front: null, back: null, sides: null },
        tempEquips: [], ownedRings: new Set(), ringSlots: {}, ringTier: 1,
        playerHp: 5, playerMaxHp: 20,
        logs: [], beats: 0, burned: 0, grants: 0,
        _log(m) { this.logs.push(m); },
        _render() {}, _resumeHeldWalk() {},
        _advanceWorld() { this.beats++; },
        _applyFireBlood() { this.burned++; },
        _refreshGrantedSkills() { this.grants++; },
        _addToInventory(def) { return addToInventory(this.inventory, def, cfg); },
    };
    for (const [n, fn] of LIVE) g[n] = fn;
    setup(g);
    return g;
}
const put = (g, i, id, count = 1) => { g.inventory[i] = { itemDef: ITEMS[id], count }; };

// Everything an action can change, in one comparable value.
function outcome(g) {
    return JSON.stringify({
        state: g.state,
        inventory: g.inventory.map(s => s && `${s.itemDef.id}x${s.count}`),
        equipment: Object.fromEntries(Object.entries(g.equipment).map(([k, v]) => [k, v && v.id])),
        tempEquips: g.tempEquips.map(t => t.itemDef.id),
        ringSlots: g.ringSlots, hp: g.playerHp, logs: g.logs, beats: g.beats, burned: g.burned,
    });
}

const centre = r => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const tap = (g, r) => g._tapDevice(centre(r));
const press = (g, ...codes) => { for (const c of codes) g._deviceKey(c); };

// Walk the keyboard cursor to target `want` (an id of the current level) with
// arrow presses only, the way a player would. Fails if the geometry cannot
// reach it.
function walkTo(g, want) {
    let t = g._deviceTargets();
    if (t.cur < 0) { press(g, 'ArrowRight'); t = g._deviceTargets(); }
    const goal = t.ids.indexOf(want);
    assert.ok(goal >= 0, `no target ${want} on this level`);
    for (let n = 0; n < 40 && t.cur !== goal; n++) {
        const a = centre(t.rects[t.cur]), b = centre(t.rects[goal]);
        const dx = b.x - a.x, dy = b.y - a.y;
        const code = Math.abs(dx) >= Math.abs(dy)
            ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft')
            : (dy > 0 ? 'ArrowDown' : 'ArrowUp');
        const before = t.cur;
        press(g, code);
        t = g._deviceTargets();
        if (t.cur === before) {   // blocked on the main axis: try the other one
            press(g, Math.abs(dx) >= Math.abs(dy) ? (dy > 0 ? 'ArrowDown' : 'ArrowUp') : (dx > 0 ? 'ArrowRight' : 'ArrowLeft'));
            t = g._deviceTargets();
        }
    }
    assert.equal(t.cur, goal, `cursor never reached ${want}`);
}

const body = deviceBodyRect();
const bag = deviceBagSlotRects(body);
const actionRect = a => inspectorActionRects(body)[a];
const plate = key => deviceEquipLayout(body).slots.find(s => s.key === key);
const optionRect = (i, n) => gearOptionRects(body, n)[i];
const socket = (g, key) => deviceRingsLayout(body, g).sockets.find(s => s.key === key);

// Each case: a setup, the taps, and the keys, for one Remoticon action.
const CASES = [
    {
        name: 'use (a bandage heals)', setup: g => put(g, 12, 'bandage', 2),
        taps: g => { tap(g, bag[12]); tap(g, actionRect(0)); },
        keys: g => { walkTo(g, 12); press(g, 'Enter', 'Enter'); },
        done: g => g.inventory[12].count === 1 && g.playerHp > 5 && g.beats === 1,
    },
    {
        name: 'equip (a hat from the bag)', setup: g => put(g, 14, 'foil_hat'),
        taps: g => { tap(g, bag[14]); tap(g, actionRect(0)); },
        keys: g => { walkTo(g, 14); press(g, 'Space', 'Space'); },
        done: g => g.equipment.top === ITEMS.foil_hat && !g.inventory[14],
    },
    {
        name: 'drink (Fire Blood)', setup: g => put(g, 3, 'fire_blood'),
        taps: g => { tap(g, bag[3]); tap(g, actionRect(0)); },
        keys: g => { walkTo(g, 3); press(g, 'Enter', 'Enter'); },
        done: g => g.burned === 1 && !g.inventory[3] && g.beats === 1,
    },
    {
        name: 'protect (pack to safe)', setup: g => put(g, 27, 'bandage'),
        taps: g => { tap(g, bag[27]); tap(g, actionRect(1)); },
        keys: g => { walkTo(g, 27); press(g, 'Enter', 'ArrowRight', 'Enter'); },
        done: g => !g.inventory[27] && g.inventory.slice(0, SAFE_SLOTS).some(x => x && x.itemDef.id === 'bandage'),
    },
    {
        name: 'unprotect (safe to pack)', setup: g => put(g, 2, 'bandage'),
        taps: g => { tap(g, bag[2]); tap(g, actionRect(1)); },
        keys: g => { walkTo(g, 2); press(g, 'Enter', 'KeyD', 'Enter'); },
        done: g => !g.inventory[2] && g.inventory.slice(SAFE_SLOTS).some(x => x && x.itemDef.id === 'bandage'),
    },
    {
        name: 'drop', setup: g => put(g, 33, 'foil_hat'),
        taps: g => { tap(g, bag[33]); tap(g, actionRect(2)); },
        keys: g => { walkTo(g, 33); press(g, 'Enter', 'ArrowRight', 'ArrowRight', 'Enter'); },
        done: g => g.inventory.every(x => !x),
    },
    {
        name: 'gear: equip from the chooser',
        setup: g => { g._deviceTab = 'gear'; put(g, 11, 'cardboard_cuirass'); },
        taps: g => { tap(g, plate('front')); tap(g, optionRect(0, 1)); },
        keys: g => { walkTo(g, 'front'); press(g, 'Enter', 'Enter'); },
        done: g => g.equipment.front === ITEMS.cardboard_cuirass && !g.inventory[11],
    },
    {
        name: 'gear: unequip (Bare)',
        setup: g => { g._deviceTab = 'gear'; g.equipment.top = ITEMS.foil_hat; },
        taps: g => { tap(g, plate('top')); tap(g, optionRect(0, 1)); },
        keys: g => { walkTo(g, 'top'); press(g, 'Enter', 'Enter'); },
        done: g => !g.equipment.top && g.inventory.some(x => x && x.itemDef.id === 'foil_hat'),
    },
    {
        name: 'gear: the second chooser row (Bare, past a bag item)',
        setup: g => { g._deviceTab = 'gear'; g.equipment.top = ITEMS.foil_hat; put(g, 20, 'foil_hat'); },
        taps: g => { tap(g, plate('top')); tap(g, optionRect(1, 2)); },
        keys: g => { walkTo(g, 'top'); press(g, 'Enter', 'ArrowDown', 'Enter'); },
        done: g => !g.equipment.top && g.inventory.reduce((n, x) => n + (x && x.itemDef.id === 'foil_hat' ? x.count : 0), 0) === 2,
    },
    {
        name: 'rings: slot a ring',
        setup: g => { g._deviceTab = 'rings'; g.ownedRings.add('rat_ring'); },
        taps: g => tap(g, socket(g, 'right:middle')),
        keys: g => { walkTo(g, 'right:middle'); press(g, 'Enter'); },
        done: g => g.ringSlots['right:middle'] === 'rat_ring',
    },
    {
        name: 'rings: unslot a ring',
        setup: g => { g._deviceTab = 'rings'; g.ownedRings.add('fire_ring'); g.ringSlots['left:ring'] = 'fire_ring'; },
        taps: g => tap(g, socket(g, 'left:ring')),
        keys: g => { walkTo(g, 'left:ring'); press(g, 'Space'); },
        done: g => !g.ringSlots['left:ring'],
    },
];

describe('C3 — keys and taps do the same thing for every Remoticon action', () => {
    for (const c of CASES) {
        test(c.name, () => {
            const before = outcome(makeGame(c.setup));
            const byTap = makeGame(c.setup); c.taps(byTap);
            const byKey = makeGame(c.setup); c.keys(byKey);
            assert.notEqual(outcome(byTap), before, 'the tap path did nothing — the case proves nothing');
            assert.equal(outcome(byKey), outcome(byTap));
            assert.ok(c.done(byTap), 'the tap did not do what the action says');
            assert.ok(c.done(byKey), 'the keys did not do what the action says');
        });
    }

    test('the cases cover every action the inspector offers, plus the chooser and the hands', () => {
        assert.deepEqual(CASES.map(c => c.name.split(' ')[0]).sort(),
            ['drink', 'drop', 'equip', 'gear:', 'gear:', 'gear:', 'protect', 'rings:', 'rings:', 'unprotect', 'use']);
    });
});

describe('C3 — the cursor', () => {
    test('arrows and WASD move the cursor and no longer cycle tabs', () => {
        const g = makeGame();
        press(g, 'ArrowRight');
        assert.deepEqual(g._deviceSel, { tab: 'items', index: 0 }, 'the first press shows the cursor on slot 0');
        press(g, 'ArrowRight', 'KeyD', 'ArrowDown', 'KeyS');
        assert.equal(g._deviceTab, 'items');
        assert.equal(g._deviceSel.index, 22);   // two right, then safe row -> pack row 0 -> pack row 1
        press(g, 'ArrowLeft', 'KeyA', 'ArrowUp', 'KeyW');
        assert.equal(g._deviceTab, 'items');
        assert.equal(g._deviceSel.index, 0);
    });

    test('[ and ] cycle tabs and drop the cursor; C/J/M/R still jump', () => {
        const g = makeGame();
        press(g, 'ArrowRight', 'BracketRight');
        assert.equal(g._deviceTab, 'gear');
        assert.equal(g._deviceSel, null);
        press(g, 'BracketLeft');
        assert.equal(g._deviceTab, 'items');
        press(g, 'KeyR'); assert.equal(g._deviceTab, 'rings');
        press(g, 'KeyJ'); assert.equal(g._deviceTab, 'quests');
    });

    test('the cursor stops at an edge instead of wrapping', () => {
        const g = makeGame();
        press(g, 'ArrowRight', 'ArrowLeft', 'ArrowUp');
        assert.equal(g._deviceSel.index, 0);
    });

    test('the cursor moves over empty slots too, and confirm there does nothing', () => {
        const g = makeGame();
        press(g, 'ArrowRight', 'ArrowRight', 'Enter');
        assert.deepEqual(g._deviceSel, { tab: 'items', index: 1 });
    });

    test('after a keyboard action the cursor stays on that slot', () => {
        const g = makeGame(x => put(x, 12, 'bandage', 2));
        walkTo(g, 12);
        press(g, 'Enter', 'Enter');
        assert.deepEqual(g._deviceSel, { tab: 'items', index: 12 });
        assert.equal(g.inventory[12].count, 1);
    });

    test('a tap still clears the selection after an action, as before', () => {
        const g = makeGame(x => put(x, 12, 'bandage', 2));
        tap(g, bag[12]); tap(g, actionRect(0));
        assert.equal(g._deviceSel, null);
    });

    test('a gear plate can hold the cursor without opening its chooser', () => {
        const g = makeGame(x => { x._deviceTab = 'gear'; });
        press(g, 'ArrowDown');
        assert.deepEqual(g._deviceSel, { tab: 'gear', slotKey: 'top' });
        assert.ok(!g._deviceSel.open);
        press(g, 'ArrowDown');
        assert.equal(g._deviceSel.slotKey, 'sides');
    });

    test('the weapon plate is not a cursor stop (it is inert to taps too)', () => {
        const g = makeGame(x => { x._deviceTab = 'gear'; });
        assert.ok(!g._deviceTargets().ids.includes('weapon'));
    });

    test('on the Quests tab up and down still scroll', () => {
        const g = makeGame(x => { x._deviceTab = 'quests'; });
        press(g, 'ArrowUp', 'KeyW');
        assert.equal(g._journalScroll, 2);
        press(g, 'ArrowDown');
        assert.equal(g._journalScroll, 1);
        assert.equal(g._deviceSel, null);
    });
});

describe('C3 — Esc steps back one level, and Esc again closes', () => {
    test('from an item\'s action buttons: back to the slot, then closed', () => {
        const g = makeGame(x => put(x, 0, 'bandage'));
        press(g, 'ArrowRight', 'Enter');
        assert.equal(g._deviceSel.action, 0);
        assert.equal(g._closeCurrentMenu(), true);
        assert.equal(g.state, STATE.DEVICE);
        assert.deepEqual(g._deviceSel, { tab: 'items', index: 0 });
        g._closeCurrentMenu();
        assert.equal(g.state, STATE.IDLE);
    });

    test('from an open gear chooser: back to the plate, then closed', () => {
        const g = makeGame(x => { x._deviceTab = 'gear'; x.equipment.top = ITEMS.foil_hat; });
        tap(g, plate('top'));
        assert.equal(g._deviceSel.open, true);
        g._closeCurrentMenu();
        assert.equal(g.state, STATE.DEVICE);
        assert.deepEqual(g._deviceSel, { tab: 'gear', slotKey: 'top' });
        g._closeCurrentMenu();
        assert.equal(g.state, STATE.IDLE);
    });

    test('with no inner level open, Esc closes at once (as before)', () => {
        const g = makeGame(x => put(x, 0, 'bandage'));
        tap(g, bag[0]);
        g._closeCurrentMenu();
        assert.equal(g.state, STATE.IDLE);
    });

    test('Tab still pockets the device', () => {
        const g = makeGame();
        press(g, 'Tab');
        assert.equal(g.state, STATE.IDLE);
    });
});

describe('C3 — the keys follow the ruling and need no modifier', () => {
    const at = mainSrc.indexOf('_deviceKey(code) {');
    const src = mainSrc.slice(at, mainSrc.indexOf('\n    }', at));

    test('_deviceKey reads only the key code, never a modifier', () => {
        assert.ok(at > 0);
        assert.doesNotMatch(src, /ctrlKey|altKey|metaKey|Control|Alt|Meta/);
    });

    test('the device keydown block hands every key to _deviceKey', () => {
        const block = mainSrc.slice(mainSrc.indexOf('if (this.state === STATE.DEVICE) {'));
        assert.match(block.slice(0, 200), /this\._deviceKey\(e\.code\)/);
    });

    test('the modifier guard still sits above it, so Ctrl/Alt/Meta chords never reach it', () => {
        const bind = mainSrc.indexOf('_bindInput() {');
        const guard = mainSrc.indexOf('if (e.ctrlKey || e.metaKey || e.altKey) return;', bind);
        const device = mainSrc.indexOf('this._deviceKey(e.code)', bind);
        assert.ok(bind > 0 && guard > bind && device > guard);
    });
});

describe('nearestRectInDir — moving by geometry', () => {
    const grid = (cols, rows) => {
        const r = [];
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) r.push({ x: x * 10, y: y * 10, w: 8, h: 8 });
        return r;
    };

    test('a grid steps one cell each way', () => {
        const g = grid(3, 3);
        assert.equal(nearestRectInDir(g, 4, 1, 0), 5);
        assert.equal(nearestRectInDir(g, 4, -1, 0), 3);
        assert.equal(nearestRectInDir(g, 4, 0, 1), 7);
        assert.equal(nearestRectInDir(g, 4, 0, -1), 1);
    });

    test('at an edge it stays put', () => {
        const g = grid(3, 3);
        assert.equal(nearestRectInDir(g, 2, 1, 0), 2);
        assert.equal(nearestRectInDir(g, 0, 0, -1), 0);
    });

    test('the plates around the figure step to their neighbours', () => {
        const plates = deviceEquipLayout(body).slots.filter(s => s.key !== 'weapon');
        const k = key => plates.findIndex(s => s.key === key);
        const step = (from, dx, dy) => plates[nearestRectInDir(plates, k(from), dx, dy)].key;
        assert.equal(step('top', 0, 1), 'sides');
        assert.equal(step('sides', 1, 0), 'front');
        assert.equal(step('front', -1, 0), 'sides');
        assert.equal(step('sides', 0, 1), 'back');
        assert.equal(step('back', 1, 0), 'bottom');
        assert.equal(step('bottom', 0, -1), 'front');
        assert.equal(step('front', 0, -1), 'top');
    });

    test('every bag slot is reachable from slot 0', () => {
        const seen = new Set([0]);
        const queue = [0];
        while (queue.length) {
            const i = queue.shift();
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const j = nearestRectInDir(bag, i, dx, dy);
                if (!seen.has(j)) { seen.add(j); queue.push(j); }
            }
        }
        assert.equal(seen.size, bag.length);
    });

    test('every armor plate is reachable from the head plate', () => {
        const plates = deviceEquipLayout(body).slots.filter(s => s.key !== 'weapon');
        const seen = new Set([0]);
        const queue = [0];
        while (queue.length) {
            const i = queue.shift();
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const j = nearestRectInDir(plates, i, dx, dy);
                if (!seen.has(j)) { seen.add(j); queue.push(j); }
            }
        }
        assert.equal(seen.size, plates.length);
    });

    test('right steps across the fingertips left to right, at every ring tier', () => {
        for (let tier = 0; tier <= 4; tier++) {
            const g = makeGame(x => { x._deviceTab = 'rings'; x.ringTier = tier; });
            const sockets = deviceRingsLayout(body, g).sockets;
            assert.ok(sockets.length > 0);
            press(g, 'ArrowRight');
            const visited = [g._deviceSel.key];
            for (let n = 1; n < sockets.length; n++) { press(g, 'KeyD'); visited.push(g._deviceSel.key); }
            const byX = [...sockets].sort((a, b) => a.x - b.x).map(s => s.key);
            assert.deepEqual(visited, byX, `tier ${tier}`);
            press(g, 'ArrowRight');
            assert.equal(g._deviceSel.key, byX[byX.length - 1], 'stops at the last socket');
        }
    });
});
