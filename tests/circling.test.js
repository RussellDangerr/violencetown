// circling.test.js — a circler beside you takes turns (plans/cb1-carnival-horses-circle.md).
//
// One beat it steps to the next free tile around you, the next it hits; a pack is staggered so
// it never swings in unison. The step draws nothing from game.rng and never goes into a wall,
// a prop or another creature. Anything that is not a circler behaves exactly as it did.
//
// The first block pins the pure step (ai.js). The rest drive REAL enemy turns: resolveEnemyTurns
// on a real Carnival map, the same turn resolution the game runs.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { GameMap } from '../game/map.js';
import { spawnEnemy, resolveEnemyTurns } from '../game/enemies.js';
import { resolveSpawn, defaultPicks } from '../game/slots.js';
import { FACING_VECTORS } from '../game/perception.js';
import { RNG } from '../game/rng.js';
import { isCircler, circlePhase, circlesThisBeat, circleStep, RING } from '../game/ai.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const GAME = new URL('../game/', import.meta.url);
const carnival = JSON.parse(readFileSync(new URL('carnival-map.json', GAME), 'utf8'));
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

// ── the pure step ──────────────────────────────────────────────────────────

describe('circleStep: the next free tile clockwise, one step away', () => {
    const centre = { x: 10, y: 10 };
    const open = () => true;

    test('the ring is the eight tiles around, clockwise, each an orthogonal step from the next', () => {
        assert.equal(RING.length, 8);
        assert.equal(new Set(RING.map(r => r.join())).size, 8);
        for (let i = 0; i < 8; i++) {
            const a = RING[i], b = RING[(i + 1) % 8];
            assert.equal(Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]), 1, `ring ${i} to ${(i + 1) % 8}`);
        }
    });

    test('from each ring tile it steps to the next one clockwise', () => {
        for (let i = 0; i < 8; i++) {
            const from = { x: centre.x + RING[i][0], y: centre.y + RING[i][1] };
            const want = RING[(i + 1) % 8];
            assert.deepEqual(circleStep(centre, from, open), { x: centre.x + want[0], y: centre.y + want[1] });
        }
    });

    test('a blocked next tile is skipped for the next free one that is still a single step', () => {
        const from = { x: 10, y: 9 };                         // north of centre
        const blocked = new Set(['11,9']);                    // the north-east tile
        const to = circleStep(centre, from, (fx, fy, tx, ty) => !blocked.has(`${tx},${ty}`));
        assert.deepEqual(to, { x: 11, y: 10 });               // east: diagonal from north, one step
    });

    test('with nothing free in reach it returns null, and so does a creature not beside the centre', () => {
        assert.equal(circleStep(centre, { x: 10, y: 9 }, () => false), null);
        assert.equal(circleStep(centre, { x: 14, y: 14 }, open), null);
        assert.equal(circleStep(centre, { x: 10, y: 10 }, open), null);   // on the centre itself
    });

    test('it never offers a tile more than one step away', () => {
        for (let i = 0; i < 8; i++) {
            const from = { x: centre.x + RING[i][0], y: centre.y + RING[i][1] };
            const to = circleStep(centre, from, open);
            assert.equal(cheb(from, to), 1);
            assert.equal(cheb(centre, to), 1);
        }
    });
});

describe('the beat: who steps and who hits', () => {
    test('a creature steps on every other turn', () => {
        for (const id of ['a', 'carnival-horse-1', 'carnival-horse-2']) {
            const steps = [0, 1, 2, 3, 4, 5].map(t => circlesThisBeat(id, t));
            for (let i = 1; i < steps.length; i++) assert.notEqual(steps[i], steps[i - 1], `${id} at ${i}`);
        }
    });

    test('three ids numbered in a row never all step, or all hit, on the same turn', () => {
        const ids = ['carnival-horse-1', 'carnival-horse-2', 'carnival-horse-3'];
        assert.notEqual(new Set(ids.map(circlePhase)).size, 1);
        for (let t = 0; t < 8; t++) {
            const stepping = ids.filter(id => circlesThisBeat(id, t)).length;
            assert.ok(stepping >= 1 && stepping <= 2, `turn ${t}: ${stepping} stepping`);
        }
    });

    test('it is a function of id and turn alone', () => {
        assert.equal(circlesThisBeat('x', 7), circlesThisBeat('x', 7));
        assert.equal(circlePhase('carnival-horse-1'), circlePhase('carnival-horse-1'));
    });
});

// ── real enemy turns ───────────────────────────────────────────────────────

// The Carnival's map with extra solid props, so a tile can be walled off.
function mapWith(blockers = []) {
    const data = structuredClone(carnival);
    data.props = [...(data.props || []), ...blockers.map(([x, y]) => ({ x, y, type: 'test_block' }))];
    return new GameMap(data, 'carnival-map.json');
}

function facingToward(from, to) {
    const dx = Math.sign(to.x - from.x), dy = Math.sign(to.y - from.y);
    return Object.entries(FACING_VECTORS).find(([, v]) => v[0] === dx && v[1] === dy)?.[0] ?? 'S';
}

function horse(id, x, y, player, entry = 'carnival_horse') {
    return spawnEnemy({ ...resolveSpawn({ id, entry, x, y }, defaultPicks()), facing: facingToward({ x, y }, player) });
}

function scene({ player, horses, blockers = [], others = [], turn = 0 }) {
    const map = mapWith(blockers);
    const blows = [];
    const g = {
        map, containers: [], groundItems: [],
        playerX: player.x, playerY: player.y, playerHp: 1e6, playerMaxHp: 1e6,
        turn, _MOVE_MS: 150, rng: new RNG(11), gold: 0, logs: [],
        _log(m) { this.logs.push(m); },
        hasBuff: () => false,
        _spawnHitSplat() {}, _handleEnemyDeath() {}, _cascadeMark() {},
        applyDamageToPlayer(raw, who) { blows.push({ id: who.id, raw, turn: this.turn }); return raw; },
    };
    g.enemies = [...horses.map(h => horse(h.id, h.x, h.y, player, h.entry)), ...others];
    // One beat = the player's action, then the enemies' turn.
    g.beat = () => {
        g.turn++;
        const before = new Map(g.enemies.map(e => [e.id, `${e.x},${e.y}`]));
        const hitsBefore = blows.length;
        resolveEnemyTurns(g);
        const hit = new Set(blows.slice(hitsBefore).map(b => b.id));
        const out = {};
        for (const e of g.enemies) out[e.id] = hit.has(e.id) ? 'hit' : (before.get(e.id) !== `${e.x},${e.y}` ? 'step' : 'still');
        return out;
    };
    g.blows = blows;
    return g;
}

const at = (g, id) => g.enemies.find(e => e.id === id);

describe('a horse beside you takes turns, stepping then hitting', () => {
    const player = { x: 28, y: 4 };

    test('over eight beats each horse alternates a step and a blow, in the same direction round you', () => {
        const g = scene({ player, horses: [{ id: 'h1', x: 27, y: 3 }] });
        const acts = [], tiles = [];
        for (let i = 0; i < 8; i++) { acts.push(g.beat().h1); tiles.push({ x: at(g, 'h1').x, y: at(g, 'h1').y }); }
        for (let i = 1; i < acts.length; i++) assert.notEqual(acts[i], acts[i - 1], `beats ${i - 1},${i}: ${acts}`);
        assert.deepEqual(new Set(acts), new Set(['step', 'hit']));
        // Always beside the player, one step at a time, going the same way round.
        let prev = { x: 27, y: 3 };
        for (const t of tiles) {
            assert.equal(cheb(t, player), 1, 'left the ring');
            assert.ok(cheb(t, prev) <= 1, 'jumped');
            prev = t;
        }
        const idx = tiles.map(t => RING.findIndex(r => player.x + r[0] === t.x && player.y + r[1] === t.y));
        const moved = idx.filter((v, i) => i === 0 || v !== idx[i - 1]);
        for (let i = 1; i < moved.length; i++) assert.equal(moved[i], (moved[i - 1] + 1) % 8, `ring ${moved}`);
    });

    test('a blow is the normal 12, and landing it moves nobody', () => {
        const g = scene({ player, horses: [{ id: 'h1', x: 27, y: 3 }] });
        for (let i = 0; i < 6; i++) {
            const before = { x: at(g, 'h1').x, y: at(g, 'h1').y };
            const act = g.beat().h1;
            if (act === 'hit') assert.deepEqual({ x: at(g, 'h1').x, y: at(g, 'h1').y }, before);
        }
        assert.ok(g.blows.length >= 3);
        assert.ok(g.blows.every(b => b.raw === 12));
    });

    test('the three real spawns around (28,4): staggered, never all swinging together, never sharing a tile', () => {
        const spawns = carnival.enemies.filter(e => e.entry === 'carnival_horse');
        assert.equal(spawns.length, 3);
        const g = scene({ player, horses: spawns.map(s => ({ id: s.id, x: s.x, y: s.y })) });
        const log = [];
        for (let i = 0; i < 12; i++) {
            const acts = g.beat();
            log.push(acts);
            const hits = Object.values(acts).filter(a => a === 'hit').length;
            assert.ok(hits < 3, `beat ${i + 1}: all three swung together (${JSON.stringify(acts)})`);
            const tiles = g.enemies.map(e => `${e.x},${e.y}`);
            assert.equal(new Set(tiles).size, 3, `beat ${i + 1}: two on one tile ${tiles}`);
            for (const e of g.enemies) {
                assert.equal(cheb(e, player), 1, `${e.id} left the ring`);
                assert.ok(g.map.isWalkable(e.x, e.y), `${e.id} is in a wall`);
            }
        }
        // Every horse both stepped and hit across the run.
        for (const s of spawns) {
            const mine = log.map(l => l[s.id]);
            assert.ok(mine.includes('step') && mine.includes('hit'), `${s.id}: ${mine}`);
        }
    });

    test('a horse that has to walk up does so as any enemy does, then starts circling', () => {
        const g = scene({ player, horses: [{ id: 'h1', x: 28, y: 9 }] });
        const acts = [];
        for (let i = 0; i < 14; i++) acts.push([g.beat().h1, cheb(at(g, 'h1'), player)]);
        const firstAdjacent = acts.findIndex(([, d]) => d <= 1);
        assert.ok(firstAdjacent > 0 && firstAdjacent <= 6, `never reached you: ${JSON.stringify(acts)}`);
        const after = acts.slice(firstAdjacent + 1).map(a => a[0]);
        assert.ok(after.includes('hit') && after.includes('step'), `${after}`);
    });
});

describe('a wall or another creature is never stepped into', () => {
    const player = { x: 28, y: 4 };

    test('a walled-off next tile is skipped, never entered', () => {
        // Horse north of the player; its next tile clockwise (north-east) is a solid prop.
        const g = scene({ player, horses: [{ id: 'h1', x: 28, y: 3 }], blockers: [[29, 3]], turn: 0 });
        const seen = new Set();
        for (let i = 0; i < 12; i++) {
            g.beat();
            const h = at(g, 'h1');
            assert.ok(g.map.isWalkable(h.x, h.y), `stepped into a wall at ${h.x},${h.y}`);
            assert.notDeepEqual([h.x, h.y], [29, 3]);
            seen.add(`${h.x},${h.y}`);
        }
        assert.ok(seen.size > 1, 'never moved');
    });

    test('with no free tile around you it just hits, every beat', () => {
        // Every ring tile but the horse's own is solid.
        const ring = RING.map(([dx, dy]) => [player.x + dx, player.y + dy]);
        const blockers = ring.filter(([x, y]) => !(x === 28 && y === 3));
        const g = scene({ player, horses: [{ id: 'h1', x: 28, y: 3 }], blockers });
        const acts = [];
        for (let i = 0; i < 6; i++) acts.push(g.beat().h1);
        assert.deepEqual(acts, Array(6).fill('hit'));
        assert.deepEqual([at(g, 'h1').x, at(g, 'h1').y], [28, 3]);
    });

    test('another enemy on the next tile is not stepped into', () => {
        // A plain foe stands beside you on the horse's next tile clockwise (north-east) and,
        // being beside you, only hits: it holds the tile for the whole run.
        const foe = spawnEnemy({
            id: 'foe', type: 'Rattling Skeleton', x: 29, y: 3, hp: 100, armor: 0, damage: 12,
            gold: 4, loadout: ['rock'], facing: 'SW',
        });
        const g = scene({ player, horses: [{ id: 'h1', x: 28, y: 3 }], others: [foe] });
        let moved = 0;
        for (let i = 0; i < 12; i++) {
            const act = g.beat();
            assert.equal(act.foe, 'hit');
            if (act.h1 === 'step') moved++;
            const tiles = g.enemies.map(e => `${e.x},${e.y}`);
            assert.equal(new Set(tiles).size, 2, `beat ${i + 1}: ${tiles}`);
            assert.deepEqual([foe.x, foe.y], [29, 3]);
        }
        assert.ok(moved > 0, 'the horse never found a tile to step to');
    });

    test('the player\'s own tile is never stepped onto', () => {
        const g = scene({ player, horses: [{ id: 'h1', x: 28, y: 3 }, { id: 'h2', x: 27, y: 4 }, { id: 'h3', x: 29, y: 5 }] });
        for (let i = 0; i < 16; i++) {
            g.beat();
            for (const e of g.enemies) assert.notDeepEqual([e.x, e.y], [player.x, player.y]);
        }
    });
});

describe('circling draws nothing from game.rng', () => {
    test('the generator state is identical after many beats of circling', () => {
        const spawns = carnival.enemies.filter(e => e.entry === 'carnival_horse');
        const g = scene({ player: { x: 28, y: 4 }, horses: spawns.map(s => ({ id: s.id, x: s.x, y: s.y })) });
        const before = g.rng._s;
        let steps = 0;
        for (let i = 0; i < 20; i++) steps += Object.values(g.beat()).filter(a => a === 'step').length;
        assert.ok(steps >= 10, `only ${steps} steps`);
        assert.ok(g.blows.length >= 10, `only ${g.blows.length} blows`);
        assert.equal(g.rng._s, before, 'circling advanced the generator');
    });

    test('and the same start replays the same dance', () => {
        const run = () => {
            const spawns = carnival.enemies.filter(e => e.entry === 'carnival_horse');
            const g = scene({ player: { x: 28, y: 4 }, horses: spawns.map(s => ({ id: s.id, x: s.x, y: s.y })) });
            const out = [];
            for (let i = 0; i < 10; i++) out.push(g.beat(), g.enemies.map(e => `${e.x},${e.y}`));
            return JSON.stringify(out);
        };
        assert.equal(run(), run());
    });
});

describe('only a circler circles', () => {
    test('the flag is off unless an entry sets it: only the horse entry does', async () => {
        const { ENTRIES } = await import('../game/slots.js');
        const circlers = Object.entries(ENTRIES).filter(([, e]) => isCircler(e)).map(([k]) => k);
        assert.deepEqual(circlers, ['carnival_horse']);
        for (const file of ['carnival-map.json', 'graveyard-map.json', 'sewer-map.json', 'canyon-map.json']) {
            const d = JSON.parse(readFileSync(new URL(file, GAME), 'utf8'));
            for (const e of d.enemies || []) {
                if (e.entry === 'carnival_horse') continue;
                assert.ok(!isCircler(e), `${file}: ${e.id} circles`);
            }
        }
    });

    test('a skeleton beside you hits every beat and never steps', () => {
        const player = { x: 28, y: 4 };
        const skel = spawnEnemy({
            id: 'skel', type: 'Rattling Skeleton', x: 28, y: 3, hp: 100, armor: 0, damage: 12,
            gold: 4, loadout: ['rock'], facing: 'S',
        });
        const g = scene({ player, horses: [], others: [skel] });
        const acts = [];
        for (let i = 0; i < 8; i++) acts.push(g.beat().skel);
        assert.deepEqual(acts, Array(8).fill('hit'));
        assert.deepEqual([skel.x, skel.y], [28, 3]);
    });

    test('the Carnival lion, beside you, hits every beat', () => {
        const player = { x: 28, y: 4 };
        const g = scene({ player, horses: [{ id: 'lion', x: 28, y: 3, entry: 'carnival_lion' }] });
        const acts = [];
        for (let i = 0; i < 6; i++) acts.push(g.beat().lion);
        assert.ok(acts.every(a => a !== 'step'), `${acts}`);
    });
});
