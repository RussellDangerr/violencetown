// mk3-strongman-mask-source.test.js — MK3 (plans/mk3-strongman-mask-source.md): the Carnival's
// strongman hands over the Power-Wield Mask once, the first time he joins you.
// The real methods are lifted out of main.js (it touches `document` at import); the join is the
// real flip a gift or a talk uses (give-action.js), through a strongman spawned from the map.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnEnemy } from '../game/enemies.js';
import { resolveSpawn, defaultPicks, ENTRIES } from '../game/slots.js';
import { applyDispositionDelta } from '../game/give-action.js';
import { resolveItemDef } from '../game/item-registry.js';
import { ITEMS, holdInHands } from '../game/items.js';
import { WEAPON_TIERS, weaponClassOf } from '../game/weapons.js';
import { INVENTORY_SIZE, SAFE_SLOTS, PACK_PAGE, MAX_STACK } from '../game/data.js';
import { addToInventory as addToInv } from '../game/inventory.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const dir = fileURLToPath(new URL('../game/', import.meta.url));
const mainSrc = readFileSync(dir + 'main.js', 'utf8');
const mapJson = (f) => JSON.parse(readFileSync(dir + f, 'utf8'));

function liveMethod(name, params, free = {}) {
    const signature = `    ${name}(${params}) {`;
    const at = mainSrc.indexOf(signature, mainSrc.indexOf('class Game {'));
    assert.ok(at > 0, `${name} not found in main.js`);
    const body = mainSrc.slice(at + 4 + name.length, mainSrc.indexOf('\n    }', at) + '\n    }'.length);
    const names = Object.keys(free);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => free[n]));
}

function makeGame(bagFull = false) {
    const g = {
        inventory: new Array(INVENTORY_SIZE).fill(null), logs: [], pickups: [], renders: 0,
        _collectedItems: new Set(), enemies: [],
        _log(m, kind) { this.logs.push([m, kind]); },
        emitGameEvent(n, d) { this.pickups.push([n, d.id]); },
        _render() { if (++this.renders > 50) throw new Error('render loop'); this._syncStrongmanGift(); },   // as the real _render does
        _resolveItemDef: resolveItemDef,
    };
    const free = { addToInv, SAFE_SLOTS, PACK_PAGE, MAX_STACK, audio: { playSfx() {} } };
    g._addToInventory = liveMethod('_addToInventory', 'itemDef', free);
    g._grantItem = liveMethod('_grantItem', 'id, msg');
    g._syncStrongmanGift = liveMethod('_syncStrongmanGift', '');
    if (bagFull) for (let i = 0; i < g.inventory.length; i++) g.inventory[i] = { itemDef: ITEMS.bandage, count: 1 };
    return g;
}

function strongman() {
    const spawn = mapJson('carnival-map.json').enemies.find(e => e.id === 'strongman');
    return spawnEnemy(resolveSpawn(spawn, defaultPicks()), new Set());
}
const maskCount = (g) => g.inventory.filter(Boolean).filter(s => s.itemDef.id === 'strongman_mask').reduce((n, s) => n + s.count, 0);
const GIVEN = 'The Strongman gives you the Power-Wield Mask.';

describe('the hand-over', () => {
    test('while he is not yours, nothing is handed over', () => {
        const g = makeGame();
        g.enemies = [strongman()];
        g._syncStrongmanGift();
        assert.equal(maskCount(g), 0);
        assert.deepEqual(g.logs, []);
    });

    test('winning him over through the real flip puts one mask in the bag with one plain line', () => {
        const g = makeGame();
        const s = strongman();
        g.enemies = [s];
        applyDispositionDelta(s, 70);
        assert.equal(s._ally, true);
        g._syncStrongmanGift();
        g._syncStrongmanGift();
        assert.equal(maskCount(g), 1);
        assert.deepEqual(g.logs, [[GIVEN, 'pickup']]);
        assert.ok(!/[\[\]]/.test(GIVEN), 'no brackets');
        assert.deepEqual(g.pickups, [['item_pickup', 'strongman_mask']]);
    });

    test('only once: won back again, or a save and a reload, gives nothing more', () => {
        const g = makeGame();
        const s = strongman();
        g.enemies = [s];
        applyDispositionDelta(s, 70);
        g._syncStrongmanGift();
        s._ally = false; s.allegiance = 'hostile';   // hit, turned on you, then won back
        applyDispositionDelta(s, 100);
        g._syncStrongmanGift();
        assert.equal(maskCount(g), 1);
        // the record is a string in the saved set (save.js writes and reads collectedItems)
        const g2 = makeGame();
        g2._collectedItems = new Set(JSON.parse(JSON.stringify([...g._collectedItems])));
        const s2 = strongman();
        g2.enemies = [s2];
        applyDispositionDelta(s2, 100);
        g2._syncStrongmanGift();
        assert.equal(maskCount(g2), 0);
        assert.deepEqual(g2.logs, []);
        assert.match(readFileSync(dir + 'save.js', 'utf8'), /collectedItems: game\._collectedItems \? \[\.\.\.game\._collectedItems\]/);
    });

    test('with a full bag it is not lost: the bag grows a page', () => {
        const g = makeGame(true);
        const before = g.inventory.length;
        const s = strongman();
        g.enemies = [s];
        applyDispositionDelta(s, 70);
        g._syncStrongmanGift();
        assert.equal(maskCount(g), 1);
        assert.ok(g.inventory.length > before, 'a page was added');
        assert.deepEqual(g.logs, [[GIVEN, 'pickup']]);
    });

    test('every render runs the check', () => {
        assert.match(mainSrc, /_render\(\) \{\r?\n        this\._syncStrongmanGift\(\);/);
    });
});

describe('one source', () => {
    test('no map, shop, container, examinable, loadout or quest grant carries the mask', () => {
        for (const f of readdirSync(dir).filter(f => f.endsWith('-map.json'))) {
            const m = mapJson(f);
            assert.ok(!(m.items || []).some(i => i.type === 'strongman_mask'), f);
            assert.ok(!(m.enemies || []).some(e => (e.stock || []).includes('strongman_mask')), f);
            assert.ok(!(m.containers || []).some(c => (c.contents || []).some(x => (x.type || x) === 'strongman_mask')), f);
            assert.ok(!(m.examinables || []).some(x => x.grants === 'strongman_mask'), f);
        }
        for (const [id, e] of Object.entries(ENTRIES)) assert.ok(!(e.loadout || []).includes('strongman_mask'), id);
        assert.ok(!readFileSync(dir + 'quests.js', 'utf8').includes('strongman_mask'));
        assert.equal([...mainSrc.matchAll(/_grantItem\('strongman_mask'/g)].length, 1, 'one hand-over in main.js');
    });
});

describe('worn, each hand holds a two-hander', () => {
    const handsOf = (d) => (weaponClassOf(d) || {}).hands || 1;
    const GREAT = WEAPON_TIERS.great_sword[0];
    const AXE2 = WEAPON_TIERS.battle_axe[0];
    test('with the mask on, a two-hander in each hand stays in both', () => {
        assert.ok(handsOf(GREAT) >= 2 && handsOf(AXE2) >= 2);
        const eq = { weapon: null, left: null, top: ITEMS.strongman_mask };
        holdInHands(eq, GREAT, handsOf, 'weapon');
        const out = holdInHands(eq, AXE2, handsOf, 'left');
        assert.deepEqual(out, []);
        assert.equal(eq.weapon, GREAT);
        assert.equal(eq.left, AXE2);
    });
});
