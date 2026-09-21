// autoplay-fingerprint.test.js — one short hash of where a run ended.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { hash32, runState, fingerprint } from '../game/autoplay/fingerprint.js';

// Enough of a Game for save.js serialize() to read.
const game = (over = {}) => ({ equipment: {}, turn: 3, rng: { getState: () => 42 }, _dayClockMs: 1500, worldTick: 3, ...over });

describe('the run fingerprint', () => {
    test('hash32 is 32-bit FNV-1a', () => {
        assert.equal(hash32(''), '811c9dc5');
        assert.equal(hash32('a'), 'e40c292c');
        assert.equal(hash32('foobar'), 'bf9cf968');
    });
    test('when the save was written is not part of the run', () => {
        assert.equal('savedAt' in runState(game()).save, false);
    });
    test('the same state gives the same fingerprint', () => {
        assert.equal(fingerprint(game()), fingerprint(game()));
    });
    test('one RNG step apart is a different run', () => {
        assert.notEqual(fingerprint(game()), fingerprint(game({ rng: { getState: () => 43 } })));
    });
    test('the world clocks a save leaves out are part of the run', () => {
        assert.notEqual(fingerprint(game()), fingerprint(game({ _dayClockMs: 2000 })));
        assert.notEqual(fingerprint(game()), fingerprint(game({ worldTick: 4 })));
    });
});
