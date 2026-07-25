import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deviceBagSlotRects, deviceBodyRect, HOTBAR_TOTAL_W,
} from '../game/layout.js';
import { xmbBarLayout, XMB_CHIP_W, CANVAS_INTERNAL_PX } from '../game/layout.js';

// (B4) The bag is now a 50-slot two-zone grid, no longer the hotbar's single-row
// math. Full geometry (SAFE row over PACK grid, non-overlap) is pinned by
// tests/device-layout.test.js; here we only guard against re-coupling to the
// hotbar formula the grid was deliberately cut loose from.
test('deviceBagSlotRects is independent of the hotbar single-row math (50-slot bag)', () => {
  const body = deviceBodyRect();
  const rects = deviceBagSlotRects(body);
  assert.equal(rects.length, 50);                        // two zones, not HOTBAR_SLOTS (9)
  assert.notEqual(rects[0].y, body.y + 44 + 2);          // no longer the hotbar slotY
  const oldOx = Math.round(body.x + (body.w - HOTBAR_TOTAL_W) / 2);
  assert.notEqual(rects[0].x, oldOx + 8);                // grid no longer derives from HOTBAR_TOTAL_W
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
