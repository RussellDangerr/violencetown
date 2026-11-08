// buff-chip.test.js — a buff chip shows as much of the name as fits
// (plans/fx8-buff-chip-fit.md). The chip used to cut every name to 5 letters
// ("STREN", "DEFEN") with room for about twice that. Measured with the real
// BitmapFont.measure, the one the game draws with.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { Renderer, buffChipLabel, BUFF_CHIP } from '../game/renderer.js';
import { BitmapFont } from '../game/bitmap-font.js';
import { BUFF_DEFS } from '../game/buffs.js';
import { ITEMS } from '../game/items.js';
import { DOCK } from '../game/layout.js';
import { computeViewport } from '../game/viewport.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const FONT = new BitmapFont();
const px = (s) => FONT.measure(s, 1);
const ROOM = BUFF_CHIP.w - BUFF_CHIP.padX * 2;

// Every name a buff can carry: the BUFF_DEFS names, every name literal handed
// to addBuff or pushed onto a buff list anywhere in game/, the poition buff
// names items.js picks between, and the poition items an enemy drinks by name.
function everyBuffName() {
    const names = new Set();
    for (const def of Object.values(BUFF_DEFS)) if (def.name) names.add(def.name);
    const dir = new URL('../game/', import.meta.url);
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
        const src = readFileSync(new URL(f, dir), 'utf8');
        for (const m of src.matchAll(/addBuff\(\s*[^,()]+,\s*'([^']+)'/g)) names.add(m[1]);
        for (const m of src.matchAll(/buffs\.push\(\{[^}]*\bname:\s*'([^']+)'/g)) names.add(m[1]);
        if (f === 'items.js') for (const m of src.matchAll(/'([A-Z][a-z]+ Poition)'/g)) names.add(m[1]);
    }
    for (const def of Object.values(ITEMS)) if (def.poition && def.name) names.add(def.name);
    return [...names];
}
const NAMES = everyBuffName();

describe('buffChipLabel', () => {
    test('the name list is the real one, not empty', () => {
        for (const n of ['Sludge', 'Guard', 'Burning', 'Fire Blood', 'Feared', 'Poisoned',
            'Health Poition', 'Mana Poition', 'Strength Poition', 'Defence Poition']) {
            assert.ok(NAMES.includes(n), `${n} missing from ${JSON.stringify(NAMES)}`);
        }
    });

    for (const name of NAMES) {
        test(`"${name}": the longest prefix that fits the chip`, () => {
            const up = name.toUpperCase();
            const label = buffChipLabel(name, ROOM, px);
            assert.ok(label.length > 0, 'something shows');
            assert.ok(up.startsWith(label), `"${label}" is a prefix of "${up}"`);
            assert.ok(px(label) <= ROOM, `"${label}" is ${px(label)} px, room ${ROOM}`);
            if (px(up) <= ROOM) assert.equal(label, up, 'a name that fits is whole');
            else assert.ok(px(up.slice(0, label.length + 1)) > ROOM || up[label.length] === ' ', `"${label}" had room for one more letter`);
            assert.ok(label.length >= Math.min(up.length, 5), 'never shorter than the old 5-letter cut');
        });
    }

    test('long names keep more than 5 letters', () => {
        assert.equal(buffChipLabel('Strength Poition', ROOM, px), 'STRENGTH');
        assert.equal(buffChipLabel('Defence Poition', ROOM, px), 'DEFENCE P');
    });
});

// A renderer whose font records each string and measures like the real one.
function rig(vp) {
    const drawn = [];
    const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => { t[k] = v; return true; } });
    const r = Object.assign(Object.create(Renderer.prototype), {
        ctx, viewport: vp, canvas: { width: vp.backingW, height: vp.backingH },
        sprites: { uiPanel: null }, _fightFace: false, _hudFor: null, _hudFaceFor: null, _hudCache: null,
        font: { measure: (s, sc = 1) => FONT.measure(s, sc), drawText: (c, text, x, y, o = {}) => drawn.push({ text, x, y }) },
    });
    return { r, drawn };
}

test('3440x1440: the buff bar draws each fitted name inside its chip', () => {
    const vp = computeViewport({ cssW: 3440, cssH: 1440, dpr: 1, dock: DOCK });
    const { r, drawn } = rig(vp);
    const buffs = [
        { id: 'strength', name: 'Strength Poition', turns: 3, type: 'buff' },
        { id: 'defence', name: 'Defence Poition', turns: 5, type: 'buff' },
        { id: 'guard', name: 'Guard', turns: 2, type: 'buff' },
    ];
    r._drawBuffBar({ buffs });
    const texts = drawn.map((d) => d.text);
    assert.deepEqual(texts.filter((t) => !/^\d+$/.test(t)), ['STRENGTH', 'DEFENCE P', 'GUARD'], JSON.stringify(texts));
    const names = drawn.filter((d) => !/^\d+$/.test(d.text));
    for (const [i, d] of names.entries()) {
        const left = names[0].x + i * (BUFF_CHIP.w + BUFF_CHIP.gap) - BUFF_CHIP.padX;
        assert.ok(d.x + px(d.text) <= left + BUFF_CHIP.w - BUFF_CHIP.padX, `"${d.text}" runs past its chip`);
    }
});
