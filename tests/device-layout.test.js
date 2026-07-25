import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVICE_RECT, DEVICE_TABS, DEVICE_TAB_H,
  deviceTabRect, deviceBodyRect, cycleDeviceTab, closeButtonRect,
  deviceBagSlotRects, rectsOverlap, inspectorPanelRect,
} from '../game/layout.js';

test('DEVICE_RECT reuses the proven {24,44,560,520} panel bezel', () => {
  assert.deepEqual(DEVICE_RECT, { x: 24, y: 44, w: 560, h: 520 });
});

test('DEVICE_TABS is the five tabs in order', () => {
  assert.deepEqual(DEVICE_TABS, ['items', 'gear', 'quests', 'map', 'rings']);
});

test('cycleDeviceTab wraps forward', () => {
  assert.equal(cycleDeviceTab('items', 1), 'gear');
  assert.equal(cycleDeviceTab('gear', 1), 'quests');
  assert.equal(cycleDeviceTab('quests', 1), 'map');
  assert.equal(cycleDeviceTab('map', 1), 'rings');
  assert.equal(cycleDeviceTab('rings', 1), 'items');   // wrap
});

test('cycleDeviceTab wraps backward', () => {
  assert.equal(cycleDeviceTab('items', -1), 'rings');  // wrap
  assert.equal(cycleDeviceTab('rings', -1), 'map');
  assert.equal(cycleDeviceTab('gear', -1), 'items');
});

test('cycleDeviceTab defaults an unknown tab to the first', () => {
  assert.equal(cycleDeviceTab('bogus', 1), 'items');
  assert.equal(cycleDeviceTab(null, 1), 'items');
});

test('deviceTabRect returns 5 tabs sharing y/h, left-to-right, non-overlapping, inside the frame', () => {
  const r = [0, 1, 2, 3, 4].map(deviceTabRect);
  for (const t of r) {
    assert.equal(t.y, r[0].y);
    assert.equal(t.h, r[0].h);
    assert.ok(t.x >= DEVICE_RECT.x, `tab x ${t.x} < frame left`);
    assert.ok(t.x + t.w <= DEVICE_RECT.x + DEVICE_RECT.w, `tab right ${t.x + t.w} > frame right`);
  }
  for (let i = 1; i < 5; i++) {
    assert.ok(r[i].x >= r[i - 1].x + r[i - 1].w, `tab ${i} overlaps tab ${i - 1}`);
  }
});

test('the tab strip sits BELOW the ✕ close chip (no top-right collision)', () => {
  const chip = closeButtonRect(DEVICE_RECT);   // top-right of the bezel
  const tab0 = deviceTabRect(0);
  assert.ok(tab0.y >= chip.y + chip.h,
    `tab strip y=${tab0.y} collides with the close chip (ends at ${chip.y + chip.h})`);
});

test('deviceBodyRect sits below the tab strip and inside the frame', () => {
  const strip = deviceTabRect(0);
  const body = deviceBodyRect();
  assert.ok(body.y >= strip.y + strip.h, 'body overlaps the tab strip');
  assert.ok(body.x >= DEVICE_RECT.x, 'body left of frame');
  assert.ok(body.x + body.w <= DEVICE_RECT.x + DEVICE_RECT.w, 'body right of frame');
  assert.ok(body.y + body.h <= DEVICE_RECT.y + DEVICE_RECT.h, 'body below frame');
  assert.ok(body.h > 300, 'body too short to host the tab content');
});

test('DEVICE_TAB_H is a named constant (no magic number)', () => {
  assert.equal(typeof DEVICE_TAB_H, 'number');
  assert.equal(deviceTabRect(0).h, DEVICE_TAB_H);
});

test('deviceBagSlotRects returns 50 rects: SAFE row (0-9) above PACK grid (10-49), none overlapping', () => {
  const body = deviceBodyRect();
  const rects = deviceBagSlotRects(body);
  assert.equal(rects.length, 50);
  for (let i = 1; i < 10; i++) assert.equal(rects[i].y, rects[0].y, `SAFE slot ${i} not on the SAFE row`);
  assert.ok(rects[10].y > rects[0].y + rects[0].h, 'PACK grid must sit below the SAFE row');
  for (const r of rects) {
    assert.ok(r.x >= body.x - 0.5 && r.x + r.w <= body.x + body.w + 0.5, 'slot escapes body x');
    assert.ok(r.y >= body.y - 0.5 && r.y + r.h <= body.y + body.h + 0.5, 'slot escapes body y');
  }
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++)
      assert.ok(!rectsOverlap(rects[i], rects[j]), `bag slots ${i} and ${j} overlap`);
});

test('the inspector panel does not overlap any bag slot', () => {
  const body = deviceBodyRect();
  const panel = inspectorPanelRect(body);
  for (const r of deviceBagSlotRects(body)) {
    assert.ok(!rectsOverlap(r, panel), 'inspector panel overlaps a bag slot');
  }
  assert.ok(panel.y + panel.h <= body.y + body.h + 0.5, 'inspector panel escapes the body bottom');
});
