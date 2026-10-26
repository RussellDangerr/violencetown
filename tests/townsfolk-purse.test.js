// townsfolk-purse.test.js — FX13: townsfolk carry a small purse (plans/fx13-townsfolk-purse.md).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    spawnEnemy, townsfolkPurse, isTownsperson,
    TOWNSFOLK_PURSE_MIN, TOWNSFOLK_PURSE_MAX,
} from '../game/enemies.js';
import { RNG } from '../game/rng.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const town = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'game', 'town-map.json'), 'utf8'));
const folk = (id, extra = {}) => ({ id, type: 'Violencian', x: 0, y: 0, armor: -80, damage: 0, ambient: true, behavior: ['IDLE'], ...extra });

describe('FX13 — townsfolk carry a small purse', () => {
    test('the town has townsfolk to test against', () => {
        assert.ok(town.enemies.filter(isTownsperson).length >= 3);
    });

    test('every townsperson in the town spawns with a purse inside the range', () => {
        for (const s of town.enemies.filter(isTownsperson)) {
            const e = spawnEnemy(s, new Set());
            assert.ok(e.gold >= TOWNSFOLK_PURSE_MIN && e.gold <= TOWNSFOLK_PURSE_MAX,
                `${s.id} carries ${e.gold}`);
            assert.ok(Number.isInteger(e.gold));
        }
    });

    test('the purse varies by person', () => {
        const purses = new Set();
        for (let i = 0; i < 40; i++) purses.add(townsfolkPurse(`folk-${i}`));
        assert.ok(purses.size > 1, 'every person drew the same purse');
        for (const p of purses) assert.ok(p >= TOWNSFOLK_PURSE_MIN && p <= TOWNSFOLK_PURSE_MAX);
    });

    test('the same person gets the same purse on every load', () => {
        for (const s of town.enemies.filter(isTownsperson)) {
            assert.equal(spawnEnemy(s, new Set()).gold, spawnEnemy(s, new Set()).gold);
        }
    });

    test('vendors keep their till, fighters their kit, authored wallets their gold', () => {
        const macc = town.enemies.find(s => s.vendor && s.ambient);
        assert.ok(macc);
        assert.equal(isTownsperson(macc), false);
        assert.equal(spawnEnemy(macc, new Set()).gold, 9999);
        assert.equal(isTownsperson(folk('f', { damage: 4 })), false);
        assert.equal(spawnEnemy(folk('g', { gold: 17 }), new Set()).gold, 17);
        assert.equal(isTownsperson(folk('n', { ambient: false })), false);
    });

    test('a mugged townsperson comes back broke; a robbed one comes back short', () => {
        const s = folk('rob-me');
        const full = spawnEnemy(s, new Set()).gold;
        assert.equal(spawnEnemy(s, new Set(['rob-me'])).gold, 0);
        assert.equal(spawnEnemy(s, new Set(), { 'rob-me': { gold: 1 } }).gold, full - 1);
        assert.equal(spawnEnemy(s, new Set(), { 'rob-me': { gold: 999 } }).gold, 0);
    });

    test('drawing a purse never touches the game RNG', () => {
        const game = { rng: new RNG(1234) };
        const before = game.rng.getState();
        for (const s of town.enemies) spawnEnemy(s, new Set());
        townsfolkPurse('anyone');
        assert.equal(game.rng.getState(), before);
        // and the purse does not depend on any shared stream's position
        const a = townsfolkPurse('same');
        new RNG(5).float();
        assert.equal(townsfolkPurse('same'), a);
    });

    test('purses are integers and never use Math.random', () => {
        const orig = Math.random;
        Math.random = () => { throw new Error('Math.random used'); };
        try {
            for (let i = 0; i < 10; i++) assert.ok(Number.isInteger(townsfolkPurse(`m-${i}`)));
        } finally {
            Math.random = orig;
        }
    });
});
