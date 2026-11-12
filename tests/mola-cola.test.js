// mola-cola.test.js -- FD3: Mola Cola exists, an item you can carry and drink
// (plans/fd3-mola-cola-drink.md).
//
// Your boss hands over the burger bag and a can on the first crossing. The crossing is
// walked with real arrow keys through the real _doMove / cutscene methods lifted out of
// main.js (as taxi-crash.test.js does). The can heals when drunk, vendors refuse it until
// the delivery is done, and it survives a save.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GameMap, carriesAll } from '../game/map.js';
import { QuestEngine } from '../game/quests.js';
import { ITEMS, resolveUse } from '../game/items.js';
import { resolveItemDef, ALL_ITEM_IDS } from '../game/item-registry.js';
import { ITEM_SPRITES } from '../game/sprites.js';
import { saleLocked, sellPrice } from '../game/trade.js';
import { validateContent } from '../game/content-validate.js';
import { serialize, loadInto } from '../game/save.js';
import { addToInventory as addToInv } from '../game/inventory.js';
import { SAFE_SLOTS, MAX_STACK, PACK_PAGE } from '../game/data.js';

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

class Key extends Event {
    constructor(type, code) {
        super(type, { bubbles: true, cancelable: true });
        this.code = code; this.key = code; this.repeat = false;
        this.ctrlKey = false; this.metaKey = false; this.altKey = false; this.shiftKey = false;
    }
}
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r)); };

async function makeGame() {
    const document = new EventTarget();
    const window = new EventTarget();
    const timers = [];
    const g = {
        state: STATE.IDLE, facing: 'up', carFuel: 'alcohol',
        playerX: 0, playerY: 0, inventory: [], enemies: [], containers: [], examinables: [],
        _tileDiffs: [], _heldDirKeys: [], _physicalHeld: new Set(), _queuedMoveDir: null,
        _animating: false, _animDuration: 1, _TURN_MS: 70, _turnTimer: null, _paused: false,
        _pendingTransition: null, _ratFormTurns: 0,
        playerHp: 20, playerMaxHp: 100,
        logs: [], timers,
        _log(m) { this.logs.push(m); },
        _render() {}, _onStepSettled() {}, _tryPickup() {}, _stopAutoRepeat() {},
        hasBuff() { return false; },
        _flash() {}, _triggerScreenShake() {}, _zoneChange() {},
        _resolveItemDef: resolveItemDef,
        emitGameEvent(type, payload) { this.questEngine.emit(type, payload); },
        async _loadMap(url, spawnX, spawnY) {
            this.map = loadJson(url);
            this._mapUrl = url;
            this.playerX = spawnX ?? this.map.spawn.x;
            this.playerY = spawnY ?? this.map.spawn.y;
            this._tileDiffs = [];
            this.examinables = this.map.examinableSpawns.map(e => ({ ...e }));
            this._openBridgeIfCarFixed();
        },
        _advanceWorld() {
            if (!this._pendingTransition) return;
            const t = this._pendingTransition;
            this._pendingTransition = null;
            this.state = STATE.RESOLVING;
            this._loadMap(t.toMap, t.toX, t.toY).then(() => {
                this.state = STATE.IDLE;
                this.emitGameEvent('map_entered', { map: t.toMap });
            });
        },
    };
    const free = {
        STATE, DIRS, audio, carriesAll, document, window, addToInv,
        SAFE_SLOTS, MAX_STACK, PACK_PAGE,
        saleLocked, SALE_LOCK_REFUSAL: '[TEXT]',
        requestAnimationFrame: (f) => queueMicrotask(() => f(Infinity)),
        performance: { now: () => 0 },
        setTimeout: (f) => { timers.push(f); return timers.length; },
    };
    for (const [n, p] of [
        ['_bindInput', ''], ['_noteHeld', 'code'], ['_faceOf', 'dir'], ['_clearTurnTimer', ''],
        ['_beginMoveOrTurn', 'dir'], ['_intendedWalkDir', ''], ['_resolveWalkStep', 'dir'],
        ['_animateMove', 'fromX, fromY, toX, toY, callback, duration = this._animDuration'],
        ['_doMove', 'dir'], ['_canEnter', 'x, y'], ['setTile', 'x, y, id'],
        ['_openBridgeIfCarFixed', ''], ['_playBridgeCutscene', ''], ['_crashToCanyon', ''],
        ['_rampToDowntown', ''], ['_startMainQuest2', ''], ['_bossHandsOver', ''],
        ['_grantItem', 'id, msg'], ['_addToInventory', 'itemDef'], ['_canStageGive', 'entry'],
    ]) g[n] = liveMethod(n, p, n === '_beginMoveOrTurn' ? { ...free, setTimeout: () => 0 } : free);
    g.questEngine = new QuestEngine(g);
    g._bindInput();
    g.press = async (code) => {
        document.dispatchEvent(new Key('keydown', code));
        document.dispatchEvent(new Key('keyup', code));
        await settle();
    };
    g.flushCutscene = async () => { while (timers.length) timers.shift()(); await settle(); };
    await g._loadMap('town-map.json');
    g.questEngine.forceComplete('fix_car');
    return g;
}

const holds = (g, id) => g.inventory.some(s => s && s.itemDef.id === id);
const count = (g, id) => g.inventory.filter(s => s && s.itemDef.id === id).reduce((n, s) => n + s.count, 0);

async function walkToBridge(g) {
    if (g.playerX === 16) {
        await g.press('ArrowLeft'); await g.press('ArrowLeft');
        await g.press('ArrowUp');
    }
    for (let i = 0; i < 40 && g.state === STATE.IDLE && g.playerY > 0; i++) await g.press('ArrowUp');
}

describe('the can as an item', () => {
    test('exists, is food, heals like the cheapest food, and is not a quest item', () => {
        const d = ITEMS.mola_cola;
        assert.ok(d && ALL_ITEM_IDS.has('mola_cola'));
        assert.equal(d.category, 'ambro');
        assert.equal(d.healAmount, ITEMS.hot_dog.healAmount);
        assert.ok(!d.questItem, 'it can be dropped and drunk');
        assert.equal(d.description, '[TEXT]');
        assert.ok(ITEM_SPRITES.mola_cola, 'has an icon');
    });

    test('drinking heals, and the content check knows about sale locks', () => {
        const g = { playerHp: 20, playerMaxHp: 100, hasBuff: () => false };
        const msg = resolveUse(g, ITEMS.mola_cola, 'up');
        assert.equal(g.playerHp, 20 + ITEMS.mola_cola.healAmount);
        assert.ok(msg);
        const { problems } = validateContent([]);
        assert.deepEqual(problems.filter(p => p.includes('mola_cola')), []);
        const bad = validateContent([], { items: { x: { id: 'x', saleLockedUntil: 'nope' } } });
        assert.ok(bad.problems.some(p => p.includes("'nope'")), 'a lock on a missing quest is caught');
    });
});

describe('your boss hands over the bag and the can on the first crossing', () => {
    test('walking onto the bridge with real keys gives both, once', async () => {
        const g = await makeGame();
        assert.ok(!holds(g, 'mola_cola') && !holds(g, 'burger_fries'));
        await walkToBridge(g);
        assert.ok(holds(g, 'burger_fries'), `bag: ${g.logs.join(' | ')}`);
        assert.ok(holds(g, 'mola_cola'));
        await g.flushCutscene();
        assert.equal(g.questEngine.state.flags.bossHandedOver, true);
        g._bossHandsOver();
        assert.equal(count(g, 'mola_cola'), 1, 'asking again gives nothing more');
    });

    test('the delivery then starts past the pick-up step', async () => {
        const g = await makeGame();
        await walkToBridge(g);
        await g.flushCutscene();
        assert.ok(g.questEngine.isActive('deliver_burger'), 'the ramp started the delivery');
        assert.notEqual(g.questEngine.currentStageId(), 'get_burger');
    });

    test('the crash route carries it too', async () => {
        const g = await makeGame();
        g.carFuel = 'raw';
        await walkToBridge(g);
        await g.flushCutscene();
        assert.ok(holds(g, 'mola_cola'));
    });
});

describe('vendors will not buy the can until the delivery is done', () => {
    test('the offer refuses it, then takes it once the delivery is complete', async () => {
        const g = await makeGame();
        g._offerNpc = { id: 'v' };
        const entry = { def: ITEMS.mola_cola };
        assert.equal(saleLocked(ITEMS.mola_cola, g), true);
        assert.equal(g._canStageGive(entry), false);
        assert.equal(g.logs.at(-1), '[TEXT]');
        g.questEngine.forceComplete('deliver_burger');
        assert.equal(saleLocked(ITEMS.mola_cola, g), false);
        assert.equal(g._canStageGive(entry), true);
        assert.ok(sellPrice(ITEMS.mola_cola, 40) > 0, 'it then has a price');
    });

    test('other food is not locked', () => {
        assert.equal(saleLocked(ITEMS.hot_dog, {}), false);
    });
});

describe('a save with the can in the bag', () => {
    test('reloads with it', async () => {
        const mk = (held) => {
            const g = {
                inventory: held.map(id => ({ itemDef: resolveItemDef(id), count: 1 })), _log() {}, turn: 0, gold: 0,
                playerX: 1, playerY: 1, playerHp: 100, playerMaxHp: 100, playerMp: 10, playerMaxMp: 10, facing: 'down',
                equipment: { weapon: null, left: null, top: null, bottom: null, front: null, back: null, sides: null },
                tempEquips: [], buffs: [], groundItems: [], containers: [], enemies: [],
                _tileDiffs: [], _pendingTransition: null, _sewerEscape: null, selectedSlot: -1, state: 'idle',
                rng: { s: 1, getState() { return this.s; }, setState(s) { this.s = s; } },
                map: { url: 'town-map.json', width: 20, height: 15, zoneName: 'Town', isInBounds: () => true },
                _resolveItemDef: resolveItemDef,
                async _loadMap() {}, setTile() {}, _render() {},
            };
            g.questEngine = new QuestEngine(g);
            return g;
        };
        const src = mk(['mola_cola']);
        const dst = mk([]);
        await loadInto(dst, JSON.parse(JSON.stringify(serialize(src))));
        assert.ok(dst.inventory.some(s => s && s.itemDef.id === 'mola_cola'));
    });
});
