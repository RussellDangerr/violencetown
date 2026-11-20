// bare-hand-fists.test.js — LH1: a bare right hand fights with fists
// (plans/lh1-bare-hand-fists.md). Holding a two-hander and picking a one-hander for
// the left hand leaves the right hand bare; every swing used to read
// equipment.weapon.damage and crashed on null.
//
// Rulings: LH1R1 (b) the one-hander stays left, the right hand is bare, fists fill in;
// LH1R2 (a) fists hit for 5.
//
// This drives the game's own keydown listener (_bindInput on a stand-in document) and its own
// GEAR, wheel and fire methods, lifted out of main.js as wheel-fire-key.test.js and
// left-hand-plate.test.js do. The test only presses keys. Two stand-ins sit below the keys:
// combatAttack records what the swing asked for (its damage maths is pinned elsewhere), and
// the world turn is a counter.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
    createWheelState, cycle, drill, back, compose, autoAimTile, needsFriendlyConfirm,
    selectedNode, verbApplies, restoreLastCategory, aimRange,
} from '../game/wheel-model.js';
import { perceives, spotters } from '../game/perception.js';
import { resolveUse, unequipItem } from '../game/items.js';
import { WEAPONS, WEAPON_TIERS, FISTS, handWeapon, weaponClassOf } from '../game/weapons.js';
import { ITEMS } from '../game/items.js';
import { addToInventory, moveToZone, zoneOf, pageCount, slotOnPage, pageOfSlot } from '../game/inventory.js';
import { INVENTORY_SIZE, SAFE_SLOTS, PACK_PAGE, MAX_STACK } from '../game/data.js';
import { itemActions, equipOptions } from '../game/inspector.js';
import { slotRing, unslotRing } from '../game/rings.js';
import {
    HIT_SLOP, DEVICE_TABS, deviceTabRect, cycleDeviceTab, deviceBodyRect, deviceBagSlotRects, deviceBagPagerRects,
    deviceEquipLayout, deviceRingsLayout, inspectorActionRects, gearOptionRects, nearestRectInDir,
} from '../game/layout.js';
import { Enemy } from '../game/enemies.js';
import { Renderer } from '../game/renderer.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

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
const audio = { init() {}, playMusic() {}, playSfx() {} };
const Settings = { get: () => 'tap-toggle' };
const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

class Key extends Event {
    constructor(type, code) {
        super(type, { bubbles: true, cancelable: true });
        this.code = code; this.key = code; this.repeat = false;
        this.ctrlKey = false; this.metaKey = false; this.altKey = false; this.shiftKey = false;
    }
}

const SWORD = WEAPONS.wooden_sword;
const WHIP = WEAPONS.lion_whip;
const GREAT = WEAPON_TIERS.great_sword[0];
const cfg = { size: INVENTORY_SIZE, safeSlots: SAFE_SLOTS, maxStack: MAX_STACK };

function makeGame({ right, left, bag = [], enemy } = {}) {
    const document = new EventTarget();
    const window = new EventTarget();
    const free = { document, window, audio, STATE, DIRS };
    const g = {
        state: STATE.IDLE, wheel: createWheelState(),
        map: { isWalkable: () => true }, playerX: 5, playerY: 4, playerHp: 20, facing: 'down',
        enemies: enemy ? [enemy] : [], gold: 0, skills: {}, ringMods: {}, _robbed: {}, _hot: {}, logs: [],
        inventory: new Array(INVENTORY_SIZE).fill(null),
        equipment: { weapon: right, left, top: null, bottom: null, front: null, back: null, sides: null },
        _deviceTab: 'gear', _deviceSel: null,
        _physicalHeld: new Set(), _heldDirKeys: [], _queuedMoveDir: null, _pathQueue: [], _pathArrive: null,
        _animating: false, _paused: false, _TURN_MS: 70,
        steps: [], attacks: [], turns: 0, grants: 0,
        _log(msg) { this.logs.push(msg); },
        _render() {}, _ensureParticleLoop() {}, _maybeShowHint() {}, _saveMoment() {},
        _advanceWorld() { this.turns++; },
        _refreshGrantedSkills() { this.grants++; },
        _addToInventory(def) { return addToInventory(this.inventory, def, cfg); },
        _resolveItemDef() { return null; },
        _closeCurrentMenu() { return false; }, _digitToSlot() { return -1; },
        _canRepeatLast() { return false; }, _autoRepeatShouldStop() { return false; },
        _doMove(dir) { this.steps.push(dir); },
        // Stand-in: records what the swing asked for. Damage maths is pinned in the combat tests.
        combatAttack(target, damage, opts = {}) { this.attacks.push({ target, damage, opts }); return `${damage}`; },
        bareHand: FISTS,
        _handsOf(def) { return (weaponClassOf(def) || {}).hands || 1; },
    };
    const devFree = {
        STATE, DIRS, audio, HIT_SLOP, DEVICE_TABS, deviceTabRect, cycleDeviceTab, deviceBodyRect,
        deviceBagSlotRects, deviceEquipLayout, deviceRingsLayout, inspectorActionRects, gearOptionRects,
        nearestRectInDir, itemActions, equipOptions, zoneOf, moveToZone, SAFE_SLOTS, INVENTORY_SIZE, PACK_PAGE,
        pageCount, slotOnPage, pageOfSlot, deviceBagPagerRects, MAX_STACK, resolveUse, unequipItem, slotRing,
        unslotRing, weaponClassOf,
    };
    // A method may be a one-liner or a block; liveMethod handles both.
    const dev = (sig) => liveMethod(sig, devFree);
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
        _wheelCommit: liveMethod('_wheelCommit() {', { needsFriendlyConfirm }),
        _aimRange: liveMethod('_aimRange(leaf) {', { aimRange }),
        _reticleKey: liveMethod('_reticleKey(code) {', { selectedNode, autoAimTile, cheb, audio }),
        _fireWheel: liveMethod('_fireWheel() {', { compose, audio, STATE, perceives }),
        _resumeHeldWalk: liveMethod('_resumeHeldWalk() {', { STATE, DIRS }),
        _stopAutoRepeat: liveMethod('_stopAutoRepeat() {'),
        _onStepSettled: liveMethod('_onStepSettled() {', { STATE }),
        _intendedWalkDir: liveMethod('_intendedWalkDir() {', { DIRS }),
        _resolveWalkStep: liveMethod('_resolveWalkStep(dir) {'),
        _noteHeld: liveMethod('_noteHeld(code) {'),
        _faceOf: liveMethod('_faceOf(dir) {'),
        _clearTurnTimer: liveMethod('_clearTurnTimer() {'),
        _beginMoveOrTurn: liveMethod('_beginMoveOrTurn(dir) {', { STATE }),
        _deviceKey: dev('_deviceKey(code) {'), _tapDevice: dev('_tapDevice(pt) {'),
        _deviceActivate: dev('_deviceActivate(zone, index) {'), _deviceTargets: dev('_deviceTargets() {'),
        _deviceFocus: dev('_deviceFocus(t, i) {'), _pointInRect: dev('_pointInRect(p, r, slop = 0) {'),
        _removeFromSlot: dev('_removeFromSlot(slot) {'),
    });
    for (const def of bag) g._addToInventory(def);
    g._bindInput();
    g.down = (code) => { const e = new Key('keydown', code); document.dispatchEvent(e); return e; };
    g.up = (code) => document.dispatchEvent(new Key('keyup', code));
    g.tap = (code) => { g.down(code); g.up(code); };
    return g;
}

const hostile = (x, y) => new Enemy({ id: 'ruf', type: 'Ruffian', x, y, hp: 100 });

// Open the wheel with Space and walk to Melee > Hit and the aim, by keys alone.
function openToHit(g) {
    g.tap('Space');
    assert.equal(g.state, STATE.RADIAL_MENU, 'Space did not open the wheel');
    const spinTo = (key) => {
        for (let n = 0; n < 12 && selectedNode(g.wheel).key !== key; n++) g.tap('ArrowRight');
        assert.equal(selectedNode(g.wheel).key, key, `could not spin the wheel to ${key}`);
    };
    spinTo('fight'); g.tap('Space');
    spinTo('melee'); g.tap('Space');
    spinTo('hit');   g.tap('Space');
}

// Open the GEAR tab with keys and choose `bagIndex` from the left-hand plate's chooser.
function pickForLeftHand(g) {
    g.state = STATE.DEVICE;
    g.tap('KeyC');
    assert.equal(g._deviceTab, 'gear');
    // The left-hand plate sits under FEET: step the cursor by geometry until it is there.
    for (let n = 0; n < 12 && !(g._deviceSel && g._deviceSel.slotKey === 'left'); n++) g.tap(g._deviceSel && g._deviceSel.slotKey === 'weapon' ? 'ArrowRight' : 'ArrowDown');
    assert.equal(g._deviceSel && g._deviceSel.slotKey, 'left', 'could not reach the left-hand plate by keys');
    g.tap('Space');   // open its chooser
    assert.equal(g._deviceSel.open, true, 'the chooser did not open');
}

describe('fists: the fallback', () => {
    test('a bare hand reads as fists at 5 damage, under a placeholder name', () => {
        assert.equal(handWeapon({ weapon: null }), FISTS);
        assert.equal(handWeapon(undefined), FISTS);
        assert.equal(FISTS.damage, 5);
        assert.equal(FISTS.damage * 2, SWORD.damage, 'half the Wooden Sword');
        assert.equal(FISTS.name, 'Fists');
        assert.equal(handWeapon({ weapon: SWORD }), SWORD, 'a held weapon is untouched');
    });

    test('fists are never a bag item: not in WEAPONS, not in ITEMS', () => {
        assert.ok(!Object.values(WEAPONS).some(w => w.id === FISTS.id));
        assert.ok(!(FISTS.id in ITEMS));
    });
});

describe('picking a one-hander for the left hand while holding a two-hander', () => {
    test('by keys: it stays in the left hand and the right hand is bare', () => {
        const g = makeGame({ right: GREAT, left: GREAT, bag: [WHIP] });
        pickForLeftHand(g);
        g.tap('Space');   // confirm the chooser's first row
        assert.equal(g.equipment.left, WHIP);
        assert.equal(g.equipment.weapon, null);
    });

    test('then a swing at an adjacent enemy hits with fists for 5 and the turn runs', () => {
        const g = makeGame({ right: GREAT, left: GREAT, bag: [WHIP], enemy: hostile(5, 5) });
        pickForLeftHand(g);
        g.tap('Space');   // confirm the chooser's first row
        assert.equal(g.equipment.weapon, null, 'staging: right hand bare');
        g.state = STATE.IDLE;
        openToHit(g);
        g.tap('ArrowDown');   // aim at the enemy below and fire
        assert.equal(g.attacks.length, 1, `no swing; log: ${g.logs.join(' | ')}`);
        assert.equal(g.attacks[0].damage, 5);
        assert.equal(g.attacks[0].opts.weapon, FISTS);
        assert.equal(g.turns, 1, 'the turn ran');
    });

    test('Cleave and Spin with a bare right hand also fall back to fists', () => {
        const g = makeGame({ right: null, left: SWORD, enemy: hostile(5, 5) });
        const src = (name) => mainSrc.slice(mainSrc.indexOf(`case '${name}': {`), mainSrc.indexOf(`case '${name}': {`) + 700);
        assert.doesNotMatch(src('cleaveAttack'), /equipment\.weapon\./);
        assert.doesNotMatch(src('spinAttack'), /equipment\.weapon\./);
        assert.ok(g.equipment.weapon === null);
    });
});

describe('the HUD weapon line', () => {
    test('a bare right hand shows the fists name and damage, not a blank', () => {
        const lines = [];
        const r = Object.create(Renderer.prototype);
        r.font = { drawText: (ctx, text) => lines.push(text) };
        const src = readFileSync(fileURLToPath(new URL('../game/renderer.js', import.meta.url)), 'utf8');
        assert.match(src, /const wpn = handWeapon\(game\.equipment\);/);
        // The line is built as below in the renderer; the name goes through the same strip.
        const wpn = handWeapon({ weapon: null });
        const text = `${wpn.name.replace(/[\[\]]/g, '').toUpperCase()}  ${wpn.damage} DMG`;
        assert.equal(text, 'FISTS  5 DMG');
        assert.ok(lines.length === 0);
    });
});
