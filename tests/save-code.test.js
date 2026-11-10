// save-code.test.js - PK1: a save copied as a text code and pasted back restores the same
// game; a garbled, foreign or newer code is refused and the current game is untouched.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
    serialize, encodeSaveCode, decodeSaveCode, importSaveCode, SAVE_VERSION,
} from '../game/save.js';
import { QuestEngine } from '../game/quests.js';
import { Enemy } from '../game/enemies.js';

function installGlobals() {
    const store = new Map();
    globalThis.localStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { store.set(k, String(v)); },
        removeItem: (k) => { store.delete(k); },
        clear: () => store.clear(),
        _store: store,
    };
    globalThis.document = {
        createElement: () => ({ set textContent(v) {}, get innerHTML() { return ''; } }),
    };
}

// ── A faithful fake Game ─────────────────────────────────────────────────────
//
// Item "definitions" are resolved by id via _resolveItemDef, mirroring how the
// real game rehydrates from items.js. We keep a tiny registry so loadInto can
// round-trip equipment / inventory / temp-equips back into defs.
const ITEM_DEFS = {
    rock:   { id: 'rock' },
    soap:   { id: 'soap' },
    pipe:   { id: 'pipe' },
    bandage:{ id: 'bandage' },
};

class FakeRNG {
    constructor(s = 0) { this._s = s >>> 0; }
    getState() { return this._s >>> 0; }
    setState(s) { this._s = s >>> 0; }
}

function makeFakeMap() {
    const W = 20, H = 15;
    const tiles = new Array(W * H).fill(1); // all floor by default
    return {
        url: 'town-map.json',
        width: W, height: H,
        isInBounds: (x, y) => x >= 0 && y >= 0 && x < W && y < H,
        isWalkable: (x, y) => x >= 0 && y >= 0 && x < W && y < H,
        zoneName: 'Town',
        _tileAt: (x, y) => tiles[y * W + x],
        _setTileRaw: (x, y, id) => { tiles[y * W + x] = id; },
    };
}

// A live-ish game ready to be SERIALIZED. Values are deliberately non-default so
// the round-trip has something to prove.
function makePopulatedGame() {
    const g = makeBlankGame();
    g.turn = 42;
    g.rng = new FakeRNG(0xDEADBEEF);
    g.playerX = 7; g.playerY = 9;
    g.playerHp = 73; g.playerMaxHp = 120;
    g.playerMp = 40; g.playerMaxMp = 100;
    g.facing = 'left';
    g.gold = 256;
    // Remembrance Rings: an owned pool with two slotted rings, mid-tier, one
    // fusion already seen. Both slots are unlocked at tier 1 (ring + middle) and
    // both rings are owned, so validate's sanitizeSlots keeps them.
    g.ownedRings = new Set(['rat_ring', 'fire_ring']);
    g.ringSlots = { 'left:ring': 'rat_ring', 'left:middle': 'fire_ring' };
    g.ringTier = 1;
    g.discoveredFusions = new Set(['ember_rat']);
    g.equipment = {
        weapon: ITEM_DEFS.pipe, top: null, bottom: null,
        front: ITEM_DEFS.bandage, back: null, sides: ITEM_DEFS.rock,
    };
    g.tempEquips = [
        { slot: 'front', itemDef: ITEM_DEFS.bandage, turnsLeft: 2, previousItem: null },
    ];
    g.buffs = [{ id: 'guard', name: 'Guard', turns: 1, type: 'buff' }];
    g.inventory = [
        { itemDef: ITEM_DEFS.rock, count: 5 },
        null,
        { itemDef: ITEM_DEFS.soap, count: 2 },
    ];
    g.groundItems = [{ type: 'rock', x: 3, y: 4, def: ITEM_DEFS.rock }];
    g.containers = [{ id: 'chest1', type: 'crate', x: 1, y: 1, contents: ['rock', 'soap'] }];
    // A real Enemy instance — serEnemy delegates to Enemy.toSave() (PD-5), and the
    // live game only ever holds Enemy instances in game.enemies.
    const rat = new Enemy({ id: 'rat1', type: 'sewer_rat', x: 5, y: 5, hp: 50, armor: 2, damage: 8, sightRange: 8, tag: 'sewer_rat' });
    rat.entity.maxHp = 50; rat.entity.hp = 30;   // wounded — current HP below max
    g.enemies = [rat];
    g._tileDiffs = [{ x: 2, y: 2, id: 23 }, { x: 2, y: 3, id: 22 }];
    g._pendingTransition = null;

    // Quest state mid-flow: active fix_car on its 2nd stage with a flag set.
    g.questEngine = new QuestEngine(g);
    g.questEngine.state.activeId = 'fix_car';
    g.questEngine.state.stageIndex = 1;
    g.questEngine.state.counters = { recover_converter: 0 };
    g.questEngine.state.completed = [];
    g.questEngine.state.flags = { carFixed: false };

    g._sewerEscape = { phase: 'gauntlet', barricadesLeft: 2 };
    return g;
}

// A blank game ready to be LOADED INTO. Provides the methods loadInto calls.
function makeBlankGame() {
    const g = {
        logs: [], renders: 0,
        map: null,
        rng: new FakeRNG(0),
        turn: 0,
        playerX: 0, playerY: 0,
        playerHp: 100, playerMaxHp: 100, playerMp: 100, playerMaxMp: 100,
        facing: 'down', gold: 0,
        equipment: { weapon: null, top: null, bottom: null, front: null, back: null, sides: null },
        tempEquips: [], buffs: [], inventory: [], selectedSlot: -1,
        groundItems: [], containers: [], enemies: [],
        _tileDiffs: [], _pendingTransition: null, _sewerEscape: null,
        _lastAutosaveTurn: 0, state: 'boot',
        questEngine: null,
        _log(m) { this.logs.push(m); },
        _render() { this.renders++; },
        _resolveItemDef(id) { return id ? (ITEM_DEFS[id] || null) : null; },
        async _loadMap(url, x, y) {
            this.map = makeFakeMap();
            this.map.url = url || 'town-map.json';
            // Map spawn fallback when coords absent (mirrors real behavior:
            // undefined coords resolve to a known-walkable tile, here (1,1)).
            this.playerX = (typeof x === 'number') ? x : 1;
            this.playerY = (typeof y === 'number') ? y : 1;
        },
        setTile(x, y, id) {
            this.map._setTileRaw(x, y, id);
            // Real setTile rebuilds _tileDiffs as a side effect; mirror that so
            // a save→load→save round-trip preserves the diffs.
            const d = this._tileDiffs.find(t => t.x === x && t.y === y);
            if (d) d.id = id; else this._tileDiffs.push({ x, y, id });
        },
    };
    g.questEngine = new QuestEngine(g);
    return g;
}


beforeEach(() => { installGlobals(); });

// The fake game starts un-normalised (no slot picks, short bag); one pass through the real
// load gives it the shape a played game has, so "same game" compares like with like.
const settle = async (g) => { await importSaveCode(g, encodeSaveCode(g)); return g; };
const snap = (g) => JSON.stringify({ ...serialize(g), savedAt: 0 });   // the timestamp is the only thing that moves
function fnv(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0');
}

describe('PK1 save code', () => {
    test('copy then paste restores the exact same game', async () => {
        const src = await settle(makePopulatedGame());
        const code = encodeSaveCode(src);
        assert.match(code, /^VT1\.[0-9a-f]{8}\.[A-Za-z0-9_-]+$/, 'one line of plain text');
        const dst = makeBlankGame();
        const res = await importSaveCode(dst, code);
        assert.equal(res.ok, true);
        assert.equal(snap(dst), snap(src), 'serialized state identical');
        assert.equal(dst.gold, 256);
        assert.equal(dst.turn, 42);
    });

    test('a code survives being wrapped and padded with spaces', async () => {
        const src = await settle(makePopulatedGame());
        const messy = '  ' + encodeSaveCode(src).replace(/(.{40})/g, '$1\n') + '\n ';
        const dst = makeBlankGame();
        assert.equal((await importSaveCode(dst, messy)).ok, true);
        assert.equal(snap(dst), snap(src));
    });

    test('garbled, foreign and empty codes are refused and leave the game untouched', async () => {
        const src = await settle(makePopulatedGame());
        const code = encodeSaveCode(src);
        const [p, sum, body] = code.split('.');
        const flip = body.slice(0, 20) + (body[20] === 'A' ? 'B' : 'A') + body.slice(21);
        const bad = {
            empty: '', nonString: null, words: 'hello there', truncated: code.slice(0, code.length - 30),
            flipped: `${p}.${sum}.${flip}`, wrongSum: `${p}.00000000.${body}`,
            oldPrefix: `VT0.${sum}.${body}`, rawJson: JSON.stringify(serialize(src)),
        };
        for (const [name, text] of Object.entries(bad)) {
            const dst = makePopulatedGame();
            dst.gold = 999; dst.turn = 7;
            const before = snap(dst);
            const res = await importSaveCode(dst, text);
            assert.equal(res.ok, false, name);
            assert.ok(res.message.startsWith('[TEXT]'), name);
            assert.equal(snap(dst), before, `${name}: game untouched`);
            assert.equal(dst.gold, 999, name);
        }
    });

    test('a code from a newer save version is refused', async () => {
        const blob = serialize(makePopulatedGame());
        blob.version = SAVE_VERSION + 1;
        const body = Buffer.from(JSON.stringify(blob)).toString('base64url');
        const code = `VT1.${fnv(body)}.${body}`;
        assert.equal(decodeSaveCode(code).reason, 'version');
        const dst = makePopulatedGame();
        const before = snap(dst);
        assert.equal((await importSaveCode(dst, code)).ok, false);
        assert.equal(snap(dst), before);
    });

    test('an older save version is accepted (goes through migrate)', async () => {
        const blob = serialize(makePopulatedGame());
        blob.version = 1;
        delete blob.player.equipment.left;
        const body = Buffer.from(JSON.stringify(blob)).toString('base64url');
        const dst = makeBlankGame();
        assert.equal((await importSaveCode(dst, `VT1.${fnv(body)}.${body}`)).ok, true);
        assert.equal(dst.gold, 256);
    });

    test('a code that decodes but will not load is rolled back', async () => {
        const code = encodeSaveCode(makePopulatedGame());
        const dst = makePopulatedGame();
        dst.gold = 5; dst.turn = 3;
        await importSaveCode(dst, encodeSaveCode(dst));   // settle it into the shape a loaded game has
        const before = snap(dst);
        const realLoad = dst._loadMap;
        let first = true;
        dst._loadMap = async function (...a) {
            if (first) { first = false; this.gold = 12345; throw new Error('boom'); }   // dies partway
            return realLoad.apply(this, a);
        };
        const quiet = console.warn; console.warn = () => {};
        const res = await importSaveCode(dst, code);
        console.warn = quiet;
        assert.equal(res.ok, false);
        assert.equal(res.reason, 'load');
        assert.equal(dst.gold, 5, 'restored after the failed load');
        assert.equal(snap(dst), before);
    });
});
