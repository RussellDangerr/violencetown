// phone-remoticon.test.js — the Remoticon as a full-screen sheet on a phone (TL4).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeViewport } from '../game/viewport.js';
import {
    DOCK, dockFor, HIT_SLOP, DEVICE_TABS, DEVICE_RECT, deviceSheetRect, deviceTabRect, deviceBodyRect,
    deviceBagSlotRects, deviceBagPagerRects, inspectorPanelRect, inspectorActionRects, closeButtonRect, rectsOverlap, expandRect,
    deviceEquipLayout, deviceRingsLayout, gearChooserRect, gearOptionRects,
} from '../game/layout.js';
import { UNLOCK_ORDER } from '../game/rings.js';

function vpFor(screen) {
    const vp = computeViewport({ ...screen, dock: DOCK });
    const dock = dockFor(vp);
    return dock === DOCK ? vp : computeViewport({ ...screen, dock });
}
const PHONES = { phone375: { cssW: 375, cssH: 812, dpr: 2 }, phone390: { cssW: 390, cssH: 844, dpr: 3 } };
const inside = (r, o) => r.x >= o.x && r.y >= o.y && r.x + r.w <= o.x + o.w && r.y + r.h <= o.y + o.h;

test('no sheet on a desktop, and the old geometry stays', () => {
    const vp = vpFor({ cssW: 3440, cssH: 1440, dpr: 1 });
    assert.equal(deviceSheetRect(vp), null);
    assert.deepEqual(deviceBodyRect(null), deviceBodyRect());
    assert.deepEqual(deviceTabRect(0, null), deviceTabRect(0));
    assert.deepEqual(closeButtonRect(DEVICE_RECT, 0), { x: DEVICE_RECT.x + DEVICE_RECT.w - 36, y: DEVICE_RECT.y + 6, w: 30, h: 30 });
});

for (const [key, screen] of Object.entries(PHONES)) {
    describe(key, () => {
        const vp = vpFor(screen);
        const sheet = deviceSheetRect(vp);
        const body = deviceBodyRect(sheet, 'items');
        const tap = 44 * vp.logicalPerCss;

        test('the sheet is the whole screen in menu space', () => {
            assert.ok(sheet, 'a phone has a sheet');
            assert.deepEqual({ x: sheet.x + vp.menu.x, y: sheet.y + vp.menu.y, w: sheet.w, h: sheet.h }, { x: 0, y: 0, w: vp.w, h: vp.h });
        });

        test('every tab, the close chip and the bag are a thumb tall, and on the sheet', () => {
            const tabs = DEVICE_TABS.map((_, i) => deviceTabRect(i, sheet));
            const close = closeButtonRect(sheet, sheet.thumb);
            const slots = deviceBagSlotRects(body);
            for (const r of [...tabs, close, ...slots]) {
                assert.ok(Math.min(r.w, r.h) >= tap - 0.01, JSON.stringify(r));
                assert.ok(inside(r, sheet), `off the sheet: ${JSON.stringify(r)}`);
            }
            assert.equal(slots.length, 50);
        });

        test('tabs and the close chip never overlap', () => {
            const rects = [...DEVICE_TABS.map((_, i) => deviceTabRect(i, sheet)), closeButtonRect(sheet, sheet.thumb)];
            for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
                assert.ok(!rectsOverlap(rects[i], rects[j]), `${i} vs ${j}`);
            }
        });

        test('bag slots never overlap; the pager and the inspector keep clear of them, slop included', () => {
            const slots = deviceBagSlotRects(body);
            const pager = deviceBagPagerRects(body);
            const panel = inspectorPanelRect(body);
            const actions = inspectorActionRects(body);
            for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) assert.ok(!rectsOverlap(slots[i], slots[j]), `slot ${i} vs ${j}`);
            const others = [pager.prev, pager.next, panel];
            for (const o of others) for (const s of slots) assert.ok(!rectsOverlap(expandRect(o, HIT_SLOP), s), 'clear of a slot');
            assert.ok(!rectsOverlap(expandRect(pager.prev, HIT_SLOP), pager.next));
            assert.ok(!rectsOverlap(expandRect(pager.prev, HIT_SLOP), panel) && !rectsOverlap(expandRect(pager.next, HIT_SLOP), panel));
            for (const a of actions) assert.ok(inside(a, panel), 'a button is inside its panel');
            assert.ok(inside(panel, body), 'the inspector fits the body');
            for (let i = 0; i < actions.length - 1; i++) assert.ok(!rectsOverlap(actions[i], actions[i + 1]));
        });

        test('the quests, map and notes tabs get a body of the desktop shape, inside the sheet', () => {
            const q = deviceBodyRect(sheet, 'quests');
            assert.ok(inside(q, sheet));
            assert.ok(q.h < body.h);
            assert.equal(q.thumb, sheet.thumb);
        });

        test('GEAR and RINGS use the sheet full height, as the bag does', () => {
            for (const tab of ['gear', 'rings']) {
                const b = deviceBodyRect(sheet, tab);
                assert.equal(b.h, body.h, tab);
                assert.ok(inside(b, sheet));
            }
        });

        test('GEAR: seven thumb-tall plates inside the body, none overlapping, slop included', () => {
            const gear = deviceBodyRect(sheet, 'gear');
            const lay = deviceEquipLayout(gear);
            const plates = [...lay.slots, lay.leftHand];
            assert.equal(plates.length, 7);
            for (const p of plates) {
                assert.ok(Math.min(p.w, p.h) >= tap - 0.01, p.key);
                assert.ok(inside(p, gear), p.key);
            }
            for (let i = 0; i < plates.length; i++) for (let j = i + 1; j < plates.length; j++) {
                assert.ok(!rectsOverlap(expandRect(plates[i], HIT_SLOP), plates[j]), `${plates[i].key} vs ${plates[j].key}`);
            }
        });

        test('GEAR chooser: rows a thumb tall, inside the body, clear of every plate and of each other', () => {
            const gear = deviceBodyRect(sheet, 'gear');
            const lay = deviceEquipLayout(gear);
            const plates = [...lay.slots, lay.leftHand];
            for (const key of plates.map((p) => p.key)) {
                for (const n of [0, 1, 2, 3]) {
                    const panel = gearChooserRect(gear, n, key);
                    assert.ok(inside(panel, gear), `${key} n${n} panel in body`);
                    for (const p of plates) assert.ok(!rectsOverlap(panel, p), `${key} n${n} panel over ${p.key}`);
                    const rows = gearOptionRects(gear, n, key);
                    rows.forEach((r, i) => {
                        assert.ok(Math.min(r.w, r.h) >= tap - 0.01, `${key} row ${i}`);
                        assert.ok(inside(r, panel), `${key} row ${i} in panel`);
                        if (i) assert.ok(!rectsOverlap(expandRect(rows[i - 1], HIT_SLOP), r));
                    });
                }
            }
        });

        test('RINGS: every socket of the full hands is a thumb square, inside the body, none overlapping', () => {
            const rings = deviceBodyRect(sheet, 'rings');
            const { sockets } = deviceRingsLayout(rings, { ringTier: UNLOCK_ORDER.length - 1, ringSlots: {} });
            assert.ok(sockets.length >= 10, 'all ten fingers');
            for (const s of sockets) {
                assert.ok(Math.min(s.w, s.h) >= tap - 0.01, s.key);
                assert.ok(inside(s, rings), s.key);
            }
            for (let i = 0; i < sockets.length; i++) for (let j = i + 1; j < sockets.length; j++) {
                assert.ok(!rectsOverlap(sockets[i], sockets[j]), `${sockets[i].key} vs ${sockets[j].key}`);
            }
        });
    });
}
