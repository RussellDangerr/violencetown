// gear-chooser-placement.test.js — GC1: each GEAR plate's chooser opens beside
// that plate, covers no plate, and keeps the empty note inside its panel
// (plans/gc1-gear-chooser-beside-plate.md). Taps, the keyboard cursor and the
// drawing all read the one rect. As in device-keys.test.js, main.js's real
// methods are lifted out of its source.

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
    gearChooserRect, gearEmptyNoteRect, rectsOverlap,
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
const centre = r => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const press = (g, ...codes) => { for (const c of codes) g._deviceKey(c); };

// Walk the cursor to a plate with arrow presses only, as a player would.
function walkTo(g, want) {
    let t = g._deviceTargets();
    if (t.cur < 0) { press(g, 'ArrowRight'); t = g._deviceTargets(); }
    const goal = t.ids.indexOf(want);
    assert.ok(goal >= 0, `no plate ${want}`);
    for (let n = 0; n < 40 && t.cur !== goal; n++) {
        const a = centre(t.rects[t.cur]), b = centre(t.rects[goal]);
        const dx = b.x - a.x, dy = b.y - a.y;
        const main = Math.abs(dx) >= Math.abs(dy);
        const before = t.cur;
        press(g, main ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft') : (dy > 0 ? 'ArrowDown' : 'ArrowUp'));
        t = g._deviceTargets();
        if (t.cur === before) { press(g, main ? (dy > 0 ? 'ArrowDown' : 'ArrowUp') : (dx > 0 ? 'ArrowRight' : 'ArrowLeft')); t = g._deviceTargets(); }
    }
    assert.equal(t.cur, goal, `cursor never reached ${want}`);
}

const body = deviceBodyRect();
const lay = deviceEquipLayout(body);
const plates = [...lay.slots, lay.leftHand];
const plateOf = key => plates.find(s => s.key === key);
const COUNTS = [0, 1, 2, 3, 4, 5, 6];
const inside = (a, b) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
// The gap between two rects along the axis they are apart on (0 when they touch).
const gap = (a, b) => Math.max(0, a.x - (b.x + b.w), b.x - (a.x + a.w), a.y - (b.y + b.h), b.y - (a.y + a.h));

describe('GC1 - where each plate chooser opens', () => {
    for (const pl of plates) {
        test(`${pl.label}: beside its plate, inside the body, covering no plate, for 0 to 6 rows`, () => {
            for (const n of COUNTS) {
                const p = gearChooserRect(body, n, pl.key);
                assert.ok(inside(p, body), `${n} rows: leaves the body ${JSON.stringify(p)}`);
                for (const o of plates) assert.ok(!rectsOverlap(p, o), `${n} rows: covers the ${o.label} plate`);
                assert.ok(gap(p, pl) <= 8, `${n} rows: ${gap(p, pl)}px from its own plate`);
                const rows = gearOptionRects(body, n, pl.key);
                assert.equal(rows.length, n);
                for (const r of rows) assert.ok(inside(r, p), `${n} rows: a row escapes the panel`);
            }
        });
    }

    test('with no key the chooser is where it always was, under HEAD', () => {
        const head = plateOf('top');
        for (const n of COUNTS) {
            assert.deepEqual(gearChooserRect(body, n), gearChooserRect(body, n, 'top'));
            assert.ok(gearChooserRect(body, n).y >= head.y + head.h);
        }
        assert.deepEqual(gearChooserRect(body, 2, 'nope'), gearChooserRect(body, 2));
    });

    test('the plates on the left open to their right and those on the right open to their left', () => {
        for (const key of ['sides', 'back', 'weapon']) assert.ok(gearChooserRect(body, 3, key).x > plateOf(key).x);
        for (const key of ['front', 'bottom', 'left']) assert.ok(gearChooserRect(body, 3, key).x < plateOf(key).x);
    });

    test('the empty note has room inside the panel, clear of its border', () => {
        for (const pl of plates) {
            const p = gearChooserRect(body, 0, pl.key), note = gearEmptyNoteRect(body, pl.key);
            assert.ok(note.x >= p.x + 4 && note.x + note.w <= p.x + p.w - 4, 'sideways');
            assert.ok(note.y >= p.y + 26, 'below the title band');
            assert.ok(note.y + note.h <= p.y + p.h - 8, 'clear of the bottom border');
        }
    });

    test('the renderer draws the empty note inside that room', () => {
        const texts = [];
        const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => { t[k] = v; return true; } });
        const r = Object.assign(Object.create(Renderer.prototype), {
            ctx, sprites: { uiPanel: null },
            font: { measure: (s, sc = 1) => String(s).length * 4.8 * sc, drawText: (c, text, x, y) => texts.push({ text, x, y }) },
        });
        for (const key of ['bottom', 'back']) {
            texts.length = 0;
            r._drawGearPicker({ _deviceSel: { tab: 'gear', slotKey: key, open: true, option: null }, equipment: {}, inventory: [] }, body);
            const note = texts.find(t => /^\[No /.test(t.text)), room = gearEmptyNoteRect(body, key);
            assert.ok(note, `${key}: the note was drawn`);
            assert.ok(note.x >= room.x && note.x <= room.x + room.w && note.y >= room.y && note.y + 12 <= room.y + room.h + 4, `${key}: note at ${note.x},${note.y} outside ${JSON.stringify(room)}`);
        }
    });
});

describe('GC1 - real keys open the FEET and BACK choosers where they are drawn', () => {
    const CASES = [
        { key: 'bottom', label: 'FEET', id: 'shoe_bags' },
        { key: 'back', label: 'BACK', id: 'red_cape' },
    ];
    for (const c of CASES) {
        const def = ITEMS[c.id];
        test(`${c.label}: Enter opens it, the cursor rows are the drawn rows, Enter equips`, () => {
            assert.ok(def && def.equipSlot === c.key, `${c.id} is a ${c.label} piece`);
            const g = makeGame(x => { x._deviceTab = 'gear'; put(x, 11, c.id); });
            walkTo(g, c.key);
            press(g, 'Enter');
            assert.equal(g._deviceSel.open, true);
            const t = g._deviceTargets();
            assert.equal(t.zone, 'option');
            const n = equipOptions(c.key, null, g.inventory).length;
            assert.ok(n >= 1);
            assert.deepEqual(t.rects, gearOptionRects(body, n, c.key), 'the cursor rows are the rows at the plate');
            assert.ok(!t.rects.some(r => rectsOverlap(r, plateOf(c.key))), 'no row sits on the plate');
            press(g, 'Enter');
            assert.equal(g.equipment[c.key], def);
            assert.ok(!g.inventory[11]);
        });
        test(`${c.label}: a tap at the centre of the drawn row equips it too`, () => {
            const g = makeGame(x => { x._deviceTab = 'gear'; put(x, 11, c.id); });
            g._tapDevice(centre(plateOf(c.key)));
            assert.equal(g._deviceSel.open, true);
            g._tapDevice(centre(gearOptionRects(body, 1, c.key)[0]));
            assert.equal(g.equipment[c.key], def);
        });
    }

    test('an empty chooser opens with no rows and no cursor target to confirm', () => {
        const g = makeGame(x => { x._deviceTab = 'gear'; });
        walkTo(g, 'bottom');
        press(g, 'Enter');
        assert.equal(g._deviceSel.open, true);
        assert.equal(g._deviceTargets().rects.length, 0);
    });
});
