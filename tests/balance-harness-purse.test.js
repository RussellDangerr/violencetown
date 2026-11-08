// balance-harness-purse.test.js — FX13: the bench counts townsfolk purses the way the game draws them.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadMapRoster, report } from '../tools/balance-harness.mjs';
import { spawnEnemy, isTownsperson, TOWNSFOLK_PURSE_MIN, TOWNSFOLK_PURSE_MAX } from '../game/enemies.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const town = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'game', 'town-map.json'), 'utf8'));

describe('FX13 — the balance bench sees townsfolk purses', () => {
    const roster = loadMapRoster();
    const townsfolk = town.enemies.filter(isTownsperson);

    test('the town has townsfolk on the bench', () => {
        assert.ok(townsfolk.length >= 3);
    });

    test('each townsperson row carries the purse the game spawns them with', () => {
        for (const s of townsfolk) {
            const row = roster.find(r => r.zone === 'town' && r.id === s.id);
            assert.ok(row, `no bench row for ${s.id}`);
            assert.equal(row.gold, spawnEnemy(s, new Set()).gold);
            assert.ok(row.gold >= TOWNSFOLK_PURSE_MIN && row.gold <= TOWNSFOLK_PURSE_MAX);
        }
    });

    test('rows that are not townsfolk keep their authored wallet', () => {
        for (const s of town.enemies.filter(e => !isTownsperson(e))) {
            const row = roster.find(r => r.zone === 'town' && r.id === s.id);
            assert.equal(row.gold, s.gold ?? 0, s.id);
        }
    });

    test("the town's faucet includes every purse", () => {
        const expected = roster.filter(r => r.zone === 'town').reduce((n, r) => n + r.gold, 0);
        const purses = townsfolk.reduce((n, s) => n + spawnEnemy(s, new Set()).gold, 0);
        assert.ok(purses > 0);
        const line = report(roster).split('\n').find(l => /^town\s+\d+$/.test(l));
        assert.ok(line, 'no town faucet row');
        assert.equal(Number(line.trim().split(/\s+/)[1]), expected);
    });
});
