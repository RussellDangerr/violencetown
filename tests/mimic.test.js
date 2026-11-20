// mimic.test.js — the Carnival's chest at (54,16) is a Mimic (plans/mm1-carnival-mimic.md).
//
// Asleep it is a chest: no sight, no fight, no name or target, drawn as the closed-chest cell, and
// a walk past starts nothing. A bump wakes it for good; it draws as itself and hunts you. Saves keep
// it asleep before the bump and awake after. Every other chest is as it was.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { Enemy, spawnEnemy, resolveEnemyTurns } from '../game/enemies.js';
import { GameMap } from '../game/map.js';
import { ENTRIES, resolveSpawn, defaultPicks } from '../game/slots.js';
import { ENEMY_SPRITES, CONTAINER_SPRITES, SpriteSheet } from '../game/sprites.js';
import { fighters } from '../game/fight-area.js';
import { TILE_PX } from '../game/data.js';
import { DOCK } from '../game/layout.js';
import { computeViewport } from '../game/viewport.js';
import { Renderer } from '../game/renderer.js';
import { RNG } from '../game/rng.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const url = (p) => new URL(p, import.meta.url);
const src = readFileSync(url('../game/main.js'), 'utf8').split(String.fromCharCode(13)).join('');
const carnival = JSON.parse(readFileSync(url('../game/carnival-map.json'), 'utf8'));

const SPOT = { x: 54, y: 16 };
const mimic = () => spawnEnemy({ ...resolveSpawn({ id: 'carnival-mimic', entry: 'carnival_mimic', ...SPOT }, defaultPicks()) });

function lift(name) {
    const at = src.indexOf(`\n    ${name}(`) + 5;
    assert.ok(at > 5, `${name} not found`);
    const end = src.indexOf('\n    }\n', at);
    return src.slice(at + name.length, end + 6);
}
const liftFn = (name) => new Function(`return function ${lift(name)}`)();

function world(m) {
    const blows = [];
    const g = {
        map: new GameMap(carnival, 'carnival-map.json'), containers: [], groundItems: [], enemies: [m],
        playerX: 53, playerY: 16, playerHp: 1e6, playerMaxHp: 1e6, facing: 'right', turn: 0, _MOVE_MS: 150,
        rng: new RNG(5), gold: 0, logs: [], _log(x) { this.logs.push(x); }, hasBuff: () => false,
        _spawnHitSplat() {}, _handleEnemyDeath() {}, _cascadeMark() {},
        applyDamageToPlayer(raw) { blows.push(raw); return raw; },
    };
    return { g, blows };
}

describe('the map', () => {
    test('one spawn at (54,16), on a free floor tile with nothing else on it', () => {
        const spawns = carnival.enemies.filter((e) => e.entry === 'carnival_mimic');
        assert.equal(spawns.length, 1);
        assert.deepEqual([spawns[0].x, spawns[0].y], [SPOT.x, SPOT.y]);
        const map = new GameMap(carnival, 'carnival-map.json');
        assert.ok(map.isWalkable(SPOT.x, SPOT.y));
        assert.equal(carnival.enemies.filter((e) => e.x === SPOT.x && e.y === SPOT.y).length, 1);
        assert.ok(!(carnival.props || []).some((p) => p.x === SPOT.x && p.y === SPOT.y));
        assert.ok(!(carnival.items || []).some((p) => p.x === SPOT.x && p.y === SPOT.y));
    });

    test('the Carnival has no real chest, so none sits beside it', () => {
        assert.equal(new GameMap(carnival, 'carnival-map.json').containerSpawns.length, 0);
    });
});

describe('asleep', () => {
    test('it sees nothing, is no fighter and keeps its real reach for later', () => {
        const m = mimic();
        assert.equal(m.disguised, true);
        assert.equal(m.sightRange, 0);
        assert.ok(m.wakeSight > 0);
        assert.deepEqual(fighters([m]), []);
    });

    test('walking past it for many beats starts nothing', () => {
        const m = mimic();
        const { g, blows } = world(m);
        for (let i = 0; i < 12; i++) { g.turn++; resolveEnemyTurns(g, g.rng); }
        assert.deepEqual(blows, []);
        assert.equal(m.state, 'idle');
        assert.deepEqual([m.x, m.y], [SPOT.x, SPOT.y]);
        assert.equal(m.disguised, true);
    });

    test('_targetAt gives it no target: no name, panel or verb', () => {
        const g = { enemies: [mimic()], groundItems: [], containers: [], examinables: [], map: { getTile: () => 0 } };
        assert.equal(liftFn('_targetAt').call(g, SPOT.x, SPOT.y), null);
    });

    test('an awake enemy is still a target, and a real chest still is one', () => {
        const m = mimic(); m.wakeDisguise(0, 0);
        const chest = { id: 'c', type: 'chest', x: 3, y: 3, contents: ['rock'] };
        const g = { enemies: [m], groundItems: [], containers: [chest], examinables: [], map: { getTile: () => 0 } };
        const targetAt = liftFn('_targetAt');
        assert.equal(targetAt.call(g, SPOT.x, SPOT.y).npc, m);
        assert.equal(targetAt.call(g, 3, 3).container, chest);
    });
});

describe('the bump', () => {
    test('main.js wakes a disguised enemy before the shove, and the chest branch is untouched', () => {
        const wake = src.indexOf('if (enemy && enemy.disguised) { this._wakeMimic?.(enemy); return; }');
        assert.ok(wake > 0);
        assert.ok(wake < src.indexOf('this._shoveNpc(enemy, dir)', wake));
        assert.ok(src.includes('const container = this.containers.find(c => c.x === nx && c.y === ny);\n        if (container) {\n            this._openContainer(container);'));
    });

    test('its lines are plain, and a sleeping one says nothing', () => {
        const m = mimic();
        assert.equal(m.entity.name, 'Mimic');
        const lines = [...m.barks, m.adjacencyBark, liftFn('_wakeMimic').toString().match(/_log\('([^']*)'/)[1]];
        for (const l of lines) assert.ok(l && !/[\[\]]/.test(l), `plain line: ${l}`);
        const g = { playerX: SPOT.x - 1, playerY: SPOT.y, enemies: [m], groundItems: [], containers: [], map: { getTile: () => 0 }, worldTick: 1, rng: new RNG(1) };
        const said = resolveEnemyTurns(g).map((x) => x.text ?? x);
        assert.ok(!said.some((t) => String(t).includes('Mimic')), 'asleep, it is silent beside you');
    });

    test('_wakeMimic wakes it for good, hunting where you stand, and takes a beat', () => {
        const m = mimic();
        const calls = [];
        const g = { playerX: 53, playerY: 16, enemies: [m], _log: (t) => calls.push(['log', t]), _render: () => calls.push(['render']), _advanceWorld: () => calls.push(['advance']) };
        const wake = liftFn('_wakeMimic');
        wake.call(g, m);
        assert.equal(m.disguised, false);
        assert.equal(m.state, 'chasing');
        assert.ok(m.sightRange > 0);
        assert.deepEqual([m._lastSeenX, m._lastSeenY], [53, 16]);
        assert.deepEqual([m.x, m.y], [SPOT.x, SPOT.y], 'it did not move');
        assert.deepEqual(fighters([m]), [m], 'it is a fighter now');
        assert.ok(calls.some((c) => c[0] === 'advance'));
        calls.length = 0;
        wake.call(g, m);   // a second bump wakes nothing more
        assert.deepEqual(calls, []);
    });

    test('once awake, it hits you', () => {
        const m = mimic(); m.wakeDisguise(53, 16);
        const { g, blows } = world(m);
        for (let i = 0; i < 6; i++) { g.turn++; resolveEnemyTurns(g, g.rng); }
        assert.ok(blows.length > 0, 'it fought');
    });
});

describe('saves', () => {
    const roundTrip = (e) => Enemy.fromSave(JSON.parse(JSON.stringify(e.toSave())));

    test('saved before the bump, it is still asleep', () => {
        const m = mimic(); const reach = m.wakeSight;
        const back = roundTrip(m);
        assert.equal(back.disguised, true);
        assert.equal(back.sightRange, 0);
        assert.equal(back.wakeSight, reach);
        back.wakeDisguise(1, 1);   // and it still wakes into the same reach
        assert.equal(back.sightRange, reach);
    });

    test('saved after the bump, it is still awake', () => {
        const m = mimic(); const reach = m.wakeSight; m.wakeDisguise(53, 16);
        const back = roundTrip(m);
        assert.equal(back.disguised, false);
        assert.equal(back.sightRange, reach);
        assert.equal(back.state, 'chasing');
        assert.equal(back.allegiance, 'hostile');
    });

    test('no other enemy saves a disguise field', () => {
        const clown = new Enemy({ id: 'c', type: 'Carnival Clown', x: 1, y: 1 });
        const s = JSON.parse(JSON.stringify(clown.toSave()));
        assert.ok(!('disguised' in s) && !('wakeSight' in s));
        assert.deepEqual(Object.keys(ENTRIES).filter((k) => ENTRIES[k].disguised), ['carnival_mimic']);
    });
});

// ── The real renderer ───────────────────────────────────────────────────────
const VP = computeViewport({ cssW: 3440, cssH: 1440, dpr: 1, dock: DOCK });

function draw(e) {
    const cells = [], fills = [], texts = [];
    const state = { globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: null, strokeStyle: null, filter: 'none' };
    const ctx = new Proxy(state, {
        get(t, k) {
            if (k in t) return t[k];
            if (k === 'fillRect') return (...a) => fills.push(a);
            if (k === 'createImageData') return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
            return () => (/Gradient/.test(k) ? { addColorStop() {} } : undefined);
        },
        set(t, k, v) { t[k] = v; return true; },
    });
    const rec = (c, col, row) => { cells.push({ col, row }); return true; };
    const r = Object.assign(Object.create(Renderer.prototype), {
        ctx, canvas: { width: VP.backingW, height: VP.backingH }, viewport: VP,
        sprites: { tinyDungeon: { loaded: true, drawFrame: rec, drawFrameInk: rec, drawGhost: SpriteSheet.prototype.drawGhost } },
        font: { drawText(c, t) { texts.push(t); }, measure: (t) => String(t).length * 6 },
        _scrollX: 0, _scrollY: 0, _fightFace: true, _hudFor: null, _hudFaceFor: null, _hudCache: null,
    });
    const g = {
        playerX: 53, playerY: 16, facing: 'right', turn: 1, wheel: null, _idleTick: 0, _animating: false,
        _fightOn: false, _inCombat: () => false, _damageNumbers: [],
        equipment: { weapon: null, top: null, bottom: null, front: null, back: null, sides: null },
        enemies: [e], containers: [], groundItems: [], _targetAt: () => null,
        map: { width: 60, height: 30, isWalkable: () => true },
    };
    r._drawEnemySprite(g, e, VP.origin.x + TILE_PX, VP.origin.y, 150);
    return { cells, fills, texts };
}

describe('the drawing', () => {
    test('asleep it draws as the closed chest, once, with no bar, label or pips', () => {
        const { cells, fills, texts } = draw(mimic());
        assert.deepEqual(cells, [{ col: CONTAINER_SPRITES.closed.col, row: CONTAINER_SPRITES.closed.row }]);
        assert.deepEqual(fills, []);
        assert.deepEqual(texts, []);
    });

    test('awake it draws as itself: its own cell, not the chest', () => {
        const m = mimic(); m.wakeDisguise(53, 16);
        const { cells } = draw(m);
        assert.deepEqual(cells[0], { col: ENEMY_SPRITES.Mimic.col, row: ENEMY_SPRITES.Mimic.row });
        assert.notDeepEqual([ENEMY_SPRITES.Mimic.col, ENEMY_SPRITES.Mimic.row], [CONTAINER_SPRITES.closed.col, CONTAINER_SPRITES.closed.row]);
    });
});
