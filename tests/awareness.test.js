// awareness.test.js — the ladder idle → suspicious → searching → chasing → returning.
//
// The ladder is a RENAME, not a new state axis: it extends the legacy `state`
// field npc.js already carried (idle/chasing/returning), because most of it was
// already there unnamed — a blind chaser already pursued _lastSeenX/Y and gave up
// on arrival. That was a search without a name.
//
// nextAwareness is PURE: it reads the npc and returns the transition. The caller
// applies it. These tests therefore never need a Game.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    VERDICT, nextAwareness,
    SUSPICION_BEATS, CALM_BEATS, BLIND_SWEEP_BEATS,
} from '../game/perception.js';

function npc(over = {}) {
    return {
        state: 'idle', _awareBeats: 0, _sweepBeats: 0,
        _lastSeenX: null, _lastSeenY: null,
        ...over,
    };
}

describe('a live sighting outranks everything', () => {
    test('DIRECT from idle → chasing, immediately, with a fresh last-seen', () => {
        const r = nextAwareness(npc(), VERDICT.DIRECT, { x: 4, y: 7 });
        assert.equal(r.state, 'chasing');
        assert.deepEqual(r.lastSeen, { x: 4, y: 7 });
    });

    test('DIRECT promotes from ANY state, including returning', () => {
        for (const from of ['idle', 'suspicious', 'searching', 'chasing', 'returning']) {
            const r = nextAwareness(npc({ state: from }), VERDICT.DIRECT, { x: 1, y: 1 });
            assert.equal(r.state, 'chasing', `${from} + DIRECT should chase`);
        }
    });

    test('a live sighting always refreshes last-seen', () => {
        const r = nextAwareness(npc({ state: 'chasing' }), VERDICT.DIRECT, { x: 2, y: 3 });
        assert.deepEqual(r.lastSeen, { x: 2, y: 3 });
    });
});

describe('peripheral accrues suspicion', () => {
    test('one peripheral beat is NOT enough', () => {
        const r = nextAwareness(npc(), VERDICT.PERIPHERAL, { x: 4, y: 7 });
        assert.equal(r.state, 'idle');
        assert.equal(r.awareBeats, 1);
    });

    test(`${SUSPICION_BEATS} peripheral beats → suspicious, and it TURNS to look`, () => {
        let n = npc();
        let r;
        for (let i = 0; i < SUSPICION_BEATS; i++) {
            r = nextAwareness(n, VERDICT.PERIPHERAL, { x: 4, y: 7 });
            n = { ...n, state: r.state, _awareBeats: r.awareBeats };
        }
        assert.equal(r.state, 'suspicious');
        assert.deepEqual(r.faceTo, { x: 4, y: 7 }, 'must turn toward the disturbance');
    });

    test('suspicious + DIRECT → chasing', () => {
        const r = nextAwareness(npc({ state: 'suspicious' }), VERDICT.DIRECT, { x: 1, y: 1 });
        assert.equal(r.state, 'chasing');
    });
});

describe('losing contact', () => {
    test('suspicious with nothing to see → searching on the next beat', () => {
        const r = nextAwareness(npc({ state: 'suspicious' }), VERDICT.NONE, { x: 1, y: 1 });
        assert.equal(r.state, 'searching');
    });

    test('chasing + lost sight → searching, and does NOT refresh last-seen', () => {
        // A blind chaser must pursue where the player WAS, never where they are —
        // no tracking through walls. This is the PD-1 rule, kept.
        const n = npc({ state: 'chasing', _lastSeenX: 9, _lastSeenY: 9 });
        const r = nextAwareness(n, VERDICT.NONE, { x: 1, y: 1 });
        assert.equal(r.state, 'searching');
        assert.equal(r.lastSeen, undefined);
    });
});

describe('a sweep that finds nothing gives up', () => {
    test(`with a last-seen mark, it sweeps ${CALM_BEATS} beats → returning`, () => {
        const n = npc({ state: 'searching', _lastSeenX: 3, _lastSeenY: 3, _sweepBeats: CALM_BEATS - 1 });
        const r = nextAwareness(n, VERDICT.NONE, { x: 1, y: 1 });
        assert.equal(r.state, 'returning');
    });

    test('one beat short of the limit, it keeps searching', () => {
        const n = npc({ state: 'searching', _lastSeenX: 3, _lastSeenY: 3, _sweepBeats: CALM_BEATS - 2 });
        const r = nextAwareness(n, VERDICT.NONE, { x: 1, y: 1 });
        assert.equal(r.state, 'searching');
        assert.equal(r.sweepBeats, CALM_BEATS - 1);
    });

    test(`with NO last-seen (a robbed victim) it sweeps LONGER — ${BLIND_SWEEP_BEATS} beats`, () => {
        // A theft victim knows they were robbed but not by whom or from where, so
        // there is no tile to walk to. They cast about for longer before giving up.
        const atCalm = npc({ state: 'searching', _sweepBeats: CALM_BEATS - 1 });
        assert.equal(nextAwareness(atCalm, VERDICT.NONE, { x: 1, y: 1 }).state, 'searching',
            'the blind sweep must NOT end at the sighted limit');

        const atBlind = npc({ state: 'searching', _sweepBeats: BLIND_SWEEP_BEATS - 1 });
        assert.equal(nextAwareness(atBlind, VERDICT.NONE, { x: 1, y: 1 }).state, 'returning');
    });

    test('the blind limit is strictly longer than the sighted one', () => {
        assert.ok(BLIND_SWEEP_BEATS > CALM_BEATS);
    });
});

describe('counters', () => {
    test('every transition returns both counters, never undefined', () => {
        for (const v of [VERDICT.DIRECT, VERDICT.PERIPHERAL, VERDICT.NONE]) {
            for (const from of ['idle', 'suspicious', 'searching', 'chasing', 'returning']) {
                const r = nextAwareness(npc({ state: from }), v, { x: 1, y: 1 });
                assert.equal(typeof r.awareBeats, 'number', `${from}/${v} awareBeats`);
                assert.equal(typeof r.sweepBeats, 'number', `${from}/${v} sweepBeats`);
            }
        }
    });

    test('an npc with missing counters is treated as zeroed, not NaN', () => {
        const r = nextAwareness({ state: 'idle' }, VERDICT.PERIPHERAL, { x: 1, y: 1 });
        assert.equal(r.awareBeats, 1);
    });
});
