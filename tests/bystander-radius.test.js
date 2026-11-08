// bystander-radius.test.js — scared townsfolk near a fight actually move away
// (plans/fx15-bystanders-move-away.md).
//
// The player counts as part of the fight: a scared townsperson keeps moving
// until no fighter and not the player can see it. Before this, one standing
// behind the enemy you were hitting was out of every fighter's cone and stood
// still in plain view.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Enemy, resolveAmbientTurns } from '../game/enemies.js';
import { bystanderTurn } from '../game/npc.js';
import { fighters, fightArea, areaAt, playerSees, inFightView } from '../game/fight-area.js';
import { perceives, VERDICT } from '../game/perception.js';

function makeGame(rows) {
    const H = rows.length, W = rows[0].length;
    const rng = { pick: (a) => a[0], float: () => 0.5, next: () => 0.5 };
    return {
        playerX: -9, playerY: -9,
        enemies: [], containers: [], groundItems: [], turn: 0, worldTick: 0, _MOVE_MS: 150,
        map: {
            isWalkable: (x, y) => x >= 0 && y >= 0 && x < W && y < H && rows[y][x] !== '#',
            getRegion: () => null,
        },
        rng, ambientRng: rng,
    };
}

const ROOM = Array.from({ length: 15 }, () => '.'.repeat(30));

// The scene: the player at (10,7), a fighter at (12,7) facing west at them,
// and a townsperson at (14,7) two tiles behind the fighter, looking west at
// the fight. The fighter's back is to the townsperson.
function scene(over = {}) {
    const g = makeGame(over.rows ?? ROOM);
    g.playerX = 10; g.playerY = 7;
    const f = new Enemy({ id: 'f1', type: 'Rat', x: 12, y: 7, sightRange: over.sight ?? 8 });
    f.state = 'chasing';
    f._lastDx = -1; f._lastDy = 0;
    g.enemies.push(f);
    const n = new Enemy({ id: 'folk', type: 'Violencian', x: over.nx ?? 14, y: over.ny ?? 7, sightRange: 6,
                          behavior: ['IDLE'], ...(over.folk || {}) });
    n._lastDx = -1; n._lastDy = 0;
    g.enemies.push(n);
    return { g, f, n };
}

const player = (g) => ({ x: g.playerX, y: g.playerY });
const fighterSees = (g, x, y) => fighters(g.enemies).some(f => perceives(g.map, f, x, y) !== VERDICT.NONE);
const inView = (g, x, y) => inFightView(g.map, fighters(g.enemies), player(g), x, y);
function beats(g, k) { for (let i = 0; i < k; i++) { g.worldTick++; resolveAmbientTurns(g); } }

describe('the player is part of the fight', () => {
    test('the townsperson behind the fighter is out of its sight but in the player\'s', () => {
        const { g, n } = scene();
        assert.equal(fighterSees(g, n.x, n.y), false);
        assert.equal(playerSees(g.map, player(g), fighters(g.enemies), n.x, n.y), true);
        assert.equal(inView(g, n.x, n.y), true);
    });

    test('it gets scared and moves away until neither the fighter nor the player can see it', () => {
        const { g, n } = scene();
        beats(g, 1);
        assert.equal(n._fleeing, true);
        assert.notDeepEqual([n.x, n.y], [14, 7], 'it moves on its first turn');
        beats(g, 15);
        assert.equal(inView(g, n.x, n.y), false, `still in view at ${n.x},${n.y}`);
        assert.equal(fighterSees(g, n.x, n.y), false);
    });

    test('once out of view it waits instead of wandering back in', () => {
        const { g, n } = scene();
        beats(g, 16);
        const at = [n.x, n.y];
        beats(g, 6);
        assert.deepEqual([n.x, n.y], at);
        assert.equal(n._fleeing, true);
    });

    test('scared, already behind a wall from the player and out of the fighter\'s sight, it stays', () => {
        // A wall at x=16, rows 5..9, between the player and (17,7).
        const rows = ROOM.map((r, y) => (y >= 5 && y <= 9) ? r.slice(0, 16) + '#' + r.slice(17) : r);
        const { g, n } = scene({ rows, nx: 17, ny: 7 });
        n._fleeing = true;
        assert.equal(inView(g, 17, 7), false);
        assert.equal(bystanderTurn(g, n), true);
        assert.deepEqual([n.x, n.y], [17, 7]);
    });
});

describe('playerSees', () => {
    test('reaches as far as the farthest-seeing fighter, all round', () => {
        const { g } = scene();
        const fs = fighters(g.enemies);
        assert.equal(playerSees(g.map, player(g), fs, 18, 7), true);
        assert.equal(playerSees(g.map, player(g), fs, 19, 7), false);
        assert.equal(playerSees(g.map, player(g), fs, 2, 7), true, 'behind the player too');
        assert.equal(playerSees(g.map, player(g), fs, 10, 0), true);
    });

    test('a shorter-sighted fight is a shorter reach', () => {
        const { g } = scene({ sight: 5 });
        const fs = fighters(g.enemies);
        assert.equal(playerSees(g.map, player(g), fs, 15, 7), true);
        assert.equal(playerSees(g.map, player(g), fs, 16, 7), false);
    });

    test('walls block it', () => {
        const rows = ROOM.map((r, y) => y === 7 ? r.slice(0, 13) + '#' + r.slice(14) : r);
        const { g } = scene({ rows });
        assert.equal(playerSees(g.map, player(g), fighters(g.enemies), 15, 7), false);
    });

    test('with no fight on, the player\'s view counts for nothing', () => {
        const { g, f } = scene();
        f.state = 'idle';
        assert.equal(playerSees(g.map, player(g), fighters(g.enemies), 12, 7), false);
        assert.equal(inView(g, 12, 7), false);
    });
});

describe('the ones who hold still hold', () => {
    for (const [label, folk] of [
        ['a named quest giver', { id: 'diner-cook' }],
        ['a vendor', { id: 'dt-merch2', vendor: true }],
        ['a sewer creature', { id: 'e1', type: 'Violet Fungus', sewerDweller: true }],
    ]) {
        test(`${label} in the same spot stays put`, () => {
            const { g, n } = scene({ folk });
            beats(g, 8);
            assert.deepEqual([n.x, n.y], [14, 7]);
            assert.ok(!n._fleeing);
        });
    }
});

describe('the fog is unchanged', () => {
    test('the fight area the fog draws is still the fighters\' view alone', () => {
        const { g } = scene();
        const area = fightArea(g.map, fighters(g.enemies), { x0: 0, y0: 0, x1: 29, y1: 14 });
        assert.equal(areaAt(area, 14, 7).seen, false, 'behind the fighter stays fogged');
        assert.equal(areaAt(area, 10, 7).seen, true);
    });
});
