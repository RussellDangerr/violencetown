// act2-mob-numbers.test.js — the ordinary Act 2 enemies hit for the ruled number
// (plans/ep2-act2-mob-damage.md, ruling EP2R1 a: 12).
//
// The Clown, the Skeleton and the Greedy Green are spawns on their maps; the Alien's allies and
// the Snowman are registry entries that copy the Green and the Skeleton. Each fight below is a
// real one: the enemy is spawned the way the game spawns him, stood next to you, and his turns
// run through the real resolveEnemyTurns. Every blow he lands is recorded.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { GameMap } from '../game/map.js';
import { spawnEnemy, resolveEnemyTurns } from '../game/enemies.js';
import { ENTRIES, ACT2_MOB_DAMAGE, ACT2_BOSS_DAMAGE, FINALE_PHASE1, resolveSpawn, defaultPicks } from '../game/slots.js';
import { RNG } from '../game/rng.js';
import { makeHostile } from '../game/give-action.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const GAME = new URL('../game/', import.meta.url);
const mapData = (file) => JSON.parse(readFileSync(new URL(file, GAME), 'utf8'));
const spawnOf = (file, id) => {
    const s = mapData(file).enemies.find(e => e.id === id);
    assert.ok(s, `${id} is no longer on ${file}`);
    return s;
};

// Stand next to the enemy, turn him against you (what striking an ordinary enemy does), and
// let him take turns; return every blow he lands. The allies are born hostile; this is a no-op.
function blowsFrom(file, spawn, turns = 12, seed = 7) {
    const enemy = spawnEnemy({ ...resolveSpawn(spawn, defaultPicks()), facing: 'S' });
    makeHostile(enemy);
    const blows = [];
    const g = {
        map: new GameMap(mapData(file), file), enemies: [enemy], containers: [], groundItems: [],
        playerX: spawn.x, playerY: spawn.y + 1,
        playerHp: 100, playerMaxHp: 100,
        turn: 0, _MOVE_MS: 150, rng: new RNG(seed), gold: 0, logs: [],
        _log(m) { this.logs.push(m); },
        hasBuff: () => false,
        _spawnHitSplat() {}, _handleEnemyDeath() {}, _cascadeMark() {},
        applyDamageToPlayer(raw, attacker) {
            blows.push({ by: attacker?.name ?? attacker?.type, raw });
            return raw;
        },
    };
    for (let t = 1; t <= turns; t++) {
        g.turn = t;
        resolveEnemyTurns(g);
    }
    return { blows, enemy };
}

const ORDINARY = [
    { name: 'the Clown',    file: 'carnival-map.json',  id: 'clown1' },
    { name: 'the Skeleton', file: 'graveyard-map.json', id: 'skel1' },
    { name: 'the Green',    file: 'factory-map.json',   id: 'green1' },
];

describe('the ruled number', () => {
    test('the number is 12, and sits below the Act 2 bosses\' 14', () => {
        assert.equal(ACT2_MOB_DAMAGE, 12);
        assert.ok(ACT2_MOB_DAMAGE < ACT2_BOSS_DAMAGE);
    });

    for (const z of ORDINARY) {
        test(`${z.name} is written at 12 on his map`, () => {
            assert.equal(spawnOf(z.file, z.id).damage, 12);
        });

        test(`${z.name} hits for 12 in a real fight, every blow`, () => {
            const { blows, enemy } = blowsFrom(z.file, spawnOf(z.file, z.id));
            assert.equal(enemy.damage, 12);
            assert.ok(blows.length > 0, 'he landed no blow, so there is nothing to check');
            for (const b of blows) assert.equal(b.raw, 12);
        });
    }

    test('the Alien\'s allies hit for 12 in a real fight, every blow, as the Green does', () => {
        assert.equal(ENTRIES.alien_ally.damage, 12);
        const spawns = mapData('factory-map.json').enemies.filter(e => e.entry === 'alien_ally');
        assert.ok(spawns.length > 0);
        for (const sp of spawns) {
            const { blows } = blowsFrom('factory-map.json', sp);
            assert.ok(blows.length > 0, `${sp.id} landed no blow`);
            for (const b of blows) assert.equal(b.raw, 12);
        }
    });

    test('the Snowman matches the Skeleton, in the entry and in a real fight', () => {
        const skel = spawnOf('graveyard-map.json', 'skel1');
        assert.equal(ENTRIES.snowman.damage, skel.damage);
        // Stand him where the Skeleton stands, on the Graveyard map, to run his turns.
        const { blows } = blowsFrom('graveyard-map.json', { id: 'snowman-test', entry: 'snowman', x: skel.x, y: skel.y });
        assert.ok(blows.length > 0, 'the Snowman landed no blow');
        for (const b of blows) assert.equal(b.raw, 12);
    });

    test('the Green and the Skeleton move only in damage: hp, armour and gold stay', () => {
        const green = spawnOf('factory-map.json', 'green1');
        const skel = spawnOf('graveyard-map.json', 'skel1');
        const clown = spawnOf('carnival-map.json', 'clown1');
        assert.deepEqual([green.hp, green.armor, green.gold], [100, 3, 8]);
        assert.deepEqual([skel.hp, skel.armor, skel.gold], [100, 0, 4]);
        assert.deepEqual([clown.hp, clown.armor, clown.gold], [100, 0, 7]);
    });
});

describe('what does not change', () => {
    test('the rats, the Ruffian and the Sewer\'s enemies keep their numbers', () => {
        // Downtown's Ruffian is Act 1.
        assert.equal(spawnOf('downtown-map.json', 'dt-ruffian').damage, 9);
        // The canyon rats and the Carnival's rats (registry entries).
        assert.equal(spawnOf('canyon-map.json', 'canyon-rat-1').damage, 6);
        assert.equal(ENTRIES.birthday_rat.damage, 6);
        // The Sewer, by id.
        const sewer = Object.fromEntries(mapData('sewer-map.json').enemies.map(e => [e.id, e.damage]));
        assert.deepEqual(
            [sewer.e1, sewer.e2, sewer.e3, sewer.e4, sewer.e5, sewer.e6],
            [9, 9, 10, 10, 8, 12],
        );
        assert.equal(ENTRIES.wererat.damage, 12);
    });

    test('the frozen mobs that copy the Sewer keep theirs: the Yeti 12 and the Polar Bear 10', () => {
        assert.equal(ENTRIES.yeti.damage, 12);
        assert.equal(ENTRIES.polar_bear.damage, 10);
    });

    test('the Act 2 bosses stay at 14, the Financier at 12 and Sun Man at 30', () => {
        for (const k of ['bigfoot', 'ringmaster', 'alien_invasion', 'the_deity', 'siberia']) {
            assert.equal(ENTRIES[k].damage, 14, k);
        }
        assert.equal(ENTRIES.financier.damage, 12);
        assert.equal(FINALE_PHASE1.sunMan.damage, 30);
    });
});
