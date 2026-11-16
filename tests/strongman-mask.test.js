// strongman-mask.test.js — SM1 (plans/sm1-strongman-mustache.md): the power-wield mask wears
// a big-mustache body, and only while it is worn.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, wornBody } from '../game/items.js';
import { ENEMY_SPRITES } from '../game/sprites.js';

const MASK = ITEMS.strongman_mask;
const cellOf = (name) => { const c = ENEMY_SPRITES[name]; return [c.sheet, c.col, c.row]; };

describe('the strongman mask body', () => {
    test('it is the bald, mustached Tiny figure, not the knight stand-in', () => {
        assert.equal(MASK.body.species, 'strongman');
        assert.notEqual(MASK.body.sprite, 'Boss');
        assert.deepEqual(cellOf(MASK.body.sprite), ['tinyDungeon', 2, 7]);
    });

    test('it differs from the other mask body', () => {
        assert.notDeepEqual(cellOf(MASK.body.sprite), cellOf(ITEMS.rat_mask.body.sprite));
    });

    test('worn it is the body; taken off there is none', () => {
        assert.equal(wornBody({ top: MASK }), MASK.body);
        assert.equal(wornBody({ top: null }), null);
    });
});
