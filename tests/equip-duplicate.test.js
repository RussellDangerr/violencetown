// equip-duplicate.test.js — EQ1: equipping a second copy of what you already wear keeps both
// (plans/eq1-equip-duplicate-keeps-both.md). Same live-keys harness as equip-swap-slot.test.js.
//
// Equipping from slot 12 used to put the old sword in the first free pack slot and
// leave 12 empty under the cursor. Every case here presses real keys in the open
// Remoticon: the live _deviceKey / _deviceActivate lifted from main.js, which
// touches `document` at import, the way device-keys.test.js does.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ITEMS, resolveUse, unequipItem } from '../game/items.js';
import { WEAPONS, WEAPON_TIERS, ARMOR_TIERS, weaponClassOf } from '../game/weapons.js';
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
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
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
    nearestRectInDir, itemActions, equipOptions, zoneOf, moveToZone, SAFE_SLOTS, INVENTORY_SIZE, PACK_PAGE,
    pageCount, slotOnPage, pageOfSlot, deviceBagPagerRects, MAX_STACK, resolveUse, unequipItem, slotRing, unslotRing,
    weaponClassOf,
};
const LIVE = [
    ['_deviceActivate', 'zone, index'], ['_deviceTargets', ''], ['_deviceFocus', 't, i'], ['_deviceKey', 'code'],
    ['_removeFromSlot', 'slot'], ['_pointInRect', 'p, r, slop = 0'],
].map(([n, p]) => [n, liveMethod(n, p, FREE)]);

const handsBody = /_handsOf\(def\) \{ (return [^\n]*?;) \}/.exec(mainSrc);
assert.ok(handsBody, '_handsOf not found in main.js');
LIVE.push(['_handsOf', new Function('weaponClassOf', `return function (def) { ${handsBody[1]} }`)(weaponClassOf)]);

const cfg = { size: INVENTORY_SIZE, safeSlots: SAFE_SLOTS, maxStack: MAX_STACK };
const SWORD = WEAPONS.wooden_sword;           // one-hander
const WHIP = WEAPONS.lion_whip;               // one-hander
const GATOR = WEAPONS.gator_tail;             // one-hander
const GREAT = WEAPON_TIERS.great_sword[0];    // two-hander
const HELM = ITEMS.foil_hat;
const OTHER_HELM = ARMOR_TIERS.foil_hat[0];     // a second head piece

function makeGame({ right = SWORD, left = null, tab = 'items', bag = {} } = {}) {
    const g = {
        state: STATE.DEVICE, _deviceTab: tab, _deviceSel: null,
        inventory: new Array(INVENTORY_SIZE).fill(null),
        equipment: { weapon: right, left, top: null, bottom: null, front: null, back: null, sides: null },
        tempEquips: [], ownedRings: new Set(), ringSlots: {},
        logs: [], beats: 0,
        _log(m) { this.logs.push(m); },
        _render() {}, _refreshGrantedSkills() {}, _saveMoment() {},
        _advanceWorld() { this.beats++; },
        _addToInventory(def) { return addToInventory(this.inventory, def, cfg); },
    };
    for (const [n, fn] of LIVE) g[n] = fn;
    for (const [i, def] of Object.entries(bag)) g.inventory[+i] = { itemDef: def, count: 1 };
    return g;
}

const body = deviceBodyRect();
const centre = r => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const press = (g, ...codes) => { for (const c of codes) g._deviceKey(c); };

// Walk the keyboard cursor to target `want` with arrow presses only.
function walkTo(g, want) {
    let t = g._deviceTargets();
    if (t.cur < 0) { press(g, 'ArrowRight'); t = g._deviceTargets(); }
    const goal = t.ids.indexOf(want);
    assert.ok(goal >= 0, `no target ${want} on this level`);
    for (let n = 0; n < 60 && t.cur !== goal; n++) {
        const a = centre(t.rects[t.cur]), b = centre(t.rects[goal]);
        const dx = b.x - a.x, dy = b.y - a.y;
        const before = t.cur;
        press(g, Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft') : (dy > 0 ? 'ArrowDown' : 'ArrowUp'));
        t = g._deviceTargets();
        if (t.cur === before) {
            press(g, Math.abs(dx) >= Math.abs(dy) ? (dy > 0 ? 'ArrowDown' : 'ArrowUp') : (dx > 0 ? 'ArrowRight' : 'ArrowLeft'));
            t = g._deviceTargets();
        }
    }
    assert.equal(t.cur, goal, `cursor never reached ${want}`);
}

const layout = deviceEquipLayout(body);
const ids = g => g.inventory.map(s => s && s.itemDef.id);
const filled = g => ids(g).map((id, i) => (id ? i : -1)).filter(i => i >= 0);

const count = (g, id) => g.inventory.reduce((n, s) => n + (s && s.itemDef.id === id ? s.count : 0), 0)
    + Object.values(g.equipment).filter((d, i, a) => d && d.id === id && a.indexOf(d) === i).length;
const worn = (g, id) => Object.values(g.equipment).filter(d => d && d.id === id).length;

describe('EQ1 - a second copy keeps both', () => {
    test('GEAR tab, real keys: worn foil hat + 2 in the bag -> 3 in all, 1 worn, 2 in the bag', () => {
        const g = makeGame({ tab: 'gear', bag: { 12: HELM } });
        g.inventory[12].count = 2;
        g.equipment.top = HELM;
        assert.equal(count(g, 'foil_hat'), 3);
        g._deviceSel = { tab: 'gear', slotKey: 'top' };
        press(g, 'Enter', 'Enter');
        assert.equal(g.equipment.top, HELM);
        assert.equal(count(g, 'foil_hat'), 3);
        assert.equal(g.inventory.reduce((n, s) => n + (s ? s.count : 0), 0), 2, 'two in the bag');
        assert.ok(g.logs.some(m => /back in your bag/.test(m)));
    });

    test('a weapon: a second one over a held one puts the first back in the bag (right hand)', () => {
        const g = makeGame({ tab: 'gear', right: SWORD, bag: { 12: SWORD } });
        g._deviceSel = { tab: 'gear', slotKey: 'weapon' };
        press(g, 'Enter', 'Enter');
        assert.equal(count(g, 'wooden_sword'), 2);
        assert.equal(g.inventory[12].itemDef, SWORD);
        assert.equal(g.equipment.weapon, SWORD);
    });

    test('the left hand: a second copy over the held left one keeps both', () => {
        const g = makeGame({ tab: 'gear', right: SWORD, left: WHIP, bag: { 12: WHIP } });
        g._deviceSel = { tab: 'gear', slotKey: 'bottom' };
        press(g, 'ArrowDown', 'Enter', 'Enter');
        assert.equal(g.equipment.left, WHIP);
        assert.equal(count(g, 'lion_whip'), 2);
        assert.equal(g.inventory[12].itemDef, WHIP);
    });

    test('a two-hander over the same two-hander keeps both copies', () => {
        const g = makeGame({ right: GREAT, left: GREAT, bag: { 12: GREAT } });
        walkTo(g, 12);
        press(g, 'Enter', 'Enter');
        assert.equal(g.equipment.weapon, GREAT);
        assert.equal(g.inventory[12].itemDef, GREAT);
        assert.equal(filled(g).length, 1);
    });

    test('no copy from nothing: the chooser never lists the worn piece, and a one-copy swap stays one', () => {
        const g = makeGame({ tab: 'gear', right: SWORD, left: GATOR, bag: { 12: WHIP } });
        const total = () => count(g, 'wooden_sword') + count(g, 'lion_whip') + count(g, 'gator_tail');
        const before = total();
        g._deviceSel = { tab: 'gear', slotKey: 'weapon' };
        press(g, 'Enter', 'Enter');   // bag whip into the right hand
        assert.equal(total(), before);
        assert.equal(worn(g, 'wooden_sword'), 0);
        assert.equal(g.inventory[12].itemDef, SWORD);
        const rows = equipOptions('weapon', g.equipment.weapon, g.inventory);
        assert.ok(rows.every(r => r.bagIndex < 0 || g.inventory[r.bagIndex]), 'rows come from the bag only');
    });
});
