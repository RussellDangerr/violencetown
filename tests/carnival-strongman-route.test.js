// carnival-strongman-route.test.js — ST2: the strongman helps you win the contest (plans/st2-strongman-wins-contest.md).
//
// The real main.js methods are lifted out of the source and bound onto a small game object, as in
// examine-bare-floor.test.js. The walk and every E are real keydowns through the listener _bindInput
// registers. The boss's fall is the real _handleEnemyDeath run on the slot's real boss (the fight
// itself is not keyed here: the boss's hp is set to 0, as act2-quests-live.test.js does).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GameMap, carriesAll } from '../game/map.js';
import { applyGive } from '../game/give-action.js';
import { fighters } from '../game/fight-area.js';
import { allyAids, isHostile } from '../game/ai.js';
import { perceives, VERDICT } from '../game/perception.js';
import { computeHit, attack } from '../game/combat.js';
import { getGreedyStep, stepEntity } from '../game/pathing.js';
import { manhattan } from '../game/utils.js';
import { QuestEngine, ACT2_QUESTS } from '../game/quests.js';
import { getDialogue } from '../game/dialogue.js';
import { defaultVerb } from '../game/wheel-model.js';
import { doExamine, resolveExamine } from '../game/examine.js';
import { findPath } from '../game/pathing.js';
import { spawnEnemy } from '../game/enemies.js';
import { resolveSpawn, defaultPicks, requiredDropFor, dropLineFor } from '../game/slots.js';
import { deadIds, pendingDrops, recordDrop, takeDrop, recordKill, stepRespawns, bossDropOnce, dropLoadout } from '../game/drops.js';
import { transferGold } from '../game/trade.js';
import { ITEMS } from '../game/items.js';
import { addToInventory as addToInv } from '../game/inventory.js';
import { INVENTORY_SIZE, SAFE_SLOTS, PACK_PAGE, MAX_STACK } from '../game/data.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');
const MAP_URL = 'carnival-map.json';
const mapJson = JSON.parse(readFileSync(fileURLToPath(new URL(`../game/${MAP_URL}`, import.meta.url)), 'utf8'));
const Q = ACT2_QUESTS.CARNIVAL;
const ITEM = 'act2_item_a';

function liveMethod(name, params, freeVars = {}) {
    const signature = `${name}(${params}) {`;
    const at = mainSrc.indexOf(signature);
    assert.ok(at > 0, `${name}(${params}) not found in main.js`);
    const closeAt = mainSrc.indexOf('\n    }', at);
    assert.ok(closeAt > at, `${name} body never closes`);
    const body = mainSrc.slice(at + name.length, closeAt + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
}
function liveConst(name) {
    const m = new RegExp(`\\nconst ${name}\\s*=\\s*`).exec(mainSrc);
    assert.ok(m, `const ${name} not found in main.js`);
    const from = m.index + m[0].length;
    const end = mainSrc.indexOf('\n};', from);
    return new Function(`'use strict'; return ${mainSrc.slice(from, end + 2)}`)();
}
const STATE = liveConst('STATE');
const DIRS = liveConst('DIRS');
const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
const audio = { playSfx() {}, playMusic() {} };

class Key extends Event {
    constructor(type, code) {
        super(type, { bubbles: true, cancelable: true });
        this.code = code; this.key = code; this.repeat = false;
        this.ctrlKey = false; this.metaKey = false; this.altKey = false; this.shiftKey = false;
    }
}
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r)); };

// A game in the Carnival. `save` (a reload) hands back the quest, bag and boss state of an earlier game.
function makeGame(save = null) {
    const document = new EventTarget();
    const window = new EventTarget();
    const map = new GameMap(mapJson, MAP_URL);
    map.zoneName = 'CARNIVAL';
    const g = {
        state: STATE.IDLE, facing: 'right', map, _mapUrl: MAP_URL,
        playerX: 44, playerY: 11, slots: defaultPicks(),
        inventory: new Array(INVENTORY_SIZE).fill(null), enemies: [], containers: [], groundItems: [], bursts: [],
        examinables: map.examinableSpawns.map(e => ({ ...e })),
        _tileDiffs: [], _heldDirKeys: [], _physicalHeld: new Set(), _queuedMoveDir: null,
        _animating: false, _animDuration: 1, _TURN_MS: 70, _turnTimer: null, _paused: false,
        _pendingTransition: null, _ratFormTurns: 0, _sewerEscape: null, turn: 0, gold: 0,
        _collectedItems: new Set(), _droppedItems: {}, _muggedIds: new Set(), _robbed: {},
        _respawnLists: {}, _bossDropsGiven: new Set(),
        logs: [], panels: [],
        _log(m) { this.logs.push(m); },
        _render() {}, _onStepSettled() {}, _tryPickup() {}, _stopAutoRepeat() {}, _advanceWorld() {},
        _openInspect(d) { this.panels.push(d); },
        _resumeHeldWalk() {}, _digitToSlot: () => -1, renderer: { dropFightFog() {} },
        hasBuff() { return false; },
        _spawnHitSplat() {}, _ensureParticleLoop() {}, _spreadFireBlood() {},
        _flash() {}, _triggerScreenShake() {}, _zoneChange() {}, _saveMoment() {}, _spawnEventWord() {},
        _MOVE_MS: 0, _pathQueue: [], _pathArrive: null, _stepIndex: 0, _hasteCharges: 0, _slowCharges: 0, buffs: [], ringMods: {}, equipment: {}, _hot: {},
        _startLootBurst() {}, _resolveItemDef: (id) => ITEMS[id] || null,
        emitGameEvent(type, payload) { this.questEngine.emit(type, payload); },
    };
    const free = {
        STATE, DIRS, audio, carriesAll, document, window, defaultVerb, doExamine, resolveExamine, findPath, getDialogue,
        resolveSpawn, isHostile, fighters, allyAids, perceives, VERDICT, manhattan, cheb, computeHit, attack, getGreedyStep, stepEntity, deadIds, pendingDrops, recordDrop, takeDrop, recordKill, stepRespawns, bossDropOnce, dropLoadout,
        transferGold, requiredDropFor, dropLineFor, ITEMS, onSewerEnemyKilled() {},
        addToInv, SAFE_SLOTS, PACK_PAGE, MAX_STACK, spawnEnemy,
        requestAnimationFrame: (f) => queueMicrotask(() => f(Infinity)),
        performance: { now: () => 0 }, setTimeout: () => 0,
    };
    for (const [n, p] of [
        ['_bindInput', ''], ['_noteHeld', 'code'], ['_faceOf', 'dir'], ['_clearTurnTimer', ''],
        ['_beginMoveOrTurn', 'dir'], ['_intendedWalkDir', ''], ['_resolveWalkStep', 'dir'],
        ['_canEnter', 'x, y'], ['_doMove', 'dir'], ['_animateMove', 'fromX, fromY, toX, toY, callback, duration = this._animDuration'], ['_targetAt', 'x, y'], ['_actOnTarget', 'verb, t'], ['_fireResolver', 'verb, t'],
        ['_handleEnemyDeath', 'enemyObj'], ['_takeKillLoot', 'drops, enemyObj'], ['_addToInventory', 'itemDef'],
        ['_allyTakeTurn', 'ally'], ['_isHostileToPlayer', 'e'], ['_rememberKill', 'enemyObj'], ['_bossFirstFall', 'enemyObj, required'], ['_recordDrop', 'type, x, y'], ['_grantItem', 'id, msg'],
    ]) g[n] = liveMethod(n, p, free);
    g.questEngine = new QuestEngine(g);
    if (save) {
        g.questEngine.restore(JSON.parse(JSON.stringify(save.quest)));
        g.inventory = JSON.parse(JSON.stringify(save.bag)).map(s => s && { ...s, itemDef: ITEMS[s.itemDef.id] });
    }
    const spawn = mapJson.enemies.find(e => e.slot === Q.slot);
    g.boss = spawnEnemy(resolveSpawn(spawn, defaultPicks()));
    if (save?.bossDead) { g.boss.entity.hp = 0; g.boss.entity.alive = false; }
    const sm = mapJson.enemies.find(e => e.id === 'strongman');
    g.strongman = spawnEnemy(resolveSpawn(sm, defaultPicks()));
    g.enemies = [g.boss, g.strongman];
    g._bindInput();
    g.press = async (code) => {
        document.dispatchEvent(new Key('keydown', code));
        document.dispatchEvent(new Key('keyup', code));
        await settle();
    };
    g.save = () => ({ quest: g.questEngine.serialize(), bag: g.inventory, bossDead: !g.boss.entity.isAlive() });
    g.held = () => g.inventory.filter(Boolean).filter(s => s.itemDef.id === ITEM).reduce((n, s) => n + (s.count ?? 1), 0);
    return g;
}

// Walk (real arrow keys) from the start to the tile beside the booth, facing it.
async function walkToBooth(g) {
    for (let i = 0; i < 5; i++) await g.press('ArrowRight');
    assert.deepEqual([g.playerX, g.playerY], [49, 11], `beside the booth (${g.logs.join(' | ')})`);
    assert.equal(g.facing, 'right');
}
function beatTheGuard(g) {
    g.boss.entity.hp = 0; g.boss.entity.alive = false;
    g._handleEnemyDeath(g.boss);
}

// Gifts through the real give rules until he turns.
function winHimOver(g) {
    const s = g.strongman;
    let gifts = 0;
    while (!s._ally && gifts < 30) { applyGive(ITEMS.bandage, s); gifts++; }
    return gifts;
}

// The ally's own turns (the real _allyTakeTurn) until the boss falls, at most `max` of them.
function allyFightsBoss(g, max = 60) {
    g.boss.state = 'chasing';
    g.boss.x = 48; g.boss.y = 12;
    g.strongman.x = 46; g.strongman.y = 12; g.strongman._lastDx = 1; g.strongman._lastDy = 0;
    let turns = 0;
    while (g.boss.entity.isAlive() && turns < max) { g._allyTakeTurn(g.strongman); turns++; }
    return turns;
}

describe('the strongman who wins the contest with you (ST2)', () => {
    test('he is one placed fighter on open ground, bribeable, in no slot, with every line a placeholder', () => {
        const map = new GameMap(mapJson, MAP_URL);
        const spawns = mapJson.enemies.filter(e => e.entry === 'strongman');
        assert.equal(spawns.length, 1);
        assert.ok(map.isWalkable(spawns[0].x, spawns[0].y));
        const e = resolveSpawn(spawns[0], defaultPicks());
        assert.equal(e.bribeable, true);
        assert.equal(e.slot, undefined);
        assert.equal(e.boss, undefined);
        assert.equal(e.name, '[Strongman]');
        assert.equal(e.adjacencyBark, '[TEXT]');
    });

    test('gifts turn him to your side, as they turn anyone else', () => {
        const g = makeGame();
        assert.ok(!g.strongman._ally);
        const gifts = winHimOver(g);
        assert.ok(gifts > 1, 'one gift is not enough');
        assert.equal(g.strongman._ally, true);
        assert.equal(g.strongman.allegiance, 'ally');
        assert.equal(g.strongman.fsmState, 'ALLIED');
    });

    test('he fights the boss beside you; the fall finishes the quest through the booth, once', async () => {
        const g = makeGame();
        winHimOver(g);
        const turns = allyFightsBoss(g);
        assert.ok(!g.boss.entity.isAlive(), `the boss fell to him in ${turns} turns`);
        assert.equal(g.questEngine.act2Step('CARNIVAL'), 'collect');
        assert.equal(g.held(), 0, 'the fall alone gives nothing');
        assert.ok(g.logs.filter(l => l === '[TEXT]').length >= 2, 'the win with him says its extra line');
        g.playerX = 44; g.playerY = 11; g.facing = 'right';
        await walkToBooth(g);
        await g.press('KeyE');
        assert.equal(g.held(), 1);
        assert.equal(g.questEngine.act2Step('CARNIVAL'), 'done');
        await g.press('KeyE');
        assert.equal(g.held(), 1, 'using it again never gives a second');
    });

    test('the claim spot and the booth, in either order, end in one item', async () => {
        const g = makeGame();
        winHimOver(g);
        allyFightsBoss(g);
        const claim = g.examinables.find(e => e.id === Q.claimId);
        g.playerX = claim.x - 1; g.playerY = claim.y; g.facing = 'right';
        await g.press('KeyE');
        assert.equal(g.held(), 1);
        g.playerX = 49; g.playerY = 11; g.facing = 'right';
        await g.press('KeyE');
        assert.equal(g.held(), 1);

        const h = makeGame();
        winHimOver(h);
        allyFightsBoss(h);
        h.playerX = 49; h.playerY = 11; h.facing = 'right';
        await h.press('KeyE');
        assert.equal(h.held(), 1);
        h.playerX = claim.x - 1; h.playerY = claim.y; h.facing = 'right';
        await h.press('KeyE');
        assert.equal(h.held(), 1);
    });

    test('turning him is not the contest: while the boss lives nothing is given', async () => {
        const g = makeGame();
        winHimOver(g);
        assert.equal(g.questEngine.act2Step('CARNIVAL'), 'boss');
        await walkToBooth(g);
        await g.press('KeyE');
        assert.equal(g.held(), 0);
    });

    test('without him the booth route still works', async () => {
        const g = makeGame();
        await walkToBooth(g);
        beatTheGuard(g);
        assert.equal(g.questEngine.act2Step('CARNIVAL'), 'collect');
        assert.equal(g.logs.filter(l => l === '[TEXT]').length, 1, 'no ally, no extra line');
        await g.press('KeyE');
        assert.equal(g.held(), 1);
        assert.equal(g.questEngine.act2Step('CARNIVAL'), 'done');
    });
});

