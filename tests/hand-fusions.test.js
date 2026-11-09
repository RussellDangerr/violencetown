// hand-fusions.test.js — two held weapons combine into a named effect
// (plans/hb2-weapon-pair-effects.md).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { HAND_PAIRS, HAND_TAGS, handTagsOf, handPairOf } from '../game/hand-data.js';
import { WEAPONS, WEAPON_TIERS, WEAPON_CLASSES } from '../game/weapons.js';
import { SPELLS } from '../game/spells.js';
import { TRICKS } from '../game/tricks.js';

const WOK = WEAPON_TIERS.shield[0];         // the wok is a shield-class item
const PAN = WEAPON_TIERS.frying_pan[0];
const WAND = WEAPON_TIERS.wand[0];
const BOOK = WEAPON_TIERS.book[0];
const SWORD = WEAPONS.wooden_sword;
const GREAT = WEAPON_TIERS.great_sword[0];

describe('the pairs table', () => {
    test('every tag belongs to a real weapon class', () => {
        for (const id of Object.keys(HAND_TAGS)) assert.ok(WEAPON_CLASSES[id], id);
    });

    test('every pair is two tags a class carries, and names an existing skill', () => {
        const known = new Set(Object.values(HAND_TAGS).flat());
        assert.ok(HAND_PAIRS.length >= 2);
        for (const p of HAND_PAIRS) {
            assert.equal(p.pair.length, 2, p.id);
            for (const t of p.pair) assert.ok(known.has(t), `${p.id}: ${t}`);
            assert.ok(SPELLS[p.grants] || TRICKS[p.grants], `${p.id} grants ${p.grants}`);
            assert.match(p.name, /^\[.*\]$/, 'names are placeholders');
        }
    });
});

describe('what a hand holds', () => {
    test('tags come from the class', () => {
        assert.deepEqual(handTagsOf(WOK), ['shield']);
        assert.deepEqual(handTagsOf(PAN), ['pan']);
        assert.deepEqual(handTagsOf(SWORD), []);
        assert.deepEqual(handTagsOf(null), []);
        assert.deepEqual(handTagsOf({ id: 'pipe' }), []);
    });
});

describe('holding a pair', () => {
    test('wok shield + frying pan makes the first pair, in either hand order', () => {
        const a = handPairOf(WOK, PAN), b = handPairOf(PAN, WOK);
        assert.equal(a.id, 'wok_pan');
        assert.equal(b.id, 'wok_pan');
    });

    test('wand + book makes the second, in either hand order', () => {
        assert.equal(handPairOf(WAND, BOOK).id, 'wand_book');
        assert.equal(handPairOf(BOOK, WAND).id, 'wand_book');
    });

    test('changing either hand removes it', () => {
        assert.ok(handPairOf(WOK, PAN));
        assert.equal(handPairOf(WOK, SWORD), null);
        assert.equal(handPairOf(SWORD, PAN), null);
        assert.equal(handPairOf(null, PAN), null);
        assert.equal(handPairOf(WOK, null), null);
    });

    test('an unrelated pair, a double, and a two-hander in both hands make nothing', () => {
        assert.equal(handPairOf(WOK, BOOK), null);
        assert.equal(handPairOf(PAN, PAN), null);
        assert.equal(handPairOf(WOK, WOK), null);
        assert.equal(handPairOf(GREAT, GREAT), null);
    });

    test('every tier of the same classes pairs the same', () => {
        for (const w of WEAPON_TIERS.shield) for (const p of WEAPON_TIERS.frying_pan)
            assert.equal(handPairOf(w, p).id, 'wok_pan');
    });
});

describe('main.js and the GEAR tab are wired to it', () => {
    const main = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');
    const rend = readFileSync(fileURLToPath(new URL('../game/renderer.js', import.meta.url)), 'utf8');

    test('the grant refresh reads both hands and merges the pair skill', () => {
        assert.match(main, /import \{ handPairOf \} from '\.\/hand-data\.js'/);
        assert.match(main, /this\.handPair = this\._handPairNow\?\.\(\) \?\? null/);
        assert.match(main, /_handPairNow\(\) \{[^\n]*handPairOf\(eq\.left, eq\.weapon\)/);
        assert.match(main, /mergeKnown\(BASE_SPELLS, \[\.\.\.ringSpells, \.\.\.pairSpells\]/);
        assert.match(main, /mergeKnown\(\[\], \[\.\.\.ringTricks, \.\.\.pairTricks\]/);
    });

    test('the GEAR tab draws the pair name', () => {
        assert.match(rend, /if \(game\.handPair\) this\.font\.drawText/);
    });
});
