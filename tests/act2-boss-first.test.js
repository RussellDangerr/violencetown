// act2-boss-first.test.js — the Factory's boss becomes a real fight
// (plans/ab2-alien-boss-fight.md): he carries the Ray Gun and drops it, he
// fights beside a few allies he pays to keep standing, and he stands in a
// small arena of props and examinables.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { SLOTS, ENTRIES, resolveSpawn, defaultPicks } from '../game/slots.js';
import { spawnEnemy } from '../game/enemies.js';
import { tickNpcState } from '../game/npc.js';
import { bossSpend, BOSS_RALLY_RANGE } from '../game/ai.js';
import { dropLoadout } from '../game/drops.js';
import { WEAPONS } from '../game/weapons.js';
import { PROP_SPRITES } from '../game/sprites.js';
import { GameMap } from '../game/map.js';

const GAME = new URL('../game/', import.meta.url);
const data = JSON.parse(readFileSync(new URL('factory-map.json', GAME), 'utf8'));
const spawns = data.enemies;
const bossSpawn = spawns.find(e => e.slot === 'factory.boss');
const allySpawns = spawns.filter(e => e.entry === 'alien_ally');
const resolved = (sp) => resolveSpawn(sp, defaultPicks());
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

describe('the Ray Gun moves from the Factory floor to the Alien', () => {
    test('the Factory floor carries no Ray Gun', () => {
        assert.ok(WEAPONS.ray_gun, 'the Ray Gun is still a weapon');
        assert.deepEqual((data.items || []).filter(i => i.type === 'ray_gun'), []);
    });

    test('the Alien fills the Factory slot and carries it', () => {
        assert.equal(SLOTS['factory.boss'].pool[0].entry, 'alien_invasion');
        const boss = spawnEnemy(resolved(bossSpawn));
        assert.equal(boss.boss, true);
        assert.ok(boss.loadout.includes('ray_gun'));
    });

    test('beating him drops it on his tile', () => {
        const boss = spawnEnemy(resolved(bossSpawn));
        const drop = dropLoadout(boss.loadout, boss.x, boss.y).filter(d => d.type === 'ray_gun');
        assert.equal(drop.length, 1);
        assert.deepEqual([drop[0].x, drop[0].y], [bossSpawn.x, bossSpawn.y]);
        assert.equal(drop[0].def, WEAPONS.ray_gun);
    });

    test('only he gains it: the other bosses keep the placeholder kit', () => {
        assert.ok(!ENTRIES.bigfoot.loadout.includes('ray_gun'));
        assert.ok(!ENTRIES.the_deity.loadout.includes('ray_gun'));
        const { loadout: alien, ...alienRest } = ENTRIES.alien_invasion;
        const { loadout: big, ...bigRest } = ENTRIES.bigfoot;
        assert.deepEqual(alien, [...big, 'ray_gun']);
        assert.deepEqual({ ...alienRest, name: null }, { ...bigRest, name: null });
    });
});

describe('a boss with a few allies he funds', () => {
    test('three allies stand beside him, on open ground, none on another spawn', () => {
        assert.equal(allySpawns.length, 3);
        const m = new GameMap(data, 'factory-map.json');
        for (const a of allySpawns) {
            assert.ok(m.isWalkable(a.x, a.y), `${a.id} at (${a.x},${a.y}) is not walkable`);
            assert.ok(cheb(a, bossSpawn) <= BOSS_RALLY_RANGE, `${a.id} is out of his rally range`);
            assert.ok(!spawns.some(e => e !== a && e.x === a.x && e.y === a.y), `${a.id} shares a tile`);
        }
    });

    test('they are on his side, and none of them is a boss', () => {
        const boss = spawnEnemy(resolved(bossSpawn));
        for (const sp of allySpawns) {
            const a = spawnEnemy(resolved(sp));
            assert.equal(a.id, sp.id);
            assert.equal(a.allegiance, boss.allegiance);
            assert.equal(a.allegiance, 'hostile');
            assert.ok(!a.boss);
        }
        const bosses = spawns.map(resolved).filter(e => e.boss);
        assert.equal(bosses.length, 1, 'the Factory still has exactly one boss');
    });

    test('they borrow the Factory Greedy Green\'s look and numbers, and a placeholder name', () => {
        const green = spawns.find(e => e.id === 'green1');
        const a = ENTRIES.alien_ally;
        assert.equal(a.type, green.type);
        assert.equal(a.name, '[NAME]');
        for (const k of ['hp', 'armor', 'damage', 'gold']) assert.equal(a[k], green[k], k);
        assert.deepEqual(a.loadout, green.loadout);
        assert.equal(a.behavior, undefined, 'no behaviour list: born hostile, on his side');
    });

    test('with an ally hurt, his plan is to pay for the ally', () => {
        const boss = spawnEnemy(resolved(bossSpawn));
        const allies = allySpawns.map(sp => spawnEnemy(resolved(sp)));
        allies[1].entity.hp = 30;
        const plan = bossSpend(boss.entity.hp, boss.entity.maxHp, boss.gold,
            allies.map(a => ({ hp: a.entity.hp, maxHp: a.entity.maxHp })));
        assert.equal(plan.kind, 'rally');
        assert.equal(plan.index, 1);
    });

    // A stand-in game around the bay: the Factory's own walls, the player in
    // front of him so he engages.
    function bayGame(px, py) {
        const m = new GameMap(data, 'factory-map.json');
        return {
            playerX: px, playerY: py, enemies: [], containers: [], turn: 0, _MOVE_MS: 150,
            map: m,
            rng: { pick: (a) => a[0], float: () => 0.5 },
            damageTaken: 0,
            applyDamageToPlayer(d) { this.damageTaken += d; },
        };
    }

    test('in a real turn his gold goes into the hurt ally\'s health', () => {
        const g = bayGame(bossSpawn.x, bossSpawn.y + 1);
        const boss = spawnEnemy({ ...resolved(bossSpawn), facing: 'S' });
        const allies = allySpawns.map(sp => spawnEnemy(resolved(sp)));
        g.enemies.push(boss, ...allies);
        allies[0].entity.hp = 30;
        const gold = boss.gold;
        tickNpcState(g, boss, 1);
        assert.ok(allies[0].entity.hp > 30, 'the ally was paid for');
        assert.equal(gold - boss.gold, allies[0].entity.hp - 30, 'at the peg, out of his purse');
    });

    test('his kit never spends the Ray Gun, however hurt he is', () => {
        const g = bayGame(bossSpawn.x, bossSpawn.y + 1);
        const boss = spawnEnemy({ ...resolved(bossSpawn), facing: 'S' });
        g.enemies.push(boss);
        const kit = boss.loadout.length;
        for (let t = 1; t <= 12; t++) {
            boss.entity.hp = 10;
            tickNpcState(g, boss, t);
        }
        assert.ok(boss.loadout.length < kit, 'he did reach into his kit');
        assert.ok(boss.loadout.includes('ray_gun'));
    });
});

describe('a small arena of props and examinables', () => {
    const m = new GameMap(data, 'factory-map.json');
    const props = data.props || [];
    const ex = data.examinables || [];

    test('the bay has props, each drawn, each on factory floor near him', () => {
        assert.ok(props.length > 0);
        for (const p of props) {
            assert.ok(PROP_SPRITES[p.type], `${p.type} has no art`);
            assert.equal(m.getTile(p.x, p.y), 40, `${p.type} at (${p.x},${p.y}) is not on the floor`);
            assert.ok(cheb(p, bossSpawn) <= BOSS_RALLY_RANGE, `${p.type} is outside his bay`);
            assert.ok(!spawns.some(e => e.x === p.x && e.y === p.y), `${p.type} covers a spawn`);
        }
    });

    test('its examinables stand on its props, and every line is [TEXT]', () => {
        assert.ok(ex.length > 0);
        for (const e of ex) {
            assert.equal(e.text, '[TEXT]', e.id);
            assert.ok(props.some(p => p.x === e.x && p.y === e.y), `${e.id} stands on no prop`);
        }
        assert.equal(new Set(ex.map(e => e.id)).size, ex.length, 'examinable ids are unique');
    });

    test('the arena does not close the bay: he, his allies and the locker are reachable', () => {
        const key = (x, y) => `${x},${y}`;
        const seen = new Set([key(m.spawn.x, m.spawn.y)]);
        const queue = [[m.spawn.x, m.spawn.y]];
        while (queue.length) {
            const [x, y] = queue.shift();
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = x + dx, ny = y + dy;
                if (seen.has(key(nx, ny)) || !m.isWalkable(nx, ny)) continue;
                seen.add(key(nx, ny));
                queue.push([nx, ny]);
            }
        }
        const reachable = (t) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]
            .some(([dx, dy]) => seen.has(key(t.x + dx, t.y + dy)));
        for (const t of [bossSpawn, ...allySpawns, ...(data.containers || [])]) {
            assert.ok(reachable(t), `${t.id} at (${t.x},${t.y}) cannot be reached`);
        }
    });
});
