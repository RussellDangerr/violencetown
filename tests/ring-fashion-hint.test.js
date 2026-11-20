// rf1 — the ring-fashion hint and Platero's Fire Blood gate. Pins WHEN, never the words.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { HINTS, nextHint } from '../game/hints.js';
import { getDialogue } from '../game/dialogue.js';
import { Game } from '../game/main.js';

const stack = (id) => ({ itemDef: { id }, count: 1 });
const g = (over = {}) => ({
    playerX: 5, playerY: 5, playerHp: 100, playerMaxHp: 100,
    enemies: [], inventory: [], selectedSlot: -1, _hot: {},
    isHidden: () => false, _contextualUsesFor: () => [],
    ownedRings: new Set(), ...over,
});

describe('ringFashion hint', () => {
    test('silent without the fur', () => {
        assert.equal(nextHint(g(), () => false), null);
    });
    test('fires with the fur and no ring', () => {
        const h = nextHint(g({ inventory: [stack('wererat_fur')] }), () => false);
        assert.equal(h?.id, 'ringFashion');
        assert.equal(h.text, 'Tuft of Wererat Fur can be made into a ring by Platero, the silversmith in Downtown.');
    });
    test('silent once a ring exists', () => {
        assert.equal(nextHint(g({ inventory: [stack('wererat_fur')], ownedRings: new Set(['rat_ring']) }), () => false), null);
    });
    test('fires once: skipped when already seen', () => {
        assert.equal(nextHint(g({ inventory: [stack('wererat_fur')] }), (id) => id === 'ringFashion'), null);
        assert.ok(HINTS.some(h => h.id === 'ringFashion'));
    });
});

describe('Platero choices', () => {
    const choicesFor = (inventory) => {
        const game = Object.create(Game.prototype);
        game.inventory = inventory;
        game._dialogueNpc = { dialogueId: 'platero' };
        return game._dialogueChoices().map(c => c.id);
    };
    test('no Fire Blood: the fire choice is hidden', () => {
        assert.ok(!choicesFor([]).includes('fashion_fire'));
    });
    test('with Fire Blood: the fire choice shows', () => {
        assert.ok(choicesFor([stack('fire_blood')]).includes('fashion_fire'));
    });
    test('the ring still needs 3', () => {
        assert.match(String(getDialogue('platero').choices.find(c => c.id === 'fashion_fire').onPick), /'fire_ring', 3/);
    });
});
