import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deviceBagSlotRects, deviceBodyRect, HOTBAR_TOTAL_W,
} from '../game/layout.js';
import { xmbBarLayout, XMB_CHIP_W, CANVAS_INTERNAL_PX, HIT_SLOP, expandRect, rectsOverlap } from '../game/layout.js';

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

// ── The bar shows its whole column (plans/combat-hud.md stage 5) ─────────────
//
// The bar used to be category chips over a SINGLE current-item cell with ▲/▼
// arrows — Caelan: "needs to be more functional than just a single item". It
// now lays the active column out as a row of cells inside the same panel.
//
// The row is horizontal, not the vertical column `plans/item-hotbar-xmb.md`
// describes: that doc predates the dock and was written for the old 608 square.
// The dock's bar panel is 82px tall, which one 40px cell already fills, so a
// vertical column could only exist by growing over the world or the message
// log — the collision stage 2 just fixed for the dial. Caelan ruled the row.

const colOf = (key, ids) => ({ key, label: key.toUpperCase(), items: ids.map((id, i) => ({ slot: i, itemDef: { id }, count: 1 })) });
const barWith = (...cols) => ({ columns: cols });

test('the active column is laid out as a row of cells, not one', () => {
  const bar = barWith(colOf('throw', ['rock', 'bomb', 'bottle']), colOf('drink', ['potion']));
  const lay = xmbBarLayout(bar, undefined, { colIndex: 0, itemIndex: 0 });
  assert.equal(lay.items.length, 3, 'one cell per item in the active column');
  for (let i = 1; i < lay.items.length; i++) {
    assert.ok(lay.items[i].x >= lay.items[i - 1].x + lay.items[i - 1].w, 'item cells overlap');
    assert.equal(lay.items[i].y, lay.items[0].y, 'the row is a row');
  }
});

test('the cells carry which item they are, so a tap can select it', () => {
  const bar = barWith(colOf('throw', ['rock', 'bomb']));
  const lay = xmbBarLayout(bar, undefined, { colIndex: 0, itemIndex: 1 });
  assert.deepEqual(lay.items.map((c) => c.id), ['rock', 'bomb']);
  assert.deepEqual(lay.items.map((c) => c.index), [0, 1]);
});

test('the selected cell is marked, and `current` still points at it', () => {
  const bar = barWith(colOf('throw', ['rock', 'bomb', 'bottle']));
  const lay = xmbBarLayout(bar, undefined, { colIndex: 0, itemIndex: 1 });
  assert.equal(lay.items.filter((c) => c.selected).length, 1);
  assert.equal(lay.items.find((c) => c.selected).id, 'bomb');
  assert.deepEqual({ x: lay.current.x, y: lay.current.y }, { x: lay.items[1].x, y: lay.items[1].y },
    'current must stay the selected cell — main hit-tests it to fire');
});

test('the row never grows wider than the chips above it', () => {
  for (const n of [1, 2, 3]) {
    const cols = ['throw', 'drink', 'eat'].slice(0, n).map((k) => colOf(k, Array.from({ length: 9 }, (_, i) => `i${i}`)));
    const lay = xmbBarLayout(barWith(...cols), undefined, { colIndex: 0, itemIndex: 0 });
    const chipsL = lay.chips[0].x, chipsR = lay.chips.at(-1).x + lay.chips.at(-1).w;
    assert.ok(lay.items[0].x >= chipsL, `${n} cols: row starts left of the chips`);
    assert.ok(lay.items.at(-1).x + lay.items.at(-1).w <= chipsR, `${n} cols: row runs past the chips`);
  }
});

test('a column longer than the row windows around the selection, keeping it visible', () => {
  const long = colOf('throw', Array.from({ length: 12 }, (_, i) => `i${i}`));
  for (const pick of [0, 5, 11]) {
    const lay = xmbBarLayout(barWith(long), undefined, { colIndex: 0, itemIndex: pick });
    assert.ok(lay.items.some((c) => c.selected && c.index === pick), `selection ${pick} scrolled off the row`);
  }
});

test('the ▲/▼ affordance survives for a column longer than the row', () => {
  const long = colOf('throw', Array.from({ length: 12 }, (_, i) => `i${i}`));
  const lay = xmbBarLayout(barWith(long), undefined, { colIndex: 0, itemIndex: 0 });
  assert.ok(lay.up && lay.down, 'a long column still needs its scroll affordance');
  assert.ok(lay.overflow, 'and the renderer needs to know there is more');
});

test('a single-item column needs no overflow affordance', () => {
  const lay = xmbBarLayout(barWith(colOf('throw', ['rock'])), undefined, { colIndex: 0, itemIndex: 0 });
  assert.equal(lay.items.length, 1);
  assert.equal(lay.overflow, false);
});

test('no selection given still yields a usable layout (first item of the first column)', () => {
  const lay = xmbBarLayout(barWith(colOf('throw', ['rock', 'bomb'])));
  assert.equal(lay.items.length, 2);
  assert.equal(lay.items.find((c) => c.selected).id, 'rock');
});

test('an empty bar yields no cells and does not throw', () => {
  const lay = xmbBarLayout({ columns: [] });
  assert.deepEqual(lay.items, []);
});

test('adjacent item cells never share a tap zone under HIT_SLOP', () => {
  // Cells are 32 wide; a HIT_SLOP of 6 grows each by 6 on every side, so the
  // gap has to be at least 12 or two neighbours both claim the same pixel and
  // which one fires depends on iteration order. Structural, not a tie-break.
  const bar = barWith(colOf('throw', ['a', 'b', 'c', 'd']));
  const lay = xmbBarLayout(bar, undefined, { colIndex: 0, itemIndex: 0 });
  for (let i = 1; i < lay.items.length; i++) {
    const prev = expandRect(lay.items[i - 1], HIT_SLOP);
    const cur = expandRect(lay.items[i], HIT_SLOP);
    assert.ok(!rectsOverlap(prev, cur), `cells ${i - 1} and ${i} share a tap zone`);
  }
});
