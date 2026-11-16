// options-key.test.js — OP1: O opens Options. The real _bindOptionsKey listener is
// lifted from main.js and fed keydown events.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8').split(String.fromCharCode(13)).join('');
const html = readFileSync(fileURLToPath(new URL('../game/index.html', import.meta.url)), 'utf8');

function lift(name) {
    const at = src.indexOf(`\n    ${name}(`) + 5;
    assert.ok(at > 5, `${name} not found`);
    const end = src.indexOf('\n    }\n', at);
    return src.slice(at + name.length, end + 6);
}

function rig(state = 'IDLE') {
    const els = {};
    const mk = (hidden) => { const set = new Set(hidden ? ['hidden'] : []); return { classList: { contains: c => set.has(c), add: c => set.add(c), remove: c => set.delete(c) } }; };
    els['options-modal'] = mk(true);
    els['help-modal'] = mk(true);
    let listener = null, phase = null;
    const document = {
        addEventListener: (t, f, cap) => { if (t === 'keydown') { listener = f; phase = cap; } },
        getElementById: id => els[id] || null,
    };
    const game = { state, opened: 0 };
    game._openOptionsModal = () => { game.opened++; };
    const STATE = { SPLASH: 'SPLASH', IDLE: 'IDLE' };
    new Function('document', 'STATE', `return function ${lift('_bindOptionsKey')}`)(document, STATE).call(game);
    const press = (code, extra = {}) => {
        let prevented = false;
        listener({ code, key: code, target: { tagName: 'BODY' }, repeat: false, preventDefault() { prevented = true; }, ...extra });
        return prevented;
    };
    return { els, game, press, mk, phase: () => phase };
}

describe('OP1 options key', () => {
    test('O opens Options from play, on the capture phase', () => {
        const { game, press, phase } = rig();
        assert.equal(press('KeyO'), true);
        assert.equal(game.opened, 1);
        assert.equal(phase(), true);
    });
    test('other keys do nothing', () => {
        const { game, press } = rig();
        press('KeyP'); press('Escape');
        assert.equal(game.opened, 0);
    });
    test('not on the title', () => {
        const { game, press } = rig('SPLASH');
        press('KeyO');
        assert.equal(game.opened, 0);
    });
    test('not while typing in a text box', () => {
        const { game, press } = rig();
        press('KeyO', { target: { tagName: 'INPUT' } });
        press('KeyO', { target: { tagName: 'TEXTAREA' } });
        assert.equal(game.opened, 0);
    });
    test('not with a browser chord or key repeat', () => {
        const { game, press } = rig();
        press('KeyO', { ctrlKey: true }); press('KeyO', { metaKey: true }); press('KeyO', { altKey: true }); press('KeyO', { repeat: true });
        assert.equal(game.opened, 0);
    });
    for (const id of ['options-modal', 'help-modal', 'key-once']) {
        test(`not while ${id} is up`, () => {
            const { els, game, press, mk } = rig();
            if (id === 'key-once') els[id] = mk(false); else els[id].classList.remove('hidden');
            press('KeyO');
            assert.equal(game.opened, 0);
        });
    }
    test('the listener is bound at start-up and Help names the key', () => {
        assert.match(src, /this\._bindOptionsKey\(\);/);
        assert.match(html, /<kbd>O<\/kbd> options/);
    });
    test('the pause screen does not stop it (capture phase runs before _bindInput)', () => {
        const { game, press } = rig();
        game._paused = true;
        press('KeyO');
        assert.equal(game.opened, 1);
    });
});
