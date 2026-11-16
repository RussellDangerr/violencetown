// modal-key-gate.test.js — FX67: game keys stop at the Options window, the help
// window and the key screen. The real _bindInput listener is lifted from the
// source and fed keydown events; a probe (_skipLootReel, the first thing past the
// gate) says whether a key reached the world.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8').split(String.fromCharCode(13)).join('');

function lift(name) {
    const sig = `${name}(`;
    const at = src.indexOf(`\n    ${sig}`) + 5;
    assert.ok(at > 5, `${name} not found`);
    const end = src.indexOf('\n    }\n', at);
    return src.slice(at + name.length, end + 6);
}

function rig() {
    const els = {};
    const mk = (hidden) => { const set = new Set(hidden ? ['hidden'] : []); return { classList: { contains: c => set.has(c), add: c => set.add(c), remove: c => set.delete(c) } }; };
    els['options-modal'] = mk(true);
    els['help-modal'] = mk(true);
    let listener = null;
    const document = {
        addEventListener: (t, f) => { if (t === 'keydown') listener = f; },
        getElementById: id => els[id] || null,
    };
    const game = { state: 'IDLE', playerX: 16, playerY: 12, reached: 0 };
    game._skipLootReel = () => { game.reached++; };
    const STATE = { SPLASH: 'SPLASH', RESOLVING: 'RESOLVING', IDLE: 'IDLE' };
    const bind = new Function('document', 'window', 'STATE', `return function ${lift('_bindInput').replace(/^_bindInput/, '_bindInput')}`);
    bind(document, { addEventListener() {}, innerWidth: 1, innerHeight: 1 }, new Proxy(STATE, { get: (t, k) => t[k] ?? k })).call(game);
    // Past the gate the real handler needs the whole game; the probe has already counted by then.
    const press = (code, target = { tagName: 'BODY' }) => { try { listener({ code, key: code, target, repeat: false, preventDefault() {}, stopPropagation() {} }); } catch { /* past the gate */ } };
    return { els, game, press, mk };
}

const KEYS = ['KeyD', 'KeyS', 'Space', 'Enter', 'KeyE'];

describe('FX67 modal key gate', () => {
    test('with no window open, keys reach the world', () => {
        const { game, press } = rig();
        for (const k of KEYS) press(k);
        assert.equal(game.reached, KEYS.length);
    });

    for (const id of ['options-modal', 'help-modal', 'key-once']) {
        test(`${id} open: no key reaches the world`, () => {
            const { els, game, press, mk } = rig();
            if (id === 'key-once') els[id] = mk(false); else els[id].classList.remove('hidden');
            for (const k of KEYS) press(k, { tagName: 'BUTTON' });
            assert.equal(game.reached, 0);
            assert.deepEqual([game.playerX, game.playerY], [16, 12]);
        });
    }

    test('closing the window gives the keys back', () => {
        const { els, game, press } = rig();
        els['options-modal'].classList.remove('hidden');
        press('KeyD');
        els['options-modal'].classList.add('hidden');
        press('KeyD');
        assert.equal(game.reached, 1);
    });

    test('Esc handlers and text-box guard stay in place', () => {
        assert.match(src, /e\.code === 'Escape' && !modal\.classList\.contains\('hidden'\)/);
        assert.match(src, /tag === 'INPUT' \|\| tag === 'TEXTAREA' \|\| tag === 'BUTTON'/);
    });
});
