// fight-entrance.test.js — how a fight arrives (plans/fight-fog.md §2).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ENTRANCES, NO_REPLAY_MS, fightStartKind, entranceFor } from '../game/fight-entrance.js';
import { IMPACT_MS, ZOOM_IN_MS, ZOOM_OUT_MS, TILE_FADE_MS, FOG_IN_MS, QUIET_FADE_MS, FOG_OUT_MS, FOG_NEAR,
         entranceAt, fogReveal, fogDepth, fogOut, fightFxActive, tileJitter } from '../game/fight-entrance.js';

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

describe('the entrance timeline', () => {
    test('the impact frame holds for IMPACT_MS', () => {
        assert.equal(entranceAt(ENTRANCES.struck, 0).impact, true);
        assert.equal(entranceAt(ENTRANCES.struck, IMPACT_MS - 1).impact, true);
        assert.equal(entranceAt(ENTRANCES.struck, IMPACT_MS).impact, false);
    });
    test('the zoom punches to its peak, then settles by 360 ms', () => {
        assert.equal(entranceAt(ENTRANCES.spotted, 0).zoom, 1);
        assert.ok(Math.abs(entranceAt(ENTRANCES.spotted, ZOOM_IN_MS).zoom - 1.16) < 1e-9);
        assert.equal(entranceAt(ENTRANCES.spotted, ZOOM_IN_MS + ZOOM_OUT_MS).zoom, 1);
        assert.ok(entranceAt(ENTRANCES.struck, ZOOM_IN_MS).zoom < entranceAt(ENTRANCES.spotted, ZOOM_IN_MS).zoom);
    });
    test('the white flash has no zoom', () => {
        for (const ms of [0, 40, 80, 200]) assert.equal(entranceAt(ENTRANCES.search, ms).zoom, 1);
    });
    test('reduce motion drops the impact and the zoom', () => {
        const at = entranceAt(ENTRANCES.spotted, 50, { reduceMotion: true });
        assert.equal(at.impact, false);
        assert.equal(at.zoom, 1);
    });
    test('no entrance draws nothing', () => {
        assert.deepEqual(entranceAt(null, 50), { impact: false, impactT: 1, zoom: 1 });
    });
});

describe('the fog rolling in', () => {
    test('a tile waits out the impact, then fades in over TILE_FADE_MS', () => {
        assert.equal(fogReveal(0, 10, IMPACT_MS, 0), 0);
        assert.equal(fogReveal(0, 10, IMPACT_MS + TILE_FADE_MS / 2, 0), 0.5);
        assert.equal(fogReveal(0, 10, IMPACT_MS + TILE_FADE_MS, 0), 1);
    });
    test('further out arrives later, 34 ms a step', () => {
        assert.equal(fogReveal(3, 10, IMPACT_MS + 3 * 34, 0), 0);
        assert.equal(fogReveal(3, 10, IMPACT_MS + 3 * 34 + TILE_FADE_MS, 0), 1);
    });
    test('on a screen too big for 34 ms steps, the last tile is still in inside a second', () => {
        for (const maxOrder of [10, 27, 60]) {
            assert.equal(fogReveal(maxOrder, maxOrder, FOG_IN_MS - 1, 0.999), 1, `maxOrder ${maxOrder}`);
        }
    });
    test('quiet fades every tile together over 300 ms', () => {
        assert.equal(fogReveal(0, 40, QUIET_FADE_MS / 2, 0.9, { quiet: true }), 0.5);
        assert.equal(fogReveal(40, 40, QUIET_FADE_MS / 2, 0, { quiet: true }), 0.5);
        assert.equal(fogReveal(40, 40, QUIET_FADE_MS, 0, { quiet: true }), 1);
    });
});

describe('how deep the fog lies', () => {
    test('none on what they see', () => assert.equal(fogDepth(0), 0));
    test('light at the edge of their sight, full seven tiles further out', () => {
        assert.equal(fogDepth(1), FOG_NEAR);
        assert.ok(Math.abs(fogDepth(8) - 1) < 1e-12);
        assert.ok(Math.abs(fogDepth(30) - 1) < 1e-12);
        assert.ok(fogDepth(4) > fogDepth(2));
    });
});

describe('the fog clearing', () => {
    test('full when the fight ends, gone FOG_OUT_MS later', () => {
        assert.equal(fogOut(0), 1);
        assert.equal(fogOut(FOG_OUT_MS), 0);
        assert.ok(fogOut(FOG_OUT_MS / 4) > fogOut(FOG_OUT_MS / 2));
    });
});

describe('keeping the render loop alive', () => {
    test('through the arrival', () => {
        assert.equal(fightFxActive(true, { at: 1000 }, null, 1000 + FOG_IN_MS - 1), true);
        assert.equal(fightFxActive(true, { at: 1000 }, null, 1000 + FOG_IN_MS), false);
    });
    test('through the clearing', () => {
        assert.equal(fightFxActive(false, { at: 0 }, 5000, 5000 + FOG_OUT_MS - 1), true);
        assert.equal(fightFxActive(false, { at: 0 }, 5000, 5000 + FOG_OUT_MS), false);
    });
    test('and not before any fight', () => {
        assert.equal(fightFxActive(false, null, null, 5000), false);
    });
});

describe('the smoke scatter', () => {
    test('is in 0..1 and the same every frame', () => {
        for (const [x, y] of [[0, 0], [3, -7], [120, 44]]) {
            const j = tileJitter(x, y);
            assert.ok(j >= 0 && j < 1);
            assert.equal(tileJitter(x, y), j);
        }
        assert.notEqual(tileJitter(1, 0), tileJitter(0, 1));
    });
});
