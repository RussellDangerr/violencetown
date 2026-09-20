// fight-panels-render.test.js — what the two fight panels actually DRAW
// (plans/combat-hud.md stage 4). Uses the recording canvas, because stage 3
// proved a green suite says nothing about whether a draw method runs.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Renderer } from '../game/renderer.js';
import { DOCK, fightPanelRects } from '../game/layout.js';
import { computeViewport } from '../game/viewport.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

function recorder() {
    const calls = [];
    const state = { globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: null, strokeStyle: null, filter: 'none' };
    const ctx = new Proxy(state, {
        get(t, k) {
            if (k in t) return t[k];
            if (k === 'createImageData') return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
            return (...a) => { calls.push({ fn: k, a }); if (/createRadialGradient|createLinearGradient/.test(k)) return { addColorStop() {} }; };
        },
        set(t, k, v) { t[k] = v; return true; },
    });
    return { ctx, calls };
}

const VP = computeViewport({ cssW: 1920, cssH: 1080, dpr: 1, dock: DOCK });

function rig() {
    const main = recorder();
    const drawn = [];
    const r = Object.assign(Object.create(Renderer.prototype), {
        ctx: main.ctx, canvas: { width: VP.backingW, height: VP.backingH },
        viewport: VP, sprites: { uiPanel: null },
        font: { drawText: (ctx, text, x, y, o = {}) => drawn.push({ text, x, y, color: o.color }) },
        _fightFace: true, _hudFor: null, _hudFaceFor: null, _hudCache: null,
    });
    return { r, drawn, calls: main.calls };
}

const wererat = () => ({
    type: 'Wererat', x: 12, y: 10, ambient: false, state: 'chasing', sightRange: 8, thievable: true,
    entity: { isAlive: () => true, hp: 7, maxHp: 12, armor: 2 },
    gold: 40, loadout: ['rock'], equipped: ['soap'],
});
const game = (over = {}) => ({
    playerX: 10, playerY: 10, _fightOn: true, wheel: null,
    equipment: { weapon: { id: 'wooden_sword', name: '[Wooden Sword]' }, top: null, bottom: null,
                 front: { id: 'soap', name: '[Soap]' }, back: null, sides: null },
    enemies: [wererat()], ...over,
});
const texts = (drawn) => drawn.map((d) => d.text).join(' | ');

describe('the fight panels draw', () => {
    test('nothing at all when there is no fight', () => {
        const { r, drawn, calls } = rig();
        r._drawFightPanels(game({ _fightOn: false, enemies: [] }));
        assert.equal(drawn.length, 0, texts(drawn));
        assert.equal(calls.length, 0, 'not even a panel background');
    });

    test('your six slots, labelled, with empties still shown', () => {
        const { r, drawn } = rig();
        r._drawFightPanels(game());
        const t = texts(drawn);
        for (const label of ['WEAPON', 'HEAD', 'ARMS', 'TORSO', 'BACK', 'FEET']) {
            assert.ok(t.includes(label), `${label} missing from ${t}`);
        }
    });

    test('what you are actually wielding', () => {
        const { r, drawn } = rig();
        r._drawFightPanels(game());
        assert.ok(texts(drawn).includes('WOODEN SWORD') || texts(drawn).includes('[Wooden Sword]'), texts(drawn));
    });

    test('their name, their HP as digits, and their gold', () => {
        const { r, drawn } = rig();
        r._drawFightPanels(game());
        const t = texts(drawn).toUpperCase();
        assert.ok(t.includes('WERERAT'), t);
        assert.ok(/\b7\s*\/\s*12\b/.test(t), `HP as digits missing from ${t}`);
        assert.ok(t.includes('40'), `gold missing from ${t}`);
    });

    test('their kit by name, not by count', () => {
        const { r, drawn } = rig();
        r._drawFightPanels(game());
        assert.ok(texts(drawn).toUpperCase().includes('ROCK'), texts(drawn));
    });

    test('the steal markers, so Thieve stops being three unexplained grey slices', () => {
        const { r, drawn } = rig();
        r._drawFightPanels(game());
        const t = texts(drawn).toUpperCase();
        for (const branch of ['COIN', 'KIT', 'GEAR']) assert.ok(t.includes(branch), `${branch} missing from ${t}`);
    });

    test('a broke, stripped enemy still draws — with nothing to take', () => {
        const { r, drawn } = rig();
        const bare = { ...wererat(), gold: 0, loadout: [], equipped: [] };
        r._drawFightPanels(game({ enemies: [bare] }));
        assert.ok(texts(drawn).toUpperCase().includes('WERERAT'));
    });

    test('a fight with no valid target still draws YOUR panel', () => {
        const { r, drawn } = rig();
        r._drawFightPanels(game({ enemies: [] }));
        assert.ok(texts(drawn).includes('WEAPON'), 'your gear should still be in view');
    });

    test('everything stays inside the rects layout gave them', () => {
        const { r, drawn } = rig();
        r._drawFightPanels(game());
        const p = fightPanelRects(VP);
        for (const d of drawn) {
            const inLeft = d.x >= p.left.x - 1 && d.x <= p.left.x + p.left.w + 1;
            const inRight = d.x >= p.right.x - 1 && d.x <= p.right.x + p.right.w + 1;
            assert.ok(inLeft || inRight, `text "${d.text}" at x=${d.x} is in neither panel`);
            assert.ok(d.y >= p.left.y - 1 && d.y <= p.left.y + p.left.h + 1, `"${d.text}" at y=${d.y} escaped`);
        }
    });

    test('no colour comes out undefined or NaN', () => {
        const { r, drawn } = rig();
        r._drawFightPanels(game());
        for (const d of drawn) assert.ok(!/undefined|NaN/.test(String(d.color)), `${d.text} -> ${d.color}`);
    });
});
