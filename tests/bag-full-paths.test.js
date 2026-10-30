// bag-full-paths.test.js — BF1: nothing refuses an item for a full bag any more.
//
// The bag grows a page when the PACK fills (BG1), so the pickup, examine, grant,
// loot and gift paths never see a refusal. These tests fill the PACK and go
// through the real methods lifted out of main.js (it touches `document` at
// import, so, as in bag-drop.test.js, the live source is bound onto a small game).
// The two guards other tests pin on purpose (the shop's take loop, the Thieve
// lift) are checked to still be in the source.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ITEMS, unequipItem } from '../game/items.js';
import { addToInventory } from '../game/inventory.js';
import { INVENTORY_SIZE, SAFE_SLOTS, PACK_PAGE, MAX_STACK } from '../game/data.js';

const read = p => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const mainSrc = read('../game/main.js');
const itemsSrc = read('../game/items.js');
const offerSrc = read('../game/offer.js');

function liveMethod(name, params, freeVars) {
    const signature = `${name}(${params}) {`;
    const at = mainSrc.indexOf(signature);
    assert.ok(at > 0, `${name}(${params}) not found in main.js`);
    const closeAt = mainSrc.indexOf('\n    }', at);
    assert.ok(closeAt > at, `${name} body never closes`);
    const body = mainSrc.slice(at + name.length, closeAt + '\n    }'.length);
    const names = Object.keys(freeVars);
    const factory = new Function(...names, `'use strict'; return function ${body}`);
    return factory(...names.map(n => freeVars[n]));
}

const FREE = {
    audio: { playSfx() {} },
    addToInv: addToInventory, SAFE_SLOTS, MAX_STACK, PACK_PAGE,
};
const LIVE = [
    ['_addToInventory', 'itemDef'], ['_tryPickup', ''], ['_grantItem', 'id, msg'],
    ['_grantFromExaminable', 'target'], ['_takeKillLoot', 'drops, enemyObj'],
].map(([n, p]) => [n, liveMethod(n, p, FREE)]);

const fullPack = () => new Array(INVENTORY_SIZE).fill(null)
    .map(() => ({ itemDef: ITEMS.rock, count: MAX_STACK }));

function makeGame() {
    const g = {
        inventory: fullPack(), playerX: 5, playerY: 5, groundItems: [],
        _collectedItems: new Set(), _mapUrl: 'sewer-map.json',
        logs: [], events: [], bursts: [],
        _log(m) { this.logs.push(m); },
        _render() {}, _saveMoment() {},
        _resolveItemDef(id) { return ITEMS[id] || null; },
        emitGameEvent(name, data) { this.events.push([name, data.id]); },
        _startLootBurst(x, y, defs) { this.bursts.push(defs); },
        _startLootReel() {},
    };
    for (const [n, fn] of LIVE) g[n] = fn;
    return g;
}
const noRefusal = g => assert.ok(!g.logs.some(l => /bag is full|inventory full|no room/i.test(l)),
    `a refusal line: ${g.logs.join(' | ')}`);
const held = (g, id) => g.inventory.reduce((n, s) => n + (s && s.itemDef.id === id ? s.count : 0), 0);

describe('BF1 — a full PACK refuses nothing', () => {
    test('walking onto an item with a full PACK: the bag grows, no refusal line', () => {
        const g = makeGame();
        g.groundItems.push({ type: 'soap', x: 5, y: 5, def: ITEMS.soap });
        g._tryPickup();
        assert.equal(g.inventory.length, INVENTORY_SIZE + PACK_PAGE, 'the bag did not grow a page');
        assert.equal(held(g, 'soap'), 1);
        assert.deepEqual(g.groundItems, [], 'the item is still on the ground');
        assert.deepEqual(g.logs, [`[Picked up ${ITEMS.soap.name}]`]);
        noRefusal(g);
    });

    test('a pile of items under you is taken in one go', () => {
        const g = makeGame();
        for (const t of ['soap', 'bandage', 'soap']) g.groundItems.push({ type: t, x: 5, y: 5, def: ITEMS[t] });
        g._tryPickup();
        assert.deepEqual(g.groundItems, []);
        assert.equal(held(g, 'soap'), 2);
        assert.equal(held(g, 'bandage'), 1);
        noRefusal(g);
    });

    test('an examine grant lands in a full PACK and is marked taken', () => {
        const g = makeGame();
        const target = { id: 'grate', x: 2, y: 3, grants: 'soap', text: '[TEXT]' };
        assert.equal(g._grantFromExaminable(target), true);
        assert.equal(held(g, 'soap'), 1);
        assert.ok(g._collectedItems.has('sewer-map.json|2|3|soap'), 'the grant was not remembered');
        noRefusal(g);
    });

    test('a granted item lands in a full PACK and fires item_pickup', () => {
        const g = makeGame();
        assert.equal(g._grantItem('soap', '[TEXT]'), true);
        assert.equal(held(g, 'soap'), 1);
        assert.deepEqual(g.events, [['item_pickup', 'soap']]);
        noRefusal(g);
    });

    test('a granted item that does not exist still returns false and logs nothing', () => {
        const g = makeGame();
        assert.equal(g._grantItem('no_such_item', '[TEXT]'), false);
        assert.deepEqual(g.logs, []);
        assert.deepEqual(g.events, []);
        assert.equal(g.inventory.length, INVENTORY_SIZE, 'the bag grew for nothing');
    });

    test('kill loot goes into a full PACK; a drop with no def is still left behind', () => {
        const g = makeGame();
        const nameless = { def: null };
        const left = g._takeKillLoot([{ def: ITEMS.soap }, nameless], { x: 1, y: 1 });
        assert.deepEqual(left, [nameless]);
        assert.equal(held(g, 'soap'), 1);
        assert.equal(g.bursts.length, 1);
        noRefusal(g);
    });

    test('unequipping into a full PACK stows the piece', () => {
        const g = makeGame();
        g.tempEquips = [];
        g.equipment = { top: ITEMS.foil_hat };
        g._addToInventory = LIVE.find(([n]) => n === '_addToInventory')[1];
        const msg = unequipItem(g, 'top');
        assert.equal(msg, `[Unequipped ${ITEMS.foil_hat.name}]`);
        assert.equal(g.equipment.top, null);
        assert.equal(held(g, 'foil_hat'), 1);
    });
});

describe('BF1 — the dead paths are gone from the source, the pinned guards are not', () => {
    test('the offer screen has no bag-full blocker', () => {
        assert.ok(!/bagFull/.test(offerSrc), 'offer.js still reads bagFull');
        assert.ok(!/YOUR BAG IS FULL/.test(offerSrc));
    });

    test('items.js has no bag-full refusal', () => {
        assert.ok(!/bag is full/i.test(itemsSrc));
    });

    test('main.js refuses in exactly two places: the shop take loop and the Thieve lift', () => {
        const hits = mainSrc.match(/\[Your bag is full\.\]/g) || [];
        assert.equal(hits.length, 2, 'expected the two pinned guards and nothing else');
        for (const gone of ['Inventory full', 'leave it for now', 'no room for it', 'you leave it behind']) {
            assert.ok(!mainSrc.includes(gone), `main.js still says "${gone}"`);
        }
    });
});
