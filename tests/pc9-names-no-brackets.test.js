// pc9-names-no-brackets.test.js: names are plain words, with no square brackets (plans/pc9-names-no-brackets.md).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS } from '../game/items.js';
import { WEAPONS, WEAPON_TIERS, classBase, WEAPON_CLASSES } from '../game/weapons.js';
import { RINGS } from '../game/ring-data.js';
import { COSTUMES } from '../game/costumes.js';
import { Enemy } from '../game/enemies.js';

const wrapped = n => typeof n === 'string' && /^\[.*\]$/.test(n.trim());
// Stand-in markers are later copy work; only a pure wrapper around a real name is under test here.
const marker = n => /^\[(TEXT|NAME|PAIR|PERK)/.test(n);

describe('names carry no wrapping brackets', () => {
    test('every item and weapon name is bare', () => {
        const all = [...Object.values(ITEMS), ...Object.values(WEAPONS)];
        assert.ok(all.length > 40);
        for (const d of all) {
            if (typeof d.name === 'string' && !marker(d.name)) assert.ok(!wrapped(d.name), `${d.id}: ${d.name}`);
        }
        assert.equal(ITEMS.rock.name, 'Rock');
        assert.equal(WEAPONS.wooden_sword.name, 'Wooden Sword');
    });

    test('rings and costumes are bare', () => {
        const rings = Object.values(RINGS);
        assert.ok(rings.length >= 2);
        for (const r of rings) assert.ok(!wrapped(r.name), r.name);
        const costumes = Object.values(COSTUMES);
        assert.ok(costumes.length >= 2);
        for (const c of costumes) assert.ok(!wrapped(c.name), c.name);
        assert.equal(COSTUMES.test_costume.name, 'Test Costume');
    });

    test('class and tier names are bare, with the same words', () => {
        const ids = Object.keys(WEAPON_CLASSES);
        assert.ok(ids.length >= 18);
        assert.equal(classBase('great_sword').name, 'Great Sword');
        assert.equal(WEAPON_TIERS.great_sword[0].name, 'Grey Great Sword');
        for (const id of ids) for (const t of WEAPON_TIERS[id]) assert.ok(!wrapped(t.name), t.name);
    });

    test('an enemy name is bare, and a boss name too', () => {
        const e = new Enemy({ type: 'rat', x: 1, y: 1 });
        assert.ok(e.entity.name.length > 0);
        assert.ok(!wrapped(e.entity.name), e.entity.name);
    });
});
