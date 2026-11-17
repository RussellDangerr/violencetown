// GL1: the bag's item panel says what each piece of gear's perk does.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { itemStatLine, ARMOUR_PERKS } from '../game/inspector.js';
import { ITEMS } from '../game/items.js';
import { DELIVERY_CAP_PURSE } from '../game/trade.js';

const armour = Object.values(ITEMS).filter(d => d.armor);
const pct = Math.round((DELIVERY_CAP_PURSE - 1) * 100);

describe('GL1 armour perk lines', () => {
    test('the Shoe Bags and Foil Hat keep their lines', () => {
        assert.equal(itemStatLine(ITEMS.shoe_bags), '+2 armor, sludge-proof');
        assert.equal(itemStatLine(ITEMS.foil_hat), '+2 armor');
    });
    test('each ruled piece reads its phrase', () => {
        assert.equal(itemStatLine(ITEMS.lava_cape), `+2 armor, +${ITEMS.lava_cape.meleeBonus} melee`);
        assert.equal(itemStatLine(ITEMS.rat_mask), '+2 armor, walks through grates');
        assert.equal(itemStatLine(ITEMS.strongman_mask), '+2 armor, a two-hander in each hand');
        for (const id of ['delivery_cap_grey', 'delivery_cap_blue']) {
            assert.equal(itemStatLine(ITEMS[id]), `+2 armor, foes carry +${pct}% gold`);
        }
    });
    test('numbers follow the data, not retyped text', () => {
        assert.equal(itemStatLine({ armor: 1, meleeBonus: 9 }), '+1 armor, +9 melee');
    });
    test('every armour perk field has a phrase', () => {
        const fields = ARMOUR_PERKS.map(r => r.field);
        for (const d of armour) {
            for (const f of ['sludgeImmune', 'meleeBonus', 'deliveryCap', 'powerWield']) {
                if (d[f]) {
                    assert.ok(fields.includes(f), `${d.id}: no table row for ${f}`);
                    assert.ok(itemStatLine(d).includes(','), `${d.id} has ${f} but no phrase`);
                }
            }
            if ((d.body?.verbs || []).includes('grates')) {
                assert.ok(itemStatLine(d).includes('grates'), `${d.id} grates but no phrase`);
            }
        }
    });
    test('non-armour lines do not change', () => {
        assert.equal(itemStatLine({ damage: 12, useType: 'melee' }), '12 dmg');
        assert.equal(itemStatLine({ healAmount: 10 }), 'Heals 10 HP');
    });
});
