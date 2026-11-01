// ramp-route-gold.test.js — the sewer's haul pays for Hooch's alcohol
// (plans/ho2-sewer-haul-record.md, rulings HOR2 and HO2R1).
//
// The ramp route buys a bottle of alcohol from Hooch. The autoplay golden keeps
// what the quest run and the sneak carry out of the Sewer (`sewerExit`: the bag
// and the gold). Sold to Hooch at his own disposition, that bag plus that gold
// has to cover the bottle's price, so a change to a price, a drop or a band
// cannot strand the route unseen.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveItemDef } from '../game/item-registry.js';
import { buyPrice, sellPrice } from '../game/trade.js';

const json = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const golden = json('../tools/autoplay-golden.json');
const hooch = json('../game/town-map.json').enemies.find((n) => n.id === 'townie-hooch');

// A bag entry is "id" or, for a stack, "id xN".
function parseEntry(entry) {
    const m = /^(\S+?)(?: x(\d+))?$/.exec(entry);
    return { id: m[1], count: Number(m[2] || 1) };
}

// What Hooch pays for the whole bag, unit by unit, at his disposition.
function bagSaleValue(bag, disposition) {
    return bag.reduce((sum, entry) => {
        const { id, count } = parseEntry(entry);
        const def = resolveItemDef(id);
        assert.ok(def, `${id} in the sewer haul is not an item the game knows`);
        return sum + (sellPrice(def, disposition) ?? 0) * count;
    }, 0);
}

describe('Hooch and his alcohol', () => {
    test('Hooch is the town bootlegger, with the alcohol on his shelf', () => {
        assert.ok(hooch, 'townie-hooch is on the town map');
        assert.ok(hooch.vendor && hooch.stock.includes('alcohol'));
        assert.equal(typeof hooch.disposition, 'number');
    });
});

describe('the haul out of the Sewer pays for the alcohol', () => {
    const alcohol = resolveItemDef('alcohol');
    const price = buyPrice(alcohol, hooch.disposition);

    for (const script of ['quest', 'sneak']) {
        test(`the ${script} run's bag and gold cover it at Hooch's disposition`, () => {
            const exit = golden.runs[script].sewerExit;
            assert.ok(exit, `the golden has no sewerExit for the ${script} run`);
            assert.ok(Array.isArray(exit.bag) && exit.bag.length > 0, 'the haul has a bag');
            const sales = bagSaleValue(exit.bag, hooch.disposition);
            const purse = exit.gold;
            assert.ok(sales + purse >= price,
                `${script}: the bag sells for ${sales} gp and the purse holds ${purse} gp, `
                + `${sales + purse} in all; the alcohol costs ${price} gp at Hooch's disposition ${hooch.disposition}`);
        });
    }
});
