// A bare right hand survives serialize -> JSON -> loadInto (FX64).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { serialize, loadInto } from '../game/save.js';
import { QuestEngine } from '../game/quests.js';

const DEFS = { pipe: { id: 'pipe' }, rock: { id: 'rock' }, knife: { id: 'knife' } };

beforeEach(() => {
    const store = new Map();
    globalThis.localStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { store.set(k, String(v)); },
        removeItem: (k) => { store.delete(k); },
    };
    globalThis.document = { createElement: () => ({ set textContent(v) {}, get innerHTML() { return ''; } }) };
});

function makeGame(equipment) {
    const g = {
        map: null, turn: 1, playerX: 1, playerY: 1, playerHp: 10, playerMaxHp: 10,
        playerMp: 5, playerMaxMp: 5, facing: 'down', gold: 0,
        rng: { s: 0, getState() { return this.s; }, setState(v) { this.s = v; } },
        equipment, tempEquips: [], buffs: [], inventory: [], selectedSlot: -1,
        groundItems: [], containers: [], enemies: [], _tileDiffs: [],
        _pendingTransition: null, _sewerEscape: null, _lastAutosaveTurn: 0,
        _log() {}, _render() {},
        _resolveItemDef(id) { return id ? (DEFS[id] || null) : null; },
        async _loadMap(url) {
            this.map = { url: url || 'town-map.json', width: 20, height: 15, zoneName: 'Town',
                isInBounds: () => true, isWalkable: () => true, _tileAt: () => 1, _setTileRaw() {} };
        },
        setTile() {},
    };
    g.questEngine = new QuestEngine(g);
    return g;
}
const empty = (extra) => ({ weapon: null, left: null, top: null, bottom: null, front: null, back: null, sides: null, ...extra });

async function reload(src, edit) {
    const blob = JSON.parse(JSON.stringify(serialize(src)));
    if (edit) edit(blob);
    // the loading game already holds a default weapon, as a fresh game does
    const dst = makeGame(empty({ weapon: DEFS.pipe }));
    await loadInto(dst, blob);
    return dst;
}

test('bare right hand with a one-hander on the left reloads bare', async () => {
    const dst = await reload(makeGame(empty({ left: DEFS.knife })));
    assert.equal(dst.equipment.weapon, null);
    assert.equal(dst.equipment.left.id, 'knife');
});

test('a weapon in the right hand reloads as before', async () => {
    const dst = await reload(makeGame(empty({ weapon: DEFS.rock })));
    assert.equal(dst.equipment.weapon.id, 'rock');
});

test('a save with no right-hand entry loads with the default weapon', async () => {
    const dst = await reload(makeGame(empty({ weapon: DEFS.rock })), (b) => { delete b.player.equipment.weapon; });
    assert.equal(dst.equipment.weapon.id, 'pipe');
});
