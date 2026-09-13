// grapple.test.js — the grappling-hook swing (plans/grapple-swing.md).
//
// The hook used to be a key: owning it flipped a `requires` flag and you walked
// through an ordinary exit tile. Now an anchor is a place you BUMP with the hook
// in your bag, and you swing to where it leads — across a gap on the same map,
// or out of it, where the landing queues the anchor's transition exactly as a
// walked-onto exit does.

import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GameMap } from '../game/map.js';
import { Renderer } from '../game/renderer.js';
import * as Settings from '../game/settings.js';

// ── _interactGrapple, lifted out of main.js (the hunting-state.test.js pattern) ──
const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');
function liveMethod(name, params, freeVars = {}) {
    const at = mainSrc.indexOf(`${name}(${params}) {`);
    assert.ok(at > 0, `${name}(${params}) not found in main.js`);
    const body = mainSrc.slice(at + name.length, mainSrc.indexOf('\n    }', at) + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
}

const HOOK = { itemDef: { id: 'grappling_hook' } };
const climbOut = {
    x: 7, y: 1, toMap: 'downtown-map.json', toX: 8, toY: 10,
    label: '[You haul yourself up.]', requires: 'grappling_hook', requiresMsg: '[Sheer rock.]',
};
const ledge = { x: 4, y: 4, toX: 9, toY: 4, label: '[You swing across.]', requires: 'grappling_hook' };

function hero(bag) {
    const g = {
        inventory: bag, playerX: 7, playerY: 2, _animDuration: 150, _pendingTransition: null,
        logs: [], swings: [], advanced: 0, swingingDuringFlight: null,
        _log(t) { this.logs.push(t); },
        _advanceWorld() { this.advanced++; },
        _animateMove(fx, fy, tx, ty, done, ms) {
            this.swings.push({ from: [fx, fy], to: [tx, ty], ms });
            this.swingingDuringFlight = this._swinging;
            done();
        },
    };
    return g;
}

describe('_interactGrapple', () => {
    let interact;
    try { interact = liveMethod('_interactGrapple', 'anchor', { audio: { playSfx() {} } }); } catch { interact = null; }

    test('main.js has an _interactGrapple(anchor)', () => {
        assert.equal(typeof interact, 'function');
    });

    test('without the hook it is sheer rock — its message, no swing, no turn', () => {
        const g = hero([]);
        interact.call(g, climbOut);
        assert.deepEqual(g.logs, ['[Sheer rock.]']);
        assert.deepEqual(g.swings, []);
        assert.equal(g.advanced, 0);
        assert.equal(g._pendingTransition, null);
    });

    test('with the hook it swings to the anchor, then takes the anchor\'s way out', () => {
        const g = hero([HOOK]);
        interact.call(g, climbOut);
        assert.deepEqual(g.swings.map(s => s.to), [[7, 1]]);
        assert.ok(g.swings[0].ms > g._animDuration, 'a swing takes longer than a step');
        assert.equal(g.swingingDuringFlight, true, 'the renderer arcs the hero only while _swinging');
        assert.equal(g._swinging, false, 'and the flag clears on landing');
        assert.equal(g._pendingTransition, climbOut, 'the landing queues the exit the usual way');
        assert.equal(g.advanced, 1);
    });

    test('a same-map anchor lands you across the gap', () => {
        const g = hero([HOOK]);
        g.playerX = 3; g.playerY = 4;
        interact.call(g, ledge);
        assert.deepEqual(g.swings.map(s => s.to), [[9, 4]]);
        assert.deepEqual([g.playerX, g.playerY], [9, 4]);
        assert.deepEqual(g.logs, ['[You swing across.]']);
        assert.equal(g._pendingTransition, null);
    });
});

describe('GameMap.getAnchor', () => {
    test('finds the anchor at a tile, and nothing elsewhere', () => {
        const m = new GameMap({ width: 3, height: 3, spawn: { x: 0, y: 0 }, tiles: Array(9).fill(52), anchors: [{ x: 1, y: 0, toX: 1, toY: 2 }] }, 't');
        assert.deepEqual(m.getAnchor?.(1, 0), { x: 1, y: 0, toX: 1, toY: 2 });
        assert.equal(m.getAnchor?.(2, 2), null);
    });
});

describe('the swing arc', () => {
    afterEach(() => Settings.set('reduceMotion', false));
    const r = Object.assign(Object.create(Renderer.prototype), { half: 9 });
    const at = (game) => r._playerScreenPos(game, 0);

    test('the hero rises mid-swing, and the ground under them does not', () => {
        const still = at({});
        const mid = at({ _swinging: true, _animProgress: 0.5 });
        assert.ok(mid.ppy < still.ppy, 'no lift mid-swing');
        assert.equal(mid.groundPy, still.ppy, 'the shadow should stay on the ground');
    });

    test('a walk step does not lift', () => {
        assert.equal(at({ _animating: true, _animProgress: 0.5 }).ppy, at({}).ppy);
    });

    test('Reduce Motion flattens the arc to a slide', () => {
        Settings.set('reduceMotion', true);
        assert.equal(at({ _swinging: true, _animProgress: 0.5 }).ppy, at({}).ppy);
    });
});
