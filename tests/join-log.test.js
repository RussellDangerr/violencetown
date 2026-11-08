// join-log.test.js — a crowd joining a fight writes one log line, not one each (fx17).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fighters, joiners } from '../game/fight-area.js';

const npc = (x, y, state = 'idle', over = {}) => ({
    x, y, state, allegiance: 'hostile', entity: { isAlive: () => true }, sightRange: 8, _lastDx: 0, _lastDy: 1, ...over,
});

const mainSrc = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
function liveMethod(signature, freeVars) {
    const at = mainSrc.indexOf(signature, mainSrc.indexOf('class Game {'));
    assert.ok(at > 0, `${signature} not found in main.js`);
    const body = mainSrc.slice(at + signature.indexOf('('), mainSrc.indexOf('\n    }', at) + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
}
const joinFight = liveMethod('    _joinFight(', { fighters, joiners });

function standIn(enemies) {
    const g = { map: { isWalkable: () => true }, enemies, playerX: 40, playerY: 40, logs: [] };
    g._log = (text, cat) => g.logs.push([text, cat]);
    g.join = joinFight.bind(g);
    return g;
}

describe('_joinFight log', () => {
    test('several hostiles joining in one beat write exactly one join line', () => {
        const fighter = npc(10, 14, 'chasing');
        const watchers = [npc(10, 10), npc(9, 10), npc(11, 10), npc(10, 9)];
        const g = standIn([fighter, ...watchers]);
        g.join();
        assert.ok(watchers.every(w => w.state === 'chasing'), 'every one of them joined');
        assert.equal(g.logs.length, 1);
        assert.equal(g.logs[0][1], 'combat');
    });

    test('a single joiner still writes one line, and the same one', () => {
        const solo = standIn([npc(10, 14, 'chasing'), npc(10, 10)]);
        solo.join();
        const crowd = standIn([npc(10, 14, 'chasing'), npc(10, 10), npc(9, 10)]);
        crowd.join();
        assert.equal(solo.logs.length, 1);
        assert.deepEqual(crowd.logs, solo.logs);
    });

    test('nobody joining writes no line', () => {
        const g = standIn([npc(10, 14, 'chasing'), npc(10, 10, 'idle', { _lastDx: 0, _lastDy: -1 })]);
        g.join();
        assert.deepEqual(g.logs, []);
    });

    test('a second beat with new joiners writes its own line', () => {
        const fighter = npc(10, 20, 'chasing');
        const first = npc(10, 15);
        const second = npc(10, 10);
        const g = standIn([fighter, first, second]);
        g.join();
        g.join();
        assert.equal(g.logs.length, 2, 'one per beat');
        g.join();
        assert.equal(g.logs.length, 2, 'a beat with no new joiners adds none');
    });
});
