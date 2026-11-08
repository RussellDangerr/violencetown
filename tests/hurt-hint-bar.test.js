// hurt-hint-bar.test.js - FX52: the "you are hurt" hint points at the bottom bar,
// so it waits until the bar has something in it (the same buildXmbBar check
// the renderer's _drawXmbBar uses).
//
// nextHint turns a throwing `when` into silence, so a typo in the check would
// quietly disable the hint. The positive cases below prove it really fires.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { HINTS, nextHint } from '../game/hints.js';
import { ITEMS } from '../game/items.js';
import { buildXmbBar } from '../game/xmb.js';

const stack = (id, count = 1) => ({ itemDef: ITEMS[id], count });
const none = () => false;

function game(over = {}) {
    return {
        playerX: 5, playerY: 5, playerHp: 30, playerMaxHp: 100,
        enemies: [], inventory: [], selectedSlot: -1, _hot: {},
        isHidden: () => false, _contextualUsesFor: () => [],
        ...over,
    };
}

// A real item the bar shows, and one it ignores, both found by the bar's own rule.
const usableId = Object.keys(ITEMS).find(id => buildXmbBar([stack(id)]).columns.length > 0);
const inertId = Object.keys(ITEMS).find(id => buildXmbBar([stack(id)]).columns.length === 0);

// Mirrors main.js _maybeShowHint: show the first unseen true hint, remember it.
function step(g, seen) {
    const h = nextHint(g, id => seen.has(id));
    if (h) seen.add(h.id);
    return h;
}

describe('the wounded hint waits for the bar', () => {
    test('the fixtures are real: a usable item and an inert one exist', () => {
        assert.ok(usableId, 'some item belongs on the bar');
        assert.ok(inertId, 'some item does not');
    });

    test('hurt with an empty bag: no hint', () => {
        assert.equal(nextHint(game(), none), null);
    });

    test('hurt carrying only things the bar ignores: no hint', () => {
        assert.equal(nextHint(game({ inventory: [stack(inertId)] }), none), null);
    });

    test('hurt with something usable: the hint fires (not silenced by a throw)', () => {
        const h = nextHint(game({ inventory: [stack(usableId)] }), none);
        assert.ok(h, 'must fire');
        assert.equal(h.id, 'wounded');
    });

    test('the wounded row answers true, with no exception, when it should', () => {
        const row = HINTS.find(x => x.id === 'wounded');
        assert.equal(row.when(game({ inventory: [stack(usableId)] })), true);
        assert.equal(row.when(game()), false);
    });

    test('healthy with something usable: no hint', () => {
        assert.equal(nextHint(game({ playerHp: 90, inventory: [stack(usableId)] }), none), null);
    });

    test('it shows only once', () => {
        const seen = new Set();
        const g = game({ inventory: [stack(usableId)] });
        assert.equal(step(g, seen)?.id, 'wounded');
        assert.equal(step(g, seen), null);
    });

    test('picking something usable up while hurt brings the hint then', () => {
        const seen = new Set();
        const g = game({ inventory: [stack(inertId)] });
        assert.equal(step(g, seen), null, 'nothing yet');
        assert.equal(seen.size, 0, 'and nothing was used up');
        g.inventory.push(stack(usableId));
        assert.equal(step(g, seen)?.id, 'wounded', 'now it comes');
        assert.equal(step(g, seen), null, 'and only once');
    });

    test('the wording is unchanged', () => {
        const row = HINTS.find(x => x.id === 'wounded');
        assert.equal(row.text,
            '[You are hurt. The bar along the bottom is live — Shift+↑↓ picks something to drink.]');
    });
});
