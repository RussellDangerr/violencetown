import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  XMB_CATEGORIES, XMB_LABELS, xmbCategoryOf, buildXmbBar,
  resolveXmbSelection, cycleXmbCategory, cycleXmbItem,
} from '../game/xmb.js';

const rock   = { id: 'rock',   name: 'Rock',   useType: 'throw', range: 4 };
const sludge = { id: 'sludge', name: 'Sludge', useType: 'throw', range: 5 };
const potion = { id: 'potion', name: 'Potion', useType: 'self', effect: 'heal', healAmount: 30 }; // no category → drink
const burger = { id: 'burger', name: 'Burger', useType: 'self', category: 'ambro', effect: 'heal', healAmount: 15 }; // eat
const cape   = { id: 'red_cape', name: 'Cape', useType: 'equip', equipSlot: 'back' }; // not on the bar
const fur    = { id: 'wererat_fur', name: 'Fur', useType: 'none' };                    // not on the bar

const inv = [
  { itemDef: rock, count: 3 }, null, { itemDef: potion, count: 1 },
  { itemDef: burger, count: 2 }, { itemDef: cape, count: 1 }, { itemDef: fur, count: 1 },
];

test('XMB_CATEGORIES is throw/drink/eat in bar order', () => {
  assert.deepEqual(XMB_CATEGORIES, ['throw', 'drink', 'eat']);
  assert.equal(XMB_LABELS.throw, 'THROW');
});

test('xmbCategoryOf buckets by useType/category and rejects non-usables', () => {
  assert.equal(xmbCategoryOf(rock), 'throw');
  assert.equal(xmbCategoryOf(potion), 'drink');
  assert.equal(xmbCategoryOf(burger), 'eat');
  assert.equal(xmbCategoryOf(cape), null);
  assert.equal(xmbCategoryOf(fur), null);
  assert.equal(xmbCategoryOf(null), null);
});

test('explicit consumeKind overrides the derived bucket', () => {
  assert.equal(xmbCategoryOf({ useType: 'self', category: 'ambro', consumeKind: 'drink' }), 'drink');
});

test('buildXmbBar groups usables, tags backing slot, drops non-usables', () => {
  const bar = buildXmbBar(inv);
  assert.deepEqual(bar.columns.map(c => c.key), ['throw', 'drink', 'eat']);
  assert.equal(bar.columns[0].items[0].itemDef.id, 'rock');
  assert.equal(bar.columns[0].items[0].slot, 0);  // backing inventory index
  const ids = bar.columns.flatMap(c => c.items.map(i => i.itemDef.id));
  assert.ok(!ids.includes('red_cape') && !ids.includes('wererat_fur'));
});

test('buildXmbBar hides categories that have no items', () => {
  const bar = buildXmbBar([{ itemDef: rock, count: 1 }]);
  assert.deepEqual(bar.columns.map(c => c.key), ['throw']);   // no drink/eat columns
});

test('resolveXmbSelection remembers the per-category pick and clamps stale ids', () => {
  const bar = buildXmbBar(inv);
  const sel = resolveXmbSelection(bar, 'drink', { drink: 'potion' });
  assert.equal(sel.column.key, 'drink');
  assert.equal(sel.item.itemDef.id, 'potion');
  const sel2 = resolveXmbSelection(bar, 'throw', { throw: 'gone' });  // stale → first item
  assert.equal(sel2.item.itemDef.id, 'rock');
  assert.equal(resolveXmbSelection(buildXmbBar([]), 'throw', {}), null);  // empty bar
});

test('cycleXmbCategory walks non-empty columns and wraps', () => {
  const bar = buildXmbBar(inv);
  assert.equal(cycleXmbCategory(bar, 'throw', 1), 'drink');
  assert.equal(cycleXmbCategory(bar, 'eat', 1), 'throw');    // wrap forward
  assert.equal(cycleXmbCategory(bar, 'throw', -1), 'eat');   // wrap back
});

test('cycleXmbItem walks items within a column and wraps', () => {
  const bar = buildXmbBar([{ itemDef: rock, count: 1 }, { itemDef: sludge, count: 1 }]);
  assert.equal(cycleXmbItem(bar, 'throw', { throw: 'rock' }, 1), 'sludge');
  assert.equal(cycleXmbItem(bar, 'throw', { throw: 'sludge' }, 1), 'rock');   // wrap
});
