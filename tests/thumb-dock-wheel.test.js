// thumb-dock-wheel.test.js — on a phone the dock and the wheel are laid out
// at thumb size, and nothing else moves (plans/tl3-thumb-sized-dock-wheel.md).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeViewport } from '../game/viewport.js';
import {
    DOCK, dockFor, thumbOf, hudLayout, xmbBarLayout, xmbBarPanelRect, hitHud,
    wheelMetrics, wheelRingR, dialRadius, rectsOverlap, WHEEL_DESKTOP,
} from '../game/layout.js';

const PHONES = { phone375: [375, 812, 2], phone390: [390, 844, 3] };
const phone = ([cssW, cssH, dpr]) => {
    const vp = computeViewport({ cssW, cssH, dpr, dock: DOCK });
    return computeViewport({ cssW, cssH, dpr, dock: dockFor(vp) });
};
const bar = { columns: ['a', 'b', 'c'].map((k, c) => ({ key: k, label: k, items: Array.from({ length: c ? 2 : 12 }, (_, i) => ({ itemDef: { id: k + i }, slot: i, count: 1 })) })) };
const inside = (r, vp) => r.x >= 0 && r.y >= 0 && r.x + r.w <= vp.w && r.y + r.h <= vp.h;

describe('thumb size', () => {
    for (const [name, spec] of Object.entries(PHONES)) {
        const vp = phone(spec);
        const T = thumbOf(vp);
        const hud = hudLayout(vp);

        test(`${name}: a phone viewport with the phone dock is in thumb mode, 44 CSS px per target`, () => {
            assert.equal(T, 44 * vp.logicalPerCss);
            assert.equal(hud.thumb, T);
            assert.ok(vp.dockH > DOCK.twoRows);
        });

        test(`${name}: the dock's pieces are a thumb and stay inside the dock without overlapping`, () => {
            const lay = xmbBarLayout(bar, hud.bar, { colIndex: 0, itemIndex: 0 });
            assert.ok(lay.overflow);
            const panel = xmbBarPanelRect(3, hud.bar);
            const named = { log: hud.log, opener: hud.opener, up: lay.up, down: lay.down };
            lay.chips.forEach((c, i) => { named['chip' + i] = c; });
            lay.items.forEach((c, i) => { named['cell' + i] = c; });
            for (const [n, r] of Object.entries(named)) {
                assert.ok(Math.min(r.w, r.h) >= T, `${n} ${r.w}x${r.h}`);
                assert.ok(inside(r, vp) && r.y >= hud.dock.y, `${n} is inside the dock`);
            }
            assert.ok(inside(panel, vp) && panel.y >= hud.dock.y);
            for (const c of [...lay.chips, ...lay.items]) assert.ok(c.y >= panel.y && c.y + c.h <= panel.y + panel.h);
            const solo = [hud.log, hud.opener, panel];
            for (let i = 0; i < solo.length; i++) for (let j = i + 1; j < solo.length; j++) assert.ok(!rectsOverlap(solo[i], solo[j]), `${i} and ${j} overlap`);
            for (const a of [lay.up, lay.down]) {
                assert.ok(!rectsOverlap(a, hud.opener) && !rectsOverlap(a, hud.log));
                for (const c of lay.items) assert.ok(!rectsOverlap(a, c));
            }
            assert.equal(hitHud(hud, { x: hud.opener.x + 3, y: hud.opener.y + 3 }), 'opener');
        });

        test(`${name}: the deepest wheel, with its open overshoot, fits the screen and every ring is a thumb`, () => {
            const m = hud.wheelM;
            assert.deepEqual(m, wheelMetrics(T));
            assert.equal(2 * m.hubR, T);
            for (let k = 0; k <= 2; k++) { const [a, b] = wheelRingR(k, m); assert.equal(b - a, T); }
            const R = hud.dialRadius(3, false) * 1.05;
            assert.ok(hud.wheel.cx - R >= 0 && hud.wheel.cx + R <= vp.w, 'across');
            assert.ok(hud.wheel.cy + R <= vp.h + 1, 'down');
            assert.ok(hud.wheel.cy - R >= 0, 'up');
        });

        test(`${name}: built with the plain DOCK the layout is today's (no thumb)`, () => {
            const old = computeViewport({ cssW: spec[0], cssH: spec[1], dpr: spec[2], dock: DOCK });
            const h = hudLayout(old);
            assert.equal(thumbOf(old), 0);
            assert.equal(h.opener.w, 72);
            assert.equal(h.wheelM, undefined);
        });
    }
});

describe('desktop is untouched', () => {
    for (const [cssW, cssH] of [[3440, 1440], [1920, 1080], [1280, 720]]) {
        test(`${cssW}x${cssH}: no thumb mode, dock is DOCK, wheel is the old wheel`, () => {
            const vp = computeViewport({ cssW, cssH, dpr: 1, dock: DOCK });
            assert.equal(dockFor(vp), DOCK);
            assert.equal(thumbOf(vp), 0);
            const hud = hudLayout(vp);
            assert.equal(hud.thumb, undefined);
            assert.equal(hud.opener.w, 72);
            assert.equal(hud.bar.t, undefined);
            assert.equal(hud.dialRadius, dialRadius);
            assert.equal(wheelMetrics(0), WHEEL_DESKTOP);
        });
    }
    test('the item bar and wheel rings keep their desktop sizes', () => {
        const lay = xmbBarLayout(bar, { cx: 304, bottom: 592 });
        assert.deepEqual([lay.chips[0].h, lay.items[0].w, lay.up.w, lay.up.h], [20, 32, 18, 14]);
        assert.deepEqual(wheelRingR(0), [28, 56]);
        assert.deepEqual(wheelRingR(2), [92, 120]);
        assert.equal(dialRadius(3, false), 162);
    });
});
