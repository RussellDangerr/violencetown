// boss-retry-ally.test.js — going down in a boss fight runs the boss retry, whoever
// lands the last blow (plans/fx27-boss-retry-any-blow.md).
//
// _resolveDefeat asked only who landed the blow, so dying to one of the Alien's
// allies, with the Alien standing in the fight, took half the bag. Now it asks
// whether a boss is in the fight (fight-area.js fighters).
//
// The fight is staged on the Factory's real map with the real Alien and one of his
// real allies, and a real world turn delivers the blow: main.js's own
// _advanceWorldOnce, applyDamageToPlayer, _die, _resolveDefeat and _runBossRetry,
// lifted out of the source, around the real resolveEnemyTurns.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { isBoss, bossInFight, pickScenario, partitionInventory, matchTake, DEFEAT_SCENARIOS } from '../game/defeat-scenarios.js';
import { ENTRIES, resolveSpawn, defaultPicks } from '../game/slots.js';
import { spawnEnemy, resolveEnemyTurns } from '../game/enemies.js';
import { fighters } from '../game/fight-area.js';
import { computeHit } from '../game/combat.js';
import { GameMap } from '../game/map.js';
import { SAFE_SLOTS } from '../game/data.js';

const GAME = new URL('../game/', import.meta.url);
const mainSrc = readFileSync(new URL('main.js', GAME), 'utf8');
const factory = JSON.parse(readFileSync(new URL('factory-map.json', GAME), 'utf8'));

// ── The pure helper ──────────────────────────────────────────────────────────

describe('bossInFight', () => {
    const boss = { boss: true }, ally = { type: 'Greedy Green' }, grunt = { type: 'Grunt' };
    test('the killer, when it is a boss', () => {
        assert.equal(bossInFight([ally, boss], boss), boss);
        assert.equal(bossInFight([], boss), boss);
    });
    test('else the first boss among the fighters', () => {
        assert.equal(bossInFight([ally, boss], ally), boss);
        assert.equal(bossInFight([grunt, { tag: 'wererat_boss' }], null).tag, 'wererat_boss');
    });
    test('else nobody', () => {
        assert.equal(bossInFight([ally, grunt], ally), null);
        assert.equal(bossInFight([], null), null);
        assert.equal(bossInFight(undefined, undefined), null);
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

const STATE = { IDLE: 'idle', DEAD: 'dead', RESOLVING: 'resolving' };
const audio = { playSfx() {} };
const item = (id) => ({ id, name: id, category: 'junk' });

const spawnFrom = (id) => {
    const sp = factory.enemies.find(e => e.id === id);
    return spawnEnemy(resolveSpawn(sp, defaultPicks()));
};

// The Factory, the player one tile east of the ally with a single hit point left.
// `enemies` are placed by the test; the player's bag holds spares past the safe zone.
function stage(enemies) {
    const timers = [];
    const g = {
        state: STATE.IDLE,
        map: new GameMap(factory, 'factory-map.json'),
        enemies,
        containers: [], groundItems: [],
        turn: 10, worldTick: 10, _MOVE_MS: 150,
        playerX: 7, playerY: 21, playerHp: 1, playerMaxHp: 100, playerMp: 0, playerMaxMp: 50,
        gold: 40, buffs: [], logs: [],
        inventory: Array.from({ length: SAFE_SLOTS + 4 }, (_, i) => (i < SAFE_SLOTS ? null : { itemDef: item(`spare_${i}`), count: 1 })),
        equipment: { weapon: null },
        rng: { float: () => 0.5, pick: (a) => a[0] },
        _heldDirKeys: [], _physicalHeld: new Set(),
        // The parts of a turn that are only drawing, sound, or the rest of the world.
        _stopAutoRepeat() {}, _flash() {}, _render() {}, _resumeHeldWalk() {}, _deAggroAll() {},
        autosave() {}, _skipTime() {}, _spawnStash() {},
        _routeWorldMessages() {}, _ensureParticleLoop() {}, _endCascadePhase() {},
        _spreadFireBlood() {}, _playerArmor: () => 0, hasBuff: () => false,
        _spawnHitSplat() {}, _triggerScreenShake() {}, _spawnEventWord() {},
        _handleEnemyDeath() {},
        _log(msg) { this.logs.push(msg); },
        addBuff(id) { this.buffs.push(id); },
        timers, struckBy: [],
    };
    const free = {
        STATE, audio, SAFE_SLOTS, isBoss, bossInFight, fighters, computeHit, resolveEnemyTurns,
        pickScenario, partitionInventory, matchTake, DEFEAT_SCENARIOS,
        performance, setTimeout: (fn) => timers.push(fn),
    };
    for (const sig of ['_advanceWorldOnce() {', 'applyDamageToPlayer(rawDamage, attacker = null) {', '_die() {',
        '_bossInFight() {', '_resolveDefeat() {', '_runBossRetry(boss) {', '_runScenario(pick, _ctx) {',
        '_resolveWakeCell(wakeAt) {', '_safeRespawnCell() {', '_applyTake(take) {']) {
        g[sig.slice(0, sig.indexOf('('))] = liveMethod(sig, free);
    }
    // Note who landed the blow at the moment the player went down.
    const die = g._die;
    g._die = function () { g.struckBy.push(g._lastDefeatedBy); return die.call(this); };
    return g;
}

// In the fight: hunting the player, facing him.
const hunting = (e, over = {}) => Object.assign(e, { state: 'chasing', _lastDx: 1, _lastDy: 0, facing: 'E' }, over);
const spares = (g) => g.inventory.filter(Boolean).length;
// One world turn, then the 500ms the game waits before it resolves the defeat.
function playOutTurn(g) {
    g._advanceWorldOnce();
    assert.equal(g.state, STATE.DEAD, 'the blow went in');
    g.timers.forEach((fn) => fn());
}

describe('going down in the Alien\'s fight', () => {
    test('his ally lands the blow: the boss retry runs and the bag is untouched', () => {
        const ally = hunting(spawnFrom('alien-ally-1'));
        const alien = hunting(spawnFrom('factory_boss'));
        alien.entity.hp = Math.round(alien.entity.maxHp * 0.6);        // you got some hits in
        const g = stage([ally, alien]);
        const before = spares(g);

        playOutTurn(g);

        assert.equal(g.struckBy[0], ally, 'the last blow was the ally\'s, not the Alien\'s');
        assert.equal(isBoss(ally), false);
        assert.equal(spares(g), before, 'nothing taken');
        assert.equal(g.gold, 40, 'no GP taken');
        assert.equal(alien.entity.hp, alien.entity.maxHp, 'the Alien is back to full');
        assert.equal(g.playerHp, g.playerMaxHp, 'you wake at full health');
        assert.equal(g.state, STATE.IDLE);
        assert.ok(g.logs.some(l => /Down but not out/.test(l)), 'the retry\'s line');
        assert.ok(!g.logs.some(l => /beaten and dumped|Taken:/.test(l)), 'not a defeat scenario');
    });

    test('the same ally with the Alien out of the fight: an ordinary defeat', () => {
        const ally = hunting(spawnFrom('alien-ally-1'));
        const alien = spawnFrom('factory_boss');                        // across the bay, not hunting
        assert.equal(alien.state === 'chasing', false);
        const g = stage([ally, alien]);
        const before = spares(g);

        playOutTurn(g);

        assert.equal(g.struckBy[0], ally);
        assert.ok(spares(g) < before, 'the defeat took something');
        assert.ok(!g.logs.some(l => /Down but not out/.test(l)), 'no retry');
        assert.equal(alien.entity.hp, alien.entity.maxHp);
    });

    test('the same ally with the Alien already dead: an ordinary defeat', () => {
        const ally = hunting(spawnFrom('alien-ally-1'));
        const alien = hunting(spawnFrom('factory_boss'));
        alien.entity.hp = 0;
        alien.entity.alive = false;
        assert.equal(alien.entity.isAlive(), false);
        const g = stage([ally, alien]);
        const before = spares(g);

        playOutTurn(g);

        assert.ok(spares(g) < before, 'the defeat took something');
        assert.ok(!g.logs.some(l => /Down but not out/.test(l)), 'no retry');
    });
});

describe('going down to an ordinary enemy, no boss in the fight', () => {
    test('an ordinary enemy lands the blow: the ordinary defeat, as today', () => {
        const grunt = hunting(spawnEnemy({ id: 'grunt', type: 'Grunt', x: 6, y: 21, hp: 30, damage: 9, allegiance: 'hostile' }));
        const g = stage([grunt]);
        const before = spares(g);

        playOutTurn(g);

        assert.equal(g.struckBy[0], grunt);
        assert.ok(spares(g) < before, 'the defeat took something');
        assert.ok(!g.logs.some(l => /Down but not out/.test(l)), 'no retry');
    });

    test('the Alien himself landing it is still the retry (the control)', () => {
        const alien = hunting(spawnFrom('factory_boss'), { x: 6, y: 21 });
        const g = stage([alien]);
        const before = spares(g);

        playOutTurn(g);

        assert.equal(g.struckBy[0], alien);
        assert.equal(spares(g), before);
        assert.ok(g.logs.some(l => /Down but not out/.test(l)));
    });
});

test('the Alien\'s entry is a boss and his ally is not (the fixture is what it says)', () => {
    assert.equal(isBoss(ENTRIES.alien_invasion), true);
    assert.equal(isBoss(ENTRIES.alien_ally), false);
});
