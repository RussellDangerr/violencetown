// th1 — the Thieve hint and its Help line. Both are placeholders; these tests
// pin WHEN the hint fires and that it is shown once, never what it says.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { HINTS, nextHint } from '../game/hints.js';

const alive = () => ({ isAlive: () => true });
const at = (x, y, over = {}) => ({ x, y, entity: alive(), ...over });
function game(over = {}) {
    return {
        playerX: 5, playerY: 5, playerHp: 100, playerMaxHp: 100,
        enemies: [], inventory: [], selectedSlot: -1, _hot: {},
        isHidden: () => true, _contextualUsesFor: () => [],
        ...over,
    };
}
const none = () => false;
const afterBlind = (id) => id === 'blindSpot';

describe('the Thieve hint', () => {
    test('it sits right after the blind-spot row, which is untouched', () => {
        const ids = HINTS.map(h => h.id);
        assert.equal(ids.indexOf('thieveHere'), ids.indexOf('blindSpot') + 1);
        assert.match(HINTS[ids.indexOf('blindSpot')].text, /haven't seen you/);
    });

    test('unseen beside someone with gold: blind spot first, then Thieve', () => {
        const g = game({ enemies: [at(5, 4, { gold: 3 })] });
        assert.equal(nextHint(g, none).id, 'blindSpot');
        assert.equal(nextHint(g, afterBlind).id, 'thieveHere');
    });

    test('each branch of takeable() is enough: coin, kit, gear', () => {
        for (const over of [{ gold: 1 }, { loadout: ['x'] }, { equipped: ['y'] }]) {
            const g = game({ enemies: [at(5, 4, over)] });
            assert.equal(nextHint(g, afterBlind)?.id, 'thieveHere', JSON.stringify(over));
        }
    });

    test('beside someone with nothing to take: silence after the blind spot', () => {
        const g = game({ enemies: [at(5, 4, { gold: 0, loadout: [], equipped: [] })] });
        assert.equal(nextHint(g, afterBlind), null);
    });

    test('someone marked not thievable is not worth the line', () => {
        const g = game({ enemies: [at(5, 4, { gold: 9, thievable: false })] });
        assert.equal(nextHint(g, afterBlind), null);
    });

    test('while seen, it does not fire', () => {
        const g = game({ enemies: [at(5, 4, { gold: 9 })], isHidden: () => false });
        assert.equal(nextHint(g, none), null);
    });

    test('with someone rich two tiles off, it does not fire', () => {
        const g = game({ enemies: [at(5, 3, { gold: 9 })] });
        assert.equal(nextHint(g, none), null);
    });

    test('an ally with gold is not a mark', () => {
        const g = game({ enemies: [at(5, 4, { gold: 9, _ally: true })] });
        assert.equal(nextHint(g, none), null);
    });

    test('once seen it never fires again', () => {
        const g = game({ enemies: [at(5, 4, { gold: 9 })] });
        assert.equal(nextHint(g, (id) => ['blindSpot', 'thieveHere'].includes(id)), null);
    });

    test('a corpse with gold is not a mark', () => {
        const g = game({ enemies: [{ x: 5, y: 4, gold: 9, entity: { isAlive: () => false } }] });
        assert.equal(nextHint(g, afterBlind), null);
    });
});

describe('the Help line', () => {
    const html = readFileSync(fileURLToPath(new URL('../game/index.html', import.meta.url)), 'utf8');
    const modal = html.slice(html.indexOf('id="help-modal"'));
    const combat = modal.slice(modal.indexOf('<h3>Combat'), modal.indexOf('<h3>Inventory'));

    test('Combat & actions carries exactly one Thieve placeholder bullet', () => {
        const hits = combat.match(/<li>\[TEXT: Thieve[^<]*\]<\/li>/g) || [];
        assert.equal(hits.length, 1);
    });
});
