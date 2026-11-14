// masks.test.js — MS1: the Rat Mask is a hat with a body (plans/ms1-rat-mask.md).
// Worn, the player draws as the rat and may step onto grates; off, both revert. It saves.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ITEMS, ARMOR_IDS, wornBody, wornVerb, resolveUse, unequipItem } from '../game/items.js';
import { resolveItemDef } from '../game/item-registry.js';
import { ARMOR_TIERS } from '../game/weapons.js';
import { ENEMY_SPRITES, ITEM_SPRITES, SHEETS } from '../game/sprites.js';
import { serialize, migrate } from '../game/save.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const src = (f) => readFileSync(fileURLToPath(new URL(`../game/${f}`, import.meta.url)), 'utf8');
const mainSrc = src('main.js');

// The real _canEnter, lifted out of main.js.
function canEnterFn() {
    const sig = '\n    _canEnter(x, y) {';
    const at = mainSrc.indexOf(sig);
    assert.ok(at > 0, '_canEnter not found');
    const end = mainSrc.indexOf('\n    }', at + 1);
    const body = mainSrc.slice(at + 5 + '_canEnter'.length, end + '\n    }'.length);
    return new Function(`'use strict'; return function ${body}`)();
}
const canEnter = canEnterFn();

const GRATE = 4, FLOOR = 1;
function game(equipment = {}, ratFormTurns = 0) {
    return {
        equipment, _ratFormTurns: ratFormTurns,
        map: { isWalkable: (x) => x === 0, getTile: (x) => (x === 1 ? GRATE : FLOOR) },
        inventory: [], _addToInventory(d) { this.inventory.push(d); },
    };
}

describe('the Rat Mask', () => {
    test('is a head-slot armour piece with a rat body and the grates verb', () => {
        const m = ITEMS.rat_mask;
        assert.equal(m.equipSlot, 'top');
        assert.ok(ARMOR_IDS.includes('rat_mask'));
        assert.ok(ARMOR_TIERS.rat_mask && ARMOR_TIERS.rat_mask.length === 5);
        assert.ok(m.armor > 0);
        assert.equal(m.body.sprite, 'Rat');
        assert.deepEqual(m.body.verbs, ['grates']);
        assert.ok(ENEMY_SPRITES.Rat, 'the rat body exists');
        assert.ok(ITEM_SPRITES.rat_mask && SHEETS[ITEM_SPRITES.rat_mask.sheet].tint, 'bag icon is a tinted placeholder');
    });

    test('worn, the player walks grates; off, they bump', () => {
        const g = game();
        assert.equal(canEnter.call(g, 1, 0), false);
        g.equipment.top = ITEMS.rat_mask;
        assert.equal(canEnter.call(g, 1, 0), true);
        assert.equal(canEnter.call(g, 2, 0), false, 'only grates open, not every wall');
        assert.equal(canEnter.call(g, 0, 0), true);
        g.equipment.top = null;
        assert.equal(canEnter.call(g, 1, 0), false);
    });

    test('the Rat Form ring trick still opens grates without the mask', () => {
        assert.equal(canEnter.call(game({}, 3), 1, 0), true);
    });

    test('is a hat: it replaces the Foil Hat, which goes back in the bag; taking it off reverts the body', () => {
        const g = game({ top: ITEMS.foil_hat });
        resolveUse(g, ITEMS.rat_mask, null);
        assert.equal(g.equipment.top.id, 'rat_mask');
        assert.deepEqual(g.inventory.map(d => d.id), ['foil_hat']);
        assert.equal(wornBody(g.equipment).sprite, 'Rat');
        unequipItem(g, 'top');
        assert.equal(wornBody(g.equipment), null);
        assert.equal(wornVerb(g.equipment, 'grates'), false);
    });

    test('a plain hat gives no body', () => {
        assert.equal(wornBody({ top: ITEMS.foil_hat }), null);
        assert.equal(wornBody({}), null);
        assert.equal(wornBody(undefined), null);
    });

    test('wearing it survives a save and load', () => {
        const g = {
            map: { url: 'town-map.json' }, turn: 1, rng: { getState: () => 1 },
            playerX: 1, playerY: 1, playerHp: 10, playerMaxHp: 10, playerMp: 1, playerMaxMp: 1,
            facing: 'down', gold: 0, inventory: [], buffs: [], tempEquips: [],
            equipment: { weapon: null, top: ITEMS.rat_mask },
        };
        const blob = serialize(g);
        const raw = migrate(JSON.parse(JSON.stringify(blob)));
        assert.equal(raw.player.equipment.top, 'rat_mask');
        const back = resolveItemDef(raw.player.equipment.top);
        assert.equal(back.id, 'rat_mask');
        assert.equal(wornVerb({ top: back }, 'grates'), true);
    });

    test('the renderer draws the worn body in place of Night Kid, and main.js reads the verb', () => {
        const r = src('renderer.js');
        assert.match(r, /wornBody\(game\.equipment\)/);
        assert.match(r, /ENEMY_SPRITES\[maskBody\.sprite\]/);
        assert.match(mainSrc, /maskGrates/);
    });
});
