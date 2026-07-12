// save-roundtrip.test.js — serialize() → migrate/validate/loadInto round-trips
// the live game state faithfully, and a partial/old blob fills defaults without
// throwing.
//
// We drive the REAL game/save.js (serialize, migrate, writeSave, readSaveRaw,
// loadInto) and the REAL game/enemies.js Enemy reconstruction. save.js is
// importable under Node: its transitive imports (enemies → combat/utils/
// pathing/npc) never touch the DOM at module-evaluation time (utils.escapeHtml
// is the only document user and it's never called on these paths).
//
// We DO NOT import main.js (it touches document at load). Instead we hand
// serialize()/loadInto() a faithful fake "game" exposing exactly the fields and
// methods save.js reads/writes — most importantly _loadMap, _resolveItemDef,
// setTile, map, rng and questEngine.
//
// EXPECTED GREEN throughout — these pin the save contract.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    serialize, migrate, writeSave, readSaveRaw, clearSave, hasSave, SAVE_VERSION,
    loadInto as loadIntoReal,
} from '../game/save.js';
import { QuestEngine } from '../game/quests.js';
import { Enemy } from '../game/enemies.js';

// ── Minimal global stubs (localStorage + document) ───────────────────────────
// save.js's write/read path uses localStorage; enemies.js's chain never calls
// document, but the task asks us to stub it minimally, so we install a no-op.
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

// ── Faithful round trip ──────────────────────────────────────────────────────
describe('save round-trip (EXPECTED GREEN)', () => {

    test('serialize() captures the version and live scalars', () => {
        const g = makePopulatedGame();
        const blob = serialize(g);
        assert.equal(blob.version, SAVE_VERSION);
        assert.equal(blob.turn, 42);
        assert.equal(blob.rngState, 0xDEADBEEF);
        assert.equal(blob.mapUrl, 'town-map.json');
        assert.equal(blob.player.hp, 73);
        assert.equal(blob.player.maxHp, 120);
        assert.equal(blob.player.gold, 256);
        assert.equal(blob.player.facing, 'left');
        // equipment serializes to ids (defs are not stored)
        assert.equal(blob.player.equipment.weapon, 'pipe');
        assert.equal(blob.player.equipment.sides, 'rock');
        // inventory slots serialize to {id,count} (or null)
        assert.deepEqual(blob.player.inventory[0], { id: 'rock', count: 5 });
        assert.equal(blob.player.inventory[1], null);
        assert.deepEqual(blob.player.inventory[2], { id: 'soap', count: 2 });
    });

    test('player / inventory / equipment / temp-equips / buffs survive serialize→loadInto', async () => {
        const src = makePopulatedGame();
        const blob = JSON.parse(JSON.stringify(serialize(src))); // through JSON, like a real save

        const dst = makeBlankGame();
        await loadIntoReal(dst, blob);

        assert.equal(dst.turn, 42);
        assert.equal(dst.rng.getState(), 0xDEADBEEF, 'RNG stream position restored');
        assert.equal(dst.playerX, 7); assert.equal(dst.playerY, 9);
        assert.equal(dst.playerHp, 73); assert.equal(dst.playerMaxHp, 120);
        assert.equal(dst.playerMp, 40); assert.equal(dst.playerMaxMp, 100);
        assert.equal(dst.gold, 256);
        assert.equal(dst.facing, 'left');

        // equipment rehydrated from ids back to defs
        assert.equal(dst.equipment.weapon.id, 'pipe');
        assert.equal(dst.equipment.front.id, 'bandage');
        assert.equal(dst.equipment.sides.id, 'rock');
        assert.equal(dst.equipment.top, null);

        // inventory rehydrated, holes preserved, counts intact
        assert.equal(dst.inventory[0].itemDef.id, 'rock');
        assert.equal(dst.inventory[0].count, 5);
        assert.equal(dst.inventory[1], null);
        assert.equal(dst.inventory[2].itemDef.id, 'soap');
        assert.equal(dst.inventory[2].count, 2);

        // temp-equips + buffs
        assert.equal(dst.tempEquips.length, 1);
        assert.equal(dst.tempEquips[0].slot, 'front');
        assert.equal(dst.tempEquips[0].itemDef.id, 'bandage');
        assert.equal(dst.tempEquips[0].turnsLeft, 2);
        assert.equal(dst.buffs.length, 1);
        assert.equal(dst.buffs[0].id, 'guard');
    });

    test('world: tileDiffs, ground items, containers, and enemies round-trip', async () => {
        const src = makePopulatedGame();
        const blob = JSON.parse(JSON.stringify(serialize(src)));

        const dst = makeBlankGame();
        await loadIntoReal(dst, blob);

        // tile diffs re-applied (and re-buildable by setTile)
        assert.equal(dst._tileDiffs.length, 2);
        const ids = dst._tileDiffs.map(d => d.id).sort();
        assert.deepEqual(ids, [22, 23]);
        assert.equal(dst.map._tileAt(2, 2), 23);
        assert.equal(dst.map._tileAt(2, 3), 22);

        // ground items + containers
        assert.equal(dst.groundItems.length, 1);
        assert.equal(dst.groundItems[0].type, 'rock');
        assert.equal(dst.containers.length, 1);
        assert.deepEqual(dst.containers[0].contents, ['rock', 'soap']);

        // enemies reconstructed through the REAL Enemy class (hydrateEnemy)
        assert.equal(dst.enemies.length, 1);
        const rat = dst.enemies[0];
        assert.equal(rat.id, 'rat1');
        assert.equal(rat.type, 'sewer_rat');
        assert.equal(rat.x, 5); assert.equal(rat.y, 5);
        assert.equal(rat.entity.hp, 30, 'current HP preserved');
        assert.equal(rat.entity.maxHp, 50, 'max HP preserved');
        assert.equal(rat.entity.armor, 2);
        assert.equal(rat.entity.alive, true);
        assert.equal(rat.tag, 'sewer_rat');
    });

    test('quest engine state + sewerEscape round-trip', async () => {
        const src = makePopulatedGame();
        const blob = JSON.parse(JSON.stringify(serialize(src)));

        const dst = makeBlankGame();
        await loadIntoReal(dst, blob);

        assert.equal(dst.questEngine.state.activeId, 'fix_car');
        assert.equal(dst.questEngine.state.stageIndex, 1);
        assert.equal(dst.questEngine.currentStageId(), 'recover_converter');
        assert.deepEqual(dst.questEngine.state.flags, { carFixed: false });

        assert.deepEqual(dst._sewerEscape, { phase: 'gauntlet', barricadesLeft: 2 });
    });

    test('writeSave → readSaveRaw round-trips through localStorage', () => {
        const src = makePopulatedGame();
        assert.equal(writeSave(src), true);
        assert.equal(hasSave(), true);

        const raw = readSaveRaw();
        assert.ok(raw, 'a written save reads back');
        assert.equal(raw.version, SAVE_VERSION);
        assert.equal(raw.turn, 42);
        assert.equal(raw.player.hp, 73);
        assert.deepEqual(raw.player.inventory[0], { id: 'rock', count: 5 });

        clearSave();
        assert.equal(hasSave(), false);
    });
});

// ── PD-5: co-located save contract preserves ambient + allegiance runtime ─────
// Regression for the two round-trip bugs this fix closes: an `ambient` NPC used
// to reload as a per-turn combat enemy (ambient dropped), and a flipped ally /
// summon used to reload INERT (_ally dropped → resolveEnemyTurns gates the ally
// turn on _ally, so it neither fights nor is hostile).
describe('enemy save contract: ambient + allegiance round-trip (PD-5)', () => {
    const rt = (e) => Enemy.fromSave(JSON.parse(JSON.stringify(e.toSave())));

    test('an ambient NPC stays ambient across a round-trip', () => {
        const amb = new Enemy({ id: 'amb1', type: 'Violencian', x: 3, y: 3, behavior: ['IDLE', 'WANDER'], ambient: true, name: 'Local' });
        assert.equal(rt(amb).ambient, true, 'ambient must survive — else it reloads as a combat enemy');
    });

    test('a bribe-flipped ally keeps fighting (ally/wasFlipped/fsmState) across a round-trip', () => {
        const ally = new Enemy({ id: 'kn', type: 'Knuckles', x: 4, y: 4, behavior: ['ALLIED'], name: 'Knuckles' });
        ally._ally = true; ally._wasFlipped = true; ally.fsmState = 'ALLIED';
        const out = rt(ally);
        assert.equal(out._ally, true, 'a saved ally must reload as an ally, not inert');
        assert.equal(out._wasFlipped, true);
        assert.equal(out.fsmState, 'ALLIED');
    });

    test('a summon preserves its countdown across a round-trip', () => {
        const lion = new Enemy({ id: 'lion', type: 'Lion', x: 5, y: 5, behavior: ['ALLIED'] });
        lion._ally = true; lion._isSummon = true; lion._summonTurnsLeft = 7;
        const out = rt(lion);
        assert.equal(out._ally, true);
        assert.equal(out._isSummon, true);
        assert.equal(out._summonTurnsLeft, 7);
    });

    test('a plain enemy gains no phantom ally/ambient flags', () => {
        const rat = new Enemy({ id: 'rat', type: 'Rat', x: 1, y: 1 });
        const out = rt(rat);
        assert.ok(!out._ally);
        assert.equal(out.ambient, false);
        assert.ok(!out._isSummon);
    });
});

describe('allegiance round-trip + derive-from-old-save (PD-3)', () => {
  const rt = (e) => Enemy.fromSave(JSON.parse(JSON.stringify(e.toSave())));
  test('a provoked neutral stays hostile across a round-trip', () => {
    const e = new Enemy({ id:'n', type:'Local', x:1, y:1, behavior:['IDLE','WANDER'] });
    e.allegiance = 'hostile';                       // provoked at runtime
    assert.equal(rt(e).allegiance, 'hostile', 'runtime provoke must survive reload');
  });
  test('an OLD save (no allegiance) derives from behavior/_ally', () => {
    const oldAlly    = Enemy.fromSave({ id:'a', type:'X', x:0, y:0, behavior:['ALLIED'], ally:true });
    const oldHostile = Enemy.fromSave({ id:'h', type:'X', x:0, y:0, behavior:null });
    const oldFolk    = Enemy.fromSave({ id:'f', type:'X', x:0, y:0, behavior:['IDLE'] });
    assert.equal(oldAlly.allegiance, 'ally');
    assert.equal(oldHostile.allegiance, 'hostile');
    assert.equal(oldFolk.allegiance, 'neutral');
  });
});

// ── Migration / defaults for partial & old blobs ─────────────────────────────
describe('migrate + load partial/old blobs without throwing (EXPECTED GREEN)', () => {

    test('migrate() fills missing top-level + world fields', () => {
        const r = migrate({}); // totally empty blob
        assert.equal(r.version, SAVE_VERSION);
        assert.equal(r.mapUrl, 'town-map.json');
        assert.equal(r.turn, 0);
        assert.equal(r.rngState, 0);
        assert.deepEqual(r.world.tileDiffs, []);
        assert.deepEqual(r.world.enemies, []);
        assert.deepEqual(r.world.groundItems, []);
        assert.deepEqual(r.world.containers, []);
        assert.equal(r.quest, null);
        assert.equal(r.sewerEscape, null);
    });

    test('migrate() preserves an explicit version (no clobber of real saves)', () => {
        const r = migrate({ version: 1, turn: 5 });
        assert.equal(r.version, 1);
        assert.equal(r.turn, 5);
    });

    test('loadInto() on a tiny/old blob fills defaults and does not throw', async () => {
        // Minimal blob: just a player hp and a map url. Everything else missing.
        const blob = { player: { hp: 10 }, mapUrl: 'sewer-map.json' };

        const dst = makeBlankGame();
        await assert.doesNotReject(() => loadIntoReal(dst, blob));

        // hp clamped to the defaulted maxHp (100); maxHp/mp filled
        assert.equal(dst.playerMaxHp, 100);
        assert.equal(dst.playerHp, 10);
        assert.equal(dst.playerMaxMp, 100);
        // facing defaulted
        assert.equal(dst.facing, 'down');
        // missing coords → map spawn fallback, then clamped in-bounds
        assert.ok(dst.playerX >= 0 && dst.playerX < dst.map.width);
        assert.ok(dst.playerY >= 0 && dst.playerY < dst.map.height);
        // world arrays defaulted to empty
        assert.deepEqual(dst.enemies, []);
        assert.deepEqual(dst.groundItems, []);
        assert.deepEqual(dst.containers, []);
        assert.deepEqual(dst._tileDiffs, []);
        // a fresh-defaults save has no active quest
        assert.equal(dst.questEngine.state.activeId, null);
    });

    test('loadInto() sanitizes hostile garbage (out-of-range hp, bad facing, junk inventory)', async () => {
        const blob = {
            version: 1,
            mapUrl: 'town-map.json',
            turn: -99,
            player: {
                hp: 99999, maxHp: 50,      // hp must clamp to maxHp
                mp: -5, maxMp: 80,         // mp clamps to >= 0
                gold: -100,                // gold clamps to >= 0
                facing: 'sideways',        // invalid → 'down'
                inventory: [{ id: 'rock', count: 9999 }, 'not-a-slot', { count: 3 }],
                equipment: 'nonsense',
            },
        };
        const dst = makeBlankGame();
        await assert.doesNotReject(() => loadIntoReal(dst, blob));

        assert.equal(dst.playerMaxHp, 50);
        assert.equal(dst.playerHp, 50, 'hp clamped down to maxHp');
        assert.equal(dst.playerMp, 0, 'negative mp clamped to 0');
        assert.equal(dst.gold, 0, 'negative gold clamped to 0');
        assert.equal(dst.facing, 'down', 'invalid facing reset');
        assert.equal(dst.turn, 0, 'negative turn clamped to 0');

        // inventory: valid stack kept (count clamped to 99 max), junk dropped
        assert.equal(dst.inventory[0].itemDef.id, 'rock');
        assert.equal(dst.inventory[0].count, 99, 'count clamped to 99');
        assert.equal(dst.inventory[1], null, 'string slot rejected');
        assert.equal(dst.inventory[2], null, 'slot without id rejected');
    });
});
