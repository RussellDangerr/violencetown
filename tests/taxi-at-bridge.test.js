// taxi-at-bridge.test.js — TX2: the taxi and its driver wait at the bridge
// (plans/tx2-taxi-at-bridge.md).
//
// The broken vehicle moved from the wall block east of Hooch's stall to the road
// under the North bridge barricade, and a driver stands beside it. Quest 1 still
// finishes the same way: examine it, bring the Converter back from the Sewer,
// install it at the taxi.
//
// As in between-quests.test.js, the real main.js methods are lifted out of the
// source and bound onto a small game object, and every step is a real key through
// the listeners _bindInput registers.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GameMap, carriesAll } from '../game/map.js';
import { QuestEngine, QUESTS } from '../game/quests.js';
import { DIALOGUES, getDialogue } from '../game/dialogue.js';
import { defaultVerb } from '../game/wheel-model.js';
import { doExamine, resolveExamine, questExamineHint } from '../game/examine.js';
import { findPath } from '../game/pathing.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');
const townJson = JSON.parse(readFileSync(fileURLToPath(new URL('../game/town-map.json', import.meta.url)), 'utf8'));

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

// The taxi's 2x2 block (top-left cell, which is also its examine point) and the driver.
const TAXI = { x: 16, y: 2 };
const driverSpawn = townJson.enemies.find(e => e.id === 'townie-driver');

// A game standing in the town, bound to the real methods, with the cast left out
// (the walk is the point).
async function makeGame() {
    const document = new EventTarget();
    const window = new EventTarget();
    const g = {
        state: STATE.IDLE, facing: 'up', carFuel: 'raw',
        playerX: 0, playerY: 0, inventory: [], enemies: [], containers: [], examinables: [], groundItems: [],
        _tileDiffs: [], _heldDirKeys: [], _physicalHeld: new Set(), _queuedMoveDir: null,
        _animating: false, _animDuration: 1, _TURN_MS: 70, _turnTimer: null, _paused: false,
        _pendingTransition: null, _ratFormTurns: 0, _sewerEscape: null,
        logs: [],
        _log(m) { this.logs.push(m); },
        _render() {}, _onStepSettled() {}, _tryPickup() {}, _stopAutoRepeat() {}, _advanceWorld() {},
        _openInspect() {}, _resumeHeldWalk() {}, _digitToSlot: () => -1, renderer: {},
        hasBuff() { return false; },
        _flash() {}, _triggerScreenShake() {}, _zoneChange() {},
        emitGameEvent(type, payload) { this.questEngine.emit(type, payload); },
        async _loadMap(url) {
            this.map = new GameMap(JSON.parse(readFileSync(fileURLToPath(new URL(`../game/${url}`, import.meta.url)), 'utf8')), url);
            this._mapUrl = url;
            this.playerX = this.map.spawn.x;
            this.playerY = this.map.spawn.y;
            this.examinables = this.map.examinableSpawns.map(e => ({ ...e }));
        },
    };
    const free = {
        STATE, DIRS, audio, carriesAll, document, window, defaultVerb, doExamine, resolveExamine, findPath, getDialogue,
        requestAnimationFrame: (f) => queueMicrotask(() => f(Infinity)),
        performance: { now: () => 0 },
        setTimeout: () => 0,
    };
    for (const [n, p] of [
        ['_bindInput', ''], ['_noteHeld', 'code'], ['_faceOf', 'dir'], ['_clearTurnTimer', ''],
        ['_beginMoveOrTurn', 'dir'], ['_intendedWalkDir', ''], ['_resolveWalkStep', 'dir'],
        ['_animateMove', 'fromX, fromY, toX, toY, callback, duration = this._animDuration'],
        ['_doMove', 'dir'], ['_canEnter', 'x, y'], ['setTile', 'x, y, id'],
        ['_interactCar', ''], ['_removeFromSlot', 'slot'], ['_openBridgeIfCarFixed', ''],
        ['_targetAt', 'x, y'], ['_actOnTarget', 'verb, t'], ['_carApproachPath', ''],
        ['_fireResolver', 'verb, t'], ['_openDialogue', 'npc'],
    ]) g[n] = liveMethod(n, p, free);
    g.questEngine = new QuestEngine(g);
    g._bindInput();
    g.press = async (code) => {
        document.dispatchEvent(new Key('keydown', code));
        document.dispatchEvent(new Key('keyup', code));
        await settle();
    };
    await g._loadMap('town-map.json');
    return g;
}

describe('the map: the taxi and its driver at the bridge', () => {
    const map = new GameMap(townJson, 'town-map.json');

    test('the taxi is one 2x2 block of car tiles on the road under the barricade', () => {
        const cars = [];
        for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) if (map.getTile(x, y) === 19) cars.push(`${x},${y}`);
        assert.deepEqual(cars.sort(), ['16,2', '16,3', '17,2', '17,3']);
        const ex = townJson.examinables.find(e => e.id === 'car');
        assert.deepEqual([ex.x, ex.y], [TAXI.x, TAXI.y], "the examine point is the block's top-left cell");
        assert.equal(map.getTile(16, 1), 17, 'the barricade stands right above it');
    });

    test('the old spot east of Hooch is open ground, like the cells around it', () => {
        for (const [x, y] of [[24, 6], [25, 6], [24, 7], [25, 7]]) {
            assert.equal(map.getTile(x, y), map.getTile(23, y), `${x},${y} matches its neighbour`);
        }
    });

    test('a lane stays open from the road up to the barricade, around the taxi and the driver', () => {
        const game = {
            map, playerX: map.spawn.x, playerY: map.spawn.y, containers: [], groundItems: [],
            enemies: [{ x: driverSpawn.x, y: driverSpawn.y, entity: { isAlive: () => true } }],
        };
        for (const to of [{ x: 19, y: 2 }, { x: 18, y: 2 }]) {
            const path = findPath(game, { x: map.spawn.x, y: map.spawn.y }, to);
            assert.ok(path && path.length, `a path exists to ${to.x},${to.y}`);
            for (const step of path) {
                assert.notEqual(map.getTile(step.x, step.y), 19, 'it never crosses the taxi');
                assert.ok(!(step.x === driverSpawn.x && step.y === driverSpawn.y), 'or the driver');
            }
        }
        // ...and from there the barricade row is the next step north.
        assert.equal(map.getTile(18, 1), 17);
        assert.equal(map.getTile(18, 2), 12);
    });

    test('the driver is a still townie with a dialogue, standing beside the taxi', () => {
        assert.equal(driverSpawn.type, 'Violencian');
        assert.deepEqual(driverSpawn.behavior, ['IDLE'], 'idle only: he never wanders, so he draws nothing from the ambient stream');
        assert.equal(driverSpawn.barks, undefined, 'and he does not bark');
        assert.ok(driverSpawn.ambient);
        assert.ok(Math.abs(driverSpawn.x - TAXI.x) <= 2 && Math.abs(driverSpawn.y - TAXI.y) <= 2, 'he stands by the taxi');
        assert.equal(map.getTile(driverSpawn.x, driverSpawn.y), 12, 'on the road');
        assert.ok(DIALOGUES[driverSpawn.dialogueId], 'his dialogue exists');
    });

    test('every line a player reads that this slice changed is a placeholder', () => {
        for (const id of ['car', 'bridge']) assert.equal(townJson.examinables.find(e => e.id === id).text, '[TEXT]', id);
        assert.equal(driverSpawn.name, '[TEXT]');
        const d = getDialogue('taxi_driver');
        assert.equal(d.name, '[TEXT]');
        assert.equal(d.greeting, '[TEXT]');
        const q = QUESTS.fix_car;
        assert.equal(q.title, '[TEXT]');
        for (const s of q.stages) assert.equal(s.objective, '[TEXT]', s.id);
    });
});

describe('quest 1 at the taxi, played on real keys', () => {
    test('E from spawn points at the taxi: it is to the north', async () => {
        const g = await makeGame();
        g.questEngine.start('fix_car');
        const hint = questExamineHint(g, { instanceId: null });
        assert.match(hint, /north/, hint);
        assert.doesNotMatch(hint, /east/, 'the old spot was to the northeast');
    });

    test('walk from spawn with the arrow keys, examine the taxi, then install a held Converter', async () => {
        const g = await makeGame();
        g.questEngine.start('fix_car');
        assert.equal(g.questEngine.currentStageId(), 'examine_car');

        // Spawn (16,12): two taps east (turn, then step) to x17 clears the street
        // lamp at x16, then straight north up the road until the taxi is in front.
        await g.press('ArrowRight'); await g.press('ArrowRight');
        for (let i = 0; i < 12 && g.playerY > 4; i++) await g.press('ArrowUp');
        assert.deepEqual([g.playerX, g.playerY], [17, 4], 'standing under the taxi');
        assert.equal(g.map.getTile(17, 3), 19, 'with it in front');
        assert.equal(g.questEngine.currentStageId(), 'examine_car', 'walking up to it did not examine it');

        await g.press('KeyE');
        assert.equal(g.questEngine.currentStageId(), 'recover_converter', 'E examined the taxi and the quest moved on');

        // The Converter comes back from the Sewer: it is in the bag, on the last stage.
        g.questEngine.state.stageIndex = QUESTS.fix_car.stages.findIndex(s => s.id === 'return_to_car');
        g.inventory = [{ itemDef: { id: 'catalytic_converter', name: 'Cataclysmic Converter' }, count: 1 }];
        await g.press('ArrowUp');   // the bump installs it
        assert.ok(g.questEngine.isComplete('fix_car'), 'the taxi runs');
        assert.equal(g.questEngine.getFlag('carFixed'), true);
        assert.equal(g.inventory[0], null, 'the Converter left the bag');
        assert.equal(g.map.getTile(16, 1), 12, 'the barricade opened');
        assert.equal(g.map.getTile(19, 0), 12);
    });

    test('a bump without the Converter installs nothing', async () => {
        const g = await makeGame();
        g.questEngine.start('fix_car');
        g.playerX = 17; g.playerY = 4; g.facing = 'up';
        await g.press('ArrowUp');
        assert.ok(!g.questEngine.getFlag('carFixed'));
        assert.equal(g.map.getTile(16, 1), 17, 'the barricade still stands');
    });

    test('the approach path to the taxi ends beside any of its tiles', async () => {
        const g = await makeGame();
        g.playerX = 18; g.playerY = 3;   // east of the block, level with it
        assert.deepEqual(g._carApproachPath(), [], 'already beside it');
        g.playerX = 17; g.playerY = 8;
        const path = g._carApproachPath();
        assert.ok(path && path.length, 'a walk to the taxi exists from the street');
        const last = path[path.length - 1];
        assert.ok(g.map.isWalkable(last.x, last.y), 'ending on open road');
    });

    test('the driver opens his greeting', async () => {
        const g = await makeGame();
        g._openDialogue({ ...driverSpawn });
        assert.equal(g.state, STATE.DIALOGUE);
        assert.equal(g._dialogueReply, getDialogue('taxi_driver').greeting);
    });
});
