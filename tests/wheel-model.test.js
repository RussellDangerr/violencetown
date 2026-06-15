import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  VERB_TREE, categoryKeys, leafAt, LAYER,
  createWheelState, currentLeaf, cycle, forward, back,
  validItemSlots, leafEnabled, compose, autoAimTile,
} from '../game/wheel-model.js';

const G = { inventory: [], enemies: [], containers: [], equipment: {}, playerMp: 0 };

test('verb tree has the four categories in order', () => {
  assert.deepEqual(categoryKeys(), ['FIGHT', 'TRICK', 'TREAT', 'FLIGHT']);
});

test('Fight→Melee is adjacent, no-item, combatAttack', () => {
  const melee = leafAt('FIGHT', 0);
  assert.equal(melee.key, 'melee');
  assert.equal(melee.needsItem, false);
  assert.equal(melee.aimType, 'adjacent');
  assert.equal(melee.resolver, 'combatAttack');
});

test('Trick→Throw needs item + reticle; Treat→Eat is self-use', () => {
  const t = VERB_TREE.TRICK.subverbs.find(s => s.key === 'throw');
  assert.equal(t.needsItem, true); assert.equal(t.aimType, 'reticle'); assert.equal(t.resolver, 'resolveThrow');
  const eat = VERB_TREE.TREAT.subverbs.find(s => s.key === 'eat');
  assert.equal(eat.aimType, 'none'); assert.equal(eat.needsItem, true); assert.equal(eat.resolver, 'resolveUse');
});

test('new wheel starts at CATEGORY on FIGHT', () => {
  const w = createWheelState();
  assert.equal(w.layer, LAYER.CATEGORY);
  assert.equal(w.categoryIndex, 0);
  assert.equal(w.reticle, null);
  assert.equal(w.lastFired, null);
});

test('cycle wraps category index', () => {
  const w = createWheelState();
  cycle(w, -1, G); assert.equal(w.categoryIndex, 3);
  cycle(w, +1, G); assert.equal(w.categoryIndex, 0);
});

test('Defend forward = fire (no item/aim); Melee forward enters AIM', () => {
  const w = createWheelState();
  w.categoryIndex = 3;                 // FLIGHT
  forward(w, G); assert.equal(w.layer, LAYER.SUBVERB);
  assert.equal(currentLeaf(w).key, 'defend');
  assert.equal(forward(w, G), 'fire');
  const w2 = createWheelState();       // FIGHT/Melee
  forward(w2, G);                      // SUBVERB
  assert.equal(forward(w2, G), undefined);
  assert.equal(w2.layer, LAYER.AIM);
});

test('back pops layers and closes at the top', () => {
  const w = createWheelState();
  forward(w, G); back(w); assert.equal(w.layer, LAYER.CATEGORY);
  assert.equal(back(w), 'close');
});

test('Magic disabled without MP/spells; Melee always enabled; Throw needs throwables', () => {
  assert.equal(leafEnabled(VERB_TREE.FIGHT.subverbs[2], G), false);
  assert.equal(leafEnabled(VERB_TREE.FIGHT.subverbs[0], G), true);
  assert.equal(leafEnabled(VERB_TREE.TRICK.subverbs[0], G), false);
});

test('compose returns leaf, item slot, reticle tile', () => {
  const w = createWheelState();
  w.categoryIndex = 1; w.subVerbIndex = 0; // TRICK/Throw
  w.itemIndex = 2; w.reticle = { x: 5, y: 7 };
  const c = compose(w);
  assert.equal(c.leaf.key, 'throw');
  assert.equal(c.itemSlot, 2);
  assert.deepEqual(c.aimTile, { x: 5, y: 7 });
});

test('autoAim picks nearest hostile, else facing tile', () => {
  const board = {
    playerX: 5, playerY: 5, facing: 'down', map: { isWalkable: () => true },
    enemies: [
      { x: 5, y: 9, entity: { isAlive: () => true }, behavior: ['HOSTILE'] },
      { x: 6, y: 5, entity: { isAlive: () => true }, behavior: ['HOSTILE'] },
    ],
  };
  assert.deepEqual(autoAimTile(VERB_TREE.FIGHT.subverbs[0], board), { x: 6, y: 5 });
  assert.deepEqual(autoAimTile(VERB_TREE.FIGHT.subverbs[0], { ...board, enemies: [] }), { x: 5, y: 6 });
});
