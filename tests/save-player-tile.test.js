// (FX69) A save that stands the player in a wall or off the map loads them on open ground.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { serialize, loadInto, nearestWalkable } from '../game/save.js';
import { QuestEngine } from '../game/quests.js';
import { canStandOn, ITEMS } from '../game/items.js';

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

// (FX70) A grate is open ground for a grates-mask wearer, by the same rule the movement gate reads.
function grateMap() {
    const m = mkMap();
    const open = m.isWalkable;
    m.isWalkable = (x, y) => open(x, y) && !(x === 4 && y === 3);
    m.getTile = (x, y) => (x === 4 && y === 3 ? 4 : (open(x, y) ? 1 : 2));
    return m;
}
const MASK = ITEMS.rat_mask;

async function loadWith(equipment, x, y) {
    const map = grateMap();
    const src = makeGame(map);
    src.equipment = equipment;
    const blob = JSON.parse(JSON.stringify(serialize(src)));
    blob.player.x = x; blob.player.y = y;
    const dst = makeGame(map);
    dst._resolveItemDef = (id) => ITEMS[id] || null;   // equipment is saved as ids and rehydrated here
    await loadInto(dst, blob);
    return dst;
}
const bare = () => makeGame(mkMap()).equipment;

test('a save on a grate with a grates mask worn reloads on that grate', async () => {
    const g = await loadWith({ ...bare(), top: MASK }, 4, 3);
    assert.deepEqual([g.playerX, g.playerY], [4, 3]);
});

test('a save on a grate without the mask moves to the nearest open tile', async () => {
    const g = await loadWith(bare(), 4, 3);
    assert.notDeepEqual([g.playerX, g.playerY], [4, 3]);
    assert.ok(g.map.isWalkable(g.playerX, g.playerY));
});

test('walls and off-map stay moved even with the mask', async () => {
    const eq = { ...bare(), top: MASK };
    const w = await loadWith(eq, 0, 0);
    assert.deepEqual([w.playerX, w.playerY], [1, 1]);
    const o = await loadWith(eq, 9999, -50);
    assert.deepEqual([o.playerX, o.playerY], [8, 1]);
});

test('canStandOn: rat form or the mask opens a grate, nothing else does', () => {
    const m = grateMap();
    assert.equal(canStandOn(m, 4, 3, {}), false);
    assert.equal(canStandOn(m, 4, 3, { ratForm: true }), true);
    assert.equal(canStandOn(m, 4, 3, { equipment: { top: MASK } }), true);
    assert.equal(canStandOn(m, 0, 0, { ratForm: true, equipment: { top: MASK } }), false);
});
