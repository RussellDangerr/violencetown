// (FX71) Loading a save gives the hints fresh pacing, as RESTART does.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { serialize, loadInto } from '../game/save.js';
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

function mkMap() {
    const w = 10, h = 8;
    return {
        url: 'town-map.json', width: w, height: h, zoneName: 'Town', spawn: { x: 5, y: 4 },
        isInBounds: (x, y) => x >= 0 && y >= 0 && x < w && y < h,
        isWalkable: (x, y) => x > 0 && y > 0 && x < w - 1 && y < h - 1,
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

test('loadInto clears the old run\'s last-hint turn', async () => {
    const map = mkMap();
    const blob = JSON.parse(JSON.stringify(serialize(makeGame(map))));
    blob.turn = 3;
    const dst = makeGame(map);
    dst._lastHintTurn = 500;
    await loadInto(dst, blob);
    assert.equal(dst.turn, 3);
    assert.equal(dst._lastHintTurn, null);
});

test('after a load the first hint is not held back by the cooldown', async () => {
    const map = mkMap();
    const blob = JSON.parse(JSON.stringify(serialize(makeGame(map))));
    blob.turn = 3;
    const dst = makeGame(map);
    dst._lastHintTurn = 500;
    await loadInto(dst, blob);
    const held = dst._lastHintTurn != null && dst.turn - dst._lastHintTurn < 8;
    assert.equal(held, false);
});
