import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  WHEEL_ACTIONS, ACTION_RINGS, CARDINALS, DIR_VEC, RING_ACTION, RING_ITEM, RING_AIM,
  createWheelState, currentAction, ringsFor, moveGrip, spinRing, compose, autoAimDir,
} from '../game/action-wheel.js';

describe('action-wheel model', () => {
  test('the six verbs are present in order', () => {
    assert.deepEqual(WHEEL_ACTIONS, ['Attack', 'Skill', 'Throw', 'Give', 'Defend', 'Run']);
  });

  test('ring config marks which rings each action uses', () => {
    assert.deepEqual(ringsFor('Throw'),  { item: true,  aim: true });
    assert.deepEqual(ringsFor('Attack'), { item: false, aim: true });
    assert.deepEqual(ringsFor('Defend'), { item: false, aim: false });
  });

  test('a fresh wheel defaults to Attack, grip on the action ring, aim East', () => {
    const w = createWheelState();
    assert.equal(currentAction(w), 'Attack');
    assert.equal(w.grip, RING_ACTION);
    assert.equal(w.aim, 'E');
  });

  test('spinning the action ring wraps through all six verbs', () => {
    const w = createWheelState();
    spinRing(w, -1, []); // Attack -> Run (wrap left)
    assert.equal(currentAction(w), 'Run');
    spinRing(w, 1, []);  // back to Attack
    assert.equal(currentAction(w), 'Attack');
  });

  test('moveGrip skips rings the current action does not use', () => {
    const w = createWheelState(); // Attack: aim yes, item no
    moveGrip(w, 1); // action -> (skip item) -> aim
    assert.equal(w.grip, RING_AIM);
    w.grip = RING_ACTION;          // grab the action ring before spinning it
    spinRing(w, 2, []); // Attack -> Throw (now item+aim)
    assert.equal(currentAction(w), 'Throw');
    moveGrip(w, 1); // action -> item (Throw uses it)
    assert.equal(w.grip, RING_ITEM);
  });

  test('moveGrip stays on the action ring for a self-only action (Defend)', () => {
    const w = createWheelState();
    w.actionIndex = WHEEL_ACTIONS.indexOf('Defend'); // no item, no aim
    moveGrip(w, 1); // nowhere outward to go
    assert.equal(w.grip, RING_ACTION);
    moveGrip(w, -1);
    assert.equal(w.grip, RING_ACTION);
  });

  test('spinning the item ring cycles the provided valid slots', () => {
    const w = createWheelState();
    w.actionIndex = WHEEL_ACTIONS.indexOf('Throw');
    w.grip = RING_ITEM;
    spinRing(w, 1, [1, 4, 7]); // first spin lands on the first valid slot
    assert.ok([1, 4, 7].includes(w.itemSlot));
    const first = w.itemSlot;
    spinRing(w, 1, [1, 4, 7]);
    assert.notEqual(w.itemSlot, first);
  });

  test('spinning the aim ring rotates the compass clockwise', () => {
    const w = createWheelState(); // E
    w.grip = RING_AIM;
    spinRing(w, 1, []); assert.equal(w.aim, 'S');
    spinRing(w, 1, []); assert.equal(w.aim, 'W');
    spinRing(w, 1, []); assert.equal(w.aim, 'N');
    spinRing(w, 1, []); assert.equal(w.aim, 'E');
  });

  test('compose returns the live action/item/aim selection', () => {
    const w = createWheelState();
    w.actionIndex = WHEEL_ACTIONS.indexOf('Throw');
    w.itemSlot = 3; w.aim = 'N';
    assert.deepEqual(compose(w), { action: 'Throw', itemSlot: 3, aim: 'N' });
  });

  test('autoAimDir picks the dominant cardinal toward the nearest target', () => {
    assert.equal(autoAimDir(5, 5, [{ x: 8, y: 4 }]), 'E');
    assert.equal(autoAimDir(5, 5, [{ x: 8, y: 5 }, { x: 5, y: 6 }]), 'S');
    assert.equal(autoAimDir(5, 5, []), null);
  });

  test('DIR_VEC maps each cardinal to a unit step', () => {
    assert.deepEqual(DIR_VEC.N, { dx: 0, dy: -1 });
    assert.deepEqual(DIR_VEC.E, { dx: 1, dy: 0 });
  });
});
