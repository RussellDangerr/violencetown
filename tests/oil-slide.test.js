// oil-slide.test.js — TX6: oil spread at the bridge, and the next ramp landing slides
// through the Downtown gate (plans/tx6-oil-slide-gate.md).
//
// Same stand-in game as taxi-crash.test.js: the real _doMove, cutscene, landing and
// gate methods lifted out of main.js, the real maps and quest engine, every step a real
// key. Oil is granted (it is not for sale until TX7). Every line is the placeholder [TEXT].

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GameMap, carriesAll } from '../game/map.js';
import { QuestEngine } from '../game/quests.js';
import { ITEMS, canStandOn } from '../game/items.js';
import { contextualUses } from '../game/item-uses.js';

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

const loadJson = (url) => new GameMap(JSON.parse(readFileSync(fileURLToPath(new URL(`../game/${url}`, import.meta.url)), 'utf8')), url);

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

// A game standing in the old town with the car fixed, bound to the real methods.
async function makeGame({ fuel = 'raw' } = {}) {
    const document = new EventTarget();
    const window = new EventTarget();
    const timers = [];   // the cutscene's beat before the map loads: flushed by hand
    const g = {
        state: STATE.IDLE, facing: 'up', carFuel: fuel,
        playerX: 0, playerY: 0, inventory: new Array(20).fill(null), enemies: [], containers: [], examinables: [],
        _tileDiffs: [], _heldDirKeys: [], _physicalHeld: new Set(), _queuedMoveDir: null,
        _animating: false, _animDuration: 1, _TURN_MS: 70, _turnTimer: null, _paused: false,
        _pendingTransition: null, _ratFormTurns: 0,
        logs: [], shakes: 0, flashes: 0, beats: 0, zoneChanges: 0, saves: 0, timers,
        _log(m) { this.logs.push(m); },
        autosave() { this.saves++; },
        _grantItem(id) {
            const i = this.inventory.findIndex(s => !s);
            this.inventory[i] = { itemDef: ITEMS[id], count: 1 };
            return true;
        },
        _render() {}, _onStepSettled() {}, _tryPickup() {}, _stopAutoRepeat() {},
        hasBuff() { return false; },
        _flash() { this.flashes++; },
        _triggerScreenShake() { this.shakes++; },
        _zoneChange() { this.zoneChanges++; },
        emitGameEvent(type, payload) { this.questEngine.emit(type, payload); },
        async _loadMap(url, spawnX, spawnY) {
            this.map = loadJson(url);
            this._mapUrl = url;
            this.playerX = spawnX ?? this.map.spawn.x;
            this.playerY = spawnY ?? this.map.spawn.y;
            this._tileDiffs = [];
            this.examinables = this.map.examinableSpawns.map(e => ({ ...e }));
            this._openBridgeIfCarFixed();
            this._openDowntownGateIfSlid();
        },
        // Stand-in world beat: carries out a queued map change as _advanceWorldOnce's tail does.
        _advanceWorld() {
            this.beats++;
            if (!this._pendingTransition) return;
            const t = this._pendingTransition;
            this._pendingTransition = null;
            this._log(t.label || '[Transitioning...]');
            this.state = STATE.RESOLVING;
            this._zoneChange();
            this._loadMap(t.toMap, t.toX, t.toY).then(() => {
                this.state = STATE.IDLE;
                this.emitGameEvent('map_entered', { map: t.toMap });
            });
        },
    };
    const free = {
        STATE, DIRS, audio, carriesAll, canStandOn, document, window,
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
        ['_rampToDowntown', ''], ['_startMainQuest2', ''], ['_rideTo', 'toMap, toX, toY'],
        ['_oilSlideDue', ''], ['_oilSlideSpawn', ''], ['_oilSlideDone', ''], ['_openDowntownGateIfSlid', ''],
        ['_interactCar', ''], ['_removeFromSlot', 'slot'],
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
    g.questEngine.forceComplete('fix_car');   // the car runs: carFixed, and the barricade opens
    return g;
}

const stock = (g, id) => g.inventory.filter(s => s && s.itemDef.id === id).reduce((n, s) => n + s.count, 0);
const flag = (g, k) => g.questEngine.state.flags[k];

// The oil use, the way the hotbar overlay finds it: beside the taxi, facing it.
function oilUse(g) {
    g._targetAt = (x, y) => {
        const e = g.examinables.find(q => q.x === x && q.y === y);
        return e ? { x, y, npc: null, item: null, examinable: e, container: null } : null;
    };
    const slot = g.inventory.findIndex(s => s && s.itemDef.id === 'oil');
    const [use] = contextualUses(ITEMS.oil, g);
    return { use, slot };
}
function spread(g) {
    g.playerX = 15; g.playerY = 2; g.facing = 'right';   // beside the taxi at the bridge
    const { use, slot } = oilUse(g);
    assert.ok(use, 'oil has a use beside the taxi');
    use.apply(g, use.target, { slot });
}

const walkNorth = async (g) => {
    g.playerX = 15; g.playerY = 4; g.facing = 'up';
    for (let i = 0; i < 30 && g._mapUrl === 'town-map.json' && g.state === STATE.IDLE; i++) await g.press('ArrowUp');
    await g.flushCutscene();
};

// The alcohol, poured with a real bump into the taxi, then walked north over the bridge.
async function pourAndCross(g) {
    g.playerX = 15; g.playerY = 3; g.facing = 'right';
    await g.press('ArrowRight');
    await g.press('ArrowRight');
    assert.equal(g.carFuel, 'alcohol', 'the bump poured the bottle');
    await walkNorth(g);
}

describe('spreading the oil', () => {
    for (const fixed of [false, true]) {
        test(`spends one, sets the flag and logs, Converter ${fixed ? 'fitted' : 'not fitted'}`, async () => {
            const g = await makeGame();
            if (!fixed) g.questEngine.state.flags.carFixed = false;
            g._grantItem('oil'); g._grantItem('oil');
            const before = g.logs.length;
            spread(g);
            assert.equal(stock(g, 'oil'), 1);
            assert.equal(flag(g, 'oilSpread'), true);
            assert.deepEqual(g.logs.slice(before), ['[TEXT]']);
        });
    }

    test('a second use spends nothing and says so', async () => {
        const g = await makeGame();
        g._grantItem('oil'); g._grantItem('oil');
        spread(g);
        const before = g.logs.length;
        spread(g);
        assert.equal(stock(g, 'oil'), 1, 'the second bottle is kept');
        assert.deepEqual(g.logs.slice(before), ['[TEXT]']);
    });

    test('oil has no use away from the bridge and the taxi', async () => {
        const g = await makeGame();
        g._grantItem('oil');
        g.playerX = 10; g.playerY = 10; g.facing = 'right';
        assert.equal(oilUse(g).use, undefined);
    });

    test('the item is a placeholder worth 35', () => {
        assert.equal(ITEMS.oil.baseValue, 35);
        assert.equal(ITEMS.oil.name, '[TEXT: Oil]');
    });
});

describe('the slide', () => {
    test('a ramp landing with oil spread opens the gate and stands you beside it; walk through to the area', async () => {
        const g = await makeGame();
        g._grantItem('oil'); g._grantItem('alcohol');
        spread(g);
        await pourAndCross(g);
        assert.equal(g._mapUrl, 'downtown-map.json');
        assert.equal(g.questEngine.bridgeRoute(), 'ramp');
        assert.equal(flag(g, 'downtownGateOpen'), true);
        assert.deepEqual([g.playerX, g.playerY], [1, 9], 'beside the gate');
        assert.equal(g.map.getTile(0, 9) === 17 ? 'fence' : 'road', 'road');
        assert.ok(g.saves >= 1, 'the open gate is saved');
        g.facing = 'left';
        await g.press('ArrowLeft');
        await g.flushCutscene();
        assert.equal(g._mapUrl, 'side-area-map.json', 'through the gate to the TX5 area');
    });

    test('a ramp landing with no oil does not slide', async () => {
        const g = await makeGame();
        g._grantItem('alcohol');
        await pourAndCross(g);
        assert.equal(g._mapUrl, 'downtown-map.json');
        assert.deepEqual([g.playerX, g.playerY], [g.map.spawn.x, g.map.spawn.y]);
        assert.equal(g.map.getTile(0, 9), 17, 'the fence holds');
        assert.equal(flag(g, 'downtownGateOpen'), undefined);
    });

    test('a crash still crashes and the oil stays spread for the next landing', async () => {
        const g = await makeGame({ fuel: 'raw' });
        g._grantItem('oil');
        spread(g);
        await walkNorth(g);
        assert.equal(g._mapUrl, 'canyon-map.json');
        assert.equal(flag(g, 'oilSpread'), true, 'still spread');
        assert.equal(flag(g, 'downtownGateOpen'), undefined, 'no slide in a crash');
        // The next landing is a later taxi ride to Downtown: it slides.
        g._rideTo('downtown-map.json');
        await g.flushCutscene();
        assert.equal(g._mapUrl, 'downtown-map.json');
        assert.deepEqual([g.playerX, g.playerY], [1, 9]);
        assert.notEqual(g.map.getTile(0, 9), 17);
    });

    test('the gate stays open after leaving Downtown, a save and a CONTINUE', async () => {
        const g = await makeGame();
        g._grantItem('oil'); g._grantItem('alcohol');
        spread(g);
        await pourAndCross(g);
        await g._loadMap('town-map.json');
        g._rideTo('downtown-map.json');
        await g.flushCutscene();
        assert.notEqual(g.map.getTile(0, 9), 17, 'open again on re-entry');
        assert.deepEqual([g.playerX, g.playerY], [g.map.spawn.x, g.map.spawn.y], 'no second slide');
        // A save round trip carries the flag; a fresh Downtown load re-derives the gate.
        const saved = JSON.parse(JSON.stringify(g.questEngine.serialize()));
        const g2 = await makeGame();
        g2.questEngine.restore(saved);
        await g2._loadMap('downtown-map.json');
        assert.notEqual(g2.map.getTile(0, 9), 17);
    });

    test('using oil once the gate is open spends nothing and says so', async () => {
        const g = await makeGame();
        g._grantItem('oil'); g._grantItem('alcohol'); g._grantItem('oil');
        spread(g);
        await pourAndCross(g);
        await g._loadMap('town-map.json');
        const before = g.logs.length;
        spread(g);
        assert.equal(stock(g, 'oil'), 1);
        assert.deepEqual(g.logs.slice(before), ['[TEXT]']);
    });
});
