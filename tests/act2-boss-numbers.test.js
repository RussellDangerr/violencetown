// act2-boss-numbers.test.js — the Act 2 bosses hit for the ruled number
// (plans/ep1-act2-boss-damage.md, ruling EP1R1 a: 14, where the Were-Rat hits for 12).
//
// Every fight here is the helper's: the boss is the registry entry on its real map, your swing
// goes through the game's hit maths, and his turns are the real resolveEnemyTurns, so his kit and
// his purse run as written. A change to either shows up in the cost.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ENTRIES, FINALE_PHASE1, ACT2_BOSS_DAMAGE, SLOTS } from '../game/slots.js';
import { spawnEnemy } from '../game/enemies.js';
import {
    fightCost, armourOf,
    SEWER_ARMOUR, ACT2_ARMOUR, SEWER_WEAPON, ACT2_WEAPON,
} from './helpers/fight-cost.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const GAME = new URL('../game/', import.meta.url);
const mapData = (file) => JSON.parse(readFileSync(new URL(file, GAME), 'utf8'));

// Where each Act 2 boss stands, with the gear you would have by his zone.
const ACT2 = [
    { entry: 'bigfoot',        map: 'carnival-map.json',  slot: 'carnival.boss' },
    { entry: 'ringmaster',     map: 'carnival-map.json',  slot: 'carnival.boss' },
    { entry: 'alien_invasion', map: 'factory-map.json',   slot: 'factory.boss' },
    { entry: 'the_deity',      map: 'graveyard-map.json', slot: 'graveyard.boss' },
    { entry: 'siberia',        map: 'frozen-map.json',    slot: 'frozen.boss' },
];
const fightAct2 = (z) => fightCost({ ...z, weapon: ACT2_WEAPON, armour: ACT2_ARMOUR });
const fightWereRat = () => fightCost({
    map: 'sewer-map.json', slot: 'sewer.boss', entry: 'wererat', weapon: SEWER_WEAPON, armour: SEWER_ARMOUR,
});

describe('the ruled number', () => {
    test('the number is 14, two above the Were-Rat', () => {
        assert.equal(ACT2_BOSS_DAMAGE, 14);
        assert.equal(ENTRIES.wererat.damage, 12);
    });

    for (const z of ACT2) {
        test(`${z.entry} hits for 14 in a real fight, every blow`, () => {
            assert.equal(ENTRIES[z.entry].damage, 14);
            const r = fightAct2(z);
            assert.ok(r.blows.length > 0, 'he landed no blow, so there is nothing to check');
            assert.equal(r.bossDamage, 14);
            for (const b of r.blows) assert.equal(b.raw, 14);
            assert.ok(SLOTS[z.slot].pool.some(p => p.entry === z.entry), 'he fills his zone\'s boss slot');
        });

        test(`${z.entry} stays at 100 HP`, () => {
            assert.equal(ENTRIES[z.entry].hp, 100);
            const e = spawnEnemy({ ...ENTRIES[z.entry], id: z.entry, x: 1, y: 1 });
            assert.equal(e.entity.maxHp, 100);
            assert.equal(e.entity.hp, 100);
        });
    }

    test('only the Act 2 bosses moved: the Were-Rat, the Borgir boss and Pike keep their numbers', () => {
        const rat = fightWereRat();
        assert.ok(rat.blows.length > 0);
        for (const b of rat.blows) assert.equal(b.raw, 12);

        const borgir = mapData('borgir-map.json').enemies.find(e => e.id === 'borgir_boss');
        assert.equal(borgir.damage, 12);
        const pike = mapData('canyon-map.json').enemies.find(e => e.id === 'pike');
        assert.equal(pike.damage, 9);
    });

    test('the finale keeps its numbers: the Financier hits for 12 and Sun Man for 30', () => {
        assert.equal(ENTRIES.financier.damage, 12);
        assert.equal(spawnEnemy({ ...ENTRIES.financier, id: 'f', x: 1, y: 1 }).damage, 12);
        assert.equal(FINALE_PHASE1.sunMan.damage, 30);
        // He is the Were-Rat's block, not the Act 2 block: his stat block is the same bar the name.
        for (const k of ['hp', 'armor', 'damage', 'gold', 'loadout', 'equipped', 'boss']) {
            assert.deepEqual(ENTRIES.financier[k], ENTRIES.wererat[k], k);
        }
    });

    test('the Act 2 bosses differ from the Were-Rat in damage and nothing else that the ruling set', () => {
        for (const z of ACT2) {
            const { damage, ...rest } = ENTRIES[z.entry];
            assert.equal(damage, 14);
            assert.equal(rest.hp, ENTRIES.wererat.hp);
            assert.equal(rest.armor, ENTRIES.wererat.armor);
            assert.equal(rest.gold, ENTRIES.wererat.gold);
        }
    });
});

describe('what the first Act 2 boss costs, beside the Were-Rat', () => {
    test('the gear at each is the gear the rulings give', () => {
        // GP1R1 a: three Sewer pieces; the gloves (Downtown) and the cuirass (Puck) come after.
        assert.equal(armourOf(SEWER_ARMOUR), 5);
        assert.equal(armourOf(ACT2_ARMOUR), 10);
        // GP2R1 a: the Gator Tail and the Lion Whip both hit for 16.
        assert.equal(fightWereRat().weaponDamage, 16);
        assert.equal(fightAct2(ACT2[0]).weaponDamage, 16);
    });

    test('the cost in HP, side by side', () => {
        const rat = fightWereRat();
        const first = fightAct2(ACT2[0]);
        const row = (name, r) => `${name.padEnd(10)} weapon ${r.weaponDamage}  armour ${String(r.armour).padStart(2)}  `
            + `blow ${r.blows[0].raw} -> ${r.blows[0].dealt}  turns ${r.turns}  HP lost ${r.hpCost}`;
        console.log(`\n  ${row('Were-Rat', rat)}\n  ${row('Bigfoot', first)}`);

        for (const r of [rat, first]) {
            assert.equal(r.won, true, 'you win with the gear you would have');
            assert.equal(r.died, false);
        }
        // Pinned, so a change to the kit, the purse, the gear or the numbers moves them.
        assert.equal(rat.hpCost, 91);
        assert.equal(first.hpCost, 52);
        // 14 against 10 armour lands 4; 12 against 5 lands 7.
        assert.deepEqual([...new Set(rat.blows.map(b => b.dealt))], [7]);
        assert.deepEqual([...new Set(first.blows.map(b => b.dealt))], [4]);
    });

    // The ruling's figure: Carnival first, before the Factory's cuirass, you wear the Sewer's
    // 5 and the Latex Gloves, 6 in all. Bigfoot lands 13 blows of 8 before he falls, 104 HP.
    // The fight has no healing on your side, so at 100 HP you lose it.
    test('Carnival first (armour 6, Lion Whip): his blows add up to 104, past 100 HP, so the unhealed fight is lost', () => {
        const carnivalFirst = [...SEWER_ARMOUR, 'latex_gloves'];
        assert.equal(armourOf(carnivalFirst), 6);
        const r = fightCost({ ...ACT2[0], weapon: ACT2_WEAPON, armour: carnivalFirst });
        const sum = r.blows.reduce((s, b) => s + b.dealt, 0);
        assert.equal(r.blows.length, 13);
        assert.deepEqual([...new Set(r.blows.map(b => b.dealt))], [8], '14 against 6 armour lands 8');
        assert.equal(sum, 104, 'the ruling\'s figure');
        assert.ok(sum > 100);
        assert.equal(r.died, true, 'you are down before he is');
        assert.equal(r.won, false);
        assert.equal(r.hpCost, 100, 'the bar cannot go below 0');
    });

    test('every Act 2 boss can be beaten with that gear, and lands only the ruled 14', () => {
        const costs = ACT2.map(z => fightAct2(z));
        for (const r of costs) {
            assert.equal(r.won, true);
            assert.deepEqual([...new Set(r.blows.map(b => b.raw))], [14]);
        }
    });
});
