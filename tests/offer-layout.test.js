import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MODAL_RECT, HIT_SLOP, offerLayout, closeButtonRect, rectsOverlap, expandRect,
} from '../game/layout.js';

const PANEL = MODAL_RECT;
const inPanel = (r) =>
  r.x >= PANEL.x && r.y >= PANEL.y &&
  r.x + r.w <= PANEL.x + PANEL.w && r.y + r.h <= PANEL.y + PANEL.h;

test('MODAL_RECT is the proven {24,44,560,520} bezel', () => {
  assert.deepEqual(MODAL_RECT, { x: 24, y: 44, w: 560, h: 520 });
});

test('offerLayout survives being called with no game at all', () => {
  const L = offerLayout(PANEL, null);
  assert.ok(L.theirs.length > 0 && L.yours.length > 0);
});

test('every rect offerLayout returns sits inside the panel', () => {
  const L = offerLayout(PANEL, null);
  const all = [
    ...L.theirs, ...L.yours, ...L.giveTray, ...L.takeTray,
    L.meterBar, L.desc, L.button, L.theirsScroll, L.yoursScroll,
  ];
  for (const r of all) assert.ok(inPanel(r), `rect escapes the panel: ${JSON.stringify(r)}`);
});

test('siblings inside a tiled group never overlap at zero slop', () => {
  const L = offerLayout(PANEL, null);
  for (const [name, group] of Object.entries({
    theirs: L.theirs, yours: L.yours, giveTray: L.giveTray, takeTray: L.takeTray,
  })) {
    for (let i = 1; i < group.length; i++) {
      assert.ok(!rectsOverlap(group[i - 1], group[i]), `${name} ${i - 1} and ${i} overlap`);
    }
  }
});

test('no cross-group hit rects overlap once expanded by HIT_SLOP', () => {
  const L = offerLayout(PANEL, null);
  const groups = {
    theirs: L.theirs, yours: L.yours, giveTray: L.giveTray, takeTray: L.takeTray,
    controls: [L.button, closeButtonRect(PANEL)],
  };
  const names = Object.keys(groups);
  for (let a = 0; a < names.length; a++) {
    for (let b = a + 1; b < names.length; b++) {
      for (const ra of groups[names[a]]) {
        for (const rb of groups[names[b]]) {
          assert.ok(!rectsOverlap(expandRect(ra, HIT_SLOP), expandRect(rb, HIT_SLOP)),
            `${names[a]} overlaps ${names[b]} under HIT_SLOP`);
        }
      }
    }
  }
});

test('the gutter between the columns exceeds 2 x HIT_SLOP', () => {
  const L = offerLayout(PANEL, null);
  const leftRight = L.theirs[0].x + L.theirs[0].w;
  const gutter = L.yours[0].x - leftRight;
  assert.ok(gutter > 2 * HIT_SLOP,
    `gutter ${gutter} must exceed ${2 * HIT_SLOP} or taps in the gap are ambiguous`);
});

test('the two lists are the same shape, side by side', () => {
  const L = offerLayout(PANEL, null);
  assert.equal(L.theirs.length, L.yours.length);
  for (let i = 0; i < L.theirs.length; i++) {
    assert.equal(L.theirs[i].y, L.yours[i].y, `row ${i} is not level across the columns`);
    assert.equal(L.theirs[i].w, L.yours[i].w);
  }
});

test('the lists sit below the meter and above the trays', () => {
  const L = offerLayout(PANEL, null);
  assert.ok(L.theirs[0].y > L.meterBar.y + L.meterBar.h, 'lists collide with the meter');
  const lastRow = L.theirs[L.theirs.length - 1];
  assert.ok(L.giveTray[0].y >= lastRow.y + lastRow.h, 'trays collide with the lists');
});

test('the description strip sits below the trays and above the ledger', () => {
  const L = offerLayout(PANEL, null);
  const lastSlot = L.giveTray[L.giveTray.length - 1];
  assert.ok(L.desc.y >= lastSlot.y + lastSlot.h, 'description collides with the trays');
  assert.ok(L.ledgerY >= L.desc.y + L.desc.h, 'ledger collides with the description');
});

test('the hint line clears the panel bottom', () => {
  const L = offerLayout(PANEL, null);
  assert.ok(L.hintY + 12 <= PANEL.y + PANEL.h, 'the key legend hangs off the panel');
});

test('the tab strip is absent — this screen has no tabs', () => {
  const L = offerLayout(PANEL, null);
  assert.equal(L.tabs, undefined, 'trade and give are one function; there is nothing to tab between');
});

test('scroll thumbs sit at the inner right edge of their own column', () => {
  const L = offerLayout(PANEL, null);
  assert.ok(L.theirsScroll.x > L.theirs[0].x, 'thumb is not inside its column');
  assert.ok(L.theirsScroll.x + L.theirsScroll.w <= L.theirs[0].x + L.theirs[0].w + 0.5);
  assert.ok(L.yoursScroll.x + L.yoursScroll.w <= L.yours[0].x + L.yours[0].w + 0.5);
});

test('ROWS_VISIBLE rows of 40px is what the band budget affords', () => {
  const L = offerLayout(PANEL, null);
  assert.equal(L.theirs.length, 6);
  assert.equal(L.theirs[0].h, 40);
});
