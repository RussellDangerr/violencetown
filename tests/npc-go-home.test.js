// npc-go-home.test.js — shoved characters walk back to their post.
//
// (ruled 2026-09-02) A bump shoves whoever is in the way, shopkeepers included.
// That is deliberate and it is meant to be funny. It stops being funny if it is
// permanent: without a walk home, every trip through town leaves the cast a
// little further from where they belong, and the market degrades into people
// standing in the road. Caelan's words: "even if you do shove a trader out of
// the way, they should have simple scripting to get back to their original spot,
// if possible, as a walking mechanic."
//
// The "if possible" is load-bearing and is tested here too — a blocked route
// waits rather than shoving back.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Enemy } from '../game/enemies.js';
import { tickNpcState, goHomeStep } from '../game/npc.js';

function makeGame(rows) {
    const H = rows.length, W = rows[0].length;
    return {
        playerX: -9, playerY: -9,          // out of the way unless a test moves them
        enemies: [], containers: [], turn: 0, _MOVE_MS: 150,
        map: {
            isWalkable: (x, y) => x >= 0 && y >= 0 && x < W && y < H && rows[y][x] !== '#',
            getRegion: () => null,
        },
        rng: { pick: (a) => a[0], float: () => 0.5 },
    };
}

const room = [
    '.........',
    '.........',
    '.........',
    '.........',
    '.........',
    '.........',
];

// A stationary shopkeeper: IDLE only, no WANDER, so he holds a post.
function keeperAt(game, x, y, over = {}) {
    const e = new Enemy({ id: 'k1', type: 'Violencian', x, y, vendor: true, stock: ['rock'],
                          behavior: ['IDLE'], sightRange: 0, ...over });
    game.enemies.push(e);
    return e;
}

describe('the post', () => {
    // homeX/homeY already existed as the CHASE LEASH anchor. The walk home is the
    // same idea — where you belong — so it reuses them rather than inventing a
    // second spawn tile that could drift out of step with the first.
    test('a character remembers where it spawned', () => {
        const g = makeGame(room);
        const k = keeperAt(g, 4, 3);
        assert.deepEqual([k.homeX, k.homeY], [4, 3]);
    });

    test('the post survives a save', () => {
        // Home used to be re-derived from the save's x/y, so saving while someone
        // was displaced quietly MOVED it to wherever they stood — which would make
        // every shove permanent across a reload, and had already been shifting
        // chase-leash anchors before the walk home existed.
        const g = makeGame(room);
        const k = keeperAt(g, 4, 3);
        k.x = 1; k.y = 1;                                  // shoved, then saved
        const revived = Enemy.fromSave(JSON.parse(JSON.stringify(k.toSave())));
        assert.deepEqual([revived.homeX, revived.homeY], [4, 3],
            'a save taken with a shoved trader must still know where he belongs');
        assert.deepEqual([revived.x, revived.y], [1, 1], 'and where he currently is');
    });

    test('an old save with no home falls back to where it reloads', () => {
        const g = makeGame(room);
        const k = keeperAt(g, 4, 3);
        const raw = k.toSave();
        delete raw.homeX; delete raw.homeY;                 // a save from before this shipped
        const revived = Enemy.fromSave(JSON.parse(JSON.stringify(raw)));
        assert.deepEqual([revived.homeX, revived.homeY], [revived.x, revived.y]);
    });
});

describe('walking back', () => {
    test('a shoved shopkeeper steps toward his post', () => {
        const g = makeGame(room);
        const k = keeperAt(g, 4, 3);
        k.x = 1; k.y = 3;                                   // shoved three tiles west
        const before = k.x;
        assert.equal(goHomeStep(g, k), true);
        assert.ok(k.x > before, `did not head home: ${k.x},${k.y}`);
    });

    test('and keeps going until he is back, then stops', () => {
        const g = makeGame(room);
        const k = keeperAt(g, 4, 3);
        k.x = 1; k.y = 1;
        for (let i = 0; i < 12 && goHomeStep(g, k); i++) { /* walk */ }
        assert.deepEqual([k.x, k.y], [4, 3], 'should have arrived');
        assert.equal(goHomeStep(g, k), false, 'and must not fidget once home');
    });

    test('standing at his post, he does nothing at all', () => {
        const g = makeGame(room);
        const k = keeperAt(g, 4, 3);
        assert.equal(goHomeStep(g, k), false);
        assert.deepEqual([k.x, k.y], [4, 3]);
    });

    test('the walk home happens through the FSM, not just the helper', () => {
        // The helper being right is worth nothing if IDLE never calls it.
        const g = makeGame(room);
        const k = keeperAt(g, 4, 3);
        k.x = 2; k.y = 3;
        tickNpcState(g, k, 0);                              // first tick also inits the FSM
        tickNpcState(g, k, 1);
        assert.ok(k.x > 2, `IDLE did not walk him home: ${k.x},${k.y}`);
    });
});

describe('who does NOT hold a post', () => {
    test('a wanderer is left to drift', () => {
        // pickWanderTarget steps from wherever the NPC currently stands rather
        // than from an anchor, so a wanderer with a post would walk off and
        // trudge back forever, fighting itself. Shoving one just moves where it
        // drifts from — which is fine, and funnier.
        const g = makeGame(room);
        const w = new Enemy({ id: 'w1', type: 'Violencian', x: 4, y: 3,
                              behavior: ['IDLE', 'WANDER'], wanderRadius: 3, sightRange: 0 });
        g.enemies.push(w);
        w.x = 1; w.y = 1;
        assert.equal(goHomeStep(g, w), false);
        assert.deepEqual([w.x, w.y], [1, 1], 'a wanderer must not be dragged home');
    });

    test('a character with no post stays put', () => {
        const g = makeGame(room);
        const k = keeperAt(g, 4, 3);
        k.homeX = null; k.homeY = null;
        assert.equal(goHomeStep(g, k), false);
    });
});

describe('"if possible"', () => {
    test('blocked out of his own stall, he waits rather than shoving back', () => {
        const walled = [
            '.........',
            '.###.....',
            '.#k#.....',      // the post is inside a one-tile cell with no opening
            '.###.....',
            '.........',
        ];
        const g = makeGame(walled);
        const k = keeperAt(g, 2, 2);
        k.x = 6; k.y = 0;                                   // shoved outside, no route in
        assert.equal(goHomeStep(g, k), false);
        assert.deepEqual([k.x, k.y], [6, 0], 'no route home is a wait, not a teleport');
    });

    test('a route home that exists is taken even around a wall', () => {
        const maze = [
            '.........',
            '.#######.',
            '.........',
        ];
        const g = makeGame(maze);
        const k = keeperAt(g, 1, 0);
        k.x = 1; k.y = 2;                                   // below the wall; must go around
        let moved = 0;
        for (let i = 0; i < 30 && goHomeStep(g, k); i++) moved++;
        assert.ok(moved > 0, 'never set off');
        assert.deepEqual([k.x, k.y], [1, 0], `stalled at ${k.x},${k.y} after ${moved} steps`);
    });
});

// ── The two ways a shove fails ──────────────────────────────────────────────
//
// (ruled 2026-09-02) Caelan: "trying to push someone and not being able to, I
// think, is a good source of physical comedy." It was a thud and a recoil with
// no line — the joke performed to an empty room. Each failure gets its own beat
// now, and they are DIFFERENT failures: one of them cannot be moved, the other
// would move and has nowhere to go.
describe('a shove that does not land', () => {
    const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');

    function liveShove(freeVars) {
        const sig = '_shoveNpc(enemy, dir) {';
        const at = mainSrc.indexOf(sig);
        assert.ok(at > 0);
        const closeAt = mainSrc.indexOf('\n    }', at);
        const body = mainSrc.slice(at + '_shoveNpc'.length, closeAt + '\n    }'.length);
        const names = Object.keys(freeVars);
        return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
    }

    function harness(over = {}) {
        const logs = [];
        const self = {
            _isHeavy: (c) => c.heavy === true || c.boss === true,
            _bounceOff: () => {}, _render: () => {}, _MOVE_MS: 100,
            _log: (t) => logs.push(t),
            _shoveDestination: () => ({ x: 6, y: 4 }),
            ...over,
        };
        return { self, logs };
    }
    const shove = liveShove({ audio: { playSfx: () => {} }, stepEntity: () => {} });

    test('an immovable character says so', () => {
        const { self, logs } = harness();
        assert.equal(shove.call(self, { x: 6, y: 5, name: 'Hooch', heavy: true }, { dx: 1, dy: 0 }), false);
        assert.equal(logs.length, 1);
        assert.match(logs[0], /Hooch/);
        assert.match(logs[0], /does not appear to notice/);
    });

    test('a boxed-in character reads as a DIFFERENT failure', () => {
        const { self, logs } = harness({ _shoveDestination: () => null });
        assert.equal(shove.call(self, { x: 6, y: 5, name: 'Puck' }, { dx: 1, dy: 0 }), false);
        assert.equal(logs.length, 1);
        assert.match(logs[0], /nowhere to go/);
        assert.doesNotMatch(logs[0], /does not appear to notice/,
            'the two failures must not share a line — they are not the same joke');
    });

    test('a shove that WORKS stays quiet about failing', () => {
        const { self, logs } = harness();
        assert.equal(shove.call(self, { x: 6, y: 5, name: 'Puck' }, { dx: 1, dy: 0 }), true);
        assert.ok(!logs.some(l => /nowhere to go|does not appear/.test(l)));
    });

    test('a nameless character still gets a readable line', () => {
        const { self, logs } = harness();
        shove.call(self, { x: 6, y: 5, type: 'Violencian', heavy: true }, { dx: 1, dy: 0 });
        assert.match(logs[0], /Violencian/);
    });
});

describe('bosses are unbudgeable by derivation', () => {
    const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');
    const isHeavy = (() => {
        const at = mainSrc.indexOf('_isHeavy(ch) {');
        const body = mainSrc.slice(at + '_isHeavy'.length, mainSrc.indexOf('\n    }', at) + 6);
        return new Function(`'use strict'; return function ${body}`)();
    })();

    test('an authored heavy is still heavy', () => {
        assert.equal(isHeavy({ heavy: true }), true);
    });

    test('a boss is heavy without being flagged twice', () => {
        // The shove comment named bosses as immovable from the day it shipped and
        // nothing was ever flagged, so the branch sat there for months with only a
        // wall of fungus behind it.
        assert.equal(isHeavy({ boss: true }), true);
    });

    test('an ordinary character is not', () => {
        assert.equal(isHeavy({}), false);
        assert.equal(isHeavy({ heavy: false, boss: false }), false);
        assert.equal(isHeavy({ vendor: true }), false, 'traders are shoveable — they walk back');
    });
});
