// inventory-zones.test.js — the pure bag-routing module (real import, no mirror).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { addToInventory, moveToZone, zoneOf } from '../game/inventory.js';

const CFG = { size: 50, safeSlots: 10, maxStack: 99 };
const empty = () => new Array(CFG.size).fill(null);
const ROCK = { id: 'rock' };
const SOAP = { id: 'soap' };

describe('zoneOf', () => {
    test('slots below safeSlots are safe, the rest are pack', () => {
        assert.equal(zoneOf(0, 10), 'safe');
        assert.equal(zoneOf(9, 10), 'safe');
        assert.equal(zoneOf(10, 10), 'pack');
        assert.equal(zoneOf(49, 10), 'pack');
    });
});

describe('addToInventory — PACK-first routing', () => {
    test('first pickup lands in the first PACK slot, not SAFE', () => {
        const inv = empty();
        assert.equal(addToInventory(inv, ROCK, CFG), true);
        assert.equal(inv[10].itemDef, ROCK);
        assert.equal(inv[0], null);
    });
    test('merges into an existing stack in either zone before opening a new slot', () => {
        const inv = empty();
        inv[3] = { itemDef: ROCK, count: 5 };
        assert.equal(addToInventory(inv, ROCK, CFG), true);
        assert.equal(inv[3].count, 6);
        assert.equal(inv[10], null);
    });
    test('a full stack (99) opens a new PACK slot instead of overflowing', () => {
        const inv = empty();
        inv[10] = { itemDef: ROCK, count: 99 };
        assert.equal(addToInventory(inv, ROCK, CFG), true);
        assert.equal(inv[10].count, 99);
        assert.equal(inv[11].itemDef, ROCK);
    });
    test('overflows into SAFE only when PACK is full', () => {
        const inv = empty();
        for (let i = 10; i < 50; i++) inv[i] = { itemDef: SOAP, count: 99 };
        assert.equal(addToInventory(inv, ROCK, CFG), true);
        assert.equal(inv[0].itemDef, ROCK);
    });
    test('returns false when the whole bag is full', () => {
        const inv = empty();
        for (let i = 0; i < 50; i++) inv[i] = { itemDef: SOAP, count: 99 };
        assert.equal(addToInventory(inv, ROCK, CFG), false);
    });
});

describe('moveToZone — protect / unprotect', () => {
    test('protect moves a PACK stack to the first free SAFE slot', () => {
        const inv = empty();
        inv[10] = { itemDef: ROCK, count: 3 };
        assert.equal(moveToZone(inv, 10, 'safe', CFG), true);
        assert.equal(inv[0].itemDef, ROCK);
        assert.equal(inv[10], null);
    });
    test('protect fails when SAFE is full', () => {
        const inv = empty();
        for (let i = 0; i < 10; i++) inv[i] = { itemDef: SOAP, count: 1 };
        inv[10] = { itemDef: ROCK, count: 1 };
        assert.equal(moveToZone(inv, 10, 'safe', CFG), false);
        assert.equal(inv[10].itemDef, ROCK);
    });
    test('unprotect moves a SAFE stack to the first free PACK slot', () => {
        const inv = empty();
        inv[2] = { itemDef: ROCK, count: 1 };
        assert.equal(moveToZone(inv, 2, 'pack', CFG), true);
        assert.equal(inv[10].itemDef, ROCK);
        assert.equal(inv[2], null);
    });
    test('moving to the zone it is already in is a no-op success', () => {
        const inv = empty();
        inv[10] = { itemDef: ROCK, count: 1 };
        assert.equal(moveToZone(inv, 10, 'pack', CFG), true);
        assert.equal(inv[10].itemDef, ROCK);
    });
});
