import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deviceEquipLayout, deviceBodyRect, EQUIPMENT_MODAL_RECT } from '../game/layout.js';

// The GEAR tab hosts the equipment figure + 6 slot plates inside the (shorter)
// device body. A pure dy-offset does NOT fit (the bottom WEAPON plate overflows),
// so deviceEquipLayout PROPORTIONALLY maps the whole modal-space layout into the
// body. Both renderer._drawEquipmentModal and main._tapDevice read this ONE helper.

test('deviceEquipLayout maps the figure + all 6 slots INSIDE the device body', () => {
  const body = deviceBodyRect();
  const { figure, slots } = deviceEquipLayout(body);
  const within = (r) =>
    r.x >= body.x - 0.5 && r.x + r.w <= body.x + body.w + 0.5 &&
    r.y >= body.y - 0.5 && r.y + r.h <= body.y + body.h + 0.5;
  assert.ok(within(figure), `figure ${JSON.stringify(figure)} escapes body ${JSON.stringify(body)}`);
  assert.equal(slots.length, 6);
  for (const s of slots) assert.ok(within(s), `slot ${s.key} ${JSON.stringify(s)} escapes body`);
});

test('deviceEquipLayout preserves each slot key + label (only geometry changes)', () => {
  const { slots } = deviceEquipLayout(deviceBodyRect());
  assert.deepEqual(slots.map(s => s.key).sort(),
    ['back', 'bottom', 'front', 'sides', 'top', 'weapon']);
  assert.ok(slots.every(s => typeof s.label === 'string' && s.w > 0 && s.h > 0));
});

test('deviceEquipLayout scales DOWN (the body is shorter than the full 520 modal)', () => {
  const { figure } = deviceEquipLayout(deviceBodyRect());
  assert.ok(figure.h > 0 && figure.h < EQUIPMENT_MODAL_RECT.h);
});
