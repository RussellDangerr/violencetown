// hunting-state.test.js — 'searching' counts as a fight.
//
// The perception ladder added 'searching': an enemy that has LOST you and is
// sweeping your last-seen tile. npc.js pursues on it exactly as it pursues on
// 'chasing' — but every gate that asked "is this a fight?" predated the state and
// tested `state === 'chasing'` alone. Nine of them. So a searching enemy hunted
// you while the game believed you were out of combat: the free-roam heartbeat
// kept ticking, the wheel never re-skinned, the threat banner showed nothing, the
// sight cone was invisible, and enemies followed you through doors or didn't
// depending on which flag was read.
//
// The sharpest one was de-aggro. Zone change, retry-after-defeat and respawn all
// promise the player a breather by dropping chasers to idle — and all three
// cleared 'chasing' only, so a searcher walked out of your death screen still on
// your trail.
//
// Nothing in 988 passing tests noticed any of it, which is the point of this file.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { isHunting } from '../game/ai.js';
import { isCombatActive } from '../game/wheel-model.js';

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');

function liveMethod(name, params, freeVars = {}) {
    const signature = `${name}(${params}) {`;
    const at = mainSrc.indexOf(signature);
    assert.ok(at > 0, `${name}(${params}) not found in main.js`);
    const closeAt = mainSrc.indexOf('\n    }', at);
    const body = mainSrc.slice(at + name.length, closeAt + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
}

const alive = () => ({ isAlive: () => true });
const foe = (state, over = {}) => ({ state, entity: alive(), ...over });

describe('isHunting', () => {
    test('both hunting states count', () => {
        assert.equal(isHunting(foe('chasing')), true);
        assert.equal(isHunting(foe('searching')), true, 'a searcher is on your trail');
    });

    test('and nothing else does', () => {
        for (const s of ['idle', 'wandering', 'working', 'suspicious', 'returning', null, undefined]) {
            assert.equal(isHunting(foe(s)), false, `${s} should not read as a fight`);
        }
    });

    test("'returning' is walking home, not hunting", () => {
        // Easy to get wrong: it is the state a searcher decays INTO, and it does
        // move. But it moves away from you.
        assert.equal(isHunting(foe('returning')), false);
    });

    test('a missing character is not hunting anyone', () => {
        assert.equal(isHunting(null), false);
        assert.equal(isHunting(undefined), false);
    });
});

describe('a searching enemy means you are in combat', () => {
    test('isCombatActive counts it', () => {
        assert.equal(isCombatActive({ enemies: [foe('searching')] }), true,
            'this gates the free-roam heartbeat AND the wheel re-skin');
    });

    test('an idle or returning enemy does not', () => {
        assert.equal(isCombatActive({ enemies: [foe('idle')] }), false);
        assert.equal(isCombatActive({ enemies: [foe('returning')] }), false);
    });

    test('an ambient townsperson never counts, whatever state it carries', () => {
        assert.equal(isCombatActive({ enemies: [foe('searching', { ambient: true })] }), false);
    });

    test('a dead searcher does not hold you in combat', () => {
        assert.equal(isCombatActive({ enemies: [{ state: 'searching', entity: { isAlive: () => false } }] }), false);
    });
});

describe('de-aggro stands down a searcher', () => {
    const deAggro = liveMethod('_deAggroAll', '', { isHunting });

    test('the breather is a real breather', () => {
        const chaser   = foe('chasing');
        const searcher = foe('searching');
        const self = { enemies: [chaser, searcher] };
        deAggro.call(self);
        assert.equal(chaser.state, 'idle');
        assert.equal(searcher.state, 'idle',
            'a searcher used to walk out of your death screen still hunting you');
    });

    test('it clears the intruder flags too', () => {
        const e = foe('searching', { _intruder: true, _emergeDelay: 3 });
        deAggro.call({ enemies: [e] });
        assert.equal(e._intruder, false);
        assert.equal(e._emergeDelay, 0);
    });

    test('an ally is left alone', () => {
        const ally = foe('chasing', { _ally: true });
        deAggro.call({ enemies: [ally] });
        assert.equal(ally.state, 'chasing', 'your ally is mid-fight on your behalf');
    });

    test('the dead are left alone', () => {
        const corpse = { state: 'searching', entity: { isAlive: () => false } };
        deAggro.call({ enemies: [corpse] });
        assert.equal(corpse.state, 'searching');
    });

    test('an idle bystander is untouched', () => {
        const e = foe('idle');
        deAggro.call({ enemies: [e] });
        assert.equal(e.state, 'idle');
    });
});

describe('the gates all read the one predicate', () => {
    // The bug was nine copies of a rule drifting apart from a tenth. Guard the
    // shape, not just the behaviour: a raw state comparison creeping back into a
    // combat gate is how this happens again.
    test('no combat gate compares the state string by hand any more', () => {
        for (const [file, allowed] of [['../game/main.js', 0], ['../game/renderer.js', 0],
                                       ['../game/wheel-model.js', 0], ['../game/enemies.js', 0]]) {
            const src = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
            const hits = (src.match(/state\s*[!=]==\s*'chasing'/g) || []).length;
            assert.equal(hits, allowed, `${file} still hand-compares 'chasing' ${hits}×`);
        }
    });

    test('rockClatter is the one deliberate exception, and is still there', () => {
        // ai.js keeps a raw check on purpose: a rock SHOULD be able to redirect a
        // searcher (that is the stealth play), and perception.js's emitNoise —
        // written, not yet wired — encodes the eventual rule. Left alone rather
        // than changed as a side effect of a bug fix. If this ever fails, the
        // decision was revisited and this test should be updated with it.
        const src = readFileSync(fileURLToPath(new URL('../game/ai.js', import.meta.url)), 'utf8');
        assert.ok(/rockClatter[\s\S]{0,400}state === 'chasing'/.test(src),
            "rockClatter's deliberate raw check is gone — was that intended?");
    });
});
