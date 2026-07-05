import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderedTargetVerbs } from '../game/wheel-model.js';

const G = { playerX: 5, playerY: 5, inventory: [] };

test('friendly NPC: Talk default on top, Cancel last', () => {
  const npc = { x: 6, y: 5, behavior: ['IDLE'], dialogueId: 'x', bribeable: true,
                entity: { isAlive: () => true } };
  const list = orderedTargetVerbs({ x: 6, y: 5, npc }, G).map(v => v.key);
  assert.equal(list[0], 'talk');                 // default on top
  assert.equal(list[list.length - 1], 'cancel'); // Cancel last
  assert.ok(list.indexOf('examine') < list.indexOf('cancel')); // Examine above Cancel
});

test('hostile NPC: Attack (hit) default on top', () => {
  const npc = { x: 6, y: 5, behavior: ['HOSTILE'], entity: { isAlive: () => true } };
  const list = orderedTargetVerbs({ x: 6, y: 5, npc }, G).map(v => v.key);
  assert.equal(list[0], 'hit');
  assert.equal(list[list.length - 1], 'cancel');
});

test('ground item: Take default, then Examine, then Cancel', () => {
  const item = { def: { name: '[Rock]' } };
  const list = orderedTargetVerbs({ x: 6, y: 5, item }, G).map(v => v.key);
  assert.deepEqual(list, ['take', 'examine', 'cancel']);
});

test('always ends with a cancel verb carrying the cancel resolver', () => {
  const npc = { x: 6, y: 5, behavior: ['IDLE'], dialogueId: 'x', entity: { isAlive: () => true } };
  const list = orderedTargetVerbs({ x: 6, y: 5, npc }, G);
  const last = list[list.length - 1];
  assert.equal(last.key, 'cancel');
  assert.equal(last.resolver, 'cancel');
});
