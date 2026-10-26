// thieve-wheel.test.js — Thieve works on townsfolk, through the wheel.
//
// The light-fingers tests call the Thieve resolver directly, which skipped the
// one gate that was broken: the wheel's "does this verb have a target" filter
// counted only hostile neighbours, so beside a townsperson Coin/Kit/Gear drew
// grey and Space bumped. These tests go through the input a player uses. The
// game's own wheel and key methods are lifted out of main.js and run for real
// (the technique of skills.test.js and restart.test.js); the test only presses
// keys: open the wheel, spin and drill to Trick > Thieve > Coin, then fire.
//
// Design: plans/fx1-thieve-on-townsfolk.md, plans/stealth-perception-and-thieve.md

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    ROOT, createWheelState, cycle, drill, back, compose, autoAimTile, needsFriendlyConfirm,
    selectedNode, verbApplies, restoreLastCategory, aimRange,
} from '../game/wheel-model.js';
import { perceives, spotters } from '../game/perception.js';
import { coinTake, kitTake, gearTake, coinWeight, itemWeight, gearWeight,
         noticeBuffer, isClean, stealLimit } from '../game/theft.js';
import { transferGold } from '../game/trade.js';
import { takeable } from '../game/fight-panels.js';
import { SKILLS, recordUse, skillPerks, mergePassives } from '../game/skills.js';
import { Enemy } from '../game/enemies.js';

const mainSrc = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
const classAt = mainSrc.indexOf('class Game {');

// A Game method, run for real.
function liveMethod(signature, freeVars = {}) {
    const start = mainSrc.indexOf(signature, classAt);
    assert.ok(start > 0, `${signature} not found in main.js`);
    const lineEnd = mainSrc.indexOf('\n', start);
    const oneLiner = mainSrc.slice(start, lineEnd).trimEnd().endsWith('}');   // _aimRange(leaf) { return …; }
    const end = oneLiner ? lineEnd : mainSrc.indexOf('\n    }', start) + '\n    }'.length;
    const body = mainSrc.slice(start + signature.indexOf('('), end);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
}

// The RADIAL_MENU branch of the keydown handler, run for real as `(e) => …`.
function liveRadialKeys(freeVars) {
    const head = 'if (this.state === STATE.RADIAL_MENU) {';
    const from = mainSrc.indexOf(head, classAt);
    assert.ok(from > 0, 'the RADIAL_MENU key branch was not found in main.js');
    let depth = 0, i = from + head.length - 1;
    for (; i < mainSrc.length; i++) {
        if (mainSrc[i] === '{') depth++;
        else if (mainSrc[i] === '}' && --depth === 0) break;
    }
    const block = mainSrc.slice(from, i + 1);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function (e) { ${block} }`)(...names.map(n => freeVars[n]));
}

const STATE = { IDLE: 'IDLE', RADIAL_MENU: 'RADIAL_MENU', DEAD: 'DEAD' };
const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
let sfx = [];
const audio = { playSfx(name) { sfx.push(name); } };
const Settings = { get: () => 'tap' };

const m = {
    _openWheel:    liveMethod('_openWheel() {', { STATE, audio, restoreLastCategory }),
    _closeWheel:   liveMethod('_closeWheel() {', { STATE, audio }),
    _wheelCycle:   liveMethod('_wheelCycle(dir) {', { cycle, audio }),
    _wheelBack:    liveMethod('_wheelBack() {', { back, audio }),
    _wheelDrill:   liveMethod('_wheelDrill() {', { selectedNode, verbApplies, drill, autoAimTile, audio }),
    _wheelCommit:  liveMethod('_wheelCommit() {', { needsFriendlyConfirm }),
    _aimRange:     liveMethod('_aimRange(leaf) {', { aimRange }),
    _reticleKey:   liveMethod('_reticleKey(code) {', { selectedNode, autoAimTile, cheb, audio }),
    _fireWheel:    liveMethod('_fireWheel() {', {
        compose, audio, STATE, perceives,
        coinTake, kitTake, gearTake, coinWeight, itemWeight, gearWeight, noticeBuffer, isClean, stealLimit,
        transferGold, reactToTransaction() {},
    }),
    _thieveTarget: liveMethod('_thieveTarget(aimTile) {'),
    canThieve:     liveMethod('canThieve(branch) {', { cheb, takeable }),
    isHidden:      liveMethod('isHidden() {', { spotters }),
    _theftPassives: liveMethod('_theftPassives() {', { mergePassives, skillPerks }),
    _countCleanLift: liveMethod('_countCleanLift() {', { recordUse }),
};
const radialKeys = liveRadialKeys({ STATE });

// A flat, open street. The townsperson faces down (the perception default), and
// the player stands behind them, so nobody sees the player.
const street = { isWalkable: () => true };

let nextId = 0;
function townsperson(x, y, over = {}) {
    const e = new Enemy({ id: `ts_${nextId++}`, type: 'Violencian', x, y, behavior: ['IDLE', 'WANDER'], gold: 300, ...over });
    assert.equal(e.allegiance, 'neutral', 'the victim must be a townsperson, not a hostile');
    return e;
}

function thiefGame(enemies, { x = 5, y = 4 } = {}) {
    return {
        ...m,
        state: STATE.IDLE, wheel: createWheelState(),
        map: street, playerX: x, playerY: y, facing: 'up',
        enemies, gold: 0, inventory: [], equipment: { weapon: { damage: 10 } },
        skills: {}, ringMods: {}, _robbed: {}, _hot: {}, logs: [],
        _log(msg) { this.logs.push(msg); },
        _render() {}, _advanceWorld() {}, _stopAutoRepeat() {}, _ensureParticleLoop() {},
        _resumeHeldWalk() {},
        _addToInventory() { return true; },
        _resolveItemDef() { return null; },
        // The keydown handler's RADIAL_MENU branch, fed a real-looking event.
        press(code) {
            if (this.state !== STATE.RADIAL_MENU) throw new Error(`pressed ${code} with the wheel shut`);
            radialKeys.call(this, { code, preventDefault() {} });
        },
    };
}

// Open the wheel and drill to Trick > Thieve > <leaf> with arrow keys and Space
// only. The ring positions are looked up, never hard-coded, so a reordered Trick
// ring cannot make this pass by accident.
function openToThieve(g, leafKey = 'coin') {
    m._openWheel.call(g);
    assert.equal(g.state, STATE.RADIAL_MENU);
    const spinTo = (key) => {
        for (let n = 0; n < 12 && selectedNode(g.wheel).key !== key; n++) g.press('ArrowRight');
        assert.equal(selectedNode(g.wheel).key, key, `could not spin the wheel to ${key}`);
    };
    spinTo('trick');  g.press('Space');
    spinTo('thieve'); g.press('Space');
    spinTo(leafKey);
}

beforeEach(() => { sfx = []; });

describe('Thieve > Coin on a townsperson, through the wheel', () => {
    test('the staging is right: hidden, beside a neutral with gold, Coin available', () => {
        const victim = townsperson(5, 5);
        const g = thiefGame([victim]);
        assert.equal(g.isHidden(), true, 'the player must be unseen');
        assert.equal(g.canThieve('coin'), true);
        openToThieve(g);
        assert.equal(selectedNode(g.wheel).resolver, 'thieveCoin');
    });

    test('Coin is lit beside a townsperson: available and has a target', () => {
        const g = thiefGame([townsperson(5, 5)]);
        openToThieve(g);
        const coin = selectedNode(g.wheel);
        // The renderer's tileEnabled, word for word.
        const lit = !coin.placeholder && (!coin.available || coin.available(g)) && verbApplies(coin, g);
        assert.equal(lit, true, 'Coin is drawn grey beside an unseen townsperson');
    });

    test('Space drills into the aim, the reticle seeds on the townsperson, Space lifts the coin', () => {
        const victim = townsperson(5, 5);
        const g = thiefGame([victim]);
        openToThieve(g);
        g.press('Space');
        assert.ok(!sfx.includes('bump-wall'), 'Space on Coin bumped');
        assert.equal(g.wheel.aiming, true, 'Space on Coin did not enter the aim');
        assert.deepEqual(g.wheel.reticle, { x: 5, y: 5 }, 'the reticle did not seed on the townsperson');
        g.press('Space');
        assert.ok(g.gold > 0, `nothing was lifted; log: ${g.logs.join(' | ')}`);
        assert.equal(victim.gold, 300 - g.gold, 'the gold came out of the townsperson');
        assert.equal(g.state, STATE.IDLE, 'the wheel should close after the lift');
    });

    test('pointing at the townsperson with an arrow lifts the coin too', () => {
        const victim = townsperson(5, 5);
        const g = thiefGame([victim]);
        openToThieve(g);
        g.press('Space');
        g.press('ArrowDown');
        assert.ok(g.gold > 0, `nothing was lifted; log: ${g.logs.join(' | ')}`);
        assert.equal(victim.gold + g.gold, 300);
    });

    test('a shopkeeper and an ally can be robbed the same way', () => {
        for (const over of [{ vendor: true, behavior: ['IDLE'], gold: 300 }, { behavior: ['ALLIED'], gold: 300 }]) {
            const victim = new Enemy({ id: `v_${nextId++}`, type: 'Violencian', x: 5, y: 5, ...over });
            assert.notEqual(victim.allegiance, 'hostile');
            const g = thiefGame([victim]);
            openToThieve(g);
            g.press('Space');
            g.press('Space');
            assert.ok(g.gold > 0, `nothing lifted from ${victim.allegiance}; log: ${g.logs.join(' | ')}`);
        }
    });

    test('Kit and Gear are lit beside a townsperson carrying them', () => {
        const g = thiefGame([townsperson(5, 5, { loadout: ['rock'], equipped: ['rock'] })]);
        for (const key of ['kit', 'gear']) {
            openToThieve(g, key);
            const leaf = selectedNode(g.wheel);
            assert.equal(leaf.available(g), true, `${key} unavailable`);
            assert.equal(verbApplies(leaf, g), true, `${key} has no target beside a townsperson`);
            g.press('Space');
            assert.ok(!sfx.includes('bump-wall'), `Space on ${key} bumped`);
            assert.equal(g.wheel.aiming, true);
            assert.deepEqual(g.wheel.reticle, { x: 5, y: 5 });
            g.press('Escape'); g.press('Escape'); g.press('Escape'); g.press('Escape');
            assert.equal(g.state, STATE.IDLE);
        }
    });

    test('with nobody beside you Coin still bumps', () => {
        const g = thiefGame([townsperson(9, 9)]);
        assert.equal(verbApplies(ROOT.children.find(c => c.key === 'trick')
            .children.find(c => c.key === 'thieve').children[0], g), false);
    });
});

describe('the widened filter stays on Thieve', () => {
    test('Hit still needs a hostile: a townsperson alone is no target', () => {
        const g = thiefGame([townsperson(5, 5)]);
        const hit = ROOT.children[0].children[0].children.find(c => c.key === 'hit');
        assert.equal(verbApplies(hit, g), false);
        assert.deepEqual(autoAimTile(hit, g), { x: 5, y: 3 }, 'Hit should seed on the facing tile, not the townsperson');
    });

    test('a hostile is still robbable', () => {
        const brute = new Enemy({ id: `h_${nextId++}`, type: 'Grunt', x: 5, y: 5, gold: 300 });
        assert.equal(brute.allegiance, 'hostile');
        const g = thiefGame([brute]);
        openToThieve(g);
        g.press('Space');
        g.press('Space');
        assert.ok(g.gold > 0);
    });
});

describe('light fingers counts lifts from townsfolk', () => {
    const LF = 'light_fingers';

    test('a clean wheel lift from a townsperson counts', () => {
        const g = thiefGame([townsperson(5, 5)]);
        openToThieve(g);
        g.press('Space');
        g.press('Space');
        assert.equal(g.skills[LF], 1);
    });

    test('enough clean lifts from townsfolk reach the first rank', () => {
        const first = SKILLS[LF].ranks[0].at;
        const g = thiefGame([]);
        for (let i = 0; i < first; i++) {
            g.enemies = [townsperson(5, 5)];          // a fresh pocket each time
            openToThieve(g);
            g.press('Space');
            g.press('Space');
        }
        assert.equal(g.skills[LF], first);
        assert.ok(g.logs.includes('[TEXT]'), 'reaching the rank should write its log line');
    });
});
