// loot-burst.test.js — a kill's loot bursts out of the body and flies to you
// (plans/fx3-auto-loot-burst.md, FX3b).
//
// The burst model is pure (game/loot-burst.js), so its frames are pinned at
// exact moments. The real main.js methods start it from a real kill, and the
// real renderer draws it into a recording canvas.

import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { BURST, makeBurst, burstDuration, burstDone, liveBursts, burstAngle, burstFrame } from '../game/loot-burst.js';
import { recordKill, stepRespawns, deadIds, bossDropOnce, recordDrop, pendingDrops, takeDrop, dropLoadout } from '../game/drops.js';
import { GameMap } from '../game/map.js';
import { spawnEnemy } from '../game/enemies.js';
import { resolveSpawn, defaultPicks, requiredDropFor, dropLineFor } from '../game/slots.js';
import { transferGold } from '../game/trade.js';
import { ITEMS } from '../game/items.js';
import { addToInventory as addToInv } from '../game/inventory.js';
import { INVENTORY_SIZE, SAFE_SLOTS, PACK_PAGE, MAX_STACK, TILE_PX } from '../game/data.js';
import { Renderer } from '../game/renderer.js';
import { DOCK } from '../game/layout.js';
import { computeViewport } from '../game/viewport.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

// A clock the test owns: main.js and the renderer both read performance.now().
const realNow = performance.now.bind(performance);
let clock = 0;
performance.now = () => clock;
afterEach(() => { clock = 0; });
process.on('exit', () => { performance.now = realNow; });

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} vs ${b}`);

// ── The model ───────────────────────────────────────────────────────────────

describe('the burst, frame by frame', () => {
    // The Sewer boss's first fall: what it leaves, from the tile it dies on,
    // with the player one tile to its left. Pixels, 32 to a tile.
    const ids = ['catalytic_converter', 'wererat_fur', 'bandage'];
    const b = makeBurst(17, 10, ids, 1000);
    const body = { x: 560, y: 336 }, player = { x: 528, y: 336 }, tile = 32;
    const at = (t) => burstFrame(b, 1000 + t, body, player, tile);

    test('the timings it was built with (the builder\'s numbers, flagged for review)', () => {
        assert.deepEqual({ ...BURST }, {
            STAGGER_MS: 60, POP_MS: 240, HANG_MS: 140, FLY_MS: 260,
            RADIUS: 1.1, HOP: 0.6, START_SCALE: 0.5, END_SCALE: 0.6,
        });
        assert.equal(burstDuration(3), 2 * 60 + 240 + 140 + 260);
        assert.equal(burstDuration(0), 0);
    });

    test('at the kill only the first item shows, small, in the body', () => {
        const f = at(0);
        assert.equal(f.length, 1);
        assert.equal(f[0].item.id, 'catalytic_converter');
        assert.equal(f[0].phase, 'pop');
        assert.deepEqual([f[0].x, f[0].y, f[0].scale], [560, 336, 0.5]);
    });

    test('items leave 60 ms apart, spread evenly round the body, the first straight up', () => {
        assert.deepEqual(at(59).map(f => f.item.id), ['catalytic_converter']);
        assert.deepEqual(at(60).map(f => f.item.id), ['catalytic_converter', 'wererat_fur']);
        assert.deepEqual(at(120).map(f => f.item.id), ids);
        close(burstAngle(0, 3), -Math.PI / 2, 'first up');
        close(burstAngle(1, 3) - burstAngle(0, 3), 2 * Math.PI / 3, 'even spread');
    });

    test('halfway through its pop an item is on its hop', () => {
        const [f] = at(120);
        // ease-out at p = 0.5 is 0.75 of the way to 1.1 tiles up, plus a full 0.6-tile hop.
        close(f.x, 560, 'x');
        close(f.y, 336 - 0.75 * 1.1 * 32 - 0.6 * 32, 'y');
        close(f.scale, 0.5 + 0.5 * 0.75, 'scale');
    });

    test('it hangs at 1.1 tiles out, then flies into the player and is gone', () => {
        const hang = at(240)[0];
        assert.equal(hang.phase, 'hang');
        close(hang.x, 560, 'x'); close(hang.y, 336 - 1.1 * 32, 'y'); assert.equal(hang.scale, 1);
        assert.equal(at(379)[0].phase, 'hang');
        const fly = at(380 + 130)[0];
        assert.equal(fly.phase, 'fly');
        close(fly.x, 560 + (528 - 560) * 0.25, 'x quarter way at half time (ease in)');
        close(fly.y, (336 - 35.2) + (336 - (336 - 35.2)) * 0.25, 'y');
        assert.ok(at(639).some(f => f.item.id === 'catalytic_converter'), 'still flying at 639');
        assert.ok(!at(640).some(f => f.item.id === 'catalytic_converter'), 'landed at 640');
    });

    test('the last item lands when the burst ends, and the burst is then over', () => {
        const end = burstDuration(3);
        assert.equal(at(end - 1).length, 1);
        assert.deepEqual(at(end), []);
        assert.equal(burstDone(b, 1000 + end - 1), false);
        assert.equal(burstDone(b, 1000 + end), true);
        assert.deepEqual(liveBursts([b], 1000 + end), []);
        assert.deepEqual(liveBursts([b], 1000 + end - 1), [b]);
    });

    test('Reduce Motion flattens the hop and keeps everything else', () => {
        const [f] = burstFrame(b, 1120, body, player, tile, { flat: true });
        close(f.y, 336 - 0.75 * 1.1 * 32, 'no hop');
    });

    test('the same moment always gives the same frame (no randomness)', () => {
        assert.deepEqual(at(200), at(200));
        assert.deepEqual(makeBurst(1, 2, ['rock'], 5).items, [{ id: 'rock' }]);
    });
});

// ── A real kill starts it ───────────────────────────────────────────────────

const mainSrc = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
function liveMethod(signature, freeVars, { async = false } = {}) {
    const at = mainSrc.indexOf(signature, mainSrc.indexOf('class Game {'));
    assert.ok(at > 0, `${signature} not found in main.js`);
    const body = mainSrc.slice(at + signature.indexOf('('), mainSrc.indexOf('\n    }', at) + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return ${async ? 'async ' : ''}function ${body}`)(...names.map(n => freeVars[n]));
}
const sewer = JSON.parse(readFileSync(new URL('../game/sewer-map.json', import.meta.url), 'utf8'));
const free = {
    loadMap: async (url) => new GameMap(sewer, url),
    document: { getElementById: () => null }, audio: { playSfx() {}, playMusic() {} },
    spawnEnemy, resolveSpawn, deadIds, pendingDrops, recordDrop, takeDrop, recordKill, stepRespawns, bossDropOnce,
    transferGold, dropLoadout, requiredDropFor, dropLineFor, ITEMS, onSewerEnemyKilled() {},
    addToInv, SAFE_SLOTS, PACK_PAGE, MAX_STACK, makeBurst,
};
const names = ['_handleEnemyDeath', '_takeKillLoot', '_addToInventory', '_startLootBurst', '_rememberKill',
    '_bossFirstFall', '_recordDrop', '_takeDropRecord'];
const M = Object.fromEntries(names.map(n => [n, liveMethod(`    ${n}(`, free)]));
M._loadMap = liveMethod('    async _loadMap(', free, { async: true });

async function sewerGame() {
    const g = {
        ...M,
        slots: defaultPicks(), map: null, _mapUrl: null, enemies: [], groundItems: [], logs: [],
        inventory: new Array(INVENTORY_SIZE).fill(null), _lootBursts: [], loops: 0, state: 'explore',
        _collectedItems: new Set(), _droppedItems: {}, _muggedIds: new Set(), _robbed: {},
        _respawnLists: {}, _bossDropsGiven: new Set(), _pendingFollowers: null, gold: 0,
        renderer: { dropFightFog() {} }, questEngine: null,
        _endBuybacks() {}, _advanceDayClock() {}, _openBridgeIfCarFixed() {}, _render() {},
        _resolveItemDef: (id) => ITEMS[id] || null,
        _log(m) { this.logs.push(m); }, _spawnEventWord() {}, emitGameEvent() {}, _grantItem() {},
        _ensureParticleLoop() { this.loops++; },
    };
    await g._loadMap('sewer-map.json');
    return g;
}

describe('a boss kill bursts its loot', () => {
    test('the burst leaves the boss\'s tile at the moment of the kill, one icon per item, all already bagged', async () => {
        const g = await sewerGame();
        const boss = g.enemies.find(e => e.id === 'wererat');
        const kit = dropLoadout(boss.loadout, 0, 0).map(i => i.type);
        clock = 4242;
        boss.entity.hp = 0; boss.entity.alive = false;
        g._handleEnemyDeath(boss);
        assert.equal(g._lootBursts.length, 1);
        const b = g._lootBursts[0];
        assert.deepEqual([b.x, b.y, b.bornAt], [boss.x, boss.y, 4242]);
        assert.deepEqual(b.items.map(i => i.id), [...kit, 'catalytic_converter', 'wererat_fur']);
        assert.equal(g.loops, 1, 'the effect loop is woken to play it');
        // Pure show: every item is in the bag before the first frame draws.
        const bag = g.inventory.filter(Boolean).map(s => s.itemDef.id);
        for (const it of b.items) assert.ok(bag.includes(it.id), `${it.id} is already in the bag`);
        // Its frames for this kill: the converter, after the kit, leaves last.
        const n = b.items.length;
        const body = { x: 0, y: 0 }, you = { x: -32, y: 0 };
        const first = burstFrame(b, 4242, body, you, 32);
        assert.deepEqual(first.map(f => [f.item.id, f.x, f.y, f.scale]), [[b.items[0].id, 0, 0, 0.5]]);
        assert.equal(burstFrame(b, 4242 + (n - 2) * 60, body, you, 32).length, n - 1, 'the fur is not out yet');
        assert.equal(burstFrame(b, 4242 + (n - 1) * 60, body, you, 32).length, n, 'all out');
        assert.ok(burstDone(b, 4242 + burstDuration(n)));
    });

    test('a new zone starts with no burst in the air', async () => {
        const g = await sewerGame();
        g._lootBursts.push(makeBurst(1, 1, ['rock'], 0));
        await g._loadMap('sewer-map.json');
        assert.deepEqual(g._lootBursts, []);
    });

    test('nothing waits on a burst: only the effect loop and the drawing read it', () => {
        // Every line of main.js that names the burst list, by the method it sits in.
        const lines = mainSrc.split(/\r?\n/);
        const owners = new Set();
        let method = null;
        for (const line of lines) {
            const m = /^    (?:async )?([_a-zA-Z]\w*)\s*\([^)]*\)\s*\{\s*$/.exec(line);
            if (m) method = m[1];
            if (line.includes('_lootBursts')) owners.add(method);
        }
        assert.deepEqual([...owners].sort(), ['_ensureParticleLoop', '_hasActiveEffects', '_loadMap', '_startLootBurst', 'constructor'].sort());
    });
});

// ── The renderer draws it ───────────────────────────────────────────────────

describe('the renderer draws each item in the air', () => {
    const VP = computeViewport({ cssW: 3440, cssH: 1440, dpr: 1, dock: DOCK });
    function rig() {
        const rects = [];
        const state = { globalAlpha: 1, fillStyle: null };
        const ctx = new Proxy(state, {
            get(t, k) {
                if (k in t) return t[k];
                if (k === 'fillRect') return (x, y, w, h) => rects.push({ x, y, w, h, fill: t.fillStyle });
                return () => undefined;
            },
            set(t, k, v) { t[k] = v; return true; },
        });
        const r = Object.assign(Object.create(Renderer.prototype), {
            ctx, canvas: { width: VP.backingW, height: VP.backingH }, viewport: VP, sprites: {},
            _scrollX: 0, _scrollY: 0,
        });
        return { r, rects };
    }

    test('one icon per item in the air, centred where the model says', () => {
        const { r, rects } = rig();
        const g = { playerX: 10, playerY: 10, _lootBursts: [makeBurst(12, 10, ['catalytic_converter', 'bandage'], 0)] };
        clock = 300;   // the converter hangs, the bandage is still popping
        r._drawLootBursts(g);
        const { origin } = VP;
        const body = { x: origin.x + 2 * TILE_PX + TILE_PX / 2, y: origin.y + TILE_PX / 2 };
        const you = { x: origin.x + TILE_PX / 2, y: origin.y + TILE_PX / 2 };
        const frames = burstFrame(g._lootBursts[0], 300, body, you, TILE_PX);
        assert.equal(frames.length, 2);
        // No sheet is loaded here, so each item draws the bag's colour plate.
        assert.equal(rects.length, 2);
        for (const [i, f] of frames.entries()) {
            const size = Math.max(4, Math.round(TILE_PX * f.scale));
            const p = rects[i];
            assert.equal(p.w, size, `item ${i} is drawn at its scale`);
            assert.ok(Math.abs(p.x + size / 2 - f.x) <= 1 && Math.abs(p.y + size / 2 - f.y) <= 1, `item ${i} is drawn at its spot`);
        }
    });

    test('a landed burst draws nothing', () => {
        const { r, rects } = rig();
        clock = 10_000;
        r._drawLootBursts({ playerX: 0, playerY: 0, _lootBursts: [makeBurst(1, 0, ['rock'], 0)] });
        assert.deepEqual(rects, []);
    });
});
