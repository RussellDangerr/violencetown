// fight-join.test.js — hostiles who see a fight join it (plans/f3a-hostiles-join-fights.md).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fighters, joiners } from '../game/fight-area.js';
import { isFriendlyWith } from '../game/ai.js';

const alive = () => ({ isAlive: () => true });
const dead = () => ({ isAlive: () => false });
// A hostile with sight 8, facing south unless told otherwise.
const npc = (x, y, state = 'idle', over = {}) => ({
    x, y, state, allegiance: 'hostile', entity: alive(), sightRange: 8, _lastDx: 0, _lastDy: 1, ...over,
});
const openMap = () => ({ isWalkable: () => true });
function gridMap(rows) {
    const H = rows.length, W = rows[0].length;
    return { isWalkable: (x, y) => x >= 0 && y >= 0 && x < W && y < H && rows[y][x] !== '#' };
}
// The player well off to the east, out of everybody's sight unless a test moves them.
const FAR = { x: 40, y: 40 };

describe('isFriendlyWith', () => {
    test('every hostile is friendly with every other', () => {
        assert.equal(isFriendlyWith({ allegiance: 'hostile' }, { allegiance: 'hostile' }), true);
    });
    test('different dispositions are not', () => {
        assert.equal(isFriendlyWith({ allegiance: 'hostile' }, { allegiance: 'ally' }), false);
        assert.equal(isFriendlyWith({ allegiance: 'hostile' }, { allegiance: 'neutral' }), false);
    });
    test('nobody, or no allegiance at all, is friendly with nobody', () => {
        assert.equal(isFriendlyWith(null, { allegiance: 'hostile' }), false);
        assert.equal(isFriendlyWith({}, {}), false);
    });
});

describe('joiners', () => {
    test('a calm hostile who directly sees a fighter joins', () => {
        const fighter = npc(10, 14, 'chasing');
        const watcher = npc(10, 10);                       // facing south, at the fighter
        const js = joiners(openMap(), [fighter, watcher], fighters([fighter, watcher]), FAR);
        assert.deepEqual(js, [watcher]);
    });

    test('a calm hostile who directly sees the player joins', () => {
        const fighter = npc(30, 30, 'chasing');
        const watcher = npc(10, 10);
        const js = joiners(openMap(), [fighter, watcher], [fighter], { x: 10, y: 15 });
        assert.deepEqual(js, [watcher]);
    });

    test('suspicious and walking-home hostiles join too; it is "not hunting", not "idle"', () => {
        const fighter = npc(10, 14, 'chasing');
        for (const s of ['suspicious', 'returning', undefined]) {
            const watcher = npc(10, 10, s);
            assert.deepEqual(joiners(openMap(), [fighter, watcher], [fighter], FAR), [watcher], `${s} should join`);
        }
    });

    test('a hostile who sees nothing stays out', () => {
        const fighter = npc(10, 14, 'chasing');
        const watcher = npc(10, 10, 'idle', { _lastDx: 0, _lastDy: -1 });   // facing away, north
        const js = joiners(openMap(), [fighter, watcher], [fighter], FAR);
        assert.deepEqual(js, []);
        assert.equal(watcher.state, 'idle', 'joiners() only answers; it never changes anybody');
    });

    test('out of range is out of sight', () => {
        const fighter = npc(10, 19, 'chasing');            // 9 tiles south; sight is 8
        assert.deepEqual(joiners(openMap(), [fighter, npc(10, 10)], [fighter], FAR), []);
    });

    test('a wall between them hides the fight', () => {
        const rows = [];
        for (let y = 0; y < 20; y++) rows.push(y === 12 ? '#'.repeat(20) : '.'.repeat(20));
        const fighter = npc(10, 14, 'chasing');
        assert.deepEqual(joiners(gridMap(rows), [fighter, npc(10, 10)], [fighter], FAR), []);
    });

    test('direct view only: a fighter in the periphery does not pull anyone in', () => {
        const fighter = npc(13, 10, 'chasing');            // due east of a south-facing watcher, within ceil(8/2)
        assert.deepEqual(joiners(openMap(), [fighter, npc(10, 10)], [fighter], FAR), []);
    });

    test('the player in the periphery does not count either', () => {
        const fighter = npc(30, 30, 'chasing');
        assert.deepEqual(joiners(openMap(), [fighter, npc(10, 10)], [fighter], { x: 13, y: 10 }), []);
    });

    test('allies and neutrals who see the fight are untouched', () => {
        const fighter = npc(10, 14, 'chasing');
        const ally = npc(10, 10, 'idle', { allegiance: 'ally', _ally: true });
        const neutral = npc(11, 10, 'idle', { allegiance: 'neutral' });
        assert.deepEqual(joiners(openMap(), [fighter, ally, neutral], [fighter], { x: 10, y: 13 }), []);
    });

    test('a hostile only gangs up with a fighter it is friendly with', () => {
        // A provoked neutral hunting you is a fighter, but a hostile does not side with it.
        const fighter = npc(10, 14, 'chasing', { allegiance: 'neutral' });
        assert.deepEqual(joiners(openMap(), [fighter, npc(10, 10)], [fighter], FAR), []);
    });

    test('the dead, the ambient and the eyeless never join', () => {
        const fighter = npc(10, 14, 'chasing');
        for (const over of [{ entity: dead() }, { ambient: true }, { sightRange: 0 }]) {
            assert.deepEqual(joiners(openMap(), [fighter, npc(10, 10, 'idle', over)], [fighter], FAR), [], JSON.stringify(Object.keys(over)));
        }
    });

    test('somebody already hunting is not a joiner', () => {
        const fighter = npc(10, 14, 'chasing');
        const searcher = npc(10, 10, 'searching');
        assert.deepEqual(joiners(openMap(), [fighter, searcher], [fighter], FAR), []);
    });

    test('no fight, nobody joins, even a hostile looking straight at you', () => {
        assert.deepEqual(joiners(openMap(), [npc(10, 10)], [], { x: 10, y: 12 }), []);
        assert.deepEqual(joiners(openMap(), undefined, undefined, FAR), []);
    });

    test('one pass: a joiner pulls the next one in on the following beat, not this one', () => {
        const fighter = npc(10, 20, 'chasing');
        const first = npc(10, 15);                         // sees the fighter, 5 tiles south
        const second = npc(10, 10);                        // sees the first, not the fighter (10 away)
        const all = [fighter, first, second];
        assert.deepEqual(joiners(openMap(), all, fighters(all), FAR), [first]);
        first.state = 'chasing';
        assert.deepEqual(joiners(openMap(), all, fighters(all), FAR), [second]);
    });
});

// ── main.js: the live step, run against a stand-in game ──────────────────────

const mainSrc = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
function liveMethod(signature, freeVars) {
    const at = mainSrc.indexOf(signature, mainSrc.indexOf('class Game {'));
    assert.ok(at > 0, `${signature} not found in main.js`);
    const body = mainSrc.slice(at + signature.indexOf('('), mainSrc.indexOf('\n    }', at) + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
}
const joinFight = liveMethod('    _joinFight(', { fighters, joiners });

function standIn(enemies, player = FAR) {
    const g = { map: openMap(), enemies, playerX: player.x, playerY: player.y, logs: [] };
    g._log = (text, cat) => g.logs.push([text, cat]);
    g.join = joinFight.bind(g);
    return g;
}

describe('_joinFight', () => {
    test('a joiner starts chasing that turn, marked on the player, with a [TEXT] line', () => {
        const fighter = npc(10, 14, 'chasing');
        const watcher = npc(10, 10, 'suspicious', { _awareBeats: 1, _sweepBeats: 3, _lostSightTurns: 2, _struckBy: { x: 1, y: 1 } });
        const g = standIn([fighter, watcher]);
        g.join();
        assert.equal(watcher.state, 'chasing');
        assert.deepEqual([watcher._lastSeenX, watcher._lastSeenY], [FAR.x, FAR.y]);
        assert.deepEqual([watcher._awareBeats, watcher._sweepBeats, watcher._lostSightTurns, watcher._struckBy], [0, 0, 0, null]);
        assert.deepEqual(g.logs, [['[TEXT]', 'combat']]);
        assert.equal(fighters(g.enemies).length, 2, 'it is in the fight now');
    });

    test('nothing seen, nothing changes, nothing logged', () => {
        const fighter = npc(10, 14, 'chasing');
        const watcher = npc(10, 10, 'idle', { _lastDx: 0, _lastDy: -1 });
        const g = standIn([fighter, watcher]);
        g.join();
        assert.equal(watcher.state, 'idle');
        assert.equal(watcher._lastSeenX, undefined);
        assert.deepEqual(g.logs, []);
    });

    test('allies and neutrals keep their state', () => {
        const fighter = npc(10, 14, 'chasing');
        const ally = npc(10, 10, 'idle', { allegiance: 'ally', _ally: true });
        const neutral = npc(11, 10, 'idle', { allegiance: 'neutral' });
        const g = standIn([fighter, ally, neutral], { x: 10, y: 13 });
        g.join();
        assert.equal(ally.state, 'idle');
        assert.equal(neutral.state, 'idle');
        assert.deepEqual(g.logs, []);
    });

    test('out of a fight it does nothing', () => {
        const watcher = npc(10, 10);
        const g = standIn([watcher], { x: 10, y: 12 });
        g.join();
        assert.equal(watcher.state, 'idle');
        assert.deepEqual(g.logs, []);
    });

    test('it runs on the world beat, after the enemies act, and never from a frame', () => {
        const methodBody = (sig) => {
            const at = mainSrc.indexOf(sig, mainSrc.indexOf('class Game {'));
            assert.ok(at > 0, `${sig} not found`);
            return mainSrc.slice(at, mainSrc.indexOf('\n    }', at));
        };
        const beat = methodBody('    _advanceWorldOnce(');
        const turns = beat.indexOf('resolveEnemyTurns(this)');
        const join = beat.indexOf('this._joinFight()');
        assert.ok(turns > 0 && join > turns, '_joinFight follows the enemy turns');
        assert.ok(!methodBody('    _render(').includes('_joinFight'), 'not from _render');
        assert.ok(!methodBody('    _trackFight(').includes('_joinFight'), 'not from _trackFight');
    });
});
