// carnival-strongman.test.js — SG1 (plans/sg1-strongman-recruit.md): talk the Carnival's strongman into walking with you.
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
import { rememberSpent, applySpent } from '../game/npc-memory.js';
import { QuestEngine } from '../game/quests.js';
import { fighters } from '../game/fight-area.js';
import { allyAids } from '../game/ai.js';
import { perceives, VERDICT } from '../game/perception.js';
import { computeHit, attack } from '../game/combat.js';
import { getGreedyStep, stepEntity } from '../game/pathing.js';
import { manhattan } from '../game/utils.js';
const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
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
    ['_zoneChange', ''], ['_rememberRecruits', ''], ['_applyRecruits', ''], ['_allyTakeTurn', 'ally'], ['_isHostileToPlayer', 'e'], ['_revertAlly', 'enemyObj'], ['_rememberChests', ''], ['_rememberSpentChoices', ''], ['_applySpentChoices', 'url'], ['_loadMap', 'url, spawnX, spawnY'],
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
        renderer: { dropFightFog() {} },
        logs: [],
        _log(m) { this.logs.push(m); },
        _render() {}, _spawnHitSplat() {}, _ensureParticleLoop() {}, _spreadFireBlood() {}, _onStepSettled() {}, _tryPickup() {}, _stopAutoRepeat() {}, _resumeHeldWalk() {},
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
        fighters, allyAids, perceives, VERDICT, manhattan, cheb, computeHit, attack, getGreedyStep, stepEntity,
    };
    for (const [n, p] of LIFTED) g[n] = liveMethod(n, p, free);
    g.questEngine = new QuestEngine(g);
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

const sm = (g) => g.enemies.find(e => e.id === 'strongman');
const offered = (g) => g._dialogueChoices().map(c => c.id);
async function talkRecruit(g) {
    g._openDialogue(sm(g));
    assert.equal(g.state, STATE.DIALOGUE);
    assert.deepEqual(offered(g), ['recruit']);
    await g.press('Digit1');
    await g.press('KeyE');
    assert.equal(g.state, STATE.IDLE);
}
const carnival = async (g) => { await g.load('carnival-map.json', 4, 2); return g; };

describe('the strongman you can talk into walking with you (SG1)', () => {
    test('he stands at (24,13), calm, with one recruit line and placeholder copy', async () => {
        const g = await carnival(makeGame());
        const s = sm(g);
        assert.deepEqual([s.x, s.y], [24, 13]);
        assert.equal(g.map.enemySpawns.filter(e => e.entry === 'strongman').length, 1, 'one strongman, not two');
        assert.ok(!isHostile(s), 'he does not attack');
        assert.equal(s.type, 'Strongman');
        const d = getDialogue('strongman');
        assert.equal(d.greeting, '[TEXT]');
        assert.ok(d.choices.every(c => c.label === '[TEXT]' && c.reply === '[TEXT]'));
    });

    test('taking the recruit line makes him an ally who fights beside you', async () => {
        const g = await carnival(makeGame());
        const s = sm(g);
        await talkRecruit(g);
        assert.equal(s._ally, true);
        assert.equal(s.allegiance, 'ally');
        assert.equal(s.fsmState, 'ALLIED');
        // a hostile steps up beside him: the real ally turn goes for it
        const foe = g.enemies.find(e => e.id === 'clown3');
        foe.allegiance = 'hostile'; foe.fsmState = 'HOSTILE'; foe.state = 'chasing';
        s.x = foe.x + 1; s.y = foe.y; s._lastDx = -1; s._lastDy = 0;
        g.playerX = s.x + 1; g.playerY = s.y;
        const hp = foe.entity.hp;
        for (let i = 0; i < 6 && foe.entity.hp === hp; i++) g._allyTakeTurn(s);
        assert.ok(foe.entity.hp < hp, 'he hit the hostile');
    });

    test('out a door and back, he is still yours; a game that never recruits him writes no flag', async () => {
        const g = await carnival(makeGame());
        await roundTrip(g, 'town-map.json');
        assert.ok(!sm(g)._ally, 'unrecruited stays calm and unrecruited');
        assert.equal('strongmanRecruited' in g.questEngine.state.flags, false);

        await talkRecruit(g);
        await roundTrip(g, 'town-map.json');
        assert.equal(g._mapUrl, 'carnival-map.json');
        assert.equal(sm(g)._ally, true);
        assert.equal(sm(g).allegiance, 'ally');
        assert.equal(g.questEngine.state.flags.strongmanRecruited, true);
    });

    test('a save and a reload keep him, in the zone and after leaving it', async () => {
        const g = await carnival(makeGame());
        await talkRecruit(g);
        const inZone = JSON.parse(JSON.stringify(serialize(g)));
        const h = makeGame();
        h.map = new GameMap(mapJson('carnival-map.json'), 'carnival-map.json');
        h.equipment = { weapon: null };
        await loadInto(h, inZone);
        assert.equal(sm(h)._ally, true, 'saved inside the Carnival');

        await walkOut(g, doorTo(g, 'town-map.json'));
        const away = JSON.parse(JSON.stringify(serialize(g)));
        const k = makeGame();
        k.map = new GameMap(mapJson('town-map.json'), 'town-map.json');
        k.equipment = { weapon: null };
        await loadInto(k, away);
        assert.equal(k._mapUrl, 'town-map.json');
        await walkOut(k, doorTo(k, 'carnival-map.json'));
        assert.equal(sm(k)._ally, true, 'saved outside, come back after the reload');
    });

    test('hitting him turns him on you and drops the memory', async () => {
        const g = await carnival(makeGame());
        await talkRecruit(g);
        await roundTrip(g, 'town-map.json');
        const s = sm(g);
        assert.equal(s._ally, true);
        g._revertAlly(s);   // what a player's blow on an ally does
        assert.ok(!s._ally);
        await roundTrip(g, 'town-map.json');
        assert.equal('strongmanRecruited' in g.questEngine.state.flags, false);
        assert.ok(!sm(g)._ally);
    });

    test('a game that never meets him carries no new save field', async () => {
        const g = makeGame();
        await g.load('town-map.json', 8, 8);
        await roundTrip(g, 'borgir-map.json');
        assert.equal('strongmanRecruited' in serialize(g).quest.flags, false);
    });
});
