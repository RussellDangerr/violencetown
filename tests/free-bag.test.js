// free-bag.test.js — ruling A3: reading your bag is free, in and out of combat.
//
// Opening the REMOTICON, flipping its tabs and closing it again cost no world
// turn — so a poison tick or a respawn never lands because you looked. Acting
// from the bag (use, equip) is an action and costs its turn like any other;
// that path is _tapDevice's, and is not what this file pins.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEVICE_TABS, cycleDeviceTab } from '../game/layout.js';

const mainSrc = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
const STATE = { IDLE: 'idle', DEVICE: 'device' };
const audio = { playSfx() {} };

// Lift a Game method out of main.js and run it for real.
function liveMethod(signature) {
    const at = mainSrc.indexOf(signature, mainSrc.indexOf('class Game {'));
    assert.ok(at > 0, `${signature} not found in main.js`);
    const body = mainSrc.slice(at + signature.indexOf('('), mainSrc.indexOf('\n    }', at) + '\n    }'.length);
    return new Function('STATE', 'DEVICE_TABS', 'cycleDeviceTab', 'audio',
        `'use strict'; return function ${body}`)(STATE, DEVICE_TABS, cycleDeviceTab, audio);
}

function game({ fightOn = false } = {}) {
    const g = {
        state: STATE.IDLE, _fightOn: fightOn, turns: 0,
        _advanceWorld() { g.turns++; },
        _render() {}, _resumeHeldWalk() {},
    };
    for (const name of ['_openDevice', '_closeDevice', '_toggleDevice', '_deviceCycleTab']) {
        g[name] = liveMethod(`    ${name}(`).bind(g);
    }
    return g;
}

describe('A3 — the bag is free to read', () => {
    for (const fightOn of [false, true]) {
        test(`open, flip every tab both ways, close: no world turn (${fightOn ? 'in' : 'out of'} a fight)`, () => {
            const g = game({ fightOn });
            g._openDevice('items');
            assert.equal(g.state, STATE.DEVICE, 'the bag opened');
            for (let i = 0; i < DEVICE_TABS.length; i++) g._deviceCycleTab(1);
            for (let i = 0; i < DEVICE_TABS.length; i++) g._deviceCycleTab(-1);
            g._closeDevice();
            assert.equal(g.state, STATE.IDLE, 'the bag closed');
            g._toggleDevice();
            g._toggleDevice();
            assert.equal(g.turns, 0);
        });
    }
});
