// speed-poition-chest-return.test.js — SV1 (plans/sv1-speed-poition-chest.md).
//
// The Graveyard's Speed Poition can be taken once, even across leaving the zone and coming
// back (CH1 keeps an emptied chest empty). Every move is a real key: a keydown and keyup through
// the real listener _bindInput registers, into the real _doMove, the real bump-to-open and the
// real offer screen. The maps are the real JSON files; _loadMap, _zoneChange and _rememberChests
// are the real methods lifted out of main.js (which touches `document` at import), the way
// chest-stays-empty.test.js does it. Only the world beat is a stand-in.

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
import {
    MODAL_RECT, HIT_SLOP, offerLayout, offerRowIndexAt, offerTraySlotAt, OFFER_ROWS_VISIBLE, OFFER_TRAY_SLOTS,
} from '../game/layout.js';
import { emptyOffer, commitBlocker, stage, unstage, settledGold, resolveOffer, sameEntry } from '../game/offer.js';
import { band, buyPrice, sellPrice, transferGold } from '../game/trade.js';
import { applyDispositionDelta, reactToTransaction } from '../game/give-action.js';
import { serialize, loadInto, migrate } from '../game/save.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');
const mapJson = (url) => JSON.parse(readFileSync(fileURLToPath(new URL(`../game/${url}`, import.meta.url)), 'utf8'));

function liveMethod(name, params, freeVars = {}) {
    const signature = `${name}(${params}) {`;
    const at = mainSrc.indexOf(signature, mainSrc.indexOf('class Game {'));
    assert.ok(at > 0, `${name}(${params}) not found in main.js`);
    const closeAt = mainSrc.indexOf('\n    }', at);
    assert.ok(closeAt > at, `${name} body never closes`);
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
        this.code = code;
        this.key = code;
        this.repeat = false;
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
    // the chest: opening it, what it holds, taking from it
    ['_openContainer', 'container'], ['_containerStock', 'container'], ['_containerEntries', 'container'],
    ['_takeFromContainer', 'npc, at'],
    // the offer screen
    ['_openOffer', 'npc'], ['_closeOffer', ''], ['_tapOffer', 'pt'], ['_pointInRect', 'p, r, slop = 0'],
    ['_offerTheirsList', ''], ['_offerYoursList', ''], ['_offerScrollBy', 'side, delta'],
    ['_offerActivate', 'zone, index'], ['_offerUnstageRow', 'zone, index'], ['_canStageGive', 'entry'], ['_resettle', 'npc'],
    ['_goldTray', ''], ['_toggleOfferGold', 'npc'], ['_buybackList', 'npc'], ['_buybackLive', 'npc'],
    ['_buybackRecord', 'npc, itemId, kind, price'], ['_endBuybacks', ''],
    ['_commitOffer', ''], ['_offerBlocker', ''], ['_logOffer', 'npc, R, { given, taken, gold }'],
    ['_removeFromSlot', 'slot'], ['_addToInventory', 'itemDef'], ['_wheelOpenerUp', ''],
    // the zone change: the memory the fix adds, and the load that reads it
    ['_zoneChange', ''], ['_rememberChests', ''], ['_loadMap', 'url, spawnX, spawnY'],
];

// A game standing in `url` at (x, y), bound to the real methods and the real map.
function makeGame(url = 'graveyard-map.json') {
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
        _respawnLists: {}, _bossDropsGiven: new Set(), _chestRecords: {}, _pendingFollowers: null,
        _stepIndex: 0, rng: { getState: () => 0, setState() {} },
        renderer: { dropFightFog() {} }, questEngine: null,
        logs: [],
        _log(m) { this.logs.push(m); },
        _render() {}, _onStepSettled() {}, _tryPickup() {}, _stopAutoRepeat() {}, _resumeHeldWalk() {},
        _flash() {}, _triggerScreenShake() {}, emitGameEvent() {}, _saveMoment() {},
        _advanceDayClock() {}, _openBridgeIfCarFixed() {},
        hasBuff(id) { return this.buffs.some(b => b.id === id); },
        _resolveItemDef: resolveItemDef,
        // Stand-in world beat: carries out a queued map change as _advanceWorldOnce's tail does.
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
        STATE, DIRS, audio, document, window, carriesAll,
        requestAnimationFrame: (f) => queueMicrotask(() => f(Infinity)),
        performance: { now: () => 0 },
        setTimeout: () => 0,
        defaultVerb, isHostile,
        SAFE_SLOTS, PACK_PAGE, MAX_STACK, addToInv,
        MODAL_RECT, HIT_SLOP, offerLayout, offerRowIndexAt, offerTraySlotAt, OFFER_ROWS_VISIBLE, OFFER_TRAY_SLOTS,
        emptyOffer, commitBlocker, stage, unstage, settledGold, resolveOffer, sameEntry,
        band, sellPrice, buyPrice, transferGold, applyDispositionDelta, reactToTransaction,
        // _loadMap
        loadMap: async (u) => new GameMap(mapJson(u), u),
        spawnEnemy, resolveSpawn, deadIds, pendingDrops, stepRespawns: () => {},
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

// The shortest run of directions from the player to a tile beside (x, y), or to (x, y) itself when
// `onto`. Chests and the people standing about are in the way, as they are on the real map.
function route(g, x, y, onto) {
    const blocked = (cx, cy) => !g.map.isInBounds(cx, cy) || !g.map.isWalkable(cx, cy)
        || g.containers.some(c => c.x === cx && c.y === cy)
        || g.enemies.some(e => e.entity.isAlive() && e.x === cx && e.y === cy);
    const seen = new Map([[`${g.playerX},${g.playerY}`, []]]);
    const queue = [[g.playerX, g.playerY]];
    while (queue.length) {
        const [cx, cy] = queue.shift();
        const path = seen.get(`${cx},${cy}`);
        if (onto ? (cx === x && cy === y) : (Math.abs(cx - x) + Math.abs(cy - y) === 1)) return path;
        for (const [dir, [dx, dy]] of Object.entries(STEP)) {
            const nx = cx + dx, ny = cy + dy;
            if (seen.has(`${nx},${ny}`) || blocked(nx, ny)) continue;
            seen.set(`${nx},${ny}`, [...path, dir]);
            queue.push([nx, ny]);
        }
    }
    throw new Error(`no way to (${x}, ${y}) on ${g._mapUrl}`);
}

// One step on an arrow key. A tap toward a new facing only turns you, so one more press moves you.
async function step(g, dir) {
    const at = [g.playerX, g.playerY];
    await g.press(ARROW[dir]);
    if (g.playerX === at[0] && g.playerY === at[1] && g.state === STATE.IDLE && !g._pendingTransition) await g.press(ARROW[dir]);
}

// Walk to the tile beside (x, y) with the arrow keys, then press into it.
async function bumpInto(g, x, y) {
    for (const dir of route(g, x, y, false)) await step(g, dir);
    const dir = Object.keys(STEP).find(d => g.playerX + STEP[d][0] === x && g.playerY + STEP[d][1] === y);
    await step(g, dir);
}

// Walk onto a door tile with the arrow keys: the world beat then loads the other map.
async function walkOut(g, door) {
    const from = g._mapUrl;
    const dirs = route(g, door.x, door.y, true);
    for (let i = 0; i < dirs.length && g._mapUrl === from; i++) await step(g, dirs[i]);
    await settle();
    assert.equal(g._mapUrl, door.toMap, `the door at (${door.x}, ${door.y}) leads to ${door.toMap}`);
    assert.equal(g.state, STATE.IDLE, 'and you are back in control');
}

// The nearest door on this map that leads to `toMap`.
function doorTo(g, toMap) {
    const doors = g.map.transitions.filter(t => t.toMap === toMap);
    assert.ok(doors.length, `${g._mapUrl} has a door to ${toMap}`);
    return doors.sort((a, b) => route(g, a.x, a.y, true).length - route(g, b.x, b.y, true).length)[0];
}

// Out the nearest door to `via`, then back in by the way you came: a round trip through a zone.
async function roundTrip(g, via) {
    const home = g._mapUrl;
    await walkOut(g, doorTo(g, via));
    await walkOut(g, doorTo(g, home));
}

const CHEST = 'graveyard-stash';
const chestAt = (g, id) => g.containers.find(c => c.id === id);
const idsIn = (c) => c.contents.map(e => (typeof e === 'string' ? e : e.type));
const bag = (g) => g.inventory.filter(Boolean).flatMap(s => Array(s.count).fill(s.itemDef.id));
const POITION = 'speed_poition';

// With the chest open: cross to its column, stage the Poition, make the offer, close.
async function takeWithKeys(g, id) {
    assert.equal(g.state, STATE.TRADE, 'the chest is open');
    await g.press('ArrowRight');
    const at = g._offerTheirsList().map(r => r.def.id).indexOf(id);
    assert.ok(at >= 0, `${id} is in the chest`);
    while (g._offerCursor.index < at) await g.press('ArrowDown');
    await g.press('Space');
    await g.press('Enter');
    await g.press('KeyE');
    assert.equal(g.state, STATE.IDLE, 'the chest closed');
}

describe('the Graveyard Speed Poition can be taken only once (SV1)', () => {
    test('take it, leave the Graveyard, come back: the chest is empty and the bag has one', async () => {
        const g = makeGame();
        await g.load('graveyard-map.json', 14, 2);
        const chest = chestAt(g, CHEST);
        assert.ok(chest, 'the Graveyard has its chest');
        assert.deepEqual(idsIn(chest), [POITION], 'it starts with the Poition');

        await bumpInto(g, chest.x, chest.y);
        await takeWithKeys(g, POITION);
        assert.deepEqual(chestAt(g, CHEST).contents, [], 'the chest is empty');
        assert.equal(bag(g).filter(i => i === POITION).length, 1, 'one Poition is in the bag');

        await roundTrip(g, 'wilderness-map.json');
        assert.equal(g._mapUrl, 'graveyard-map.json', 'back in the Graveyard');
        assert.deepEqual(chestAt(g, CHEST).contents, [], 'the chest is still empty');
        assert.equal(bag(g).filter(i => i === POITION).length, 1, 'and there is still just the one Poition');

        await bumpInto(g, chest.x, chest.y);
        assert.equal(g.state, STATE.IDLE, 'bumping it opens nothing');
        assert.ok(g.logs.some(l => /is empty/.test(l)), 'it says it is empty');
    });

    test('a chest you walked past and never opened is still full when you come back', async () => {
        const g = makeGame();
        await g.load('graveyard-map.json', 14, 2);
        await roundTrip(g, 'wilderness-map.json');
        assert.deepEqual(idsIn(chestAt(g, CHEST)), [POITION], 'the Poition is still waiting');
        assert.deepEqual(g._chestRecords, {}, 'and nothing was written down');
        assert.equal(bag(g).length, 0);
    });

    test('it stays taken through a save, a load and another trip out and back', async () => {
        const g = makeGame();
        await g.load('graveyard-map.json', 14, 2);
        const chest = chestAt(g, CHEST);
        await bumpInto(g, chest.x, chest.y);
        await takeWithKeys(g, POITION);
        await walkOut(g, doorTo(g, 'wilderness-map.json'));
        const blob = JSON.parse(JSON.stringify(serialize(g)));

        const h = makeGame();
        h.map = new GameMap(mapJson('wilderness-map.json'), 'wilderness-map.json');
        h.equipment = { weapon: null };
        await loadInto(h, blob);
        await walkOut(h, doorTo(h, 'graveyard-map.json'));
        assert.deepEqual(chestAt(h, CHEST).contents, [], 'the chest is empty after the reload');
        assert.equal(bag(h).filter(i => i === POITION).length, 1, 'with the one Poition in the bag');
    });
});
