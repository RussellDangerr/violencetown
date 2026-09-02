import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderedTargetVerbs, defaultVerb, targetVerbs } from '../game/wheel-model.js';

// Stubs carry `allegiance`, NOT the authored `behavior` array: since PD-3 the
// runtime hostility predicate is isHostile(e) === (e.allegiance === 'hostile')
// (ai.js), and a real Enemy gets that field once at construction via
// deriveAllegiance. A bare stub never runs the ctor, so it must state allegiance
// itself. (These stubs used to say behavior:['HOSTILE'] — which was always a
// fiction: deriveAllegiance maps a non-null behavior array to 'neutral', so a
// born-hostile is behavior:null. Don't reintroduce it.)
const G = { playerX: 5, playerY: 5, inventory: [] };
const friendly = { x: 6, y: 5, allegiance: 'neutral', dialogueId: 'x', bribeable: true, entity: { isAlive: () => true } };
const hostile  = { x: 6, y: 5, allegiance: 'hostile', entity: { isAlive: () => true } };
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

// ── Containers (Task 16) ─────────────────────────────────────────────────────
//
// A container's tile is never walkable (pathing.stepFree blocks it), so before
// this it resolved to no target at all: _targetAt had no container case, so a
// tap on a chest did nothing and BUMPING it was the only way in — which needs a
// keyboard. On touch there was no way to open a chest.
const crate = { type: 'crate', x: 6, y: 5, contents: ['rock', 'soap'] };

test('a container offers Open, and Open is its default verb', () => {
  const t = { x: 6, y: 5, container: crate };
  const keys = targetVerbs(t, G).map(v => v.key);
  assert.ok(keys.includes('open'), `no Open verb: ${keys.join(', ')}`);
  assert.equal(defaultVerb(t, G).key, 'open');
});

test('Open walks the Hero adjacent first — it can never be fired at range', () => {
  // The whole point: the chest tile is not walkable, so the fire path must stop
  // beside it. Without needsAdjacent the verb would fire from across the map.
  const open = targetVerbs({ x: 6, y: 5, container: crate }, G).find(v => v.key === 'open');
  assert.equal(open.needsAdjacent, true);
});

test('Open sorts to the top of the list, above Examine, with Cancel last', () => {
  const list = orderedTargetVerbs({ x: 6, y: 5, container: crate }, G).map(v => v.key);
  assert.equal(list[0], 'open');
  assert.equal(list[list.length - 1], 'cancel');
  assert.ok(list.indexOf('examine') > 0, 'Examine should rank below the default verb');
});

test('nothing else grows an Open verb', () => {
  for (const [label, t] of [
    ['friendly NPC', { x: 6, y: 5, npc: friendly }],
    ['hostile NPC', { x: 6, y: 5, npc: hostile }],
    ['ground item', { x: 6, y: 5, item: rock }],
    ['bare tile', { x: 6, y: 5 }],
  ]) {
    const keys = targetVerbs(t, G).map(v => v.key);
    assert.ok(!keys.includes('open'), `${label} offers Open`);
  }
});

test('Open ranks with the other act-on-it verbs, not down with Examine', () => {
  // orderedTargetVerbs gives the DEFAULT verb rank -1, so a container-only
  // target puts Open first whatever its rank is. The rank only shows when Open
  // is NOT the default — an NPC standing on a chest — and there it must still
  // beat Examine, or the useful verb hides at the bottom of the list.
  const list = orderedTargetVerbs({ x: 6, y: 5, npc: friendly, container: crate }, G).map(v => v.key);
  assert.equal(list[0], 'talk', 'the NPC default should still lead');
  assert.ok(list.indexOf('open') < list.indexOf('examine'),
    `Open sank below Examine: ${list.join(', ')}`);
});

test('an NPC standing on a chest is still an NPC — the container does not steal the default', () => {
  // _targetAt resolves both; the NPC branch must win, or talking to someone
  // beside a crate opens the crate instead.
  const t = { x: 6, y: 5, npc: friendly, container: crate };
  assert.equal(defaultVerb(t, G).key, 'talk');
  const keys = targetVerbs(t, G).map(v => v.key);
  assert.ok(keys.includes('open') && keys.includes('talk'), 'both verbs should be offered');
});

test('a ground item on a chest tile still defaults to Take', () => {
  const t = { x: 6, y: 5, item: rock, container: crate };
  assert.equal(defaultVerb(t, G).key, 'take');
});

// (interact harness, ruled 2026-09-02) Bumping an NPC opens this list instead of
// shoving them. The shove is not gone — it moved in here, so barging past
// someone stays possible and merely becomes deliberate.
test('Shove is offered on any character, hostile or not', () => {
  assert.ok(targetVerbs({ x: 6, y: 5, npc: friendly }, G).some(v => v.key === 'shove'));
  assert.ok(targetVerbs({ x: 6, y: 5, npc: hostile }, G).some(v => v.key === 'shove'));
});

test('Shove needs adjacency and never outranks talking to a shopkeeper', () => {
  const verbs = targetVerbs({ x: 6, y: 5, npc: friendly }, G);
  assert.equal(verbs.find(v => v.key === 'shove').needsAdjacent, true);
  const list = orderedTargetVerbs({ x: 6, y: 5, npc: friendly }, G).map(v => v.key);
  assert.ok(list.indexOf('shove') > list.indexOf('talk'), 'a bump must not default to a push');
  assert.ok(list.indexOf('shove') > list.indexOf('trade'));
});

test('Shove is not offered on scenery, loot or a crate', () => {
  for (const t of [{ x: 6, y: 5, item: rock },
                   { x: 6, y: 5, container: { type: 'Crate', contents: [] } },
                   { x: 6, y: 5, examinable: { id: 'sign' } }]) {
    assert.ok(!targetVerbs(t, G).some(v => v.key === 'shove'), JSON.stringify(Object.keys(t)));
  }
});
