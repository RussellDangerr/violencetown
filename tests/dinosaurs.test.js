// dinosaurs.test.js — DN1: the Valley's dinosaurs (plans/dn1-dinosaurs-roam-valley.md).
//
// A mob slot pooling a raptor, a triceratops and a T. rex, dealt to three spawns on the Valley map.
// A dinosaur is reached the way a player reaches one: real keys climb the hook out of the Canyon, and
// the REAL _loadMap (lifted from main.js) deals the Valley's spawns from the game's slots. Copied
// numbers, art, examine text and the bench rows are pinned beside it.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GameMap, carriesAll } from '../game/map.js';
import { SLOTS, ENTRIES, pickSlots, defaultPicks, resolveSpawn } from '../game/slots.js';
import { spawnEnemy } from '../game/enemies.js';
import { dressOne } from '../game/theft.js';
import { resolveItemDef } from '../game/item-registry.js';
import { ENEMY_SPRITES } from '../game/sprites.js';
import { pendingDrops, deadIds } from '../game/drops.js';
import { resolveExamine } from '../game/examine.js';
import { loadMapRoster, report } from '../tools/balance-harness.mjs';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');

function liveMethod(name, params, freeVars = {}) {
    const signature = `${name}(${params}) {`;
    const at = mainSrc.indexOf(signature);
    assert.ok(at > 0, `${name}(${params}) not found in main.js`);
    const closeAt = mainSrc.indexOf('\n    }', at);
    assert.ok(closeAt > at, `${name} body never closes`);
    const body = mainSrc.slice(at + name.length, closeAt + '\n    }'.length);
    const isAsync = mainSrc.slice(at - 6, at) === 'async ';
    const names = Object.keys(freeVars);
    const factory = new Function(...names, `'use strict'; return ${isAsync ? 'async ' : ''}function ${body}`);
    return factory(...names.map(n => freeVars[n]));
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

const readJson = (url) => JSON.parse(readFileSync(fileURLToPath(new URL(`../game/${url}`, import.meta.url)), 'utf8'));
const loadMap = (url) => new GameMap(readJson(url), url);

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

const HOOK = { itemDef: { id: 'grappling_hook' } };

// A game standing on `map` at (x, y), bound to the real movement methods.
async function makeGame({ map = 'canyon-map.json', x = 26, y = 3, inventory = [], seed = 1 } = {}) {
    const document = new EventTarget();
    document.getElementById = () => null;
    const window = new EventTarget();
    const g = {
        state: STATE.IDLE, facing: 'up',
        playerX: 0, playerY: 0, inventory, enemies: [], containers: [], examinables: [],
        _tileDiffs: [], _heldDirKeys: [], _physicalHeld: new Set(), _queuedMoveDir: null,
        _animating: false, _animDuration: 1, _TURN_MS: 70, _turnTimer: null, _paused: false,
        _pendingTransition: null, _ratFormTurns: 0, _swinging: false,
        logs: [], loads: [],
        _log(m) { this.logs.push(m); },
        _render() {}, _onStepSettled() {}, _tryPickup() {}, _stopAutoRepeat() {},
        hasBuff() { return false; },
        _zoneChange() {},
        emitGameEvent() {},
        slots: pickSlots(seed),
        _collectedItems: new Set(), _droppedItems: [], _respawnLists: {}, _muggedIds: new Set(), _robbed: {},
        renderer: { dropFightFog() {} },
        _resolveItemDef() { return null; },
        _endBuybacks() {}, _advanceDayClock() {}, _openBridgeIfCarFixed() {},
        // Stand-in world beat: carries out a queued map change as _advanceWorldOnce's tail does.
        _advanceWorld() {
            if (!this._pendingTransition) return;
            const t = this._pendingTransition;
            this._pendingTransition = null;
            this._log(t.label || '[Transitioning...]');
            this.state = STATE.RESOLVING;
            this._loadMap(t.toMap, t.toX, t.toY).then(() => { this.state = STATE.IDLE; });
        },
    };
    const free = {
        STATE, DIRS, audio, carriesAll, document, window,
        loadMap: async (url) => loadMap(url), pendingDrops, deadIds, spawnEnemy, resolveSpawn,
        requestAnimationFrame: (f) => queueMicrotask(() => f(Infinity)),
        performance: { now: () => 0 },
        setTimeout: () => 0,
    };
    for (const [n, p] of [
        ['_bindInput', ''], ['_noteHeld', 'code'], ['_faceOf', 'dir'], ['_clearTurnTimer', ''],
        ['_beginMoveOrTurn', 'dir'], ['_intendedWalkDir', ''], ['_resolveWalkStep', 'dir'],
        ['_animateMove', 'fromX, fromY, toX, toY, callback, duration = this._animDuration'],
        ['_doMove', 'dir'], ['_loadMap', 'url, spawnX, spawnY'], ['_canEnter', 'x, y'], ['_interactGrapple', 'anchor'],
    ]) g[n] = liveMethod(n, p, free);
    g._bindInput();
    g.press = async (code) => {
        document.dispatchEvent(new Key('keydown', code));
        document.dispatchEvent(new Key('keyup', code));
        await settle();
    };
    await g._loadMap(map, x, y);
    return g;
}

// Press one direction until the map changes (or `max` presses), turning first if need be.
async function walk(g, code, max = 40) {
    const from = g._mapUrl;
    for (let i = 0; i < max && g._mapUrl === from; i++) await g.press(code);
}

// Press one direction until `done(g)` holds (or `max` presses).
async function walkUntil(g, code, done, max = 40) {
    for (let i = 0; i < max && !done(g); i++) await g.press(code);
}


const VALLEY = 'valley-map.json';
const SLOT = 'valley.mob';
const POOL = ['raptor', 'triceratops', 't_rex'];
const TYPES = ['Raptor', 'Triceratops', 'T. rex'];
const valley = readJson(VALLEY);
const mobSpawns = valley.enemies.filter(s => s.slot === SLOT);
const spawnedWith = (picks) => mobSpawns.map(s => spawnEnemy(resolveSpawn(s, picks)));
const typesOf = (g) => g.enemies.map(e => e.type).sort();

describe('a dinosaur met by climbing into the Valley', () => {
    test('the hook climb out of the Canyon puts all three kinds in the zone', async () => {
        const g = await makeGame({ inventory: [HOOK] });
        assert.deepEqual(g.enemies.map(e => e.type).filter(t => TYPES.includes(t)), [], 'the Canyon holds none');
        await walk(g, 'ArrowUp');
        assert.equal(g._mapUrl, VALLEY);
        assert.deepEqual(typesOf(g), [...TYPES].sort());
        for (const e of g.enemies) {
            assert.equal(e.slot, SLOT);
            assert.equal(e.allegiance, 'hostile', e.type);
            assert.ok(g.map.isWalkable(e.x, e.y), `${e.id} stands on a blocked tile`);
        }
    });

    test('every game deals all three, in an order that varies by seed', async () => {
        const orders = new Set();
        for (let seed = 0; seed < 12; seed++) {
            const g = await makeGame({ inventory: [HOOK], seed });
            await walk(g, 'ArrowUp');
            assert.deepEqual(typesOf(g), [...TYPES].sort(), `seed ${seed}`);
            orders.add(g.enemies.map(e => e.type).join(','));
        }
        assert.ok(orders.size >= 2, 'the deal never varies');
    });

    test('going back down and up again deals the same three again', async () => {
        const g = await makeGame({ inventory: [HOOK] });
        await walk(g, 'ArrowUp');
        assert.equal(g.enemies.length, 3);
        await walk(g, 'ArrowUp');
        assert.equal(g._mapUrl, 'canyon-map.json');
        await walk(g, 'ArrowUp');
        assert.deepEqual(typesOf(g), [...TYPES].sort());
    });
});

describe('the Valley mob slot', () => {
    test('is a mob slot on the Valley map pooling the three kinds', () => {
        const slot = SLOTS[SLOT];
        assert.ok(slot, 'no valley.mob slot');
        assert.equal(slot.kind, 'mob');
        assert.equal(slot.map, VALLEY);
        assert.deepEqual(slot.pool.map(p => p.entry), POOL);
        assert.equal(SLOT in defaultPicks(), false);
    });

    test('seats one spawn per kind, clear of the landing and the west door', () => {
        assert.equal(mobSpawns.length, POOL.length);
        assert.deepEqual(mobSpawns.map(s => s.seat).sort(), [0, 1, 2]);
        const map = loadMap(VALLEY);
        for (const s of mobSpawns) {
            assert.ok(map.isWalkable(s.x, s.y), s.id);
            assert.ok(Math.abs(s.x - 20) + Math.abs(s.y - 2) >= 5, `${s.id} is on the hook landing`);
            assert.ok(Math.abs(s.x - 1) + Math.abs(s.y - 9) >= 5, `${s.id} is on the west door`);
        }
        assert.equal(new Set(mobSpawns.map(s => s.id)).size, mobSpawns.length);
    });

    test('with no deck saved the seats deal the pool in order', () => {
        assert.deepEqual(spawnedWith(defaultPicks()).map(e => e.type), TYPES);
    });

    test('the Valley still holds no items or examinables', () => {
        for (const k of ['items', 'examinables']) assert.deepEqual(valley[k], [], k);
    });
});

describe('each dinosaur', () => {
    const creatures = spawnedWith(defaultPicks());

    test('has art, and no two share a cell', () => {
        const cells = new Set();
        for (const t of TYPES) {
            const sp = ENEMY_SPRITES[t];
            assert.ok(sp, `${t} has no sprite`);
            cells.add(`${sp.sheet}:${sp.col},${sp.row}`);
        }
        assert.equal(cells.size, TYPES.length);
    });

    test('is named for its kind and has a plain examine line, no placeholder text', () => {
        for (const e of creatures) {
            assert.equal(e.name, e.type);
            assert.match(e.examine, /hostile and will fight you\.$/, e.type);
            assert.ok(!e.examine.includes('['), e.type);
        }
    });

    test('copies its numbers and kit from the nearest existing enemy', () => {
        const source = (file, id) => readJson(file).enemies.find(s => s.id === id);
        const from = {
            Raptor: source('graveyard-map.json', 'skel1'),
            Triceratops: source('sewer-map.json', 'e3'),
            'T. rex': source('sewer-map.json', 'e6'),
        };
        for (const e of creatures) {
            const s = from[e.type];
            assert.ok(s, `${e.type}: its source enemy moved`);
            const dressed = dressOne(s.armor, s.loadout, resolveItemDef);
            assert.deepEqual(
                [e.entity.maxHp, e.entity.armor, e.damage, e.gold, e.loadout],
                [s.hp, dressed.armor, s.damage, s.gold, dressed.loadout],
                e.type,
            );
        }
    });

    test('examining one says its own line, then the sheet', () => {
        for (const e of creatures) {
            e.x = 1; e.y = 1;
            const game = { enemies: [e], containers: [], groundItems: [], examinables: [], playerX: 0, playerY: 0, facing: 'down',
                map: { getTile: () => 0, isInBounds: () => true, propSpawns: [] } };
            const r = resolveExamine(game, 1, 1);
            assert.ok(JSON.stringify(r).includes(e.examine), `${e.type}: ${JSON.stringify(r)}`);
        }
    });
});

describe('the balance bench', () => {
    test('lists all three in the Valley with their copied numbers, once each', () => {
        const rows = loadMapRoster().filter(r => r.zone === 'valley');
        assert.deepEqual(rows.map(r => r.type).sort(), [...TYPES].sort());
        for (const row of rows) {
            const entry = Object.values(ENTRIES).find(e => e.type === row.type);
            assert.deepEqual([row.hp, row.armor, row.damage, row.gold], [entry.hp, entry.armor, entry.damage, entry.gold]);
        }
        assert.match(report(), /^valley +34$/m);
    });
});
