import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderedTargetVerbs, defaultVerb, targetVerbs } from '../game/wheel-model.js';

const G = { playerX: 5, playerY: 5, inventory: [] };
const friendly = { x: 6, y: 5, behavior: ['IDLE'], dialogueId: 'x', bribeable: true, entity: { isAlive: () => true } };
const hostile  = { x: 6, y: 5, behavior: ['HOSTILE'], entity: { isAlive: () => true } };
const rock     = { def: { name: '[Rock]' } };

test('friendly NPC: Talk default on top, Cancel last', () => {
  const list = orderedTargetVerbs({ x: 6, y: 5, npc: friendly }, G).map(v => v.key);
  assert.equal(list[0], 'talk');                 // default on top
  assert.equal(list[list.length - 1], 'cancel'); // Cancel last
  assert.ok(list.indexOf('examine') < list.indexOf('cancel'));
});

test('hostile NPC: Attack (hit) default on top', () => {
  const list = orderedTargetVerbs({ x: 6, y: 5, npc: hostile }, G).map(v => v.key);
  assert.equal(list[0], 'hit');
  assert.equal(list[list.length - 1], 'cancel');
});

test('ground item: Take default, then Examine, then Cancel', () => {
  const list = orderedTargetVerbs({ x: 6, y: 5, item: rock }, G).map(v => v.key);
  assert.deepEqual(list, ['take', 'examine', 'cancel']);
});

test('verbs are offered regardless of range (adjacency handled at fire-time)', () => {
  // A FAR item still offers Take now — firing walks the Hero adjacent first, so
  // there is no teleport-grab. (Supersedes the old offer-time adjacency gate.)
  const list = orderedTargetVerbs({ x: 9, y: 9, item: rock }, G).map(v => v.key);   // cheb 4
  assert.deepEqual(list, ['take', 'examine', 'cancel']);
});

test('defaultVerb picks by type: item→take, hostile→hit, friendly→talk, POI→examine', () => {
  assert.equal(defaultVerb({ x: 6, y: 5, item: rock }, G).key, 'take');
  assert.equal(defaultVerb({ x: 6, y: 5, npc: hostile }, G).key, 'hit');
  assert.equal(defaultVerb({ x: 6, y: 5, npc: friendly }, G).key, 'talk');
  assert.equal(defaultVerb({ x: 6, y: 5, examinable: { id: 'sign' } }, G).key, 'examine');
});

test('adjacency-requiring verbs carry needsAdjacent; Examine does not', () => {
  const verbs = targetVerbs({ x: 6, y: 5, npc: friendly }, G);
  const by = k => verbs.find(v => v.key === k);
  assert.equal(by('talk').needsAdjacent, true);
  assert.equal(by('trade').needsAdjacent, true);
  assert.equal(by('bribe').needsAdjacent, true);
  assert.ok(!by('examine').needsAdjacent);
  assert.equal(targetVerbs({ x: 6, y: 5, item: rock }, G).find(v => v.key === 'take').needsAdjacent, true);
});

test('always ends with a cancel verb carrying the cancel resolver', () => {
  const list = orderedTargetVerbs({ x: 6, y: 5, npc: friendly }, G);
  const last = list[list.length - 1];
  assert.equal(last.key, 'cancel');
  assert.equal(last.resolver, 'cancel');
});
