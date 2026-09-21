// restart.test.js — RESTART (and the ending's PLAY AGAIN) begins a brand-new game.
//
// _fullReset clears the save and reseeds, so the run it leaves you in is what a
// reload would give you — except that it never cleared the world's memory. The
// town it rebuilt still knew which items you had picked up, which enemies you
// had looted, what you had stolen; you kept your rings and the skills they
// grant; a rat-form or a haste charge carried over. Then the next autosave
// wrote that into the fresh save.
//
// The oracle here is the game's own constructor: a run after RESTART must
// serialize the same as a fresh game. save.js serialize() is the list of what a
// run IS, so a field added to the save is covered here without being named —
// and the fixture check below fails until the late-run fixture dirties it.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { serialize } from '../game/save.js';
import { RNG } from '../game/rng.js';
import { QuestEngine } from '../game/quests.js';
import { WEAPONS } from '../game/weapons.js';
import { PLAYER_MAX_HP, PLAYER_MAX_MP, INVENTORY_SIZE } from '../game/data.js';
import { RINGS, FUSIONS } from '../game/ring-data.js';
import { SPELLS } from '../game/spells.js';
import { TRICKS } from '../game/tricks.js';
import { slottedActives, resolveAdjacencies, aggregatePassives, mergeKnown, acquireRing } from '../game/rings.js';
import { createWheelState } from '../game/wheel-model.js';

const mainSrc = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
const STATE = { SPLASH: 'splash', IDLE: 'idle' };
const BASE_SPELLS = JSON.parse(/const BASE_SPELLS = (\[.*?\]);/.exec(mainSrc)[1].replace(/'/g, '"'));

// Lift a Game method (or the constructor) out of main.js and run it for real.
function liveMethod(signature, freeVars = {}, { async = false } = {}) {
    const at = mainSrc.indexOf(signature, mainSrc.indexOf('class Game {'));
    assert.ok(at > 0, `${signature} not found in main.js`);
    const body = mainSrc.slice(at + signature.indexOf('('), mainSrc.indexOf('\n    }', at) + '\n    }'.length);
    const names = Object.keys(freeVars);
    const fn = `'use strict'; return ${async ? 'async ' : ''}function ${body}`;
    return new Function(...names, fn)(...names.map(n => freeVars[n]));
}

const refreshGrantedSkills = liveMethod('_refreshGrantedSkills() {', {
    RINGS, FUSIONS, SPELLS, TRICKS, BASE_SPELLS, slottedActives, resolveAdjacencies, aggregatePassives, mergeKnown,
});
const construct = liveMethod('constructor() {', {
    STATE, PLAYER_MAX_HP, PLAYER_MAX_MP, BASE_SPELLS, WEAPONS, INVENTORY_SIZE, RNG, QuestEngine, createWheelState,
});
const fullReset = liveMethod('_fullReset({ seed } = {}) {', {
    STATE, PLAYER_MAX_HP, PLAYER_MAX_MP, WEAPONS, RNG, QuestEngine, clearSave: () => {},
}, { async: true });

// What the town is built FROM: _loadMap consults these while it spawns (skips
// collected items, re-drops dropped ones, spawns looted enemies broke, re-injects
// pursuers). Snapshotted at the call, because by then it is too late.
const worldMemory = (g) => ({
    collectedItems: [...g._collectedItems],
    droppedItems: { ...g._droppedItems },
    muggedIds: [...g._muggedIds],
    robbed: { ...g._robbed },
    pendingFollowers: g._pendingFollowers,
});

// A Game with main.js's real constructor, _refreshGrantedSkills and _fullReset,
// and a _loadMap that does what the real one does to the fields serialize reads.
function newGame() {
    const g = {
        _detectDebugFlag: () => false,
        _refreshGrantedSkills: refreshGrantedSkills,
        _closeOffer() {},
        _log() {},
        _startMainQuest() {},
        _fullReset: fullReset,
        loads: [],
        async _loadMap(url) {
            this.loads.push({ url, world: worldMemory(this) });
            this.map = { url, spawn: { x: 5, y: 7 } };
            this._mapUrl = url;
            this._jammedDoor = null;
            this.playerX = this.map.spawn.x;
            this.playerY = this.map.spawn.y;
            this._tileDiffs = [];
            this.groundItems = [];
            this.enemies = [];
            this._pendingFollowers = null;
            this.containers = [];
            this.examinables = [];
        },
    };
    construct.call(g);
    return g;
}

// The splash's GAME START: constructor, init's town load, then start().
async function freshGame() {
    const g = newGame();
    await g._loadMap('town-map.json');
    g.state = STATE.IDLE;
    g._startMainQuest();
    return g;
}

const rock = { itemDef: { id: 'rock' }, count: 3 };

// Late in a run: a finished chapter, or a long afternoon in the sewer.
async function lateRun() {
    const g = await freshGame();
    await g._loadMap('sewer-map.json');
    g.playerX = 12; g.playerY = 3;
    g.turn = 412;
    g.playerHp = 37; g.playerMaxHp = PLAYER_MAX_HP + 30;
    g.playerMp = 5;  g.playerMaxMp = PLAYER_MAX_MP + 20;
    g.facing = 'up';
    g.gold = 88;
    g.carFuel = 'alcohol';
    g.ringTier = 1;
    acquireRing(g.ownedRings, g.ringSlots, g.ringTier, 'rat_ring');
    acquireRing(g.ownedRings, g.ringSlots, g.ringTier, 'fire_ring');
    g._refreshGrantedSkills();          // rat_form, and the ember_rat fusion
    g.equipment = { ...g.equipment, weapon: Object.values(WEAPONS).find(w => w !== WEAPONS.wooden_sword) };
    g.tempEquips = [{ slot: 'top', itemDef: { id: 'hat' }, turnsLeft: 3, previousItem: null }];
    g.buffs = [{ id: 'haste', name: '[Haste]', turns: 4, type: 'buff' }];
    g._hasteCharges = 2;
    g._slowCharges = 1;
    g.inventory[0] = rock;
    g.groundItems = [{ type: 'rock', x: 1, y: 1 }];
    g._collectedItems.add('town-map.json|4|4|rock');
    g._droppedItems = { 'town-map.json': [{ type: 'bomb', x: 2, y: 2 }] };
    g._muggedIds.add('town_thug_1');
    g._robbed = { vendor_1: { gold: 5, items: [], weightTaken: 1, noticed: true } };
    g._hot = { soap: 2 };
    g.containers = [{ id: 'crate_1', type: 'crate', x: 3, y: 3, contents: [] }];
    g.enemies = [{ toSave: () => ({ id: 'rat_1' }) }];
    g._tileDiffs = [{ x: 6, y: 6, id: 0 }];
    g._pendingTransition = { toMap: 'canyon-map.json' };
    g.questEngine.state.activeId = 'fix_car';
    g.questEngine.state.completed = ['deliver_burger'];
    g._sewerEscape = { active: true, ratsKilled: 3, wave2Spawned: true, barricadeHp: {} };
    // Not saved, but a run's all the same.
    g._peakDisposition = 90;
    g._ratFormTurns = 2;
    g._dayClockMs = 123456;
    g._nightLevel = 0.8;
    g._lastHitTarget = 'rat_1';
    g._lastDefeatedBy = { cause: 'sludge' };
    g._cameFrom = 'canyon-map.json';
    g._pendingFollowers = [{ id: 'rat_2' }];
    return g;
}

// A save, minus what cannot compare: when it was written, and the RNG stream
// (RESTART reseeds on purpose, so the new run is independent of the old one).
function runState(g) {
    const s = serialize(g);
    delete s.savedAt;
    delete s.rngState;
    return s;
}

// Every leaf the save carries, as [path, value] — the next persisted field
// shows up here without anyone naming it.
function leaves(s) {
    const out = [];
    for (const [k, v] of Object.entries(s)) {
        if (k === 'player' || k === 'world') {
            for (const [k2, v2] of Object.entries(v)) out.push([`${k}.${k2}`, v2]);
        } else out.push([k, v]);
    }
    return out;
}

describe('RESTART begins a brand-new game', () => {
    test('the late-run fixture changes every field a save carries', async () => {
        const fresh = runState(await freshGame());
        const late = runState(await lateRun());
        const untouched = leaves(fresh)
            .filter(([path]) => path !== 'version')
            .filter(([path, v]) => {
                const other = leaves(late).find(([p]) => p === path)[1];
                try { assert.deepEqual(other, v); return true; } catch { return false; }
            })
            .map(([path]) => path);
        assert.deepEqual(untouched, [],
            'lateRun() leaves these at their fresh values, so this suite cannot see RESTART miss them — dirty them');
    });

    test('a run after RESTART saves exactly like a fresh game', async () => {
        const fresh = await freshGame();
        const g = await lateRun();
        await g._fullReset();
        const want = new Map(leaves(runState(fresh)));
        const kept = leaves(runState(g))
            .filter(([path, v]) => { try { assert.deepEqual(v, want.get(path)); return false; } catch { return true; } })
            .map(([path]) => path);
        assert.deepEqual(kept, [], 'RESTART carries these over from the old run');
    });

    test('the town it rebuilds is built from an empty world memory', async () => {
        const g = await lateRun();
        g.loads = [];
        await g._fullReset();
        assert.equal(g.loads.length, 1);
        assert.equal(g.loads[0].url, 'town-map.json');
        assert.deepEqual(g.loads[0].world, worldMemory(await freshGame()),
            'the town is spawned while the old run\'s pickups, drops, lootings or pursuers are still remembered');
    });

    test('the rings go, and so do the skills they granted', async () => {
        const fresh = await freshGame();
        const g = await lateRun();
        assert.ok(g.grantedTricks.includes('rat_form'), 'fixture: the Rat Ring grants Rat Form');
        await g._fullReset();
        assert.deepEqual(g.knownSpells, fresh.knownSpells);
        assert.deepEqual(g.grantedTricks, fresh.grantedTricks);
        assert.deepEqual(g.ringMods, fresh.ringMods);
    });

    test('a seeded RESTART starts the RNG at that seed', async () => {
        const g = await lateRun();
        await g._fullReset({ seed: 42 });
        assert.equal(g.rng.getState(), 42);
    });

    test('an unseeded RESTART still reseeds at random', async () => {
        const a = await lateRun(), b = await lateRun();
        await a._fullReset();
        await b._fullReset();
        assert.notEqual(a.rng.getState(), b.rng.getState());
    });

    test('nothing the old run was in the middle of carries over', async () => {
        const fresh = await freshGame();
        const g = await lateRun();
        await g._fullReset();
        for (const f of ['_peakDisposition', '_ratFormTurns', '_dayClockMs', '_nightLevel',
                         '_lastHitTarget', '_lastDefeatedBy', '_cameFrom', '_pendingFollowers']) {
            assert.deepEqual(g[f], fresh[f], `${f} survives RESTART`);
        }
    });
});
