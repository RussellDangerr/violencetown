// kits.test.js — Task 12: role-default kit fallback (Law 6f omission backstop).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnEnemy, challengeGp } from '../game/enemies.js';
import { rockClatter, isSewerDweller } from '../game/ai.js';

describe('kit fallback — nothing ships broke by omission', () => {
    test('a fighter authored with no kit inherits its band default', () => {
        const e = spawnEnemy({ id: 'new1', type: 'Thug', x: 0, y: 0, armor: -30, damage: 5 }, new Set());
        assert.ok(challengeGp(e) >= 5, `expected a fodder kit, got ${challengeGp(e)}`);
        assert.ok(e.loadout.length > 0);
    });
    test('an authored kit always wins over the default', () => {
        const e = spawnEnemy({ id: 'new2', type: 'Thug', x: 0, y: 0, armor: -30, damage: 5, gold: 3, loadout: ['tunnel_mushroom'] }, new Set());
        assert.deepEqual(e.loadout, ['tunnel_mushroom']);
        assert.equal(e.gold, 3);
    });
    test('a civilian gets no kit — only fighters carry', () => {
        const e = spawnEnemy({ id: 'folk', type: 'Violencian', x: 0, y: 0, armor: -80, damage: 0 }, new Set());
        assert.equal(challengeGp(e), 0);
    });
    test('an ambient townsfolk gets no kit either', () => {
        const e = spawnEnemy({ id: 'amb', type: 'Violencian', x: 0, y: 0, armor: -80, damage: 4, ambient: true }, new Set());
        assert.equal(challengeGp(e), 0);
    });
    test('Law 6d — a mugged respawn comes back with NO kit, not just no gold', () => {
        const e = spawnEnemy({ id: 'm1', type: 'Thug', x: 0, y: 0, armor: -30, damage: 5, gold: 3, loadout: ['tunnel_mushroom'] }, new Set(['m1']));
        assert.equal(e.gold, 0);
        assert.deepEqual(e.loadout, []);
        assert.equal(challengeGp(e), 0);
    });
});

describe('rock — the stealth affordance', () => {
    test('enemies within earshot retarget to the landing tile', () => {
        // `allegiance: 'hostile'` is what the Enemy ctor derives for a born-hostile
        // (null behavior). It became load-bearing when rockClatter was restricted to
        // hostiles, so the fixture now states it rather than relying on a bare object.
        const near = { x: 5, y: 5, _lastSeenX: null, _lastSeenY: null, state: 'idle', sightRange: 8, allegiance: 'hostile' };
        const far  = { x: 40, y: 40, _lastSeenX: null, _lastSeenY: null, state: 'idle', sightRange: 8, allegiance: 'hostile' };
        rockClatter([near, far], 6, 6);
        assert.deepEqual([near._lastSeenX, near._lastSeenY], [6, 6]);
        assert.equal(near.state, 'chasing');
        assert.equal(far._lastSeenX, null);
    });
    test('it does not disturb an enemy already chasing the player', () => {
        const busy = { x: 5, y: 5, _lastSeenX: 1, _lastSeenY: 1, state: 'chasing', sightRange: 8 };
        rockClatter([busy], 6, 6);
        assert.deepEqual([busy._lastSeenX, busy._lastSeenY], [1, 1]);
    });
    test('null-safe', () => {
        rockClatter(null, 1, 1);
        rockClatter([null, undefined], 1, 1);
    });
});

describe('sewer fare — the eater decides', () => {
    test('species is independent of allegiance', () => {
        assert.equal(isSewerDweller({ sewerDweller: true, allegiance: 'ally' }), true);
        assert.equal(isSewerDweller({ sewerDweller: true, allegiance: 'hostile' }), true);
        assert.equal(isSewerDweller({ allegiance: 'hostile' }), false);
    });
    test('a bribed fungus can still eat its mushrooms', () => {
        const flipped = { sewerDweller: true, allegiance: 'ally', _wasFlipped: true };
        assert.equal(isSewerDweller(flipped), true);
    });
    test('the player is never a sewer dweller', () => {
        assert.equal(isSewerDweller(null), false);
        assert.equal(isSewerDweller(undefined), false);
        assert.equal(isSewerDweller({}), false);
    });
});

// ── rockClatter must not put a NEUTRAL into the chase state ──────────────────
//
// (2026-08-24) `state: 'chasing'` is not only the AI's chase flag — renderer.js
// reads it in three places, including _drawArena, which blooms the lit combat
// arena around anything "chasing". A townsperson can never actually chase (their
// behavior whitelist excludes HOSTILE, so npc.js's HOSTILE branch never runs for
// them), but setting the flag still lights the combat stage around a shopkeeper.
//
// This was dormant only because every townsperson is authored sightRange 0, so
// the rock had to land on their exact tile. Giving townsfolk real sight (so they
// can serve as theft witnesses) would have made it routine.
describe('rockClatter and non-hostiles', () => {
    const townie = (over = {}) => ({
        x: 8, y: 6, state: 'idle',
        behavior: ['IDLE', 'WANDER'], allegiance: 'neutral',
        sightRange: 4, ...over,
    });

    test('a neutral within earshot is NOT put into the chase state', () => {
        const t = townie();
        rockClatter([t], 6, 6);
        assert.equal(t.state, 'idle',
            'a townsperson in state "chasing" blooms the combat arena around them');
    });

    test('a bribed ally is left alone too', () => {
        const a = townie({ allegiance: 'ally', _ally: true });
        rockClatter([a], 6, 6);
        assert.equal(a.state, 'idle');
    });

    test('but a real hostile still investigates — the rock still works', () => {
        const h = { x: 8, y: 6, state: 'idle', behavior: null, allegiance: 'hostile', sightRange: 8 };
        rockClatter([h], 6, 6);
        assert.equal(h.state, 'chasing');
        assert.deepEqual([h._lastSeenX, h._lastSeenY], [6, 6]);
    });
});
