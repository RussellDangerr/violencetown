// rival-title.test.js — a rival wears a title on its name (plans/ne2-rival-title.md).
//
// The title is reached through real zone changes: main.js's own methods lifted out of the
// source and run on the real canyon map, as rivals.test.js does. The words are placeholders.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { canBeRival, itemIdsOf, recordDefeat, kitFor, markCarrying, settleItems, clearRival } from '../game/rivals.js';
import { isBoss, pickScenario, partitionInventory, matchTake, DEFEAT_SCENARIOS } from '../game/defeat-scenarios.js';
import { resolveItemDef } from '../game/item-registry.js';
import { GameMap } from '../game/map.js';
import { spawnEnemy, shownName, RIVAL_TITLE, RIVAL_RETURN_LINE } from '../game/enemies.js';
import { resolveSpawn, defaultPicks, requiredDropFor, dropLineFor } from '../game/slots.js';
import { transferGold } from '../game/trade.js';
import { ITEMS } from '../game/items.js';
import { SAFE_SLOTS } from '../game/data.js';
import { deadIds, pendingDrops, recordDrop, takeDrop, recordKill, stepRespawns, bossDropOnce, dropLoadout } from '../game/drops.js';
import { targetPanel } from '../game/fight-panels.js';
import { koLabelText } from '../game/renderer.js';
import { serialize, loadInto } from '../game/save.js';
import { QuestEngine } from '../game/quests.js';

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
        STATE, audio: { playSfx() {}, playMusic() {} }, SAFE_SLOTS, isBoss, isStoryBoss: isBoss, pickScenario, partitionInventory, matchTake,
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

// ── The save ────────────────────────────────────────────────────────────────

function saveGame(g) {
    return Object.assign(g, {
        turn: 0, facing: 'down', tempEquips: [], containers: [], _tileDiffs: [],
        _pendingTransition: null, _sewerEscape: null, setTile() {}, questEngine: new QuestEngine(g),
    });
}
const roundTrip = (g) => JSON.parse(JSON.stringify(serialize(g)));
const blankSave = () => saveGame(game({ pack: [] }));

const bare = (s) => String(s).replace(/[[\]]/g, '');
const rivalLogs = (g) => g.logs.filter(m => m === RIVAL_RETURN_LINE);

async function promoted() {
    const g = saveGame(game());
    await g._loadMap(CANYON);
    lose(g, find(g, 'canyon-rat-1'));
    await walkTo(g, OUT);
    await walkTo(g, CANYON);
    return g;
}

describe('a rival shows its title', () => {
    test('the nameplate, the panel, the KO tag and the log use the title; others keep their type', async () => {
        const g = await promoted();
        const rat = find(g, 'canyon-rat-1'), other = find(g, 'canyon-rat-2');
        assert.equal(rat.rival, true);
        assert.equal(shownName(rat), `${RIVAL_TITLE} ${rat.type}`);
        assert.equal(rat.shownName, `${RIVAL_TITLE} ${rat.type}`);
        assert.ok(bare(rat.entity.name).includes(bare(RIVAL_TITLE)), 'the entity name the log reads');
        assert.ok(koLabelText(rat).includes(RIVAL_TITLE.toUpperCase()));
        assert.equal(other.rival, undefined);
        assert.equal(shownName(other), other.type);
        assert.ok(!koLabelText(other).includes(RIVAL_TITLE.toUpperCase()));
    });

    test('before it was promoted, the same enemy shows its plain type', async () => {
        const g = saveGame(game());
        await g._loadMap(CANYON);
        const rat = find(g, 'canyon-rat-1');
        lose(g, rat);
        assert.equal(shownName(rat), rat.type);
        assert.ok(!bare(rat.entity.name).includes(bare(RIVAL_TITLE)));
    });

    test('entering the zone logs one line, once per entry, not per step', async () => {
        const g = await promoted();
        assert.equal(rivalLogs(g).length, 1);
        await walkTo(g, OUT);
        assert.equal(rivalLogs(g).length, 1, 'leaving logs nothing');
        await walkTo(g, CANYON);
        assert.equal(rivalLogs(g).length, 2, 'the next entry logs again');
    });

    test('the title survives a save and load', async () => {
        const g = await promoted();
        g.equipment = {}; g.inventory = [];
        const blob = JSON.parse(JSON.stringify(serialize(g)));
        const g2 = saveGame(game({ pack: [] }));
        await loadInto(g2, blob);
        const rat = find(g2, 'canyon-rat-1');
        assert.equal(rat.rival, true);
        assert.equal(shownName(rat), `${RIVAL_TITLE} ${rat.type}`);
        assert.ok(bare(rat.entity.name).includes(bare(RIVAL_TITLE)));
        assert.equal(find(g2, 'canyon-rat-2').rival, undefined);
    });

    test('an enemy that is no rival saves no rival field', async () => {
        const g = saveGame(game());
        await g._loadMap(CANYON);
        for (const e of g.enemies) assert.ok(!('rival' in JSON.parse(JSON.stringify(e.toSave()))));
    });
});
