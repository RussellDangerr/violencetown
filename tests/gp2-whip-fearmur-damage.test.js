// gp2-whip-fearmur-damage.test.js — the Lion Whip and the Fearmur hit as ruling GP2R1 (a) says.
//
// Both hit for 16, level with the Gator Tail, and keep what sets them apart: the whip its
// reach and pull, the Fearmur its fear on a repeat hit. The Ray Gun stays the only weapon above.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS, WEAPON_CLASS_DAMAGE, WEAPON_TIERS } from '../game/weapons.js';
import { computeHit, elementalMult } from '../game/combat.js';
import { Enemy } from '../game/enemies.js';
import { SPELLS } from '../game/spells.js';
import { weaponCompare } from '../game/examine.js';

const dummy = () => new Enemy({ id: 'd1', type: 'Red Fungus', x: 3, y: 3, hp: 100, damage: 5, armor: 0,
                                allegiance: 'hostile', behavior: ['HOSTILE'] });

describe('the ruled numbers', () => {
    test('the Lion Whip and the Fearmur both hit for 16, level with the Gator Tail', () => {
        assert.equal(WEAPONS.lion_whip.damage, 16);
        assert.equal(WEAPONS.fearmur.damage, 16);
        assert.equal(WEAPONS.gator_tail.damage, 16);
    });

    test('only the Ray Gun and the Great Sword hit harder', () => {
        const above = Object.values(WEAPONS).filter(w => w.damage > WEAPONS.gator_tail.damage).map(w => w.id);
        assert.deepEqual(above, ['ray_gun', 'great_sword']);   // GW1R3: the Great Sword is 20
    });

    test('a swing takes 16 off a bare target through the real hit pipeline', () => {
        for (const id of ['lion_whip', 'fearmur']) {
            const w = WEAPONS[id];
            const foe = dummy();
            const dealt = foe.entity.takeDamage(computeHit({ base: w.damage, elemental: elementalMult(w.damageType, foe) }));
            assert.equal(dealt, 16, id);
            assert.equal(foe.entity.hp, 84, id);
        }
    });

    test("the whip's tier table copies the whip; the hammer's still copies the pipe", () => {
        assert.equal(WEAPON_CLASS_DAMAGE.whip, 16);
        assert.equal(WEAPON_CLASS_DAMAGE.hammer, 12);
        for (const t of WEAPON_TIERS.whip) assert.equal(t.damage, 16, t.id);
    });
});

describe('what each keeps', () => {
    test('the Lion Whip keeps its reach, its pull and its trick', () => {
        const w = WEAPONS.lion_whip;
        assert.equal(w.reach, 3);
        assert.equal(w.pullDistance, 1);
        assert.deepEqual(w.grantsTricks, ['hire_lion']);
    });

    test('the Fearmur keeps its fear on a repeat hit and its Boo!', () => {
        const w = WEAPONS.fearmur;
        assert.equal(w.onHit, 'fearOnRepeat');
        assert.deepEqual(w.grantsSpells, ['boo']);
    });
});

describe("the bag's compare", () => {
    test('each reads +6 over the Wooden Sword and level with the Gator Tail', () => {
        for (const id of ['lion_whip', 'fearmur']) {
            assert.equal(weaponCompare(WEAPONS[id], WEAPONS.wooden_sword).damage, '16 dmg (+6 vs Wooden Sword)', id);
            assert.equal(weaponCompare(WEAPONS[id], WEAPONS.gator_tail).damage, '16 dmg (same as Gator Tail)', id);
        }
    });
});

describe('the Sludge Bloom stays a lock', () => {
    // armor 15, hp 100, weak to fire: 16 minus 15 is still the 1-damage floor.
    const ARMOR = 15;
    test('both weapons still land the 1-damage floor on it', () => {
        for (const id of ['lion_whip', 'fearmur']) {
            const perTurn = Math.max(1, computeHit({ base: WEAPONS[id].damage }) - ARMOR);
            assert.equal(perTurn, 1, id);
        }
    });

    test('a fireball still breaks it in a handful of turns', () => {
        const perTurn = Math.max(1, computeHit({ base: SPELLS.fireball.damage, elemental: 2 }) - ARMOR);
        assert.ok(Math.ceil(100 / perTurn) <= 5);
    });
});
