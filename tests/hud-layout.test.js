// hud-layout.test.js — pure rect geometry helpers for the HUD non-overlap invariant.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { rectsOverlap, expandRect } from '../game/layout.js';

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
