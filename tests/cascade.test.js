// cascade.test.js — turn-model C1: the enemy phase, played back one actor at a time.
//
// The cascade only changes WHEN effects are shown, never what happened. The
// module's rules are pinned first; then the one way it could change what
// happened — spending the seeded RNG later — is pinned against the real
// applyDamageToPlayer from main.js, cascade on and off.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCascade, lungeOffset, LUNGE_MS, LUNGE_TILES } from '../game/cascade.js';
import { computeHit } from '../game/combat.js';
import { RNG } from '../game/rng.js';

describe('the cascade plays each actor on its own beat', () => {
    test('actors play in the order they went, a beat apart; one with nothing takes no beat', () => {
        const c = createCascade({ beatMs: 100 });
        const seen = [];
        c.begin();
        c.mark('goonA'); c.defer('goonA', () => seen.push('A'));
        c.mark('idle');                                   // went, showed nothing
        c.mark('goonB'); c.defer('goonB', () => seen.push('B1')); c.defer('goonB', () => seen.push('B2'));
        c.commit(1000);
        assert.equal(c.tick(999), 0, 'nothing before the first beat');
        c.tick(1000);
        assert.deepEqual(seen, ['A']);
        c.tick(1099);
        assert.deepEqual(seen, ['A'], 'B waits for its beat');
        c.tick(1100);
        assert.deepEqual(seen, ['A', 'B1', 'B2'], 'the idle actor took no beat; B\'s two effects share one');
        assert.equal(c.pending(), false);
    });

    test('an effect deferred for an unmarked actor still gets a beat, after the marked ones before it', () => {
        const c = createCascade({ beatMs: 50 });
        const seen = [];
        c.begin();
        c.mark('a'); c.defer('a', () => seen.push('a'));
        c.defer('b', () => seen.push('b'));
        c.commit(0);
        c.tick(0); c.tick(50);
        assert.deepEqual(seen, ['a', 'b']);
    });

    test('outside a recorded phase, defer refuses and the caller runs the effect itself', () => {
        const c = createCascade();
        assert.equal(c.defer('x', () => {}), false);
        c.begin(); c.commit(0);
        assert.equal(c.defer('x', () => {}), false, 'committed = no longer recording');
    });

    test('flush plays everything still held, at once', () => {
        const c = createCascade({ beatMs: 100 });
        const seen = [];
        c.begin();
        for (const a of ['a', 'b', 'c']) { c.mark(a); c.defer(a, () => seen.push(a)); }
        c.commit(0);
        assert.equal(c.flush(), 3);
        assert.deepEqual(seen, ['a', 'b', 'c']);
        assert.equal(c.pending(), false);
    });

    test('a new phase plays the last one\'s leftovers first, never on top of them', () => {
        const c = createCascade({ beatMs: 100 });
        const seen = [];
        c.begin(); c.mark('old'); c.defer('old', () => seen.push('old')); c.commit(0);
        c.begin();
        assert.deepEqual(seen, ['old']);
    });

    test('the HP bar holds back damage until its blow plays', () => {
        const c = createCascade({ beatMs: 100 });
        c.begin();
        c.mark('a'); c.defer('a', () => {}, { hp: 7 });
        c.mark('b'); c.defer('b', () => {}, { hp: 5 });
        c.commit(0);
        assert.equal(c.heldPlayerHp(), 12);
        c.tick(0);
        assert.equal(c.heldPlayerHp(), 5);
        c.flush();
        assert.equal(c.heldPlayerHp(), 0);
    });
});

describe('the lunge', () => {
    test('out and back over LUNGE_MS, peaking at LUNGE_TILES halfway, still otherwise', () => {
        assert.equal(lungeOffset(null, 50), 0);
        assert.equal(lungeOffset(100, 100), 0);
        assert.ok(Math.abs(lungeOffset(100, 100 + LUNGE_MS / 2) - LUNGE_TILES) < 1e-9);
        assert.equal(lungeOffset(100, 100 + LUNGE_MS), 0);
        assert.ok(lungeOffset(100, 100 + LUNGE_MS / 4) > 0);
    });
});

// ── The real hit, cascade on and off ──────────────────────────────────────────

const mainSrc = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
function liveMethod(signature, freeVars) {
    const at = mainSrc.indexOf(signature, mainSrc.indexOf('class Game {'));
    assert.ok(at > 0, `${signature} not found in main.js`);
    const body = mainSrc.slice(at + signature.indexOf('('), mainSrc.indexOf('\n    }', at) + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
}
const applyDamageToPlayer = liveMethod('    applyDamageToPlayer(', { computeHit, audio: { playSfx() {} } });
const spawnEventWord = liveMethod('    _spawnEventWord(', {});   // the real one: it rolls the RNG

function hitGame({ cascade, hp }) {
    const g = {
        playerHp: hp, playerX: 5, playerY: 5, rng: new RNG(42), _cascade: cascade, _cascadeActor: null,
        splats: [], _damageNumbers: [],
        hasBuff: () => false, _playerArmor: () => 0,
        _spawnHitSplat(...a) { g.splats.push(a); },
        _ensureParticleLoop() {}, _triggerScreenShake() {},
    };
    g._spawnEventWord = spawnEventWord.bind(g);
    g.hit = applyDamageToPlayer.bind(g);
    g.words = () => g._damageNumbers.map(w => ({ text: w.text, vx: w.vx }));
    return g;
}

describe('applyDamageToPlayer — the cascade changes when, never what', () => {
    for (const hp of [100, 5]) {
        test(`the seeded RNG hands out the same next number, cascade on or off (${hp === 5 ? 'a killing blow' : 'a hit'})`, () => {
            const goon = { x: 6, y: 5 };
            const off = hitGame({ cascade: null, hp });
            const on = hitGame({ cascade: createCascade(), hp });
            on._cascade.begin();
            off.hit(12, goon);
            on.hit(12, goon);
            assert.equal(on.playerHp, off.playerHp, 'the damage lands at once either way');
            assert.equal(on.splats.length, 0, 'held for the beat');
            // The next enemy's turn spends the RNG between the hit and its playback,
            // as it does in the game — so a roll moved into the held effects would
            // draw a different number here.
            assert.equal(on.rng.float(), off.rng.float(), 'the next enemy draws the same number');
            on._cascade.commit(0);
            on._cascade.flush();
            assert.equal(on.rng.float(), off.rng.float(), 'RNG spent in the same order');
            // Only its flight differs (away from the attacker, in a cascade) — tested below.
            const what = (sp) => sp.map(([x, y, text, type, opts]) => ({ x, y, text, type, killed: opts.killed }));
            assert.deepEqual(what(on.splats), what(off.splats), 'the same splat: where, how much, what, whether it killed');
            assert.deepEqual(on.words(), off.words(), 'the same event word, scatter included');
            if (hp === 5) assert.equal(off.words().length, 1, 'the kill fixture really exercises the word');
        });
    }

    test('an event word sent straight to the cascade also rolls its scatter at once', () => {
        const goon = { x: 6, y: 5 };
        const off = hitGame({ cascade: null, hp: 100 });
        const on = hitGame({ cascade: createCascade(), hp: 100 });
        on._cascade.begin();
        on._cascadeActor = goon;
        off._spawnEventWord(6, 5, 'POW!', '#fff', 18);
        on._spawnEventWord(6, 5, 'POW!', '#fff', 18);
        assert.equal(on._damageNumbers.length, 0, 'held for the beat');
        assert.equal(on.rng.float(), off.rng.float(), 'the next enemy draws the same number');
        on._cascadeActor = null;
        on._cascade.commit(0);
        on._cascade.flush();
        assert.deepEqual(on.words(), off.words());
    });

    test('in a cascade the attacker lunges toward you when its blow plays', () => {
        const goon = { x: 6, y: 5 };
        const g = hitGame({ cascade: createCascade(), hp: 100 });
        g._cascade.begin();
        g.hit(12, goon);
        assert.equal(goon._lungeAt, undefined, 'not before its beat');
        g._cascade.commit(0); g._cascade.flush();
        assert.equal(goon._lungeDx, -1);
        assert.equal(goon._lungeDy, 0);
    });

    test('in a cascade your hit number flies away from whoever landed it; without, it bursts around you', () => {
        const goon = { x: 6, y: 5 };
        const on = hitGame({ cascade: createCascade(), hp: 100 });
        on._cascade.begin(); on.hit(12, goon); on._cascade.commit(0); on._cascade.flush();
        assert.deepEqual(on.splats[0][4].dir, { dx: -1, dy: 0 }, 'hit from the east, flies west');
        assert.ok(!on.splats[0][4].omni);
        const off = hitGame({ cascade: null, hp: 100 });
        off.hit(12, goon);
        assert.equal(off.splats[0][4].omni, true);
        assert.equal(off.splats[0][4].dir, undefined);
    });

    test('without the cascade, nobody lunges', () => {
        const goon = { x: 6, y: 5 };
        hitGame({ cascade: null, hp: 100 }).hit(12, goon);
        assert.equal(goon._lungeAt, undefined);
    });
});

// ── Splats on one tile spread out while they are on screen ───────────────────

describe('_spawnHitSplat — every splat still up on the tile pushes the next one aside', () => {
    let clock = 0;
    const spawn = liveMethod('    _spawnHitSplat(', { performance: { now: () => clock } });
    const game = () => {
        const g = { _damageNumbers: [], _cascade: null, _cascadeActor: null,
            _pickHitMark: () => null, _ensureParticleLoop() {} };
        g.spawn = (x, y) => spawn.call(g, x, y, '-4', 'physical', { omni: true });
        g.slots = () => g._damageNumbers.map(d => d.slot);
        return g;
    };

    test('blows a cascade beat apart fan out instead of stacking', () => {
        const g = game();
        for (const t of [0, 130, 260, 390]) { clock = t; g.spawn(5, 5); }
        assert.deepEqual(g.slots(), [0, 1, 2, 3]);
    });

    test('blows in the same instant fan out as they always did', () => {
        const g = game();
        clock = 0; g.spawn(5, 5); g.spawn(5, 5); g.spawn(5, 5);
        assert.deepEqual(g.slots(), [0, 1, 2]);
    });

    test('a splat that has faded no longer counts, and other tiles never do', () => {
        const g = game();
        clock = 0; g.spawn(5, 5);
        clock = 10; g.spawn(6, 5);
        clock = 700; g.spawn(5, 5);
        assert.deepEqual(g.slots(), [0, 0, 0]);
    });
});
