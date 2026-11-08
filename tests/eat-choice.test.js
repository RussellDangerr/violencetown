// eat-choice.test.js — fx36: the wheel's Eat does not waste food at full health, and
// says what it will eat (plans/fx36-eat-wont-waste-food.md).
//
// Treat > Eat used to eat a Hot Dog for 0 HP at full health, and never said which food it
// would use. These tests go through the input a player uses: the game's own wheel, key and
// eat methods are lifted out of main.js and run for real (the technique of
// thieve-wheel.test.js); the test only presses keys, then runs the real _drawWheel on a
// recording canvas to read what the Eat slice says.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    createWheelState, cycle, drill, back, compose, autoAimTile, needsFriendlyConfirm,
    selectedNode, verbApplies, restoreLastCategory,
} from '../game/wheel-model.js';
import { buildXmbBar } from '../game/xmb.js';
import { ITEMS, resolveUse } from '../game/items.js';
import { Renderer } from '../game/renderer.js';
import { BitmapFont } from '../game/bitmap-font.js';
import { hudLayout, DOCK, wheelRingR, WHEEL_TILE_GAP } from '../game/layout.js';
import { computeViewport } from '../game/viewport.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const mainSrc = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
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
let sfx = [];
const audio = { playSfx(name) { sfx.push(name); } };

const m = {
    _openWheel:   liveMethod('_openWheel() {', { STATE, audio, restoreLastCategory }),
    _closeWheel:  liveMethod('_closeWheel() {', { STATE, audio }),
    _wheelCycle:  liveMethod('_wheelCycle(dir) {', { cycle, audio }),
    _wheelBack:   liveMethod('_wheelBack() {', { back, audio }),
    _wheelDrill:  liveMethod('_wheelDrill() {', { selectedNode, verbApplies, drill, autoAimTile, audio }),
    _wheelCommit: liveMethod('_wheelCommit() {', { needsFriendlyConfirm }),
    _fireWheel:   liveMethod('_fireWheel() {', { compose, audio, STATE }),
    barSlot:      liveMethod('barSlot(cat) {', { buildXmbBar }),
    eatChoice:    liveMethod('eatChoice() {', { buildXmbBar }),
    eatBlockedBy: liveMethod('eatBlockedBy() {', { buildXmbBar }),
};
const radialKeys = liveRadialKeys({ STATE });

const HOT_DOG = ITEMS.hot_dog;          // heals 10
const BURGER = ITEMS.boardwalk_burger;  // heals 15
const stack = (itemDef, count = 1) => ({ itemDef, count });

function eater({ hp, inventory }) {
    return {
        ...m,
        state: STATE.IDLE, wheel: createWheelState(),
        map: { isWalkable: () => true }, playerX: 5, playerY: 5, facing: 'down',
        enemies: [], inventory, equipment: {}, xmbPick: {}, xmbCat: 'eat',
        playerHp: hp, playerMaxHp: 100, selectedSlot: -1, logs: [], used: [],
        _log(msg) { this.logs.push(msg); },
        _render() {}, _advanceWorld() {}, _stopAutoRepeat() {}, _ensureParticleLoop() {}, _resumeHeldWalk() {},
        // The real resolver does the healing; the bag bookkeeping is the one thing stubbed.
        _doItemUse(def) {
            this.used.push(def.id);
            resolveUse(this, def, null, 1, 'weapon', this.selectedSlot);
            this.inventory[this.selectedSlot] = null;
            this.state = STATE.IDLE;
        },
        press(code) {
            if (this.state !== STATE.RADIAL_MENU) throw new Error(`pressed ${code} with the wheel shut`);
            radialKeys.call(this, { code, preventDefault() {} });
        },
    };
}

// Open the wheel and spin/drill to Treat > Eat with keys only. Positions are looked up.
function openToEat(g) {
    m._openWheel.call(g);
    assert.equal(g.state, STATE.RADIAL_MENU);
    const spinTo = (key) => {
        for (let n = 0; n < 12 && selectedNode(g.wheel).key !== key; n++) g.press('ArrowRight');
        assert.equal(selectedNode(g.wheel).key, key, `could not spin the wheel to ${key}`);
    };
    spinTo('treat'); g.press('Space');
    spinTo('eat');
}

beforeEach(() => { sfx = []; });

describe('which food the wheel would eat', () => {
    const bag = () => [stack(HOT_DOG), stack(BURGER)];

    test('at full health there is no choice, so nothing can be wasted', () => {
        const g = eater({ hp: 100, inventory: bag() });
        assert.equal(g.eatChoice(), null);
        assert.equal(g.barSlot('eat'), -1);
        assert.equal(g.eatBlockedBy(), 'full');
    });

    test('hurt a little, it picks the smallest food that covers the gap', () => {
        const g = eater({ hp: 95, inventory: bag() });          // missing 5: either covers; the Hot Dog is enough
        assert.equal(g.eatChoice().itemDef.id, 'hot_dog');
        const g2 = eater({ hp: 90, inventory: bag() });         // missing 10: the Hot Dog just covers it
        assert.equal(g2.eatChoice().itemDef.id, 'hot_dog');
        const g3 = eater({ hp: 88, inventory: bag() });         // missing 12: only the Burger covers it
        assert.equal(g3.eatChoice().itemDef.id, 'boardwalk_burger');
        assert.equal(g3.eatChoice().heal, 15);
    });

    test('hurt badly, it picks the food that heals most (30 HP of 100 is not the Hot Dog)', () => {
        const g = eater({ hp: 30, inventory: bag() });
        const pick = g.eatChoice();
        assert.equal(pick.itemDef.id, 'boardwalk_burger');
        assert.equal(pick.slot, 1);
        assert.equal(g.barSlot('eat'), 1);
        assert.equal(g.eatBlockedBy(), null);
    });

    test('the bar remembering a different food does not override the fit', () => {
        const g = eater({ hp: 30, inventory: bag() });
        g.xmbPick = { eat: 'hot_dog' };
        assert.equal(g.barSlot('eat'), 1);
    });

    test('no food at all: no choice, and the reason is "none", not "full"', () => {
        const g = eater({ hp: 30, inventory: [stack(ITEMS.rock ?? HOT_DOG)].slice(0, 0) });
        assert.equal(g.eatChoice(), null);
        assert.equal(g.eatBlockedBy(), 'none');
        assert.equal(g.barSlot('eat'), -1);
    });

    test('other bar columns still answer as before', () => {
        const g = eater({ hp: 100, inventory: [stack(ITEMS.bandage), stack(HOT_DOG)] });
        const drink = buildXmbBar(g.inventory).columns.find(c => c.key === 'drink');
        assert.equal(g.barSlot('drink'), drink ? drink.items[0].slot : -1);
        assert.equal(g.barSlot('throw'), -1);
    });
});

describe('Treat > Eat through the wheel, with real keys', () => {
    test('at full health Eat is greyed, Space bumps, and nothing is eaten', () => {
        const g = eater({ hp: 100, inventory: [stack(HOT_DOG)] });
        openToEat(g);
        const eat = selectedNode(g.wheel);
        assert.equal(eat.resolver, 'resolveUse');
        const lit = !eat.placeholder && (!eat.available || eat.available(g)) && verbApplies(eat, g);
        assert.equal(lit, false, 'Eat is drawn lit at full health');
        g.press('Space');
        assert.ok(sfx.includes('bump-wall'), 'Space on a greyed Eat did not bump');
        assert.deepEqual(g.used, []);
        assert.equal(g.inventory[0]?.itemDef.id, 'hot_dog', 'the Hot Dog was used up');
        assert.equal(g.playerHp, 100);
        assert.equal(g.state, STATE.RADIAL_MENU, 'the wheel should stay open');
    });

    test('hurt, Space eats the food that fits, once, and heals', () => {
        const g = eater({ hp: 30, inventory: [stack(HOT_DOG), stack(BURGER)] });
        openToEat(g);
        g.press('Space');
        assert.ok(!sfx.includes('bump-wall'), 'Space on a live Eat bumped');
        assert.deepEqual(g.used, ['boardwalk_burger']);
        assert.equal(g.playerHp, 45);
        assert.equal(g.inventory[0]?.itemDef.id, 'hot_dog', 'the Hot Dog stayed in the bag');
    });

    test('hurt by a little, Space eats the smaller food', () => {
        const g = eater({ hp: 92, inventory: [stack(BURGER), stack(HOT_DOG)] });
        openToEat(g);
        g.press('Space');
        assert.deepEqual(g.used, ['hot_dog']);
        assert.equal(g.playerHp, 100);
    });

    test('express repeat at full health uses nothing either', () => {
        const g = eater({ hp: 30, inventory: [stack(HOT_DOG)] });
        openToEat(g);
        g.press('Space');                       // eats the Hot Dog, and records itself as the last action
        const g2 = eater({ hp: 100, inventory: [stack(HOT_DOG)] });
        g2.wheel.path = g.wheel.path.slice();
        g2.state = STATE.RADIAL_MENU;
        m._fireWheel.call(g2);
        assert.deepEqual(g2.used, []);
        assert.equal(g2.inventory[0]?.itemDef.id, 'hot_dog');
    });
});

// ── What the Eat slice says ─────────────────────────────────────────────────────
function recorder() {
    const calls = [];
    const state = { globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: null, strokeStyle: null, filter: 'none' };
    const ctx = new Proxy(state, {
        get(t, k) {
            if (k in t) return t[k];
            return (...a) => {
                calls.push({ fn: k, a, fill: t.fillStyle });
                if (k === 'createRadialGradient' || k === 'createLinearGradient') return { addColorStop() {} };
            };
        },
        set(t, k, v) { t[k] = v; return true; },
    });
    return { ctx, calls };
}

function draw(g, cssW = 3440, cssH = 1440, dpr = 1) {
    const VP = computeViewport({ cssW, cssH, dpr, dock: DOCK });
    const main = recorder();
    const font = new BitmapFont();
    const drawn = [];
    const real = font.drawText.bind(font);
    font.drawText = (ctx, text, x, y, o = {}) => { drawn.push({ text, x, y, color: o.color }); real(ctx, text, x, y, o); };
    const r = Object.assign(Object.create(Renderer.prototype), {
        ctx: main.ctx, canvas: { width: VP.backingW, height: VP.backingH },
        viewport: VP, sprites: { uiPanel: null }, font,
        _fightFace: false, _hudFor: null, _hudFaceFor: null, _hudCache: null,
    });
    r._drawWheel(g);
    return { drawn, r, VP };
}

describe('the Eat slice, drawn', () => {
    test('live: it names the food and how much it heals', () => {
        const g = eater({ hp: 30, inventory: [stack(HOT_DOG), stack(BURGER)] });
        openToEat(g);
        const { drawn } = draw(g);
        const line = drawn.find(d => d.text.endsWith(' +15'));
        assert.ok(line, `no food line; drew ${JSON.stringify(drawn.map(d => d.text))}`);
        assert.equal(line.text, 'BOARDWALK BURGER +15');
        assert.ok(drawn.some(d => d.text === 'Eat'), 'the slice kept its label');
    });

    test('live: the line follows the fit', () => {
        const g = eater({ hp: 92, inventory: [stack(BURGER), stack(HOT_DOG)] });
        openToEat(g);
        const { drawn } = draw(g);
        assert.ok(drawn.some(d => d.text === 'HOT DOG +10'), JSON.stringify(drawn.map(d => d.text)));
    });

    test('greyed at full health: a reason line is drawn, and no food is named', () => {
        const g = eater({ hp: 100, inventory: [stack(HOT_DOG)] });
        openToEat(g);
        const { drawn } = draw(g);
        assert.ok(drawn.some(d => d.text === '[TEXT]'), `no reason; drew ${JSON.stringify(drawn.map(d => d.text))}`);
        assert.ok(!drawn.some(d => /HOT DOG/.test(d.text)));
    });

    test('greyed with no food: no reason line (nothing new to say)', () => {
        const g = eater({ hp: 30, inventory: [] });
        openToEat(g);
        const { drawn } = draw(g);
        assert.ok(!drawn.some(d => d.text === '[TEXT]'));
    });

    test('every other slice draws no second line', () => {
        const g = eater({ hp: 30, inventory: [stack(HOT_DOG)] });
        m._openWheel.call(g);
        const { drawn } = draw(g);
        assert.ok(!drawn.some(d => d.text === '[TEXT]' || / \+\d+$/.test(d.text)));
    });

    for (const [name, size] of [['ultrawide', [3440, 1440, 1]], ['phone', [390, 844, 3]]]) {
        test(`the words fit the slice at ${name} size, for every food`, () => {
            for (const def of [HOT_DOG, BURGER]) {
                const g = eater({ hp: 10, inventory: [stack(def)] });
                openToEat(g);
                const { drawn, r } = draw(g, ...size);
                const line = drawn.find(d => / \+\d+$/.test(d.text));
                assert.ok(line, `no line for ${def.id}`);
                // Slice chord at the line's row: inside the ring's outer arc, and between the slice edges.
                const [r0, r1] = wheelRingR(1);
                const lr = (r0 + r1) / 2;
                const rowTop = lr - 2 - 0, rowDist = rowTop;            // the row sits lr-2 .. lr-14 from the hub
                const outerHalf = Math.sqrt(r1 * r1 - rowDist * rowDist);
                const edgeHalf = r0 * Math.tan(Math.PI / 4 - WHEEL_TILE_GAP * 2);
                const half = r.font.measure(line.text, 1) / 2;
                assert.ok(half <= outerHalf, `${line.text} (${half * 2}px) is wider than the ring's arc (${outerHalf * 2}px)`);
                assert.ok(half <= edgeHalf, `${line.text} is wider than the slice's edges`);
                assert.ok(line.text.length > 0);
            }
        });
    }

    test('a long food name is trimmed to fit, and keeps its number', () => {
        const long = { ...BURGER, id: 'long_one', name: '[An Extremely Long Sandwich Name]' };
        const g = eater({ hp: 10, inventory: [stack(long)] });
        openToEat(g);
        const { drawn, r } = draw(g);
        const line = drawn.find(d => / \+15$/.test(d.text));
        assert.ok(line);
        assert.ok(r.font.measure(line.text, 1) <= 96, line.text);
        assert.ok(line.text.endsWith('. +15'), line.text);
    });
});
