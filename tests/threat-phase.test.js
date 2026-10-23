// threat-phase.test.js — which phase the threat overlay is in.
//
// The bug this replaces: the overlay's watcher filter was "has eyes and is not
// your ally", which in the opening town square selected eight idle townsfolk —
// two of them vendors at +18 disposition — against one actually hostile NPC,
// and stippled 43% of the walkable floor as a result.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE, threatPhase, alertWatchers } from '../game/threat-phase.js';

const watcher = (state, over = {}) => ({
    state, sightRange: 4, _ally: false,
    entity: { isAlive: () => true },
    ...over,
});
const idle = () => watcher('idle');

describe('threatPhase', () => {
    test('a calm town square draws nothing', () => {
        const ws = [idle(), idle(), idle(), idle(), idle(), idle(), idle(), idle()];
        assert.equal(threatPhase(ws, { inCombat: false, aimingTheft: false }), PHASE.QUIET);
    });

    test('a searching watcher raises the haze', () => {
        assert.equal(threatPhase([idle(), watcher('searching')], { inCombat: false, aimingTheft: false }), PHASE.HAZE);
    });

    test('a suspicious watcher raises the haze', () => {
        assert.equal(threatPhase([watcher('suspicious')], { inCombat: false, aimingTheft: false }), PHASE.HAZE);
    });

    test('a chasing watcher inverts to alarm', () => {
        assert.equal(threatPhase([idle(), watcher('chasing')], { inCombat: false, aimingTheft: false }), PHASE.ALARM);
    });

    test('alarm outranks haze when both are present', () => {
        assert.equal(threatPhase([watcher('searching'), watcher('chasing')], { inCombat: false, aimingTheft: false }), PHASE.ALARM);
    });

    test('spotted outranks state — a DIRECT hold is alarm even from an idle watcher', () => {
        assert.equal(threatPhase([idle()], { inCombat: false, aimingTheft: false, spotted: true }), PHASE.ALARM);
    });

    test('aiming a theft brings the field back in a calm room', () => {
        assert.equal(threatPhase([idle(), idle()], { inCombat: false, aimingTheft: true }), PHASE.HAZE);
    });

    test('aiming a theft nobody can see from where they stand stays quiet (V1)', () => {
        const at = { x: 0, y: 0 };
        const far = watcher('idle', { x: 9, y: 9 });
        assert.equal(threatPhase([far], { inCombat: false, aimingTheft: true, at }), PHASE.QUIET);
        const near = watcher('idle', { x: 2, y: 1 });
        assert.equal(threatPhase([far, near], { inCombat: false, aimingTheft: true, at }), PHASE.HAZE);
    });

    test('dead, allied and blind watchers never raise a phase', () => {
        const dead  = watcher('chasing', { entity: { isAlive: () => false } });
        const ally  = watcher('chasing', { _ally: true });
        const blind = watcher('chasing', { sightRange: 0 });
        assert.equal(threatPhase([dead, ally, blind], { inCombat: false, aimingTheft: false }), PHASE.QUIET);
    });

    test('an empty watcher list is quiet, and undefined does not throw', () => {
        assert.equal(threatPhase([], { inCombat: false, aimingTheft: false }), PHASE.QUIET);
        assert.equal(threatPhase(undefined, { inCombat: false, aimingTheft: false }), PHASE.QUIET);
    });
});

describe('alertWatchers', () => {
    test('haze builds its field from the alert watchers only', () => {
        const picked = alertWatchers([idle(), idle(), watcher('searching')], PHASE.HAZE, { aimingTheft: false });
        assert.equal(picked.length, 1);
        assert.equal(picked[0].state, 'searching');
    });

    test('aiming a theft with nobody alert shows every live watcher, so a theft can be planned', () => {
        assert.equal(alertWatchers([idle(), idle(), idle()], PHASE.HAZE, { aimingTheft: true }).length, 3);
    });

    test('aiming a theft shows only the watchers whose sight reaches the theft (V1)', () => {
        const at = { x: 10, y: 10 };
        const near = watcher('idle', { x: 13, y: 8 });            // Chebyshev 3, sight 4
        const edge = watcher('idle', { x: 6, y: 10 });            // exactly 4
        const far  = watcher('idle', { x: 20, y: 10 });           // 10, out of reach
        const longSight = watcher('idle', { x: 20, y: 10, sightRange: 12 });
        const picked = alertWatchers([near, edge, far, longSight], PHASE.HAZE, { aimingTheft: true, at });
        assert.deepEqual(picked, [near, edge, longSight]);
    });

    test('an alert watcher still counts at any range — scoping applies only to the theft fallback', () => {
        const at = { x: 0, y: 0 };
        const far = watcher('searching', { x: 30, y: 0 });
        assert.deepEqual(alertWatchers([far], PHASE.HAZE, { aimingTheft: true, at }), [far]);
    });

    test('quiet picks nobody', () => {
        assert.equal(alertWatchers([watcher('searching')], PHASE.QUIET, {}).length, 0);
    });

    test('dead, allied and blind watchers are filtered out of every phase', () => {
        const ws = [
            watcher('searching'),
            watcher('searching', { entity: { isAlive: () => false } }),
            watcher('searching', { _ally: true }),
            watcher('searching', { sightRange: 0 }),
        ];
        assert.equal(alertWatchers(ws, PHASE.HAZE, { aimingTheft: false }).length, 1);
    });
});
