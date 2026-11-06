// ankou.test.js — the Ankou: one skeleton with a ghost drawn around it, placed in the Graveyard
// at (8,21) (plans/ak1-ankou-graveyard.md). The ghost is a field on its sprite entry; the real
// renderer draws it behind the body on every frame of a living Ankou and for nobody else.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { Enemy, spawnEnemy, resolveEnemyTurns } from '../game/enemies.js';
import { GameMap } from '../game/map.js';
import { ENTRIES, SLOTS, resolveSpawn, defaultPicks } from '../game/slots.js';
import { ENEMY_SPRITES, SpriteSheet } from '../game/sprites.js';
import { TILE_PX } from '../game/data.js';
import { DOCK } from '../game/layout.js';
import { computeViewport } from '../game/viewport.js';
import { Renderer } from '../game/renderer.js';
import { RNG } from '../game/rng.js';
import { makeHostile } from '../game/give-action.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const url = (p) => new URL(p, import.meta.url);
const graveyard = JSON.parse(readFileSync(url('../game/graveyard-map.json'), 'utf8'));
const SPAWN = graveyard.enemies.find((e) => e.entry === 'ankou');

describe('the Ankou on the Graveyard map', () => {
    test('there is exactly one, at (8,21), placed by its entry and in no slot', () => {
        const all = graveyard.enemies.filter((e) => e.entry === 'ankou');
        assert.equal(all.length, 1);
        assert.equal(SPAWN.x, 8);
        assert.equal(SPAWN.y, 21);
        assert.equal(SPAWN.slot, undefined);
        for (const slot of Object.values(SLOTS)) {
            assert.ok(!slot.pool.some((p) => p.entry === 'ankou'), 'the Ankou is in a slot pool');
        }
    });

    test('it stands on open floor, on no other fighter or item', () => {
        const map = new GameMap(graveyard, 'graveyard-map.json');
        assert.ok(map.isWalkable(8, 21));
        for (const e of graveyard.enemies) if (e !== SPAWN) assert.ok(!(e.x === 8 && e.y === 21), `${e.id} is on it`);
        for (const i of graveyard.items || []) assert.ok(!(i.x === 8 && i.y === 21));
    });

    test('it resolves to the Ankou, named, carrying the stand-in numbers and kit', () => {
        const e = spawnEnemy({ ...resolveSpawn(SPAWN, defaultPicks()), facing: 'S' });
        assert.equal(e.type, 'Ankou');
        assert.equal(e.name, 'Ankou');
        assert.equal(e.entity.hp, 100);
        assert.equal(e.entity.armor, 3);
        assert.equal(e.damage, 10);
        assert.equal(e.gold, ENTRIES.ankou.gold);
        assert.ok(!e.boss);
        assert.ok(!e.slot);
    });

    test('it has a sprite of its own type', () => {
        assert.ok(ENEMY_SPRITES.Ankou);
        assert.equal(ENEMY_SPRITES.Ankou.sheet, 'tinyDungeon');
    });
});

describe('the Ankou fights like an ordinary hostile', () => {
    function world(e, playerX, playerY) {
        const map = new GameMap(graveyard, 'graveyard-map.json');
        const blows = [];
        const g = {
            map, enemies: [e], containers: [], groundItems: [],
            playerX, playerY, playerHp: 100, playerMaxHp: 100,
            turn: 0, _MOVE_MS: 150, rng: new RNG(7), gold: 0, logs: [],
            _log(m) { this.logs.push(m); },
            hasBuff: () => false,
            _spawnHitSplat() {}, _handleEnemyDeath() {}, _cascadeMark() {},
            applyDamageToPlayer(raw) { blows.push(raw); return raw; },
        };
        return { g, blows };
    }
    const fresh = () => spawnEnemy({ ...resolveSpawn(SPAWN, defaultPicks()), facing: 'S' });
    const dist = (e, g) => Math.max(Math.abs(e.x - g.playerX), Math.abs(e.y - g.playerY));

    test('it hunts you when it sees you: it closes the distance, then hits for 10', () => {
        const e = fresh();
        const { g, blows } = world(e, 8, 26);          // five tiles south, in sight
        const start = dist(e, g);
        for (let t = 1; t <= 12; t++) { g.turn = t; resolveEnemyTurns(g); }
        assert.ok(dist(e, g) < start, `it never closed in (${start} -> ${dist(e, g)})`);
        assert.ok(blows.length > 0, 'it never hit back');
        assert.ok(blows.every((b) => b === 10), `it landed ${blows}`);
    });

    test('it can be fought to the end: it falls at 0 HP like any enemy', () => {
        const e = fresh();
        assert.ok(e.entity.isAlive());
        e.entity.hp = 0; e.entity.alive = false;
        assert.ok(!e.entity.isAlive());
    });

    test('an Ankou made hostile still carries its purse', () => {
        const e = fresh();
        makeHostile(e);
        assert.equal(e.gold, 10);
    });
});

describe('the ghost is the Ankou\'s alone', () => {
    test('the field is on the Ankou\'s sprite entry and on no other', () => {
        assert.deepEqual(Object.keys(ENEMY_SPRITES).filter((t) => ENEMY_SPRITES[t].ghost), ['Ankou']);
        const g = ENEMY_SPRITES.Ankou.ghost;
        assert.deepEqual([g.col, g.row], [1, 10]);
        assert.ok(g.scale > 1, 'the ghost is a little larger than the skeleton');
        assert.ok(g.alpha > 0 && g.alpha < 1, 'the ghost is see-through');
    });

    test('no registry entry carries a ghost either', () => {
        assert.deepEqual(Object.keys(ENTRIES).filter((k) => 'ghost' in ENTRIES[k]), []);
    });
});

// ── The real renderer ───────────────────────────────────────────────────────
const VP = computeViewport({ cssW: 3440, cssH: 1440, dpr: 1, dock: DOCK });

function rig() {
    const state = { globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: null, strokeStyle: null, filter: 'none' };
    const cells = [], stack = [];
    const ctx = new Proxy(state, {
        get(t, k) {
            if (k in t) return t[k];
            if (k === 'save') return () => stack.push(t.globalAlpha);
            if (k === 'restore') return () => { if (stack.length) t.globalAlpha = stack.pop(); };
            if (k === 'createImageData') return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
            return () => (/Gradient/.test(k) ? { addColorStop() {} } : undefined);
        },
        set(t, k, v) { t[k] = v; return true; },
    });
    const rec = (c, col, row, x, y, w, h) => { cells.push({ col, row, x, y, w, h, alpha: state.globalAlpha }); return true; };
    // The real SpriteSheet's drawGhost wraps drawFrameInk in a save / alpha / restore; borrow it so the
    // recording sees exactly what the canvas would.
    const sheet = { loaded: true, drawFrame: rec, drawFrameInk: rec, drawGhost: SpriteSheet.prototype.drawGhost };
    const r = Object.assign(Object.create(Renderer.prototype), {
        ctx, canvas: { width: VP.backingW, height: VP.backingH }, viewport: VP,
        sprites: { tinyDungeon: sheet },
        font: { drawText() {}, measure: (t) => String(t).length * 6 },
        _scrollX: 0, _scrollY: 0, _fightFace: true, _hudFor: null, _hudFaceFor: null, _hudCache: null,
    });
    return { r, cells };
}

function draw(e, { fight = false, walking = false } = {}) {
    e._lastDx = -1; e._lastDy = 0;
    if (walking) { e._slideStart = 100; e._slideMs = 200; e._stepIndex = 1; }
    const g = {
        playerX: 5, playerY: 5, facing: 'right', turn: 1, wheel: null, _idleTick: 0, _animating: false,
        _fightOn: fight, _inCombat: () => fight, _damageNumbers: [],
        equipment: { weapon: null, top: null, bottom: null, front: null, back: null, sides: null },
        enemies: [e], containers: [], groundItems: [],
        map: { width: 20, height: 20, isWalkable: () => true },
    };
    const { r, cells } = rig();
    const px = VP.origin.x + (e.x - g.playerX) * TILE_PX, py = VP.origin.y + (e.y - g.playerY) * TILE_PX;
    r._drawEnemySprite(g, e, px, py, 150);
    return { cells, px, py };
}

const ankou = () => spawnEnemy({ ...resolveSpawn({ id: 'ankou-1', entry: 'ankou', x: 6, y: 5 }, defaultPicks()), facing: 'S' });
const skeleton = () => new Enemy({ id: 'skel1', type: 'Rattling Skeleton', x: 6, y: 5, gold: 4 });

describe('the renderer draws the ghost behind the skeleton', () => {
    const MODES = [['standing', {}], ['walking', { walking: true }], ['in a fight', { fight: true }], ['walking in a fight', { fight: true, walking: true }]];
    for (const [label, opts] of MODES) {
        test(`${label}: the ghost cell is drawn first, see-through and larger, then the body`, () => {
            const { cells, px, py } = draw(ankou(), opts);
            assert.equal(cells.length, 2, JSON.stringify(cells));
            const [ghost, body] = cells;
            assert.deepEqual([ghost.col, ghost.row], [1, 10]);
            assert.deepEqual([body.col, body.row], [ENEMY_SPRITES.Ankou.col, ENEMY_SPRITES.Ankou.row]);
            assert.ok(ghost.alpha < 1 && ghost.alpha > 0, `ghost alpha ${ghost.alpha}`);
            assert.equal(body.alpha, 1);
            assert.ok(ghost.w > body.w && ghost.h > body.h, 'the ghost is larger');
            // Centred on the same tile as the body.
            assert.ok(Math.abs((ghost.x + ghost.w / 2) - (body.x + body.w / 2)) < 0.01);
            assert.ok(Math.abs((ghost.y + ghost.h / 2) - (body.y + body.h / 2)) < 0.01);
            assert.equal(body.x, px);
            assert.equal(body.y, py);
        });
    }

    test('the control: a Rattling Skeleton draws one cell and no ghost', () => {
        for (const opts of [{}, { walking: true }, { fight: true }]) {
            const { cells } = draw(skeleton(), opts);
            assert.equal(cells.length, 1);
            assert.equal(cells[0].alpha, 1);
        }
    });

    test('a fallen Ankou leaves no ghost behind', () => {
        const e = ankou();
        e.entity.hp = 0; e.entity.alive = false;
        const { cells } = draw(e, {});
        assert.equal(cells.length, 1);
    });
});
