import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../game/settings.js';

const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
};
const KEY = 'violencetown.settings';
const device = on => { globalThis.matchMedia = () => ({ matches: on }); };

beforeEach(() => { store.clear(); delete globalThis.matchMedia; });

test('no matchMedia: defaults to off', () => {
  assert.equal(S.load().reduceMotion, false);
});
test('device reduces motion, nothing saved: starts on', () => {
  device(true);
  assert.equal(S.load().reduceMotion, true);
});
test('device does not reduce, nothing saved: off', () => {
  device(false);
  assert.equal(S.load().reduceMotion, false);
});
test('saved false beats a device that reduces motion', () => {
  device(true);
  store.set(KEY, JSON.stringify({ reduceMotion: false }));
  assert.equal(S.load().reduceMotion, false);
});
test('saved true beats a device that does not', () => {
  device(false);
  store.set(KEY, JSON.stringify({ reduceMotion: true }));
  assert.equal(S.load().reduceMotion, true);
});
test('matchMedia throwing reads as off', () => {
  globalThis.matchMedia = () => { throw new Error('x'); };
  assert.equal(S.load().reduceMotion, false);
});
test('other settings do not pin the device value', () => {
  device(true);
  S.load();
  S.set('musicVolume', 0.3);
  assert.equal('reduceMotion' in JSON.parse(store.get(KEY)), false);
});
test('toggling saves the choice, even one equal to the device value', () => {
  device(true);
  S.load();
  S.set('reduceMotion', true);
  assert.equal(JSON.parse(store.get(KEY)).reduceMotion, true);
  device(false);
  assert.equal(S.load().reduceMotion, true);
});
test('turning it off on a reducing device sticks', () => {
  device(true);
  S.load();
  S.set('reduceMotion', false);
  assert.equal(S.load().reduceMotion, false);
});
test('reset goes back to following the device', () => {
  device(true);
  S.load();
  S.set('reduceMotion', false);
  S.reset();
  assert.equal(S.get('reduceMotion'), true);
  assert.equal('reduceMotion' in JSON.parse(store.get(KEY)), false);
});
