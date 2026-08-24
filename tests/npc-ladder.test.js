// npc-ladder.test.js — the awareness ladder as tickNpcState actually runs it.
//
// tests/awareness.test.js covers nextAwareness in isolation (pure). This file
// covers the WIRING in npc.js's HOSTILE case: that the transition is applied to
// the right fields, that a suspicious NPC really does spend its turn turning
// instead of moving, that the rear blind spot holds beat after beat, and that
// the pre-existing chase and leash behaviour survived the change.
//
// These assertions were verified by hand in the browser first; this file is what
// keeps them true. Without it, the ladder's most important property — "turning
// to look IS the turn" — is guarded by nothing.
//
// Mutation-tested 2026-08-24 rather than assumed. Six mutants, five killed:
//   drop the cone epsilon .............. 8 failures
//   make the rear not blind ............ 12
//   let PERIPHERAL count as spotted .... 4
//   stop turning toward the disturbance. 2
//   SUSPICION_BEATS 2 -> 1 ............. 5
//   drop the `break` after suspicious .. 0  <-- SURVIVED, and equivalently so:
// the guard below it (`state !== 'chasing' && state !== 'searching'`) already
// stops a suspicious NPC, and nothing between the two has a side effect. The
// `break` is a readability early-out, not the thing enforcing the rule. It is
// kept deliberately, so that code inserted between them later cannot silently
// give a suspicious NPC its move back.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Enemy } from '../game/enemies.js';
import { tickNpcState } from '../game/npc.js';

// A fake game exposing exactly what the HOSTILE branch reads. Walls from a
// string grid ('#'), everything else open floor.
function makeGame(rows, playerX, playerY) {
    const H = rows.length, W = rows[0].length;
    return {
        playerX, playerY,
        enemies: [],
        containers: [],
        turn: 0,
        _MOVE_MS: 150,
        map: { isWalkable: (x, y) => x >= 0 && y >= 0 && x < W && y < H && rows[y][x] !== '#' },
        damageTaken: 0,
        applyDamageToPlayer(dmg) { this.damageTaken += dmg; },
    };
}

// A born-hostile (null behavior) at (x,y) facing south, with a real sight range.
function hostileAt(game, x, y, over = {}) {
    const e = new Enemy({ id: 'h1', type: 'guard', x, y, sightRange: 8, facing: 'S', ...over });
    game.enemies.push(e);
    return e;
}

const openRoom = [
    '...........',
    '...........',
    '...........',
    '...........',
    '...........',
    '...........',
    '...........',
    '...........',
    '...........',
];

describe('the rear blind spot holds', () => {
    test('a player standing behind is never noticed, beat after beat', () => {
        const g = makeGame(openRoom, 5, 3);
        const e = hostileAt(g, 5, 4);          // facing S, player is due N of it
        for (let i = 1; i <= 5; i++) {
            tickNpcState(g, e, i);
            assert.equal(e.state, 'idle', `beat ${i}`);
            assert.equal(e._awareBeats, 0, `beat ${i} must not accrue suspicion`);
        }
        assert.equal(g.damageTaken, 0, 'and it must never attack');
    });

    test('both rear diagonals are blind too', () => {
        for (const [dx, dy] of [[-1, -1], [1, -1]]) {
            const g = makeGame(openRoom, 5 + dx, 4 + dy);
            const e = hostileAt(g, 5, 4);
            tickNpcState(g, e, 1);
            tickNpcState(g, e, 2);
            assert.equal(e.state, 'idle', `rear diagonal ${dx},${dy}`);
        }
    });
});

describe('the cone still works — the chase was not broken', () => {
    test('a player dead ahead is spotted on the first beat', () => {
        const g = makeGame(openRoom, 5, 7);
        const e = hostileAt(g, 5, 4);          // facing S, player 3 tiles south
        const msgs = tickNpcState(g, e, 1);
        assert.equal(e.state, 'chasing');
        assert.match(msgs.map(m => m.text || m).join(' '), /spotted you/);
    });

    test('a spotted chaser closes the distance', () => {
        const g = makeGame(openRoom, 5, 8);
        const e = hostileAt(g, 5, 4);
        tickNpcState(g, e, 1);                 // spots
        const before = e.y;
        tickNpcState(g, e, 2);                 // steps
        assert.ok(e.y > before, 'must move toward the player');
    });

    test('an adjacent, facing chaser attacks', () => {
        const g = makeGame(openRoom, 5, 5);
        const e = hostileAt(g, 5, 4, { damage: 7 });
        tickNpcState(g, e, 1);                 // spots (adjacent, in cone)
        tickNpcState(g, e, 2);                 // attacks
        assert.ok(g.damageTaken > 0, 'an adjacent enemy in its cone must still hit you');
    });

    test('a wall between them blocks the cone', () => {
        const walled = [
            '...........',
            '...........',
            '...........',
            '...........',
            '.....#.....',
            '...........',
            '...........',
        ];
        const g = makeGame(walled, 5, 6);
        const e = hostileAt(g, 5, 3);          // facing S, wall at (5,4)
        tickNpcState(g, e, 1);
        assert.equal(e.state, 'idle');
    });
});

describe('turning to look IS the turn', () => {
    test('sustained flank contact promotes to suspicious and turns, without moving', () => {
        const g = makeGame(openRoom, 6, 4);    // player due EAST
        const e = hostileAt(g, 5, 4);          // facing S
        const home = { x: e.x, y: e.y };

        const b1 = tickNpcState(g, e, 1);
        assert.equal(e.state, 'idle', 'one peripheral beat is not enough');
        assert.equal(e._awareBeats, 1);
        assert.equal(b1.length, 0, 'and it says nothing yet');

        const b2 = tickNpcState(g, e, 2);
        assert.equal(e.state, 'suspicious');
        assert.deepEqual([e._lastDx, e._lastDy], [1, 0], 'must turn toward the disturbance');
        assert.deepEqual([e.x, e.y], [home.x, home.y], 'and must NOT move — the turn is spent looking');
        assert.equal(g.damageTaken, 0, 'nor attack');
        assert.match(b2.map(m => m.text || m).join(' '), /looks your way/);
    });

    test('having turned, it now sees you — camping a flank gets you caught', () => {
        const g = makeGame(openRoom, 6, 4);
        const e = hostileAt(g, 5, 4);
        tickNpcState(g, e, 1);
        tickNpcState(g, e, 2);                 // turns east
        const b3 = tickNpcState(g, e, 3);
        assert.equal(e.state, 'chasing', 'the flank is not a hiding place');
        assert.match(b3.map(m => m.text || m).join(' '), /spotted you/);
    });

    test('stepping into the blind spot before it turns lets you off', () => {
        const g = makeGame(openRoom, 6, 4);
        const e = hostileAt(g, 5, 4);
        tickNpcState(g, e, 1);                 // accrues one beat
        g.playerX = 5; g.playerY = 3;          // duck behind it
        tickNpcState(g, e, 2);
        assert.notEqual(e.state, 'chasing');
        tickNpcState(g, e, 3);
        assert.notEqual(e.state, 'chasing');
    });

    test('a real sighting wipes accrued suspicion rather than stacking on it', () => {
        const g = makeGame(openRoom, 6, 4);
        const e = hostileAt(g, 5, 4);
        tickNpcState(g, e, 1);
        assert.equal(e._awareBeats, 1);
        g.playerX = 5; g.playerY = 7;          // step into the cone
        tickNpcState(g, e, 2);
        assert.equal(e.state, 'chasing');
        assert.equal(e._awareBeats, 0);
    });
});

describe('breaking contact', () => {
    test('a chaser that loses sight keeps hunting rather than freezing', () => {
        const g = makeGame(openRoom, 5, 7);
        const e = hostileAt(g, 5, 4);
        tickNpcState(g, e, 1);                 // spots; last-seen stamped at (5,7)
        assert.equal(e.state, 'chasing');
        assert.deepEqual([e._lastSeenX, e._lastSeenY], [5, 7]);

        g.playerX = 0; g.playerY = 0;          // gone, and out of the cone
        const y0 = e.y;
        tickNpcState(g, e, 2);
        assert.ok(['chasing', 'searching'].includes(e.state), `kept hunting, was ${e.state}`);
        assert.ok(e.y >= y0, 'and moves toward where it last saw you, not where you are');
    });

    test('the last-seen mark is NOT refreshed once blind — no tracking through walls', () => {
        const g = makeGame(openRoom, 5, 7);
        const e = hostileAt(g, 5, 4);
        tickNpcState(g, e, 1);
        g.playerX = 0; g.playerY = 8;
        tickNpcState(g, e, 2);
        assert.deepEqual([e._lastSeenX, e._lastSeenY], [5, 7], 'must still point at the old tile');
    });
});
