// employer-defeat.test.js — losing to the Borgir boss is an ordinary defeat; only the
// story's bosses give the retry (plans/em1-borgir-ordinary-defeat.md, ruling EMR1 a).
//
// The retry used to ask for the boss flag or a `*_boss` tag. The Borgir boss has the flag
// and Pike has a `pike_boss` tag; neither fills a spine boss slot. A real world turn
// delivers every blow: main.js's own _advanceWorldOnce, applyDamageToPlayer, _die,
// _resolveDefeat, _runBossRetry and _runScenario, lifted out of the source, around the
// real resolveEnemyTurns, on each fight's real map and real spawn.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { isBoss, isStoryBoss, storyBossInFight, pickScenario, partitionInventory, matchTake, DEFEAT_SCENARIOS } from '../game/defeat-scenarios.js';
import { fillsBossSlot, resolveSpawn, defaultPicks } from '../game/slots.js';
import { spawnEnemy, resolveEnemyTurns } from '../game/enemies.js';
import { fighters } from '../game/fight-area.js';
import { computeHit, critOf } from '../game/combat.js';
import { GameMap } from '../game/map.js';
import { SAFE_SLOTS } from '../game/data.js';

const GAME = new URL('../game/', import.meta.url);
const mainSrc = readFileSync(new URL('main.js', GAME), 'utf8');
const mapJson = (file) => JSON.parse(readFileSync(new URL(file, GAME), 'utf8'));

function liveMethod(signature, freeVars = {}) {
    const at = mainSrc.indexOf(signature, mainSrc.indexOf('class Game {'));
    assert.ok(at > 0, `${signature} not found in main.js`);
    const body = mainSrc.slice(at + signature.indexOf('('), mainSrc.indexOf('\n    }', at) + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map((n) => freeVars[n]));
}

const STATE = { IDLE: 'idle', DEAD: 'dead', RESOLVING: 'resolving' };
const audio = { playSfx() {} };
const item = (id) => ({ id, name: id, category: 'junk' });

const spawnFrom = (mapData, id) => spawnEnemy(resolveSpawn(mapData.enemies.find(e => e.id === id), defaultPicks()));

// A fight on `file`'s real map: the player stands at (px, py) with one hit point left.
// The defeat code reads `isBoss` / `bossInFight`; main.js points those at the story versions.
function stage(file, enemies, px, py) {
    const timers = [];
    const g = {
        state: STATE.IDLE,
        map: new GameMap(mapJson(file), file),
        enemies,
        containers: [], groundItems: [],
        turn: 10, worldTick: 10, _MOVE_MS: 150,
        playerX: px, playerY: py, playerHp: 1, playerMaxHp: 100, playerMp: 0, playerMaxMp: 50,
        gold: 40, buffs: [], logs: [],
        inventory: Array.from({ length: SAFE_SLOTS + 4 }, (_, i) => (i < SAFE_SLOTS ? null : { itemDef: item(`spare_${i}`), count: 1 })),
        equipment: { weapon: null },
        rng: { float: () => 0.5, pick: (a) => a[0] },
        _heldDirKeys: [], _physicalHeld: new Set(),
        _stopAutoRepeat() {}, _flash() {}, _render() {}, _resumeHeldWalk() {}, _deAggroAll() {},
        autosave() {}, _skipTime() {}, _spawnStash() {},
        _routeWorldMessages() {}, _ensureParticleLoop() {}, _endCascadePhase() {},
        _spreadFireBlood() {}, _playerArmor: () => 0, hasBuff: () => false,
        _spawnHitSplat() {}, _triggerScreenShake() {}, _spawnEventWord() {},
        _handleEnemyDeath() {}, _joinFight() {}, _inCombat() { return false; }, _worldBeat() {}, _tickJammedDoor() {}, _cascadeMark() {}, _captureFollowers() {}, _checkRingUnlocks() {}, _tickBuffs() {},
        _log(msg) { this.logs.push(msg); },
        addBuff(id) { this.buffs.push(id); },
        timers, struckBy: [],
    };
    const free = {
        STATE, audio, SAFE_SLOTS, isBoss: isStoryBoss, bossInFight: storyBossInFight, fighters, computeHit, resolveEnemyTurns,
        pickScenario, partitionInventory, matchTake, DEFEAT_SCENARIOS,
        tickTempEquips: () => [], MP_REGEN: 2, performance, setTimeout: (fn) => timers.push(fn),
    };
    for (const sig of ['_advanceWorldOnce() {', 'applyDamageToPlayer(rawDamage, attacker = null) {', '_die() {',
        '_bossInFight() {', '_resolveDefeat() {', '_runBossRetry(boss) {', '_runScenario(pick, _ctx) {',
        '_resolveWakeCell(wakeAt) {', '_safeRespawnCell() {', '_applyTake(take) {']) {
        g[sig.slice(0, sig.indexOf('('))] = liveMethod(sig, free);
    }
    const die = g._die;
    g._die = function () { g.struckBy.push(g._lastDefeatedBy); return die.call(this); };
    return g;
}

const hunting = (e, over = {}) => Object.assign(e, { state: 'chasing', _lastDx: 1, _lastDy: 0, facing: 'E', allegiance: 'hostile' }, over);
const spares = (g) => g.inventory.filter(Boolean).length;
function playOutTurn(g) {
    // A boss may spend his first turns dressing from his kit; the blow comes within a few.
    for (let i = 0; i < 6 && g.state !== STATE.DEAD; i++) { g.playerHp = 1; g._advanceWorldOnce(); }
    assert.equal(g.state, STATE.DEAD, 'the blow went in');
    g.timers.forEach((fn) => fn());
}
const retried = (g) => g.logs.some(l => /Down but not out/.test(l));

const borgir = mapJson('borgir-map.json');
const canyon = mapJson('canyon-map.json');
const factory = mapJson('factory-map.json');
const sewer = mapJson('sewer-map.json');

describe('who is a story boss', () => {
    test('the Borgir boss has the flag and no slot: not a story boss, still a boss for his name', () => {
        const e = spawnFrom(borgir, 'borgir_boss');
        assert.equal(isBoss(e), true);
        assert.equal(e.boss, true);
        assert.equal(fillsBossSlot(e), false);
        assert.equal(isStoryBoss(e), false);
    });
    test('Pike carries pike_boss and fills no boss slot', () => {
        const e = spawnFrom(canyon, 'pike');
        assert.equal(e.tag, 'pike_boss');
        assert.equal(isStoryBoss(e), false);
    });
    test('the Were-Rat and the Act 2 bosses fill boss slots', () => {
        for (const [m, file] of [[sewer, 'sewer'], [factory, 'factory'], [mapJson('carnival-map.json'), 'carnival'], [mapJson('graveyard-map.json'), 'graveyard']]) {
            const sp = m.enemies.find(e => /\.boss$/.test(e.slot || ''));
            assert.ok(sp, `${file} has a boss spawn`);
            const e = spawnEnemy(resolveSpawn(sp, defaultPicks()));
            assert.equal(isStoryBoss(e), true, `${file}'s boss`);
        }
    });
    test('a bare boss flag or a stray _boss tag is not enough', () => {
        assert.equal(isStoryBoss({ boss: true }), false);
        assert.equal(isStoryBoss({ tag: 'borgir_boss' }), false);
        assert.equal(isStoryBoss(null), false);
        assert.equal(storyBossInFight([{ boss: true }, { tag: 'pike_boss' }], null), null);
    });
});

describe('a real world turn delivers the blow', () => {
    test('the Borgir boss: an ordinary defeat, and the cost line says what it took', () => {
        const boss = hunting(spawnFrom(borgir, 'borgir_boss'), { x: 8, y: 4 });
        const g = stage('borgir-map.json', [boss], 9, 4);
        const before = spares(g);
        playOutTurn(g);
        assert.equal(g.struckBy[0], boss, 'the boss landed it');
        assert.equal(retried(g), false, 'no retry');
        assert.ok(spares(g) < before, 'the defeat took something');
        assert.ok(g.logs.some(l => /^\[Taken: .+\. GP taken: \d+\.\]$/.test(l)), `a cost line: ${JSON.stringify(g.logs)}`);
        assert.equal(boss.entity.hp, boss.entity.maxHp);
    });

    test('Pike: an ordinary defeat as well', () => {
        const pike = hunting(spawnFrom(canyon, 'pike'), { x: 5, y: 12 });
        const g = stage('canyon-map.json', [pike], 6, 12);
        const before = spares(g);
        playOutTurn(g);
        assert.equal(g.struckBy[0], pike);
        assert.equal(retried(g), false);
        assert.ok(spares(g) < before);
        assert.ok(g.logs.some(l => /Taken:|Nothing was taken/.test(l)));
    });

    test('the Alien (an Act 2 boss): the retry, as today', () => {
        const alien = hunting(spawnFrom(factory, 'factory_boss'), { x: 6, y: 21 });
        const g = stage('factory-map.json', [alien], 7, 21);
        const before = spares(g);
        playOutTurn(g);
        assert.equal(g.struckBy[0], alien);
        assert.equal(retried(g), true);
        assert.equal(spares(g), before);
    });

    test('the Were-Rat: the retry, as today', () => {
        const rat = hunting(spawnFrom(sewer, 'wererat'), { x: 17, y: 10 });
        const g = stage('sewer-map.json', [rat], 18, 10);
        const before = spares(g);
        playOutTurn(g);
        assert.equal(g.struckBy[0], rat);
        assert.equal(retried(g), true);
        assert.equal(spares(g), before);
    });
});

test('main.js hands the defeat code the story versions, and combat keeps the flag-or-tag isBoss', () => {
    assert.match(mainSrc, /import \{[^}]*\bisBoss\b[^}]*\bisStoryBoss\b[^}]*\bstoryBossInFight as bossInFight\b[^}]*\} from '\.\/defeat-scenarios\.js'/);
    // the retry decision asks the story question
    assert.match(mainSrc, /const boss = isStoryBoss\(by\) \? by/);
    // the three-kind knockout spare (EL2) still asks the flag-or-tag question, so Pike stays unknockable
    assert.match(mainSrc, /critOf\(kinds, \{ boss: enemyObj\.boss === true \|\| isBoss\(enemyObj\) \}\)/);
    assert.equal(isBoss({ tag: 'pike_boss' }), true);
    assert.equal(isStoryBoss({ tag: 'pike_boss' }), false);
    assert.deepEqual(critOf(['a', 'b', 'c'], { boss: isBoss({ tag: 'pike_boss' }) }).knockout, false);
});
