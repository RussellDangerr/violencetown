import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deviceBagSlotRects, deviceBodyRect,
  HOTBAR_SLOTS, HOTBAR_SLOT_W, HOTBAR_SLOT_H, HOTBAR_STRIDE, HOTBAR_TOTAL_W,
} from '../game/layout.js';

test('deviceBagSlotRects returns one rect per hotbar slot, left-to-right, inside the body', () => {
  const body = deviceBodyRect();
  const rects = deviceBagSlotRects(body);
  assert.equal(rects.length, HOTBAR_SLOTS);
  for (const r of rects) {
    assert.equal(r.w, HOTBAR_SLOT_W);
    assert.equal(r.h, HOTBAR_SLOT_H);
    assert.ok(r.x >= body.x - 1, `slot x ${r.x} left of body`);
    assert.ok(r.x + r.w <= body.x + body.w + 1, `slot right of body`);
  }
  for (let i = 1; i < rects.length; i++) {
    assert.equal(rects[i].x - rects[i - 1].x, HOTBAR_STRIDE);
  }
});

test('deviceBagSlotRects matches _drawHotbar hosted math (ox + 8, oy + 46)', () => {
  const body = deviceBodyRect();
  const ox = Math.round(body.x + (body.w - HOTBAR_TOTAL_W) / 2);
  const rects = deviceBagSlotRects(body);
  assert.equal(rects[0].x, ox + 8);
  assert.equal(rects[0].y, body.y + 44 + 2);
});
