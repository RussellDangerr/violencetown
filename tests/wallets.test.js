// wallets.test.js — Law 6: loot = remaining wallet; respawns come back broke.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Enemy, spawnEnemy } from '../game/enemies.js';
import { transferGold } from '../game/trade.js';

describe('Law 6 — the wallet is the loot', () => {
    test('transferGold moves an enemy wallet to a receiver and conserves total', () => {
        const bandit = new Enemy({ id: 'b1', type: 'Bandit', x: 0, y: 0, gold: 40 });
        // transferGold's real contract (trade.js) only reads/writes a numeric
        // `.gold` on each side — no log param, no receiver-side bookkeeping.
        const player = { gold: 10 };
        const total = bandit.gold + player.gold;
        const ok = transferGold(bandit, player, bandit.gold, 'loot');
        assert.equal(ok, true);
        assert.equal(player.gold, 50);
        assert.equal(bandit.gold, 0);
        assert.equal(bandit.gold + player.gold, total);
    });

    test('transferGold refuses (and moves nothing) when the source cannot cover it', () => {
        const bandit = new Enemy({ id: 'b2', type: 'Bandit', x: 0, y: 0, gold: 5 });
        const player = { gold: 10 };
        const ok = transferGold(bandit, player, 40, 'loot');
        assert.equal(ok, false);
        assert.equal(bandit.gold, 5);
        assert.equal(player.gold, 10);
    });

    test('an Enemy with no gold ctor arg starts at 0 (plain NPC, not a vendor)', () => {
        const rat = new Enemy({ id: 'r1', type: 'Rat', x: 0, y: 0 });
        assert.equal(rat.gold, 0);
    });

    test('gold survives an Enemy save round-trip (vendors save their tills too)', () => {
        const bandit = new Enemy({ id: 'b3', type: 'Bandit', x: 0, y: 0, gold: 77 });
        const out = Enemy.fromSave(JSON.parse(JSON.stringify(bandit.toSave())));
        assert.equal(out.gold, 77);
    });

    test('spawnEnemy: an already-mugged spawn comes back broke (Law 6d)', () => {
        const e = spawnEnemy({ id: 'b4', type: 'Bandit', x: 0, y: 0, gold: 40 }, new Set(['b4']));
        assert.equal(e.gold, 0);
    });

    test('spawnEnemy: an unmugged spawn keeps its authored gold', () => {
        const e = spawnEnemy({ id: 'b5', type: 'Bandit', x: 0, y: 0, gold: 40 }, new Set(['someone-else']));
        assert.equal(e.gold, 40);
    });
});
