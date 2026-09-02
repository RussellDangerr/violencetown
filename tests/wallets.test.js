// wallets.test.js — Law 6: loot = remaining wallet; respawns come back broke.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Enemy, spawnEnemy, challengeGp, resolveLoadout } from '../game/enemies.js';
import { transferGold, burnGold } from '../game/trade.js';
import { ITEMS, poitionBuff } from '../game/items.js';
import { WEAPONS } from '../game/weapons.js';

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

    test('burnGold: the declared sink reduces the holder and returns true', () => {
        const holder = { gold: 50 };
        assert.equal(burnGold(holder, 30, 'heal'), true);
        assert.equal(holder.gold, 20);
    });

    test('burnGold: insufficient gold → false, holder untouched', () => {
        const holder = { gold: 10 };
        assert.equal(burnGold(holder, 30, 'heal'), false);
        assert.equal(holder.gold, 10);
    });
});

describe('challengeGp — Law 6f: the wallet number is the whole kit', () => {
    test('gold-only enemy reads as pure gold', () => {
        const e = new Enemy({ id: 'g', type: 'Grunt', x: 0, y: 0, gold: 40 });
        assert.equal(challengeGp(e), 40);
    });
    test('loadout values add to the composite', () => {
        const e = new Enemy({ id: 'b', type: 'Boss', x: 0, y: 0, gold: 40, loadout: [{ name: 'Big Potion', value: 60 }, { name: 'Spiked Fez', value: 400 }] });
        assert.equal(challengeGp(e), 500);
    });
    test('null-safe on bare objects and missing values', () => {
        assert.equal(challengeGp({ gold: 10 }), 10);
        assert.equal(challengeGp({}), 0);
        assert.equal(challengeGp({ gold: 5, loadout: [{ name: 'IOU' }] }), 5);
    });
});

describe('challengeGp over real item ids (Law 6f)', () => {
    test('a loadout of ids sums their baseValue', () => {
        const e = new Enemy({ id: 'k', type: 'Fungus', x: 0, y: 0, gold: 4, loadout: ['tunnel_mushroom', 'mystery_meat'] });
        assert.equal(challengeGp(e), 4 + 9 + 3);
    });
    test('an unknown id contributes 0 rather than NaN', () => {
        const e = new Enemy({ id: 'k2', type: 'Fungus', x: 0, y: 0, gold: 5, loadout: ['not_a_real_item'] });
        assert.equal(challengeGp(e), 5);
    });
    test('legacy literal {value} objects still count — old saves keep working', () => {
        assert.equal(challengeGp({ gold: 10, loadout: [{ name: 'Big Potion', value: 60 }] }), 70);
    });
    test('resolveLoadout hands back real defs an enemy can USE', () => {
        const defs = resolveLoadout(['bandage', 'fire_bottle']);
        assert.equal(defs.length, 2);
        assert.equal(defs[0], ITEMS.bandage);
        assert.equal(poitionBuff(defs[1].poition).id, 'fire');
    });
    test('resolveLoadout is null-safe', () => {
        assert.deepEqual(resolveLoadout(null), []);
        assert.deepEqual(resolveLoadout(undefined), []);
        assert.deepEqual(resolveLoadout(['nope']), []);
    });

    // Sibling of the bare-ITEMS ground-take bug: a boss authored with a weapon
    // in its loadout used to drop it silently on death (resolveLoadout) and
    // count 0 toward its nameplate GP (challengeGp) — the ONLY item source
    // that resolves this without a live Game (no _resolveItemDef to call), so
    // it inlines the same WEAPONS-then-ITEMS order directly.
    test('resolveLoadout resolves a weapon id, not just an ITEMS id', () => {
        const defs = resolveLoadout(['lion_whip', 'bandage']);
        assert.equal(defs.length, 2);
        assert.equal(defs[0], WEAPONS.lion_whip);
        assert.equal(defs[1], ITEMS.bandage);
    });

    test('a loadout weapon counts toward challengeGp by its baseValue', () => {
        const e = new Enemy({ id: 'k3', type: 'Boss', x: 0, y: 0, gold: 10, loadout: ['ray_gun'] });
        assert.equal(challengeGp(e), 10 + WEAPONS.ray_gun.baseValue);
    });
});
