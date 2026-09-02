// noise.test.js — sound as a first-class stimulus.
//
// emitNoise generalises ai.js's rockClatter, whose own comment called it "the
// game's first stealth affordance". The rules are carried over verbatim: a sound
// sets a FALSE last-seen without the maker ever having been seen, and an enemy
// already CHASING is never redirected — a rock distracts, it does not rescue you
// from a fight you already started.
//
// The already-chasing case is therefore a REGRESSION test for shipped behaviour,
// not just a new-feature test.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { emitNoise, NOISE } from '../game/perception.js';

function npc(over = {}) {
    return {
        x: 0, y: 0, state: 'idle',
        _lastSeenX: null, _lastSeenY: null,
        _awareBeats: 0, _sweepBeats: 0,
        entity: { isAlive: () => true },
        ...over,
    };
}

describe('who hears it', () => {
    test('a sound inside the radius promotes idle → suspicious and sets last-seen', () => {
        const a = npc({ x: 3, y: 0 });
        emitNoise([a], 0, 0, 4);
        assert.equal(a.state, 'suspicious');
        assert.deepEqual([a._lastSeenX, a._lastSeenY], [0, 0]);
    });

    test('a sound outside the radius does nothing at all', () => {
        const a = npc({ x: 9, y: 0 });
        emitNoise([a], 0, 0, 4);
        assert.equal(a.state, 'idle');
        assert.equal(a._lastSeenX, null);
    });

    test('the radius is Chebyshev — a diagonal at the limit still hears', () => {
        const a = npc({ x: 4, y: 4 });
        emitNoise([a], 0, 0, 4);
        assert.equal(a.state, 'suspicious');
    });

    test('an already-suspicious enemy is re-pointed at the newer sound', () => {
        const a = npc({ x: 1, y: 0, state: 'suspicious', _lastSeenX: 9, _lastSeenY: 9 });
        emitNoise([a], 2, 2, 8);
        assert.deepEqual([a._lastSeenX, a._lastSeenY], [2, 2]);
    });
});

describe('hearingRange is a bonus, not the radius', () => {
    test('a sharp-eared listener hears further than the sound carries', () => {
        const a = npc({ x: 6, y: 0, hearingRange: 3 });
        emitNoise([a], 0, 0, 4);
        assert.equal(a.state, 'suspicious');
    });

    test('and it defaults to zero, so loudness alone normally decides', () => {
        const a = npc({ x: 6, y: 0 });
        emitNoise([a], 0, 0, 4);
        assert.equal(a.state, 'idle');
    });
});

describe('who does not hear it', () => {
    test('an enemy already chasing is NOT redirected', () => {
        // The verbatim rockClatter rule. Regression test for shipped behaviour.
        const a = npc({ x: 1, y: 0, state: 'chasing', _lastSeenX: 5, _lastSeenY: 5 });
        emitNoise([a], 0, 0, 8);
        assert.equal(a.state, 'chasing');
        assert.deepEqual([a._lastSeenX, a._lastSeenY], [5, 5]);
    });

    test('nor is one already searching — it has a lead and keeps it', () => {
        const a = npc({ x: 1, y: 0, state: 'searching', _lastSeenX: 5, _lastSeenY: 5 });
        emitNoise([a], 0, 0, 8);
        assert.equal(a.state, 'searching');
        assert.deepEqual([a._lastSeenX, a._lastSeenY], [5, 5]);
    });

    test('a dead enemy hears nothing', () => {
        const a = npc({ x: 1, y: 0, entity: { isAlive: () => false } });
        emitNoise([a], 0, 0, 8);
        assert.equal(a.state, 'idle');
    });

    test('loudness 0 is silent even at point blank — a theft makes no sound', () => {
        const a = npc({ x: 0, y: 1 });
        emitNoise([a], 0, 0, NOISE.theft);
        assert.equal(a.state, 'idle');
    });
});

describe('the loudness table', () => {
    test('a theft is silent and a thrown impact is the loudest thing listed', () => {
        assert.equal(NOISE.theft, 0);
        const loudest = Math.max(...Object.values(NOISE));
        assert.equal(NOISE.throwImpact, loudest);
    });

    test('the rock keeps its shipped reach of 8', () => {
        // rockClatter used `e.sightRange ?? 8`; the default sightRange IS 8, so
        // this preserves the rock's behaviour exactly when it is retired into
        // emitNoise during the main.js wiring.
        assert.equal(NOISE.throwImpact, 8);
    });

    test('fighting is louder than walking', () => {
        assert.ok(NOISE.melee > NOISE.step);
    });
});

describe('degenerate input', () => {
    test('a missing or empty watcher list does not throw', () => {
        assert.doesNotThrow(() => emitNoise(null, 0, 0, 5));
        assert.doesNotThrow(() => emitNoise([], 0, 0, 5));
        assert.doesNotThrow(() => emitNoise([null, undefined], 0, 0, 5));
    });

    test('a watcher with no entity is skipped rather than crashing', () => {
        assert.doesNotThrow(() => emitNoise([{ x: 0, y: 0, state: 'idle' }], 0, 0, 5));
    });
});
