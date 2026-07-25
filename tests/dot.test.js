// dot.test.js — Law 7: damage over time, and the player floor.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tickBuffList, BUFF_DEFS } from '../game/buffs.js';

// Minimal Game stand-in — tickBuffList only touches these fields.
function fakeGame(hp = 100) {
    return {
        playerHp: hp, playerMaxHp: 100,
        buffs: [], logs: [],
        _lastDefeatedBy: null,
        _log(m) { this.logs.push(m); },
        _hasSludgeImmunity: () => false,
    };
}

describe('DoT — per-buff dmg and turns', () => {
    test('a sludge buff carries its own dmg, not a module constant', () => {
        const g = fakeGame();
        g.buffs = [{ id: 'sludge', turns: 2, dmg: 3 }];
        tickBuffList(g.buffs, g, g);
        assert.equal(g.playerHp, 97);
    });
    test('poison and fire tick their own numbers', () => {
        const g = fakeGame();
        g.buffs = [{ id: 'poison', turns: 2, dmg: 5 }, { id: 'fire', turns: 3, dmg: 5 }];
        tickBuffList(g.buffs, g, g);
        assert.equal(g.playerHp, 90);
    });
    test('a DoT runs for exactly its authored turns', () => {
        const g = fakeGame();
        g.buffs = [{ id: 'fire', turns: 3, dmg: 5 }];
        for (let i = 0; i < 5; i++) tickBuffList(g.buffs, g, g);
        assert.equal(g.playerHp, 85);       // 5x3, then it is gone
        assert.equal(g.buffs.length, 0);
    });
    test('poison and fire are registered behaviors', () => {
        assert.ok(BUFF_DEFS.poison?.onTick);
        assert.ok(BUFF_DEFS.fire?.onTick);
    });
});

describe('Law 7 — the DoT floor', () => {
    test('a DoT cannot take the player below 1 HP', () => {
        const g = fakeGame(3);
        g.buffs = [{ id: 'fire', turns: 5, dmg: 20 }];
        tickBuffList(g.buffs, g, g);
        assert.equal(g.playerHp, 1);
    });
    test('the floor holds across many ticks — no time-based death, ever', () => {
        const g = fakeGame(100);
        g.buffs = [{ id: 'poison', turns: 50, dmg: 25 }];
        for (let i = 0; i < 50; i++) tickBuffList(g.buffs, g, g);
        assert.equal(g.playerHp, 1);
    });
    test('it does NOT self-cure at the floor — you stand there still burning', () => {
        const g = fakeGame(2);
        g.buffs = [{ id: 'fire', turns: 4, dmg: 10 }];
        tickBuffList(g.buffs, g, g);
        assert.equal(g.playerHp, 1);
        assert.equal(g.buffs.length, 1);          // still lit
        assert.equal(g.buffs[0].turns, 3);
    });
    test('an active DoT claims the defeat cause', () => {
        const g = fakeGame(50);
        g.buffs = [{ id: 'sludge', turns: 3, dmg: 5 }];
        tickBuffList(g.buffs, g, g);
        assert.deepEqual(g._lastDefeatedBy, { cause: 'sludge' });
    });
    test('the claim reaches the scenario the sludge cause already selects', async () => {
        const { pickScenario, DEFEAT_SCENARIOS } = await import('../game/defeat-scenarios.js');
        const pick = pickScenario(
            { zone: 'sewer-map.json', by: null, cause: 'sludge' },
            DEFEAT_SCENARIOS, () => 0);
        assert.equal(pick.id, 'swept_into_sludge');
    });
});

describe('the floor is player-only', () => {
    test('a sludge bomb finishes a fungus — no floor for enemies', () => {
        const g = fakeGame();
        const fungus = { type: 'Violet Fungus', entity: { hp: 4, maxHp: 100, alive: true },
                         buffs: [{ id: 'poison', turns: 2, dmg: 10 }] };
        tickBuffList(fungus.buffs, fungus, g);
        assert.equal(fungus.entity.hp, 0);
        assert.equal(fungus.entity.alive, false);
    });
    test('a poisoned ENEMY does not drain the player — the owner branch works', () => {
        const g = fakeGame(100);
        const fungus = { type: 'Violet Fungus', entity: { hp: 50, maxHp: 100, alive: true },
                         buffs: [{ id: 'fire', turns: 3, dmg: 5 }] };
        tickBuffList(fungus.buffs, fungus, g);
        assert.equal(g.playerHp, 100, 'the player must be untouched');
        assert.equal(fungus.entity.hp, 45);
    });
    test('an enemy DoT never claims the player defeat', () => {
        const g = fakeGame(100);
        const fungus = { type: 'Violet Fungus', entity: { hp: 50, maxHp: 100, alive: true },
                         buffs: [{ id: 'poison', turns: 2, dmg: 5 }] };
        tickBuffList(fungus.buffs, fungus, g);
        assert.equal(g._lastDefeatedBy, null);
    });
});

describe('sewer fare — a negative-dmg DoT heals (Phase D groundwork)', () => {
    test('it regenerates and respects maxHp', () => {
        const g = fakeGame(95);
        g.buffs = [{ id: 'poison', turns: 2, dmg: -5 }];
        tickBuffList(g.buffs, g, g);
        assert.equal(g.playerHp, 100);
        tickBuffList(g.buffs, g, g);
        assert.equal(g.playerHp, 100);        // clamped, never over the Hundred
    });
    test('healing never claims a defeat', () => {
        const g = fakeGame(95);
        g.buffs = [{ id: 'poison', turns: 2, dmg: -5 }];
        tickBuffList(g.buffs, g, g);
        assert.equal(g._lastDefeatedBy, null);
    });
});
