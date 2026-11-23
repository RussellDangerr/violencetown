// boss-retry-posts.test.js — a boss retry puts everyone in the fight back at their
// post (plans/pathing-round-corners.md).
//
// Chasers come round corners now, so after a fall in the sewer the Wererat and the
// Fungus King were standing beside the tile you wake on, and the retry killed you
// again as you woke. The fight is staged on the Sewer's real map with its real boss
// and King, through main.js's own _runBossRetry and _fightToPosts.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { sendToPosts } from '../game/npc.js';
import { fighters } from '../game/fight-area.js';
import { isHunting } from '../game/ai.js';
import { resolveSpawn, defaultPicks } from '../game/slots.js';
import { spawnEnemy } from '../game/enemies.js';
import { GameMap } from '../game/map.js';
import { chebyshev } from '../game/utils.js';

const GAME = new URL('../game/', import.meta.url);
const mainSrc = readFileSync(new URL('main.js', GAME), 'utf8');
const sewer = JSON.parse(readFileSync(new URL('sewer-map.json', GAME), 'utf8'));

const alive = { isAlive: () => true };
const npc = (id, x, y, homeX, homeY) => ({ id, x, y, homeX, homeY, state: 'chasing', entity: alive });

describe('sendToPosts', () => {
    test('back at the post, out of the hunt, with no glide', () => {
        const a = npc('a', 2, 2, 8, 8);
        a._slideStart = 123;
        sendToPosts({ enemies: [a], playerX: 0, playerY: 0 }, [a]);
        assert.deepEqual([a.x, a.y, a.state, a._slideStart], [8, 8, 'idle', null]);
    });

    test('a post someone else stands on stays taken', () => {
        const a = npc('a', 2, 2, 8, 8), squatter = npc('s', 8, 8, 8, 8);
        sendToPosts({ enemies: [a, squatter], playerX: 0, playerY: 0 }, [a]);
        assert.deepEqual([a.x, a.y], [2, 2]);
    });

    test('nor onto you', () => {
        const a = npc('a', 2, 2, 8, 8);
        sendToPosts({ enemies: [a], playerX: 8, playerY: 8 }, [a]);
        assert.deepEqual([a.x, a.y], [2, 2]);
    });

    test('one going home frees the post of another, whatever the order', () => {
        const a = npc('a', 1, 1, 5, 5), b = npc('b', 5, 5, 9, 9);
        sendToPosts({ enemies: [a, b], playerX: 0, playerY: 0 }, [a, b]);
        assert.deepEqual([a.x, a.y, b.x, b.y], [5, 5, 9, 9]);
    });

    test('the dead and the postless stay where they are', () => {
        const dead = { ...npc('d', 1, 1, 5, 5), entity: { isAlive: () => false } };
        const drifter = npc('w', 2, 2, null, null);
        sendToPosts({ enemies: [dead, drifter], playerX: 0, playerY: 0 }, [dead, drifter, null]);
        assert.deepEqual([dead.x, dead.y, drifter.x, drifter.y], [1, 1, 2, 2]);
    });
});

// ── End to end, through main.js's own methods ────────────────────────────────

function liveMethod(signature, freeVars = {}) {
    const at = mainSrc.indexOf(signature, mainSrc.indexOf('class Game {'));
    assert.ok(at > 0, `${signature} not found in main.js`);
    const body = mainSrc.slice(at + signature.indexOf('('), mainSrc.indexOf('\n    }', at) + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map((n) => freeVars[n]));
}

function stage({ withPosts }) {
    const map = new GameMap(structuredClone(sewer), 'sewer-map.json');
    const rat = spawnEnemy(resolveSpawn(sewer.enemies.find(e => e.slot === 'sewer.boss'), defaultPicks()));
    const king = spawnEnemy(structuredClone(sewer.enemies.find(e => e.type === 'Fungus King')));
    // They chased you round the corners to the door you came in by.
    rat.x = 3; rat.y = 10; rat.state = 'chasing';
    king.x = 3; king.y = 9; king.state = 'chasing';
    const g = {
        map, enemies: [rat, king], playerX: 3, playerY: 11,
        playerHp: 0, playerMaxHp: 100, playerMp: 0, playerMaxMp: 50, buffs: [],
        state: 'dead', _render() {}, _resumeHeldWalk() {}, autosave() {}, _log() {},
        _deAggroAll() { for (const e of this.enemies) if (isHunting(e)) e.state = 'idle'; },
    };
    const free = { STATE: { IDLE: 'idle' }, sendToPosts, fighters };
    g._runBossRetry = liveMethod('_runBossRetry(boss) {', free);
    g._safeRespawnCell = liveMethod('_safeRespawnCell() {', free);
    if (withPosts) g._fightToPosts = liveMethod('_fightToPosts(boss) {', free);
    return { g, rat, king };
}

describe('the Sewer boss retry', () => {
    test('the Wererat and the Fungus King are back at their posts, away from where you wake', () => {
        const { g, rat, king } = stage({ withPosts: true });
        g._runBossRetry(rat);
        assert.deepEqual([g.playerX, g.playerY], [sewer.spawn.x, sewer.spawn.y]);
        assert.deepEqual([rat.x, rat.y], [rat.homeX, rat.homeY]);
        assert.deepEqual([king.x, king.y], [king.homeX, king.homeY]);
        for (const e of [rat, king]) {
            assert.ok(chebyshev(e.x, e.y, g.playerX, g.playerY) > 8, `${e.id} is far from where you wake`);
            assert.equal(e.state, 'idle');
        }
    });

    test('the control: without the reset they stand at the door', () => {
        const { g, rat } = stage({ withPosts: false });
        g._runBossRetry(rat);
        assert.ok(chebyshev(rat.x, rat.y, g.playerX, g.playerY) <= 2);
    });
});
