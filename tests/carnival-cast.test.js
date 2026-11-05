// carnival-cast.test.js — the Carnival's lion (plans/ln1-carnival-lion.md, ruling LN1R1 a).
//
// A mini-boss you always meet, placed by hand like the Carnival's rats. It is not Lire, the
// lion the Lion Whip hires. Its numbers, name, barks and tint are stand-ins; these pin the
// shape of it, not the values the owner will choose.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ITEMS } from '../game/items.js';
import { commitBlocker, resolveOffer } from '../game/offer.js';
import { applyGive } from '../game/give-action.js';

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
import { isCircler, CIRCLER_TAG } from '../game/ai.js';
import { FACING_VECTORS } from '../game/perception.js';

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

// ── The Clown (plans/cw1-the-clown-mini-boss.md, ruling LN1R1 a) ─────────────────────────────
// One named clown, a mini-boss you always meet, apart from the five ordinary Carnival Clowns.
// His numbers, name, barks and art are stand-ins; these pin the shape of him.

const theClown = carnival.enemies.find(e => e.entry === 'the_clown');
const clown1 = carnival.enemies.find(e => e.id === 'clown1');

describe('The Clown: placed by hand at (38,8), apart from clown1', () => {
    test('one spawn names the entry, at (38,8), with no type or slot of its own', () => {
        assert.equal(carnival.enemies.filter(e => e.entry === 'the_clown').length, 1);
        assert.deepEqual([theClown.x, theClown.y], [38, 8]);
        assert.equal(theClown.type, undefined);
        assert.equal(theClown.slot, undefined);
    });

    test('clown1 is exactly the ordinary clown it was, at (28,10)', () => {
        assert.deepEqual([clown1.x, clown1.y], [28, 10]);
        assert.equal(clown1.type, 'Carnival Clown');
        assert.equal(clown1.armor, 0);
        assert.equal(clown1.bribeable, true);
        assert.equal(carnival.enemies.filter(e => e.type === 'Carnival Clown').length, 5);
    });

    test('he stands on open ground of his own, clear of every other spawn, door and item', () => {
        const map = new GameMap(carnival, 'carnival-map.json');
        assert.ok(map.isWalkable(theClown.x, theClown.y));
        const others = [...carnival.enemies.filter(e => e !== theClown), ...carnival.items, carnival.spawn, ...carnival.transitions];
        assert.ok(!others.some(o => o.x === theClown.x && o.y === theClown.y), 'the tile is taken');
        for (const t of carnival.transitions) assert.ok(dist(theClown, t) >= 6, `by the door at ${t.x},${t.y}`);
        // Nothing stands on the tile below him to hide him from the player's side.
        const below = { x: theClown.x, y: theClown.y + 1 };
        assert.ok(map.isWalkable(below.x, below.y), 'the row below is blocked');
        assert.ok(!(map.propSpawns || []).some(p => p.x === below.x && p.y === below.y), 'a prop sits on the row below');
    });

    test('no slot pools him, and no other map places him', () => {
        assert.ok(!Object.values(SLOTS).flatMap(s => s.pool.map(p => p.entry)).includes('the_clown'));
        for (const file of ['canyon-map.json', 'sewer-map.json', 'graveyard-map.json', 'town-map.json']) {
            assert.deepEqual((mapData(file).enemies || []).filter(e => e.entry === 'the_clown'), [], file);
        }
    });

    test('the content check finds nothing wrong with him', () => {
        const problems = validateContent([{ file: 'carnival-map.json', data: carnival }]).problems
            .filter(p => p.startsWith('carnival-map.json') && /the-clown|the_clown/.test(p));
        assert.deepEqual(problems, []);
    });
});

describe('The Clown: the Fungus King\'s numbers, one sludge sack swapped for Fire Blood', () => {
    const e = ENTRIES.the_clown;

    test('hp, armour, damage and purse are the Fungus King\'s; armour 6 where the ordinary clown has 0', () => {
        for (const k of ['hp', 'armor', 'damage', 'gold']) assert.equal(e[k], king[k], k);
        assert.equal(e.armor, 6);
        assert.equal(clown1.armor, 0);
    });

    test('his kit is the King\'s with exactly one sludge sack turned into Fire Blood', () => {
        const swapped = [...king.loadout];
        swapped[swapped.indexOf('sludge_sack')] = 'fire_blood';
        assert.deepEqual([...e.loadout].sort(), [...swapped].sort());
        assert.equal(e.loadout.filter(x => x === 'fire_blood').length, 1);
        assert.equal(e.loadout.filter(x => x === 'sludge_sack').length, 1);
    });

    test('the name and bark are obvious placeholders, and the harness lints him clean', () => {
        assert.equal(e.name, '[The Clown]');
        assert.deepEqual(e.barks, ['[TEXT]']);
        assert.deepEqual(lintEntity({ id: 'the-clown', ...e }), []);
    });

    test('he draws his own cell, apart from the ordinary clown\'s', () => {
        const s = ENEMY_SPRITES['The Clown'];
        const c = ENEMY_SPRITES['Carnival Clown'];
        assert.ok(s, 'no ENEMY_SPRITES entry: he would draw as the fallback box');
        assert.notDeepEqual([s.sheet, s.col, s.row], [c.sheet, c.col, c.row]);
    });

    test('a spawned Clown keeps his id, place, name and kit; the ordinary clown is a different type', () => {
        const c = spawnEnemy(resolveSpawn(theClown, defaultPicks()));
        assert.equal(c.type, 'The Clown');
        assert.equal(c.id, 'the-clown');
        assert.deepEqual([c.x, c.y], [38, 8]);
        assert.equal(labelOf(c), '[The Clown]');
        assert.ok(c.sightRange > 0);
        assert.ok(!c.boss && !c.tag && !c.slot);
        assert.equal(requiredDropFor(c, carnival.enemies), null);
        assert.notEqual(c.type, spawnEnemy(clown1).type);
    });
});

describe('The Clown refuses a bribe; the ordinary clown still takes one', () => {
    const spawned = () => ({
        clown: spawnEnemy(resolveSpawn(theClown, defaultPicks())),
        plain: spawnEnemy(clown1),
    });
    const ctx = { playerGold: 100, npcGold: 20 };
    const goldBribe = { give: [], take: [], gold: 30 };

    test('both carry the flag the offer screen reads', () => {
        const { clown, plain } = spawned();
        assert.equal(clown.bribeable, false);
        assert.equal(plain.bribeable, true);
    });

    test('the offer screen: gold buys the ordinary clown affection and buys The Clown none', () => {
        const { clown, plain } = spawned();
        // The same two calls the offer screen makes: the blocker, then the projection.
        assert.equal(commitBlocker(plain, goldBribe, ctx), null);
        assert.ok(resolveOffer(plain, goldBribe).fromGold > 0, 'the ordinary clown took no gold');
        assert.equal(resolveOffer(clown, goldBribe).fromGold, 0, 'The Clown was bought');
        assert.equal(resolveOffer(clown, goldBribe).points, 0);
    });

    test('a hand-given item: the ordinary clown pockets it, The Clown ignores it', () => {
        const { clown, plain } = spawned();
        const ok = applyGive(ITEMS.soap, plain);
        assert.equal(ok.accepted, true);
        assert.ok(plain.disposition > -40, 'the ordinary clown did not warm');
        const before = clown.disposition;
        const no = applyGive(ITEMS.soap, clown);
        assert.equal(no.accepted, false);
        assert.equal(clown.disposition, before);
        assert.match(no.log, /ignores your offering/);
    });

    test('he cannot be flipped to an ally by any run of gifts', () => {
        const { clown } = spawned();
        const start = clown.disposition;
        for (let i = 0; i < 40; i++) applyGive(ITEMS.soap, clown);
        assert.ok(!clown._wasFlipped);
        assert.equal(clown.disposition, start);
    });
});

describe('The Clown throws his Fire Blood in a fight', () => {
    // main.js touches `document` at load, so the production _enemyThrow is lifted from its
    // source (the technique tests/offer-wiring.test.js uses) and run against a real fight turn.
    const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');
    const at = mainSrc.indexOf('_enemyThrow(npc, def) {');
    assert.ok(at > 0, '_enemyThrow not found in main.js');
    const body = mainSrc.slice(at + '_enemyThrow'.length, mainSrc.indexOf('\n    }', at) + '\n    }'.length);
    const enemyThrow = new Function(`'use strict'; return function ${body}`)();

    function fight(playerDy) {
        const map = new GameMap(carnival, 'carnival-map.json');
        const clown = spawnEnemy({ ...resolveSpawn(theClown, defaultPicks()), facing: 'S' });
        const burned = [];
        const g = {
            map, enemies: [clown], containers: [], groundItems: [],
            playerX: theClown.x, playerY: theClown.y + playerDy, playerHp: 100, playerMaxHp: 100,
            turn: 0, _MOVE_MS: 150, rng: new RNG(7), gold: 0, logs: [],
            _log(m) { this.logs.push(String(m.text ?? m)); },
            hasBuff: () => false,
            _spawnHitSplat() {}, _handleEnemyDeath() {}, _cascadeMark() {},
            applyDamageToPlayer(raw) { return raw; },
            _enemyThrow: enemyThrow,
            _applyFireBlood(who, turns) { burned.push(turns); },
        };
        return { g, clown, burned };
    }
    // main.js's world step hands every message resolveEnemyTurns returns to the log.
    const turns = (g, n) => {
        for (let t = 1; t <= n; t++) {
            g.turn = t;
            for (const m of resolveEnemyTurns(g)) g._log(m);
        }
    };

    test('seen from three tiles off, his first turn is the throw, and the log says so', () => {
        const { g, clown, burned } = fight(3);
        turns(g, 1);
        assert.equal(burned.length, 1, 'the Fire Blood never landed');
        assert.match(g.logs.join('\n'), /\[The Clown\] throws Fire Blood at you: you burn/);
        assert.ok(!clown.loadout.includes('fire_blood'), 'the throw leaves his kit');
        assert.ok(clown.loadout.includes('sludge_sack'), 'the Sludge Sack stays');
    });

    test('he throws it once, then goes back to hitting for 12', () => {
        const { g, burned } = fight(3);
        const blows = [];
        g.applyDamageToPlayer = (raw) => { blows.push(raw); return raw; };
        turns(g, 12);
        assert.equal(burned.length, 1, 'a second throw');
        assert.ok(blows.length > 0 && blows.every(b => b === 12), `landed ${blows}`);
    });
});

describe('the Carnival horses (plans/cb1-carnival-horses-circle.md): three, placed by hand around (28,4)', () => {
    const horses = carnival.enemies.filter(e => e.entry === 'carnival_horse');
    const skeleton = mapData('graveyard-map.json').enemies.find(e => e.type === 'Rattling Skeleton');

    test('three spawns name the entry, at (27,3), (29,3) and (28,5), with no type or slot of their own', () => {
        assert.deepEqual(horses.map(h => [h.x, h.y]), [[27, 3], [29, 3], [28, 5]]);
        assert.equal(new Set(horses.map(h => h.id)).size, 3);
        for (const h of horses) { assert.equal(h.type, undefined); assert.equal(h.slot, undefined); }
    });

    test('they stand on open ground of their own, around open ground at (28,4)', () => {
        const map = new GameMap(carnival, 'carnival-map.json');
        const others = [...carnival.enemies.filter(e => e.entry !== 'carnival_horse'), ...carnival.items, carnival.spawn, ...carnival.transitions];
        for (const h of horses) {
            assert.ok(map.isWalkable(h.x, h.y), `${h.id} is in a wall`);
            assert.ok(!others.some(o => o.x === h.x && o.y === h.y), `${h.id}'s tile is taken`);
            for (const t of carnival.transitions) assert.ok(dist(h, t) >= 6, `${h.id} by the door at ${t.x},${t.y}`);
        }
        for (let y = 3; y <= 5; y++) for (let x = 27; x <= 29; x++) assert.ok(map.isWalkable(x, y), `${x},${y}`);
    });

    test('they are the Rattling Skeleton\'s numbers and kit, with a placeholder name and bark', () => {
        const e = ENTRIES.carnival_horse;
        for (const k of ['hp', 'armor', 'damage', 'gold']) assert.equal(e[k], skeleton[k], k);
        assert.deepEqual(e.loadout, skeleton.loadout);
        assert.equal(e.name, '[Horse]');
        assert.deepEqual(e.barks, ['[TEXT]']);
        assert.deepEqual(lintEntity({ id: 'carnival-horse-1', ...e }), []);
    });

    test('they circle; the flag is the entry\'s tag, and no slot pools them or gives a required item', () => {
        assert.equal(ENTRIES.carnival_horse.tag, 'circler');
        const pooled = Object.values(SLOTS).flatMap(s => s.pool.map(p => p.entry));
        assert.ok(!pooled.includes('carnival_horse'));
        const e = spawnEnemy(resolveSpawn(horses[0], defaultPicks()));
        assert.equal(e.tag, 'circler');
        assert.equal(e.boss, false);
        assert.equal(requiredDropFor(e, carnival.enemies), null);
        assert.equal(e.allegiance, 'hostile');
        assert.ok(e.sightRange > 0);
    });

    test('the content check finds nothing wrong with them, and they have art', () => {
        const problems = validateContent([{ file: 'carnival-map.json', data: carnival }]).problems
            .filter(p => p.startsWith('carnival-map.json') && /carnival-horse|carnival_horse/.test(p));
        assert.deepEqual(problems, []);
        assert.ok(ENEMY_SPRITES['Carnival Horse']);
    });

    test('a killed horse goes on the respawn list and comes back like any map-placed enemy', () => {
        const lists = {};
        for (const h of horses) assert.ok(recordKill(lists, 'carnival-map.json', h.id), h.id);
        const dead = deadIds(lists, 'carnival-map.json');
        for (const h of horses) assert.ok(dead.has(h.id));
        const back = [];
        for (let i = 0; i < RESPAWN_STEPS; i++) back.push(...(stepRespawns(lists)['carnival-map.json'] || []));
        assert.deepEqual(back.sort(), horses.map(h => h.id).sort());
    });
});

describe('the Carnival dolls (plans/ec1-carnival-doll-pack.md): four, placed by hand around (10,17)', () => {
    const dolls = carnival.enemies.filter(e => e.entry === 'carnival_doll');
    const knuckles = mapData('town-map.json').enemies.find(e => e.id === 'townie-knuckles');
    const ROUND = { x: 10, y: 17 };
    // The road the loops autoplay walks in the Carnival (see act2-enemy-counts.test.js).
    const LOOPS_WALK = [{ x: 4, y: 0 }, { x: 4, y: 2 }, { x: 10, y: 5 }, { x: 11, y: 3 }];

    test('four spawns name the entry, at (9,16), (11,16), (9,18) and (11,18), with no type or slot of their own', () => {
        assert.deepEqual(dolls.map(d => [d.x, d.y]), [[9, 16], [11, 16], [9, 18], [11, 18]]);
        assert.equal(new Set(dolls.map(d => d.id)).size, 4);
        for (const d of dolls) { assert.equal(d.type, undefined); assert.equal(d.slot, undefined); }
    });

    test('they stand on open ground of their own, clear of every door, item, other fighter and the loops road', () => {
        const map = new GameMap(carnival, 'carnival-map.json');
        const rest = carnival.enemies.filter(e => e.entry !== 'carnival_doll');
        const others = [...rest, ...carnival.items, carnival.spawn, ...carnival.transitions];
        for (const d of dolls) {
            assert.ok(map.isWalkable(d.x, d.y), `${d.id} is in a wall`);
            assert.ok(!others.some(o => o.x === d.x && o.y === d.y), `${d.id}'s tile is taken`);
            for (const t of carnival.transitions) assert.ok(dist(d, t) >= 6, `${d.id} by the door at ${t.x},${t.y}`);
            for (const o of rest) assert.ok(dist(d, o) >= 2, `${d.id} is on ${o.id}`);
            for (const p of LOOPS_WALK) assert.ok(dist(d, p) >= 10, `${d.id} is within 10 of ${p.x},${p.y}`);
            // The row above is open too: nothing tall hides a doll from the player's side.
            assert.ok(!(map.propSpawns || []).some(p => p.x === d.x && p.y === d.y - 1), `a prop sits above ${d.id}`);
        }
        assert.ok(map.isWalkable(ROUND.x, ROUND.y), 'the middle is blocked');
    });

    test('they are the townie Knuckles\'s armour, damage and kit, with a placeholder name and bark', () => {
        const e = ENTRIES.carnival_doll;
        for (const k of ['armor', 'damage']) assert.equal(e[k], knuckles[k], k);
        assert.deepEqual([e.armor, e.damage], [-30, 4]);
        assert.deepEqual(e.loadout, knuckles.loadout);
        assert.equal(e.name, '[Doll]');
        assert.deepEqual(e.barks, ['[TEXT]']);
        assert.deepEqual(lintEntity({ id: 'carnival-doll-1', ...e }), []);
    });

    test('they reuse the circling that exists: the flag is the entry\'s tag, and the entry adds no field of its own', () => {
        assert.equal(CIRCLER_TAG, 'circler');
        assert.equal(ENTRIES.carnival_doll.tag, CIRCLER_TAG);
        assert.equal(ENTRIES.carnival_doll.tag, ENTRIES.carnival_horse.tag);
        const e = spawnEnemy(resolveSpawn(dolls[0], defaultPicks()));
        assert.ok(isCircler(e));
        assert.equal(e.boss, false);
        assert.equal(e.allegiance, 'hostile');
        assert.ok(e.sightRange > 0);
        const extra = Object.keys(ENTRIES.carnival_doll).filter(k => !(k in ENTRIES.carnival_horse));
        assert.deepEqual(extra, [], `the doll adds fields the horse does not have: ${extra}`);
        assert.ok(!Object.values(SLOTS).flatMap(s => s.pool.map(p => p.entry)).includes('carnival_doll'));
        assert.equal(requiredDropFor(e, carnival.enemies), null);
    });

    test('they draw a cell of their own, shared with no other type', () => {
        const s = ENEMY_SPRITES['Carnival Doll'];
        assert.ok(s, 'no ENEMY_SPRITES entry: they would draw as the fallback box');
        for (const [name, o] of Object.entries(ENEMY_SPRITES)) {
            if (name === 'Carnival Doll') continue;
            assert.ok(!(o.sheet === s.sheet && o.col === s.col && o.row === s.row), `shares a cell with ${name}`);
        }
    });

    test('the content check finds nothing wrong with them', () => {
        const problems = validateContent([{ file: 'carnival-map.json', data: carnival }]).problems
            .filter(p => p.startsWith('carnival-map.json') && /carnival-doll|carnival_doll/.test(p));
        assert.deepEqual(problems, []);
    });

    // Real enemy turns on the real map: one beat is the enemies' turn after the player's action.
    function scene(player) {
        const map = new GameMap(carnival, 'carnival-map.json');
        const blows = [];
        const g = {
            map, containers: [], groundItems: [],
            playerX: player.x, playerY: player.y, playerHp: 1e6, playerMaxHp: 1e6,
            turn: 0, _MOVE_MS: 150, rng: new RNG(11), gold: 0, logs: [],
            _log(m) { this.logs.push(m); },
            hasBuff: () => false,
            _spawnHitSplat() {}, _handleEnemyDeath() {}, _cascadeMark() {},
            applyDamageToPlayer(raw, who) { blows.push({ id: who.id, raw }); return raw; },
        };
        // Each stands facing the player, as the horses' tests have them (they see what is ahead).
        const facingToward = (from) => Object.entries(FACING_VECTORS)
            .find(([, v]) => v[0] === Math.sign(player.x - from.x) && v[1] === Math.sign(player.y - from.y))?.[0] ?? 'S';
        g.enemies = dolls.map(d => spawnEnemy({ ...resolveSpawn(d, defaultPicks()), facing: facingToward(d) }));
        g.beat = () => {
            g.turn++;
            const before = new Map(g.enemies.map(e => [e.id, `${e.x},${e.y}`]));
            const n = blows.length;
            resolveEnemyTurns(g);
            const hit = new Set(blows.slice(n).map(b => b.id));
            const out = {};
            for (const e of g.enemies) out[e.id] = hit.has(e.id) ? 'hit' : (before.get(e.id) !== `${e.x},${e.y}` ? 'step' : 'still');
            return out;
        };
        g.blows = blows;
        return g;
    }

    test('beside you, each takes turns stepping round you and hitting for 4, and never all swing together', () => {
        // The player stands in the middle of the four, on (10,17): every doll is already beside.
        const g = scene(ROUND);
        const log = [];
        for (let i = 0; i < 12; i++) {
            const acts = g.beat();
            log.push(acts);
            const tiles = g.enemies.map(e => `${e.x},${e.y}`);
            assert.equal(new Set(tiles).size, 4, `beat ${i + 1}: two on one tile ${tiles}`);
            for (const e of g.enemies) {
                assert.equal(dist(e, ROUND), 1, `${e.id} left the ring`);
                assert.ok(g.map.isWalkable(e.x, e.y), `${e.id} is in a wall`);
            }
            assert.ok(Object.values(acts).filter(a => a === 'hit').length < 4, `beat ${i + 1}: all four swung together`);
        }
        for (const d of dolls) {
            const mine = log.map(l => l[d.id]);
            assert.ok(mine.includes('step') && mine.includes('hit'), `${d.id}: ${mine}`);
        }
        assert.ok(g.blows.length >= 12);
        assert.ok(g.blows.every(b => b.raw === 4), `landed ${g.blows.map(b => b.raw)}`);
    });

    test('the same four with the flag off never step: it is the entry\'s tag that makes them circle', () => {
        const e = ENTRIES.carnival_doll;
        const saved = e.tag;
        try {
            delete e.tag;
            const g = scene(ROUND);
            for (let i = 0; i < 8; i++) {
                const acts = g.beat();
                for (const d of dolls) assert.equal(acts[d.id], 'hit', `beat ${i + 1}: ${d.id} ${acts[d.id]}`);
            }
            for (const d of dolls) {
                const now = g.enemies.find(x => x.id === d.id);
                assert.deepEqual([now.x, now.y], [d.x, d.y]);
            }
        } finally { e.tag = saved; }
    });

    test('seen from a few tiles off, they close on you, then circle', () => {
        const player = { x: 10, y: 13 };
        const g = scene(player);
        const seen = new Set();
        for (let i = 0; i < 16; i++) {
            const acts = g.beat();
            if (g.enemies.every(e => dist(e, player) <= 1)) for (const a of Object.values(acts)) seen.add(a);
        }
        assert.ok(g.enemies.some(e => dist(e, player) <= 1), 'none reached you');
        assert.ok(seen.has('step') && seen.has('hit'), `once beside you: ${[...seen]}`);
    });

    test('out of sight they do not come for you', () => {
        const g = scene({ x: 56, y: 1 });
        for (let i = 0; i < 8; i++) g.beat();
        assert.deepEqual(g.enemies.map(e => [e.x, e.y]), dolls.map(d => [d.x, d.y]));
        assert.deepEqual(g.blows, []);
    });

    test('a doll falls to blows in two hits, and each goes on the respawn list like any map-placed enemy', () => {
        const d = spawnEnemy(resolveSpawn(dolls[0], defaultPicks()));
        const me = new Entity({ name: 'you', hp: 100 });
        let swings = 0, last;
        while (d.entity.isAlive() && swings < 100) { last = attack(me, d.entity, 20); swings++; }
        assert.equal(last.killed, true);
        assert.equal(swings, 2);
        const lists = {};
        for (const x of dolls) assert.ok(recordKill(lists, 'carnival-map.json', x.id), x.id);
        const dead = deadIds(lists, 'carnival-map.json');
        assert.ok(dolls.every(x => dead.has(x.id)));
        const back = [];
        for (let i = 0; i < RESPAWN_STEPS; i++) back.push(...(stepRespawns(lists)['carnival-map.json'] || []));
        assert.deepEqual(back.sort(), dolls.map(x => x.id).sort());
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
