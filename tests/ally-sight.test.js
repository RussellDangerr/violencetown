// ally-sight.test.js — allies come to your aid when they can see the fight
// (plans/f3b-allies-join-by-sight.md).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { allyAids, isHostile } from '../game/ai.js';
import { fighters } from '../game/fight-area.js';
import { perceives, VERDICT } from '../game/perception.js';
import { getGreedyStep, stepEntity } from '../game/pathing.js';
import { manhattan } from '../game/utils.js';

const alive = () => ({ isAlive: () => true });
// Sight 8, facing south unless told otherwise.
const hostile = (x, y, state = 'idle', over = {}) => ({
    x, y, state, allegiance: 'hostile', entity: alive(), sightRange: 8, _lastDx: 0, _lastDy: 1, ...over,
});
const ally = (x, y, over = {}) => hostile(x, y, 'idle', { allegiance: 'ally', _ally: true, fsmState: 'ALLIED', damage: 5, ...over });
const openMap = () => ({ isWalkable: () => true });
function gridMap(rows) {
    const H = rows.length, W = rows[0].length;
    return { isWalkable: (x, y) => x >= 0 && y >= 0 && x < W && y < H && rows[y][x] !== '#' };
}
// 20x20 with a full wall across row `wallY`.
const walled = (wallY) => gridMap(Array.from({ length: 20 }, (_, y) => (y === wallY ? '#' : '.').repeat(20)));
const seesFrom = (map, who) => (x, y) => perceives(map, who, x, y) === VERDICT.DIRECT;
const FAR = { x: 40, y: 40 };

describe('allyAids', () => {
    test('no fight on, no aid, even looking straight at you', () => {
        const a = ally(10, 10);
        assert.equal(allyAids(a, [], { x: 10, y: 12 }, () => true), false);
        assert.equal(allyAids(a, undefined, { x: 10, y: 12 }, () => true), false);
    });

    test('an ally who directly sees you, in a fight, joins it', () => {
        const a = ally(10, 10), f = hostile(30, 30, 'chasing');
        assert.equal(allyAids(a, [f], { x: 10, y: 13 }, seesFrom(openMap(), a)), true);
    });

    test('an ally who directly sees a fighter joins, wherever you are', () => {
        const a = ally(10, 10), f = hostile(10, 14, 'chasing');
        assert.equal(allyAids(a, [f], FAR, seesFrom(openMap(), a)), true);
    });

    test('a wall between them hides the fight', () => {
        const map = walled(12);
        const a = ally(10, 10), f = hostile(10, 14, 'chasing');
        assert.equal(allyAids(a, [f], { x: 10, y: 15 }, seesFrom(map, a)), false);
        assert.equal(allyAids(a, [f], { x: 10, y: 15 }, seesFrom(openMap(), a)), true, 'same layout, no wall');
    });

    test('direct view only: the fight in its periphery does not count', () => {
        const a = ally(10, 10), f = hostile(13, 10, 'chasing');   // due east of a south-facing ally
        assert.equal(perceives(openMap(), a, f.x, f.y), VERDICT.PERIPHERAL);
        assert.equal(allyAids(a, [f], { x: 7, y: 10 }, seesFrom(openMap(), a)), false);
    });

    test('once in, it stays in for as long as the fight is on', () => {
        const a = ally(10, 10, { _aiding: true }), f = hostile(10, 14, 'chasing');
        assert.equal(allyAids(a, [f], FAR, () => false), true);
        assert.equal(allyAids(a, [], FAR, () => false), false, 'the fight is over');
    });
});

// ── main.js: the live ally turn, run against a stand-in game ─────────────────

const mainSrc = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
function liveMethod(signature, freeVars) {
    const at = mainSrc.indexOf(signature, mainSrc.indexOf('class Game {'));
    assert.ok(at > 0, `${signature} not found in main.js`);
    const body = mainSrc.slice(at + signature.indexOf('('), mainSrc.indexOf('\n    }', at) + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
}
const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
const hits = [];
const allyTakeTurn = liveMethod('    _allyTakeTurn(', {
    fighters, allyAids, perceives, VERDICT, manhattan, cheb, getGreedyStep, stepEntity,
    computeHit: ({ base }) => base,
    attack: (from, to, dmg) => { hits.push({ from, to, dmg }); return { dealt: dmg, killed: false }; },
});

function standIn(map, enemies, player) {
    const g = { map, enemies, playerX: player.x, playerY: player.y, _MOVE_MS: 150 };
    g._isHostileToPlayer = (e) => e.entity.isAlive() && isHostile(e);
    g._spawnHitSplat = () => {};
    g._ensureParticleLoop = () => {};
    g._handleEnemyDeath = () => {};
    g._spreadFireBlood = () => {};
    g.allyTurn = allyTakeTurn.bind(g);
    return g;
}

describe('_allyTakeTurn', () => {
    test('an ally who sees a fighter heads into the fight', () => {
        const a = ally(10, 10), f = hostile(10, 14, 'chasing');
        const g = standIn(openMap(), [a, f], { x: 3, y: 10 });
        g.allyTurn(a);
        assert.equal(a._aiding, true);
        assert.deepEqual([a.x, a.y], [10, 11], 'one step toward the fighter, not toward you');
    });

    test('an ally behind a wall with no view keeps following you', () => {
        // You are north, behind its back; the fight is south, past a wall, inside its old 8-tile reach.
        const a = ally(10, 8), f = hostile(10, 12, 'chasing');
        const g = standIn(walled(10), [a, f], { x: 10, y: 3 });
        g.allyTurn(a);
        assert.equal(a._aiding, false);
        assert.deepEqual([a.x, a.y], [10, 7], 'it closes in on you');
    });

    test('once it has joined, losing sight does not send it back to you', () => {
        // A north-facing ally: the fighter is in its periphery, you are behind it.
        const run = (over) => {
            const a = ally(10, 10, { _lastDx: 0, _lastDy: -1, ...over }), f = hostile(13, 10, 'chasing');
            standIn(openMap(), [a, f], { x: 10, y: 16 }).allyTurn(a);
            return [a.x, a.y];
        };
        assert.deepEqual(run({}), [10, 11], 'not yet joined: it follows you south');
        assert.deepEqual(run({ _aiding: true }), [11, 10], 'joined: it goes east, for the fighter');
    });

    test('next to a fighter it can see, it attacks', () => {
        hits.length = 0;
        const a = ally(10, 10), f = hostile(10, 11, 'chasing');
        standIn(openMap(), [a, f], { x: 11, y: 12 }).allyTurn(a);
        assert.equal(hits.length, 1);
        assert.equal(hits[0].to, f.entity);
        assert.deepEqual([a.x, a.y], [10, 10]);
    });

    test('with no fight on it follows you, even past a calm hostile it can see', () => {
        hits.length = 0;
        const a = ally(10, 10), calm = hostile(10, 11, 'idle');
        standIn(openMap(), [a, calm], { x: 10, y: 3 }).allyTurn(a);
        assert.equal(a._aiding, false);
        assert.equal(hits.length, 0);
        assert.deepEqual([a.x, a.y], [10, 9]);
    });

    test('when the fight ends, it stops aiding', () => {
        const a = ally(10, 10, { _aiding: true }), f = hostile(10, 14, 'returning');
        standIn(openMap(), [a, f], { x: 10, y: 12 }).allyTurn(a);
        assert.equal(a._aiding, false);
    });

    test('a hostile out of the fight is not a target, even for an aiding ally', () => {
        hits.length = 0;
        const a = ally(10, 10), calm = hostile(10, 11, 'idle'), f = hostile(14, 10, 'chasing');
        standIn(openMap(), [a, calm, f], { x: 10, y: 13 }).allyTurn(a);
        assert.equal(a._aiding, true, 'it sees you, in a fight');
        assert.equal(hits.length, 0, 'the calm one next to it is left alone');
        assert.deepEqual([a.x, a.y], [11, 10], 'it heads for the fighter');
    });
});
