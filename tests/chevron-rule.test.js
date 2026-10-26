// chevron-rule.test.js — the facing chevron shows only where the art can't show
// facing (plans/ds2-chevron-follows-ruling.md).
//
// People with four-way frames (the Violencian crowd and the named town NPCs)
// show which way they face in their sprite, so a straight facing gets no
// chevron. Creatures have one drawn facing, and nobody's art can show a
// diagonal, so those keep it. The overlay half drives _drawThreatOverlay on a
// recording canvas and counts the chevron's own stroke (the plum outline).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Renderer, showsFacingChevron } from '../game/renderer.js';
import { ENEMY_SPRITES } from '../game/sprites.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const FOUR_WAY = ['Violencian', 'Vendor', 'Stranger', 'Bootlegger', 'Banker', 'Operator', 'Cook'];
const CREATURES = Object.keys(ENEMY_SPRITES).filter(t => !ENEMY_SPRITES[t].dirCols);
const STRAIGHT = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const DIAGONAL = { 'up-left': [-1, -1], 'up-right': [1, -1], 'down-left': [-1, 1], 'down-right': [1, 1] };

const watcher = (type, [dx, dy], over = {}) => ({ id: `${type}-1`, type, x: 12, y: 10, _lastDx: dx, _lastDy: dy, ...over });

describe('who gets a chevron', () => {
    test('the four-way list is exactly the entries with dirCols, and there are creatures too', () => {
        assert.deepEqual(Object.keys(ENEMY_SPRITES).filter(t => ENEMY_SPRITES[t].dirCols).sort(), [...FOUR_WAY].sort());
        assert.ok(CREATURES.length > 0);
    });

    for (const type of FOUR_WAY) {
        for (const [name, v] of Object.entries(STRAIGHT)) {
            test(`${type} facing ${name}: the art shows it, no chevron`, () => {
                assert.equal(showsFacingChevron(watcher(type, v)), false);
            });
        }
        for (const [name, v] of Object.entries(DIAGONAL)) {
            test(`${type} facing ${name}: four frames can't show it, chevron`, () => {
                assert.equal(showsFacingChevron(watcher(type, v)), true);
            });
        }
    }

    for (const type of CREATURES) {
        test(`${type}: one drawn facing, chevron every way`, () => {
            for (const v of [...Object.values(STRAIGHT), ...Object.values(DIAGONAL)]) {
                assert.equal(showsFacingChevron(watcher(type, v)), true, `facing ${v}`);
            }
        });
    }

    test('a person who has never moved faces down, and the art shows it', () => {
        assert.equal(showsFacingChevron(watcher('Vendor', [0, 0])), false);
    });

    test('but if their frame is turned left while the cone faces down, the chevron shows the cone', () => {
        assert.equal(showsFacingChevron(watcher('Vendor', [0, 0], { _faceLeft: true })), true);
    });

    test('an unknown type has no art to show facing, so it keeps the chevron', () => {
        assert.equal(showsFacingChevron(watcher('Nobody In The Table', [1, 0])), true);
        assert.equal(showsFacingChevron(null), true);
    });
});

describe('the overlay follows the rule, in and out of a fight', () => {
    function strokes(enemies, fightOn) {
        const calls = [];
        const state = { globalAlpha: 1, fillStyle: null, strokeStyle: null };
        const ctx = new Proxy(state, {
            get(t, k) {
                if (k in t) return t[k];
                return (...a) => { calls.push({ fn: k, a, stroke: t.strokeStyle }); };
            },
            set(t, k, v) { t[k] = v; return true; },
        });
        const r = Object.assign(Object.create(Renderer.prototype), {
            ctx, canvas: { width: 1920, height: 1080 }, _scrollX: 0, _scrollY: 0, zone: 'TOWN',
            sprites: {}, _ditherPattern: (c) => `stipple ${c}`,
        });
        r._drawThreatOverlay({
            map: { isWalkable: () => true, isInBounds: () => true, zoneName: 'TOWN' },
            playerX: 10, playerY: 10, turn: 1, wheel: null, enemies, _fightOn: fightOn,
            _inCombat: () => fightOn,
        });
        return calls.filter(c => c.fn === 'stroke' && c.stroke === 'rgba(63,38,49,0.9)').length;
    }
    const alive = { entity: { isAlive: () => true, hp: 10, maxHp: 10 }, sightRange: 8, state: 'idle' };
    // Facing away from the player (who is west of them), so no "sees you" thread either way.
    const person = (v) => ({ ...watcher('Vendor', v), ...alive });
    const rat = (v) => ({ ...watcher('Rat', v), ...alive });

    for (const fightOn of [false, true]) {
        const where = fightOn ? 'in a fight' : 'out of a fight';
        test(`${where}: a person facing straight draws no chevron`, () => {
            assert.equal(strokes([person([1, 0])], fightOn), 0);
        });
        test(`${where}: a person facing a diagonal draws one`, () => {
            assert.equal(strokes([person([1, 1])], fightOn), 1);
        });
        test(`${where}: a creature draws one`, () => {
            assert.equal(strokes([rat([1, 0])], fightOn), 1);
        });
        test(`${where}: a mixed street draws one per watcher the art can't show`, () => {
            assert.equal(strokes([person([1, 0]), person([0, 1]), person([1, -1]), rat([0, 1])], fightOn), 2);
        });
    }
});
