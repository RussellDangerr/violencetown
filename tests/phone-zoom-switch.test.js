// phone-zoom-switch.test.js — TL2: the phone zoom is built behind one switch and ships off.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeViewport, PHONE_ZOOM_ON, PHONE_TILES, MIN_TILES } from '../game/viewport.js';

const DOCK = { oneRow: 96, twoRows: 160, minOneRowW: 700 };
const phone = { cssW: 375, cssH: 812, dpr: 3, dock: DOCK };
const desk = { cssW: 3440, cssH: 1440, dpr: 1, dock: DOCK };

describe('phone zoom switch', () => {
    test('ships switched off', () => {
        assert.equal(PHONE_ZOOM_ON, false);
    });

    test("off: a coarse 375x812 phone is exactly today's viewport", () => {
        const today = computeViewport(phone);
        assert.deepEqual(computeViewport({ ...phone, coarse: true }), today);
        assert.deepEqual(computeViewport({ ...phone, coarse: true, phoneZoom: false }), today);
        assert.ok(today.cols >= MIN_TILES);
    });

    test('on: the short side shows PHONE_TILES tiles at a whole scale, player centred', () => {
        const vp = computeViewport({ ...phone, coarse: true, phoneZoom: true });
        assert.ok(Number.isInteger(vp.k));
        assert.ok(vp.cols >= PHONE_TILES && vp.cols < PHONE_TILES + 1, `cols ${vp.cols}`);
        assert.ok(Math.abs(vp.origin.x + 16 - vp.world.w / 2) <= 2);
        assert.ok(Math.abs(vp.origin.y + 16 - vp.world.h / 2) <= 2);
    });

    test('on but a fine pointer: unchanged', () => {
        assert.deepEqual(computeViewport({ ...phone, phoneZoom: true }), computeViewport(phone));
    });

    test('desktop at 3440x1440 is identical with the switch on or off', () => {
        const today = computeViewport(desk);
        assert.deepEqual(computeViewport({ ...desk, coarse: false, phoneZoom: true }), today);
        assert.deepEqual(computeViewport({ ...desk, coarse: false, phoneZoom: false }), today);
        assert.deepEqual(computeViewport({ ...desk, coarse: true, phoneZoom: false }), today);
    });
});
