// act2-boss-retry.test.js — losing to an Act 2 boss runs the boss retry, as
// losing to the Were-Rat does (plans/fx2-act2-boss-retry.md).
//
// isBoss read only a `*_boss` tag; the Act 2 stand-ins (placeholderBoss() in
// slots.js) carry `boss: true` and no tag, so a defeat fell through to the
// generic scenario and took half the bag for good. The end-to-end half runs
// main.js's own _die / _resolveDefeat / _runBossRetry / _runScenario, lifted
// out of the source, against a real spawned boss.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { isBoss, pickScenario, partitionInventory, matchTake, DEFEAT_SCENARIOS } from '../game/defeat-scenarios.js';
import { ENTRIES, resolveSpawn, defaultPicks } from '../game/slots.js';
import { spawnEnemy } from '../game/enemies.js';
import { SAFE_SLOTS } from '../game/data.js';

const GAME = new URL('../game/', import.meta.url);
const mainSrc = readFileSync(new URL('main.js', GAME), 'utf8');
const mapData = (file) => JSON.parse(readFileSync(new URL(file, GAME), 'utf8'));

const ACT2 = [
    { slot: 'carnival.boss',  map: 'carnival-map.json' },
    { slot: 'factory.boss',   map: 'factory-map.json' },
    { slot: 'graveyard.boss', map: 'graveyard-map.json' },
];

describe('isBoss', () => {
    test('a *_boss tag is a boss', () => {
        assert.equal(isBoss({ tag: 'wererat_boss' }), true);
    });
    test('the boss flag is a boss, with no tag at all', () => {
        assert.equal(isBoss({ boss: true }), true);
        assert.equal(isBoss({ boss: true, tag: null }), true);
    });
    test('an ordinary enemy, a {cause} and nothing are not', () => {
        assert.equal(isBoss({ type: 'Wererat', tag: null, boss: false }), false);
        assert.equal(isBoss({ cause: 'sludge' }), false);
        assert.equal(isBoss({}), false);
        assert.equal(isBoss(null), false);
        assert.equal(isBoss(undefined), false);
    });
    test('the Were-Rat entry and every spawned Act 2 boss are bosses', () => {
        assert.equal(isBoss(ENTRIES.wererat), true);
        for (const z of ACT2) {
            const sp = mapData(z.map).enemies.find(e => e.slot === z.slot);
            const enemy = spawnEnemy(resolveSpawn(sp, defaultPicks()));
            assert.equal(enemy.tag ?? null, null, `${z.slot} carries no tag, so only the flag can say boss`);
            assert.equal(isBoss(enemy), true, `${z.slot}'s boss`);
        }
    });
});

// ── End to end, through main.js's own handler ─────────────────────────────────

function liveMethod(signature, freeVars = {}) {
    const at = mainSrc.indexOf(signature, mainSrc.indexOf('class Game {'));
    assert.ok(at > 0, `${signature} not found in main.js`);
    const body = mainSrc.slice(at + signature.indexOf('('), mainSrc.indexOf('\n    }', at) + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map((n) => freeVars[n]));
}

const STATE = { IDLE: 'idle', DEAD: 'dead' };
const audio = { playSfx() {} };
const BUFF_DEFS = { rattled: { name: 'Rattled' } };
const item = (id) => ({ id, name: id, category: 'junk' });

function stage(mapFile) {
    const timers = [];
    const g = {
        state: STATE.IDLE,
        map: {
            url: mapFile, zoneName: mapFile.replace('-map.json', ''),
            spawn: { x: 3, y: 3 }, width: 10, height: 10,
            isInBounds: () => true, isWalkable: () => true, getTileDef: () => ({}),
        },
        playerX: 7, playerY: 7, playerHp: 0, playerMaxHp: 100, playerMp: 0, playerMaxMp: 50,
        gold: 40, buffs: [], logs: [],
        // Every slot past the safe zone holds a spare, so a scenario that robs has
        // something to take.
        inventory: Array.from({ length: SAFE_SLOTS + 4 }, (_, i) => (i < SAFE_SLOTS ? null : { itemDef: item(`spare_${i}`), count: 1 })),
        equipment: { weapon: null },
        rng: { float: () => 0 },
        _heldDirKeys: [], _physicalHeld: new Set(),
        _stopAutoRepeat() {}, _flash() {}, _render() {}, _resumeHeldWalk() {}, _deAggroAll() {},
        autosave() {}, _skipTime() {}, _spawnStash() {},
        _log(msg) { this.logs.push(msg); },
        addBuff(id) { this.buffs.push(id); },
        timers,
    };
    const free = { STATE, audio, BUFF_DEFS, SAFE_SLOTS, isBoss, pickScenario, partitionInventory, matchTake, DEFEAT_SCENARIOS, setTimeout: (fn) => timers.push(fn) };
    for (const sig of ['_die() {', '_resolveDefeat() {', '_runBossRetry(boss) {', '_runScenario(pick, _ctx) {', '_resolveWakeCell(wakeAt) {', '_safeRespawnCell() {', '_applyTake(take) {']) {
        g[sig.slice(0, sig.indexOf('('))] = liveMethod(sig, free);
    }
    return g;
}

const spares = (g) => g.inventory.filter(Boolean).length;

describe('losing to an Act 2 boss runs the boss retry', () => {
    for (const z of ACT2) {
        test(`${z.slot}: the bag is untouched and the boss refills`, () => {
            const sp = mapData(z.map).enemies.find(e => e.slot === z.slot);
            const boss = spawnEnemy(resolveSpawn(sp, defaultPicks()));
            boss.entity.hp = Math.round(boss.entity.maxHp * 0.85);   // you got some hits in
            const g = stage(z.map);
            const before = spares(g);
            g._lastDefeatedBy = boss;                                 // its blow was the last
            g._die();
            assert.equal(g.state, STATE.DEAD);
            assert.equal(g.timers.length, 1);
            g.timers.forEach((fn) => fn());
            assert.equal(spares(g), before, 'nothing taken');
            assert.equal(boss.entity.hp, boss.entity.maxHp, 'the boss is back to full');
            assert.equal(g.playerHp, g.playerMaxHp, 'you wake at full health');
            assert.equal(g.state, STATE.IDLE);
            assert.ok(g.buffs.includes('rattled'));
            assert.ok(!g.logs.some(l => /beaten and dumped/.test(l)), 'not the generic scenario');
        });
    }

    test('an ordinary enemy still runs a defeat scenario (the control)', () => {
        const grunt = spawnEnemy({ id: 'grunt', type: 'Grunt', x: 1, y: 1, hp: 30 });
        assert.equal(isBoss(grunt), false);
        const g = stage('factory-map.json');
        const before = spares(g);
        g._lastDefeatedBy = grunt;
        g._die();
        g.timers.forEach((fn) => fn());
        assert.ok(g.logs.some(l => /beaten and dumped/.test(l)), 'the generic scenario ran');
        assert.ok(spares(g) < before, 'it took something');
    });
});
