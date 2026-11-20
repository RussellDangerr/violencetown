// night-seller.test.js — BP7: a Night seller in Town sells boon poitions at night, 500 GP each
// (plans/bp7-night-boon-seller.md).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ITEMS, BOON_CAP, boonCount } from '../game/items.js';
import { NIGHT_BOON_PRICE, NIGHT_SELLER_ID, stockPrice, buyPrice } from '../game/trade.js';
import { emptyOffer, offerBalance, stage } from '../game/offer.js';
import { GameMap } from '../game/map.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
const { Game } = await import('../game/main.js');
const P = Game.prototype;

const town = JSON.parse(readFileSync(new URL('../game/town-map.json', import.meta.url), 'utf8'));
const spawn = town.enemies.find(e => e.id === NIGHT_SELLER_ID);

// A game stub with the real day-clock and sync methods bound on.
function stub(extra = {}) {
    const g = {
        map: new GameMap(town), enemies: [], playerX: 1, playerY: 1, slots: {}, _respawnLists: {}, _mapUrl: 'town-map.json',
        _dayClock: 0, _nightLevel: 0, inventory: [], boons: {}, _offerNpc: null, _offer: null,
        _resolveItemDef: (id) => ITEMS[id],
        ...extra,
    };
    g._advanceDayClock = P._advanceDayClock;
    g._syncNightNpcs = P._syncNightNpcs;
    g._nightSellerCapLine = P._nightSellerCapLine;
    g._offerTheirsList = P._offerTheirsList;
    g._buybackList = () => [];
    return g;
}
const setClock = (g, n) => { g._dayClock = n; g._advanceDayClock(0); };
const NOON = 0, MIDNIGHT = 300;

describe('the spawn', () => {
    test('is a plain-named vendor of boon poitions, marked night-only', () => {
        assert.ok(spawn);
        assert.equal(spawn.name, 'Night seller');
        assert.equal(spawn.nightOnly, true);
        assert.equal(spawn.vendor, true);
        assert.deepEqual(spawn.stock, ['boon_poition']);
        for (const line of [spawn.name, ...spawn.barks]) assert.ok(!/[\[\]]/.test(line), line);
    });
    test('stands on a tile nobody else holds', () => {
        const same = town.enemies.filter(e => e.x === spawn.x && e.y === spawn.y);
        assert.equal(same.length, 1);
    });
});

describe('night and day', () => {
    test('absent at noon, present at midnight, gone again by noon', () => {
        const g = stub();
        setClock(g, NOON);
        assert.ok(!g.enemies.some(e => e.id === NIGHT_SELLER_ID));
        setClock(g, MIDNIGHT);
        const s = g.enemies.filter(e => e.id === NIGHT_SELLER_ID);
        assert.equal(s.length, 1);
        assert.equal(s[0].stock[0], 'boon_poition');
        setClock(g, MIDNIGHT + 1);
        assert.equal(g.enemies.filter(e => e.id === NIGHT_SELLER_ID).length, 1);   // not added twice
        setClock(g, NOON);
        assert.ok(!g.enemies.some(e => e.id === NIGHT_SELLER_ID));
    });
    test('stays while their trade screen is open', () => {
        const g = stub();
        setClock(g, MIDNIGHT);
        g._offerNpc = g.enemies.find(e => e.id === NIGHT_SELLER_ID);
        setClock(g, NOON);
        assert.ok(g.enemies.some(e => e.id === NIGHT_SELLER_ID));
    });
    test('is not put on top of the player', () => {
        const g = stub({ playerX: spawn.x, playerY: spawn.y });
        setClock(g, MIDNIGHT);
        assert.ok(!g.enemies.some(e => e.id === NIGHT_SELLER_ID));
    });
});

describe('the price', () => {
    test('is 500 GP, read from trade.js, and only for the boon at the Night seller', () => {
        assert.equal(NIGHT_BOON_PRICE, 500);
        assert.equal(stockPrice({ id: NIGHT_SELLER_ID }, 'boon_poition'), 500);
        assert.equal(stockPrice({ id: NIGHT_SELLER_ID }, 'bandage'), null);
        assert.equal(stockPrice({ id: 'townie-hooch' }, 'boon_poition'), null);
    });
    test('the trade row carries 500 and the offer maths charges 500 at every mood', () => {
        const g = stub();
        setClock(g, MIDNIGHT);
        const npc = g.enemies.find(e => e.id === NIGHT_SELLER_ID);
        g._offerNpc = npc;
        for (const d of [-40, 0, 30, 80]) {
            npc.disposition = d;
            const row = g._offerTheirsList()[0];
            assert.equal(row.def.id, 'boon_poition');
            assert.equal(row.price, 500);
            const o = stage(emptyOffer(), 'take', row, row.max);
            assert.equal(offerBalance(npc, o).takenValue, 500);
        }
        assert.notEqual(buyPrice(ITEMS.boon_poition, 0), 500);   // the market path would not have said 500
    });
});

describe('the cap', () => {
    const offerOf = (n) => ({ ...emptyOffer(), take: [{ def: ITEMS.boon_poition, count: n }] });
    const seller = { id: NIGHT_SELLER_ID };
    test('sells while drunk plus held plus staged stays within the cap', () => {
        const g = stub({ boons: { defence: BOON_CAP - 1 }, _offer: offerOf(1) });
        assert.equal(boonCount(g), BOON_CAP - 1);
        assert.equal(g._nightSellerCapLine(seller), null);
    });
    test('refuses at the cap, and says the counts it used', () => {
        const g = stub({ boons: { defence: BOON_CAP }, _offer: offerOf(1) });
        const line = g._nightSellerCapLine(seller);
        assert.match(line, /^No sale\./);
        assert.match(line, /drunk 12 and hold 0/);
        assert.ok(!/[\[\]]/.test(line));
        assert.ok(!/stays in your bag/.test(line));
    });
    test('boons held in the bag count too', () => {
        const g = stub({ boons: { defence: 8 }, inventory: [{ itemDef: ITEMS.boon_poition, count: 3 }], _offer: offerOf(2) });
        assert.match(g._nightSellerCapLine(seller), /drunk 8 and hold 3/);
        g._offer = offerOf(1);
        assert.equal(g._nightSellerCapLine(seller), null);
    });
    test('bought boons are ordinary boon poitions, so drinking them counts', () => {
        assert.equal(ITEMS.boon_poition.id, 'boon_poition');
        assert.ok(ITEMS.boon_poition.poition.permanent);
    });
    test('other vendors are not held to it', () => {
        const g = stub({ boons: { defence: BOON_CAP }, _offer: offerOf(1) });
        assert.equal(g._nightSellerCapLine({ id: 'townie-hooch' }), null);
    });
});
