// gear-right-plate.test.js — the GEAR tab's WEAPON [RIGHT] plate opens a chooser
// of the bag's weapons (plans/fx57-gear-right-plate-chooser.md). It used to be
// skipped on purpose, so clicking it did nothing.
//
// main.js touches `document` at import, so the live GEAR methods are lifted from
// its source and run for real, the way left-hand-plate.test.js does: a tap, a key
// press and a chooser row all go through _tapDevice / _deviceKey /
// _deviceActivate, the same entry points the GEAR tab calls (the keydown handler
// calls _deviceKey(e.code); the pointer handler calls _tapDevice(point)).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ITEMS, resolveUse, unequipItem, gearOptions } from '../game/items.js';
import { WEAPONS, WEAPON_TIERS, weaponClassOf } from '../game/weapons.js';
import { addToInventory, moveToZone, zoneOf, pageCount, slotOnPage, pageOfSlot } from '../game/inventory.js';
import { INVENTORY_SIZE, SAFE_SLOTS, PACK_PAGE, MAX_STACK } from '../game/data.js';
import { itemActions, equipOptions } from '../game/inspector.js';
import { slotRing, unslotRing } from '../game/rings.js';
import {
    HIT_SLOP, DEVICE_TABS, deviceTabRect, cycleDeviceTab, deviceBodyRect, deviceBagSlotRects, deviceBagPagerRects,
    deviceEquipLayout, deviceRingsLayout, inspectorActionRects, gearOptionRects, gearChooserRect, nearestRectInDir,
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

// _handsOf is a one-liner, so it is lifted the way two-hands.test.js does.
const handsBody = /_handsOf\(def\) \{ (return [^\n]*?;) \}/.exec(mainSrc);
assert.ok(handsBody, '_handsOf not found in main.js');
LIVE.push(['_handsOf', new Function('weaponClassOf', `return function (def) { ${handsBody[1]} }`)(weaponClassOf)]);

const cfg = { size: INVENTORY_SIZE, safeSlots: SAFE_SLOTS, maxStack: MAX_STACK };
const SWORD = WEAPONS.wooden_sword;           // one-hander
const WHIP = WEAPONS.lion_whip;               // another one-hander
const GREAT = WEAPON_TIERS.great_sword[0];    // a two-hander
const HELM = Object.values(ITEMS).find(d => d.useType === 'equip' && d.equipSlot === 'top');

function makeGame({ right = SWORD, left = null, bag = [] } = {}) {
    const g = {
        state: STATE.DEVICE, _deviceTab: 'gear', _deviceSel: null,
        inventory: new Array(INVENTORY_SIZE).fill(null),
        equipment: { weapon: right, left, top: null, bottom: null, front: null, back: null, sides: null },
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
const centre = r => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const layout = deviceEquipLayout(body);
const rightPlate = layout.slots.find(s => s.key === 'weapon');
const tapRect = (g, r) => g._tapDevice(centre(r));
const press = (g, ...codes) => { for (const c of codes) g._deviceKey(c); };
const bagIds = g => g.inventory.filter(Boolean).map(s => s.itemDef.id);

describe('the right-hand plate, by tap', () => {
    test('the plate is the one labelled WEAPON [RIGHT]', () => {
        assert.equal(rightPlate.label, 'WEAPON [RIGHT]');
    });

    test('a tap on it opens a chooser; a tap on a row wields that weapon in the right hand', () => {
        const g = makeGame({ bag: [WHIP] });
        tapRect(g, rightPlate);
        assert.deepEqual(g._deviceSel, { tab: 'gear', slotKey: 'weapon', open: true });
        tapRect(g, gearOptionRects(body, 1)[0]);
        assert.equal(g.equipment.weapon, WHIP);
        assert.equal(g.equipment.left, null, 'the left hand is untouched');
        assert.deepEqual(bagIds(g), [SWORD.id], 'the swapped-out weapon is back in the bag');
        assert.equal(g._deviceSel, null);
        assert.equal(g.saves, 1, 'saved like any other GEAR swap');
    });

    test('it is the same result as the ITEMS tab Equip button (bag, hands, log)', () => {
        const viaPlate = makeGame({ bag: [WHIP] });
        tapRect(viaPlate, rightPlate);
        tapRect(viaPlate, gearOptionRects(body, 1)[0]);
        const viaItems = makeGame({ bag: [WHIP] });
        const idx = viaItems.inventory.findIndex(s => s && s.itemDef === WHIP);
        viaItems._removeFromSlot(idx);
        const msg = resolveUse(viaItems, WHIP, null, 1, 'weapon', idx);
        assert.equal(viaPlate.equipment.weapon, viaItems.equipment.weapon);
        assert.equal(viaPlate.equipment.left, viaItems.equipment.left);
        assert.deepEqual(bagIds(viaPlate), bagIds(viaItems));
        assert.ok(msg && viaPlate.logs.includes(msg));
    });

    test('a two-hander chosen here fills both hands and bags what it pushed out', () => {
        const g = makeGame({ left: WHIP, bag: [GREAT] });
        tapRect(g, rightPlate);
        tapRect(g, gearOptionRects(body, 1)[0]);
        assert.equal(g.equipment.weapon, GREAT);
        assert.equal(g.equipment.left, GREAT);
        assert.deepEqual(bagIds(g).sort(), [SWORD.id, WHIP.id].sort());
    });

    test('every weapon in the bag is a row, and armour is not', () => {
        assert.ok(HELM, 'a head piece exists');
        const g = makeGame({ bag: [WHIP, HELM, GREAT] });
        tapRect(g, rightPlate);
        assert.equal(g._deviceTargets().rects.length, 2);
        tapRect(g, gearOptionRects(body, 2)[1]);
        assert.equal(g.equipment.weapon, GREAT);
    });
});

describe('the right-hand plate, by keyboard', () => {
    test('the cursor reaches it: BACK steps down to it, and it steps right to the left-hand plate', () => {
        const g = makeGame({ bag: [WHIP] });
        g._deviceSel = { tab: 'gear', slotKey: 'back' };
        press(g, 'ArrowDown');
        assert.equal(g._deviceSel.slotKey, 'weapon');
        assert.ok(g._deviceTargets().ids.includes('weapon'));
        press(g, 'ArrowRight');
        assert.equal(g._deviceSel.slotKey, 'left');
        press(g, 'ArrowLeft');
        assert.equal(g._deviceSel.slotKey, 'weapon');
    });

    test('Enter opens the chooser on its first row, Enter again wields it', () => {
        const g = makeGame({ bag: [WHIP] });
        g._deviceSel = { tab: 'gear', slotKey: 'weapon' };
        press(g, 'Enter');
        assert.ok(g._deviceSel.open && g._deviceSel.slotKey === 'weapon');
        assert.equal(g._deviceSel.option, 0);
        press(g, 'Enter');
        assert.equal(g.equipment.weapon, WHIP);
        assert.deepEqual(bagIds(g), [SWORD.id]);
    });

    test('the arrow keys walk the rows and Enter takes the one under the cursor', () => {
        const g = makeGame({ bag: [WHIP, GREAT] });
        g._deviceSel = { tab: 'gear', slotKey: 'weapon' };
        press(g, 'Enter', 'ArrowDown', 'Enter');
        assert.equal(g.equipment.weapon, GREAT);
    });

    test('every plate is a cursor stop and HEAD still steps down to ARMS', () => {
        const g = makeGame();
        g._deviceSel = { tab: 'gear', slotKey: 'top' };
        press(g, 'ArrowDown');
        assert.equal(g._deviceSel.slotKey, 'sides');
        const ids = g._deviceTargets().ids;
        for (const k of ['top', 'sides', 'front', 'back', 'bottom', 'weapon', 'left']) assert.ok(ids.includes(k), k);
    });
});

describe('the right hand is never emptied from the chooser', () => {
    test('there is no Bare row, however many weapons are in the bag', () => {
        for (const bag of [[WHIP], [WHIP, GREAT], []]) {
            const g = makeGame({ bag });
            tapRect(g, rightPlate);
            assert.equal(g._deviceTargets().rects.length, bag.length, `${bag.length} weapons: ${bag.length} rows`);
        }
    });

    test('with an empty bag the chooser has no rows: Enter does nothing, a tap outside dismisses it', () => {
        const g = makeGame();
        g._deviceSel = { tab: 'gear', slotKey: 'weapon' };
        press(g, 'Enter');
        assert.ok(g._deviceSel.open);
        press(g, 'Enter');
        assert.equal(g.equipment.weapon, SWORD, 'the right hand still holds its weapon');
        g._tapDevice({ x: body.x + 2, y: body.y + 2 });
        assert.equal(g._deviceSel, null);
        assert.equal(g.equipment.weapon, SWORD);
        assert.deepEqual(g.logs, []);
    });

    test('the left-hand plate keeps its Bare row for a held left weapon', () => {
        const g = makeGame({ left: WHIP });
        tapRect(g, layout.leftHand);
        assert.deepEqual(gearOptions(g, 'left').map(o => o.id), ['__bare__']);
        assert.equal(g._deviceTargets().rects.length, 1);
    });
});

describe('the renderer draws the right-hand chooser', () => {
    function rig() {
        const texts = [];
        const ctx = new Proxy({}, {
            get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })),
            set: (t, k, v) => { t[k] = v; return true; },
        });
        const r = Object.assign(Object.create(Renderer.prototype), {
            ctx, sprites: { uiPanel: null },
            font: { measure: (s, sc = 1) => String(s).length * 4.8 * sc, drawText: (c, text, x, y) => texts.push({ text, x, y }) },
            _drawItemIcon() {}, _drawSafeBadge() {},
        });
        return { r, texts };
    }

    test('it is titled for the hand, lists the bag weapons and draws no Bare row or number', () => {
        const g = makeGame({ bag: [WHIP, GREAT] });
        g._deviceSel = { tab: 'gear', slotKey: 'weapon', open: true };
        const { r, texts } = rig();
        r._drawEquipmentModal(g, body);
        assert.ok(texts.some(t => t.text === 'WEAPON [RIGHT] — CHOOSE'));
        assert.ok(texts.some(t => /Lion Whip/.test(t.text)));
        assert.ok(!texts.some(t => /Bare/.test(t.text)), 'no Bare row');
        assert.ok(!texts.some(t => t.text === '0'), 'no meaningless 0');
    });

    test('the rows drawn are the rows tapped (same count and order)', () => {
        const g = makeGame({ bag: [WHIP, GREAT] });
        g._deviceSel = { tab: 'gear', slotKey: 'weapon', open: true };
        const { r, texts } = rig();
        r._drawEquipmentModal(g, body);
        const n = g._deviceTargets().rects.length;
        assert.equal(n, 2);
        const rows = gearOptionRects(body, n);
        const drawn = texts.filter(t => rows.some(row => t.x === row.x + 8 && t.y === row.y + row.h / 2 - 4));
        assert.equal(drawn.length, n);
        assert.match(drawn[0].text, /Lion Whip/);
    });

    test('the open chooser covers neither weapon plate', () => {
        for (let n = 0; n <= 6; n++) {
            const panel = gearChooserRect(body, n);
            assert.ok(!rectsOverlap(panel, rightPlate) && !rectsOverlap(panel, layout.leftHand), `${n} rows`);
        }
    });
});
