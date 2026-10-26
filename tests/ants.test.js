import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as A from '../game/ants.js';
import { RNG } from '../game/rng.js';

// A test grid from strings: '#' wall, '~' cold, 'N' nest, 'F' food, anything else floor.
function parse(rows) {
    const height = rows.length, width = rows[0].length;
    let nest = null;
    const foods = [];
    rows.forEach((r, y) => [...r].forEach((c, x) => {
        if (c === 'N') nest = { x, y };
        if (c === 'F') foods.push({ x, y });
    }));
    const grid = {
        width, height,
        isWalkable: (x, y) => rows[y][x] !== '#',
        isCold: (x, y) => rows[y][x] === '~',
    };
    return { grid, nest, foods };
}
const worldOf = rows => { const { grid, nest, foods } = parse(rows); return A.createWorld(grid, nest ?? { x: 1, y: 1 }, foods); };
const box = (w, h, fill = '.') => Array.from({ length: h }, (_, y) =>
    (y === 0 || y === h - 1) ? '#'.repeat(w) : '#' + fill.repeat(w - 2) + '#');
const place = (rows, x, y, c) => rows.map((r, j) => (j === y ? r.slice(0, x) + c + r.slice(x + 1) : r));

// Food behind a one-tile gap in a wall: hard to find by chance, easy along a trail.
const GAP = [
    '####################',
    '#..................#',
    '#..N...............#',
    '#..................#',
    '#..................#',
    '##########.#########',
    '#..................#',
    '#..................#',
    '#...............F..#',
    '#..................#',
    '####################',
];

// Run one scout from the nest until it delivers. Returns where it walked.
function scoutRun(world, rng, limit = 3000) {
    const ant = A.createAnt({ ...world.nest });
    const carried = [];
    let drankAt = -1;
    for (let t = 0; t < limit; t++) {
        const before = { x: ant.x, y: ant.y };
        const r = A.antTurn([ant], world, rng)[0];
        if (r.action === 'drank') drankAt = t;
        if (r.action === 'home') carried.push(before);
        if (r.action === 'delivered') return { ant, drankAt, deliveredAt: t, carried };
    }
    return { ant, drankAt, deliveredAt: -1, carried };
}

// Release `n` fresh ants at the nest; turns until each first drinks (cap if never).
function turnsToFood(world, rng, n = 10, cap = 500) {
    const ants = Array.from({ length: n }, () => A.createAnt({ ...world.nest }));
    const done = new Array(n).fill(-1);
    let steps = 0, onTrail = 0;
    for (let t = 0; t < cap && done.includes(-1); t++) {
        const res = ants.map(a => A.stepAnt(a, world, rng));
        res.forEach((r, i) => {
            if (done[i] >= 0) return;
            if (r.action === 'drank') { done[i] = t; return; }
            steps++;
            if (A.trailAt(world.field, ants[i].x, ants[i].y) >= A.TRAIL_NOTICE_MIN) onTrail++;
        });
        A.decay(world.field);
    }
    const times = done.map(d => (d < 0 ? cap : d)).sort((a, b) => a - b);
    return { median: times[Math.floor(n / 2)], mean: times.reduce((a, b) => a + b, 0) / n, onTrailShare: onTrail / steps };
}

describe('ants: the scent field', () => {
    test('trail halves every TRAIL_HALF_LIFE turns; alarm fades much faster', () => {
        const f = A.createScentField(3, 3);
        A.deposit(f, 1, 1, 10);
        A.squash(f, 1, 1);
        const alarm0 = A.alarmAt(f, 1, 1);
        for (let t = 0; t < A.TRAIL_HALF_LIFE; t++) A.decay(f);
        assert.ok(Math.abs(A.trailAt(f, 1, 1) - 5) < 1e-9, `trail ${A.trailAt(f, 1, 1)}`);
        assert.equal(A.alarmAt(f, 1, 1), 0, 'alarm long gone after a trail half-life');

        const g = A.createScentField(3, 3);
        A.squash(g, 1, 1);
        for (let t = 0; t < 3; t++) A.decay(g);
        const expect = alarm0 * 0.5 ** (3 / A.ALARM_HALF_LIFE);
        assert.ok(Math.abs(A.alarmAt(g, 1, 1) - expect) < 1e-9);
    });

    test('a scent below the floor drops to zero', () => {
        const f = A.createScentField(1, 1);
        A.deposit(f, 0, 0, A.SCENT_FLOOR * 1.01);
        A.decay(f);
        assert.equal(A.trailAt(f, 0, 0), 0);
    });

    test('a squash is strongest on its tile, weaker with distance, absent past the radius', () => {
        const n = A.ALARM_RADIUS * 2 + 5, c = Math.floor(n / 2);
        const f = A.createScentField(n, n);
        A.squash(f, c, c);
        assert.equal(A.alarmAt(f, c, c), A.ALARM_STRENGTH);
        for (let d = 1; d <= A.ALARM_RADIUS; d++) {
            assert.ok(A.alarmAt(f, c + d, c) > 0);
            assert.ok(A.alarmAt(f, c + d, c) < A.alarmAt(f, c + d - 1, c));
            assert.equal(A.alarmAt(f, c + d, c + d), A.alarmAt(f, c + d, c), 'falls off by tile distance');
        }
        assert.equal(A.alarmAt(f, c + A.ALARM_RADIUS + 1, c), 0);
    });

    test('a squash at the map edge stays on the map', () => {
        const f = A.createScentField(4, 4);
        A.squash(f, 0, 0);
        assert.equal(A.alarmAt(f, 0, 0), A.ALARM_STRENGTH);
        assert.equal(A.alarmAt(f, -1, 0), 0);
    });
});

describe('ants: wandering', () => {
    test('with no scent around, an ant walks a curving path and never doubles back unless boxed in', () => {
        const world = worldOf(box(30, 30));
        const rng = new RNG(11);
        const ant = A.createAnt({ x: 15, y: 15, dir: 0 });
        let kept = 0, moves = 0;
        for (let t = 0; t < 600; t++) {
            const before = { x: ant.x, y: ant.y, px: ant.px, py: ant.py, dir: ant.dir };
            const opts = A.openNeighbours(world.grid, ant.x, ant.y);
            const r = A.stepAnt(ant, world, rng);
            assert.equal(r.action, 'wander');
            moves++;
            if (ant.dir === before.dir) kept++;
            if (opts.length > 1) assert.ok(!(ant.x === before.px && ant.y === before.py), `doubled back at turn ${t}`);
        }
        assert.ok(kept / moves > 0.5, `kept heading ${kept}/${moves}`);
        assert.ok(kept / moves < 0.9, `still turns: ${kept}/${moves}`);
    });

    test('no step cuts a wall corner diagonally', () => {
        const { grid } = parse(['###', '#.#', '##.', '###']);
        assert.deepEqual(A.openNeighbours(grid, 1, 1), []);
    });
});

describe('ants: food, trail and recruitment', () => {
    test('a scout finds food, drinks, and walks home laying trail, heaviest by the food', () => {
        const world = worldOf(GAP);
        const run = scoutRun(world, new RNG(5));
        assert.ok(run.drankAt >= 0, 'it found the food');
        assert.ok(run.deliveredAt > run.drankAt, 'it brought the food home');
        assert.equal(run.ant.carrying, false);
        assert.ok(run.carried.length >= world.home.dist[run.carried[0].y * world.home.width + run.carried[0].x],
            'the walk home is at least as long as the shortest route');
        for (const p of run.carried) assert.ok(A.trailAt(world.field, p.x, p.y) > 0, `trail at ${p.x},${p.y}`);
        const first = run.carried[0], last = run.carried[run.carried.length - 1];
        assert.ok(A.trailAt(world.field, first.x, first.y) > A.trailAt(world.field, last.x, last.y),
            'more trail by the food than by the nest');
        // It went home through the gap: every carried tile is on the way.
        assert.ok(run.carried.some(p => p.x === 10 && p.y === 5));
    });

    test('a carrier never lays trail before it has food', () => {
        const world = worldOf(box(12, 12));
        const rng = new RNG(3);
        const ants = Array.from({ length: 5 }, () => A.createAnt({ x: 6, y: 6, dir: rng.int(8) }));
        for (let t = 0; t < 100; t++) A.antTurn(ants, world, rng);
        assert.ok(world.field.trail.every(v => v === 0));
    });

    test('later ants follow the trail and reach the food sooner than scouts on a clean map', () => {
        let faster = 0, trailedTotal = 0, cleanTotal = 0;
        for (let seed = 1; seed <= 10; seed++) {
            const trailed = worldOf(GAP);
            assert.ok(scoutRun(trailed, new RNG(seed)).deliveredAt >= 0);
            const withTrail = turnsToFood(trailed, new RNG(seed * 7 + 1));
            const clean = turnsToFood(worldOf(GAP), new RNG(seed * 7 + 1));
            if (withTrail.median < clean.median) faster++;
            trailedTotal += withTrail.mean; cleanTotal += clean.mean;
            assert.ok(withTrail.onTrailShare > clean.onTrailShare,
                `seed ${seed}: followers walk on trail more (${withTrail.onTrailShare} vs ${clean.onTrailShare})`);
        }
        assert.equal(faster, 10, 'the typical follower beats the typical scout in every run');
        assert.ok(trailedTotal < cleanTotal * 0.6, `mean ${trailedTotal / 10} vs ${cleanTotal / 10}`);
    });

    test('a delivery hands the food over at the nest, and the ant comes back out facing any way', () => {
        const world = worldOf(box(8, 8));
        world.nest = { x: 3, y: 3 };
        world.home = A.createHomeMap(world.grid, world.nest);
        const ant = A.createAnt({ x: 3, y: 3, dir: 2 });
        ant.carrying = true;
        const r = A.stepAnt(ant, world, new RNG(1));
        assert.equal(r.action, 'delivered');
        assert.equal(ant.carrying, false);
        assert.equal(ant.dir, null);
        const rng = new RNG(9);
        const seen = new Set(Array.from({ length: 50 }, () => A.recruitCount(rng)));
        assert.deepEqual([...seen].sort(), Array.from({ length: A.RECRUITS_MAX - A.RECRUITS_MIN + 1 }, (_, i) => A.RECRUITS_MIN + i));
    });

    test('an ant drinks from food it is next to, without stepping onto it', () => {
        const world = worldOf(['#####', '#N.F#', '#####']);
        const ant = A.createAnt({ x: 2, y: 1, dir: 2 });
        const r = A.stepAnt(ant, world, new RNG(1));
        assert.equal(r.action, 'drank');
        assert.deepEqual(r.food, { x: 3, y: 1 });
        assert.deepEqual({ x: ant.x, y: ant.y }, { x: 2, y: 1 });
        assert.equal(ant.carrying, true);
    });
});

describe('ants: double bridge', () => {
    // Two routes from nest to food. The nest opens onto both.
    const EQUAL = [
        '###############',
        '#.............#',
        '#.###########.#',
        '#N###########F#',
        '#.###########.#',
        '#.............#',
        '###############',
    ];
    const layUpper = (world, rows, amount) => {
        for (let y = 0; y < rows.length; y++) {
            for (let x = 0; x < rows[0].length; x++) {
                if (y <= 2 && rows[y][x] === '.') A.deposit(world.field, x, y, amount);
            }
        }
    };
    const traffic = (world, rows, seed, upperTile, lowerTile, turns = 400) => {
        const rng = new RNG(seed);
        const ants = [];
        let up = 0, low = 0;
        for (let t = 0; t < turns; t++) {
            if (t % 10 === 0 && ants.length < 20) ants.push(A.createAnt({ ...world.nest }));
            A.antTurn(ants, world, rng);
            for (const a of ants) {
                if (a.x === upperTile.x && a.y === upperTile.y) up++;
                if (a.x === lowerTile.x && a.y === lowerTile.y) low++;
            }
        }
        return { up, low };
    };

    test('at the fork, most new ants take the branch with the stronger trail', () => {
        for (let seed = 1; seed <= 5; seed++) {
            const world = worldOf(EQUAL);
            layUpper(world, EQUAL, 5);
            const rng = new RNG(seed);
            let up = 0;
            for (let i = 0; i < 40; i++) {
                const a = A.createAnt({ ...world.nest });
                A.stepAnt(a, world, rng);
                if (a.y < world.nest.y) up++;
            }
            assert.ok(up >= 30, `seed ${seed}: ${up}/40 took the trailed branch`);
        }
    });

    test('the stronger trail keeps winning while the colony runs and reinforces it', () => {
        for (let seed = 1; seed <= 5; seed++) {
            const world = worldOf(EQUAL);
            layUpper(world, EQUAL, 5);
            const { up, low } = traffic(world, EQUAL, seed, { x: 7, y: 1 }, { x: 7, y: 5 });
            assert.ok(up > 2 * low, `seed ${seed}: upper ${up} vs lower ${low}`);
            assert.ok(A.trailAt(world.field, 7, 1) > A.trailAt(world.field, 7, 5));
        }
    });
});

describe('ants: alarm', () => {
    test('a squashed ant draws the ants near it; ants far away carry on', () => {
        const world = worldOf(box(31, 31));
        const sx = 15, sy = 15;
        const near = [[13, 15], [15, 18], [18, 18], [12, 12], [16, 13]].map(([x, y], i) => A.createAnt({ x, y, dir: i % 8 }));
        const far = [[2, 2], [28, 28], [2, 28], [28, 2]].map(([x, y], i) => A.createAnt({ x, y, dir: (i * 3) % 8 }));
        const start = near.map(a => Math.max(Math.abs(a.x - sx), Math.abs(a.y - sy)));
        A.squash(world.field, sx, sy);
        const rng = new RNG(4);
        for (let t = 0; t < 4; t++) {
            const res = A.antTurn([...near, ...far], world, rng);
            res.slice(near.length).forEach(r => assert.notEqual(r.action, 'alarm'));
        }
        near.forEach((a, i) => {
            const d = Math.max(Math.abs(a.x - sx), Math.abs(a.y - sy));
            assert.ok(d === 0 || d < start[i], `ant ${i} went from ${start[i]} to ${d}`);
            assert.ok(a.alarmed > 0);
        });
        assert.ok(near.filter(a => a.x === sx && a.y === sy).length >= 3, 'most reach the spot');
        far.forEach(a => assert.equal(a.alarmed, 0));
    });

    test('an alarmed ant ignores food and trail', () => {
        const rows = place(box(12, 7), 9, 3, 'F');
        const world = worldOf(rows);
        world.nest = { x: 1, y: 1 };
        world.home = A.createHomeMap(world.grid, world.nest);
        for (let x = 5; x <= 10; x++) A.deposit(world.field, x, 3, 5);
        A.squash(world.field, 3, 3);
        const ant = A.createAnt({ x: 6, y: 3, dir: 2 });
        const r = A.stepAnt(ant, world, new RNG(2));
        assert.equal(r.action, 'alarm');
        assert.equal(ant.x, 5, 'it steps away from the trail and food, toward the squash');
        assert.equal(ant.carrying, false);
    });

    test('alarm wears off a few turns after the scent is gone', () => {
        const world = worldOf(box(9, 9));
        const ant = A.createAnt({ x: 4, y: 4 });
        A.squash(world.field, 4, 4);
        const rng = new RNG(8);
        const strongest = () => Math.max(...world.field.alarm);
        let t = 0;
        while (strongest() >= A.ALARM_NOTICE_MIN && t < 100) {
            assert.equal(A.antTurn([ant], world, rng)[0].action, 'alarm');
            assert.equal(ant.alarmed, A.ALARM_TURNS);
            t++;
        }
        assert.ok(t > 0 && t < 100);
        const after = Array.from({ length: A.ALARM_TURNS + 2 }, () => A.antTurn([ant], world, rng)[0].action);
        assert.deepEqual(after, [...Array(A.ALARM_TURNS).fill('alarm'), 'wander', 'wander']);
        assert.equal(ant.alarmed, 0);
    });
});

describe('ants: cold', () => {
    // A cold band between the nest and the food, with trail and alarm on the far side.
    const COLD = [
        '##################',
        '#.......~~.......#',
        '#..N....~~.......#',
        '#.......~~.......#',
        '#.......~~...F...#',
        '#.......~~.......#',
        '##################',
    ];

    test('no ant ever steps onto a cold tile, whatever lies beyond it', () => {
        for (let seed = 1; seed <= 5; seed++) {
            const world = worldOf(COLD);
            for (let x = 4; x <= 13; x++) A.deposit(world.field, x, 2, 5);
            const rng = new RNG(seed);
            const ants = Array.from({ length: 12 }, () => A.createAnt({ ...world.nest }));
            for (let t = 0; t < 400; t++) {
                if (t % 20 === 0) { A.squash(world.field, 11, 2); A.deposit(world.field, 7, 2, 5); }
                A.antTurn(ants, world, rng);
                for (const a of ants) assert.ok(!world.grid.isCold(a.x, a.y), `seed ${seed} turn ${t}: ant on cold ${a.x},${a.y}`);
            }
        }
    });

    test('cold tiles are walls to the route home, and a gap in them is the way through', () => {
        const rows = place(place(COLD, 8, 5, '.'), 9, 5, '.');
        const world = worldOf(rows);
        assert.equal(world.home.dist[2 * world.home.width + 12], 10, 'around through the gap');
        assert.equal(worldOf(COLD).home.dist[2 * world.home.width + 12], Infinity, 'no way home through cold');
        const rng = new RNG(6);
        const ants = Array.from({ length: 10 }, () => A.createAnt({ ...world.nest }));
        let crossed = false;
        for (let t = 0; t < 600; t++) {
            A.antTurn(ants, world, rng);
            for (const a of ants) {
                assert.ok(!world.grid.isCold(a.x, a.y));
                if (a.x > 9) crossed = true;
            }
        }
        assert.ok(crossed, 'ants still find the way round');
    });

    test('an ant that starts on a cold tile cannot move', () => {
        const world = worldOf(COLD);
        const ant = A.createAnt({ x: 8, y: 2 });
        const r = A.stepAnt(ant, world, new RNG(1));
        assert.equal(r.action, 'chilled');
        assert.deepEqual({ x: ant.x, y: ant.y }, { x: 8, y: 2 });
    });
});

describe('ants: determinism', () => {
    const run = seed => {
        const world = worldOf(GAP);
        const rng = new RNG(seed);
        const ants = [];
        const trace = [];
        for (let t = 0; t < 300; t++) {
            if (t % 15 === 0) ants.push(A.createAnt({ ...world.nest }));
            if (t === 150) A.squash(world.field, 8, 3);
            const res = A.antTurn(ants, world, rng);
            trace.push(ants.map((a, i) => `${a.x},${a.y},${a.carrying ? 'c' : ''}${res[i].action}`).join(' '));
        }
        return { trace, trail: [...world.field.trail], alarm: [...world.field.alarm] };
    };

    test('the same seed replays exactly', () => {
        assert.deepEqual(run(42), run(42));
    });

    test('a different seed gives a different run', () => {
        assert.notDeepEqual(run(42).trace, run(43).trace);
    });

    test('the module never reaches for Math.random', () => {
        const src = readFileSync(new URL('../game/ants.js', import.meta.url), 'utf8');
        assert.ok(!/Math\.random/.test(src));
    });
});

describe('ants: constants', () => {
    test('every tuning number is a named constant at the top of the module', () => {
        const src = readFileSync(new URL('../game/ants.js', import.meta.url), 'utf8');
        const names = [...src.matchAll(/^export const ([A-Z_]+) = ([\d.]+);/gm)].map(m => m[1]);
        assert.ok(names.length >= 15, `found ${names.length} constants`);
        for (const n of names) assert.ok(Number.isFinite(A[n]) && A[n] > 0, n);
        // Past the constants, the only literals are geometry: none, one, a right
        // angle (2 headings), a half turn (4), the 8 headings, and a half for half-lives.
        const body = src.slice(src.indexOf('// 8 headings'))
            .replace(/\/\/.*$/gm, '').replace(/'[^']*'/g, '');
        const literals = [...body.matchAll(/(?<![\w.])\d+(?:\.\d+)?(?![\w.])/g)].map(m => Number(m[0]));
        const allowed = new Set([0, 1, 2, 4, 8, 0.5]);
        assert.deepEqual(literals.filter(n => !allowed.has(n)), []);
    });
});
