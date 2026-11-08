// ant-swarm.test.js — carry sweet food and an ant swarm comes for it
// (plans/an2-ant-swarm-sweet-food.md). The rules are ants.js's swarm section;
// the last block lifts main.js's glue onto a stand-in game on the real diner.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as A from '../game/ants.js';
import { RNG } from '../game/rng.js';
import { TILES } from '../game/data.js';
import { ITEMS } from '../game/items.js';
import { GameMap } from '../game/map.js';
import { Enemy, resolveEnemyTurns } from '../game/enemies.js';
import { stepEntity } from '../game/pathing.js';

// A grid from strings: '#' wall, '~' cold, anything else floor.
function gridOf(rows) {
    return {
        width: rows[0].length, height: rows.length,
        isWalkable: (x, y) => rows[y][x] !== '#',
        isCold: (x, y) => rows[y][x] === '~',
    };
}

// A plain-object world: ants are { x, y }, the player can be moved and bitten.
function harness(rows, player, { sweet = true, entries = [] } = {}) {
    const grid = gridOf(rows);
    const h = {
        grid, ants: [], bites: 0, spawned: [], removed: [], swarm: null,
        player: { ...player }, sweet, entries,
    };
    h.env = () => ({
        grid, player: h.player, sweet: h.sweet, entries: h.entries,
        isFree: (x, y) => !(x === h.player.x && y === h.player.y) && !h.ants.some(a => a.x === x && a.y === y),
        spawn: (x, y) => { const a = { x, y }; h.ants.push(a); h.spawned.push({ x, y }); return a; },
        move: (a, x, y) => { a.x = x; a.y = y; },
        bite: () => { h.bites++; },
        remove: (a) => { h.ants = h.ants.filter(b => b !== a); h.removed.push(a); },
    });
    h.turn = (rng) => {
        const r = A.swarmTurn(h.swarm, [...h.ants], h.env(), rng);
        h.swarm = r.swarm;
        return r.results;
    };
    return h;
}

// An open field, walled on two sides so the edge the ants use is the west one.
const FIELD = [
    '####################',
    '...................#',
    '...................#',
    '...................#',
    '...................#',
    '...................#',
    '...................#',
    '####################',
];
const P = { x: 14, y: 4 };

const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const run = (h, rng, n, each = () => {}) => { for (let i = 0; i < n; i++) { h.turn(rng); each(i); } };

describe('sweet food and cold tiles', () => {
    test('the ice cone is the one sweet food, wherever it sits in the bag', () => {
        assert.ok(ITEMS.tigers_blood_ice_cone, 'the cone exists');
        assert.deepEqual([...A.SWEET_FOODS], ['tigers_blood_ice_cone']);
        assert.equal(A.carriesSweet([null, { itemDef: ITEMS.tigers_blood_ice_cone, count: 1 }]), true);
        assert.equal(A.carriesSweet([{ itemDef: ITEMS.rock, count: 1 }, null]), false);
        assert.equal(A.carriesSweet([]), false);
        assert.equal(A.carriesSweet(undefined), false);
    });

    test('cold tiles are exactly the frozen tiles in data.js', () => {
        const cold = Object.entries(TILES).filter(([, d]) => A.isColdTile(d.id)).map(([k]) => k).sort();
        assert.deepEqual(cold, ['ICE', 'SNOW']);
        assert.equal(A.isColdTile(undefined), false);
    });

    test('the ant: 1 HP, a 1-damage bite (ANR3)', () => {
        assert.equal(A.ANT_HP, 1);
        assert.equal(A.ANT_BITE, 1);
    });
});

describe('where ants come from', () => {
    test('entries are the open edge tiles plus the doors, never a wall or a cold tile', () => {
        const rows = [
            '#..~#',
            '#...#',
            '#####',
        ];
        const e = A.entryTiles(gridOf(rows), [{ x: 2, y: 1 }, { x: 0, y: 0 }]);
        assert.deepEqual(e, [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }]);
    });

    test('the nest is the entry the player reaches in the fewest steps', () => {
        const rows = [
            '##########',
            '.....#...#',
            '.....#...#',
            '####...###',
            '#........#',
            '########.#',
        ];
        const g = gridOf(rows);
        // The west edge is nearer as the crow flies; the south gap is fewer steps.
        assert.deepEqual(A.pickNest(g, A.entryTiles(g), { x: 7, y: 2 }), { x: 8, y: 5 });
        assert.deepEqual(A.pickNest(g, A.entryTiles(g), { x: 1, y: 2 }), { x: 0, y: 1 });
    });

    test('no reachable entry, no nest', () => {
        const g = gridOf(['#####', '#...#', '#####']);
        assert.equal(A.pickNest(g, A.entryTiles(g), { x: 2, y: 1 }), null);
    });
});

describe('a swarm comes for sweet food', () => {
    test('carrying it in a warm zone brings ants in from the edge, and they bite and latch', () => {
        const h = harness(FIELD, P);
        const rng = new RNG(7);
        let latchedAt = -1;
        run(h, rng, 80, (i) => { if (latchedAt < 0 && h.ants.some(a => a._latched)) latchedAt = i; });
        assert.ok(h.spawned.length >= A.SWARM_SIZE, `only ${h.spawned.length} ants came`);
        for (const s of h.spawned) assert.equal(s.x, 0, `an ant walked in at ${s.x},${s.y}, not the edge`);
        assert.ok(latchedAt >= 0, 'no ant reached the player');
        assert.ok(h.bites > 0);
    });

    test('ants walk in one a turn, and only as many as the swarm sends', () => {
        const h = harness(FIELD, P);
        const rng = new RNG(3);
        const counts = [];
        run(h, rng, 6, () => counts.push(h.spawned.length));
        assert.deepEqual(counts.slice(0, A.SWARM_SIZE), Array.from({ length: A.SWARM_SIZE }, (_, i) => i + 1));
        assert.equal(h.spawned.length, A.SWARM_SIZE);
    });

    test('the scout trail runs from the player to the nest, strongest by the player', () => {
        const h = harness(FIELD, P);
        h.turn(new RNG(1));
        const f = h.swarm.world.field, nest = h.swarm.world.nest;
        assert.equal(nest.x, 0);
        const byPlayer = A.trailAt(f, P.x - 1, P.y) + A.trailAt(f, P.x - 1, P.y - 1) + A.trailAt(f, P.x - 1, P.y + 1);
        assert.ok(byPlayer > 0, 'no trail beside the player');
        assert.ok(A.trailAt(f, P.x, P.y) > A.trailAt(f, nest.x, nest.y), 'the trail is not strongest by the food');
        // A connected run of trail from the nest's side to the player's.
        let lit = 0;
        for (let x = 1; x < P.x; x++) if ([1, 2, 3, 4, 5, 6].some(y => A.trailAt(f, x, y) > 0)) lit++;
        assert.equal(lit, P.x - 1, 'gaps in the scout trail');
    });

    test('with no sweet food and no ants nothing happens, and no RNG is drawn', () => {
        const h = harness(FIELD, P, { sweet: false });
        let draws = 0;
        const rng = { float: () => { draws++; return 0.5; }, int: () => { draws++; return 0; }, range: (a) => { draws++; return a; } };
        for (let i = 0; i < 10; i++) assert.deepEqual(h.turn(rng), []);
        assert.equal(draws, 0);
        assert.equal(h.ants.length, 0);
        assert.equal(h.swarm, null);
    });

    test('putting it away ends the swarm: ants let go, walk out at the nest and leave the map', () => {
        const h = harness(FIELD, P);
        const rng = new RNG(11);
        run(h, rng, 80);
        assert.ok(h.ants.some(a => a._latched), 'set-up: an ant is latched');
        const bitesBefore = h.bites;
        h.sweet = false;
        run(h, rng, 60);
        assert.equal(h.bites, bitesBefore, 'an ant bit after the food was put away');
        assert.equal(h.ants.length, 0, `${h.ants.length} ants never left`);
        for (const a of h.removed) assert.equal(a.x, 0, 'an ant left somewhere other than the nest');
    });

    test('the same seed replays the same swarm; another seed differs', () => {
        const trace = (seed) => {
            const h = harness(FIELD, P);
            const rng = new RNG(seed), out = [];
            run(h, rng, 40, () => out.push(h.ants.map(a => `${a.x},${a.y}`).join(' ')));
            return out.join('|');
        };
        assert.equal(trace(5), trace(5));
        assert.notEqual(trace(5), trace(6));
    });
});

describe('latch and brush off', () => {
    // One ant already next to the player, its swarm on.
    function latchedOne() {
        const h = harness(FIELD, P);
        const rng = new RNG(2);
        h.swarm = A.createSwarm(h.grid, { x: 0, y: 4 });
        h.swarm.active = true;
        h.ants.push({ x: P.x - 1, y: P.y });
        return { h, rng };
    }

    test('an ant beside the player bites for 1 and latches; it bites every turn after', () => {
        const { h, rng } = latchedOne();
        assert.deepEqual(h.turn(rng), ['latch']);
        assert.equal(h.ants[0]._latched, true);
        for (let i = 0; i < 4; i++) assert.deepEqual(h.turn(rng).slice(0, 1), ['bite']);
        assert.equal(h.bites, 5);
    });

    test('a latched ant comes along when the player moves', () => {
        const { h, rng } = latchedOne();
        h.turn(rng);
        for (const step of [{ x: 1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: -1, y: 1 }]) {
            h.player.x += step.x; h.player.y += step.y;
            h.turn(rng);
            assert.equal(cheb(h.ants[0], h.player), 1, 'the ant fell behind');
            assert.equal(h.ants[0]._latched, true);
        }
        assert.equal(h.bites, 5);
    });

    test('brushing it off takes it off: it lands two tiles away and lies there for that turn', () => {
        const { h, rng } = latchedOne();
        h.turn(rng);
        const brushed = A.brushOff(h.ants, h.env());
        assert.equal(brushed.length, 1);
        const a = h.ants[0];
        assert.equal(a._latched, false);
        assert.equal(cheb(a, h.player), A.BRUSH_LANDING);
        const landed = { x: P.x - A.BRUSH_LANDING, y: P.y };
        assert.deepEqual({ x: a.x, y: a.y }, landed, 'it lands on its own side');
        const before = h.bites;
        assert.deepEqual(h.turn(rng), ['dazed']);
        assert.equal(h.bites, before, 'it bit on the turn it was brushed off');
        assert.deepEqual({ x: a.x, y: a.y }, landed, 'it moved on the turn it was brushed off');
        // After that it is an ordinary ant again, and comes back for the food.
        let back = false;
        for (let i = 0; i < 10 && !back; i++) back = h.turn(rng).includes('latch');
        assert.ok(back, 'it never came back');
    });

    test('brushing with nothing latched brushes nothing', () => {
        const { h } = latchedOne();
        assert.deepEqual(A.brushOff(h.ants, h.env()), []);
        assert.equal(h.ants[0]._brushed, undefined);
    });
});

describe('squash and reinforcements', () => {
    test('a squash leaves alarm, and ants in range head for it', () => {
        const h = harness(FIELD, { x: 18, y: 1 }, { sweet: true });
        h.swarm = A.createSwarm(h.grid, { x: 0, y: 4 });
        h.swarm.active = true;
        h.swarm.toCome = 0;
        h.ants.push({ x: 6, y: 2 }, { x: 6, y: 6 }, { x: 4, y: 4 });
        const at = { x: 6, y: 4 };
        const rng = new RNG(4);
        A.squashAnt(h.swarm, at.x, at.y, { float: () => 0.99, range: (a) => a });
        assert.ok(A.alarmAt(h.swarm.world.field, at.x, at.y) > 0);
        const before = h.ants.map(a => cheb(a, at));
        const results = h.turn(rng);
        assert.deepEqual(results, ['alarm', 'alarm', 'alarm']);
        const after = h.ants.map(a => cheb(a, at));
        after.forEach((d, i) => assert.ok(d < before[i], `ant ${i} did not close in`));
    });

    test('a squash sometimes sends one or two more, and they walk in from the edge', () => {
        const h = harness(FIELD, P);
        h.swarm = A.createSwarm(h.grid, { x: 0, y: 4 });
        h.swarm.active = true;
        assert.equal(A.squashAnt(h.swarm, 5, 4, { float: () => A.REINFORCE_CHANCE, range: (a) => a }), 0, 'a miss sends none');
        const n = A.squashAnt(h.swarm, 5, 4, { float: () => 0, range: (a, b) => b });
        assert.equal(n, A.RECRUITS_MAX);
        assert.equal(h.swarm.toCome, A.RECRUITS_MAX);
        const rng = new RNG(9);
        run(h, rng, 3);
        assert.equal(h.spawned.length, A.RECRUITS_MAX);
        for (const s of h.spawned) assert.equal(s.x, 0);
        assert.equal(h.swarm.toCome, 0);
    });

    test('with the swarm off a squash sends nobody', () => {
        const h = harness(FIELD, P);
        h.swarm = A.createSwarm(h.grid, { x: 0, y: 4 });
        assert.equal(A.squashAnt(h.swarm, 5, 4, { float: () => 0, range: (a) => a }), 0);
        assert.equal(A.squashAnt(null, 5, 4, { float: () => 0, range: (a) => a }), 0);
    });
});

describe('the cold is safe', () => {
    // A warm strip on the west, cold everywhere else.
    const COLD = [
        '####################',
        '.....~~~~~~~~~~~~~~#',
        '.....~~~~~~~~~~~~~~#',
        '.....~~~~~~~~~~~~~~#',
        '.....~~~~~~~~~~~~~~#',
        '####################',
    ];

    test('no swarm starts while the player stands on a cold tile', () => {
        const h = harness(COLD, { x: 10, y: 2 });
        run(h, new RNG(1), 30);
        assert.equal(h.spawned.length, 0);
    });

    test('no ant ever stands on a cold tile, even with the food just past it', () => {
        const h = harness(COLD, { x: 6, y: 2 });   // on the first cold column: no swarm
        const rng = new RNG(8);
        h.player = { x: 4, y: 2 };                // warm: a swarm starts
        run(h, rng, 20);
        assert.ok(h.spawned.length > 0, 'set-up: ants came');
        h.player.x = 9;                          // into the cold
        run(h, rng, 60, () => {
            for (const a of h.ants) assert.ok(!h.grid.isCold(a.x, a.y), `an ant on cold at ${a.x},${a.y}`);
        });
        assert.equal(h.ants.length, 0, 'the swarm did not end in the cold');
    });

    test('a latched ant lets go rather than follow onto cold', () => {
        const h = harness(COLD, { x: 4, y: 2 });
        h.swarm = A.createSwarm(h.grid, { x: 0, y: 2 });
        h.swarm.active = true;
        h.ants.push({ x: 3, y: 2 });
        const rng = new RNG(1);
        h.turn(rng);
        assert.equal(h.ants[0]._latched, true);
        h.player.x = 6;
        h.turn(rng);
        assert.equal(h.ants[0]._latched, false);
        assert.ok(!h.grid.isCold(h.ants[0].x, h.ants[0].y));
    });
});

describe('ants in the game', () => {
    test('an ant keeps its kind across a save', () => {
        const a = new Enemy({ id: 'ant_1', type: A.ANT_TYPE, x: 2, y: 3, hp: A.ANT_HP, damage: A.ANT_BITE, sightRange: 0, tag: A.ANT_TAG });
        const back = Enemy.fromSave(JSON.parse(JSON.stringify(a.toSave())));
        assert.equal(A.isAnt(back), true);
        assert.equal(back.entity.maxHp, 1);
        assert.equal(back.sightRange, 0);
    });

    test('the enemy turn leaves ants to the swarm', () => {
        const a = new Enemy({ id: 'ant_1', type: A.ANT_TYPE, x: 2, y: 3, hp: A.ANT_HP, damage: A.ANT_BITE, sightRange: 0, tag: A.ANT_TAG });
        a.state = 'chasing';   // even one a noise stirred up
        const game = { enemies: [a], playerX: 3, playerY: 3 };
        assert.deepEqual(resolveEnemyTurns(game), []);
        assert.deepEqual({ x: a.x, y: a.y }, { x: 2, y: 3 });
    });

    // ── main.js, lifted onto a stand-in game in the real diner ──────────────
    const mainSrc = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
    function liveMethod(signature, freeVars = {}) {
        const at = mainSrc.indexOf(signature, mainSrc.indexOf('class Game {'));
        assert.ok(at > 0, `${signature} not found in main.js`);
        const body = mainSrc.slice(at + signature.indexOf('('), mainSrc.indexOf('\n    }', at) + '\n    }'.length);
        const names = Object.keys(freeVars);
        return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
    }
    const free = {
        isAnt: A.isAnt, isColdTile: A.isColdTile, carriesSweet: A.carriesSweet, swarmTurn: A.swarmTurn,
        squashAnt: A.squashAnt, brushOff: A.brushOff, ANT_TYPE: A.ANT_TYPE, ANT_TAG: A.ANT_TAG,
        ANT_HP: A.ANT_HP, ANT_BITE: A.ANT_BITE, Enemy, stepEntity,
    };
    const diner = JSON.parse(readFileSync(new URL('../game/diner-map.json', import.meta.url), 'utf8'));
    const DOOR = diner.transitions[0];

    function dinerGame({ cone = true } = {}) {
        const g = {
            map: new GameMap(diner), enemies: [], containers: [], turn: 0, rng: new RNG(21),
            playerX: 6, playerY: 3, playerHp: 100, _MOVE_MS: 150, log: [], advanced: 0,
            inventory: [cone ? { itemDef: ITEMS.tigers_blood_ice_cone, count: 1 } : null, null],
            _log(m) { this.log.push(m); },
            applyDamageToPlayer(n) { this.playerHp -= n; return n; },
            _advanceWorld() { this.advanced++; this.turn++; this._antTurn(); },
        };
        for (const sig of ['_antEnv() {', '_spawnAnt(x, y) {', '_antTurn() {', '_waitTurn() {', '_tileFreeForShove(x, y, exclude = null) {']) {
            g[sig.slice(0, sig.indexOf('('))] = liveMethod(sig, free);
        }
        return g;
    }
    const ants = (g) => g.enemies.filter(A.isAnt);

    test('every world turn runs the swarm after the other creatures, and every wait can brush', () => {
        const at = mainSrc.indexOf('_advanceWorldOnce() {');
        const body = mainSrc.slice(at, mainSrc.indexOf('\n    }', at));
        const enemyTurn = body.indexOf('resolveEnemyTurns(this)');
        assert.ok(enemyTurn > 0 && body.indexOf('this._antTurn?.()') > enemyTurn, 'the world turn does not run the swarm');
        assert.ok(body.indexOf('this._antTurn?.()') < body.indexOf('this._die()'), 'an ant bite could not kill');
        // The key, the menu and the wheel all wait through _waitTurn: one plain wait line left.
        assert.equal(mainSrc.split("'[Wait]'").length - 1, 1);
        assert.equal(mainSrc.split('this._waitTurn()').length - 1, 3);
    });

    test('in the diner, ants come in at the door and bite the player who holds the cone', () => {
        const g = dinerGame();
        let firstAt = null;
        for (let i = 0; i < 60; i++) {
            g._advanceWorld();
            if (!firstAt && ants(g).length) firstAt = { x: ants(g)[0].x, y: ants(g)[0].y };
        }
        assert.deepEqual(firstAt, { x: DOOR.x, y: DOOR.y }, 'the first ant did not walk in at the door');
        assert.ok(g.playerHp < 100, 'no ant bit');
        assert.ok(ants(g).some(a => a._latched));
        for (const a of ants(g)) assert.equal(a.state, 'idle', 'an ant is hunting');
    });

    test('without the cone the diner stays empty', () => {
        const g = dinerGame({ cone: false });
        for (let i = 0; i < 30; i++) g._advanceWorld();
        assert.equal(ants(g).length, 0);
        assert.equal(g.playerHp, 100);
    });

    test('waiting with an ant latched brushes it off; waiting without is a plain wait', () => {
        const g = dinerGame();
        for (let i = 0; i < 60 && !ants(g).some(a => a._latched); i++) g._advanceWorld();
        assert.ok(ants(g).some(a => a._latched), 'set-up: an ant latched');
        g._waitTurn();
        assert.equal(g.log.at(-1), '[TEXT]');
        const fresh = dinerGame({ cone: false });
        fresh._waitTurn();
        assert.equal(fresh.log.at(-1), '[Wait]');
        assert.equal(fresh.advanced, 1);
    });

    test('a squashed ant is gone next turn, and the swarm rings its alarm', () => {
        const g = dinerGame();
        for (let i = 0; i < 60 && !ants(g).length; i++) g._advanceWorld();
        const a = ants(g)[0];
        a.entity.hp = 0; a.entity.alive = false;
        const at = { x: a.x, y: a.y };
        g._advanceWorld();
        assert.ok(!g.enemies.includes(a), 'the squashed ant is still on the map');
        assert.ok(A.alarmAt(g._antSwarm.world.field, at.x, at.y) > 0, 'no alarm where it was squashed');
    });

    test('dropping the cone sends the ants back out the door', () => {
        const g = dinerGame();
        for (let i = 0; i < 60; i++) g._advanceWorld();
        assert.ok(ants(g).length > 0, 'set-up: ants came');
        g.inventory[0] = null;
        const hp = g.playerHp;
        for (let i = 0; i < 60; i++) g._advanceWorld();
        assert.equal(ants(g).length, 0, 'ants stayed');
        assert.equal(g.playerHp, hp, 'an ant bit after the cone was dropped');
    });
});
