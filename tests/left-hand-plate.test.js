// left-hand-plate.test.js — the GEAR tab has a left-hand plate
// (plans/fx14-gear-left-hand-plate.md). Two hands added equipment.left; the tab
// drew one weapon plate and the equip path only ever filled the right hand.
//
// main.js touches `document` at import, so the live GEAR methods are lifted from
// its source and run for real, the way device-keys.test.js does: a tap, a key
// press and a chooser row all go through _tapDevice / _deviceKey /
// _deviceActivate, the same entry points the GEAR tab calls.
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
import { playerPanel } from '../game/fight-panels.js';
import {
    HIT_SLOP, DEVICE_TABS, deviceTabRect, cycleDeviceTab, deviceBodyRect, deviceBagSlotRects, deviceBagPagerRects,
    deviceEquipLayout, deviceRingsLayout, inspectorActionRects, gearOptionRects, gearChooserRect, nearestRectInDir,
    rectsOverlap, EQUIP_SLOT_RECTS,
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
        logs: [], grants: 0, saves: 0,
        _log(m) { this.logs.push(m); },
        _render() {}, _advanceWorld() {}, _refreshGrantedSkills() { this.grants++; },
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
const leftPlate = layout.leftHand;
const tapRect = (g, r) => g._tapDevice(centre(r));
const bagNames = g => g.inventory.filter(Boolean).map(s => s.itemDef.id);

describe('the left-hand plate on the GEAR tab', () => {
    test('GEAR lays out a left-hand plate beside the six, labelled with the existing WEAPON [LEFT]', () => {
        assert.equal(leftPlate.key, 'left');
        assert.equal(leftPlate.label, 'WEAPON [LEFT]');
        assert.equal(layout.slots.length, EQUIP_SLOT_RECTS.length, 'the six-plate list is unchanged');
        assert.ok(!layout.slots.some(s => s.key === 'left'));
        assert.equal(layout.slots.find(s => s.key === 'weapon').label, 'WEAPON [RIGHT]');
    });

    test('the plate sits inside the body and overlaps no other plate', () => {
        assert.ok(leftPlate.x >= body.x && leftPlate.y >= body.y);
        assert.ok(leftPlate.x + leftPlate.w <= body.x + body.w && leftPlate.y + leftPlate.h <= body.y + body.h);
        for (const s of layout.slots) assert.ok(!rectsOverlap(leftPlate, s), `overlaps the ${s.key} plate`);
    });

    test('an open chooser (any row count) leaves the left-hand plate and the right-hand plate in view', () => {
        for (let n = 0; n <= 6; n++) {
            const panel = gearChooserRect(body, n);
            assert.ok(!rectsOverlap(panel, leftPlate), `${n} rows cover the left-hand plate`);
            assert.ok(!rectsOverlap(panel, layout.slots.find(s => s.key === 'weapon')));
        }
    });
});

describe('equipping from the left-hand plate (through the GEAR tab entry points)', () => {
    test('a tap on the plate opens a chooser of the bag weapons; a tap on a row puts it in the LEFT hand', () => {
        const g = makeGame({ bag: [WHIP] });
        tapRect(g, leftPlate);
        assert.deepEqual(g._deviceSel, { tab: 'gear', slotKey: 'left', open: true });
        assert.deepEqual(gearOptions(g, 'left').map(o => o.id), ['lion_whip'], 'no Bare row: the left hand is empty');
        tapRect(g, gearOptionRects(body, 1)[0]);
        assert.equal(g.equipment.left, WHIP);
        assert.equal(g.equipment.weapon, SWORD, 'the right hand is untouched');
        assert.deepEqual(bagNames(g), []);
        assert.equal(g._deviceSel, null);
        assert.equal(g.saves, 1, 'the swap is saved like any other GEAR swap');
    });

    test('the keyboard reaches the plate and equips the same way', () => {
        const g = makeGame({ bag: [WHIP] });
        g._deviceSel = { tab: 'gear', slotKey: 'bottom' };
        g._deviceKey('ArrowDown');
        assert.equal(g._deviceSel.slotKey, 'left', 'FEET steps down to the left-hand plate');
        g._deviceKey('Enter');
        assert.ok(g._deviceSel.open && g._deviceSel.slotKey === 'left');
        assert.equal(g._deviceSel.option, 0);
        g._deviceKey('Enter');
        assert.equal(g.equipment.left, WHIP);
        assert.equal(g.equipment.weapon, SWORD);
    });

    test('HEAD still steps down to ARMS, not to the new plate', () => {
        const g = makeGame();
        g._deviceSel = { tab: 'gear', slotKey: 'top' };
        g._deviceKey('ArrowDown');
        assert.equal(g._deviceSel.slotKey, 'sides');
    });

    test('a weapon already in the left hand goes back to the bag when another replaces it', () => {
        const g = makeGame({ left: WHIP, bag: [SWORD] });
        tapRect(g, leftPlate);
        assert.deepEqual(gearOptions(g, 'left').map(o => o.id), ['wooden_sword', '__bare__']);
        tapRect(g, gearOptionRects(body, 2)[0]);
        assert.equal(g.equipment.left, SWORD);
        assert.equal(g.equipment.weapon, SWORD);
        assert.deepEqual(bagNames(g), ['lion_whip']);
    });

    test('Bare takes the left item off into the bag, leaving the right hand alone', () => {
        const g = makeGame({ left: WHIP });
        tapRect(g, leftPlate);
        tapRect(g, gearOptionRects(body, 1)[0]);
        assert.equal(g.equipment.left, null);
        assert.equal(g.equipment.weapon, SWORD);
        assert.deepEqual(bagNames(g), ['lion_whip']);
    });

    test('a two-hander chosen from the left plate fills both hands and bags what it pushed out', () => {
        const g = makeGame({ left: WHIP, bag: [GREAT] });
        tapRect(g, leftPlate);
        tapRect(g, gearOptionRects(body, 2)[0]);
        assert.equal(g.equipment.weapon, GREAT);
        assert.equal(g.equipment.left, GREAT);
        assert.deepEqual(bagNames(g).sort(), ['lion_whip', 'wooden_sword']);
    });

    test('a one-hander chosen from the left plate frees a held two-hander from both hands', () => {
        const g = makeGame({ right: GREAT, left: GREAT, bag: [WHIP] });
        tapRect(g, leftPlate);
        tapRect(g, gearOptionRects(body, 1)[0]);   // no Bare row: half a two-hander can't come off alone
        assert.equal(g.equipment.left, WHIP);
        assert.equal(g.equipment.weapon, null);
        assert.deepEqual(bagNames(g), [GREAT.id]);
    });

    test('while the left hand is half of a two-hander the chooser has no Bare row, and a tap off the rows changes nothing', () => {
        const g = makeGame({ right: GREAT, left: GREAT });
        assert.deepEqual(gearOptions(g, 'left'), []);
        tapRect(g, leftPlate);
        assert.equal(g._deviceTargets().rects.length, 0, 'the live chooser has no rows either');
        g._tapDevice({ x: body.x + 2, y: body.y + 2 });
        assert.equal(g._deviceSel, null, 'the chooser dismissed');
        assert.equal(g.equipment.left, GREAT);
        assert.equal(g.equipment.weapon, GREAT);
    });

    test('the drawn rows and the tapped rows are the same list (renderer reads gearOptions)', () => {
        const g = makeGame({ left: WHIP, bag: [SWORD, GREAT] });
        g._deviceSel = { tab: 'gear', slotKey: 'left', open: true };
        const t = g._deviceTargets();
        assert.equal(t.zone, 'option');
        assert.equal(t.rects.length, gearOptions(g, 'left').length);
    });

    test('the ITEMS-tab equip still fills the right hand (the default hand is unchanged)', () => {
        const g = makeGame({ right: SWORD });
        resolveUse(g, WHIP, null);
        assert.equal(g.equipment.weapon, WHIP);
        assert.equal(g.equipment.left, null);
        assert.deepEqual(bagNames(g), ['wooden_sword']);
    });

    test('an armour plate still lists armour, not weapons', () => {
        assert.ok(HELM, 'a head piece exists');
        const g = makeGame({ bag: [HELM, SWORD] });
        assert.deepEqual(gearOptions(g, 'top').map(o => o.id), [HELM.id]);
    });
});

describe('the fight panel shows the left-hand item', () => {
    test('after an equip from the left plate, the panel names it on its WEAPON [LEFT] row (a two-hander on both)', () => {
        const g = makeGame({ bag: [WHIP] });
        tapRect(g, leftPlate);
        tapRect(g, gearOptionRects(body, 1)[0]);
        const row = k => playerPanel(g).slots.find(s => s.key === k);
        assert.equal(row('left').label, 'WEAPON [LEFT]');
        assert.equal(row('left').name, WHIP.name);
        assert.equal(row('weapon').name, SWORD.name);

        const h = makeGame({ bag: [GREAT] });
        tapRect(h, leftPlate);
        tapRect(h, gearOptionRects(body, 1)[0]);
        const both = k => playerPanel(h).slots.find(s => s.key === k).name;
        assert.equal(both('left'), GREAT.name);
        assert.equal(both('weapon'), GREAT.name);
    });
});

describe('the renderer draws the plate', () => {
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

    test('the tab draws WEAPON [LEFT] and the left-hand item name on the left plate', () => {
        const g = makeGame({ left: WHIP });
        const { r, texts } = rig();
        r._drawEquipmentModal(g, body);
        const label = texts.find(t => t.text === 'WEAPON [LEFT]');
        assert.ok(label, 'the label is drawn');
        assert.ok(label.x > leftPlate.x && label.x < leftPlate.x + leftPlate.w, 'on the left-hand plate');
        assert.ok(texts.some(t => /LION WHIP/.test(t.text)), 'the left-hand item is named');
        assert.ok(texts.some(t => t.text === 'WEAPON [RIGHT]'));
    });

    test('an open left chooser is titled for the hand and draws the bag weapons', () => {
        const g = makeGame({ bag: [WHIP] });
        g._deviceSel = { tab: 'gear', slotKey: 'left', open: true };
        const { r, texts } = rig();
        r._drawEquipmentModal(g, body);
        assert.ok(texts.some(t => t.text === 'WEAPON [LEFT] — CHOOSE'));
        assert.ok(texts.some(t => /Lion Whip/.test(t.text)));
    });
});
