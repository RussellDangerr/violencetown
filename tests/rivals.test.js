// rivals.test.js — the enemy that beat you is remembered and carries what it took
// (plans/ne1-rival-remembered.md; rulings NE1R1 a, NE1R2 a).
//
// The pure helpers first, then the real thing: main.js's own _die, _resolveDefeat,
// _runScenario, _applyTake, _zoneChange, _loadMap and _handleEnemyDeath, lifted out of
// the source and run against a staged game on the real canyon map. Lose to an enemy,
// walk through a door, walk back: that is the path under test, not just the helpers.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    canBeRival, itemIdsOf, recordDefeat, kitFor, markCarrying, settleItems, clearRival, sanitizeRivals,
} from '../game/rivals.js';
import {
    isBoss, pickScenario, partitionInventory, matchTake, DEFEAT_SCENARIOS,
} from '../game/defeat-scenarios.js';
import { resolveItemDef } from '../game/item-registry.js';
import { GameMap } from '../game/map.js';
import { spawnEnemy } from '../game/enemies.js';
import { resolveSpawn, defaultPicks, requiredDropFor, dropLineFor } from '../game/slots.js';
import { transferGold } from '../game/trade.js';
import { ITEMS } from '../game/items.js';
import { SAFE_SLOTS } from '../game/data.js';
import {
    deadIds, pendingDrops, recordDrop, takeDrop, recordKill, stepRespawns, bossDropOnce, dropLoadout, RESPAWN_STEPS,
} from '../game/drops.js';
import { kitTake } from '../game/theft.js';
import { targetPanel } from '../game/fight-panels.js';
import { serialize, migrate, loadInto } from '../game/save.js';
import { QuestEngine } from '../game/quests.js';

// ── The pure helpers ────────────────────────────────────────────────────────

const spawns = [{ id: 'a' }, { id: 'b' }];
const enemy = (over = {}) => ({ id: 'a', entity: {}, ...over });

describe('who can become a rival', () => {
    test('an ordinary enemy the map placed can', () => {
        assert.equal(canBeRival(enemy(), spawns), true);
    });
    test('a boss, a summon, an ally, the sewer rats and a hazard cannot', () => {
        assert.equal(canBeRival(enemy({ boss: true }), spawns), false);
        assert.equal(canBeRival(enemy({ tag: 'pike_boss' }), spawns), false);
        assert.equal(canBeRival(enemy({ _isSummon: true }), spawns), false);
        assert.equal(canBeRival(enemy({ _ally: true }), spawns), false);
        assert.equal(canBeRival(enemy({ tag: 'sewer_rat' }), spawns), false);
        assert.equal(canBeRival({ cause: 'sludge' }, spawns), false);
        assert.equal(canBeRival(null, spawns), false);
    });
    test('an enemy the game made on the fly (not on the map) cannot', () => {
        assert.equal(canBeRival(enemy({ id: 'rat_99' }), spawns), false);
    });
});

describe('the record', () => {
    test('one rival per zone: the first holds the post, the same one grows', () => {
        const rivals = {};
        assert.equal(recordDefeat(rivals, 'z', 'a', ['pipe']), 'made');
        assert.equal(recordDefeat(rivals, 'z', 'b', ['rock']), null);
        assert.equal(recordDefeat(rivals, 'z', 'a', ['rock']), 'grew');
        assert.deepEqual(rivals, { z: { id: 'a', items: ['pipe', 'rock'] } });
        assert.equal(recordDefeat(rivals, 'y', 'b', ['rock']), 'made', 'another zone has its own');
    });
    test('a defeat that took nothing makes nothing', () => {
        const rivals = {};
        assert.equal(recordDefeat(rivals, 'z', 'a', []), null);
        assert.deepEqual(rivals, {});
    });
    test('a stack is one id per item, and an unknown id is left out', () => {
        const taken = [{ itemDef: resolveItemDef('bandage'), count: 3 }, { itemDef: { id: 'no_such_item' }, count: 1 }];
        assert.deepEqual(itemIdsOf(taken), ['bandage', 'bandage', 'bandage']);
    });
    test('the kit is for that enemy only', () => {
        const rivals = { z: { id: 'a', items: ['pipe'] } };
        assert.deepEqual(kitFor(rivals, 'z', 'a'), ['pipe']);
        assert.equal(kitFor(rivals, 'z', 'b'), null);
        assert.equal(kitFor(rivals, 'y', 'a'), null);
    });
    test('settling drops what the rival used or lost, and never counts its own spare', () => {
        // took 2 bandages; it has used one; its own kit has a bandage too
        assert.deepEqual(settleItems(['bandage', 'bandage'], ['bandage', 'bandage'], ['bandage']), ['bandage']);
        assert.deepEqual(settleItems(['bandage', 'bandage'], ['bandage'], ['bandage']), []);
        assert.deepEqual(settleItems(['pipe', 'rock'], ['rock'], []), ['rock']);
    });
    test('a rival that died before carrying still owes the items; one that carried owes none more', () => {
        const rivals = { z: { id: 'a', items: ['pipe'] } };
        assert.deepEqual(clearRival(rivals, 'z', 'b'), []);
        assert.deepEqual(clearRival(rivals, 'z', 'a'), ['pipe']);
        assert.deepEqual(rivals, {});
        const carrying = { z: { id: 'a', items: ['pipe'] } };
        markCarrying(carrying, 'z', 'a');
        assert.deepEqual(clearRival(carrying, 'z', 'a'), []);
        assert.deepEqual(carrying, {});
    });
    test('a damaged save is never trusted', () => {
        assert.deepEqual(sanitizeRivals(null), {});
        assert.deepEqual(sanitizeRivals([1]), {});
        assert.deepEqual(sanitizeRivals({ z: 7, y: { id: 3, items: ['a'] }, x: { id: 'a', items: [] }, w: { id: 'a', items: 'pipe' } }), {});
        assert.deepEqual(sanitizeRivals({ z: { id: 'a', items: ['pipe', 4, ''], carrying: true, junk: 1 } }),
            { z: { id: 'a', items: ['pipe'], carrying: true } });
    });
});

// ── The game side: real main.js methods on a staged game ────────────────────

const mainSrc = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
function liveMethod(signature, freeVars, { async = false } = {}) {
    const at = mainSrc.indexOf(signature, mainSrc.indexOf('class Game {'));
    assert.ok(at > 0, `${signature} not found in main.js`);
    const body = mainSrc.slice(at + signature.indexOf('('), mainSrc.indexOf('\n    }', at) + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return ${async ? 'async ' : ''}function ${body}`)(...names.map(n => freeVars[n]));
}

const STATE = { IDLE: 'idle', DEAD: 'dead' };
const MAPS = {};
const mapJson = (url) => (MAPS[url] ||= JSON.parse(readFileSync(new URL(`../game/${url}`, import.meta.url), 'utf8')));

const CANYON = 'canyon-map.json';
const OUT = 'town-map.json';

function game({ pack = [['pipe', 1]] } = {}) {
    const timers = [];
    const inventory = Array(SAFE_SLOTS).fill(null);
    for (const [id, count] of pack) inventory.push({ itemDef: resolveItemDef(id), count });
    const free = {
        STATE, audio: { playSfx() {}, playMusic() {} }, SAFE_SLOTS, isBoss, pickScenario, partitionInventory, matchTake,
        DEFEAT_SCENARIOS, setTimeout: (fn) => timers.push(fn),
        loadMap: async (url) => new GameMap(mapJson(url), url),
        document: { getElementById: () => null },
        spawnEnemy, resolveSpawn, deadIds, pendingDrops, recordDrop, takeDrop, recordKill, stepRespawns, bossDropOnce,
        transferGold, dropLoadout, requiredDropFor, dropLineFor, ITEMS, onSewerEnemyKilled() {},
        canBeRival, itemIdsOf, recordDefeat, kitFor, markCarrying, settleItems, clearRival,
    };
    const g = {
        state: STATE.IDLE, timers, inventory, equipment: { weapon: null }, gold: 0,
        slots: defaultPicks(), map: null, _mapUrl: null, enemies: [], groundItems: [], logs: [],
        playerX: 0, playerY: 0, playerHp: 0, playerMaxHp: 100, playerMp: 0, playerMaxMp: 50, buffs: [],
        rng: { float: () => 0, getState: () => 0, setState() {} },
        _heldDirKeys: [], _physicalHeld: new Set(),
        _collectedItems: new Set(), _droppedItems: {}, _muggedIds: new Set(), _robbed: {},
        _respawnLists: {}, _rivals: {}, _bossDropsGiven: new Set(), _pendingFollowers: null,
        renderer: { dropFightFog() {} }, questEngine: null,
        _stopAutoRepeat() {}, _flash() {}, _render() {}, _resumeHeldWalk() {}, _deAggroAll() {}, autosave() {},
        _skipTime() {}, _spawnStash() {}, _endBuybacks() {}, _advanceDayClock() {}, _openBridgeIfCarFixed() {},
        _resolveItemDef: resolveItemDef, _addToInventory() { return true; },
        _log(m) { this.logs.push(m); }, _spawnEventWord() {}, emitGameEvent() {}, _grantItem() {},
    };
    for (const sig of ['_die() {', '_resolveDefeat() {', '_runBossRetry(boss) {', '_runScenario(pick, _ctx) {',
        '_resolveWakeCell(wakeAt) {', '_safeRespawnCell() {', '_applyTake(take) {',
        '_handleEnemyDeath(enemyObj) {', '_rememberKill(enemyObj) {', '_bossFirstFall(enemyObj, required) {',
        '_zoneChange() {', '_recordDrop(', '_takeDropRecord(',
        '_rememberRival(by, taken) {', '_rivalKit(url, id) {', '_rivalArrived(url) {', '_settleRival() {',
        '_clearRival(enemyObj) {']) {
        g[sig.slice(0, sig.indexOf('('))] = liveMethod(sig.endsWith('(') ? `    ${sig}` : sig, free);
    }
    g._loadMap = liveMethod('    async _loadMap(', free, { async: true });
    return g;
}

const held = (g) => g.inventory.filter(Boolean).map(s => s.itemDef.id);
const nameOf = (id) => resolveItemDef(id).name;
const find = (g, id) => g.enemies.find(e => e.id === id);

// A real door: the lists and the rival's record take a step, then the next map loads.
const walkTo = async (g, url) => { g._zoneChange(); await g._loadMap(url); };

// Lose to `by`: the blow lands, _die runs, and its timer resolves the defeat.
function lose(g, by) {
    g._lastDefeatedBy = by;
    g._die();
    assert.equal(g.state, STATE.DEAD);
    g.timers.splice(0).forEach(fn => fn());
    assert.equal(g.state, STATE.IDLE);
}

async function inCanyon(opts) {
    const g = game(opts);
    await g._loadMap(CANYON);
    return g;
}

describe('beaten by an ordinary enemy, leave, come back', () => {
    test('the same enemy is at its post carrying what it took, and the panel names it', async () => {
        const g = await inCanyon();
        const rat = find(g, 'canyon-rat-1');
        lose(g, rat);
        assert.deepEqual(held(g), [], 'the pipe is gone from your bag');
        assert.deepEqual(g._rivals, { [CANYON]: { id: 'canyon-rat-1', items: ['pipe'] } });
        assert.deepEqual(rat.loadout, [], 'it only becomes a rival the next time you enter (NE1R1 a)');

        await walkTo(g, OUT);
        await walkTo(g, CANYON);
        const back = find(g, 'canyon-rat-1');
        assert.ok(back && back !== rat, 'rebuilt from the map, at its post');
        assert.deepEqual(back.loadout, ['pipe']);
        assert.equal(back.equipped?.length ?? 0, 0, 'it carries the pipe, it does not wear it (NE1R2 a)');
        assert.deepEqual(targetPanel(back).kit.map(k => k.name), [nameOf('pipe')]);
        assert.equal(g._rivals[CANYON].carrying, true);
        // The other rat is a plain one.
        assert.deepEqual(find(g, 'canyon-rat-2').loadout, []);
    });

    test('killing it hands the items over through the kill loot, and the record is gone', async () => {
        const g = await inCanyon();
        lose(g, find(g, 'canyon-rat-1'));
        await walkTo(g, OUT);
        await walkTo(g, CANYON);
        const rat = find(g, 'canyon-rat-1');
        rat.entity.hp = 0; rat.entity.alive = false;
        g._handleEnemyDeath(rat);
        assert.deepEqual(g.groundItems.map(i => i.type), ['pipe'], 'the stand-in has no bag, so it lands on the floor');
        assert.deepEqual(g._rivals, {});
        assert.ok(g._muggedIds.has('canyon-rat-1'));
        // It comes back later as a plain enemy, through the existing respawn list.
        for (let i = 0; i < RESPAWN_STEPS; i++) await walkTo(g, i % 2 ? CANYON : OUT);
        await g._loadMap(CANYON);
        const again = find(g, 'canyon-rat-1');
        assert.ok(again, 'it is back');
        assert.deepEqual(again.loadout, []);
        assert.equal(again.gold, 0);
    });

    test('beating it in the same visit, before it carried anything, still gives the items back', async () => {
        const g = await inCanyon();
        const rat = find(g, 'canyon-rat-1');
        lose(g, rat);
        rat.entity.hp = 0; rat.entity.alive = false;
        g._handleEnemyDeath(rat);
        assert.deepEqual(g.groundItems.map(i => i.type), ['pipe']);
        assert.deepEqual(g._rivals, {});
    });

    test('Thieve can lift them back, and leaving never hands you a second copy', async () => {
        const g = await inCanyon();
        lose(g, find(g, 'canyon-rat-1'));
        await walkTo(g, OUT);
        await walkTo(g, CANYON);
        const rat = find(g, 'canyon-rat-1');
        const took = kitTake(rat, (id) => resolveItemDef(id));       // the real Thieve arithmetic
        assert.equal(took.id, 'pipe');
        (g._robbed[rat.id] ||= { gold: 0, items: [], weightTaken: 0, noticed: false }).items.push(took.id);
        await walkTo(g, OUT);
        assert.deepEqual(g._rivals, {}, 'nothing left on the record');
        await walkTo(g, CANYON);
        assert.deepEqual(find(g, 'canyon-rat-1').loadout, [], 'no second pipe');
    });

    test('something it used up comes off the record too', async () => {
        const g = await inCanyon({ pack: [['pipe', 1], ['rock', 2]] });
        lose(g, find(g, 'canyon-rat-1'));
        assert.deepEqual(g._rivals[CANYON].items, ['pipe']);
        g.inventory.push({ itemDef: resolveItemDef('bandage'), count: 2 });
        await walkTo(g, OUT);
        await walkTo(g, CANYON);
        const rat = find(g, 'canyon-rat-1');
        rat.loadout = [];                                              // it used what it carried
        await walkTo(g, OUT);
        await walkTo(g, CANYON);
        assert.deepEqual(find(g, 'canyon-rat-1').loadout, []);
        assert.deepEqual(g._rivals, {});
    });
});

describe('who does not become a rival', () => {
    test('a boss: the defeat is the boss retry, and nothing is taken', async () => {
        const g = await inCanyon();
        const pike = find(g, 'pike');
        assert.ok(isBoss(pike));
        lose(g, pike);
        assert.deepEqual(held(g), ['pipe'], 'the retry takes nothing');
        assert.deepEqual(g._rivals, {});
    });

    test('a hazard (sludge, a fall) has no one to remember', async () => {
        const g = await inCanyon();
        lose(g, { cause: 'sludge' });
        assert.deepEqual(g._rivals, {});
    });

    test('a summon and a sewer escape rat, which the map never placed', async () => {
        const g = await inCanyon();
        const summon = spawnEnemy({ id: 'summon_1', type: 'Rat', x: 2, y: 2, hp: 1, damage: 3 });
        const rat = spawnEnemy({ id: 'rat_7', type: 'Rat', x: 3, y: 2, hp: 1, damage: 3, tag: 'sewer_rat' });
        g.enemies.push(summon, rat);
        lose(g, summon);
        lose(g, rat);
        assert.deepEqual(g._rivals, {});
    });

    test('a robbery that goes to a stash is not carried by the enemy', async () => {
        const g = await inCanyon();
        const scenario = { consequence: { hp: 0.6, take: { loot: 'all', recoverable: true } } };
        g._runScenario(scenario, { by: find(g, 'canyon-rat-1') });
        assert.deepEqual(g._rivals, {});
    });

    test('a defeat that took nothing makes no rival', async () => {
        const g = await inCanyon({ pack: [] });
        lose(g, find(g, 'canyon-rat-1'));
        assert.deepEqual(g._rivals, {});
    });
});

describe('one rival per zone', () => {
    test('a second enemy beating you does not make another', async () => {
        const g = await inCanyon({ pack: [['pipe', 1], ['rock', 2]] });
        lose(g, find(g, 'canyon-rat-1'));
        g.inventory.push({ itemDef: resolveItemDef('foil_hat'), count: 1 });
        lose(g, find(g, 'canyon-rat-2'));
        assert.deepEqual(g._rivals, { [CANYON]: { id: 'canyon-rat-1', items: ['pipe'] } }, 'the first holds the post');
        await walkTo(g, OUT);
        await walkTo(g, CANYON);
        assert.deepEqual(find(g, 'canyon-rat-2').loadout, []);
    });

    test('if the rival beats you again, its kit grows', async () => {
        const g = await inCanyon();
        lose(g, find(g, 'canyon-rat-1'));
        await walkTo(g, OUT);
        await walkTo(g, CANYON);
        g.inventory.push({ itemDef: resolveItemDef('foil_hat'), count: 1 });
        const rat = find(g, 'canyon-rat-1');
        lose(g, rat);
        assert.deepEqual(rat.loadout, ['pipe', 'foil_hat'], 'now, while it is carrying');
        await walkTo(g, OUT);
        await walkTo(g, CANYON);
        assert.deepEqual(find(g, 'canyon-rat-1').loadout, ['pipe', 'foil_hat']);
    });

    test('a looted enemy that later beats you still carries your things', async () => {
        const g = await inCanyon({ pack: [['pipe', 1]] });
        g._muggedIds.add('canyon-rat-1');                              // it was robbed or killed before
        lose(g, find(g, 'canyon-rat-1'));
        await walkTo(g, OUT);
        await walkTo(g, CANYON);
        const rat = find(g, 'canyon-rat-1');
        assert.deepEqual(rat.loadout, ['pipe']);
        assert.equal(rat.gold, 0, 'still broke');
    });
});

// ── The save ────────────────────────────────────────────────────────────────

function saveGame(g) {
    return Object.assign(g, {
        turn: 0, facing: 'down', tempEquips: [], containers: [], _tileDiffs: [],
        _pendingTransition: null, _sewerEscape: null, setTile() {}, questEngine: new QuestEngine(g),
    });
}
const roundTrip = (g) => JSON.parse(JSON.stringify(serialize(g)));
const blankSave = () => saveGame(game({ pack: [] }));

describe('the save keeps the rival', () => {
    test('a run with no defeat saves with no rival field at all', async () => {
        const g = blankSave();
        await g._loadMap(CANYON);
        assert.ok(!('rivals' in serialize(g).world));
    });

    test('before it carries anything: the record comes back and the zone still hands it over', async () => {
        const g = saveGame(game());
        await g._loadMap(CANYON);
        lose(g, find(g, 'canyon-rat-1'));
        g.equipment = {}; g.inventory = [];
        const blob = roundTrip(g);
        assert.deepEqual(blob.world.rivals, { [CANYON]: { id: 'canyon-rat-1', items: ['pipe'] } });

        const g2 = blankSave();
        await loadInto(g2, blob);
        assert.deepEqual(g2._rivals, { [CANYON]: { id: 'canyon-rat-1', items: ['pipe'] } });
        assert.deepEqual(find(g2, 'canyon-rat-1').loadout, [], 'saved before it carried: not carrying yet');
        await walkTo(g2, OUT);
        await walkTo(g2, CANYON);
        assert.deepEqual(find(g2, 'canyon-rat-1').loadout, ['pipe']);
    });

    test('while it carries: the saved enemy keeps the kit and the record is not applied twice', async () => {
        const g = saveGame(game());
        await g._loadMap(CANYON);
        lose(g, find(g, 'canyon-rat-1'));
        await walkTo(g, OUT);
        await walkTo(g, CANYON);
        g.equipment = {}; g.inventory = [];
        const blob = roundTrip(g);
        assert.equal(blob.world.rivals[CANYON].carrying, true);

        const g2 = blankSave();
        await loadInto(g2, blob);
        assert.deepEqual(g2._rivals, g._rivals);
        assert.deepEqual(find(g2, 'canyon-rat-1').loadout, ['pipe'], 'one pipe, not two');
    });

    test('an older save loads with no rival and no error, and a stale one is dropped', async () => {
        const g = blankSave();
        await g._loadMap(CANYON);
        const blob = roundTrip(g);
        assert.deepEqual(migrate(blob).world.rivals, {});
        const g2 = blankSave();
        g2._rivals = { stale: { id: 'x', items: ['pipe'] } };
        await loadInto(g2, blob);
        assert.deepEqual(g2._rivals, {});
        const broken = roundTrip(g);
        broken.world.rivals = { [CANYON]: 'junk' };
        assert.deepEqual(migrate(broken).world.rivals, {});
    });
});

describe('main.js wires it', () => {
    test('the constructor and Restart both start the record empty', () => {
        const starts = mainSrc.match(/this\._rivals = \{\};/g) || [];
        assert.equal(starts.length, 2, 'once in the constructor, once in _fullReset beside the respawn lists');
    });
});
