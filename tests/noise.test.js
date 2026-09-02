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

// ── Migrated from tests/kits.test.js when rockClatter retired into emitNoise ──
//
// These are the rock's own rules, rewritten rather than copied, because the
// semantics genuinely changed and pretending otherwise would hide it:
//
//   rockClatter                        emitNoise
//   ─────────────────────────────      ─────────────────────────────────────
//   set state 'chasing'                sets 'suspicious' — they investigate,
//                                      they do not come straight at you
//   reach = the hearer's sightRange    reach = loudness + hearingRange
//   skipped 'chasing' only             skips every state above suspicious, so
//                                      a searcher keeps its own lead
//   hostiles-only, INSIDE the function the caller filters (main.js _earshot)
//
// The last row is the one that matters most and is tested in main.js's own
// suite: a neutral has no ladder to walk back down, so a noise would strand it
// at 'suspicious' for the rest of the run.

describe('the rock, after the retirement', () => {
    const hostile = (over = {}) => ({
        x: 5, y: 5, state: 'idle', _lastSeenX: null, _lastSeenY: null,
        entity: { isAlive: () => true }, ...over,
    });

    test('an enemy within earshot investigates the landing tile', () => {
        const near = hostile({ x: 5, y: 5 });
        const far  = hostile({ x: 40, y: 40 });
        emitNoise([near, far], 6, 6, NOISE.throwImpact);
        assert.deepEqual([near._lastSeenX, near._lastSeenY], [6, 6]);
        assert.equal(near.state, 'suspicious', 'curious, not charging');
        assert.equal(far._lastSeenX, null);
    });

    test('a false last-seen — the thrower is never located', () => {
        // The whole trick: npc.js pursues _lastSeenX/Y rather than the player's
        // true position, so the rock sends them to the ROCK.
        const e = hostile();
        emitNoise([e], 6, 6, NOISE.throwImpact);
        assert.deepEqual([e._lastSeenX, e._lastSeenY], [6, 6]);
    });

    test('it does not rescue you from a fight you already started', () => {
        const busy = hostile({ state: 'chasing', _lastSeenX: 1, _lastSeenY: 1 });
        emitNoise([busy], 6, 6, NOISE.throwImpact);
        assert.equal(busy.state, 'chasing');
        assert.deepEqual([busy._lastSeenX, busy._lastSeenY], [1, 1]);
    });

    test('nor does it re-aim a searcher that already has a lead', () => {
        // rockClatter WOULD have redirected this one — it only skipped 'chasing'.
        // perception.js always said a searcher keeps its lead; now the code agrees.
        const sweeping = hostile({ state: 'searching', _lastSeenX: 1, _lastSeenY: 1 });
        emitNoise([sweeping], 6, 6, NOISE.throwImpact);
        assert.equal(sweeping.state, 'searching');
        assert.deepEqual([sweeping._lastSeenX, sweeping._lastSeenY], [1, 1]);
    });

    test('the rock keeps its old reach of 8', () => {
        const at8 = hostile({ x: 6 + NOISE.throwImpact, y: 6 });
        const at9 = hostile({ x: 7 + NOISE.throwImpact, y: 6 });
        emitNoise([at8, at9], 6, 6, NOISE.throwImpact);
        assert.equal(at8.state, 'suspicious');
        assert.equal(at9.state, 'idle');
    });

    test('null-safe', () => {
        emitNoise(null, 1, 1, NOISE.throwImpact);
        emitNoise([null, undefined], 1, 1, NOISE.throwImpact);
    });
});

// ── The wiring rule: who a noise is allowed to move ──────────────────────────
//
// emitNoise is a general primitive and rightly does not ask about allegiance.
// The filter lives at the call site, in main.js's _earshot(), and it is NOT
// cosmetic — it is the thing standing between a thrown rock and every
// townsperson in earshot being branded '?' for the rest of the run.
//
// Why: a noise sets 'suspicious', and the awareness ladder that walks that back
// down to idle lives inside npc.js's HOSTILE branch, which never runs for a
// neutral. Verified in the live game before this was written: a neutral held
// 'suspicious' across twelve world turns while a hostile went
// suspicious -> returning -> idle over the same span.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isHostile } from '../game/ai.js';

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');

function liveMethod(name, params, freeVars = {}) {
    const sig = `${name}(${params}) {`;
    const at = mainSrc.indexOf(sig);
    assert.ok(at > 0, `${name}(${params}) not found in main.js`);
    const closeAt = mainSrc.indexOf('\n    }', at);
    const body = mainSrc.slice(at + name.length, closeAt + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
}

describe('_earshot — a noise only moves those who can recover from it', () => {
    const earshot = liveMethod('_earshot', '', { isHostile });

    test('hostiles are in earshot', () => {
        const h = { allegiance: 'hostile' };
        assert.deepEqual(earshot.call({ enemies: [h] }), [h]);
    });

    test('a neutral townsperson is not — they have no ladder to climb back down', () => {
        assert.deepEqual(earshot.call({ enemies: [{ allegiance: 'neutral' }] }), []);
    });

    test('nor is a bribed ally', () => {
        assert.deepEqual(earshot.call({ enemies: [{ allegiance: 'ally', _ally: true }] }), []);
    });

    test('a mixed crowd yields only the hostiles', () => {
        const h1 = { allegiance: 'hostile' }, h2 = { allegiance: 'hostile' };
        const crowd = [{ allegiance: 'neutral' }, h1, { allegiance: 'ally' }, h2];
        assert.deepEqual(earshot.call({ enemies: crowd }), [h1, h2]);
    });

    test('no enemies at all is empty, not a throw', () => {
        assert.deepEqual(earshot.call({ enemies: [] }), []);
        assert.deepEqual(earshot.call({}), []);
    });
});

// ── The call sites actually fire ─────────────────────────────────────────────
//
// Added after a mutation run: deleting the emitNoise call from _rockClatter and
// from combatAttack failed NOTHING. Every rule about who hears what was pinned,
// and whether anything ever made a sound was not.

describe('the sites that make the noise', () => {
    test('a pullsAggro item throws a sound at the landing tile', () => {
        const rock = liveMethod('_rockClatter', 'itemDef, x, y', { emitNoise, NOISE });
        const calls = [];
        const self = {
            _earshot: () => 'THE_HOSTILES',
            _log: () => {},
            // shadow the real emitNoise so we see the arguments, not the effect
        };
        const spy = (watchers, x, y, loudness) => calls.push({ watchers, x, y, loudness });
        const rockSpy = liveMethod('_rockClatter', 'itemDef, x, y', { emitNoise: spy, NOISE });
        rockSpy.call(self, { pullsAggro: true }, 6, 7);
        assert.equal(calls.length, 1, 'a thrown rock must make a sound');
        assert.deepEqual([calls[0].x, calls[0].y], [6, 7], 'at the LANDING tile, not the thrower');
        assert.equal(calls[0].loudness, NOISE.throwImpact);
        assert.equal(calls[0].watchers, 'THE_HOSTILES', 'through _earshot, not the raw list');
        assert.ok(rock);
    });

    test('an item that does not pull aggro is silent', () => {
        const calls = [];
        const rockSpy = liveMethod('_rockClatter', 'itemDef, x, y',
            { emitNoise: (...a) => calls.push(a), NOISE });
        rockSpy.call({ _earshot: () => [], _log: () => {} }, { pullsAggro: false }, 6, 7);
        rockSpy.call({ _earshot: () => [], _log: () => {} }, null, 6, 7);
        assert.equal(calls.length, 0);
    });

    test('swinging is loud — combatAttack emits at the player', () => {
        // combatAttack is far too entangled to lift and run (rings, poitions,
        // computeHit, hit-splats, death hooks), so this is a SHAPE guard on the
        // real source rather than a behavioural one. It can still fail, and it
        // does the job the mutation run showed was undone: it catches the call
        // being deleted. The behaviour itself was driven in the live game — a
        // swing turned a second idle hostile suspicious at the player's tile.
        const at = mainSrc.indexOf('combatAttack(enemyObj, damage, opts = {}) {');
        assert.ok(at > 0, 'combatAttack not found');
        const body = mainSrc.slice(at, mainSrc.indexOf('\n    }', at));
        assert.match(body, /emitNoise\(this\._earshot\(\), this\.playerX, this\.playerY, NOISE\.melee\)/,
            'combatAttack no longer makes a sound');
    });
});

describe('point blank silence', () => {
    test('loudness 0 is silent even on the very tile', () => {
        // The `loudness > 0` early-out only bites at distance ZERO — at any range
        // the radius check already rejects. Without this case, deleting the guard
        // changed nothing any test could see.
        const onTop = { x: 6, y: 6, state: 'idle', _lastSeenX: null,
                        entity: { isAlive: () => true } };
        emitNoise([onTop], 6, 6, NOISE.theft);
        assert.equal(onTop.state, 'idle', 'theft is silent BY DEFINITION');
        assert.equal(onTop._lastSeenX, null);
    });

    test('but a real sound on your own tile is heard', () => {
        const onTop = { x: 6, y: 6, state: 'idle', _lastSeenX: null,
                        entity: { isAlive: () => true } };
        emitNoise([onTop], 6, 6, NOISE.melee);
        assert.equal(onTop.state, 'suspicious');
    });
});
