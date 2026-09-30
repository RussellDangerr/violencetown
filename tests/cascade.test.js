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
import { splatPill, splatSpot, layoutSplats, glideToward, SPLAT_LAYOUTS } from '../game/splat-layout.js';

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
            assert.deepEqual(on.splats, off.splats, 'the same splat');
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

    test('without the cascade, nobody lunges', () => {
        const goon = { x: 6, y: 5 };
        hitGame({ cascade: null, hp: 100 }).hit(12, goon);
        assert.equal(goon._lungeAt, undefined);
    });
});

// ── Hit splats: laid out by how many share a target ──────────────────────────

describe('layoutSplats — one sits centred; more spread out, in the order they came', () => {
    const at = (tileX, tileY, bornAt) => ({ tileX, tileY, bornAt });
    const spotsOf = (list) => { const m = layoutSplats(list); return list.map(d => m.get(d)); };

    test('a lone splat sits in the centre', () => {
        assert.deepEqual(spotsOf([at(5, 5, 0)]), [{ x: 0, y: 0 }]);
    });

    test('two stack, the first on top; four take the compass points N, E, S, W', () => {
        const [a, b] = spotsOf([at(5, 5, 0), at(5, 5, 130)]);
        assert.ok(a.y < b.y && a.x === 0 && b.x === 0);
        const four = spotsOf([at(5, 5, 0), at(5, 5, 1), at(5, 5, 2), at(5, 5, 3)]);
        assert.deepEqual(four.map(p => [Math.sign(p.x), Math.sign(p.y)]), [[0, -1], [1, 0], [0, 1], [-1, 0]]);
    });

    test('arrival order decides the spot, not list order', () => {
        const early = at(5, 5, 0), late = at(5, 5, 200);
        const m = layoutSplats([late, early]);
        assert.ok(m.get(early).y < m.get(late).y);
    });

    test('a splat on another tile is a different target', () => {
        const m = layoutSplats([at(5, 5, 0), at(6, 5, 10)]);
        for (const p of m.values()) assert.deepEqual(p, { x: 0, y: 0 });
    });

    test('past four, the four-splat spots cycle', () => {
        assert.deepEqual(splatSpot(4, 5), splatSpot(0, 5));
    });
});

describe('splat-layout — resting pills never touch, at any count', () => {
    const box = (spot, text, crit) => {
        const { w, h } = splatPill(text.length * 4.8, crit);   // VT323 at the 12px line: 0.4 x 12 per char
        return { l: spot.x - w / 2, r: spot.x + w / 2, t: spot.y - h / 2, b: spot.y + h / 2 };
    };
    const touch = (p, q) => p.l < q.r && q.l < p.r && p.t < q.b && q.t < p.b;
    for (const crit of [false, true]) {
        test(`one to four splats, up to four characters${crit ? ', crits' : ''}`, () => {
            const texts = ['-1', '+3', '-10', '-24', '-100', '-999'];
            for (let count = 2; count <= 4; count++) {
                const layout = SPLAT_LAYOUTS[count];
                for (const ta of texts) for (const tb of texts) {
                    for (let i = 0; i < count; i++) for (let j = i + 1; j < count; j++) {
                        assert.ok(!touch(box(layout[i], ta, crit), box(layout[j], tb, crit)),
                            `${count} splats: spot ${i} "${ta}" touches spot ${j} "${tb}"`);
                    }
                }
            }
        });
    }

    test('a pill is never narrower than it is tall, and grows with the number', () => {
        const tiny = splatPill(1 * 4.8), two = splatPill(2 * 4.8), four = splatPill(4 * 4.8);
        assert.equal(tiny.w, tiny.h, 'a lone digit is a round dot');
        assert.ok(two.w > tiny.w && four.w > two.w);
    });
});

describe('glideToward — splats slide to a new spot instead of jumping', () => {
    test('a new splat starts on its spot', () => {
        assert.deepEqual(glideToward(undefined, { x: 4, y: -8 }, 16), { x: 4, y: -8 });
    });
    test('it eases, most of the way in about 100 ms, whatever the frame rate', () => {
        const from = { x: 0, y: 0 }, to = { x: 0, y: -16 };
        const oneFrame = glideToward(from, to, 16);
        assert.ok(oneFrame.y < 0 && oneFrame.y > -16, 'part of the way in one frame');
        let p = from; for (let i = 0; i < 6; i++) p = glideToward(p, to, 1000 / 60);
        const big = glideToward(from, to, 100);
        assert.ok(Math.abs(p.y - big.y) < 1e-9, 'six 60 fps frames = one 100 ms step');
        assert.ok(big.y < -14, 'about 90% there after 100 ms');
    });
});
