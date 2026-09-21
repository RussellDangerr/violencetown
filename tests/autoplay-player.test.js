// autoplay-player.test.js — the standard fighter's rules, one at a time.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { decide, goalDone, BARRICADE, SNEAK } from '../game/autoplay/player.js';

// A game as the player sees it. Rows: '.' open, '#' wall, 'B' barricade.
// `seen` marks tiles a hostile perceives: { 'x,y': 'DIRECT' | 'PERIPHERAL' }.
function view({ rows, player, enemies = [], items = [], hp = 100, maxHp = 100, canEat = false,
                mapUrl = 'town-map.json', transitions = [], inventory = [], targets = {}, containers = [], seen = {} }) {
    return {
        mapUrl, width: rows[0].length, height: rows.length, player, hp, maxHp, canEat,
        isWalkable: (x, y) => rows[y]?.[x] === '.',
        tileAt: (x, y) => (rows[y]?.[x] === 'B' ? BARRICADE : rows[y]?.[x] === '.' ? 1 : 0),
        transitions, enemies, items, inventory, containers,
        targetIdAt: (x, y) => targets[`${x},${y}`] ?? null,
        seenAt: (x, y) => seen[`${x},${y}`] ?? 'NONE',
    };
}
const open = ['.....', '.....', '.....'];
const far = [{ reach: 'nowhere.json' }];   // a goal that keeps the fighter busy elsewhere

describe('the standard fighter', () => {
    test('eats below the heal threshold when it has food', () => {
        assert.equal(decide(view({ rows: open, player: { x: 0, y: 0 }, hp: 39, canEat: true }), far).kind, 'eat');
    });
    test('does not try to eat with nothing to eat', () => {
        assert.notEqual(decide(view({ rows: open, player: { x: 0, y: 0 }, hp: 10 }), far).kind, 'eat');
    });
    test('does not eat above the threshold', () => {
        assert.notEqual(decide(view({ rows: open, player: { x: 0, y: 0 }, hp: 41, canEat: true }), far).kind, 'eat');
    });

    test('hits an adjacent hostile, facing it', () => {
        const a = decide(view({ rows: open, player: { x: 1, y: 1 }, enemies: [{ x: 2, y: 1, hp: 50, hostile: true, tag: null }] }), far);
        assert.deepEqual(a, { kind: 'attack', at: { x: 2, y: 1 }, dir: 'right' });
    });
    test('a diagonal hostile is hit through the wheel (no facing)', () => {
        const a = decide(view({ rows: open, player: { x: 1, y: 1 }, enemies: [{ x: 2, y: 2, hp: 50, hostile: true, tag: null }] }), far);
        assert.equal(a.kind, 'attack');
        assert.equal(a.dir, null);
    });
    test('walks past an adjacent neutral', () => {
        const a = decide(view({ rows: open, player: { x: 1, y: 1 }, enemies: [{ x: 2, y: 1, hp: 50, hostile: false, tag: null }] }), far);
        assert.notEqual(a.kind, 'attack');
    });
    test('the quarry comes first, however healthy', () => {
        const enemies = [{ x: 0, y: 1, hp: 10, hostile: true, tag: null }, { x: 2, y: 1, hp: 90, hostile: true, tag: 'wererat_boss' }];
        const a = decide(view({ rows: open, player: { x: 1, y: 1 }, enemies, mapUrl: 'sewer-map.json' }), [{ kill: 'wererat_boss', map: 'sewer-map.json' }]);
        assert.deepEqual(a.at, { x: 2, y: 1 });
    });
    test('otherwise the weakest adjacent hostile', () => {
        const enemies = [{ x: 0, y: 1, hp: 90, hostile: true, tag: null }, { x: 2, y: 1, hp: 30, hostile: true, tag: null }];
        assert.deepEqual(decide(view({ rows: open, player: { x: 1, y: 1 }, enemies }), far).at, { x: 2, y: 1 });
    });

    test('on the wrong map it heads for the way there', () => {
        const a = decide(view({ rows: open, player: { x: 2, y: 1 }, mapUrl: 'sewer-map.json',
            transitions: [{ x: 0, y: 1, toMap: 'town-map.json' }] }), [{ use: 'car', map: 'town-map.json' }]);
        assert.deepEqual(a, { kind: 'step', dir: 'left' });
    });
    test('kill: walks to stand beside the quarry', () => {
        const a = decide(view({ rows: open, player: { x: 0, y: 1 }, mapUrl: 'sewer-map.json',
            enemies: [{ x: 4, y: 1, hp: 100, hostile: false, tag: 'wererat_boss' }] }), [{ kill: 'wererat_boss', map: 'sewer-map.json' }]);
        assert.deepEqual(a, { kind: 'step', dir: 'right' });
    });
    test('take: walks onto the item', () => {
        const a = decide(view({ rows: open, player: { x: 1, y: 0 }, mapUrl: 'sewer-map.json',
            items: [{ type: 'catalytic_converter', x: 1, y: 2 }] }), [{ take: 'catalytic_converter', map: 'sewer-map.json' }]);
        assert.deepEqual(a, { kind: 'step', dir: 'down' });
    });
    test('use: beside the target it uses it, facing it', () => {
        const rows = ['#.#', '...'];
        const a = decide(view({ rows, player: { x: 1, y: 1 }, targets: { '1,0': 'car' } }), [{ use: 'car', map: 'town-map.json' }]);
        assert.deepEqual(a, { kind: 'use', dir: 'up' });
    });
    test('use: elsewhere it walks to the nearest place to use it from', () => {
        const rows = ['###', '...'];
        const a = decide(view({ rows, player: { x: 0, y: 1 }, targets: { '1,0': 'car' } }), [{ use: 'car', map: 'town-map.json' }]);
        assert.deepEqual(a, { kind: 'step', dir: 'right' });
    });
    test('a barricade in the way is walked into, not around', () => {
        const a = decide(view({ rows: ['.B.'], player: { x: 0, y: 0 }, mapUrl: 'sewer-map.json',
            transitions: [{ x: 2, y: 0, toMap: 'town-map.json' }] }), [{ reach: 'town-map.json' }]);
        assert.deepEqual(a, { kind: 'step', dir: 'right' });
    });
    test('it walks around a chest, never into it — walking into one opens it', () => {
        const a = decide(view({ rows: ['...', '...'], player: { x: 0, y: 0 }, mapUrl: 'sewer-map.json',
            containers: [{ x: 1, y: 0 }], transitions: [{ x: 2, y: 0, toMap: 'town-map.json' }] }), [{ reach: 'town-map.json' }]);
        assert.deepEqual(a, { kind: 'step', dir: 'down' });
    });
    test('boxed in, it waits and says why', () => {
        const a = decide(view({ rows: ['...'], player: { x: 0, y: 0 }, mapUrl: 'sewer-map.json',
            enemies: [{ x: 1, y: 0, hp: 100, hostile: false, tag: null }],
            transitions: [{ x: 2, y: 0, toMap: 'town-map.json' }] }), [{ reach: 'town-map.json' }]);
        assert.equal(a.kind, 'wait');
        assert.match(a.why, /town-map\.json/);
    });
});

describe('the sneak (ruling Q1-8)', () => {
    const exit = [{ x: 4, y: 0, toMap: 'town-map.json' }];
    const reach = [{ reach: 'town-map.json' }];
    // Two ways from (0,0) to the exit at (4,0): along row 0 (short), or down and
    // round through row 2 (long).
    const loop = ['.....', '.###.', '.....'];

    test('walks past an unaware hostile instead of starting a fight', () => {
        const a = decide(view({ rows: open, player: { x: 1, y: 1 }, mapUrl: 'sewer-map.json', transitions: exit,
            enemies: [{ x: 2, y: 1, hp: 50, hostile: true, aware: false, tag: null }] }), reach, SNEAK);
        assert.notEqual(a.kind, 'attack');
    });
    test('fights back once it has been seen', () => {
        const a = decide(view({ rows: open, player: { x: 1, y: 1 }, mapUrl: 'sewer-map.json', transitions: exit,
            enemies: [{ x: 2, y: 1, hp: 50, hostile: true, aware: true, tag: null }] }), reach, SNEAK);
        assert.equal(a.kind, 'attack');
    });
    test('still hits the quarry, seen or not', () => {
        const a = decide(view({ rows: open, player: { x: 1, y: 1 }, mapUrl: 'sewer-map.json',
            enemies: [{ x: 2, y: 1, hp: 90, hostile: true, aware: false, tag: 'wererat_boss' }] }),
            [{ kill: 'wererat_boss', map: 'sewer-map.json' }], SNEAK);
        assert.equal(a.kind, 'attack');
    });
    test('takes the long way round a watched tile when the short way is seen', () => {
        const a = decide(view({ rows: loop, player: { x: 0, y: 0 }, mapUrl: 'sewer-map.json', transitions: exit,
            seen: { '2,0': 'DIRECT' } }), reach, SNEAK);
        assert.deepEqual(a, { kind: 'step', dir: 'down', exposure: 'unseen' });
    });
    test('the fighter does not care who is watching', () => {
        const a = decide(view({ rows: loop, player: { x: 0, y: 0 }, mapUrl: 'sewer-map.json', transitions: exit,
            seen: { '2,0': 'DIRECT' } }), reach);
        assert.deepEqual(a, { kind: 'step', dir: 'right' });
    });
    test('a flank glance beats being spotted when nothing is fully hidden', () => {
        const a = decide(view({ rows: loop, player: { x: 0, y: 0 }, mapUrl: 'sewer-map.json', transitions: exit,
            seen: { '2,0': 'DIRECT', '2,2': 'PERIPHERAL' } }), reach, SNEAK);
        assert.deepEqual(a, { kind: 'step', dir: 'down', exposure: 'glimpsed' });
    });
    test('when every way is watched it goes anyway, and says so', () => {
        const a = decide(view({ rows: loop, player: { x: 0, y: 0 }, mapUrl: 'sewer-map.json', transitions: exit,
            seen: { '2,0': 'DIRECT', '2,2': 'DIRECT' } }), reach, SNEAK);
        assert.deepEqual(a, { kind: 'step', dir: 'right', exposure: 'seen' });
    });
});

describe('when a goal is met', () => {
    const boss = { x: 1, y: 1, hp: 100, hostile: true, tag: 'wererat_boss' };
    const kill = { kill: 'wererat_boss', map: 'sewer-map.json' };
    test('kill: only on its own map, and only once the quarry is gone', () => {
        assert.equal(goalDone(view({ rows: open, player: { x: 0, y: 0 }, mapUrl: 'town-map.json' }), kill), false);
        assert.equal(goalDone(view({ rows: open, player: { x: 0, y: 0 }, mapUrl: 'sewer-map.json', enemies: [boss] }), kill), false);
        assert.equal(goalDone(view({ rows: open, player: { x: 0, y: 0 }, mapUrl: 'sewer-map.json' }), kill), true);
    });
    test('take: once it is carried', () => {
        const take = { take: 'catalytic_converter', map: 'sewer-map.json' };
        assert.equal(goalDone(view({ rows: open, player: { x: 0, y: 0 } }), take), false);
        assert.equal(goalDone(view({ rows: open, player: { x: 0, y: 0 }, inventory: ['catalytic_converter'] }), take), true);
    });
    test('reach: on arrival', () => {
        assert.equal(goalDone(view({ rows: open, player: { x: 0, y: 0 }, mapUrl: 'town-map.json' }), { reach: 'town-map.json' }), true);
    });
    test('use: never by itself — the quest moving on ends it', () => {
        assert.equal(goalDone(view({ rows: open, player: { x: 0, y: 0 } }), { use: 'car', map: 'town-map.json' }), false);
    });
});
