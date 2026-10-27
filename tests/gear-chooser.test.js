// gear-chooser.test.js — the GEAR tab's chooser opens clear of the plates
// (plans/fx11-gear-chooser-clear.md). Its rows always sat below the HEAD plate,
// but the titled panel around them started 30 px into the body and covered the
// bottom of that plate. The panel now starts below the HEAD plate.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    deviceBodyRect, deviceEquipLayout, gearChooserRect, gearOptionRects, rectsOverlap,
} from '../game/layout.js';
import { Renderer } from '../game/renderer.js';
import { equipOptions } from '../game/inspector.js';
import { ITEMS, ARMOR_IDS } from '../game/items.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const body = deviceBodyRect();
const plates = deviceEquipLayout(body).slots;
const plate = (key) => plates.find((s) => s.key === key);
// The plates a chooser opens on: every armour plate (the weapon plate opens none).
const CHOOSABLE = plates.filter((s) => s.key !== 'weapon').map((s) => s.key);
// The most rows any chooser shows today: every bag item for one slot plus Bare.
const MOST_ROWS = Math.max(...CHOOSABLE.map((k) => ARMOR_IDS.filter((id) => ITEMS[id].equipSlot === k).length + 1));
const COUNTS = [0, 1, 2, 3, 4, 5, 6];
const inside = (a, b) => a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.w <= b.x + b.w + 0.5 && a.y + a.h <= b.y + b.h + 0.5;

describe('gearChooserRect', () => {
    test('the plates are the six on the tab, HEAD among them', () => {
        assert.deepEqual(plates.map((s) => s.key), ['top', 'sides', 'front', 'back', 'bottom', 'weapon']);
        assert.deepEqual(CHOOSABLE, ['top', 'sides', 'front', 'back', 'bottom']);
        assert.ok(MOST_ROWS >= 2 && MOST_ROWS <= COUNTS.at(-1), `today's longest chooser is ${MOST_ROWS} rows`);
    });

    for (const key of CHOOSABLE) {
        test(`the ${plate(key).label} chooser does not overlap the ${plate(key).label} plate`, () => {
            for (const n of COUNTS) {
                const panel = gearChooserRect(body, n);
                assert.ok(!rectsOverlap(panel, plate(key)), `${n} rows: chooser ${JSON.stringify(panel)} covers ${JSON.stringify(plate(key))}`);
            }
        });
    }

    test('an open chooser covers no plate at all, so every plate stays in view', () => {
        for (const n of COUNTS) {
            const panel = gearChooserRect(body, n);
            for (const s of plates) assert.ok(!rectsOverlap(panel, s), `${n} rows: chooser covers the ${s.label} plate`);
        }
    });

    test('the chooser starts below the HEAD plate', () => {
        const head = plate('top');
        for (const n of COUNTS) assert.ok(gearChooserRect(body, n).y >= head.y + head.h, `${n} rows`);
    });

    test('the chooser sits inside the body, and its rows inside it below the title band', () => {
        for (const n of COUNTS) {
            const panel = gearChooserRect(body, n);
            assert.ok(inside(panel, body), `${n} rows: chooser escapes the body`);
            const rows = gearOptionRects(body, n);
            assert.equal(rows.length, n);
            for (const r of rows) {
                assert.ok(inside(r, panel), `${n} rows: a row escapes the chooser`);
                assert.ok(r.y >= panel.y + 26, `${n} rows: a row climbs into the title band`);
            }
        }
    });

    test('the rows keep their size and spacing', () => {
        const rows = gearOptionRects(body, 3);
        for (const r of rows) { assert.equal(r.w, 200); assert.equal(r.h, 26); }
        assert.equal(rows[1].y - rows[0].y, 38);
        assert.equal(rows[2].y - rows[1].y, 38);
    });
});

// A renderer whose ctx records fillRect, so the drawn panel can be read back.
// With no ui sheet loaded, drawPanelSmall's first fill is the panel's own rect.
function rig() {
    const fills = [];
    const ctx = new Proxy({ fillRect: (x, y, w, h) => fills.push({ x, y, w, h }) }, {
        get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })),
        set: (t, k, v) => { t[k] = v; return true; },
    });
    const r = Object.assign(Object.create(Renderer.prototype), {
        ctx, sprites: { uiPanel: null },
        font: { measure: (s, sc = 1) => String(s).length * 4.8 * sc, drawText() {} },
    });
    return { r, fills };
}

describe('_drawGearPicker', () => {
    const bag = ARMOR_IDS.map((id) => ({ itemDef: ITEMS[id], count: 1 }));
    for (const key of CHOOSABLE) {
        test(`the drawn ${plate(key).label} chooser is gearChooserRect, clear of its plate`, () => {
            const worn = ARMOR_IDS.map((id) => ITEMS[id]).find((d) => d.equipSlot === key) || null;
            const game = { _deviceSel: { tab: 'gear', slotKey: key, open: true, option: 0 }, equipment: { [key]: worn }, inventory: bag };
            const n = equipOptions(key, worn, bag).length;
            assert.ok(n >= 1, 'the chooser has rows to draw');
            const { r, fills } = rig();
            r._drawGearPicker(game, body);
            assert.ok(fills.length > 0, 'the panel was drawn');
            assert.deepEqual(fills[0], gearChooserRect(body, n));
            assert.ok(!rectsOverlap(fills[0], plate(key)), 'the drawn chooser covers its plate');
            assert.ok(!rectsOverlap(fills[0], plate('top')), 'the drawn chooser covers the HEAD plate');
        });
    }
});
