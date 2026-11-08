// inspector-poition-line.test.js — (FX35) the bag's stat line says what a
// poition, Soap or Alcohol does, then its description.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { itemStatLine, poitionLine } from '../game/inspector.js';
import { ITEMS } from '../game/items.js';

const all = Object.values(ITEMS);
const withPoition = all.filter(d => d.poition);
const poitionCategory = all.filter(d => d.category === 'poition');
const cures = all.filter(d => typeof d.effect === 'string' && d.effect.startsWith('cure'));

describe('every item with a poition or a cure gets a stat line', () => {
    test('the table has them to check (a check that finds nothing passes)', () => {
        assert.ok(withPoition.length >= 6, `poition items: ${withPoition.length}`);
        assert.ok(poitionCategory.length >= 6, `poition category: ${poitionCategory.length}`);
        assert.ok(cures.length >= 1, `cure items: ${cures.length}`);
    });

    for (const d of new Set([...withPoition, ...poitionCategory, ...cures, ITEMS.alcohol])) {
        test(`${d.id}: a stat line, then its description`, () => {
            const line = itemStatLine(d);
            assert.ok(d.description, `${d.id} has a description`);
            assert.ok(line.endsWith(`. ${d.description}`), `${d.id}: "${line}"`);
            const stat = line.slice(0, line.length - d.description.length - 2);
            assert.ok(stat.length > 0 && stat.length <= 40, `${d.id}: stat "${stat}" is short`);
            assert.ok(!stat.includes('undefined') && !stat.includes('NaN'), `${d.id}: "${stat}"`);
        });
    }

    for (const d of withPoition) {
        test(`${d.id}: the line carries its amount and, when it lasts, its turns`, () => {
            const line = itemStatLine(d);
            const p = d.poition;
            assert.ok(line.includes(String(Math.abs(p.amount))), `${d.id}: "${line}" names ${p.amount}`);
            if ((p.turns ?? 1) > 1) assert.ok(line.includes(`${p.turns} turns`), `${d.id}: "${line}" names ${p.turns} turns`);
            if (d.useType === 'throw') assert.ok(line.startsWith('Throw '), `${d.id}: thrown`);
        });
    }

    for (const d of cures) {
        test(`${d.id}: the line names the cure`, () => {
            assert.ok(itemStatLine(d).startsWith('Cures sludge'), itemStatLine(d));
        });
    }
});

describe('poitionLine — one mechanical line per stat', () => {
    test('instant tick stats read as a signed amount', () => {
        assert.equal(poitionLine({ stat: 'health', amount: 25, turns: 1 }), '+25 HP');
        assert.equal(poitionLine({ stat: 'mana', amount: 20, turns: 1 }), '+20 MP');
        assert.equal(poitionLine({ stat: 'gold', amount: 50, turns: 1 }), '+50 GP');
        assert.equal(poitionLine({ stat: 'gold', amount: -10 }), '-10 GP');
    });
    test('a lasting tick stat reads per turn', () => {
        assert.equal(poitionLine({ stat: 'health', amount: -3, turns: 5 }), '-3 HP/turn, 5 turns');
    });
    test('rider stats read the turns they hold', () => {
        assert.equal(poitionLine({ stat: 'strength', amount: 6, turns: 5 }), '+6 strength, 5 turns');
        assert.equal(poitionLine({ stat: 'defence', amount: 4, turns: 6 }), '+4 defence, 6 turns');
    });
    test('speed reads as the actions it buys', () => {
        assert.equal(poitionLine({ stat: 'speed', amount: 2, turns: 1 }), '2 free actions');
        assert.equal(poitionLine({ stat: 'speed', amount: -1, turns: 1 }), '1 doubled turn');
    });
    test('an unknown stat or a missing amount gives no line', () => {
        assert.equal(poitionLine({ stat: 'luck', amount: 3 }), '');
        assert.equal(poitionLine({ stat: 'health' }), '');
        assert.equal(poitionLine(null), '');
    });
});

describe('the shipped lines', () => {
    test('the six drinkable poitions', () => {
        assert.ok(itemStatLine(ITEMS.health_poition).startsWith('+25 HP. '));
        assert.ok(itemStatLine(ITEMS.mana_poition).startsWith('+20 MP. '));
        assert.ok(itemStatLine(ITEMS.gold_poition).startsWith('+50 GP. '));
        assert.ok(itemStatLine(ITEMS.strength_poition).startsWith('+6 strength, 5 turns. '));
        assert.ok(itemStatLine(ITEMS.defence_poition).startsWith('+4 defence, 6 turns. '));
        assert.ok(itemStatLine(ITEMS.speed_poition).startsWith('2 free actions. '));
    });
    test('thrown poitions, the puddle, Soap and Alcohol', () => {
        assert.ok(itemStatLine(ITEMS.sludge_sack).startsWith('Throw -3 HP/turn, 5 turns. '));
        assert.ok(itemStatLine(ITEMS.fire_blood).startsWith('Throw -5 HP/turn, 5 turns. '));
        assert.ok(itemStatLine(ITEMS.sludge_brain).startsWith('Throw sludge puddle, 8 turns. '));
        assert.ok(itemStatLine(ITEMS.soap).startsWith('Cures sludge, +2 armor for 3 turns. '));
        assert.ok(itemStatLine(ITEMS.alcohol).startsWith('Car fuel: slows the car. '));
    });
    test('other items read as before', () => {
        assert.equal(itemStatLine(ITEMS.bandage), 'Heals 25 HP');
        assert.equal(itemStatLine(ITEMS.foil_hat), '+2 armor');
        assert.equal(itemStatLine(ITEMS.boardwalk_burger), 'Heals 15 HP');
        assert.equal(itemStatLine(ITEMS.grappling_hook), 'Always kept');
        assert.equal(itemStatLine(ITEMS.rock), 'Throw 3 dmg');
    });
});
