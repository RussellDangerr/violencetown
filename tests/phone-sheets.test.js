// phone-sheets.test.js — the target list and the item menu as phone sheets (TL7).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeViewport } from '../game/viewport.js';
import {
    DOCK, dockFor, deviceSheetRect, targetListRowRect, itemOverlayRowRect, closeButtonRect,
    listPanelRect, TARGET_LIST_RECT, ITEM_OVERLAY_RECT, rectsOverlap,
} from '../game/layout.js';

function vpFor(screen) {
    const vp = computeViewport({ ...screen, dock: DOCK });
    const dock = dockFor(vp);
    return dock === DOCK ? vp : computeViewport({ ...screen, dock });
}
const PHONES = { phone375: { cssW: 375, cssH: 812, dpr: 2 }, phone390: { cssW: 390, cssH: 844, dpr: 3 } };
const inside = (r, o) => r.x >= o.x && r.y >= o.y && r.x + r.w <= o.x + o.w && r.y + r.h <= o.y + o.h;

test('without a sheet both lists keep today\'s rows and panels', () => {
    for (let i = 0; i < 4; i++) {
        assert.deepEqual(targetListRowRect(i, null), targetListRowRect(i));
        assert.deepEqual(itemOverlayRowRect(i, null), itemOverlayRowRect(i));
    }
    assert.deepEqual(targetListRowRect(1), { x: TARGET_LIST_RECT.x + 10, y: TARGET_LIST_RECT.y + 74, w: TARGET_LIST_RECT.w - 20, h: 26 });
    assert.deepEqual(listPanelRect(ITEM_OVERLAY_RECT, 30, 3), { x: 196, y: 176, w: 216, h: 44 + 90 + 22 });
    assert.equal(deviceSheetRect(vpFor({ cssW: 3440, cssH: 1440, dpr: 1 })), null);
});

for (const [key, screen] of Object.entries(PHONES)) {
    describe(key, () => {
        const vp = vpFor(screen);
        const sheet = deviceSheetRect(vp);
        const tap = 44 * vp.logicalPerCss;

        for (const [name, rowFn, n] of [['target list', targetListRowRect, 8], ['item menu', itemOverlayRowRect, 6]]) {
            test(`${name}: rows are a thumb tall, on the sheet, clear of each other and the chip`, () => {
                const rows = Array.from({ length: n }, (_, i) => rowFn(i, sheet));
                const chip = closeButtonRect(sheet, sheet.thumb);
                assert.equal(rows.length, n);
                for (const r of rows) {
                    assert.ok(Math.min(r.w, r.h) >= tap - 0.01, JSON.stringify(r));
                    assert.ok(inside(r, sheet), `off the sheet: ${JSON.stringify(r)}`);
                    assert.ok(!rectsOverlap(r, chip), 'row under the chip');
                }
                for (let i = 1; i < rows.length; i++) assert.ok(!rectsOverlap(rows[i - 1], rows[i]));
            });
        }

        test('the panel is the whole sheet and the chip is a thumb inside it', () => {
            assert.deepEqual(listPanelRect(TARGET_LIST_RECT, 30, 3, sheet), { x: sheet.x, y: sheet.y, w: sheet.w, h: sheet.h });
            const chip = closeButtonRect(sheet, sheet.thumb);
            assert.ok(chip.w >= tap - 0.01 && inside(chip, sheet));
        });
    });
}
