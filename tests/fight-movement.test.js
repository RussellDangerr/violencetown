// fight-movement.test.js — the game does not open on a fight (plans/fight-movement.md).
// Knuckles, in the plaza by the start, used to be born hostile and chase you on
// sight; now nobody in Town is, so a fight there starts only when you start one.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deriveAllegiance } from '../game/ai.js';

const town = JSON.parse(readFileSync(fileURLToPath(new URL('../game/town-map.json', import.meta.url)), 'utf8'));
const spawns = town.enemySpawns || town.enemies || [];

test('Town has people in it to check', () => assert.ok(spawns.length > 5));

test('nobody in Town is born hostile', () => {
    const hostile = spawns.filter(s => deriveAllegiance(s) === 'hostile').map(s => s.id);
    assert.deepEqual(hostile, []);
});

test('Knuckles keeps his temper: a low mood, his weapons, and a talk-down', () => {
    const k = spawns.find(s => s.id === 'townie-knuckles');
    assert.ok(k);
    assert.equal(deriveAllegiance(k), 'neutral');
    assert.ok(k.disposition < 0);
    assert.deepEqual(k.loadout, ['rock', 'pipe']);
    assert.equal(k.dialogueId, 'knuckles');
});
