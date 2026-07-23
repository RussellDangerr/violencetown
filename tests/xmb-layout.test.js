import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deviceBagSlotRects, deviceBodyRect,
  HOTBAR_SLOTS, HOTBAR_SLOT_W, HOTBAR_SLOT_H, HOTBAR_STRIDE, HOTBAR_TOTAL_W,
} from '../game/layout.js';
import { xmbBarLayout, XMB_CHIP_W, CANVAS_INTERNAL_PX } from '../game/layout.js';

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

const barOf = (keys) => ({ columns: keys.map(k => ({ key: k, label: k.toUpperCase(), items: [{ itemDef: { id: k }, count: 1 }] })) });

test('xmbBarLayout emits one chip per column, centered, non-overlapping', () => {
  const lay = xmbBarLayout(barOf(['throw', 'drink', 'eat']));
  assert.equal(lay.chips.length, 3);
  for (let i = 1; i < lay.chips.length; i++) {
    assert.ok(lay.chips[i].x >= lay.chips[i - 1].x + lay.chips[i - 1].w, 'chips overlap');
  }
  const mid = (lay.chips[0].x + lay.chips[2].x + lay.chips[2].w) / 2;
  assert.ok(Math.abs(mid - CANVAS_INTERNAL_PX / 2) < XMB_CHIP_W, 'chip row not roughly centered');
});

test('xmbBarLayout sits along the bottom (aligned with the old hotbar)', () => {
  const lay = xmbBarLayout(barOf(['throw']));
  assert.ok(lay.bottom <= CANVAS_INTERNAL_PX, 'bar bottom below the canvas');
  assert.ok(lay.current.y < lay.bottom, 'current cell below its own bottom');
  assert.ok(lay.chips[0].y < lay.current.y, 'chips should sit above the current item cell');
});

test('xmbBarLayout on an empty bar yields no chips', () => {
  const lay = xmbBarLayout({ columns: [] });
  assert.equal(lay.chips.length, 0);
});
