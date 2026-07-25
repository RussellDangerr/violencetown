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
