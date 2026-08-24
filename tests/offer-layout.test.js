import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MODAL_RECT, HIT_SLOP, offerLayout, closeButtonRect, rectsOverlap, expandRect,
  offerRowIndexAt, offerTraySlotAt,
} from '../game/layout.js';

const PANEL = MODAL_RECT;
const inPanel = (r) =>
  r.x >= PANEL.x && r.y >= PANEL.y &&
  r.x + r.w <= PANEL.x + PANEL.w && r.y + r.h <= PANEL.y + PANEL.h;

test('MODAL_RECT is the proven {24,44,560,520} bezel', () => {
  assert.deepEqual(MODAL_RECT, { x: 24, y: 44, w: 560, h: 520 });
});

test('MODAL_RECT is frozen — five names share one identity, not five mutable copies', () => {
  assert.ok(Object.isFrozen(MODAL_RECT));
  assert.throws(() => { MODAL_RECT.w = 1; });
});

test('offerLayout survives being called with no panel at all', () => {
  const L = offerLayout(null);
  assert.ok(L.theirs.length > 0 && L.yours.length > 0);
});

test('every rect offerLayout returns sits inside the panel', () => {
  const L = offerLayout(PANEL);
  const all = [
    ...L.theirs, ...L.yours, ...L.giveTray, ...L.takeTray,
    L.meterBar, L.desc, L.ledger, L.button, L.theirsScrollTrack, L.yoursScrollTrack,
  ];
  for (const r of all) assert.ok(inPanel(r), `rect escapes the panel: ${JSON.stringify(r)}`);
});

test('siblings inside a tiled group never overlap at zero slop', () => {
  const L = offerLayout(PANEL);
  for (const [name, group] of Object.entries({
    theirs: L.theirs, yours: L.yours, giveTray: L.giveTray, takeTray: L.takeTray,
  })) {
    for (let i = 1; i < group.length; i++) {
      assert.ok(!rectsOverlap(group[i - 1], group[i]), `${name} ${i - 1} and ${i} overlap`);
    }
  }
});

test('no cross-group hit rects overlap once expanded by HIT_SLOP', () => {
  const L = offerLayout(PANEL);
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
  const L = offerLayout(PANEL);
  const leftRight = L.theirs[0].x + L.theirs[0].w;
  const gutter = L.yours[0].x - leftRight;
  assert.ok(gutter > 2 * HIT_SLOP,
    `gutter ${gutter} must exceed ${2 * HIT_SLOP} or taps in the gap are ambiguous`);
});

test('the two lists are the same shape, side by side', () => {
  const L = offerLayout(PANEL);
  assert.equal(L.theirs.length, L.yours.length);
  for (let i = 0; i < L.theirs.length; i++) {
    assert.equal(L.theirs[i].y, L.yours[i].y, `row ${i} is not level across the columns`);
    assert.equal(L.theirs[i].w, L.yours[i].w);
  }
});

test('the lists sit below the meter and above the trays', () => {
  const L = offerLayout(PANEL);
  assert.ok(L.theirs[0].y > L.meterBar.y + L.meterBar.h, 'lists collide with the meter');
  const lastRow = L.theirs[L.theirs.length - 1];
  assert.ok(L.giveTray[0].y >= lastRow.y + lastRow.h, 'trays collide with the lists');
});

test('the description strip sits below the trays and above the ledger', () => {
  const L = offerLayout(PANEL);
  const lastSlot = L.giveTray[L.giveTray.length - 1];
  assert.ok(L.desc.y >= lastSlot.y + lastSlot.h, 'description collides with the trays');
  assert.ok(L.ledger.y >= L.desc.y + L.desc.h, 'ledger collides with the description');
});

test('the hint line clears the panel bottom', () => {
  const L = offerLayout(PANEL);
  assert.ok(L.hintY + 12 <= PANEL.y + PANEL.h, 'the key legend hangs off the panel');
});

test('the tab strip is absent — this screen has no tabs', () => {
  const L = offerLayout(PANEL);
  assert.equal(L.tabs, undefined, 'trade and give are one function; there is nothing to tab between');
});

test('scroll tracks sit at the inner right edge of their own column', () => {
  const L = offerLayout(PANEL);
  assert.ok(L.theirsScrollTrack.x > L.theirs[0].x, 'theirs track is not inside its column');
  assert.ok(L.theirsScrollTrack.x + L.theirsScrollTrack.w <= L.theirs[0].x + L.theirs[0].w + 0.5);
  assert.ok(L.yoursScrollTrack.x > L.yours[0].x, 'yours track is not inside its column');
  assert.ok(L.yoursScrollTrack.x + L.yoursScrollTrack.w <= L.yours[0].x + L.yours[0].w + 0.5);
});

test('ROWS_VISIBLE rows of 40px is what the band budget affords', () => {
  const L = offerLayout(PANEL);
  assert.equal(L.theirs.length, 6);
  assert.equal(L.theirs[0].h, 40);
});

test('every bare Y scalar lands inside the panel band', () => {
  const L = offerLayout(PANEL);
  const ys = { colHeadY: L.colHeadY, trayLabelY: L.trayLabelY, hintY: L.hintY };
  for (const [name, y] of Object.entries(ys)) {
    assert.ok(y >= PANEL.y && y <= PANEL.y + PANEL.h - 12, `${name}=${y} escapes the panel band`);
  }
});

// ── Item 1: one coordinate contract — everything derives from P ──────────────

test('offerLayout translates cleanly to a same-size panel moved on the canvas', () => {
  const SHIFTED = { x: 100, y: 60, w: 560, h: 520 };
  const L = offerLayout(SHIFTED);
  const within = (r) =>
    r.x >= SHIFTED.x && r.y >= SHIFTED.y &&
    r.x + r.w <= SHIFTED.x + SHIFTED.w && r.y + r.h <= SHIFTED.y + SHIFTED.h;
  const all = [
    ...L.theirs, ...L.yours, ...L.giveTray, ...L.takeTray,
    L.meterBar, L.desc, L.ledger, L.button, L.theirsScrollTrack, L.yoursScrollTrack,
  ];
  for (const r of all) assert.ok(within(r), `rect escapes the shifted panel: ${JSON.stringify(r)}`);
});

test('offerLayout on a shifted panel is a pure translation of the MODAL_RECT layout', () => {
  const dx = 76, dy = 16;
  const SHIFTED = { x: MODAL_RECT.x + dx, y: MODAL_RECT.y + dy, w: MODAL_RECT.w, h: MODAL_RECT.h };
  const A = offerLayout(MODAL_RECT), B = offerLayout(SHIFTED);
  assert.equal(B.button.x, A.button.x + dx);
  assert.equal(B.button.y, A.button.y + dy);
  assert.equal(B.theirs[0].x, A.theirs[0].x + dx);
  assert.equal(B.theirs[0].y, A.theirs[0].y + dy);
  assert.equal(B.hintY, A.hintY + dy);
  assert.equal(B.ledger.y, A.ledger.y + dy);
  assert.equal(B.ledgerBalanceX, A.ledgerBalanceX + dx);
});

// ── Item 2: the button derives from the ledger row ────────────────────────────

test('the button is derived from the ledger row, not a hardcoded y', () => {
  const L = offerLayout(PANEL);
  assert.equal(L.button.y, L.ledger.y - 2);
});

// ── Item 3: the ledger is a band with named anchors, not a bare scalar ────────

test('the ledger band exposes value and balance anchors in order, ending before the button', () => {
  const L = offerLayout(PANEL);
  assert.ok(L.ledger.x < L.ledgerValueX, 'value anchor must sit right of the label');
  assert.ok(L.ledgerValueX < L.ledgerBalanceX, 'balance anchor must sit right of the value');
  assert.ok(L.ledger.x + L.ledger.w <= L.button.x, 'ledger band must not run into the button');
});

// ── Item 4: offerRowIndexAt / offerTraySlotAt — the slop policy, executable ──

test('offerRowIndexAt resolves a tap inside a row to that row', () => {
  const L = offerLayout(PANEL);
  const r2 = L.theirs[2];
  assert.equal(offerRowIndexAt(L, { x: r2.x + 5, y: r2.y + 5 }, 'theirs', 0), 2);
});

test('offerRowIndexAt folds in the scroll offset', () => {
  const L = offerLayout(PANEL);
  const r0 = L.theirs[0];
  assert.equal(offerRowIndexAt(L, { x: r0.x + 5, y: r0.y + 5 }, 'theirs', 7), 7);
});

test('offerRowIndexAt picks the side that was asked for, not just the nearer one', () => {
  const L = offerLayout(PANEL);
  const y0 = L.yours[0];
  assert.equal(offerRowIndexAt(L, { x: y0.x + 5, y: y0.y + 5 }, 'yours', 0), 0);
  assert.equal(offerRowIndexAt(L, { x: y0.x + 5, y: y0.y + 5 }, 'theirs', 0), -1);
});

test('offerRowIndexAt: a point exactly on the shared boundary belongs to the row below (half-open tiling)', () => {
  const L = offerLayout(PANEL);
  const r0 = L.theirs[0], r1 = L.theirs[1];
  assert.equal(r0.y + r0.h, r1.y, 'rows are assumed contiguous for this test to be meaningful');
  assert.equal(offerRowIndexAt(L, { x: r0.x + 5, y: r0.y + r0.h }, 'theirs', 0), 1);
  assert.equal(offerRowIndexAt(L, { x: r0.x + 5, y: r0.y + r0.h - 1 }, 'theirs', 0), 0);
});

test('offerRowIndexAt returns -1 one pixel above the first row (zero slop, no outer affordance)', () => {
  const L = offerLayout(PANEL);
  const first = L.theirs[0];
  assert.equal(offerRowIndexAt(L, { x: first.x + 5, y: first.y - 1 }, 'theirs', 0), -1);
});

test('offerRowIndexAt returns -1 at/below the last row (zero slop, no outer affordance)', () => {
  const L = offerLayout(PANEL);
  const last = L.theirs[L.theirs.length - 1];
  assert.equal(offerRowIndexAt(L, { x: last.x + 5, y: last.y + last.h }, 'theirs', 0), -1);
});

test('offerRowIndexAt returns -1 outside the column on x, even within the row band on y', () => {
  const L = offerLayout(PANEL);
  const r0 = L.theirs[0];
  assert.equal(offerRowIndexAt(L, { x: r0.x - 1, y: r0.y + 5 }, 'theirs', 0), -1);
  assert.equal(offerRowIndexAt(L, { x: r0.x + r0.w, y: r0.y + 5 }, 'theirs', 0), -1);
});

test('offerTraySlotAt resolves a tap inside a slot to that slot', () => {
  const L = offerLayout(PANEL);
  const s3 = L.giveTray[3];
  assert.equal(offerTraySlotAt(L, { x: s3.x + 5, y: s3.y + 5 }, 'give'), 3);
});

test('offerTraySlotAt returns -1 for a tap in the real inter-slot gap', () => {
  const L = offerLayout(PANEL);
  const s0 = L.giveTray[0], s1 = L.giveTray[1];
  const gapX = (s0.x + s0.w + s1.x) / 2;   // dead centre of the 6px gap
  assert.equal(offerTraySlotAt(L, { x: gapX, y: s0.y + 5 }, 'give'), -1);
});

test('offerTraySlotAt returns -1 one pixel left of the first slot (zero slop, no outer affordance)', () => {
  const L = offerLayout(PANEL);
  const s0 = L.giveTray[0];
  assert.equal(offerTraySlotAt(L, { x: s0.x - 1, y: s0.y + 5 }, 'give'), -1);
});

test('offerTraySlotAt distinguishes give from take', () => {
  const L = offerLayout(PANEL);
  const t2 = L.takeTray[2];
  assert.equal(offerTraySlotAt(L, { x: t2.x + 5, y: t2.y + 5 }, 'take'), 2);
  assert.equal(offerTraySlotAt(L, { x: t2.x + 5, y: t2.y + 5 }, 'give'), -1);
});
