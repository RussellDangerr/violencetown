// ramp-route-gold.test.js — the Sewer can pay for Hooch's alcohol
// (plans/ho2-sewer-haul-record.md, rulings HOR2 and HO2R1; changed by EK1R1).
//
// The ramp route buys a bottle of alcohol from Hooch. This used to read what one
// autoplay bot carried out of the Sewer, which rested on that bot's luck and on
// what it chose to spend. EK1R1: it adds up what the Sewer's enemies and chests
// can give instead (tests/helpers/zone-haul.js says what is counted and what is
// left out), priced at Hooch's own disposition, and that has to cover the bottle.
// It still catches the alcohol drifting out of reach: a price, a drop or a purse
// that moves enough to strand the route fails here, with the working shown.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolveItemDef } from '../game/item-registry.js';
import { buyPrice } from '../game/trade.js';
import { loadMap, zoneHaul, describeHaul } from './helpers/zone-haul.js';

const hooch = loadMap('town-map.json').enemies.find((n) => n.id === 'townie-hooch');
const sewer = loadMap('sewer-map.json');

// The cache behind the Sludge Bloom needs a fire to reach (tests/puzzle-wall.test.js:
// not reachable on foot), so it is not on the plain route and is not added.
const SEWER_OPTS = { gatedChests: ['bloom-cache'] };

describe('Hooch and his alcohol', () => {
    test('Hooch is the town bootlegger, with the alcohol on his shelf', () => {
        assert.ok(hooch, 'townie-hooch is on the town map');
        assert.ok(hooch.vendor && hooch.stock.includes('alcohol'));
        assert.equal(typeof hooch.disposition, 'number');
    });
});

describe('what the Sewer can give pays for the alcohol', () => {
    const price = buyPrice(resolveItemDef('alcohol'), hooch.disposition);
    const haul = zoneHaul(sewer, hooch.disposition, SEWER_OPTS);

    test("its purses, kit and chests, sold at Hooch's disposition, cover it", () => {
        assert.ok(haul.total >= price,
            `the Sewer gives ${describeHaul(haul)}; the alcohol costs ${price} gp at Hooch's disposition ${hooch.disposition}`);
    });

    test('and it does not lean on one part alone', () => {
        // A floor that is all purses, or all one chest, guards one number. Each of
        // the three has to be real here, so a change in any of them is seen.
        assert.ok(haul.purses.total > 0, 'the Sewer has purses to take');
        assert.ok(haul.kit.total > 0, 'some kit survives a fight');
        assert.ok(haul.chests.total > 0, 'the open chest has something in it');
    });
});

describe('zoneHaul counts only what a player is sure to get', () => {
    // A small made-up zone, so the sums are checkable by hand. Prices use a
    // disposition of 0 for everyone; the expected numbers come from sellPrice.
    const gruntSpawn = (over = {}) => ({
        id: 'g', type: 'Grunt', x: 1, y: 1, hp: 100, armor: 0, damage: 5,
        gold: 7, loadout: ['rock'], ...over,
    });
    const at = 0;

    test('a grunt\'s small purse counts, once', () => {
        const h = zoneHaul({ enemies: [gruntSpawn({ loadout: [] })] }, at);
        assert.equal(h.purses.total, 7);
        assert.equal(h.purses.lines.length, 1);
    });

    test('a boss\'s purse does not (it spends it healing)', () => {
        const h = zoneHaul({ enemies: [gruntSpawn({ boss: true, gold: 44, loadout: [] })] }, at);
        assert.equal(h.purses.total, 0);
        assert.ok(h.notCounted.some((s) => /boss/.test(s)));
    });

    test('a purse big enough to buy a heal does not count', () => {
        const h = zoneHaul({ enemies: [gruntSpawn({ gold: 25, loadout: [] })] }, at);
        assert.equal(h.purses.total, 0);
    });

    test('someone who does not fight is not a kill', () => {
        const h = zoneHaul({ enemies: [gruntSpawn({ damage: 0 })] }, at);
        assert.equal(h.total, 0);
    });

    test('a heal, a Defence Poition and a worn piece add nothing; a rock does', () => {
        const plain = zoneHaul({ enemies: [gruntSpawn({ gold: 0, loadout: ['rock'] })] }, at);
        const full = zoneHaul({
            enemies: [gruntSpawn({ gold: 0, loadout: ['rock', 'bandage', 'defence_poition', 'foil_hat'] })],
        }, at);
        assert.ok(plain.kit.total > 0, 'a rock is sold');
        assert.equal(full.kit.total, plain.kit.total, 'the rest can be used up or is worn');
    });

    test('a chest counts once, and a gated one is listed, not added', () => {
        const map = { enemies: [], containers: [
            { id: 'open', contents: ['bandage'] },
            { id: 'locked', contents: ['bandage', 'bandage'] },
        ] };
        const all = zoneHaul(map, at);
        const gated = zoneHaul(map, at, { gatedChests: ['locked'] });
        assert.equal(all.chests.lines.length, 2);
        assert.equal(gated.chests.lines.length, 1);
        assert.ok(gated.total < all.total);
        assert.ok(gated.notCounted.some((s) => /locked/.test(s)));
    });
});
