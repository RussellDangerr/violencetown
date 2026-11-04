// carnival-cast.test.js — the Carnival's lion (plans/ln1-carnival-lion.md, ruling LN1R1 a).
//
// A mini-boss you always meet, placed by hand like the Carnival's rats. It is not Lire, the
// lion the Lion Whip hires. Its numbers, name, barks and tint are stand-ins; these pin the
// shape of it, not the values the owner will choose.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { GameMap } from '../game/map.js';
import { spawnEnemy, resolveEnemyTurns } from '../game/enemies.js';
import { Entity, attack } from '../game/combat.js';
import { ENTRIES, SLOTS, resolveSpawn, defaultPicks, requiredDropFor, slotIdOf, labelOf } from '../game/slots.js';
import { ENEMY_SPRITES } from '../game/sprites.js';
import { TRICKS } from '../game/tricks.js';
import { recordKill, stepRespawns, deadIds, RESPAWN_STEPS } from '../game/drops.js';
import { RNG } from '../game/rng.js';
import { validateContent } from '../game/content-validate.js';
import { lintEntity } from '../tools/balance-harness.mjs';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const GAME = new URL('../game/', import.meta.url);
const mapData = (file) => JSON.parse(readFileSync(new URL(file, GAME), 'utf8'));
const carnival = mapData('carnival-map.json');
const sewer = mapData('sewer-map.json');
const spawn = carnival.enemies.find(e => e.entry === 'carnival_lion');
const king = sewer.enemies.find(e => e.type === 'Fungus King');
const dist = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

describe('the Carnival lion: placed by hand at (20,16)', () => {
    test('one spawn names the entry, at (20,16), with no type or slot of its own', () => {
        assert.equal(carnival.enemies.filter(e => e.entry === 'carnival_lion').length, 1);
        assert.deepEqual([spawn.x, spawn.y], [20, 16]);
        assert.equal(spawn.type, undefined);
        assert.equal(spawn.slot, undefined);
    });

    test('it stands on open ground of its own, clear of every door and item', () => {
        const map = new GameMap(carnival, 'carnival-map.json');
        assert.ok(map.isWalkable(spawn.x, spawn.y));
        const others = [...carnival.enemies.filter(e => e !== spawn), ...carnival.items, carnival.spawn, ...carnival.transitions];
        assert.ok(!others.some(o => o.x === spawn.x && o.y === spawn.y), 'the tile is taken');
        for (const t of carnival.transitions) assert.ok(dist(spawn, t) >= 6, `by the door at ${t.x},${t.y}`);
        assert.ok(dist(spawn, carnival.spawn) >= 10, 'near where you arrive');
    });

    test('no slot pools it, and no other map places it', () => {
        const pooled = Object.values(SLOTS).flatMap(s => s.pool.map(p => p.entry));
        assert.ok(!pooled.includes('carnival_lion'));
        for (const file of ['canyon-map.json', 'sewer-map.json', 'graveyard-map.json', 'town-map.json']) {
            assert.deepEqual((mapData(file).enemies || []).filter(e => e.entry === 'carnival_lion'), [], file);
        }
    });

    test('the content check finds nothing wrong with it', () => {
        const problems = validateContent([{ file: 'carnival-map.json', data: carnival }]).problems
            .filter(p => p.startsWith('carnival-map.json') && /carnival-lion|carnival_lion/.test(p));
        assert.deepEqual(problems, []);
    });
});

describe('the Carnival lion: the Fungus King\'s numbers and kit, stand-in name and barks', () => {
    const e = ENTRIES.carnival_lion;

    test('hp, armour, damage, purse and kit are the Fungus King\'s', () => {
        for (const k of ['hp', 'armor', 'damage', 'gold']) assert.equal(e[k], king[k], k);
        assert.deepEqual(e.loadout, king.loadout);
        assert.deepEqual([e.armor, e.damage, e.gold], [6, 12, 20]);
    });

    test('the name and bark are obvious placeholders, and the harness lints it clean', () => {
        assert.equal(e.name, '[Lion]');
        assert.deepEqual(e.barks, ['[TEXT]']);
        assert.deepEqual(lintEntity({ id: 'carnival-lion', ...e }), []);
    });

    test('a spawned lion keeps its id, place, name and kit, and has a sight range', () => {
        const lion = spawnEnemy(resolveSpawn(spawn, defaultPicks()));
        assert.equal(lion.type, 'Carnival Lion');
        assert.equal(lion.id, 'carnival-lion');
        assert.deepEqual([lion.x, lion.y], [20, 16]);
        assert.equal(labelOf(lion), '[Lion]');
        assert.ok(lion.sightRange > 0);
        // Spawned, it dresses and carries exactly as the Fungus King does.
        const fk = spawnEnemy(king);
        assert.deepEqual(lion.loadout, fk.loadout);
        assert.deepEqual(lion.equipped, fk.equipped);
        assert.equal(lion.entity.armor, fk.entity.armor);
    });
});

describe('the Carnival lion: it hunts, hits back, and can be fought to the end', () => {
    function world(s) {
        const map = new GameMap(carnival, 'carnival-map.json');
        const lion = spawnEnemy({ ...resolveSpawn(s, defaultPicks()), facing: 'S' });
        const blows = [];
        const g = {
            map, enemies: [lion], containers: [], groundItems: [],
            playerX: s.x, playerY: s.y + 4, playerHp: 100, playerMaxHp: 100,
            turn: 0, _MOVE_MS: 150, rng: new RNG(7), gold: 0, logs: [],
            _log(m) { this.logs.push(m); },
            hasBuff: () => false,
            _spawnHitSplat() {}, _handleEnemyDeath() {}, _cascadeMark() {},
            applyDamageToPlayer(raw) { blows.push(raw); return raw; },
        };
        return { g, lion, blows };
    }

    test('seen four tiles off, it closes the gap and hits for 12', () => {
        const { g, lion, blows } = world(spawn);
        const from = dist(lion, { x: g.playerX, y: g.playerY });
        for (let t = 1; t <= 12; t++) { g.turn = t; resolveEnemyTurns(g); }
        assert.ok(dist(lion, { x: g.playerX, y: g.playerY }) < from, 'it never moved toward you');
        assert.ok(blows.length > 0, 'it never hit back');
        assert.ok(blows.every(b => b === 12), `landed ${blows}`);
    });

    test('out of sight, it does not come for you', () => {
        const { g, lion, blows } = world(spawn);
        g.playerX = 56; g.playerY = 1;
        for (let t = 1; t <= 12; t++) { g.turn = t; resolveEnemyTurns(g); }
        assert.deepEqual([lion.x, lion.y], [20, 16]);
        assert.deepEqual(blows, []);
    });

    test('it falls to blows: a fight with an end, as long as the Fungus King\'s',() => {
        const lion = spawnEnemy(resolveSpawn(spawn, defaultPicks()));
        const me = new Entity({ name: 'you', hp: 100 });
        let swings = 0, last;
        while (lion.entity.isAlive() && swings < 100) { last = attack(me, lion.entity, 20); swings++; }
        assert.equal(last.killed, true);
        const fk = spawnEnemy(king);
        let kingSwings = 0;
        while (fk.entity.isAlive() && kingSwings < 100) { attack(me, fk.entity, 20); kingSwings++; }
        assert.equal(swings, kingSwings, 'it should take as many blows as the Fungus King');
    });
});

describe('the Carnival lion gives no required item and returns like any map-placed enemy', () => {
    test('no boss flag, no tag, no slot, no required drop', () => {
        const lion = spawnEnemy(resolveSpawn(spawn, defaultPicks()));
        assert.ok(!lion.boss);
        assert.ok(!lion.tag);
        assert.ok(!lion.slot);
        assert.equal(slotIdOf(lion, carnival.enemies), null);
        assert.equal(requiredDropFor(lion, carnival.enemies), null);
    });

    test('a killed lion goes on the respawn list and comes back after the same steps as any other', () => {
        const lists = {};
        assert.ok(recordKill(lists, 'carnival-map.json', 'carnival-lion'));
        assert.ok(recordKill(lists, 'carnival-map.json', 'clown1'));
        const dead = deadIds(lists, 'carnival-map.json');
        assert.ok(dead.has('carnival-lion'));
        const map = new GameMap(carnival, 'carnival-map.json');
        assert.ok(!map.enemySpawns.filter(s => !dead.has(s.id)).some(s => s.id === 'carnival-lion'));
        const back = [];
        for (let i = 0; i < RESPAWN_STEPS; i++) back.push(...(stepRespawns(lists)['carnival-map.json'] || []));
        assert.deepEqual(back.sort(), ['carnival-lion', 'clown1']);
        assert.deepEqual(lists, {});
    });
});

describe('the Carnival lion is not Lire', () => {
    test('Lire is still the Lion Whip\'s tawny summon, in column 0', () => {
        assert.equal(TRICKS.hire_lion.summonName, 'Lire');
        assert.deepEqual(ENEMY_SPRITES.Lire, { sheet: 'beastVariants', col: 0, row: 0, static: true });
    });

    test('the lion draws its own cell of the same beast sheet, different from Lire\'s', () => {
        const s = ENEMY_SPRITES['Carnival Lion'];
        assert.ok(s, 'no ENEMY_SPRITES entry: it would draw as the fallback box');
        assert.equal(s.sheet, 'beastVariants');
        assert.notEqual(s.col, ENEMY_SPRITES.Lire.col);
        assert.notEqual(ENTRIES.carnival_lion.type, TRICKS.hire_lion.summonName);
    });
});
