// shields.test.js — a shield in a hand (plans/ws6-shields-in-hand.md).
// Ruled "both": a held shield bashes, adds armour, and cuts the next hit;
// two shields stack.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
    computeHit, weaponHitKind, isShield, shieldHands, shieldArmor, raiseShield, SHIELD_DEFAULTS,
} from '../game/combat.js';
import { heldInHands, holdInHands } from '../game/items.js';
import { WEAPONS, WEAPON_TIERS, weaponClassOf } from '../game/weapons.js';

const SHIELD = WEAPON_TIERS.shield[0];          // a one-hander, class shield
const SHIELD_B = WEAPON_TIERS.shield[1];        // another shield
const SWORD = WEAPONS.wooden_sword;
const GREAT = WEAPON_TIERS.great_sword[0];      // a two-hander
const handsOf = (def) => weaponClassOf(def)?.hands || 1;

const hands = (weapon = null, left = null) => ({ weapon, left, top: null, bottom: null, front: null, back: null, sides: null });

// One hit taken, as the player's damage path would take it: the block folds
// into the one computeHit with guard (round once), then armour soaks, min 1.
function takeHit(raw, eq, blocks, turn, { guard = false, armor = 0 } = {}) {
    const { mult } = raiseShield(eq, blocks, turn);
    const dmg = computeHit({ base: raw, incomingMult: (guard ? 0.5 : 1) * mult });
    if (dmg === 0) return 0;
    return Math.max(1, dmg - armor - shieldArmor(eq));
}

describe('what each hand holds', () => {
    test('right hand first, then the left', () => {
        assert.deepEqual(heldInHands(hands(SWORD, SHIELD)), [
            { hand: 'weapon', def: SWORD }, { hand: 'left', def: SHIELD },
        ]);
        assert.deepEqual(heldInHands(hands(null, SHIELD)), [{ hand: 'left', def: SHIELD }]);
        assert.deepEqual(heldInHands(hands()), []);
        assert.deepEqual(heldInHands(null), []);
    });

    test('a two-hander is held once; two of the same one-hander are two', () => {
        assert.equal(heldInHands(hands(GREAT, GREAT), handsOf).length, 1);
        assert.equal(heldInHands(hands(SHIELD, SHIELD), handsOf).length, 2);
    });
});

describe('a shield in a hand', () => {
    test('only the shield class is a shield', () => {
        assert.ok(SHIELD, 'the shield class has tiers');
        assert.equal(isShield(SHIELD), true);
        assert.equal(isShield(SWORD), false);
        assert.equal(isShield(GREAT), false);
        assert.equal(isShield(null), false);
        assert.equal(isShield({ id: 'pipe' }), false);
    });

    test('it is found in either hand', () => {
        assert.deepEqual(shieldHands(hands(SHIELD, SWORD)), ['weapon']);
        assert.deepEqual(shieldHands(hands(SWORD, SHIELD)), ['left']);
        assert.deepEqual(shieldHands(hands(SWORD, null)), []);
        assert.deepEqual(shieldHands(hands(GREAT, GREAT)), []);
    });

    test('it bashes: its hit lands crush', () => {
        assert.equal(weaponHitKind(SHIELD, {}), 'crush');
    });

    test('it adds armour while held, and none once it is gone', () => {
        assert.ok(SHIELD_DEFAULTS.armor > 0);
        assert.equal(shieldArmor(hands(SWORD, SHIELD)), SHIELD_DEFAULTS.armor);
        assert.equal(shieldArmor(hands(SWORD, null)), 0);
        assert.equal(shieldArmor(hands()), 0);
    });

    test("a shield's own armour wins over the default", () => {
        const heavy = { ...SHIELD, armor: SHIELD_DEFAULTS.armor + 3 };
        assert.equal(shieldArmor(hands(SWORD, heavy)), SHIELD_DEFAULTS.armor + 3);
    });

    test('it cuts the next hit, then not again until its block is back', () => {
        const eq = hands(SWORD, SHIELD);
        const blocks = {};
        const first = raiseShield(eq, blocks, 5);
        assert.equal(first.hand, 'left');
        assert.equal(first.mult, SHIELD_DEFAULTS.blockMult);
        assert.ok(first.mult < 1, 'a block cuts the hit');
        assert.deepEqual(raiseShield(eq, blocks, 5), { mult: 1, hand: null });
        const back = 5 + SHIELD_DEFAULTS.blockCooldown;
        assert.equal(raiseShield(eq, blocks, back).hand, 'left');
    });

    test('no shield, no block, and the blocks are left alone', () => {
        const blocks = {};
        assert.deepEqual(raiseShield(hands(SWORD, null), blocks, 0), { mult: 1, hand: null });
        assert.deepEqual(blocks, {});
    });

    test('a hit taken: cut, then soaked by the shield, then the next hit only soaked', () => {
        const eq = hands(SWORD, SHIELD);
        const blocks = {};
        const cut = computeHit({ base: 20, incomingMult: SHIELD_DEFAULTS.blockMult });
        assert.equal(takeHit(20, eq, blocks, 1), cut - SHIELD_DEFAULTS.armor);
        assert.equal(takeHit(20, eq, blocks, 1), 20 - SHIELD_DEFAULTS.armor);
    });

    test('the block folds in with guard and rounds once', () => {
        const eq = hands(SWORD, SHIELD);
        const once = computeHit({ base: 7, incomingMult: 0.5 * SHIELD_DEFAULTS.blockMult });
        assert.equal(takeHit(7, eq, {}, 0, { guard: true }), Math.max(1, once - SHIELD_DEFAULTS.armor));
    });

    test('a hit still lands for at least 1', () => {
        assert.equal(takeHit(1, hands(SWORD, SHIELD), {}, 0, { armor: 50 }), 1);
    });
});

describe('two shields', () => {
    for (const [label, right, left] of [['the same shield twice', SHIELD, SHIELD], ['two different shields', SHIELD, SHIELD_B]]) {
        test(`${label}: both hands hold a shield`, () => {
            assert.deepEqual(shieldHands(hands(right, left)), ['weapon', 'left']);
        });

        test(`${label}: each adds its own armour`, () => {
            assert.equal(shieldArmor(hands(right, left)), 2 * SHIELD_DEFAULTS.armor);
        });

        test(`${label}: each cuts a hit of its own, right hand first`, () => {
            const eq = hands(right, left);
            const blocks = {};
            assert.equal(raiseShield(eq, blocks, 3).hand, 'weapon');
            assert.equal(raiseShield(eq, blocks, 3).hand, 'left');
            assert.equal(raiseShield(eq, blocks, 3).hand, null);
        });
    }

    test('two shields take less from a turn of hits than one', () => {
        const hits = [20, 20, 20];
        const total = (eq) => { const b = {}; return hits.reduce((s, h) => s + takeHit(h, eq, b, 0), 0); };
        const none = total(hands(SWORD, null));
        const one = total(hands(SWORD, SHIELD));
        const two = total(hands(SHIELD, SHIELD));
        assert.equal(none, 60);
        assert.ok(one < none, `one shield ${one} < none ${none}`);
        assert.ok(two < one, `two shields ${two} < one ${one}`);
    });

    test('the two-hands rule puts a second shield in the left beside the first', () => {
        const eq = hands();
        holdInHands(eq, SHIELD, handsOf, 'weapon');
        const out = holdInHands(eq, SHIELD, handsOf, 'left');
        assert.deepEqual(out, []);
        assert.deepEqual(shieldHands(eq), ['weapon', 'left']);
    });

    test('a two-hander taken up drops both shields, and their armour with them', () => {
        const eq = hands(SHIELD, SHIELD_B);
        const out = holdInHands(eq, GREAT, handsOf);
        assert.deepEqual(out, [SHIELD, SHIELD_B]);
        assert.equal(shieldArmor(eq), 0);
        assert.deepEqual(raiseShield(eq, {}, 0), { mult: 1, hand: null });
    });
});

// ── The real damage path ─────────────────────────────────────────────────────
// main.js touches `document` at import, so the real methods are lifted out of
// the source and bound onto a small game object (as cascade.test.js does).
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');
function liveMethod(signature, freeVars) {
    const at = mainSrc.indexOf(signature, mainSrc.indexOf('class Game {'));
    assert.ok(at > 0, `${signature} not found in main.js`);
    const body = mainSrc.slice(at + signature.indexOf('('), mainSrc.indexOf('\n    }', at) + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
}
const live = {
    applyDamageToPlayer: liveMethod('    applyDamageToPlayer(', { computeHit, audio: { playSfx() {} } }),
    _playerArmor: liveMethod('    _playerArmor(', {}),
};

function liveGame(eq, { hp = 1000, turn = 0, guard = false } = {}) {
    const g = {
        equipment: eq, turn, playerHp: hp, playerX: 5, playerY: 5, ringMods: {},
        rng: { pick: (a) => a[0], float: () => 0.5 },
        hasBuff: (b) => guard && b === 'guard',
        _poitionMod: () => 0, _spreadFireBlood() {}, _spawnHitSplat() {},
        _ensureParticleLoop() {}, _triggerScreenShake() {}, _spawnEventWord() {},
        _log() {},
        _shieldArmor() { return shieldArmor(this.equipment || {}); },
        _shieldCut() { return raiseShield(this.equipment || {}, this._shieldBlocks ??= {}, this.turn ?? 0).mult; },
    };
    for (const [k, f] of Object.entries(live)) g[k] = f.bind(g);
    g.take = (raw) => { const before = g.playerHp; g.applyDamageToPlayer(raw); return before - g.playerHp; };
    return g;
}

describe('a held shield through the real damage path', () => {
    const A = SHIELD_DEFAULTS.armor;
    const cut20 = computeHit({ base: 20, incomingMult: SHIELD_DEFAULTS.blockMult });

    test('the two shield helpers in main.js are the ones the rule tests cover', () => {
        assert.ok(mainSrc.includes('_shieldArmor() { return shieldArmor(this.equipment || {}); }'));
        assert.ok(mainSrc.includes('_shieldCut() { return raiseShield(this.equipment || {}, this._shieldBlocks ??= {}, this.turn ?? 0).mult; }'));
    });

    test('armour: the real _playerArmor adds each held shield', () => {
        assert.equal(liveGame(hands(SWORD, null))._playerArmor(), 0);
        assert.equal(liveGame(hands(SWORD, SHIELD))._playerArmor(), A);
        assert.equal(liveGame(hands(SHIELD, SHIELD_B))._playerArmor(), 2 * A);
    });

    test('one shield: the first hit of a turn is cut, the second only soaked', () => {
        const g = liveGame(hands(SWORD, SHIELD));
        assert.equal(g.take(20), cut20 - A);
        assert.equal(g.take(20), 20 - A);
    });

    test('one shield: ready again next turn', () => {
        const g = liveGame(hands(SWORD, SHIELD));
        g.take(20);
        g.turn += SHIELD_DEFAULTS.blockCooldown;
        assert.equal(g.take(20), cut20 - A);
    });

    test('no shield: nothing changes', () => {
        const g = liveGame(hands(SWORD, null));
        assert.equal(g.take(20), 20);
        assert.equal(g.take(20), 20);
    });

    test('two shields cut two separate hits, the third is only soaked', () => {
        const g = liveGame(hands(SHIELD, SHIELD_B));
        assert.equal(g.take(20), cut20 - 2 * A);
        assert.equal(g.take(20), cut20 - 2 * A);
        assert.equal(g.take(20), 20 - 2 * A);
        g.turn += SHIELD_DEFAULTS.blockCooldown;
        assert.equal(g.take(20), cut20 - 2 * A);
    });

    test('a hit that deals nothing leaves the block unspent', () => {
        const g = liveGame(hands(SWORD, SHIELD));
        assert.equal(g.take(0), 0);
        assert.equal(g.take(-3), 0);
        assert.deepEqual(g._shieldBlocks ?? {}, {});
        assert.equal(g.take(20), cut20 - A);
    });

    test('the cut never turns a landing hit into nothing', () => {
        assert.equal(liveGame(hands(SWORD, SHIELD)).take(1), 1);
    });

    test('guard and a shield fold into one rounding', () => {
        const g = liveGame(hands(SWORD, SHIELD), { guard: true });
        const once = computeHit({ base: 20, incomingMult: 0.5 * SHIELD_DEFAULTS.blockMult });
        assert.equal(g.take(20), Math.max(1, once - A));
    });

    test('a new game clears the blocks', () => {
        const src = mainSrc.slice(mainSrc.indexOf('async _fullReset('));
        const reset = src.slice(0, src.indexOf('\n    }'));
        assert.match(reset, /this\.turn = 0;\s*\n\s*this\._shieldBlocks = \{\}/);
    });

    test('a block left from a longer game is ready once the turn counter is back', () => {
        const g = liveGame(hands(SWORD, SHIELD), { turn: 500 });
        g.take(20);
        g.turn = 3;   // loaded an earlier save
        assert.equal(g.take(20), cut20 - A);
    });
});
