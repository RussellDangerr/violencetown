import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { weaknessesOf, resistancesOf } from '../game/elements.js';

const sewer = JSON.parse(readFileSync(new URL('../game/sewer-map.json', import.meta.url), 'utf8'));
const fungi = sewer.enemies.filter(e => /^(Violet|Red|Ghost) Fungus$/.test(e.type));

test('EW1: the Sewer has all five ordinary fungi (guards against an empty pass)', () => {
    assert.equal(fungi.length, 5);
    assert.deepEqual(new Set(fungi.map(e => e.type)), new Set(['Violet Fungus', 'Red Fungus', 'Ghost Fungus']));
});

test('EW1: every fungus is earth, its lists read from the chart', () => {
    for (const e of fungi) {
        assert.deepEqual(e.weak, weaknessesOf('sludge'), `${e.id} weak`);
        assert.deepEqual(e.resist, resistancesOf('sludge'), `${e.id} resist`);
    }
});

test('EW1: Energy and soap meet a weakness, cold meets a resistance', () => {
    for (const e of fungi) {
        assert.ok(e.weak.includes('energy') && e.weak.includes('clean'));
        assert.ok(e.resist.includes('cold') && e.resist.includes('fear'));
    }
});

test('EW1: the Fungus King and Carrion stay as they are', () => {
    for (const t of ['Fungus King', 'Carrion']) {
        const e = sewer.enemies.find(x => x.type === t);
        assert.ok(e && !e.weak && !e.resist, t);
    }
});
