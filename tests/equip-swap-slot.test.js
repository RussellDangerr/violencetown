// equip-swap-slot.test.js — FX34: the piece you swap out lands in the slot the new
// one came from (plans/fx34-swap-lands-in-slot.md).
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

describe('FX34 — a bag equip puts the swapped-out piece in the slot it came from', () => {
    test('the card\'s case: equipping from slot 12 puts the old sword in slot 12', () => {
        const g = makeGame({ bag: { 12: WHIP } });
        walkTo(g, 12);
        press(g, 'Enter', 'Enter');
        assert.equal(g.equipment.weapon, WHIP);
        assert.equal(g.inventory[12].itemDef, SWORD);
        assert.deepEqual(filled(g), [12], 'nothing else lands in the first free slot');
        assert.equal(g.beats, 1, 'an equip still costs the beat it always did');
        assert.deepEqual(g._deviceSel, { tab: 'items', index: 12 }, 'the cursor is still on the slot, now holding the sword');
    });

    test('a far slot works the same, and so does a safe slot', () => {
        for (const slot of [2, 27, 31]) {
            const g = makeGame({ bag: { [slot]: WHIP } });
            walkTo(g, slot);
            press(g, 'Space', 'Space');
            assert.equal(g.inventory[slot].itemDef, SWORD, `slot ${slot}`);
            assert.deepEqual(filled(g), [slot], `slot ${slot}`);
        }
    });

    test('armour follows the rule: the worn piece goes where the new one was', () => {
        const g = makeGame({ bag: { 19: OTHER_HELM } });
        g.equipment.top = HELM;
        walkTo(g, 19);
        press(g, 'Enter', 'Enter');
        assert.equal(g.equipment.top, OTHER_HELM);
        assert.equal(g.inventory[19].itemDef, HELM);
        assert.deepEqual(filled(g), [19]);
    });

    test('a stack of two leaves one behind, and the swapped-out piece takes the next free place', () => {
        const g = makeGame({ bag: { 12: WHIP } });
        g.inventory[12].count = 2;
        walkTo(g, 12);
        press(g, 'Enter', 'Enter');
        assert.equal(g.equipment.weapon, WHIP);
        assert.equal(g.inventory[12].count, 1, 'one whip still in the slot');
        assert.equal(g.inventory[12].itemDef, WHIP);
        assert.ok(ids(g).includes('wooden_sword'), 'the sword is in the bag somewhere');
    });

    test('a two-hander from slot 12: the right-hand piece lands there, the left-hand one in the next free slot', () => {
        const g = makeGame({ left: GATOR, bag: { 12: GREAT } });
        walkTo(g, 12);
        press(g, 'Enter', 'Enter');
        assert.equal(g.equipment.weapon, GREAT);
        assert.equal(g.equipment.left, GREAT);
        assert.equal(g.inventory[12].itemDef, SWORD);
        assert.deepEqual(ids(g).filter(Boolean).sort(), ['gator_tail', 'wooden_sword']);
        assert.equal(filled(g).length, 2);
    });

    test('putting down a two-hander for a one-hander: the two-hander lands in slot 12, once', () => {
        const g = makeGame({ right: GREAT, left: GREAT, bag: { 12: WHIP } });
        walkTo(g, 12);
        press(g, 'Enter', 'Enter');
        assert.equal(g.equipment.weapon, WHIP);
        assert.equal(g.equipment.left, null);
        assert.equal(g.inventory[12].itemDef, GREAT);
        assert.deepEqual(filled(g), [12]);
    });
});

describe('FX34 — the GEAR tab follows the same rule', () => {
    test('the left hand: equipping from slot 12 puts the old left item in slot 12', () => {
        const g = makeGame({ tab: 'gear', left: GATOR, bag: { 12: WHIP } });
        g._deviceSel = { tab: 'gear', slotKey: 'bottom' };
        press(g, 'ArrowDown');
        assert.equal(g._deviceSel.slotKey, 'left');
        press(g, 'Enter', 'Enter');
        assert.equal(g.equipment.left, WHIP);
        assert.equal(g.equipment.weapon, SWORD, 'the right hand is untouched');
        assert.equal(g.inventory[12].itemDef, GATOR);
        assert.deepEqual(filled(g), [12]);
    });

    test('the left plate with a two-hander from slot 12: the pushed-out pair, the right piece first, lands from slot 12', () => {
        const g = makeGame({ tab: 'gear', left: GATOR, bag: { 12: GREAT } });
        g._deviceSel = { tab: 'gear', slotKey: 'bottom' };
        press(g, 'ArrowDown', 'Enter', 'Enter');
        assert.equal(g.equipment.weapon, GREAT);
        assert.equal(g.equipment.left, GREAT);
        assert.equal(g.inventory[12].itemDef, SWORD);
        assert.deepEqual(ids(g).filter(Boolean).sort(), ['gator_tail', 'wooden_sword']);
    });

    test('an armour plate: the worn piece goes to the slot the chosen one came from', () => {
        const g = makeGame({ tab: 'gear', bag: { 21: OTHER_HELM } });
        g.equipment.top = HELM;
        walkTo(g, 'top');
        press(g, 'Enter', 'Enter');
        assert.equal(g.equipment.top, OTHER_HELM);
        assert.equal(g.inventory[21].itemDef, HELM);
        assert.deepEqual(filled(g), [21]);
    });

    test('Bare has no source slot, so it still takes the first free one', () => {
        const g = makeGame({ tab: 'gear' });
        g.equipment.top = HELM;
        walkTo(g, 'top');
        press(g, 'Enter', 'Enter');
        assert.equal(g.equipment.top, null);
        assert.deepEqual(filled(g).length, 1);
        assert.equal(g.inventory.find(Boolean).itemDef, HELM);
    });
});

describe('FX34 — the plain resolveUse call is unchanged', () => {
    test('with no slot named, the swapped-out piece goes to the first free place as before', () => {
        const g = makeGame({ bag: { 12: WHIP } });
        g.inventory[12] = null;
        resolveUse(g, WHIP, null);
        assert.equal(g.equipment.weapon, WHIP);
        assert.deepEqual(filled(g), [SAFE_SLOTS], 'the first free pack slot');
    });

    test('a named slot that is still occupied is not overwritten', () => {
        const g = makeGame({ bag: { 12: GATOR } });
        resolveUse(g, WHIP, null, 1, 'weapon', 12);
        assert.equal(g.inventory[12].itemDef, GATOR);
        assert.ok(ids(g).includes('wooden_sword'));
    });
});
