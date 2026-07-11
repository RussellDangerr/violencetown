// buffs.test.js — the buff-behavior table + shared tick (PD-4).
//
// De-smears status logic that used to be scattered across main.js/_advanceWorld
// (sludge DoT) and _tickBuffs (recover heal), and unifies the player + enemy tick
// methods behind one game/buffs.js helper. These pin the migrated behaviors and
// the shared-helper contract. EXPECTED GREEN.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { tickBuffList } from '../game/buffs.js';
import { SLUDGE_DOT } from '../game/data.js';

// A minimal "owner"/game exposing what the migrated defs read.
function fakeGame(over = {}) {
    return {
        playerHp: 100, playerMaxHp: 100,
        logs: [],
        _log(m) { this.logs.push(m); },
        _hasSludgeImmunity() { return false; },
        ...over,
    };
}

describe('buff table + shared tick (PD-4)', () => {
    test('sludge onTick deals SLUDGE_DOT each active turn, then expires', () => {
        const g = fakeGame();
        const buffs = [{ id: 'sludge', name: 'Sludge', turns: 3, type: 'debuff' }];
        const start = g.playerHp;
        tickBuffList(buffs, g, g, null);                       // turn 1
        assert.equal(g.playerHp, start - SLUDGE_DOT);
        assert.equal(buffs.length, 1, 'still active after one tick');
        tickBuffList(buffs, g, g, null);                       // turn 2
        tickBuffList(buffs, g, g, null);                       // turn 3 → expires
        assert.equal(g.playerHp, start - 3 * SLUDGE_DOT, 'three ticks of DoT total');
        assert.equal(buffs.length, 0, 'sludge expired after its 3 turns');
    });

    test('sludge onTick is suppressed by immunity', () => {
        const g = fakeGame({ _hasSludgeImmunity: () => true });
        const buffs = [{ id: 'sludge', name: 'Sludge', turns: 2, type: 'debuff' }];
        tickBuffList(buffs, g, g, null);
        assert.equal(g.playerHp, 100, 'an immune player takes no sludge damage');
    });

    test('recover onExpire heals pendingHeal when the buff drops', () => {
        const g = fakeGame({ playerHp: 40 });
        const buffs = [{ id: 'recover', name: 'Recover', turns: 1, type: 'buff', pendingHeal: 25 }];
        tickBuffList(buffs, g, g, null);
        assert.equal(g.playerHp, 65, 'healed by pendingHeal on expiry');
        assert.equal(buffs.length, 0);
    });

    test('recover heal clamps to max HP', () => {
        const g = fakeGame({ playerHp: 90, playerMaxHp: 100 });
        const buffs = [{ id: 'recover', name: 'Recover', turns: 1, type: 'buff', pendingHeal: 50 }];
        tickBuffList(buffs, g, g, null);
        assert.equal(g.playerHp, 100, 'heal clamps to max HP');
    });

    test('a hook-less buff just decrements + expires, firing the expiry log once', () => {
        const g = fakeGame();
        const buffs = [{ id: 'guard', name: 'Guard', turns: 2, type: 'buff' }];
        const logs = [];
        tickBuffList(buffs, g, g, (b) => logs.push(b.name));
        assert.equal(buffs[0].turns, 1);
        assert.deepEqual(logs, [], 'no expiry log while still active');
        tickBuffList(buffs, g, g, (b) => logs.push(b.name));
        assert.equal(buffs.length, 0);
        assert.deepEqual(logs, ['Guard'], 'expiry log fires once, on drop');
    });

    test('tolerates an empty / missing buff list', () => {
        assert.doesNotThrow(() => tickBuffList([], fakeGame(), fakeGame(), null));
        assert.doesNotThrow(() => tickBuffList(undefined, fakeGame(), fakeGame(), null));
    });
});
