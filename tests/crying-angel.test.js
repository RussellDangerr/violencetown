// crying-angel.test.js — the Graveyard's angel comes closer only while you look at it
// (plans/ca1-crying-angel.md).
//
// It acts on the player's action. Looked at, it steps one tile closer, or hits once beside you.
// Not looked at, it does nothing at all, even beside you. "Looked at" is perception.js's own
// question asked of the player, so a wall between you counts as not looking. A blow from you
// counts as looking for that beat. It is never in a fight and draws no dice.
//
// These drive REAL enemy turns (resolveEnemyTurns) on the real Graveyard map, with the player's
// facing set the way the game sets it: 'up' | 'down' | 'left' | 'right'.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { GameMap } from '../game/map.js';
import { Enemy, spawnEnemy, resolveEnemyTurns } from '../game/enemies.js';
import { resolveSpawn, defaultPicks, ENTRIES } from '../game/slots.js';
import { RNG } from '../game/rng.js';
import { struck, emitNoise, NOISE } from '../game/perception.js';
import { fighters, joiners } from '../game/fight-area.js';
import { isAngel, ANGEL_TAG } from '../game/ai.js';
import { isLookedAt } from '../game/npc.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const GAME = new URL('../game/', import.meta.url);
const graveyard = JSON.parse(readFileSync(new URL('graveyard-map.json', GAME), 'utf8'));
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

// The Graveyard's map, with extra solid props so a tile can be walled off.
function mapWith(blockers = []) {
    const data = structuredClone(graveyard);
    data.props = [...(data.props || []), ...blockers.map(([x, y]) => ({ x, y, type: 'test_block' }))];
    return new GameMap(data, 'graveyard-map.json');
}

function angelAt(x, y) {
    return spawnEnemy({ ...resolveSpawn({ id: 'angel', entry: 'crying_angel', x, y }, defaultPicks()), facing: 'S' });
}

// A world with the player at `player` facing `facing`, the angel at `angel`. One beat is the
// player's committed action followed by the enemies' turn; changing `g.facing` alone is the
// free pivot and runs no beat.
function scene({ player, angel, facing, blockers = [], others = [] }) {
    const map = mapWith(blockers);
    const blows = [];
    const g = {
        map, containers: [], groundItems: [],
        playerX: player.x, playerY: player.y, playerHp: 1e6, playerMaxHp: 1e6, facing,
        turn: 0, _MOVE_MS: 150, rng: new RNG(5), gold: 0, logs: [],
        _log(m) { this.logs.push(m); },
        hasBuff: () => false,
        _spawnHitSplat() {}, _handleEnemyDeath() {}, _cascadeMark() {},
        applyDamageToPlayer(raw, who) { blows.push({ id: who.id, raw, turn: this.turn }); return raw; },
    };
    const a = angelAt(angel.x, angel.y);
    g.angel = a;
    g.enemies = [a, ...others];
    g.beat = () => {
        g.turn++;
        const before = { x: a.x, y: a.y };
        const hits = blows.length;
        resolveEnemyTurns(g);
        const hit = blows.length > hits;
        return hit ? 'hit' : ((before.x !== a.x || before.y !== a.y) ? 'step' : 'still');
    };
    g.blows = blows;
    g.dist = () => cheb(a, { x: g.playerX, y: g.playerY });
    return g;
}

const P = { x: 21, y: 16 };      // six tiles south of the angel's spot, on open ground in a clear column
const A = { x: 21, y: 10 };

describe('the Graveyard holds one angel at (21,10)', () => {
    test('exactly one spawn names the entry, at (21,10), on open ground', () => {
        const spawns = graveyard.enemies.filter(e => e.entry === 'crying_angel');
        assert.equal(spawns.length, 1);
        assert.equal(spawns[0].x, 21);
        assert.equal(spawns[0].y, 10);
        const map = new GameMap(graveyard, 'graveyard-map.json');
        assert.ok(map.isWalkable(21, 10));
        assert.ok(map.enemySpawns.some(s => s.id === spawns[0].id));
    });

    test('only that entry carries the angel flag', () => {
        const flagged = Object.entries(ENTRIES).filter(([, e]) => e.tag === ANGEL_TAG).map(([k]) => k);
        assert.deepEqual(flagged, ['crying_angel']);
        assert.ok(isAngel(angelAt(21, 10)));
        assert.ok(!isAngel(spawnEnemy({ id: 's', type: 'Rattling Skeleton', x: 1, y: 1 })));
    });

    test('it spawns hostile, in the idle state, with no sight of its own', () => {
        const a = angelAt(21, 10);
        assert.equal(a.allegiance, 'hostile');
        assert.equal(a.state, 'idle');
        assert.equal(a.sightRange, 0);
    });

    test('its tag and sight survive a save and a load', () => {
        const back = Enemy.fromSave(angelAt(21, 10).toSave());
        assert.ok(isAngel(back));
        assert.equal(back.sightRange, 0);
    });
});

describe('looked at: it comes one tile closer on every action', () => {
    test('facing it from six tiles, three beats leave it three tiles closer', () => {
        const g = scene({ player: P, angel: A, facing: 'up' });
        assert.equal(g.dist(), 6);
        for (let want = 5; want >= 3; want--) {
            assert.equal(g.beat(), 'step');
            assert.equal(g.dist(), want);
        }
        assert.deepEqual([g.angel.x, g.angel.y], [21, 13]);
        assert.equal(g.blows.length, 0);
    });

    test('it never closes by more than a tile in a beat, and never enters your tile', () => {
        const g = scene({ player: P, angel: A, facing: 'up' });
        let prev = g.dist();
        for (let i = 0; i < 10; i++) {
            g.beat();
            assert.ok(prev - g.dist() <= 1, 'jumped');
            assert.ok(!(g.angel.x === P.x && g.angel.y === P.y), 'on the player');
            prev = g.dist();
        }
        assert.equal(g.dist(), 1);
    });

    test('once beside you it hits for the stand-in 12, on every beat, and stays put', () => {
        const g = scene({ player: P, angel: { x: 21, y: 15 }, facing: 'up' });
        for (let i = 0; i < 4; i++) assert.equal(g.beat(), 'hit');
        assert.deepEqual([g.angel.x, g.angel.y], [21, 15]);
        assert.ok(g.blows.every(b => b.raw === 12 && b.id === 'angel'));
    });

    test('on the cone\'s diagonal front tile it is still looked at', () => {
        const g = scene({ player: P, angel: { x: 25, y: 12 }, facing: 'up' });   // 45 degrees off
        assert.ok(isLookedAt(g, g.angel));
        assert.equal(g.beat(), 'step');
    });

    test('it is held out to eight tiles and no further', () => {
        const near = scene({ player: { x: 21, y: 18 }, angel: A, facing: 'up' });   // 8 away
        assert.equal(near.dist(), 8);
        assert.equal(near.beat(), 'step');
        const far = scene({ player: { x: 21, y: 19 }, angel: A, facing: 'up' });    // 9 away
        assert.equal(far.dist(), 9);
        for (let i = 0; i < 4; i++) assert.equal(far.beat(), 'still');
        assert.deepEqual([far.angel.x, far.angel.y], [21, 10]);
    });
});

describe('not looked at: it does nothing at all', () => {
    test('facing away, six beats leave it exactly where it was', () => {
        const g = scene({ player: P, angel: A, facing: 'down' });
        for (let i = 0; i < 6; i++) assert.equal(g.beat(), 'still');
        assert.deepEqual([g.angel.x, g.angel.y], [21, 10]);
        assert.equal(g.blows.length, 0);
    });

    test('facing away from it even beside you: no blow, no step, on any beat', () => {
        const g = scene({ player: P, angel: { x: 21, y: 15 }, facing: 'down' });
        for (let i = 0; i < 6; i++) assert.equal(g.beat(), 'still');
        assert.equal(g.blows.length, 0);
        assert.deepEqual([g.angel.x, g.angel.y], [21, 15]);
    });

    test('to your side (the periphery) is not looking', () => {
        const left = scene({ player: P, angel: { x: 21, y: 15 }, facing: 'left' });
        const right = scene({ player: P, angel: { x: 21, y: 15 }, facing: 'right' });
        for (const g of [left, right]) {
            assert.ok(!isLookedAt(g, g.angel));
            for (let i = 0; i < 3; i++) assert.equal(g.beat(), 'still');
        }
    });

    test('a wall between you counts as not looking, even facing it in range', () => {
        const g = scene({ player: P, angel: A, facing: 'up', blockers: [[21, 12]] });
        assert.ok(!g.map.isWalkable(21, 12));
        assert.ok(!isLookedAt(g, g.angel));
        for (let i = 0; i < 4; i++) assert.equal(g.beat(), 'still');
        assert.deepEqual([g.angel.x, g.angel.y], [21, 10]);
        assert.equal(g.blows.length, 0);
    });

    test('while it is looked at it is never "still", and the moment you look away it is', () => {
        const g = scene({ player: P, angel: A, facing: 'up' });
        assert.equal(g.beat(), 'step');
        g.facing = 'down';
        assert.equal(g.beat(), 'still');
        g.facing = 'up';
        assert.equal(g.beat(), 'step');
    });
});

describe('turning in place never moves it', () => {
    test('turning back and forth with no committed action leaves it where it was', () => {
        const g = scene({ player: P, angel: A, facing: 'up' });
        for (const f of ['left', 'down', 'right', 'up', 'down', 'up']) g.facing = f;   // pivots only
        assert.deepEqual([g.angel.x, g.angel.y], [21, 10]);
        assert.equal(g.turn, 0);
        assert.equal(g.blows.length, 0);
    });

    test('you can always look away: from beside it, one pivot and the next beat does nothing', () => {
        const g = scene({ player: P, angel: { x: 21, y: 15 }, facing: 'up' });
        assert.equal(g.beat(), 'hit');
        g.facing = 'down';
        assert.equal(g.beat(), 'still');
        assert.equal(g.blows.length, 1);
    });
});

describe('a blow from you counts as looking for that beat', () => {
    test('struck while you face away: it acts that beat, then goes back to nothing', () => {
        const g = scene({ player: P, angel: A, facing: 'down' });
        struck(g.angel, { x: P.x, y: P.y });          // what a blow stamps on a hostile
        assert.equal(g.beat(), 'step');
        assert.equal(g.beat(), 'still');
        assert.equal(g.beat(), 'still');
    });

    test('struck beside you, facing away: it hits that beat only', () => {
        const g = scene({ player: P, angel: { x: 21, y: 15 }, facing: 'down' });
        struck(g.angel, { x: P.x, y: P.y });
        assert.equal(g.beat(), 'hit');
        assert.equal(g.beat(), 'still');
        assert.equal(g.blows.length, 1);
    });

    test('a blow leaves no mark behind: not suspicious, not chasing, nothing pending', () => {
        const g = scene({ player: P, angel: { x: 21, y: 15 }, facing: 'down' });
        struck(g.angel, { x: P.x, y: P.y });
        assert.deepEqual(g.angel._struckBy, { x: P.x, y: P.y });
        g.beat();
        assert.equal(g.angel.state, 'idle');
        assert.equal(g.angel._struckBy, null);
    });
});

describe('it never starts or holds a fight, and a fight does not pull it in', () => {
    test('stepping closer and hitting leaves it idle and out of fighters()', () => {
        const g = scene({ player: P, angel: A, facing: 'up' });
        for (let i = 0; i < 9; i++) {
            g.beat();
            assert.equal(g.angel.state, 'idle');
            assert.deepEqual(fighters(g.enemies), [], `beat ${i + 1}`);
        }
        assert.ok(g.blows.length > 0, 'the run never reached a blow');
    });

    test('with another fight on, and you looking right at it, it is not pulled into chasing', () => {
        const skel = spawnEnemy({
            id: 'skel', type: 'Rattling Skeleton', x: 21, y: 18, hp: 100, armor: 0, damage: 12,
            gold: 4, loadout: ['rock'], facing: 'N', sightRange: 6,
        });
        skel.state = 'chasing';
        const g = scene({ player: P, angel: A, facing: 'up', others: [skel] });
        const fs = fighters(g.enemies);
        assert.deepEqual(fs.map(f => f.id), ['skel']);              // a fight is on, without the angel
        assert.deepEqual(joiners(g.map, g.enemies, fs, { x: P.x, y: P.y }).map(n => n.id), []);
        for (let i = 0; i < 3; i++) g.beat();
        assert.equal(g.angel.state, 'idle');
        assert.deepEqual(fighters(g.enemies).map(f => f.id), ['skel']);
    });

    test('a noise that makes an idle hostile suspicious does not leave it so', () => {
        const g = scene({ player: P, angel: A, facing: 'down' });
        emitNoise(g.enemies, P.x, P.y, NOISE.melee);
        g.beat();
        assert.equal(g.angel.state, 'idle');
        assert.deepEqual(fighters(g.enemies), []);
    });

    test('a hurt angel does not reach for its kit, and its kit stays on it', () => {
        const g = scene({ player: P, angel: { x: 21, y: 15 }, facing: 'down' });
        const kit = [...g.angel.loadout];
        g.angel.entity.hp = 10;
        for (let i = 0; i < 4; i++) g.beat();
        assert.deepEqual(g.angel.loadout, kit);
        assert.equal(g.angel.entity.hp, 10);
    });
});

describe('it draws nothing from game.rng', () => {
    test('the generator state is identical after a full approach and a run of blows', () => {
        const g = scene({ player: P, angel: A, facing: 'up' });
        const before = g.rng._s;
        for (let i = 0; i < 14; i++) g.beat();
        assert.ok(g.blows.length > 0);
        assert.equal(g.rng._s, before, 'the angel advanced the generator');
    });

    test('and the same start replays the same approach', () => {
        const run = () => {
            const g = scene({ player: P, angel: A, facing: 'up' });
            const out = [];
            for (let i = 0; i < 10; i++) { out.push(g.beat(), g.angel.x, g.angel.y); if (i === 3) g.facing = 'down'; if (i === 6) g.facing = 'up'; }
            return JSON.stringify(out);
        };
        assert.equal(run(), run());
    });
});
