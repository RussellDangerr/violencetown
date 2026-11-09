// hl1 — Help and the first-fight hint for the numbered arc. Copy is placeholder;
// these pin WHEN the hint fires, that it shows once, and that Help has the lines.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { HINTS, nextHint } from '../game/hints.js';
import { fighters } from '../game/fight-area.js';

const hunter = () => ({
    x: 9, y: 9, entity: { isAlive: () => true }, sightRange: 6, state: 'chasing',
});

function game(enemies) {
    return { state: 'idle', playerX: 1, playerY: 1, playerHp: 100, playerMaxHp: 100,
        enemies, inventory: [], selectedSlot: -1, _hot: {}, isHidden: () => false,
        _contextualUsesFor: () => [] };
}
const none = () => false;

describe('the fight-arc hint', () => {
    test('it is a row in the hint table', () => {
        assert.ok(HINTS.some(h => h.id === 'fightArc'));
    });
    test('outside a fight it stays silent', () => {
        assert.equal(nextHint(game([]), none), null);
    });
    test('in a fight with the arc showing it fires, once', () => {
        const g = game([hunter()]);
        assert.ok(fighters(g.enemies).length > 0, 'fixture is a fight');
        assert.equal(nextHint(g, none)?.id, 'fightArc');
        const seen = new Set(['fightArc']);
        assert.equal(nextHint(g, id => seen.has(id)), null);
    });
});

describe('Help', () => {
    const html = readFileSync(fileURLToPath(new URL('../game/index.html', import.meta.url)), 'utf8');
    test('has an arc line in Combat and the 1-9 line is bag slots outside a fight', () => {
        assert.match(html, /attack arc help line/);
        assert.match(html, /bag slots outside a fight/);
    });
});
