// npc-memory-zones.test.js — NM1 (plans/nm1-talk-choices-remembered.md).
//
// A one-time talk choice you used stays used when you leave the zone and come back. The real
// methods are lifted out of main.js (it touches `document` at import); every move is a real key
// through the real listener, and the zone change goes through the real door and _loadMap.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GameMap, carriesAll } from '../game/map.js';
import { spawnEnemy } from '../game/enemies.js';
import { resolveSpawn, defaultPicks } from '../game/slots.js';
import { deadIds, pendingDrops } from '../game/drops.js';
import { INVENTORY_SIZE, SAFE_SLOTS, PACK_PAGE, MAX_STACK } from '../game/data.js';
import { addToInventory as addToInv } from '../game/inventory.js';
import { resolveItemDef } from '../game/item-registry.js';
import { isHostile } from '../game/ai.js';
import { defaultVerb } from '../game/wheel-model.js';
import { getDialogue } from '../game/dialogue.js';
import { transferGold } from '../game/trade.js';
import { applyDispositionDelta } from '../game/give-action.js';
import { rememberSpent, applySpent, sanitizeSpent } from '../game/npc-memory.js';
import { serialize, loadInto, migrate } from '../game/save.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');
const mapJson = (url) => JSON.parse(readFileSync(fileURLToPath(new URL(`../game/${url}`, import.meta.url)), 'utf8'));

function liveMethod(name, params, freeVars = {}) {
    const signature = `${name}(${params}) {`;
    const at = mainSrc.indexOf(signature, mainSrc.indexOf('class Game {'));
    assert.ok(at > 0, `${name}(${params}) not found in main.js`);
    const closeAt = mainSrc.indexOf('\n    }', at);
    const body = mainSrc.slice(at + name.length, closeAt + '\n    }'.length);
    const isAsync = mainSrc.slice(at - 6, at) === 'async ';
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return ${isAsync ? 'async ' : ''}function ${body}`)(...names.map(n => freeVars[n]));
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

const LIFTED = [
    ['_bindInput', ''], ['_noteHeld', 'code'], ['_faceOf', 'dir'], ['_clearTurnTimer', ''],
    ['_beginMoveOrTurn', 'dir'], ['_intendedWalkDir', ''], ['_resolveWalkStep', 'dir'],
    ['_animateMove', 'fromX, fromY, toX, toY, callback, duration = this._animDuration'],
    ['_doMove', 'dir'], ['_canEnter', 'x, y'], ['_digitToSlot', 'code'], ['setTile', 'x, y, id'],
    ['_targetAt', 'x, y'], ['_actOnTarget', 'verb, t'], ['_fireResolver', 'verb, t'],
    ['_endBuybacks', ''],
    // the talk: opening it, what it offers, picking
    ['_openDialogue', 'npc'], ['_closeDialogue', ''], ['_dialogueChoices', ''], ['_pickDialogueChoice', 'choice'],
    // the zone change and the memory it writes
    ['_zoneChange', ''], ['_rememberChests', ''], ['_rememberSpentChoices', ''], ['_applySpentChoices', 'url'], ['_loadMap', 'url, spawnX, spawnY'],
];

function makeGame() {
    const document = new EventTarget();
    document.getElementById = () => null;
    const window = new EventTarget();
    const g = {
        state: STATE.IDLE, facing: 'right', turn: 1, map: null, _mapUrl: null,
        slots: defaultPicks(), enemies: [], containers: [], groundItems: [], examinables: [], _tileDiffs: [],
        playerX: 0, playerY: 0, playerHp: 100, playerMaxHp: 100, playerMp: 50, playerMaxMp: 50,
        gold: 100, buffs: [], ringMods: {}, equipment: {},
        inventory: Array(INVENTORY_SIZE).fill(null),
        _MOVE_MS: 0,
        _heldDirKeys: [], _physicalHeld: new Set(), _queuedMoveDir: null, _pathQueue: [], _pathArrive: null,
        _animating: false, _animDuration: 1, _TURN_MS: 70, _turnTimer: null, _paused: false,
        _pendingTransition: null, _ratFormTurns: 0, _hasteCharges: 0, _slowCharges: 0,
        _collectedItems: new Set(), _droppedItems: {}, _muggedIds: new Set(), _robbed: {}, _hot: {},
        _respawnLists: {}, _bossDropsGiven: new Set(), _chestRecords: {}, _spentChoices: {}, _pendingFollowers: null,
        _stepIndex: 0, rng: { getState: () => 0, setState() {} },
        renderer: { dropFightFog() {} }, questEngine: null,
        logs: [],
        _log(m) { this.logs.push(m); },
        _render() {}, _onStepSettled() {}, _tryPickup() {}, _stopAutoRepeat() {}, _resumeHeldWalk() {},
        _flash() {}, _triggerScreenShake() {}, emitGameEvent() {}, _saveMoment() {},
        _advanceDayClock() {}, _openBridgeIfCarFixed() {},
        hasBuff(id) { return this.buffs.some(b => b.id === id); },
        _resolveItemDef: resolveItemDef,
        _advanceWorld() {
            this.turn++;
            if (!this._pendingTransition) return;
            const t = this._pendingTransition;
            this._pendingTransition = null;
            this.state = STATE.RESOLVING;
            this._zoneChange();
            this._loadMap(t.toMap, t.toX, t.toY).then(() => { this.state = STATE.IDLE; });
        },
    };
    const free = {
        STATE, DIRS, audio, document, window, carriesAll, SLUDGE_DURATION: 3,
        requestAnimationFrame: (f) => queueMicrotask(() => f(Infinity)),
        performance: { now: () => 0 }, setTimeout: () => 0,
        defaultVerb, isHostile, SAFE_SLOTS, PACK_PAGE, MAX_STACK, addToInv,
        getDialogue, transferGold, applyDispositionDelta, DIALOGUE_HOSTILE_AT: -40,
        loadMap: async (u) => new GameMap(mapJson(u), u),
        spawnEnemy, resolveSpawn, deadIds, pendingDrops, stepRespawns: () => {},
        rememberSpent, applySpent,
    };
    for (const [n, p] of LIFTED) g[n] = liveMethod(n, p, free);
    g._bindInput();
    g.press = async (code) => {
        document.dispatchEvent(new Key('keydown', code));
        document.dispatchEvent(new Key('keyup', code));
        await settle();
    };
    g.load = async (u, x, y) => { await g._loadMap(u, x, y); };
    return g;
}

const ARROW = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
const STEP = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

function route(g, x, y) {
    const blocked = (cx, cy) => !g.map.isInBounds(cx, cy) || !g.map.isWalkable(cx, cy)
        || g.enemies.some(e => e.entity.isAlive() && e.x === cx && e.y === cy);
    const seen = new Map([[`${g.playerX},${g.playerY}`, []]]);
    const queue = [[g.playerX, g.playerY]];
    while (queue.length) {
        const [cx, cy] = queue.shift();
        const path = seen.get(`${cx},${cy}`);
        if (cx === x && cy === y) return path;
        for (const [dir, [dx, dy]] of Object.entries(STEP)) {
            const nx = cx + dx, ny = cy + dy;
            if (seen.has(`${nx},${ny}`) || blocked(nx, ny)) continue;
            seen.set(`${nx},${ny}`, [...path, dir]);
            queue.push([nx, ny]);
        }
    }
    throw new Error(`no way to (${x}, ${y}) on ${g._mapUrl}`);
}
async function step(g, dir) {
    const at = [g.playerX, g.playerY];
    await g.press(ARROW[dir]);
    if (g.playerX === at[0] && g.playerY === at[1] && g.state === STATE.IDLE && !g._pendingTransition) await g.press(ARROW[dir]);
}
async function walkOut(g, door) {
    const from = g._mapUrl;
    const dirs = route(g, door.x, door.y);
    for (let i = 0; i < dirs.length && g._mapUrl === from; i++) await step(g, dirs[i]);
    await settle();
    assert.equal(g._mapUrl, door.toMap, `the door at (${door.x}, ${door.y}) leads to ${door.toMap}`);
    assert.equal(g.state, STATE.IDLE);
}
const doorTo = (g, toMap) => {
    const doors = g.map.transitions.filter(t => t.toMap === toMap);
    assert.ok(doors.length, `${g._mapUrl} has a door to ${toMap}`);
    return doors.sort((a, b) => route(g, a.x, a.y).length - route(g, b.x, b.y).length)[0];
};
async function roundTrip(g, via) {
    const home = g._mapUrl;
    await walkOut(g, doorTo(g, via));
    await walkOut(g, doorTo(g, home));
}

const bartho = (g) => g.enemies.find(e => e.id === 'townie-w');
const offered = (g) => g._dialogueChoices().map(c => c.id);
// Talk to him and pick a choice by its number key.
async function say(g, id) {
    g._openDialogue(bartho(g));
    assert.equal(g.state, STATE.DIALOGUE);
    const at = offered(g).indexOf(id);
    assert.ok(at >= 0, `${id} is on offer`);
    await g.press(`Digit${at + 1}`);
    await g.press('KeyE');
    assert.equal(g.state, STATE.IDLE);
}

describe('a one-time talk choice you used stays used (NM1)', () => {
    test('Town: pay Bartho the hat compliment, out Borgir\'s door and back: it is not offered again', async () => {
        const g = makeGame();
        await g.load('town-map.json', 8, 8);
        assert.ok(offered(g).includes('hat') || (g._openDialogue(bartho(g)), offered(g).includes('hat')), 'the compliment is on offer to begin with');
        g._closeDialogue();
        await say(g, 'hat');
        g._openDialogue(bartho(g));
        assert.ok(!offered(g).includes('hat'), 'and spent');
        g._closeDialogue();

        await roundTrip(g, 'borgir-map.json');
        assert.equal(g._mapUrl, 'town-map.json');
        g._openDialogue(bartho(g));
        assert.ok(!offered(g).includes('hat'), 'back in the Town the compliment is gone');
        assert.ok(offered(g).includes('bridge'), 'what he was not asked is still on offer');
        assert.ok(offered(g).includes('flatter'), 'and the repeatable ones too');
        assert.equal(bartho(g).disposition, 0, 'his mood resets, as before');
    });

    test('it survives a save in another zone and a reload', async () => {
        const g = makeGame();
        await g.load('town-map.json', 8, 8);
        await say(g, 'hat');
        await walkOut(g, doorTo(g, 'borgir-map.json'));
        const blob = JSON.parse(JSON.stringify(serialize(g)));
        assert.deepEqual(blob.world.spentChoices, { 'town-map.json': { 'townie-w': ['hat'] } });

        const h = makeGame();
        h.map = new GameMap(mapJson('borgir-map.json'), 'borgir-map.json');
        h.equipment = { weapon: null };
        await loadInto(h, blob);
        assert.equal(h._mapUrl, 'borgir-map.json');
        await walkOut(h, doorTo(h, 'town-map.json'));
        h._openDialogue(bartho(h));
        assert.ok(!offered(h).includes('hat'), 'after the reload and the walk back, still spent');
    });

    test('a zone where nobody spent a choice writes no record, and an old save loads clean', async () => {
        const g = makeGame();
        await g.load('town-map.json', 8, 8);
        await roundTrip(g, 'borgir-map.json');
        assert.deepEqual(g._spentChoices, {});
        assert.equal('spentChoices' in serialize(g).world, false, 'the save has no such field');
        const blob = JSON.parse(JSON.stringify(serialize(g)));
        assert.deepEqual(migrate(blob).world.spentChoices, {});
        blob.world.spentChoices = { 'town-map.json': 'junk', x: { a: [3, null], b: 'no' } };
        assert.deepEqual(migrate(blob).world.spentChoices, {}, 'a malformed record is dropped');
    });

    test('the record is per zone and per person', () => {
        const mk = (id, done) => ({ id, _dialogueDone: new Set(done) });
        const rec = {};
        rememberSpent(rec, 'a.json', [mk('p1', ['hat']), mk('p2', [])]);
        rememberSpent(rec, 'b.json', [mk('p1', [])]);
        assert.deepEqual(rec, { 'a.json': { p1: ['hat'] } }, 'only the spender, only in its zone');
        const inA = [{ id: 'p1' }, { id: 'p2' }], inB = [{ id: 'p1' }];
        applySpent(rec, 'a.json', inA);
        applySpent(rec, 'b.json', inB);
        assert.deepEqual([...inA[0]._dialogueDone], ['hat']);
        assert.equal(inA[1]._dialogueDone, undefined);
        assert.equal(inB[0]._dialogueDone, undefined, 'the same id in another zone is untouched');
        rememberSpent(rec, 'a.json', [mk('p1', [])]);
        assert.deepEqual(rec, {}, 'a zone with nothing spent drops off');
        assert.deepEqual(sanitizeSpent(undefined), {});
    });
});
