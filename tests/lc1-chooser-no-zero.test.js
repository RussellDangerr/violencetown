// lc1-chooser-no-zero.test.js — the left-hand GEAR chooser draws no meaningless 0
// (plans/lc1-chooser-no-zero.md). Its rows are weapons, which carry no armour, so
// each one read "0". A left-plate row now shows a number only when the armour
// changes; an armour plate keeps its dim 0 for an equal piece.
//
// The GEAR methods are lifted from main.js and driven by a real tap on the plate
// and real key presses, the way left-hand-plate.test.js does; the open chooser is
// then drawn by the real _drawEquipmentModal against a recording font.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ITEMS, resolveUse, unequipItem, gearOptions } from '../game/items.js';
import { WEAPONS, weaponClassOf } from '../game/weapons.js';
import { addToInventory, moveToZone, zoneOf, pageCount, slotOnPage, pageOfSlot } from '../game/inventory.js';
import { INVENTORY_SIZE, SAFE_SLOTS, PACK_PAGE, MAX_STACK } from '../game/data.js';
import { itemActions, equipOptions } from '../game/inspector.js';
import { slotRing, unslotRing } from '../game/rings.js';
import {
    HIT_SLOP, DEVICE_TABS, deviceTabRect, cycleDeviceTab, deviceBodyRect, deviceBagSlotRects, deviceBagPagerRects,
    deviceEquipLayout, deviceRingsLayout, inspectorActionRects, gearOptionRects, nearestRectInDir,
} from '../game/layout.js';
import { Renderer } from '../game/renderer.js';
import { UI } from '../game/ui-sprites.js';

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
    ['_tapDevice', 'pt'], ['_deviceActivate', 'zone, index'], ['_deviceTargets', ''],
    ['_deviceFocus', 't, i'], ['_deviceKey', 'code'], ['_pointInRect', 'p, r, slop = 0'],
    ['_removeFromSlot', 'slot'],
].map(([n, p]) => [n, liveMethod(n, p, FREE)]);
const handsBody = /_handsOf\(def\) \{ (return [^\n]*?;) \}/.exec(mainSrc);
assert.ok(handsBody, '_handsOf not found in main.js');
LIVE.push(['_handsOf', new Function('weaponClassOf', `return function (def) { ${handsBody[1]} }`)(weaponClassOf)]);

const cfg = { size: INVENTORY_SIZE, safeSlots: SAFE_SLOTS, maxStack: MAX_STACK };
const SWORD = WEAPONS.wooden_sword;
const WHIP = WEAPONS.lion_whip;
const HELM = Object.values(ITEMS).find(d => d.useType === 'equip' && d.equipSlot === 'top');
// Head pieces with the same armour, and one with more, so an armour chooser has a
// dim 0, a green number and a red number to compare against.
const HELM_A = { ...HELM, id: 'lc1_helm_a', name: 'Helm A', armor: 2 };
const HELM_B = { ...HELM, id: 'lc1_helm_b', name: 'Helm B', armor: 2 };
const HELM_C = { ...HELM, id: 'lc1_helm_c', name: 'Helm C', armor: 4 };
// A weapon that adds armour, so a left-plate row can have a real difference.
const SHIELDED = { ...WHIP, id: 'lc1_shielded_whip', name: 'Shielded Whip', armor: 3 };

function makeGame({ right = SWORD, left = null, top = null, bag = [] } = {}) {
    const g = {
        state: STATE.DEVICE, _deviceTab: 'gear', _deviceSel: null,
        inventory: new Array(INVENTORY_SIZE).fill(null),
        equipment: { weapon: right, left, top, bottom: null, front: null, back: null, sides: null },
        tempEquips: [], ownedRings: new Set(), ringSlots: {},
        logs: [], saves: 0,
        _log(m) { this.logs.push(m); },
        _render() {}, _advanceWorld() {}, _refreshGrantedSkills() {},
        _saveMoment() { this.saves++; },
        _addToInventory(def) { return addToInventory(this.inventory, def, cfg); },
    };
    for (const [n, fn] of LIVE) g[n] = fn;
    for (const def of bag) g._addToInventory(def);
    return g;
}

const body = deviceBodyRect();
const layout = deviceEquipLayout(body);
const plateOf = key => (key === 'left' ? layout.leftHand : layout.slots.find(s => s.key === key));
const centre = r => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const tapRect = (g, r) => g._tapDevice(centre(r));

// Draw the whole tab (the open chooser rides on it), recording every text.
function drawn(g) {
    const texts = [];
    const ctx = new Proxy({}, {
        get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })),
        set: (t, k, v) => { t[k] = v; return true; },
    });
    const r = Object.assign(Object.create(Renderer.prototype), {
        ctx, sprites: { uiPanel: null },
        font: { measure: (s, sc = 1) => String(s).length * 4.8 * sc, drawText: (c, text, x, y, o = {}) => texts.push({ text, x, y, color: o.color, align: o.align }) },
        _drawItemIcon() {}, _drawSafeBadge() {},
    });
    r._drawEquipmentModal(g, body);
    return texts;
}
// The numbers drawn at each chooser row's right edge, one list per row.
function rowNumbers(g, texts) {
    const rows = gearOptionRects(body, gearOptions(g, g._deviceSel.slotKey).length);
    return rows.map(r => texts
        .filter(t => t.align === 'right' && t.x === r.x + r.w - 8 && t.y >= r.y && t.y < r.y + r.h)
        .map(t => ({ text: t.text, color: t.color })));
}

describe('the left-hand chooser (opened by a real tap on the plate)', () => {
    test('two weapons in the bag and one held: every row is listed and none draws a number', () => {
        const g = makeGame({ left: WHIP, bag: [SWORD, WEAPONS.ray_gun] });
        tapRect(g, plateOf('left'));
        assert.equal(g._deviceSel.slotKey, 'left');
        assert.ok(g._deviceSel.open);
        const opts = gearOptions(g, 'left');
        assert.equal(opts.length, 3, 'two weapons and the Bare row');
        assert.ok(opts.some(o => o.id === '__bare__'));
        const texts = drawn(g);
        assert.ok(texts.some(t => t.text === 'Bare (remove)'), 'the Bare row is drawn');
        assert.ok(texts.some(t => t.text === SWORD.name.replace(/[\[\]]/g, '')), 'a weapon row is drawn');
        const nums = rowNumbers(g, texts);
        assert.equal(nums.length, opts.length);
        nums.forEach((n, i) => assert.deepEqual(n, [], `row ${i} (${opts[i].id}) draws no number`));
    });

    test('a left-plate row whose armour changes still draws its green or red number', () => {
        const g = makeGame({ left: SHIELDED, bag: [SWORD] });
        tapRect(g, plateOf('left'));
        const opts = gearOptions(g, 'left');
        const nums = rowNumbers(g, drawn(g));
        assert.deepEqual(nums[opts.findIndex(o => o.id === SWORD.id)], [{ text: '-3', color: UI.hpRed }]);
        assert.deepEqual(nums[opts.findIndex(o => o.id === '__bare__')], [{ text: '-3', color: UI.hpRed }]);

        const h = makeGame({ left: null, bag: [SHIELDED] });
        tapRect(h, plateOf('left'));
        assert.deepEqual(rowNumbers(h, drawn(h))[0], [{ text: '+3', color: UI.buff }]);
    });

    test('tapping a row still equips it, and the keyboard cursor lands on every row', () => {
        const g = makeGame({ left: WHIP, bag: [SWORD, WEAPONS.ray_gun] });
        tapRect(g, plateOf('left'));
        const n = gearOptions(g, 'left').length;
        assert.equal(n, 3);
        g._deviceSel.option = 0;
        const seen = [0];
        for (let i = 1; i < n; i++) { g._deviceKey('ArrowDown'); seen.push(g._deviceSel.option); }
        assert.deepEqual(seen, [0, 1, 2], 'the cursor stepped through every row');
        tapRect(g, gearOptionRects(body, n)[0]);
        assert.equal(g.equipment.left, SWORD);
        assert.equal(g._deviceSel, null);
    });
});

describe('an armour chooser is unchanged', () => {
    test('an equal piece still draws its dim 0; a better piece green, Bare red', () => {
        const g = makeGame({ top: HELM_A, bag: [HELM_B, HELM_C] });
        tapRect(g, plateOf('top'));
        assert.equal(g._deviceSel.slotKey, 'top');
        const opts = gearOptions(g, 'top');
        const nums = rowNumbers(g, drawn(g));
        const at = id => opts.findIndex(o => o.id === id);
        assert.ok(at(HELM_B.id) >= 0 && at(HELM_C.id) >= 0 && at('__bare__') >= 0);
        assert.deepEqual(nums[at(HELM_B.id)], [{ text: '0', color: UI.dim }]);
        assert.deepEqual(nums[at(HELM_C.id)], [{ text: '+2', color: UI.buff }]);
        assert.deepEqual(nums[at('__bare__')], [{ text: '-2', color: UI.hpRed }]);
    });
});
