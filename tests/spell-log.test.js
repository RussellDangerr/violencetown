// spell-log.test.js — SL1: the spell and trick log names who was caught and what each
// really took (after armour and weakness), not a count and the spell's nominal damage.
//
// Keys go through the game's real keydown listener (_bindInput on a stand-in document);
// the wheel, _fireWheel and _aoeStrike are the real methods lifted out of main.js. The
// stand-in below the keys is combatAttack: it runs the real computeHit / elementalMult /
// attack / formatDamageNumber, so a weakness or resistance really changes the number.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
    createWheelState, cycle, drill, back, autoAimTile, needsFriendlyConfirm,
    selectedNode, verbApplies, restoreLastCategory, aimRange, compose, affectedTiles,
} from '../game/wheel-model.js';
import { attack, formatDamageNumber, computeHit, elementalMult } from '../game/combat.js';
import { buildXmbBar } from '../game/xmb.js';
import { SPELLS } from '../game/spells.js';
import { TRICKS } from '../game/tricks.js';
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
const audio = { init() {}, playMusic() {}, playSfx() {} };
const Settings = { get: () => 'tap-toggle' };

let nextId = 0;
function foe(x, y, props = {}) {
    const e = new Enemy({ id: `sl_${nextId++}`, type: 'Violencian', x, y, behavior: ['CHASE'], gold: 0 });
    e.allegiance = 'hostile';
    const { shownName, ...rest } = props;
    Object.assign(e, rest);
    if (shownName) Object.defineProperty(e, 'shownName', { value: shownName });
    return e;
}

function makeGame(enemies, over = {}) {
    const document = new EventTarget();
    const window = new EventTarget();
    const free = { document, window, audio, STATE, DIRS };
    const g = {
        state: STATE.IDLE, wheel: createWheelState(),
        map: { isWalkable: () => true }, playerX: 5, playerY: 8, playerHp: 20, playerMaxHp: 20, playerMp: 40,
        facing: 'up', enemies, gold: 50, inventory: [], equipment: { weapon: { damage: 9, damageType: 'slash' } },
        knownSpells: ['fireball'], grantedTricks: ['ray_blast'], xmbPick: null,
        skills: {}, ringMods: {}, logs: [], world: 0,
        _physicalHeld: new Set(), _heldDirKeys: [], _queuedMoveDir: null, _pathQueue: [], _pathArrive: null,
        _animating: false, _paused: false, _TURN_MS: 70,
        _log(msg) { this.logs.push(msg); },
        _render() {}, _advanceWorld() { this.world++; }, _ensureParticleLoop() {}, _maybeShowHint() {},
        _closeCurrentMenu() { return false; }, _digitToSlot() { return -1; },
        _canRepeatLast() { return false; }, _autoRepeatShouldStop() { return false; },
        _doMove() {}, isHidden() { return false; }, canThieve() { return false; },
        _earshot() { return []; }, _poitionMod() { return 0; },
        // The one stand-in: the real maths, without the splat / noise / fog around it.
        combatAttack(e, dmg, opts = {}) {
            const finalDmg = computeHit({ base: dmg, elemental: elementalMult(opts.type, e) });
            if (finalDmg === 0) return null;
            return formatDamageNumber(attack({ name: '[Player]', isDead: () => false }, e.entity, finalDmg));
        },
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
        wheelGreyedLine: liveMethod('wheelGreyedLine(node) {', { greyedReasonLine: () => null }),
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
        // the methods under test, lifted whole
        _aoeStrike: liveMethod('_aoeStrike(tiles, damage, opts = {}) {'),
        _enemiesPresent: liveMethod('_enemiesPresent(tiles) {'),
        _fireWheel: liveMethod('_fireWheel() {', {
            audio, compose, affectedTiles, SPELLS, TRICKS, emitNoise() {}, NOISE: {},
            burnGold: (game, n) => { game.gold -= n; },
        }),
    });
    g._bindInput();
    g.tap = (code) => {
        document.dispatchEvent(new Key('keydown', code));
        document.dispatchEvent(new Key('keyup', code));
    };
    return g;
}

// Space opens the wheel, then arrows + Space walk the path; the last Space commits.
function castThrough(g, path) {
    g.tap('Space');
    assert.equal(g.state, STATE.RADIAL_MENU, 'Space did not open the wheel');
    path.forEach((key) => {
        for (let n = 0; n < 14 && selectedNode(g.wheel).key !== key; n++) g.tap('ArrowRight');
        assert.equal(selectedNode(g.wheel).key, key, `could not spin the wheel to ${key}`);
        g.tap('Space');
    });
    // The leaf is a reticle: its Space (above) opened the aim, this one commits it.
    if (g.state !== STATE.IDLE) g.tap('Space');
}
const lastLog = (g) => g.logs[g.logs.length - 1];

describe('the spell log names each target and what it took, via real keys', () => {
    test('Fireball on two enemies logs both, each with the damage it really took', () => {
        const a = foe(5, 3, { name: 'Knuckles', weak: ['fire'] });     // weakness: 20 -> 30 (x1.5, EL2)
        const b = foe(6, 3, { name: 'Rat', resist: ['fire'] });        // resistance: 20 -> 10
        const g = makeGame([a, b]);
        castThrough(g, ['fight', 'magic', 'fireball']);
        assert.equal(g.world, 1, 'the cast should spend a turn');
        assert.equal(lastLog(g), '[Fireball! Knuckles 30, Rat 10]');
    });

    test('one enemy caught: the line names it, not a count', () => {
        const a = foe(5, 3, { name: 'Knuckles' });
        const g = makeGame([a]);
        castThrough(g, ['fight', 'magic', 'fireball']);
        assert.equal(lastLog(g), '[Fireball! Knuckles 20]');
    });

    test('a boss shows its one shown name, an unnamed one its type', () => {
        const a = foe(5, 3, { boss: true, shownName: 'The Shown' });
        const b = foe(6, 3, { name: undefined });
        const g = makeGame([a, b]);
        castThrough(g, ['fight', 'magic', 'fireball']);
        assert.equal(lastLog(g), '[Fireball! The Shown 20, Violencian 20]');
    });

    test('a trick lists them the same way and keeps its GP note', () => {
        const a = foe(5, 3, { name: 'Knuckles' });
        const g = makeGame([a]);
        castThrough(g, ['trick', 'rayblast']);
        assert.equal(lastLog(g), `[Ray Blast! Knuckles ${TRICKS.ray_blast.damage}. (-${TRICKS.ray_blast.gpCost}g)]`);
    });

    test('nothing caught still fizzles as before', () => {
        const g = makeGame([foe(1, 1, { name: 'Far' })]);
        castThrough(g, ['fight', 'magic', 'fireball']);
        assert.equal(lastLog(g), '[Fireball fizzles — nothing caught.]');
    });
});

describe('Cleave and Spin keep their count lines', () => {
    test('the Cleave and Spin log lines still read "N caught"', () => {
        assert.match(mainSrc, /\[Cleave! \$\{hit\.length\} caught\.\]/);
        assert.match(mainSrc, /\[Spin! \$\{hit\.length\} caught\.\]/);
    });
    test('_aoeStrike hands back who was hit, with the damage taken', () => {
        const a = foe(5, 7, { name: 'Knuckles', weak: ['fire'] });
        const g = makeGame([a]);
        const hit = g._aoeStrike([{ x: 5, y: 7 }, { x: 0, y: 0 }], 20, { type: 'fire' });
        assert.deepEqual(hit, [{ name: 'Knuckles', dealt: 30 }]);
    });
});
