// dot-death.test.js — an enemy killed by its own DoT tick is dead (plans/dot-death.md).
//
// Its buffs tick at the start of its turn. When that tick killed it, it used to
// take the turn anyway — swing at you, or buy HP back with a purse — and its
// death was never handled: no loot, no kill event, and the Were-Rat dropped no
// converter. Played through the real resolveEnemyTurns, with a stand-in game.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Enemy, resolveEnemyTurns } from '../game/enemies.js';

const openRoom = ['...........', '...........', '...........', '...........', '...........'];
function makeGame(px, py) {
    const H = openRoom.length, W = openRoom[0].length;
    return {
        playerX: px, playerY: py, enemies: [], containers: [], turn: 1, _MOVE_MS: 150,
        map: { isWalkable: (x, y) => x >= 0 && y >= 0 && x < W && y < H && openRoom[y][x] !== '#' },
        rng: { pick: (a) => a[0], float: () => 0.5 },
        damageTaken: 0, deaths: [], logged: [],
        applyDamageToPlayer(d) { this.damageTaken += d; },
        _log(t) { this.logged.push(t); },
        _handleEnemyDeath(e) { this.deaths.push(e.id); },
    };
}
// A hostile goon adjacent to the player, facing them, in the fight.
const goon = (g, over = {}) => {
    const e = new Enemy({ id: 'g1', type: 'Fungus', x: 5, y: 2, sightRange: 8, facing: 'S', damage: 9,
        allegiance: 'hostile', gold: 0, ...over });
    g.enemies.push(e);
    return e;
};
const poison = (e, dmg) => e.addBuff('poison', 'Poison', 3, 'debuff', { dmg });

describe('a DoT death is a death', () => {
    test('control: the same poisoned goon, not killed by the tick, does swing', () => {
        const g = makeGame(5, 3);
        const e = goon(g);
        poison(e, 5);                       // 100 HP: the tick hurts, it survives
        resolveEnemyTurns(g);
        assert.ok(e.entity.isAlive());
        assert.ok(g.damageTaken > 0, 'the fixture really produces a swing');
        assert.deepEqual(g.deaths, []);
    });

    test('killed by its own tick, it takes no turn — no posthumous swing', () => {
        const g = makeGame(5, 3);
        const e = goon(g);
        e.entity.hp = 3;
        poison(e, 5);
        resolveEnemyTurns(g);
        assert.equal(e.entity.isAlive(), false);
        assert.equal(g.damageTaken, 0, 'a corpse does not swing');
    });

    test('nor buys itself back from the dead with its purse', () => {
        const g = makeGame(5, 3);
        const e = goon(g, { gold: 40 });
        e.entity.hp = 3;
        poison(e, 5);
        resolveEnemyTurns(g);
        assert.equal(e.entity.hp, 0, 'still dead, not a 40 HP corpse');
        assert.equal(e.gold, 40, 'the purse is left for the loot');
    });

    test('and its death is handled, exactly once, like any other kill', () => {
        const g = makeGame(5, 3);
        const e = goon(g);
        e.entity.hp = 3;
        poison(e, 5);
        resolveEnemyTurns(g);
        assert.deepEqual(g.deaths, ['g1']);
        resolveEnemyTurns(g);               // the next turn: already dead, not handled again
        assert.deepEqual(g.deaths, ['g1']);
    });
});
