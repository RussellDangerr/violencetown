// carnival-booth-route.test.js — ST1: the Carnival's guarded booth (plans/st1-carnival-booth-route.md).
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
        _flash() {}, _triggerScreenShake() {}, _zoneChange() {}, _saveMoment() {}, _spawnEventWord() {},
        _MOVE_MS: 0, _pathQueue: [], _pathArrive: null, _stepIndex: 0, _hasteCharges: 0, _slowCharges: 0, buffs: [], ringMods: {}, equipment: {}, _hot: {},
        _startLootBurst() {}, _resolveItemDef: (id) => ITEMS[id] || null,
        emitGameEvent(type, payload) { this.questEngine.emit(type, payload); },
    };
    const free = {
        STATE, DIRS, audio, carriesAll, document, window, defaultVerb, doExamine, resolveExamine, findPath, getDialogue,
        resolveSpawn, deadIds, pendingDrops, recordDrop, takeDrop, recordKill, stepRespawns, bossDropOnce, dropLoadout,
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
        ['_rememberKill', 'enemyObj'], ['_bossFirstFall', 'enemyObj, required'], ['_recordDrop', 'type, x, y'], ['_grantItem', 'id, msg'],
    ]) g[n] = liveMethod(n, p, free);
    g.questEngine = new QuestEngine(g);
    if (save) {
        g.questEngine.restore(JSON.parse(JSON.stringify(save.quest)));
        g.inventory = JSON.parse(JSON.stringify(save.bag)).map(s => s && { ...s, itemDef: ITEMS[s.itemDef.id] });
    }
    const spawn = mapJson.enemies.find(e => e.slot === Q.slot);
    g.boss = spawnEnemy(resolveSpawn(spawn, defaultPicks()));
    if (save?.bossDead) { g.boss.entity.hp = 0; g.boss.entity.alive = false; }
    g.enemies = [g.boss];
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

describe('the booth the Carnival boss guards (ST1)', () => {
    test('the booth is its own spot, solid, and the old shuttered booth is left alone', () => {
        const map = new GameMap(mapJson, MAP_URL);
        const spot = map.examinableSpawns.find(e => e.id === Q.boothId);
        assert.ok(spot, 'the booth examinable exists');
        assert.equal(spot.text, '[TEXT]');
        assert.ok(!map.isWalkable(spot.x, spot.y), 'a solid prop stands on it');
        assert.notEqual(Q.boothId, Q.claimId);
        assert.ok(map.examinableSpawns.some(e => e.id === 'booth' && e.x === 28), 'the decoy booth is untouched');
    });

    test('with the guard alive the booth says one [TEXT] line and gives nothing', async () => {
        const g = makeGame();
        await walkToBooth(g);
        assert.ok(g.boss.entity.isAlive());
        g.logs.length = 0;
        await g.press('KeyE');
        assert.equal(g.held(), 0);
        assert.equal(g.questEngine.act2Step('CARNIVAL'), 'boss');
        assert.ok(g.logs.length > 0 && g.logs.every(l => l === '[TEXT]'), g.logs.join(' | '));
        await g.press('KeyE');
        assert.equal(g.held(), 0, 'again: still nothing');
        assert.deepEqual(Object.keys(g.questEngine.serialize().flags).filter(k => k.startsWith('act2_')), [], 'nothing was saved');
    });

    test('beating the guard then using the booth gives the Stuffed Animal once and finishes the quest', async () => {
        const g = makeGame();
        await walkToBooth(g);
        beatTheGuard(g);
        assert.equal(g.questEngine.act2Step('CARNIVAL'), 'collect');
        assert.equal(g.held(), 0, 'the fall alone gives nothing');
        await g.press('KeyE');
        assert.equal(g.held(), 1);
        assert.equal(g.questEngine.act2Step('CARNIVAL'), 'done');
        await g.press('KeyE');
        await g.press('KeyE');
        assert.equal(g.held(), 1, 'using it again never gives a second');
    });

    test('the booth and the claim spot end in exactly one item between them', async () => {
        const g = makeGame();
        await walkToBooth(g);
        beatTheGuard(g);
        await g.press('KeyE');
        assert.equal(g.held(), 1);
        const claim = g.examinables.find(e => e.id === Q.claimId);
        g.playerX = claim.x - 1; g.playerY = claim.y; g.facing = 'right';
        await g.press('KeyE');
        assert.equal(g.held(), 1, 'the claim spot after the booth gives nothing more');

        const h = makeGame();
        beatTheGuard(h);
        h.playerX = claim.x - 1; h.playerY = claim.y; h.facing = 'right';
        await h.press('KeyE');
        assert.equal(h.held(), 1);
        h.playerX = 49; h.playerY = 11; h.facing = 'right';
        await h.press('KeyE');
        assert.equal(h.held(), 1, 'the booth after the claim spot gives nothing more');
    });

    test('a reload at each step keeps its place', async () => {
        // Step 1: guard alive, reload, the booth is still closed.
        let g = makeGame();
        g = makeGame(g.save());
        await walkToBooth(g);
        await g.press('KeyE');
        assert.equal(g.held(), 0);
        assert.equal(g.questEngine.act2Step('CARNIVAL'), 'boss');

        // Step 2: the guard falls, reload, the booth is open.
        beatTheGuard(g);
        g = makeGame(g.save());
        assert.equal(g.questEngine.act2Step('CARNIVAL'), 'collect');
        await walkToBooth(g);
        await g.press('KeyE');
        assert.equal(g.held(), 1);

        // Step 3: taken, reload, still one and done.
        g = makeGame(g.save());
        assert.equal(g.questEngine.act2Step('CARNIVAL'), 'done');
        assert.equal(g.held(), 1);
        await walkToBooth(g);
        await g.press('KeyE');
        assert.equal(g.held(), 1);
    });
});
