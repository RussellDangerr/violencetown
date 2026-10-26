// npc-flee.test.js — bystanders clear out of a fight (plans/f3c-bystanders-clear-out.md).
//
// A neutral who sees the fight steps away until it is outside the fight area,
// waits there, and walks home when it is over. Vendors and quest givers hold.
// A fleeing neutral is never a fighter.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Enemy, resolveAmbientTurns } from '../game/enemies.js';
import { tickNpcState, bystanderTurn, holdsGround, HOLD_GROUND_IDS } from '../game/npc.js';
import { fleeFrom, fleeStep } from '../game/pathing.js';
import { fighters } from '../game/fight-area.js';
import { perceives, VERDICT } from '../game/perception.js';

function makeGame(rows) {
    const H = rows.length, W = rows[0].length;
    let picks = 0;
    const rng = { pick: (a) => { picks++; return a[0]; }, float: () => 0.5, next: () => 0.5 };
    return {
        playerX: -9, playerY: -9,
        enemies: [], containers: [], groundItems: [], turn: 0, worldTick: 0, _MOVE_MS: 150,
        map: {
            isWalkable: (x, y) => x >= 0 && y >= 0 && x < W && y < H && rows[y][x] !== '#',
            getRegion: () => null,
        },
        rng, ambientRng: rng,
        get picks() { return picks; },
    };
}

const ROOM = Array.from({ length: 15 }, () => '.'.repeat(30));

// A hostile already fighting the player, facing east toward them.
function fighterAt(g, x, y) {
    const f = new Enemy({ id: 'f1', type: 'Rat', x, y, sightRange: 8 });
    f.state = 'chasing';
    f._lastDx = 1; f._lastDy = 0;
    g.enemies.push(f);
    return f;
}

// A townsperson facing west, toward the fight.
function folkAt(g, x, y, over = {}) {
    const n = new Enemy({ id: over.id ?? 'folk', type: 'Violencian', x, y, sightRange: 6,
                          behavior: ['IDLE', 'WANDER'], wanderEveryTurns: 1, ...over });
    n._lastDx = -1; n._lastDy = 0;
    g.enemies.push(n);
    return n;
}

// The fight's scene: player at (10,7), a fighter at (8,7) facing them, and a
// townsperson at (12,7) — straight down the fighter's cone, looking back at it.
function scene(over = {}) {
    const g = makeGame(over.rows ?? ROOM);
    g.playerX = 10; g.playerY = 7;
    const f = fighterAt(g, 8, 7);
    const n = folkAt(g, 12, 7, over.folk);
    return { g, f, n };
}

const inArea = (g, x, y) => fighters(g.enemies).some(f => perceives(g.map, f, x, y) !== VERDICT.NONE);
function beats(g, k) { for (let i = 0; i < k; i++) { g.worldTick++; resolveAmbientTurns(g); } }

describe('who holds their ground', () => {
    test('the seven the ruling names hold', () => {
        assert.equal(HOLD_GROUND_IDS.size, 7);
        for (const id of ['dt-merch1', 'diner-cook', 'casino-pit-boss', 'pike', 'carrion', 'dt-platero', 'bank-financier']) {
            assert.equal(holdsGround({ id }), true, id);
        }
    });
    test('any other vendor holds, and so do heavy set pieces and bosses', () => {
        assert.equal(holdsGround({ id: 'x', vendor: true }), true);
        assert.equal(holdsGround({ id: 'x', heavy: true }), true);
        assert.equal(holdsGround({ id: 'x', boss: true }), true);
    });
    test('sewer dwellers hold: only surface townsfolk scatter', () => {
        assert.equal(holdsGround({ id: 'e1', sewerDweller: true }), true);
        assert.equal(holdsGround({ id: 'dt-folk1', sewerDweller: false }), false);
    });
    test('the Violet Fungi as the sewer map spawns them hold', () => {
        const sewer = JSON.parse(readFileSync(new URL('../game/sewer-map.json', import.meta.url), 'utf8'));
        const fungi = sewer.enemies.filter(e => e.type === 'Violet Fungus');
        assert.ok(fungi.length > 0);
        for (const e of fungi) assert.equal(holdsGround(new Enemy(e)), true, e.id);
    });
    test('a plain townsperson runs', () => {
        assert.equal(holdsGround({ id: 'dt-folk1' }), false);
        assert.equal(holdsGround(null), false);
    });
});

describe('a bystander who sees the fight', () => {
    test('starts inside the fight area, sees it, and is scared', () => {
        const { g, n } = scene();
        assert.equal(inArea(g, n.x, n.y), true);
        assert.equal(bystanderTurn(g, n), true);
        assert.equal(n._fleeing, true);
    });

    test('moves away until it is outside the fight area, then stays out', () => {
        const { g, n } = scene();
        const startDist = Math.max(Math.abs(n.x - g.playerX), Math.abs(n.y - g.playerY));
        beats(g, 12);
        assert.equal(inArea(g, n.x, n.y), false, `still in the area at ${n.x},${n.y}`);
        assert.ok(Math.max(Math.abs(n.x - g.playerX), Math.abs(n.y - g.playerY)) >= startDist);
        const at = [n.x, n.y];
        beats(g, 6);
        assert.deepEqual([n.x, n.y], at, 'it waits out the fight instead of wandering back in');
        assert.equal(n._fleeing, true);
    });

    test('takes no random draw while scared', () => {
        const { g } = scene();
        const before = g.picks;
        beats(g, 8);
        assert.equal(g.picks, before);
    });

    test('a named holder sees the same fight and stays where it is', () => {
        const { g, n } = scene({ folk: { id: 'diner-cook', behavior: ['IDLE'] } });
        beats(g, 6);
        assert.deepEqual([n.x, n.y], [12, 7]);
        assert.ok(!n._fleeing);
    });

    test('a vendor holds too', () => {
        const { g, n } = scene({ folk: { id: 'dt-merch2', vendor: true, behavior: ['IDLE'] } });
        beats(g, 6);
        assert.deepEqual([n.x, n.y], [12, 7]);
    });

    test('a sewer dweller sees the same fight and stays where it is', () => {
        const { g, n } = scene({ folk: { id: 'e1', type: 'Violet Fungus', sewerDweller: true, behavior: ['IDLE'] } });
        beats(g, 6);
        assert.deepEqual([n.x, n.y], [12, 7]);
        assert.ok(!n._fleeing);
    });
});

describe('a bystander who sees nothing', () => {
    test('facing away, it is not scared and keeps its post', () => {
        const { g, n } = scene({ folk: { behavior: ['IDLE'] } });
        n._lastDx = 1;                       // its back to the fight
        beats(g, 4);
        assert.ok(!n._fleeing);
        assert.deepEqual([n.x, n.y], [12, 7]);
    });

    test('behind a wall, it is not scared', () => {
        const rows = ROOM.map((r, y) => (y >= 4 && y <= 10) ? r.slice(0, 11) + '#' + r.slice(12) : r);
        const g = makeGame(rows);
        g.playerX = 10; g.playerY = 7;
        fighterAt(g, 8, 7);
        const n = folkAt(g, 13, 7, { behavior: ['IDLE'] });
        beats(g, 4);
        assert.ok(!n._fleeing);
        assert.deepEqual([n.x, n.y], [13, 7]);
    });

    test('with no fight on, nobody is scared', () => {
        const { g, f, n } = scene({ folk: { behavior: ['IDLE'] } });
        f.state = 'idle';
        assert.equal(bystanderTurn(g, n), false);
        assert.ok(!n._fleeing);
    });
});

describe('a fleeing bystander is never a fighter', () => {
    test('fighters() never counts it, and the fight ends when the fighter stands down', () => {
        const { g, f, n } = scene();
        for (let i = 0; i < 8; i++) {
            beats(g, 1);
            assert.ok(!fighters(g.enemies).includes(n));
            assert.equal(n.state, 'idle');
        }
        f.state = 'returning';
        assert.equal(fighters(g.enemies).length, 0);
    });
});

describe('after the fight', () => {
    test('it walks home and nobody is left scared', () => {
        const { g, f, n } = scene();
        beats(g, 12);
        assert.notDeepEqual([n.x, n.y], [n.homeX, n.homeY]);
        f.state = 'returning';
        f.x = 0; f.y = 0;                    // gone off home, out of the way
        g.playerX = 0; g.playerY = 14;
        beats(g, 1);
        assert.equal(n._fleeing, false, 'the scare drops on the first turn after');
        for (let i = 0; i < 30 && n._headingHome; i++) beats(g, 1);
        assert.equal(n._headingHome, false, 'the walk home ends');
        assert.deepEqual([n.x, n.y], [n.homeX, n.homeY], 'a wanderer heads home too');
    });

    test('a blocked way home ends the walk where it stands', () => {
        const g = makeGame(ROOM);
        const n = folkAt(g, 5, 5);
        n.homeX = 20; n.homeY = 5;
        n._headingHome = true;
        g.map.isWalkable = (x, y) => !(x === 20 && y === 5) && x >= 0 && y >= 0 && x < 30 && y < 15;
        assert.equal(bystanderTurn(g, n), false);
        assert.equal(n._headingHome, false);
    });

    test('a neutral that turns hostile or ally drops the scare', () => {
        const { g, n } = scene();
        bystanderTurn(g, n);
        n.allegiance = 'ally';
        assert.equal(bystanderTurn(g, n), false);
        assert.equal(n._fleeing, false);
    });

    test('the per-turn FSM routes through it', () => {
        const { g, n } = scene({ folk: { behavior: ['IDLE'] } });
        tickNpcState(g, n, 1, g.rng);
        assert.equal(n._fleeing, true);
        assert.notDeepEqual([n.x, n.y], [12, 7]);
    });
});

describe('fleeFrom', () => {
    test('one threat is exactly the fear step', () => {
        const g = makeGame(ROOM);
        g.playerX = 10; g.playerY = 7;
        const e = { x: 12, y: 6 };
        assert.deepEqual(fleeFrom(g, e, [{ x: 10, y: 7 }]), fleeStep(g, e));
    });

    test('runs from the nearest of several threats', () => {
        const g = makeGame(ROOM);
        const e = { x: 10, y: 8 };
        const step = fleeFrom(g, e, [{ x: 8, y: 7 }, { x: 8, y: 9 }]);
        assert.deepEqual(step, { x: 11, y: 8 });
    });

    test('pinned between two threats with nowhere better, it holds still', () => {
        const g = makeGame(ROOM);
        assert.equal(fleeFrom(g, { x: 10, y: 7 }, [{ x: 8, y: 7 }, { x: 12, y: 7 }]), null);
    });

    test('a safe tile beats a longer run', () => {
        const g = makeGame(ROOM);
        const e = { x: 10, y: 7 };
        const step = fleeFrom(g, e, [{ x: 8, y: 7 }], { safe: (x, y) => x === 10 && y === 6 });
        assert.deepEqual(step, { x: 10, y: 6 });
    });

    test('boxed in, it stays put', () => {
        const g = makeGame(['###', '#.#', '###']);
        assert.equal(fleeFrom(g, { x: 1, y: 1 }, [{ x: 0, y: 1 }]), null);
    });
});
