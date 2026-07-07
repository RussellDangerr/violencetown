import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVICE_RECT, DEVICE_TABS, DEVICE_TAB_H,
  deviceTabRect, deviceBodyRect, cycleDeviceTab, closeButtonRect,
} from '../game/layout.js';

test('DEVICE_RECT reuses the proven {24,44,560,520} panel bezel', () => {
  assert.deepEqual(DEVICE_RECT, { x: 24, y: 44, w: 560, h: 520 });
});

test('DEVICE_TABS is the four tabs in order', () => {
  assert.deepEqual(DEVICE_TABS, ['items', 'gear', 'quests', 'map']);
});

test('cycleDeviceTab wraps forward', () => {
  assert.equal(cycleDeviceTab('items', 1), 'gear');
  assert.equal(cycleDeviceTab('gear', 1), 'quests');
  assert.equal(cycleDeviceTab('quests', 1), 'map');
  assert.equal(cycleDeviceTab('map', 1), 'items');   // wrap
});

test('cycleDeviceTab wraps backward', () => {
  assert.equal(cycleDeviceTab('items', -1), 'map');  // wrap
  assert.equal(cycleDeviceTab('map', -1), 'quests');
  assert.equal(cycleDeviceTab('gear', -1), 'items');
});

test('cycleDeviceTab defaults an unknown tab to the first', () => {
  assert.equal(cycleDeviceTab('bogus', 1), 'items');
  assert.equal(cycleDeviceTab(null, 1), 'items');
});

test('deviceTabRect returns 4 tabs sharing y/h, left-to-right, non-overlapping, inside the frame', () => {
  const r = [0, 1, 2, 3].map(deviceTabRect);
  for (const t of r) {
    assert.equal(t.y, r[0].y);
    assert.equal(t.h, r[0].h);
    assert.ok(t.x >= DEVICE_RECT.x, `tab x ${t.x} < frame left`);
    assert.ok(t.x + t.w <= DEVICE_RECT.x + DEVICE_RECT.w, `tab right ${t.x + t.w} > frame right`);
  }
  for (let i = 1; i < 4; i++) {
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
