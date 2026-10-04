// poition-placement.test.js — four of the five poitions can be found in the
// world (plans/trim.md 4a). Speed waits on its rework for the speed order.
// The spots are provisional: Caelan places them for good.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ITEMS } from '../game/items.js';

const GAME_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'game');
const map = (name) => JSON.parse(readFileSync(join(GAME_DIR, name), 'utf8'));

describe('the poitions are placed', () => {
    test('Puck sells Health and Mana', () => {
        const puck = map('factory-map.json').enemies.find(e => e && e.id === 'puck');
        assert.ok(puck && puck.vendor, 'Puck is a vendor in the Factory');
        assert.ok(puck.stock.includes('health_poition'));
        assert.ok(puck.stock.includes('mana_poition'));
    });

    test('a sewer chest holds Gold', () => {
        const chests = map('sewer-map.json').containers || [];
        assert.ok(chests.length > 0, 'the sewer has chests');
        assert.ok(chests.some(c => (c.contents || []).includes('gold_poition')));
    });

    test('a Factory chest holds Strength', () => {
        const chests = map('factory-map.json').containers || [];
        assert.ok(chests.length > 0, 'the Factory has a chest');
        assert.ok(chests.some(c => (c.contents || []).includes('strength_poition')));
    });

    test('every placed poition is a real item', () => {
        for (const id of ['health_poition', 'mana_poition', 'gold_poition', 'strength_poition']) {
            assert.ok(ITEMS[id], `${id} exists`);
        }
    });
});
