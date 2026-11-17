// tunnels-map.test.js -- MO1: search one grave in the Graveyard, fall into the Tunnels, meet the
// Molemen, walk out through the Wilderness (plans/mo1-molemen-tunnels.md). The walk is done with
// real keys through the real _doMove, _bindInput and _fallThrough, lifted out of main.js (as
// burger-bears.test.js does), from the Graveyard round to the Graveyard.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GameMap, carriesAll } from '../game/map.js';
import { resolveItemDef } from '../game/item-registry.js';
import { pickSlots, resolveSpawn, ENTRIES } from '../game/slots.js';
import { resolveEnemyTurns, spawnEnemy } from '../game/enemies.js';
import { isHostile } from '../game/ai.js';
import { RNG } from '../game/rng.js';
import { doExamine, resolveExamine } from '../game/examine.js';
import { WORLD_ZONES, zoneByName, overworldZone, connectorPairs } from '../game/world-map.js';
import { ENEMY_SPRITES } from '../game/sprites.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const read = (f) => readFileSync(fileURLToPath(new URL(`../game/${f}`, import.meta.url)), 'utf8');
const mainSrc = read('main.js');
const loadJson = (url) => new GameMap(JSON.parse(read(url)), url);

function liveMethod(name, params, freeVars = {}) {
    const signature = `${name}(${params}) {`;
    const at = mainSrc.indexOf(signature);
    assert.ok(at > 0, `${name}(${params}) not found in main.js`);
    const closeAt = mainSrc.indexOf('\n    }', at);
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

const { Game } = await import('../game/main.js');

class Key extends Event {
    constructor(type, code) {
        super(type, { bubbles: true, cancelable: true });
        this.code = code; this.key = code; this.repeat = false;
        this.ctrlKey = false; this.metaKey = false; this.altKey = false; this.shiftKey = false;
    }
}
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r)); };

const TUNNELS = 'tunnels-map.json';
const GRAVE = { x: 23, y: 23 };

async function makeGame() {
    const document = new EventTarget();
    const window = new EventTarget();
    const g = {
        state: STATE.IDLE, facing: 'up', slots: pickSlots(7),
        playerX: 0, playerY: 0, inventory: [], equipment: {}, enemies: [], containers: [], examinables: [],
        groundItems: [], interactionNotes: [], _droppedItems: {},
        _tileDiffs: [], _heldDirKeys: [], _physicalHeld: new Set(), _queuedMoveDir: null,
        _animating: false, _animDuration: 1, _TURN_MS: 70, _turnTimer: null, _paused: false,
        _pendingTransition: null, _ratFormTurns: 0,
        playerHp: 100, playerMaxHp: 100, turn: 0, rng: new RNG(3), gold: 0, _MOVE_MS: 150,
        logs: [], blows: [], events: [], loads: [],
        _log(m) { this.logs.push(m); },
        _render() {}, _onStepSettled() {}, _tryPickup() {}, _stopAutoRepeat() {},
        hasBuff() { return false; },
        _flash() {}, _triggerScreenShake() {}, _zoneChange() {},
        _spawnHitSplat() {}, _handleEnemyDeath() {}, _cascadeMark() {},
        _resolveItemDef: resolveItemDef,
        _captureFollowers: () => [],
        _digitToSlot: () => -1,
        _targetAt: () => null,
        autosave() {},
        applyDamageToPlayer(raw, attacker) { this.blows.push({ by: attacker?.type, raw }); this.playerHp -= raw; return raw; },
        emitGameEvent(type, data) { this.events.push({ type, ...data }); },
        async _loadMap(url, spawnX, spawnY) {
            this.loads.push(url);
            this.map = loadJson(url);
            this._mapUrl = url;
            this.groundItems = [];
            this.examinables = this.map.examinableSpawns.map(e => ({ ...e }));
            this.enemies = this.map.enemySpawns.map(s => spawnEnemy(resolveSpawn(s, this.slots)));
            this.playerX = spawnX ?? this.map.spawn.x;
            this.playerY = spawnY ?? this.map.spawn.y;
        },
        // the turn end's door: the real code is lifted too, so the doors are the real doors
        _advanceWorld() {
            if (!this._pendingTransition) return;
            const t = this._pendingTransition;
            this._pendingTransition = null;
            this.state = STATE.RESOLVING;
            this._loadMap(t.toMap, t.toX, t.toY).then(() => { this.state = STATE.IDLE; });
        },
        beat() { this.turn++; resolveEnemyTurns(this); },
    };
    const free = {
        STATE, DIRS, audio, document, window, doExamine, carriesAll,
        requestAnimationFrame: (f) => queueMicrotask(() => f(Infinity)),
        performance: { now: () => 0 },
        setTimeout: () => 0,
    };
    for (const [n, p] of [
        ['_bindInput', ''], ['_noteHeld', 'code'], ['_faceOf', 'dir'], ['_clearTurnTimer', ''],
        ['_beginMoveOrTurn', 'dir'], ['_intendedWalkDir', ''], ['_resolveWalkStep', 'dir'],
        ['_animateMove', 'fromX, fromY, toX, toY, callback, duration = this._animDuration'],
        ['_doMove', 'dir'], ['_canEnter', 'x, y'], ['_fallThrough', 'inst'],
    ]) g[n] = liveMethod(n, p, free);
    g._bindInput();
    g.press = async (code) => {
        document.dispatchEvent(new Key('keydown', code));
        document.dispatchEvent(new Key('keyup', code));
        await settle();
    };
    return g;
}

const ARROW = { '1,0': 'ArrowRight', '-1,0': 'ArrowLeft', '0,1': 'ArrowDown', '0,-1': 'ArrowUp' };

// Walk to the tile (tx, ty) on the loaded map by keys: a shortest path round the walls, one real
// arrow press per step. Stops early if the map changes under it (a door was taken).
async function walkTo(g, tx, ty) {
    const url = g._mapUrl, map = g.map;
    const prev = new Map([[`${g.playerX},${g.playerY}`, null]]);
    const queue = [[g.playerX, g.playerY]];
    while (queue.length && !prev.has(`${tx},${ty}`)) {
        const [cx, cy] = queue.shift();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx, ny = cy + dy, k = `${nx},${ny}`;
            if (prev.has(k) || !map.isInBounds(nx, ny)) continue;
            if (!(nx === tx && ny === ty) && !map.isWalkable(nx, ny)) continue;
            prev.set(k, [cx, cy]);
            queue.push([nx, ny]);
        }
    }
    assert.ok(prev.has(`${tx},${ty}`), `no way on foot to (${tx},${ty}) in ${url}`);
    const path = [];
    for (let at = [tx, ty]; at; at = prev.get(`${at[0]},${at[1]}`)) path.unshift(at);
    for (let i = 1; i < path.length; i++) {
        if (g._mapUrl !== url) return;
        const key = ARROW[`${path[i][0] - path[i - 1][0]},${path[i][1] - path[i - 1][1]}`];
        await g.press(key);
        // a tap that only turned you to face the way: tap again to step
        if (g._mapUrl === url && g.playerX === path[i - 1][0] && g.playerY === path[i - 1][1]) await g.press(key);
    }
}

describe('the grave', () => {
    const graveyard = JSON.parse(read('graveyard-map.json'));

    test('one examinable at (23,23) drops you into the Tunnels; no other does', () => {
        const falls = graveyard.examinables.filter(e => e.fallTo);
        assert.equal(falls.length, 1);
        assert.deepEqual([falls[0].x, falls[0].y], [GRAVE.x, GRAVE.y]);
        assert.equal(falls[0].fallTo.toMap, TUNNELS);
        const tunnels = loadJson(TUNNELS);
        assert.ok(tunnels.isWalkable(falls[0].fallTo.toX, falls[0].fallTo.toY), 'the landing is open ground');
    });

    test('the other graves answer as before', () => {
        const game = { map: loadJson('graveyard-map.json'), examinables: graveyard.examinables, enemies: [], containers: [], groundItems: [] };
        for (const p of graveyard.props.filter(p => /gravestone/i.test(p.type) && !(p.x === GRAVE.x && p.y === GRAVE.y))) {
            const res = resolveExamine(game, p.x, p.y);
            if (game.examinables.some(e => e.x === p.x && e.y === p.y)) continue;
            assert.equal(res.fallInstance ?? null, null, `${p.type} at (${p.x},${p.y})`);
            assert.ok(res.body.startsWith('['), `${p.type} at (${p.x},${p.y}): ${res.body}`);
        }
    });
});

describe('the Tunnels', () => {
    const map = loadJson(TUNNELS);

    test('is a map called Tunnels with two Molemen placed by hand', () => {
        assert.equal(map.zoneName, 'Tunnels');
        const spawns = map.enemySpawns;
        assert.equal(spawns.length, 2);
        assert.ok(spawns.every(s => s.entry === 'moleman'));
        assert.ok(ENTRIES.moleman, 'the registry has the Moleman');
        assert.ok(ENEMY_SPRITES.Moleman, 'the Moleman has art');
    });

    test('the Molemen are born hostile and carry a kit', () => {
        const slots = pickSlots(7);
        for (const s of map.enemySpawns) {
            const e = spawnEnemy(resolveSpawn(s, slots));
            assert.equal(e.type, 'Moleman');
            assert.ok(isHostile(e));
            assert.ok(e.loadout.length > 0);
        }
    });

    test('the far door lands in the Wilderness on open ground, not on a door', () => {
        const wild = loadJson('wilderness-map.json');
        const doors = map.transitions.filter(t => t.toMap === 'wilderness-map.json');
        assert.ok(doors.length);
        for (const d of doors) {
            assert.ok(wild.isWalkable(d.toX, d.toY));
            assert.equal(wild.getTransition(d.toX, d.toY), null);
            assert.ok(d.toX >= wild.width - 4, 'against the east wall');
        }
    });

    test('there is no way up to the Graveyard', () => {
        assert.deepEqual(map.transitions.filter(t => t.toMap === 'graveyard-map.json'), []);
    });

    test('every door out can be walked to from the landing', () => {
        const g = new Set([`${map.spawn.x},${map.spawn.y}`]);
        const queue = [[map.spawn.x, map.spawn.y]];
        while (queue.length) {
            const [cx, cy] = queue.shift();
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = cx + dx, ny = cy + dy;
                if (g.has(`${nx},${ny}`) || !map.isInBounds(nx, ny) || !map.isWalkable(nx, ny)) continue;
                g.add(`${nx},${ny}`);
                queue.push([nx, ny]);
            }
        }
        assert.ok(map.transitions.every(t => g.has(`${t.x},${t.y}`)));
        for (const s of map.enemySpawns) assert.ok(g.has(`${s.x},${s.y}`), `${s.id} is on the walkable piece`);
    });

    test('the Wilderness has a door into it that lands on open ground', () => {
        const wild = loadJson('wilderness-map.json');
        const doors = wild.transitions.filter(t => t.toMap === TUNNELS);
        assert.ok(doors.length);
        for (const d of doors) {
            assert.ok(map.isWalkable(d.toX, d.toY));
            assert.equal(map.getTransition(d.toX, d.toY), null);
            assert.ok(wild.isWalkable(d.x - 1, d.y), 'the doorway is open ground');
        }
    });
});

describe('the Map tab', () => {
    test('joins the Tunnels to the Graveyard and the Wilderness', () => {
        const z = zoneByName('Tunnels');
        assert.ok(z);
        assert.deepEqual([...z.connects].sort(), ['GRAVEYARD', 'WILDERNESS']);
        const pairs = connectorPairs().map(p => [...p].sort().join('|'));
        assert.ok(pairs.includes('GRAVEYARD|TUNNELS'));
        assert.ok(pairs.includes('TUNNELS|WILDERNESS'));
        assert.ok(zoneByName('GRAVEYARD').connects.includes('TUNNELS'));
        assert.ok(zoneByName('WILDERNESS').connects.includes('TUNNELS'));
    });

    test('"you are here" lands on the Tunnels box while you are in the map', () => {
        assert.equal(overworldZone(loadJson(TUNNELS).zoneName), 'TUNNELS');
    });

    test('the box has a spot of its own', () => {
        const at = new Set(WORLD_ZONES.map(z => `${z.col},${z.row}`));
        assert.equal(at.size, WORLD_ZONES.length, 'two boxes share a spot');
    });
});

describe('the walk, with real keys', () => {
    test('Graveyard, search the grave, fall, walk out, and back to the Graveyard', async () => {
        const g = await makeGame();
        await g._loadMap('graveyard-map.json', GRAVE.x, GRAVE.y + 1);
        g.facing = 'up';
        assert.equal(g._mapUrl, 'graveyard-map.json');

        // search the grave: the real E key
        await g.press('KeyE');
        assert.equal(g._mapUrl, TUNNELS, `did not fall: ${g.logs.join(' | ')}`);
        assert.equal(g.state, STATE.IDLE);
        assert.ok(g.logs.some(l => /grave/i.test(l)), 'the fall is said');
        assert.deepEqual([g.playerX, g.playerY], [g.map.spawn.x, g.map.spawn.y]);
        assert.equal(g.enemies.filter(e => e.type === 'Moleman').length, 2);

        // out through the far door, by the arrow keys, with the Molemen asleep (not beaten)
        g.enemies = [];
        await walkTo(g, 27, 6);
        assert.equal(g._mapUrl, 'wilderness-map.json', `not out: ${g.logs.join(' | ')}`);

        // and home: north out of the Wilderness to the Graveyard
        await walkTo(g, 8, 0);
        assert.equal(g._mapUrl, 'graveyard-map.json');
        assert.deepEqual(g.loads, ['graveyard-map.json', TUNNELS, 'wilderness-map.json', 'graveyard-map.json']);
    });

    test('the Wilderness door leads back down into the Tunnels', async () => {
        const g = await makeGame();
        await g._loadMap('wilderness-map.json', 15, 10);
        await walkTo(g, 17, 10);
        assert.equal(g._mapUrl, TUNNELS);
    });
});

describe('the Molemen', () => {
    test('hunt you, hit for real, and can be fought to the end', async () => {
        const g = await makeGame();
        await g._loadMap(TUNNELS);
        g.playerX = 15; g.playerY = 6;
        const molemen = g.enemies.filter(e => e.type === 'Moleman');
        assert.equal(molemen.length, 2);
        for (let i = 0; i < 40 && g.blows.length < 2; i++) g.beat();
        assert.ok(g.blows.length >= 2, `only ${g.blows.length} blows landed`);
        assert.ok(g.blows.every(b => b.by === 'Moleman' && b.raw > 0));
        assert.ok(molemen.some(e => Math.max(Math.abs(e.x - 15), Math.abs(e.y - 6)) <= 1), 'one came to you');
        for (const e of molemen) {
            assert.ok(e.entity.isAlive());
            e.entity.takeDamage(1e6);
            assert.ok(!e.entity.isAlive(), 'a Moleman can be beaten');
        }
    });
});
