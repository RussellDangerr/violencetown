// fight-area.test.js — who is in a fight, and what they can see (plans/fight-fog.md §1).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fighters } from '../game/fight-area.js';

const alive = () => ({ isAlive: () => true });
const dead = () => ({ isAlive: () => false });
// An enemy at (10,10) facing south, with sight 8.
const foe = (state, over = {}) => ({ state, entity: alive(), sightRange: 8, x: 10, y: 10, _lastDx: 0, _lastDy: 1, ...over });

describe('fighters', () => {
    test('an enemy hunting you is in the fight, chasing or searching', () => {
        assert.equal(fighters([foe('chasing')]).length, 1);
        assert.equal(fighters([foe('searching')]).length, 1);
    });

    test('nobody calm, suspicious or walking home is', () => {
        for (const s of ['idle', 'suspicious', 'returning', undefined]) {
            assert.equal(fighters([foe(s)]).length, 0, `${s} should not be a fighter`);
        }
    });

    test('nor the dead, the ambient, allies or the eyeless', () => {
        assert.equal(fighters([foe('chasing', { entity: dead() })]).length, 0);
        assert.equal(fighters([foe('chasing', { ambient: true })]).length, 0);
        assert.equal(fighters([foe('chasing', { _ally: true })]).length, 0);
        assert.equal(fighters([foe('chasing', { sightRange: 0 })]).length, 0);
    });

    test('no enemies at all is an empty fight, not a crash', () => {
        assert.deepEqual(fighters(undefined), []);
        assert.deepEqual(fighters([null]), []);
    });
});
