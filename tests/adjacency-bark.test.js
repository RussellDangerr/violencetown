// adjacency-bark.test.js — an NPC with an adjacency bark (Carrion) speaks once per
// approach: it re-arms only when the player is no longer touching her, diagonals
// included (plans/fx51-carrion-bark-once.md). Played through the real
// resolveEnemyTurns, with a stand-in game.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Enemy, resolveEnemyTurns } from '../game/enemies.js';

const W = 11, H = 9;
function makeGame(px, py) {
    return {
        playerX: px, playerY: py, enemies: [], containers: [], turn: 1, _MOVE_MS: 150,
        map: { isWalkable: (x, y) => x >= 0 && y >= 0 && x < W && y < H },
        rng: { pick: (a) => a[0], float: () => 0.5 },
        _log() {},
    };
}
const LINE = '[TEXT]';
function carrion(g) {
    const e = new Enemy({ id: 'carrion', type: 'Carrion', x: 5, y: 4, sightRange: 4, facing: 'S',
        allegiance: 'neutral', behavior: ['IDLE'], hp: 100, damage: 0, adjacencyBark: LINE });
    g.enemies.push(e);
    return e;
}
const barks = (msgs) => msgs.filter(m => m && m.category === 'adjacency-bark').length;
// Move the player to (x, y), take one turn, and count how many times she spoke.
const stepTo = (g, x, y) => {
    g.playerX = x; g.playerY = y; g.turn++;
    return barks(resolveEnemyTurns(g));
};
const walk = (g, path) => path.reduce((n, [x, y]) => n + stepTo(g, x, y), 0);

// The ring of eight tiles around her at (5,4), clockwise from the one above her:
// touching her at every step, orthogonal and diagonal.
const AROUND = [[5, 3], [6, 3], [6, 4], [6, 5], [5, 5], [4, 5], [4, 4], [4, 3], [5, 3]];

describe('adjacency bark: once per approach', () => {
    test('she speaks when you step up to her, and not again while you stand there', () => {
        const g = makeGame(5, 0); carrion(g);
        assert.equal(stepTo(g, 5, 3), 1);
        assert.equal(barks(resolveEnemyTurns(g)), 0);
    });

    test('walking all the way around her, diagonals included, says it once', () => {
        const g = makeGame(5, 0); carrion(g);
        assert.equal(stepTo(g, 5, 2), 0, 'two tiles off: not touching, no line');
        assert.equal(walk(g, AROUND), 1);
    });

    test('a diagonal step does not re-arm the line', () => {
        const g = makeGame(5, 0); carrion(g);
        assert.equal(stepTo(g, 5, 3), 1);
        assert.equal(stepTo(g, 6, 3), 0, 'diagonal: still touching');
        assert.equal(stepTo(g, 5, 3), 0, 'back to the straight step: no second line');
    });

    test('walking away until you are not touching her, then back, says it once more', () => {
        const g = makeGame(5, 0); carrion(g);
        assert.equal(stepTo(g, 5, 3), 1);
        assert.equal(stepTo(g, 5, 2), 0, 'two tiles off: re-armed, silent');
        assert.equal(stepTo(g, 5, 3), 1, 'back up to her: once more');
    });

    test('leaving from a diagonal re-arms once you are two tiles off', () => {
        const g = makeGame(5, 0); carrion(g);
        assert.equal(stepTo(g, 6, 4), 1);
        assert.equal(stepTo(g, 7, 3), 0, 'two tiles off: clear of her');
        assert.equal(stepTo(g, 6, 4), 1);
    });

    test('arriving on a diagonal first says nothing until you are straight on', () => {
        const g = makeGame(5, 0); carrion(g);
        assert.equal(stepTo(g, 6, 3), 0, 'a diagonal is not the firing step');
        assert.equal(stepTo(g, 6, 4), 1);
    });
});
