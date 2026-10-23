// edge-filler-order.test.js — the forest past a map's edge draws behind
// everything (ruling SF, plans/trim.md 4c). A filler tree is two tiles tall,
// so one standing on the row past the south edge used to sort after the map's
// last row and cover whoever stood there.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { actorOrder } from '../game/renderer.js';

const TILE = 32;
const at = (kind, row, extra = {}) => ({ kind, feetY: row * TILE + TILE, ...extra });

describe('actorOrder', () => {
    test('a filler tree south of the map draws before the player on the last row', () => {
        const lastRow = 29;
        const player = at('player', lastRow);
        const tree = at('prop', lastRow + 1, { filler: true });
        const drawn = [player, tree].sort(actorOrder);
        assert.equal(drawn[0], tree);
        assert.equal(drawn[1], player);
    });

    test('fillers draw before map props and enemies at any row', () => {
        const filler = at('prop', 40, { filler: true });
        const lamp = at('prop', 2);
        const enemy = at('enemy', 1);
        assert.deepEqual([lamp, filler, enemy].sort(actorOrder), [filler, enemy, lamp]);
    });

    test('fillers keep their own back-to-front order', () => {
        const north = at('prop', -1, { filler: true });
        const south = at('prop', 30, { filler: true });
        assert.deepEqual([south, north].sort(actorOrder), [north, south]);
    });

    test('everyone else still sorts by feet, and the player wins a tie', () => {
        const npc = at('enemy', 5);
        const player = at('player', 5);
        const behind = at('prop', 4);
        assert.deepEqual([player, npc, behind].sort(actorOrder), [behind, npc, player]);
    });
});
