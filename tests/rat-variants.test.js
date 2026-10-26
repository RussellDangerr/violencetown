// rat-variants.test.js — the Carnival's rats, placed by hand (plans/rv1-carnival-rats.md).
//
// Three registry entries in slots.js, each the brown rat recoloured, placed on
// carnival-map.json with the `{ id, entry, x, y }` spawn form.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ENTRIES, SLOTS, resolveSpawn, defaultPicks, labelOf } from '../game/slots.js';
import { spawnEnemy, challengeGp } from '../game/enemies.js';
import { ENEMY_SPRITES, SHEETS } from '../game/sprites.js';
import { GameMap } from '../game/map.js';
import { validateContent } from '../game/content-validate.js';
import { lintEntity, loadMapRoster } from '../tools/balance-harness.mjs';

const ROOT = new URL('../', import.meta.url);
const mapData = (file) => JSON.parse(readFileSync(new URL(`game/${file}`, ROOT), 'utf8'));

// The rulings: which rats, and what each is called on screen.
const RATS = [
    { entry: 'birthday_rat', type: 'Birthday Rat', variant: 'birthday' },
    { entry: 'sludge_rat',   type: 'Sludge Rat',   variant: 'sludge' },
    { entry: 'robot_rat',    type: 'Robot Rat',    variant: 'robot' },
];

// The recolor tool's column order, read from the tool itself so a reordered
// VARIANTS list cannot leave a rat wearing another's colours.
function variantColumns() {
    const src = readFileSync(new URL('tools/gen_recolor.py', ROOT), 'utf8');
    const block = src.match(/^VARIANTS = \[([\s\S]*?)^\]/m);
    assert.ok(block, 'no VARIANTS list in gen_recolor.py');
    return [...block[1].matchAll(/^\s*\('([a-z]+)',/gm)].map(m => m[1]);
}

const canyonRat = mapData('canyon-map.json').enemies.find(e => e.type === 'Rat');
const carnival = mapData('carnival-map.json');

describe('the Carnival rats are registry entries with canyon-rat stats', () => {
    test('the canyon rat to copy from is still there', () => {
        assert.ok(canyonRat, 'no Rat on canyon-map.json');
    });

    for (const { entry, type } of RATS) {
        test(`${entry}: named ${type}, canyon-rat stats, vermin`, () => {
            const e = ENTRIES[entry];
            assert.ok(e, `no registry entry '${entry}'`);
            assert.equal(e.type, type);
            assert.equal(e.name, type);
            for (const k of ['hp', 'armor', 'damage', 'sightRange', 'gold', 'vermin', 'sewerDweller'])
                assert.equal(e[k], canyonRat[k], `${entry}.${k} is not the canyon rat's`);
        });

        test(`${entry}: one drop, inside the vermin cap, and none of Pike's tag`, () => {
            const e = ENTRIES[entry];
            assert.equal(e.loadout.length, 1, 'one themed drop each');
            assert.ok(challengeGp(e) <= 5, `kit worth ${challengeGp(e)} GP, over the vermin cap`);
            assert.notEqual(e.tag, 'canyon_critter', 'that tag feeds Pike\'s deal');
            assert.deepEqual(lintEntity({ id: entry, ...e }), []);
        });
    }

    test('no slot pools them: they are placed by hand', () => {
        const pooled = Object.values(SLOTS).flatMap(s => s.pool.map(p => p.entry));
        for (const { entry } of RATS) assert.ok(!pooled.includes(entry), `${entry} is in a slot pool`);
    });
});

describe('each rat wears its own recolor cell', () => {
    const cols = variantColumns();

    test('the tool lists the three variants', () => {
        for (const { variant } of RATS) assert.ok(cols.includes(variant), `${variant} missing from VARIANTS`);
    });

    for (const { type, variant } of RATS) {
        test(`${type} draws the ${variant} column of ratVariants`, () => {
            const s = ENEMY_SPRITES[type];
            assert.ok(s, `no ENEMY_SPRITES['${type}']`);
            assert.equal(s.sheet, 'ratVariants');
            assert.ok(SHEETS.ratVariants, 'the sheet is not registered');
            assert.equal(s.col, cols.indexOf(variant));
            assert.equal(s.row, 0);
        });
    }

    test('no two rats share a cell, and none is the brown rat', () => {
        const keys = RATS.map(({ type }) => `${ENEMY_SPRITES[type].sheet}:${ENEMY_SPRITES[type].col},${ENEMY_SPRITES[type].row}`);
        assert.equal(new Set(keys).size, RATS.length);
        const brown = ENEMY_SPRITES.Rat;
        assert.ok(!keys.includes(`${brown.sheet}:${brown.col},${brown.row}`));
    });
});

describe('placed by hand on the Carnival', () => {
    const map = new GameMap(carnival);

    for (const { entry, type } of RATS) {
        test(`${entry} stands once, on a walkable tile of its own`, () => {
            const spawns = carnival.enemies.filter(s => s.entry === entry);
            assert.equal(spawns.length, 1, `${entry} placed ${spawns.length} times`);
            const s = spawns[0];
            assert.equal(s.type, undefined, 'the entry owns the type');
            assert.ok(map.isWalkable(s.x, s.y), `(${s.x},${s.y}) is not walkable`);
            const others = [...carnival.enemies.filter(o => o !== s), ...carnival.items, carnival.spawn, ...carnival.transitions];
            assert.ok(!others.some(o => o.x === s.x && o.y === s.y), `(${s.x},${s.y}) is taken`);

            const enemy = spawnEnemy(resolveSpawn(s, defaultPicks()));
            assert.equal(enemy.type, type);
            assert.equal(enemy.id, s.id);
            assert.deepEqual([enemy.x, enemy.y], [s.x, s.y]);
            assert.equal(enemy.entity.name, `[${type}]`);
            assert.equal(labelOf(enemy), type);
            assert.deepEqual(enemy.loadout, ENTRIES[entry].loadout);
        });
    }

    test('no other map places them', () => {
        for (const file of ['canyon-map.json', 'sewer-map.json', 'wilderness-map.json', 'town-map.json']) {
            const placed = (mapData(file).enemies || []).filter(s => RATS.some(r => r.entry === s.entry));
            assert.deepEqual(placed, [], `${file} places a Carnival rat`);
        }
    });
});

describe('resolveSpawn: the entry form', () => {
    test('the spawn keeps its own id, place and facing; the registry is untouched', () => {
        const before = JSON.stringify(ENTRIES.robot_rat);
        const r = resolveSpawn({ id: 'r9', entry: 'robot_rat', x: 3, y: 4, facing: 'left' }, null);
        assert.deepEqual([r.id, r.x, r.y, r.facing, r.type], ['r9', 3, 4, 'left', 'Robot Rat']);
        assert.equal(r.entry, undefined);
        r.loadout.push('soap');
        assert.equal(JSON.stringify(ENTRIES.robot_rat), before);
    });

    test('an unknown entry passes through untouched', () => {
        const s = { id: 'x', entry: 'no_such_rat', x: 1, y: 1 };
        assert.equal(resolveSpawn(s, null), s);
    });

    test('a slot wins over an entry', () => {
        const r = resolveSpawn({ id: 'w', slot: 'sewer.boss', entry: 'robot_rat', x: 1, y: 1 }, defaultPicks());
        assert.equal(r.type, 'Wererat');
    });
});

describe('the content check learns the entry form', () => {
    const problemsFor = (spawn) => validateContent([{ file: 'x-map.json', data: { enemies: [spawn] } }]).problems
        .filter(p => p.startsWith('x-map.json'));

    test('a real entry is clean', () => {
        assert.deepEqual(problemsFor({ id: 'a', entry: 'birthday_rat', x: 1, y: 1 }), []);
    });

    test('an unknown entry is a problem', () => {
        assert.ok(problemsFor({ id: 'a', entry: 'bithday_rat', x: 1, y: 1 }).some(p => /unknown entry 'bithday_rat'/.test(p)));
    });

    test('a spawn naming a slot and an entry is a problem', () => {
        assert.ok(problemsFor({ id: 'a', slot: 'sewer.boss', entry: 'birthday_rat', x: 1, y: 1 }).some(p => /both slot/.test(p)));
    });

    test('a spawn naming an entry and a type is a problem', () => {
        assert.ok(problemsFor({ id: 'a', entry: 'birthday_rat', type: 'Rat', x: 1, y: 1 }).some(p => /also a type/.test(p)));
    });
});

describe('the balance harness lints every rat', () => {
    test('each rat has a Carnival roster row with its stats', () => {
        const roster = loadMapRoster();
        for (const { entry, type } of RATS) {
            const id = carnival.enemies.find(s => s.entry === entry).id;
            const row = roster.find(r => r.zone === 'carnival' && r.id === id);
            assert.ok(row, `no roster row for ${id}`);
            assert.equal(row.type, type);
            assert.equal(row.vermin, true);
            assert.equal(row.hp, ENTRIES[entry].hp);
        }
    });

    test('an entry no map places and no slot pools still gets a row', () => {
        ENTRIES.__unplaced_fixture = { type: 'Rat', hp: 100, armor: -30, damage: 6, gold: 1, vermin: true };
        try {
            const row = loadMapRoster().find(r => r.id === '__unplaced_fixture');
            assert.ok(row, 'an unplaced entry escaped the harness');
            assert.equal(row.zone, 'registry');
        } finally {
            delete ENTRIES.__unplaced_fixture;
        }
        assert.ok(!loadMapRoster().some(r => r.zone === 'registry'), 'today every entry is placed or pooled');
    });
});
