// kits.test.js — Task 12: role-default kit fallback (Law 6f omission backstop).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnEnemy, challengeGp } from '../game/enemies.js';

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
