// fight-entrance.test.js — how a fight arrives (plans/fight-fog.md §2).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ENTRANCES, NO_REPLAY_MS, fightStartKind, entranceFor } from '../game/fight-entrance.js';

const f = (state, over = {}) => ({ state, ...over });

describe('how the fight started', () => {
    test('you struck first: you hit one of them this turn', () => {
        assert.equal(fightStartKind([f('chasing', { _struckAt: 7 })], 7), 'struck');
    });
    test('or the turn before, since a blow lands before the world beat that turns them', () => {
        assert.equal(fightStartKind([f('searching', { _struckAt: 6 })], 7), 'struck');
    });
    test('an older hit does not count', () => {
        assert.equal(fightStartKind([f('chasing', { _struckAt: 5 })], 7), 'spotted');
    });
    test('they spotted you: someone is chasing and you hit nobody', () => {
        assert.equal(fightStartKind([f('searching'), f('chasing')], 7), 'spotted');
    });
    test('it grew out of a search: they are only searching', () => {
        assert.equal(fightStartKind([f('searching'), f('searching')], 7), 'search');
    });
    test('a first strike outranks a sighting', () => {
        assert.equal(fightStartKind([f('chasing'), f('chasing', { _struckAt: 7 })], 7), 'struck');
    });
});

describe('which entrance', () => {
    test('each start gets its own', () => {
        assert.equal(entranceFor('struck', null, 10_000), ENTRANCES.struck);
        assert.equal(entranceFor('spotted', null, 10_000), ENTRANCES.spotted);
        assert.equal(entranceFor('search', null, 10_000), ENTRANCES.search);
    });
    test('the three differ in look, punch and how the fog arrives', () => {
        const { struck, spotted, search } = ENTRANCES;
        assert.deepEqual([struck.impact, spotted.impact, search.impact], ['bw', 'redblack', 'flash']);
        assert.deepEqual([struck.zoom, spotted.zoom, search.zoom], [1.08, 1.16, 1]);
        assert.deepEqual([struck.roll, spotted.roll, search.roll], ['out', 'in', 'out']);
        assert.deepEqual([struck.silhouette, spotted.silhouette, search.silhouette], [2.5, 4, 0]);
    });
    test('no second entrance when the last fight ended under 3 s ago', () => {
        assert.equal(entranceFor('spotted', 10_000, 10_000 + NO_REPLAY_MS - 1), null);
        assert.equal(entranceFor('spotted', 10_000, 10_000 + NO_REPLAY_MS), ENTRANCES.spotted);
    });
});
