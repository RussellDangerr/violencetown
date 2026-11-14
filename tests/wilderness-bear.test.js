// wilderness-bear.test.js -- FD2: carrying Mola Cola into the Wilderness brings a bear for it
// (plans/fd2-wilderness-bear-for-cola.md). The walk in is done with real arrow keys through
// the real _doMove, lifted out of main.js (as burger-bears.test.js does).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GameMap, carriesAll } from '../game/map.js';
import { resolveItemDef } from '../game/item-registry.js';
import { addToInventory as addToInv } from '../game/inventory.js';
import { SAFE_SLOTS, MAX_STACK, PACK_PAGE } from '../game/data.js';
import { pickSlots, ENTRIES } from '../game/slots.js';
import { resolveEnemyTurns, WILDERNESS_BEAR } from '../game/enemies.js';
import { getGreedyStep } from '../game/pathing.js';
import { ENEMY_SPRITES } from '../game/sprites.js';
import { isHostile } from '../game/ai.js';
import { RNG } from '../game/rng.js';
import { INTERACTIONS, callWildernessBear } from '../game/interactions.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');

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
const loadJson = (url) => new GameMap(JSON.parse(readFileSync(fileURLToPath(new URL(`../game/${url}`, import.meta.url)), 'utf8')), url);


const { Game } = await import('../game/main.js');

class Key extends Event {
    constructor(type, code) {
        super(type, { bubbles: true, cancelable: true });
        this.code = code; this.key = code; this.repeat = false;
        this.ctrlKey = false; this.metaKey = false; this.altKey = false; this.shiftKey = false;
    }
}
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r)); };

async function makeGame(carry = []) {
    const document = new EventTarget();
    const window = new EventTarget();
    const g = {
        state: STATE.IDLE, facing: 'left', slots: pickSlots(7),
        playerX: 0, playerY: 0, inventory: [], equipment: {}, enemies: [], containers: [], examinables: [],
        groundItems: [], interactionNotes: [], _droppedItems: {},
        _tileDiffs: [], _heldDirKeys: [], _physicalHeld: new Set(), _queuedMoveDir: null,
        _animating: false, _animDuration: 1, _TURN_MS: 70, _turnTimer: null, _paused: false,
        _pendingTransition: null, _ratFormTurns: 0,
        playerHp: 100, playerMaxHp: 100, turn: 0, rng: new RNG(3), gold: 0, _MOVE_MS: 150,
        logs: [], blows: [],
        _log(m) { this.logs.push(m); },
        _render() {}, _onStepSettled() {}, _tryPickup() {}, _stopAutoRepeat() {},
        hasBuff() { return false; },
        _flash() {}, _triggerScreenShake() {}, _zoneChange() {},
        _spawnHitSplat() {}, _handleEnemyDeath() {}, _cascadeMark() {},
        _resolveItemDef: resolveItemDef,
        applyDamageToPlayer(raw, attacker) { this.blows.push({ by: attacker?.type, raw }); this.playerHp -= raw; return raw; },
        emitGameEvent() {},
        async _loadMap(url, spawnX, spawnY) {
            this.map = loadJson(url);
            this._mapUrl = url;
            this._molaPackCalled = false;
            this.enemies = [];
            this.groundItems = [];
            this.playerX = spawnX ?? this.map.spawn.x;
            this.playerY = spawnY ?? this.map.spawn.y;
        },
        _advanceWorld() {
            if (!this._pendingTransition) return;
            const t = this._pendingTransition;
            this._pendingTransition = null;
            this.state = STATE.RESOLVING;
            this._loadMap(t.toMap, t.toX, t.toY).then(() => {
                this._checkInteractions();
                this.state = STATE.IDLE;
            });
        },
        // one beat of the world: the real enemy turns, then the real interaction check
        beat() { this.turn++; resolveEnemyTurns(this); this._checkInteractions(); },
        drop(id) {
            const i = this.inventory.findIndex(s => s && s.itemDef.id === id);
            const stack = this.inventory[i];
            this.inventory[i] = null;
            for (let n = 0; n < stack.count; n++) this.groundItems.push({ type: id, x: this.playerX, y: this.playerY, def: stack.itemDef });
            this._checkInteractions();
        },
    };
    g._checkInteractions = Game.prototype._checkInteractions.bind(g);
    const free = {
        STATE, DIRS, audio, carriesAll, document, window, addToInv,
        SAFE_SLOTS, MAX_STACK, PACK_PAGE,
        requestAnimationFrame: (f) => queueMicrotask(() => f(Infinity)),
        performance: { now: () => 0 },
        setTimeout: () => 0,
    };
    for (const [n, p] of [
        ['_bindInput', ''], ['_noteHeld', 'code'], ['_faceOf', 'dir'], ['_clearTurnTimer', ''],
        ['_beginMoveOrTurn', 'dir'], ['_intendedWalkDir', ''], ['_resolveWalkStep', 'dir'],
        ['_animateMove', 'fromX, fromY, toX, toY, callback, duration = this._animDuration'],
        ['_doMove', 'dir'], ['_canEnter', 'x, y'],
    ]) g[n] = liveMethod(n, p, free);
    g._bindInput();
    g.press = async (code) => {
        document.dispatchEvent(new Key('keydown', code));
        document.dispatchEvent(new Key('keyup', code));
        await settle();
    };
    for (const id of carry) addToInv(g.inventory, resolveItemDef(id), { size: g.inventory.length, safeSlots: SAFE_SLOTS, maxStack: MAX_STACK, pageSize: PACK_PAGE });
    await g._loadMap('valley-map.json', 2, 9);
    return g;
}

const count = (g, id) => g.inventory.filter(s => s && s.itemDef.id === id).reduce((n, s) => n + s.count, 0);
const bears = (g) => g.enemies.filter(e => e._molaPack);

// Step left from the Valley onto the door (0,9): real arrow key, real zone change.
async function walkIn(g) {
    await g.press('ArrowLeft');
    await g.press('ArrowLeft');
    assert.equal(g._mapUrl, 'wilderness-map.json', `not in the Wilderness: ${g.logs.join(' | ')}`);
}

describe('the table row and the bear', () => {
    test('the Wilderness row sits beside the frozen one, with a placeholder note', () => {
        const row = INTERACTIONS.find(r => r.zone === 'wilderness-map.json');
        assert.ok(row);
        assert.equal(row.carry, 'mola_cola');
        assert.equal(row.note, '[TEXT]');
        assert.ok(INTERACTIONS.some(r => r.zone === 'frozen-map.json'), 'FD1 row kept');
    });

    test('the bear starts as the polar bear, wears the [Bear] stand-in name, and has art', () => {
        const polar = ENTRIES.polar_bear;
        for (const k of ['hp', 'armor', 'damage', 'gold', 'loadout']) assert.deepEqual(WILDERNESS_BEAR[k], polar[k], k);
        assert.equal(WILDERNESS_BEAR.name, '[Bear]');
        assert.ok(ENEMY_SPRITES[WILDERNESS_BEAR.type], 'the bear has a sprite entry');
    });
});

describe('walking into the Wilderness', () => {
    test('with Mola Cola in the bag, one bear comes in from the edge, once', async () => {
        const g = await makeGame(['mola_cola']);
        assert.equal(count(g, 'mola_cola'), 1);
        await walkIn(g);
        assert.equal(bears(g).length, 1);
        const [b] = bears(g);
        assert.equal(b.type, WILDERNESS_BEAR.type);
        assert.ok(isHostile(b));
        assert.equal(b.state, 'chasing');
        const m = g.map;
        assert.ok(b.x <= 1 || b.y <= 1 || b.x >= m.width - 2 || b.y >= m.height - 2, 'on the edge');
        assert.deepEqual(g.interactionNotes, ['mola_cola_wilderness']);
        assert.equal(g.logs.filter(l => l === '[TEXT]').length, 1, 'the note shows once');
        for (let i = 0; i < 3; i++) g.beat();
        assert.equal(bears(g).length, 1, 'no more come while you stay');
    });

    test('with only a burger, or nothing, no bear comes', async () => {
        for (const carry of [['burger_fries'], []]) {
            const g = await makeGame(carry);
            await walkIn(g);
            for (let i = 0; i < 3; i++) g.beat();
            assert.equal(bears(g).length, 0, `carrying ${JSON.stringify(carry)}`);
        }
    });

    test('the bear hits for real; dropping the cola sends it away with the can', async () => {
        const g = await makeGame(['mola_cola', 'burger_fries']);
        await walkIn(g);
        const hp = g.playerHp;
        for (let i = 0; i < 40; i++) g.beat();
        assert.ok(g.blows.length >= 1, 'no blow landed');
        assert.ok(g.blows.every(b => b.by === WILDERNESS_BEAR.type && b.raw > 0));
        assert.ok(g.playerHp < hp);
        g.drop('mola_cola');
        assert.equal(bears(g).length, 0, 'gone');
        assert.equal(g.groundItems.filter(i => i.type === 'mola_cola').length, 0, 'took the can');
        assert.equal(count(g, 'burger_fries'), 1);
    });
});

describe('wherever you come in, the bear finds a way to you', () => {
    test('from each of the three doors, the bear spawns where the chase can reach you', () => {
        for (const [x, y] of [[16, 6], [8, 2], [1, 6]]) {
            const g = { map: loadJson('wilderness-map.json'), playerX: x, playerY: y, enemies: [], _molaPackCalled: false };
            callWildernessBear(g);
            assert.equal(g.enemies.length, 1, `entering at ${x},${y}`);
            const b = g.enemies[0];
            for (let i = 0; i < 60 && Math.max(Math.abs(b.x - x), Math.abs(b.y - y)) > 1; i++) {
                const step = getGreedyStep(g, { x: b.x, y: b.y }, { x, y }, { self: b });
                assert.ok(step, `stuck at ${b.x},${b.y} entering at ${x},${y}`);
                b.x = step.x; b.y = step.y;
            }
            assert.ok(Math.max(Math.abs(b.x - x), Math.abs(b.y - y)) <= 1, `never arrived entering at ${x},${y}`);
        }
    });
});
