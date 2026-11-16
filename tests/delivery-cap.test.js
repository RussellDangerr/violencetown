// delivery-cap.test.js — MS3: grey and blue delivery caps share a body; worn, enemies carry 50% more.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ITEMS, ARMOR_IDS, itemTier, wornBody } from '../game/items.js';
import { ENEMY_SPRITES, ITEM_SPRITES } from '../game/sprites.js';
import { carriedGold, transferGold, wearsDeliveryCap } from '../game/trade.js';

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');
const grey = ITEMS.delivery_cap_grey, blue = ITEMS.delivery_cap_blue;

describe('the delivery caps', () => {
    test('two head-slot masks, one body, one perk, different tiers', () => {
        for (const c of [grey, blue]) {
            assert.equal(c.equipSlot, 'top');
            assert.ok(ARMOR_IDS.includes(c.id));
            assert.equal(c.deliveryCap, true);
        }
        assert.deepEqual(grey.body, blue.body);
        assert.ok(ENEMY_SPRITES[grey.body.sprite]);
        assert.equal(itemTier(grey).key, 'grey');
        assert.equal(itemTier(blue).key, 'blue');
        assert.ok(ITEM_SPRITES.delivery_cap_grey && ITEM_SPRITES.delivery_cap_blue);
        assert.equal(wornBody({ top: blue }).species, 'courier');
    });

    test('worn, a purse grows by half; unworn it is untouched', () => {
        assert.equal(carriedGold(10, { top: grey }), 15);
        assert.equal(carriedGold(10, { top: blue }), 15);
        assert.equal(carriedGold(7, { top: grey }), 11, 'rounds up');
        assert.equal(carriedGold(10, {}), 10);
        assert.equal(carriedGold(10, { top: ITEMS.foil_hat }), 10);
        assert.equal(carriedGold(0, { top: grey }), 0);
        assert.equal(wearsDeliveryCap({ top: grey }), true);
    });

    test('looting a whole purse through transferGold pays half again while worn; ordinary moves are untouched', () => {
        const me = { gold: 0, equipment: { top: grey } };
        const enemy = { gold: 10 };
        assert.ok(transferGold(enemy, me, 10, 'loot'));
        assert.equal(me.gold, 15);
        assert.equal(enemy.gold, 0, 'the enemy paid every coin of it');
        const bare = { gold: 0, equipment: {} }, e2 = { gold: 10 };
        transferGold(e2, bare, 10, 'loot');
        assert.equal(bare.gold, 10);
        const buyer = { gold: 0, equipment: { top: blue } }, shop = { gold: 10 };
        transferGold(shop, buyer, 10, 'sale');
        assert.equal(buyer.gold, 10, 'a sale is not a loot');
    });

    test('the enemy-death loot goes through transferGold with the loot reason', () => {
        const at = mainSrc.indexOf('_handleEnemyDeath(enemyObj) {');
        assert.ok(at > 0);
        assert.ok(mainSrc.slice(at, at + 2500).includes("transferGold(enemyObj, this, loot, 'loot')"));
    });
});
