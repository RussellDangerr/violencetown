// wheel-greyed-reason.test.js — FX58: pressing a greyed wheel option says why.
//
// Before, a refused press on the wheel only played a bump sound. Now it also logs one
// line naming the reason, and nothing else changes: no turn passes, the wheel stays up.
//
// This drives the game's own keydown listener (the real _bindInput, on a stand-in
// document) and the game's own wheel methods, lifted out of main.js as in
// wheel-fire-key.test.js. The test only presses keys. Stand-ins below the keys: _render,
// _advanceWorld (counted, to prove no turn passes) and _fireWheel (counted, to prove an
// option that is NOT greyed still fires). The reason lines are placeholders; the test
// reads them from the reasons table rather than pinning words.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
    createWheelState, cycle, drill, back, autoAimTile, needsFriendlyConfirm,
    selectedNode, verbApplies, restoreLastCategory, aimRange,
    greyedReason, greyedReasonLine, GREYED_REASON_TEXT, ROOT,
} from '../game/wheel-model.js';
import { buildXmbBar } from '../game/xmb.js';
import { ITEMS } from '../game/items.js';
import { Enemy } from '../game/enemies.js';

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');
const classAt = mainSrc.indexOf('class Game {');

function liveMethod(signature, freeVars = {}) {
    const start = mainSrc.indexOf(signature, classAt);
    assert.ok(start > 0, `${signature} not found in main.js`);
    const lineEnd = mainSrc.indexOf('\n', start);
    const oneLiner = mainSrc.slice(start, lineEnd).trimEnd().endsWith('}');
    const end = oneLiner ? lineEnd : mainSrc.indexOf('\n    }', start) + '\n    }'.length;
    const body = mainSrc.slice(start + signature.indexOf('('), end);
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
const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

class Key extends Event {
    constructor(type, code) {
        super(type, { bubbles: true, cancelable: true });
        this.code = code; this.key = code; this.repeat = false;
        this.ctrlKey = false; this.metaKey = false; this.altKey = false; this.shiftKey = false;
    }
}

const audio = { init() {}, playMusic() {}, playSfx(n) { audio.played.push(n); }, played: [] };
const Settings = { get: () => 'tap-toggle' };

let nextId = 0;
function neutral(x, y) {
    const e = new Enemy({ id: `ts_${nextId++}`, type: 'Violencian', x, y, behavior: ['IDLE', 'WANDER'], gold: 5 });
    assert.equal(e.allegiance, 'neutral');
    return e;
}

function makeGame(enemies = [], over = {}) {
    const document = new EventTarget();
    const window = new EventTarget();
    const free = { document, window, audio, STATE, DIRS };
    const g = {
        state: STATE.IDLE, wheel: createWheelState(),
        map: { isWalkable: () => true }, playerX: 5, playerY: 4, playerHp: 20, playerMaxHp: 20, playerMp: 0,
        facing: 'down', enemies, gold: 0, inventory: [], equipment: {},
        knownSpells: [], grantedTricks: [], xmbPick: null,
        skills: {}, ringMods: {}, logs: [], world: 0, fired: 0,
        _physicalHeld: new Set(), _heldDirKeys: [], _queuedMoveDir: null, _pathQueue: [], _pathArrive: null,
        _animating: false, _paused: false, _TURN_MS: 70,
        _log(msg) { this.logs.push(msg); },
        _render() {}, _advanceWorld() { this.world++; }, _ensureParticleLoop() {}, _maybeShowHint() {},
        _fireWheel() { this.fired++; this._closeWheel(); },
        _closeCurrentMenu() { return false; }, _digitToSlot() { return -1; },
        _canRepeatLast() { return false; }, _autoRepeatShouldStop() { return false; },
        _doMove() {},
        isHidden() { return false; },          // someone can see you
        canThieve() { return false; },
        ...over,
    };
    Object.assign(g, {
        _bindInput: liveMethod('_bindInput() {', free),
        _openWheel: liveMethod('_openWheel() {', { STATE, audio, restoreLastCategory }),
        _closeWheel: liveMethod('_closeWheel() {', { STATE, audio }),
        _wheelOpenerDown: liveMethod('_wheelOpenerDown() {', { STATE, Settings }),
        _wheelOpenerUp: liveMethod('_wheelOpenerUp() {', { STATE }),
        _wheelTakesKey: liveMethod('_wheelTakesKey(code) {'),
        _wheelCycle: liveMethod('_wheelCycle(dir) {', { cycle, audio }),
        _wheelBack: liveMethod('_wheelBack() {', { back, audio }),
        _wheelDrill: liveMethod('_wheelDrill() {', { selectedNode, verbApplies, drill, autoAimTile, audio }),
        wheelGreyedLine: liveMethod('wheelGreyedLine(node) {', { greyedReasonLine }),
        eatBlockedBy: liveMethod('eatBlockedBy() {', { buildXmbBar }),
        _wheelCommit: liveMethod('_wheelCommit() {', { needsFriendlyConfirm }),
        _aimRange: liveMethod('_aimRange(leaf) {', { aimRange }),
        _reticleKey: liveMethod('_reticleKey(code) {', { selectedNode, autoAimTile, cheb, audio }),
        barSlot: liveMethod('barSlot(cat) {', { buildXmbBar }),
        eatChoice: liveMethod('eatChoice() {', { buildXmbBar }),
        hasSpell: liveMethod('hasSpell(id) {'),
        hasTrick: liveMethod('hasTrick(id) {'),
        _resumeHeldWalk: liveMethod('_resumeHeldWalk() {', { STATE, DIRS }),
        _stopAutoRepeat: liveMethod('_stopAutoRepeat() {'),
        _onStepSettled: liveMethod('_onStepSettled() {', { STATE }),
        _intendedWalkDir: liveMethod('_intendedWalkDir() {', { DIRS }),
        _resolveWalkStep: liveMethod('_resolveWalkStep(dir) {'),
        _noteHeld: liveMethod('_noteHeld(code) {'),
        _faceOf: liveMethod('_faceOf(dir) {'),
        _clearTurnTimer: liveMethod('_clearTurnTimer() {'),
        _beginMoveOrTurn: liveMethod('_beginMoveOrTurn(dir) {', { STATE }),
    });
    g._bindInput();
    g.down = (code) => document.dispatchEvent(new Key('keydown', code));
    g.up = (code) => document.dispatchEvent(new Key('keyup', code));
    g.tap = (code) => { g.down(code); g.up(code); };
    return g;
}

// Open the wheel with Space and spin/drill to the named path with keys alone. The last
// key in the path is NOT pressed: the caller presses it, so the press under test is
// the one that is refused.
function openTo(g, path) {
    g.tap('Space');
    assert.equal(g.state, STATE.RADIAL_MENU, 'Space did not open the wheel');
    const spinTo = (key) => {
        for (let n = 0; n < 14 && selectedNode(g.wheel).key !== key; n++) g.tap('ArrowRight');
        assert.equal(selectedNode(g.wheel).key, key, `could not spin the wheel to ${key}`);
    };
    path.forEach((key, i) => { spinTo(key); if (i < path.length - 1) g.tap('Space'); });
}

// Press Space on the highlighted greyed option and check the whole contract.
function pressGreyed(g, reasonKey) {
    const before = g.logs.length;
    const worldBefore = g.world;
    const node = selectedNode(g.wheel);
    const playedBefore = audio.played.length;
    g.tap('Space');
    assert.equal(g.logs.length, before + 1, `${node.key}: expected exactly one new log line, got ${JSON.stringify(g.logs.slice(before))}`);
    assert.equal(g.logs[before], GREYED_REASON_TEXT[reasonKey], `${node.key}: wrong reason`);
    assert.match(g.logs[before], /^\[TEXT/, 'the line must be a placeholder');
    assert.equal(g.world, worldBefore, `${node.key}: a turn passed`);
    assert.equal(g.fired, 0, `${node.key}: it fired`);
    assert.equal(g.state, STATE.RADIAL_MENU, `${node.key}: the wheel should stay open`);
    assert.equal(selectedNode(g.wheel).key, node.key, `${node.key}: the selection moved`);
    assert.ok(audio.played.slice(playedBefore).includes('bump-wall'), `${node.key}: the bump sound should still play`);
}

describe('pressing a greyed wheel option logs why, with real keys', () => {
    test('Hit, with nobody beside you', () => {
        const g = makeGame([]);
        openTo(g, ['fight', 'melee', 'hit']);
        pressGreyed(g, 'nobody-beside');
    });

    test('Cleave, with nobody beside you', () => {
        const g = makeGame([]);
        openTo(g, ['fight', 'melee', 'cleave']);
        pressGreyed(g, 'nobody-beside');
    });

    test('Hit, with someone beside you who is not fighting you', () => {
        const g = makeGame([neutral(5, 5)]);
        openTo(g, ['fight', 'melee', 'hit']);
        pressGreyed(g, 'not-fighting');
    });

    test('Cleave, with someone beside you who is not fighting you', () => {
        const g = makeGame([neutral(5, 5)]);
        openTo(g, ['fight', 'melee', 'cleave']);
        pressGreyed(g, 'not-fighting');
    });

    test('Ranged, with no rock', () => {
        const g = makeGame([]);
        openTo(g, ['fight', 'ranged']);
        pressGreyed(g, 'no-rock');
    });

    test('Magic, with no spell known', () => {
        const g = makeGame([]);
        openTo(g, ['fight', 'magic']);
        pressGreyed(g, 'no-spell');
    });

    test('Magic, with spells known but no MP', () => {
        const g = makeGame([], { knownSpells: ['fireball'], playerMp: 0 });
        openTo(g, ['fight', 'magic']);
        pressGreyed(g, 'no-mp');
    });

    test('Thieve, when you are not hidden', () => {
        const g = makeGame([neutral(5, 5)]);
        openTo(g, ['trick', 'thieve']);
        pressGreyed(g, 'not-hidden');
    });

    test('Eat, with no food in the bag', () => {
        const g = makeGame([], { playerHp: 5 });
        openTo(g, ['treat', 'eat']);
        pressGreyed(g, 'no-food');
    });

    test('Eat, at full health', () => {
        const g = makeGame([], { playerHp: 20, inventory: [{ itemDef: ITEMS.hot_dog, count: 1 }] });
        openTo(g, ['treat', 'eat']);
        pressGreyed(g, 'full-health');
    });

    test('Spin is never greyed, so it fires and says nothing', () => {
        const g = makeGame([]);
        openTo(g, ['fight', 'melee', 'spin']);
        const before = g.logs.length;
        g.tap('Space');
        assert.equal(g.fired, 1, 'Spin should have fired');
        assert.equal(g.logs.length, before, 'a usable option must not log a refusal');
    });

    test('an option that is usable logs no refusal (Hit with a hostile beside you)', () => {
        const foe = neutral(5, 5);
        foe.allegiance = 'hostile';
        const g = makeGame([foe]);
        openTo(g, ['fight', 'melee', 'hit']);
        const before = g.logs.length;
        g.tap('Space');
        assert.equal(g.logs.length, before);
        assert.equal(g.wheel.aiming, true, 'Hit should enter the aim');
    });
});

describe('the reasons table', () => {
    test('every reason greyedReason gives, on every real node of the wheel, has a placeholder line', () => {
        for (const [key, line] of Object.entries(GREYED_REASON_TEXT)) {
            assert.ok(line.startsWith('[TEXT'), `${key} must be a placeholder`);
        }
        const seen = new Set();
        const states = [makeGame([]), makeGame([neutral(5, 5)], { playerHp: 5 }), makeGame([], { knownSpells: ['fireball'] })];
        const walk = (node, g) => {
            const r = greyedReason(node, g);
            if (r) { seen.add(r); assert.ok(GREYED_REASON_TEXT[r], `${node.key}: no line for ${r}`); }
            (node.children || []).forEach(c => walk(c, g));
        };
        for (const g of states) walk(ROOT, g);
        assert.ok(seen.size >= 5, `the walk found only ${[...seen]} - the check proves nothing`);
    });

    test('a placeholder pad has no reason (its press stays a plain bump)', () => {
        assert.equal(greyedReason({ key: 'placeholder1', placeholder: true }, makeGame([])), null);
    });
});
