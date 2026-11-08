// ruffian.test.js — Downtown's mugger (plans/bs1-ruffian-steals-gold.md).
//
// Next to you he takes gold instead of hitting you, then runs. Boxed in, he is
// caught. The gold only ever moves through transferGold, so your loss is
// exactly his gain, and running never burns it.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Enemy, spawnEnemy } from '../game/enemies.js';
import { tickNpcState, isMugger, mug, MUG_GP } from '../game/npc.js';
import { transferGold } from '../game/trade.js';
import { coinTake } from '../game/theft.js';
import { fighters } from '../game/fight-area.js';
import { ENEMY_SPRITES } from '../game/sprites.js';
import { chebyshev } from '../game/utils.js';

const ROOM = Array.from({ length: 11 }, () => '.'.repeat(21));

function makeGame(rows = ROOM, { gold = 50 } = {}) {
    const H = rows.length, W = rows[0].length;
    return {
        playerX: 10, playerY: 5, gold,
        enemies: [], containers: [], groundItems: [], turn: 0, _MOVE_MS: 150,
        map: {
            isWalkable: (x, y) => x >= 0 && y >= 0 && x < W && y < H && rows[y][x] !== '#',
            getRegion: () => null,
        },
        rng: { pick: (a) => a[0], float: () => 0.5, next: () => 0.5 },
        damageTaken: 0,
        applyDamageToPlayer(d) { this.damageTaken += d; },
    };
}

// The Downtown spawn's own numbers, standing just west of the player and
// facing him.
function ruffianAt(g, x, y, over = {}) {
    const e = new Enemy({
        id: 'dt-ruffian', type: 'Ruffian', tag: 'mugger', x, y, facing: 'E',
        hp: 100, armor: 3, damage: 9, gold: 8,
        loadout: ['hot_dog', 'foil_hat', 'latex_gloves', 'cardboard_cuirass', 'soap'],
        ...over,
    });
    g.enemies.push(e);
    return e;
}

const purse = (g, e) => g.gold + e.gold;

describe('the mugging', () => {
    test('next to you he takes gold instead of dealing damage', () => {
        const g = makeGame();
        const r = ruffianAt(g, 9, 5);
        const before = purse(g, r);
        tickNpcState(g, r, 1);
        assert.equal(g.damageTaken, 0, 'no blow landed');
        assert.equal(g.gold, 50 - MUG_GP, 'you lost the take');
        assert.equal(r.gold, 8 + MUG_GP, 'and he carries it');
        assert.equal(purse(g, r), before, 'conserved: nothing minted, nothing burned');
    });

    test('the log line is a placeholder', () => {
        const g = makeGame();
        const r = ruffianAt(g, 9, 5);
        const msgs = tickNpcState(g, r, 1);
        assert.ok(msgs.some(m => m.text === '[TEXT]' && m.sourceEnemy === r));
    });

    test('he takes no more than you have', () => {
        const g = makeGame(ROOM, { gold: 3 });
        const r = ruffianAt(g, 9, 5);
        tickNpcState(g, r, 1);
        assert.equal(g.gold, 0);
        assert.equal(r.gold, 11);
        assert.equal(r._tookGold, 3);
    });

    test('with an empty purse there is nothing to take, so he swings', () => {
        const g = makeGame(ROOM, { gold: 0 });
        const r = ruffianAt(g, 9, 5);
        tickNpcState(g, r, 1);
        assert.equal(g.damageTaken, 9, 'an ordinary attack');
        assert.equal(r.gold, 8, 'his purse is untouched');
        assert.ok(!(r._tookGold > 0), 'and he is not yet on the run');
    });

    test('he mugs once: adjacent again, he neither takes more nor hits', () => {
        const g = makeGame(['#####', '#...#', '#####']);   // a corridor he cannot leave
        g.playerX = 2; g.playerY = 1;
        const r = ruffianAt(g, 1, 1);
        tickNpcState(g, r, 1);
        const after = g.gold;
        for (let t = 2; t < 6; t++) tickNpcState(g, r, t);
        assert.equal(g.gold, after, 'no second take');
        assert.equal(g.damageTaken, 0, 'no blows either');
    });

    test('only a mugger mugs', () => {
        const g = makeGame();
        const e = ruffianAt(g, 9, 5, { tag: null, type: 'Rat' });
        assert.equal(isMugger(e), false);
        assert.equal(mug(g, e), null);
        tickNpcState(g, e, 1);
        assert.equal(g.gold, 50);
        assert.equal(g.damageTaken, 9);
    });
});

describe('the run', () => {
    test('after the take he runs, one flee step a turn', () => {
        const g = makeGame();
        const r = ruffianAt(g, 9, 5);
        tickNpcState(g, r, 1);                      // the take
        let d = chebyshev(r.x, r.y, g.playerX, g.playerY);
        for (let t = 2; t < 5; t++) {
            tickNpcState(g, r, t);
            const nd = chebyshev(r.x, r.y, g.playerX, g.playerY);
            assert.equal(nd, d + 1, `turn ${t}: one step further away`);
            d = nd;
        }
        assert.equal(g.damageTaken, 0);
    });

    test('in reach he stays in the fight; out of reach he drops out of it', () => {
        const g = makeGame();
        const r = ruffianAt(g, 9, 5, { sightRange: 3 });
        tickNpcState(g, r, 1);
        tickNpcState(g, r, 2);
        assert.ok(fighters(g.enemies).includes(r), 'running from you is still the fight');
        for (let t = 3; t < 8; t++) tickNpcState(g, r, t);
        assert.ok(chebyshev(r.x, r.y, g.playerX, g.playerY) > 3);
        assert.equal(r.state, 'idle');
        assert.ok(!fighters(g.enemies).includes(r), 'out of reach, the fight is over');
        const at = { x: r.x, y: r.y };
        tickNpcState(g, r, 9);
        assert.deepEqual({ x: r.x, y: r.y }, at, 'and he stops running');
    });

    test('cornered he cannot step away, so he stands to be caught', () => {
        const rows = ['#####', '#...#', '#...#', '#####'];
        const g = makeGame(rows);
        g.playerX = 2; g.playerY = 2;
        const r = ruffianAt(g, 1, 1);               // tucked in the corner, you beside him
        tickNpcState(g, r, 1);                      // the take
        assert.equal(r._tookGold, MUG_GP);
        tickNpcState(g, r, 2);
        assert.deepEqual({ x: r.x, y: r.y }, { x: 1, y: 1 }, 'nowhere further to go');
        assert.ok(chebyshev(r.x, r.y, g.playerX, g.playerY) <= 1, 'still within your reach');
    });

    test('running never burns the stolen gold, however hurt he is', () => {
        const g = makeGame();
        const r = ruffianAt(g, 9, 5, { gold: 15, loadout: [] });
        tickNpcState(g, r, 1);                      // 25 GP: enough to buy back HP
        r.entity.hp = 20;                           // under the grunt heal floor
        const before = purse(g, r);
        for (let t = 2; t < 8; t++) tickNpcState(g, r, t);
        assert.equal(r.entity.hp, 20, 'no HP bought back');
        assert.equal(r.gold, 25, 'every coin still on him');
        assert.equal(purse(g, r), before);
    });
});

describe('getting it back', () => {
    // The two shipped paths, with the arguments main.js gives them: the death
    // loot hands over his whole purse; Thieve Coin lifts a pocket at a time.
    test('killing him: the loot is everything he carries, the take included', () => {
        const g = makeGame();
        const r = ruffianAt(g, 9, 5);
        tickNpcState(g, r, 1);
        const loot = r.gold;
        assert.ok(transferGold(r, g, loot, 'loot'));
        assert.equal(g.gold, 50 - MUG_GP + 8 + MUG_GP, 'your gold back, plus his own');
        assert.equal(r.gold, 0);
    });

    test('thieving him lifts the take back', () => {
        const g = makeGame();
        const r = ruffianAt(g, 9, 5);
        tickNpcState(g, r, 1);
        let lifted = 0;
        while (r.gold > 0) {
            const gp = coinTake(r, 5);
            assert.ok(transferGold(r, g, gp, 'theft'));
            lifted += gp;
        }
        assert.equal(lifted, 8 + MUG_GP);
        assert.equal(g.gold, 50 + 8);
    });
});

describe('the Downtown spawn', () => {
    const map = JSON.parse(readFileSync(new URL('../game/downtown-map.json', import.meta.url), 'utf8'));
    const spawn = map.enemies.find(e => e.id === 'dt-ruffian');

    test('he works the street outside the bank', () => {
        assert.ok(spawn, 'downtown has the spawn');
        const bankDoor = map.transitions.find(t => t.toMap === 'bank-map.json');
        assert.ok(chebyshev(spawn.x, spawn.y, bankDoor.x, bankDoor.y) <= 3, 'within a few tiles of the bank door');
        assert.equal(map.tiles[spawn.y * map.width + spawn.x], 11, 'standing on the sidewalk');
    });

    test('born hostile, and a mugger', () => {
        const e = spawnEnemy(spawn, new Set());
        assert.equal(e.allegiance, 'hostile');
        assert.ok(isMugger(e));
        assert.equal(e.entity.name, '[Ruffian]');
    });

    test('he wears the green-bandana goblin', () => {
        const a = ENEMY_SPRITES.Ruffian, b = ENEMY_SPRITES['Greedy Green'];
        assert.deepEqual([a.sheet, a.col, a.row], [b.sheet, b.col, b.row]);
    });
});
