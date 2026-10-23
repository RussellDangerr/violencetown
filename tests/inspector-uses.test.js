// inspector-uses.test.js — C3c: touch can reach "use this on that".
//
// An item's contextual uses (game/item-uses.js) live in the item overlay, which
// only a digit key and then Space used to open. The Remoticon's item inspector
// now carries a uses button, shown only when the item has a use here, that
// opens the same overlay. These tests pin that the button shows exactly then,
// and that a tap or the keyboard cursor on it lands in the very list Space gives.
//
// main.js touches `document` at import, so, as in device-keys.test.js, the real
// methods are lifted out of the source and bound onto a small game object.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ITEMS, resolveUse, unequipItem } from '../game/items.js';
import { WEAPONS } from '../game/weapons.js';
import { moveToZone, zoneOf } from '../game/inventory.js';
import { INVENTORY_SIZE, SAFE_SLOTS, MAX_STACK } from '../game/data.js';
import { itemActions, equipOptions, inspectorUsesRect, USES_ACTION } from '../game/inspector.js';
import { contextualUses, ITEM_USES } from '../game/item-uses.js';
import { slotRing, unslotRing } from '../game/rings.js';
import {
    HIT_SLOP, DEVICE_TABS, deviceTabRect, cycleDeviceTab, deviceBodyRect, deviceBagSlotRects,
    deviceEquipLayout, deviceRingsLayout, inspectorActionRects, inspectorPanelRect, gearOptionRects,
    nearestRectInDir, rectsOverlap,
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
    nearestRectInDir, itemActions, equipOptions, zoneOf, moveToZone, SAFE_SLOTS, INVENTORY_SIZE,
    MAX_STACK, resolveUse, unequipItem, slotRing, unslotRing, contextualUses, inspectorUsesRect,
    performance,
};
const LIVE = [
    ['_tapDevice', 'pt'], ['_deviceActivate', 'zone, index'], ['_deviceTargets', ''],
    ['_deviceFocus', 't, i'], ['_deviceKey', 'code'], ['_deviceBack', ''],
    ['_deviceUsesRect', 'index'], ['_deviceOpenUses', 'index'],
    ['_closeDevice', ''], ['_pointInRect', 'p, r, slop = 0'], ['_removeFromSlot', 'slot'],
    ['_openItemOverlay', ''], ['_pickOverlay', 'index'],
].map(([n, p]) => [n, liveMethod(n, p, FREE)]);

// The player stands at (5,5) facing down. `world` maps "x,y" to what
// _targetAt returns there: { x, y, npc, item, examinable, container }.
function makeGame(setup = () => {}) {
    const g = {
        state: STATE.DEVICE, _deviceTab: 'items', _deviceSel: null,
        inventory: new Array(INVENTORY_SIZE).fill(null),
        equipment: { weapon: WEAPONS.wooden_sword, top: null, bottom: null, front: null, back: null, sides: null },
        selectedSlot: -1, overlayOptions: [], overlayCursor: 0,
        playerX: 5, playerY: 5, facing: 'down', world: {}, flags: {}, carFuel: null,
        logs: [], beats: 0, hits: [], carRuns: 0,
        _log(m) { this.logs.push(m); },
        _render() {}, _resumeHeldWalk() {}, _ensureParticleLoop() {},
        _advanceWorld() { this.beats++; },
        _adjacentHostiles() { return []; },
        _targetAt(x, y) { return this.world[x + ',' + y] || null; },
        combatAttack(npc, dmg, opts) { this.hits.push({ name: npc.name, dmg, type: opts && opts.type }); },
        _interactCar() { this.carRuns++; },
        questEngine: { getFlag(k) { return !!g.flags[k]; } },
    };
    for (const [n, fn] of LIVE) g[n] = fn;
    setup(g);
    return g;
}
const put = (g, i, id, count = 1) => { g.inventory[i] = { itemDef: ITEMS[id], count }; };
const sludgeAt = (g, x, y) => {
    g.world[x + ',' + y] = { x, y, npc: { name: '[Sludge Bloom]', type: 'sludge_bloom', entity: { hp: 4, armor: 1 } } };
};
const carAt = (g, x, y) => { g.world[x + ',' + y] = { x, y, examinable: { id: 'car' } }; };

const centre = r => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const tap = (g, r) => g._tapDevice(centre(r));
const press = (g, ...codes) => { for (const c of codes) g._deviceKey(c); };

const body = deviceBodyRect();
const bag = deviceBagSlotRects(body);
const usesRect = inspectorUsesRect(body);

// The overlay a keyboard player gets: the digit holds the item, Space opens it.
function keyboardOverlay(setup, slot) {
    const g = makeGame(setup);
    g.state = STATE.ITEM_SELECTED;
    g.selectedSlot = slot;
    g._openItemOverlay();
    return g;
}
const listOf = g => g.overlayOptions.map(o => `${o.action}:${o.label}`);

// The scenes with a contextual use, one per authored row in item-uses.js.
const SCENES = [
    { name: 'soap beside sludge', slot: 3, setup: g => { put(g, 3, 'soap', 2); sludgeAt(g, 6, 5); } },
    { name: 'soap facing sludge', slot: 14, setup: g => { put(g, 14, 'soap'); sludgeAt(g, 5, 6); } },
    { name: 'alcohol at the fixed car', slot: 12, setup: g => { put(g, 12, 'alcohol'); carAt(g, 5, 4); g.flags.carFixed = true; } },
];

describe('C3c — where the uses button sits', () => {
    const panel = inspectorPanelRect(body);
    const row = inspectorActionRects(body);

    test('it sits on the action row, right of the last button, inside the panel', () => {
        const last = row[row.length - 1];
        assert.equal(usesRect.y, last.y);
        assert.equal(usesRect.h, last.h);
        assert.ok(usesRect.x > last.x + last.w, 'it must start right of the last action button');
        assert.ok(usesRect.x + usesRect.w <= panel.x + panel.w, 'it escapes the panel');
        assert.ok(usesRect.w >= 44, `too narrow to tap: ${usesRect.w}px`);
    });

    test('it overlaps no action button and no bag slot, even with the tap slop', () => {
        const grow = r => ({ x: r.x - HIT_SLOP, y: r.y - HIT_SLOP, w: r.w + 2 * HIT_SLOP, h: r.h + 2 * HIT_SLOP });
        for (const r of row) assert.ok(!rectsOverlap(grow(usesRect), r), 'its tap zone reaches an action button');
        for (const r of bag) assert.ok(!rectsOverlap(usesRect, r), 'it overlaps a bag slot');
    });

    test('its label is the placeholder until the copy is written', () => {
        assert.deepEqual({ ...USES_ACTION }, { id: 'uses', label: '[TEXT]' });
    });
});

describe('C3c — the button only shows when the item has a use nearby', () => {
    test('soap with no sludge in reach: no button', () => {
        const g = makeGame(x => { put(x, 3, 'soap'); sludgeAt(x, 8, 5); });
        assert.equal(g._deviceUsesRect(3), null);
    });

    test('soap beside sludge: the button', () => {
        const g = makeGame(SCENES[0].setup);
        assert.deepEqual(g._deviceUsesRect(3), usesRect);
    });

    test('an item no row names gets no button, even beside sludge', () => {
        const g = makeGame(x => { put(x, 3, 'bandage'); sludgeAt(x, 6, 5); });
        assert.equal(g._deviceUsesRect(3), null);
    });

    test('alcohol at a car that is not fixed yet: no button', () => {
        const g = makeGame(x => { put(x, 12, 'alcohol'); carAt(x, 5, 4); });
        assert.equal(g._deviceUsesRect(12), null);
    });

    test('an empty slot gets no button', () => {
        const g = makeGame(x => sludgeAt(x, 6, 5));
        assert.equal(g._deviceUsesRect(3), null);
    });

    test('a quest item gets no button, because the overlay refuses it', () => {
        const quest = Object.entries(ITEMS).find(([, d]) => d.questItem);
        assert.ok(quest, 'no quest item to test with');
        // A row naming the quest item, so the guard (not an empty table) is what is tested.
        const row = { id: 'test-quest-row', item: quest[0], match: () => true, label: 'x', apply() {} };
        ITEM_USES.push(row);
        try {
            const g = makeGame(x => { x.inventory[3] = { itemDef: quest[1], count: 1 }; sludgeAt(x, 6, 5); });
            assert.equal(contextualUses(quest[1], g).length, 1, 'the test row did not apply');
            assert.equal(g._deviceUsesRect(3), null);
        } finally {
            ITEM_USES.splice(ITEM_USES.indexOf(row), 1);
        }
    });

    test('with no button, a tap where it would be does nothing', () => {
        const g = makeGame(x => put(x, 3, 'soap'));
        tap(g, bag[3]);
        tap(g, usesRect);
        assert.equal(g.state, STATE.DEVICE);
        assert.deepEqual(g._deviceSel, { tab: 'items', index: 3 });
    });

    test('with no button, the keyboard cursor stops at the last action', () => {
        const g = makeGame(x => put(x, 3, 'soap'));
        press(g, 'ArrowRight');                       // show the cursor on slot 0
        for (let i = 0; i < 3; i++) press(g, 'ArrowRight');
        press(g, 'Enter', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight');
        assert.equal(g._deviceSel.action, itemActions(ITEMS.soap, 'pack').length - 1);
    });
});

describe('C3c — a tap or a key on the button gives the list Space gives', () => {
    for (const s of SCENES) {
        test(`${s.name}: by tap`, () => {
            const want = keyboardOverlay(s.setup, s.slot);
            assert.ok(want.overlayOptions.some(o => o.action === 'ctx'), 'the scene has no contextual use');
            const g = makeGame(s.setup);
            tap(g, bag[s.slot]);
            tap(g, usesRect);
            assert.equal(g.state, STATE.ITEM_OVERLAY);
            assert.equal(g.selectedSlot, s.slot);
            assert.equal(g._deviceSel, null);
            assert.deepEqual(listOf(g), listOf(want));
        });

        test(`${s.name}: by keys`, () => {
            const want = keyboardOverlay(s.setup, s.slot);
            const g = makeGame(s.setup);
            press(g, 'ArrowRight');
            g._deviceSel = { tab: 'items', index: s.slot };   // the cursor on the item (walking it is device-keys' job)
            press(g, 'Enter');                                 // into the action row
            const t = g._deviceTargets();
            assert.equal(t.ids[t.ids.length - 1], 'uses', 'the uses button is not on the cursor row');
            for (let i = 0; i < t.ids.length; i++) press(g, 'ArrowRight');
            assert.equal(g._deviceSel.action, t.ids.length - 1, 'the cursor never reached the button');
            press(g, 'Enter');
            assert.equal(g.state, STATE.ITEM_OVERLAY);
            assert.equal(g.selectedSlot, s.slot);
            assert.deepEqual(listOf(g), listOf(want));
        });
    }

    test('every contextual use listed by the overlay is the one contextualUses finds', () => {
        for (const s of SCENES) {
            const g = makeGame(s.setup);
            tap(g, bag[s.slot]); tap(g, usesRect);
            const ctx = g.overlayOptions.filter(o => o.action === 'ctx').map(o => o.use.id);
            const found = contextualUses(g.inventory[s.slot].itemDef, g).map(u => u.id);
            assert.deepEqual(ctx, found, s.name);
            assert.ok(ctx.length > 0, s.name);
        }
    });

    test('picking the scrub from the tapped-open list scrubs the sludge and spends the bar', () => {
        const g = makeGame(SCENES[0].setup);
        tap(g, bag[3]); tap(g, usesRect);
        const i = g.overlayOptions.findIndex(o => o.action === 'ctx');
        g._pickOverlay(i);
        assert.deepEqual(g.hits, [{ name: '[Sludge Bloom]', dmg: 6, type: 'clean' }]);
        assert.equal(g.inventory[3].count, 1);
        assert.equal(g.beats, 1);
    });

    test('picking the pour from the tapped-open list runs the car pour', () => {
        const g = makeGame(SCENES[2].setup);
        tap(g, bag[12]); tap(g, usesRect);
        assert.deepEqual(listOf(g), ['ctx:Pour it in the tank'], 'alcohol has no self-use, so the pour is the whole list');
        g._pickOverlay(0);
        assert.equal(g.carRuns, 1);
    });
});
