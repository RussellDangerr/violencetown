// save-key.test.js - PK2: a four-word key from a bundled list, same phrase => same id,
// the phrase itself never stored.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WORDS, WORD_BITS } from '../game/wordlist.js';
import {
    generatePhrase, normalizePhrase, isValidPhrase, keyIdFor, createKey, loadKeyId, KEY_BITS, KEY_STORAGE,
} from '../game/save-key.js';

function fakeStore() {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m };
}

describe('the word list', () => {
    test('is 4096 distinct lowercase words, so a word is 12 bits and the key 48', () => {
        assert.equal(WORDS.length, 4096);
        assert.equal(new Set(WORDS).size, 4096);
        assert.equal(WORD_BITS, 12);
        assert.equal(KEY_BITS, 48);
        for (const w of WORDS) assert.match(w, /^[a-z]{3,8}$/);
    });
    test('states its provenance', () => {
        const src = readFileSync(new URL('../game/wordlist.js', import.meta.url), 'utf8');
        assert.match(src, /Provenance:/);
    });
});

describe('generating', () => {
    test('four words, all from the list, drawn through getRandomValues', () => {
        let called = 0;
        const fake = { getRandomValues: (a) => { called++; a.set([0, 1, 4095, 4096 + 7]); return a; } };
        const p = generatePhrase(fake);
        assert.equal(called, 1);
        assert.deepEqual(p.split(' '), [WORDS[0], WORDS[1], WORDS[4095], WORDS[7]]);
    });
    test('real randomness gives valid, different phrases', () => {
        const seen = new Set();
        for (let i = 0; i < 20; i++) { const p = generatePhrase(); assert.ok(isValidPhrase(p)); seen.add(p); }
        assert.ok(seen.size > 15);
    });
});

describe('the id', () => {
    test('the same phrase always gives the same id, however it is typed', async () => {
        const a = await keyIdFor('Acorn actor ADDER aisle');
        const b = await keyIdFor('  acorn-actor adder   aisle ');
        assert.equal(a, b);
        assert.match(a, /^[0-9a-f]{32}$/);
    });
    test('a different phrase gives a different id', async () => {
        assert.notEqual(await keyIdFor('acorn actor adder aisle'), await keyIdFor('acorn actor adder alarm'));
    });
    test('normalize and validate', () => {
        assert.equal(normalizePhrase('A-B_c,  d'), 'a b c d');
        assert.equal(isValidPhrase('acorn actor adder'), false);
        assert.equal(isValidPhrase('acorn actor adder zzzzzz'), false);
        assert.equal(isValidPhrase('acorn actor adder aisle'), true);
    });
});

describe('keeping', () => {
    test('createKey stores only the id, never the phrase', async () => {
        const store = fakeStore();
        const { phrase, id } = await createKey(store);
        assert.equal(loadKeyId(store), id);
        assert.equal(id, await keyIdFor(phrase));
        for (const [k, v] of store._m) {
            assert.equal(k, KEY_STORAGE);
            for (const w of phrase.split(' ')) assert.ok(!v.includes(w) || /^[0-9a-f]+$/.test(v));
            assert.ok(!v.includes(phrase));
        }
        assert.equal(store._m.size, 1);
    });
    test('no key yet reads as null', () => assert.equal(loadKeyId(fakeStore()), null));
});

describe('wiring', () => {
    const main = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
    test('main.js has the key row and the shown-once screen, behind a click only', () => {
        assert.match(main, /from '\.\/save-key\.js'/);
        assert.match(main, /_showKeyOnce\(phrase\)/);
        assert.match(main, /btn\.addEventListener\('click'/);
    });
    test('the key screen never writes the phrase to storage', () => {
        const fn = main.slice(main.indexOf('_showKeyOnce(phrase) {'), main.indexOf('_toggleFullscreen() {'));
        assert.ok(!/localStorage|setItem|_log\(/.test(fn));
    });
});
