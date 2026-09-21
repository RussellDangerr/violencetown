// autoplay-route.test.js — quest 1 as goals, and every id they name is real.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { QUESTS } from '../game/quests.js';
import { ITEMS } from '../game/items.js';
import { ROUTES } from '../game/autoplay/route.js';

const map = (f) => JSON.parse(readFileSync(new URL(`../game/${f}`, import.meta.url), 'utf8'));
const goals = Object.values(ROUTES.fix_car).flat();

describe('the quest-1 route', () => {
    test('every stage of fix_car has goals, and no goal names a stage that is not there', () => {
        assert.deepEqual(Object.keys(ROUTES.fix_car), QUESTS.fix_car.stages.map((s) => s.id));
    });

    test('every map a goal names exists', () => {
        for (const g of goals) {
            const f = g.map || g.reach;
            if (f) assert.ok(existsSync(new URL(`../game/${f}`, import.meta.url)), `${f} is not in game/`);
        }
    });

    test('town and sewer connect both ways — the player only travels to neighbouring maps', () => {
        assert.ok(map('town-map.json').transitions.some((t) => t.toMap === 'sewer-map.json'));
        assert.ok(map('sewer-map.json').transitions.some((t) => t.toMap === 'town-map.json'));
    });

    test('every id a goal names exists where it says', () => {
        for (const g of goals) {
            if (g.use) assert.ok(map(g.map).examinables.some((e) => e.id === g.use), `no examinable ${g.use} in ${g.map}`);
            if (g.kill) assert.ok(map(g.map).enemies.some((e) => e.tag === g.kill), `no enemy tagged ${g.kill} in ${g.map}`);
            if (g.take) assert.ok(ITEMS[g.take], `no item ${g.take}`);
        }
    });
});
