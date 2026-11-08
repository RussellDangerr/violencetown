// gear-armour-total.test.js — the GEAR tab shows "ARMOR n", the same number
// game._playerArmor() returns (plans/at1-gear-armour-total.md). It used to be drawn
// only by the stand-alone EQUIPMENT modal, which nothing opens now.
//
// main.js touches `document` at import, so the live GEAR methods are lifted from its
// source and run for real, as gear-right-plate.test.js does: keys go through
// _deviceKey (what the keydown handler calls), the line is read from what the
// renderer's _drawEquipmentModal draws in the hosted (GEAR) branch.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ITEMS, resolveUse, unequipItem, gearOptions } from '../game/items.js';
import { WEAPONS, weaponClassOf } from '../game/weapons.js';
import { sumBuffStat } from '../game/buffs.js';
import { addToInventory, moveToZone, zoneOf, pageCount, slotOnPage, pageOfSlot } from '../game/inventory.js';
import { INVENTORY_SIZE, SAFE_SLOTS, PACK_PAGE, MAX_STACK } from '../game/data.js';
import { itemActions, equipOptions } from '../game/inspector.js';
import { slotRing, unslotRing } from '../game/rings.js';
import {
    HIT_SLOP, DEVICE_TABS, deviceTabRect, cycleDeviceTab, deviceBodyRect, deviceBagSlotRects, deviceBagPagerRects,
    deviceEquipLayout, deviceRingsLayout, inspectorActionRects, gearOptionRects, gearChooserRect, gearArmourRect,
    nearestRectInDir, rectsOverlap,
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
    weaponClassOf, sumBuffStat,
};
const LIVE = [
    ['_tapDevice', 'pt'], ['_deviceActivate', 'zone, index'], ['_deviceTargets', ''],
    ['_deviceFocus', 't, i'], ['_deviceKey', 'code'], ['_pointInRect', 'p, r, slop = 0'],
    ['_removeFromSlot', 'slot'], ['_playerArmor', ''], ['_poitionMod', 'stat'],
].map(([n, p]) => [n, liveMethod(n, p, FREE)]);
const handsBody = /_handsOf\(def\) \{ (return [^\n]*?;) \}/.exec(mainSrc);
assert.ok(handsBody, '_handsOf not found in main.js');
LIVE.push(['_handsOf', new Function('weaponClassOf', `return function (def) { ${handsBody[1]} }`)(weaponClassOf)]);

const cfg = { size: INVENTORY_SIZE, safeSlots: SAFE_SLOTS, maxStack: MAX_STACK };
const HELM = ITEMS.foil_hat;           // head, armor 2
const CUIRASS = ITEMS.cardboard_cuirass; // torso, armor 4

function makeGame({ bag = [], worn = {}, ringArmor = 0 } = {}) {
    const g = {
        state: STATE.DEVICE, _deviceTab: 'gear', _deviceSel: null,
        inventory: new Array(INVENTORY_SIZE).fill(null),
        equipment: { weapon: WEAPONS.wooden_sword, left: null, top: null, bottom: null, front: null, back: null, sides: null, ...worn },
        tempEquips: [], ownedRings: new Set(), ringSlots: {}, ringMods: { armor: ringArmor }, buffs: [],
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
const press = (g, ...codes) => { for (const c of codes) g._deviceKey(c); };

// Draw the hosted GEAR body on a recording renderer; return every text it drew.
function drawGear(g) {
    const texts = [];
    const ctx = new Proxy({}, {
        get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })),
        set: (t, k, v) => { t[k] = v; return true; },
    });
    const r = Object.assign(Object.create(Renderer.prototype), {
        ctx, sprites: { uiPanel: null },
        font: { measure: (s, sc = 1) => String(s).length * 4.8 * sc, drawText: (c, text, x, y, opts) => texts.push({ text, x, y, opts }) },
        _drawItemIcon() {}, _drawSafeBadge() {},
    });
    r._drawEquipmentModal(g, body);
    return texts;
}
const armorLine = texts => {
    const lines = texts.filter(t => /^ARMOR /.test(t.text));
    assert.equal(lines.length, 1, 'exactly one ARMOR line is drawn');
    return lines[0];
};
const shown = g => Number(armorLine(drawGear(g)).text.slice('ARMOR '.length));

describe('the GEAR tab shows ARMOR n', () => {
    test('with nothing worn it reads ARMOR 0', () => {
        const g = makeGame();
        assert.equal(armorLine(drawGear(g)).text, 'ARMOR 0');
    });

    test('it is the number _playerArmor() returns, worn pieces and a ring together', () => {
        const g = makeGame({ worn: { top: HELM, front: CUIRASS }, ringArmor: 3 });
        assert.equal(g._playerArmor(), HELM.armor + CUIRASS.armor + 3);
        assert.equal(shown(g), g._playerArmor());
    });

    test('the line uses the same wording, colour and size as the old modal', () => {
        const g = makeGame();
        const line = armorLine(drawGear(g));
        assert.equal(line.opts.scale, 2);
        assert.equal(line.opts.align, 'left');
        assert.ok(line.opts.color);
    });
});

describe('it changes at once, with GEAR still open', () => {
    test('putting a piece on by keys, then taking it off by keys', () => {
        const g = makeGame({ bag: [HELM] });
        assert.equal(shown(g), 0);

        // HEAD plate -> Enter opens its chooser -> Enter wears the first row.
        g._deviceSel = { tab: 'gear', slotKey: 'top' };
        press(g, 'Enter', 'Enter');
        assert.equal(g.equipment.top, HELM);
        assert.equal(g.state, STATE.DEVICE, 'GEAR is still open');
        assert.equal(g._deviceTab, 'gear');
        assert.equal(shown(g), HELM.armor);
        assert.equal(shown(g), g._playerArmor());

        // Back on the HEAD plate, the Bare row takes it off again.
        g._deviceSel = { tab: 'gear', slotKey: 'top' };
        press(g, 'Enter');
        const bare = gearOptions(g, 'top').findIndex(o => o.id === '__bare__');
        assert.ok(bare >= 0, 'a worn head piece offers Bare');
        for (let i = 0; i < bare; i++) press(g, 'ArrowDown');
        press(g, 'Enter');
        assert.equal(g.equipment.top, null);
        assert.equal(g.state, STATE.DEVICE, 'GEAR is still open');
        assert.equal(shown(g), 0);
    });

    test('a second piece adds to the first', () => {
        const g = makeGame({ bag: [HELM, CUIRASS] });
        g._deviceSel = { tab: 'gear', slotKey: 'top' };
        press(g, 'Enter', 'Enter');
        g._deviceSel = { tab: 'gear', slotKey: 'front' };
        press(g, 'Enter', 'Enter');
        assert.equal(g.equipment.front, CUIRASS);
        assert.equal(shown(g), HELM.armor + CUIRASS.armor);
    });
});

describe('the line collides with nothing', () => {
    const A = gearArmourRect(body);
    const eq = deviceEquipLayout(body);
    const inside = (r, b) => r.x >= b.x && r.y >= b.y && r.x + r.w <= b.x + b.w && r.y + r.h <= b.y + b.h;

    test('it sits inside the GEAR body', () => {
        assert.ok(inside(A, body));
    });

    test('no plate, tab or open chooser overlaps it', () => {
        for (const p of [...eq.slots, eq.leftHand]) assert.ok(!rectsOverlap(A, p), p.key);
        for (let i = 0; i < DEVICE_TABS.length; i++) assert.ok(!rectsOverlap(A, deviceTabRect(i)), `tab ${i}`);
        for (let n = 0; n <= 6; n++) assert.ok(!rectsOverlap(A, gearChooserRect(body, n)), `${n} rows`);
    });

    test('the drawn text stays inside its box', () => {
        const g = makeGame({ worn: { top: HELM, front: CUIRASS, bottom: ITEMS.shoe_bags }, ringArmor: 10 });
        const line = armorLine(drawGear(g));
        assert.ok(line.x >= A.x && line.y >= A.y);
        const width = line.text.length * 4.8 * line.opts.scale;
        assert.ok(line.x + width <= A.x + A.w, `${line.text} fits ${A.w}px`);
    });
});
