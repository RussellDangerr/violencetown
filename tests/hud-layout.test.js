// hud-layout.test.js — pure rect geometry helpers for the HUD non-overlap invariant.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { rectsOverlap, expandRect } from '../game/layout.js';
import { QUESTLOG_RECT, HIT_SLOP, xmbBarPanelRect, hudInteractiveRects } from '../game/layout.js';

describe('rectsOverlap', () => {
    test('true when rects share area', () => {
        assert.equal(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }), true);
    });
    test('false when disjoint on x', () => {
        assert.equal(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 10, h: 10 }), false);
    });
    test('false when disjoint on y', () => {
        assert.equal(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 20, w: 10, h: 10 }), false);
    });
    test('edge-touching (shared border, zero area) is NOT overlap', () => {
        assert.equal(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 }), false);
    });
});

describe('expandRect', () => {
    test('grows a rect by slop on every side', () => {
        assert.deepEqual(expandRect({ x: 10, y: 10, w: 20, h: 20 }, 6), { x: 4, y: 4, w: 32, h: 32 });
    });
});

describe('HUD non-overlap invariant', () => {
    test('xmbBarPanelRect worst-case matches the recon extent (n=3)', () => {
        const r = xmbBarPanelRect(3);
        assert.equal(r.x, 144);
        assert.equal(r.x + r.w, 464);
        assert.equal(r.y, 510);
        assert.equal(r.y + r.h, 592);
    });

    test('no two IDLE interactive HUD panels overlap under HIT_SLOP', () => {
        const rects = hudInteractiveRects('idle');
        for (let i = 0; i < rects.length; i++) {
            for (let j = i + 1; j < rects.length; j++) {
                const a = expandRect(rects[i].rect, HIT_SLOP);
                const b = expandRect(rects[j].rect, HIT_SLOP);
                assert.ok(!rectsOverlap(a, b),
                    `HUD panels ${rects[i].name} and ${rects[j].name} overlap (tap-ambiguous)`);
            }
        }
    });
});

import { hudLayout, throwRects, THROW_RECTS, RADIAL_CENTER_X, RADIAL_CENTER_Y, xmbBarLayout, XMB_ANCHOR_CLASSIC } from '../game/layout.js';
import { CLASSIC, computeViewport } from '../game/viewport.js';

describe('hudLayout (classic) is the old square', () => {
    test('every piece sits where the fixed constants put it', () => {
        const hud = hudLayout(CLASSIC);
        assert.deepEqual(hud.hp, { x: 6, y: 6 });
        assert.equal(hud.buffsRight, 602);
        assert.equal(hud.buffsTop, 6);
        assert.deepEqual(hud.log, { ...QUESTLOG_RECT, lines: 2 });
        assert.deepEqual(hud.bar, { cx: 304, bottom: 588 });
        assert.deepEqual(hud.wheel, { cx: RADIAL_CENTER_X, cy: RADIAL_CENTER_Y });
        assert.equal(hud.strip, 608);
    });

    test('throwRects(classic) are THROW_RECTS', () => {
        assert.deepEqual(throwRects(CLASSIC), THROW_RECTS);
    });

    test("throwRects follow the player's tile", () => {
        const vp = computeViewport({ cssW: 1920, cssH: 1080, dpr: 1 });
        const r = throwRects(vp);
        const cx = vp.origin.x + 16, cy = vp.origin.y + 16;
        assert.equal(r.up.x + r.up.w / 2, cx);
        assert.equal(r.left.y + r.left.h / 2, cy);
        assert.ok(r.up.y + r.up.h <= cy - 16 && r.down.y >= cy + 16, 'the targets clear the player tile');
    });

    test('xmbBarLayout moves with its anchor', () => {
        const bar = { columns: [{ key: 'throw', label: 'THROW', items: [{ itemDef: { id: 'rock' }, count: 1 }] }] };
        const a = xmbBarLayout(bar), b = xmbBarLayout(bar, { cx: 1000, bottom: 700 });
        assert.deepEqual(xmbBarLayout(bar, XMB_ANCHOR_CLASSIC), a);
        assert.equal(b.chips[0].x - a.chips[0].x, 1000 - 304);
        assert.equal(b.current.y - a.current.y, 700 - 588);
    });
});

describe('hudLayout (fill): pinned to the corners', () => {
    const screens = {
        '1080p': computeViewport({ cssW: 1920, cssH: 1080, dpr: 1 }),
        "Caelan's ultrawide": computeViewport({ cssW: 3440, cssH: 1440, dpr: 1 }),
        'phone upright': computeViewport({ cssW: 390, cssH: 844, dpr: 3 }),
    };
    const WHEEL_REACH = 126;   // the open wheel's widest reach from its hub
    const wheelBox = (hud) => ({ x: hud.wheel.cx - WHEEL_REACH, y: hud.wheel.cy - WHEEL_REACH, w: 2 * WHEEL_REACH, h: 2 * WHEEL_REACH });
    const onScreen = (r, vp) => r.x >= 0 && r.y >= 0 && r.x + r.w <= vp.w && r.y + r.h <= vp.h;

    for (const [name, vp] of Object.entries(screens)) {
        test(`${name}: no two idle panels overlap under HIT_SLOP`, () => {
            const rects = hudInteractiveRects('idle', vp);
            for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
                assert.ok(!rectsOverlap(expandRect(rects[i].rect, HIT_SLOP), expandRect(rects[j].rect, HIT_SLOP)),
                    `${rects[i].name} and ${rects[j].name} overlap`);
            }
        });

        test(`${name}: every piece is on screen`, () => {
            const hud = hudLayout(vp);
            assert.ok(onScreen({ ...hud.hp, w: 170, h: 90 }, vp), 'HP panel');
            assert.ok(onScreen(hud.log, vp), 'quest log');
            assert.ok(onScreen(xmbBarPanelRect(3, hud.bar), vp), 'item bar');
            assert.ok(onScreen(wheelBox(hud), vp), 'the open wheel');
        });

        test(`${name}: the item bar is centred, and the open wheel stays off it`, () => {
            const hud = hudLayout(vp);
            assert.equal(hud.bar.cx, vp.w / 2);
            assert.ok(!rectsOverlap(wheelBox(hud), xmbBarPanelRect(3, hud.bar)));
        });

        test(`${name}: the buff bar stops short of the page buttons`, () => {
            const hud = hudLayout(vp);
            assert.ok(hud.buffsRight <= vp.w - 6 - 60 * vp.logicalPerCss);
            assert.equal(hud.strip, vp.h);
        });
    }

    test('on a wide screen the log and the item bar share one line', () => {
        const hud = hudLayout(screens['1080p']);
        assert.equal(hud.log.y + hud.log.h, xmbBarPanelRect(3, hud.bar).y + xmbBarPanelRect(3, hud.bar).h);
    });
});
