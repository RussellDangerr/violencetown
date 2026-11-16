// (FX69) A save that stands the player in a wall or off the map loads them on open ground.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { serialize, loadInto, nearestWalkable } from '../game/save.js';
import { QuestEngine } from '../game/quests.js';

beforeEach(() => {
    const store = new Map();
    globalThis.localStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { store.set(k, String(v)); },
        removeItem: (k) => { store.delete(k); },
    };
    globalThis.document = { createElement: () => ({ set textContent(v) {}, get innerHTML() { return ''; } }) };
});

// 10x8 map, walls on the border; open inside. Optional extra walls.
function mkMap(extraWalls = [], spawn = { x: 5, y: 4 }) {
    const w = 10, h = 8, walls = new Set(extraWalls.map(([x, y]) => `${x},${y}`));
    return {
        url: 'town-map.json', width: w, height: h, zoneName: 'Town', spawn,
        isInBounds: (x, y) => x >= 0 && y >= 0 && x < w && y < h,
        isWalkable: (x, y) => x > 0 && y > 0 && x < w - 1 && y < h - 1 && !walls.has(`${x},${y}`),
        _tileAt: () => 1, _setTileRaw() {},
    };
}

function makeGame(map) {
    const g = {
        map: null, turn: 1, playerX: 3, playerY: 3, playerHp: 10, playerMaxHp: 10,
        playerMp: 5, playerMaxMp: 5, facing: 'down', gold: 0,
        rng: { s: 0, getState() { return this.s; }, setState(v) { this.s = v; } },
        equipment: { weapon: null, left: null, top: null, bottom: null, front: null, back: null, sides: null },
        tempEquips: [], buffs: [], inventory: [], selectedSlot: -1,
        groundItems: [], containers: [], enemies: [], _tileDiffs: [],
        _pendingTransition: null, _sewerEscape: null, _lastAutosaveTurn: 0,
        _log() {}, _render() {},
        _resolveItemDef() { return null; },
        async _loadMap(url, x, y) { this.map = map; this.playerX = x ?? map.spawn.x; this.playerY = y ?? map.spawn.y; },
        setTile() {},
    };
    g.questEngine = new QuestEngine(g);
    return g;
}

async function loadAt(x, y, map = mkMap()) {
    const blob = JSON.parse(JSON.stringify(serialize(makeGame(map))));
    blob.player.x = x; blob.player.y = y;
    const dst = makeGame(map);
    await loadInto(dst, blob);
    return dst;
}

test('a walkable saved tile is left alone', async () => {
    const g = await loadAt(4, 3);
    assert.deepEqual([g.playerX, g.playerY], [4, 3]);
});

test('a save inside a wall loads on the nearest open tile', async () => {
    const g = await loadAt(0, 0);
    assert.deepEqual([g.playerX, g.playerY], [1, 1]);
    assert.ok(g.map.isWalkable(g.playerX, g.playerY));
});

test('a save off the map loads on open ground, and repeats exactly', async () => {
    const a = await loadAt(9999, -50);
    const b = await loadAt(9999, -50);
    assert.ok(a.map.isWalkable(a.playerX, a.playerY));
    assert.deepEqual([a.playerX, a.playerY], [b.playerX, b.playerY]);
    assert.deepEqual([a.playerX, a.playerY], [8, 1]);
});

test('nearestWalkable finds the closest open tile past a thick wall', () => {
    const m = mkMap([[4, 3], [4, 4], [5, 3], [5, 4], [3, 3], [3, 4], [4, 2], [4, 5]]);
    const t = nearestWalkable(m, 4, 3);
    assert.ok(m.isWalkable(t.x, t.y));
    assert.ok(Math.abs(t.x - 4) + Math.abs(t.y - 3) <= 2);
});

test('a map with no open tile leaves the tile as given and does not hang', () => {
    const none = { width: 3, height: 3, spawn: { x: 1, y: 1 },
        isInBounds: (x, y) => x >= 0 && y >= 0 && x < 3 && y < 3, isWalkable: () => false };
    assert.deepEqual(nearestWalkable(none, 0, 0), { x: 0, y: 0 });
});
