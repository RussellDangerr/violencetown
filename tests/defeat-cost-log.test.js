// defeat-cost-log.test.js — losing adds no debuff, and the log says what the
// defeat took (plans/df1-defeat-cost-log.md, ruling DFR1).
//
// Every defeat here is a real one: main.js's own _die, _resolveDefeat,
// _runScenario, _applyTake and _runBossRetry, lifted out of the source and run
// against a staged game holding real item definitions.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { isBoss, pickScenario, partitionInventory, matchTake, DEFEAT_SCENARIOS } from '../game/defeat-scenarios.js';
import { BUFF_DEFS, tickBuffList } from '../game/buffs.js';
import { resolveItemDef } from '../game/item-registry.js';
import { spawnEnemy } from '../game/enemies.js';
import { SAFE_SLOTS } from '../game/data.js';

const mainSrc = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');

function liveMethod(signature, freeVars = {}) {
    const at = mainSrc.indexOf(signature, mainSrc.indexOf('class Game {'));
    assert.ok(at > 0, `${signature} not found in main.js`);
    const body = mainSrc.slice(at + signature.indexOf('('), mainSrc.indexOf('\n    }', at) + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map((n) => freeVars[n]));
}

const STATE = { IDLE: 'idle', DEAD: 'dead' };
const DEBUFFS = ['rattled', 'hunched', 'sludged'];

// pack: [[itemId, count], ...] placed after the safe slots, so all of it is at risk
// unless the item itself is safe (a quest item).
function stage(zone, pack, { gold = 40, roll = 0 } = {}) {
    const timers = [];
    const inventory = Array(SAFE_SLOTS).fill(null);
    for (const [id, count] of pack) {
        const itemDef = resolveItemDef(id);
        assert.ok(itemDef, `${id} is a real item`);
        inventory.push({ itemDef, count });
    }
    const g = {
        state: STATE.IDLE,
        map: {
            url: `${zone}-map.json`, zoneName: zone,
            spawn: { x: 3, y: 3 }, width: 10, height: 10,
            isInBounds: () => true, isWalkable: () => true, getTileDef: () => ({}),
        },
        playerX: 7, playerY: 7, playerHp: 0, playerMaxHp: 100, playerMp: 0, playerMaxMp: 50,
        gold, buffs: [], logs: [], buffCalls: [], stashes: [],
        inventory,
        equipment: { weapon: null },
        rng: { float: () => roll },
        _heldDirKeys: [], _physicalHeld: new Set(),
        _stopAutoRepeat() {}, _flash() {}, _render() {}, _resumeHeldWalk() {}, _deAggroAll() {},
        autosave() {}, _skipTime() {},
        _spawnStash(_at, ids) { this.stashes.push(ids); },
        _resolveItemDef: resolveItemDef,
        _addToInventory(def) { this.inventory.push({ itemDef: def, count: 1 }); return true; },
        _log(msg) { this.logs.push(msg); },
        addBuff(id) { this.buffCalls.push(id); this.buffs.push({ id }); },
        timers,
    };
    const free = {
        STATE, audio: { playSfx() {} }, SAFE_SLOTS, isBoss, pickScenario, partitionInventory, matchTake,
        DEFEAT_SCENARIOS, setTimeout: (fn) => timers.push(fn),
    };
    for (const sig of ['_die() {', '_resolveDefeat() {', '_runBossRetry(boss) {', '_runScenario(pick, _ctx) {',
        '_resolveWakeCell(wakeAt) {', '_safeRespawnCell() {', '_applyTake(take) {']) {
        g[sig.slice(0, sig.indexOf('('))] = liveMethod(sig, free);
    }
    return g;
}

// Lose to `by`: the blow lands, _die runs, and its timer resolves the defeat.
function lose(g, by) {
    g._lastDefeatedBy = by;
    g._die();
    assert.equal(g.state, STATE.DEAD);
    assert.equal(g.timers.length, 1);
    g.timers.splice(0).forEach((fn) => fn());
    assert.equal(g.state, STATE.IDLE);
}

const grunt = () => spawnEnemy({ id: 'grunt', type: 'Grunt', x: 1, y: 1, hp: 30 });
const wererat = () => spawnEnemy({ id: 'rat', type: 'Wererat', x: 1, y: 1, hp: 30 });
const held = (g) => g.inventory.filter(Boolean).map((s) => s.itemDef.id);
const costLine = (g) => g.logs.filter((l) => /^\[(Taken:|Nothing was taken)/.test(l));

describe('the log says what a defeat cost', () => {
    test('an ordinary defeat names every item taken and the GP lost', () => {
        const g = stage('factory', [['pipe', 1], ['bandage', 3], ['rock', 2], ['foil_hat', 1]]);
        const before = held(g);
        lose(g, grunt());
        const gone = before.filter((id) => !held(g).includes(id));
        assert.ok(gone.length > 0, 'the generic scenario took something');
        assert.ok(g.logs.some((l) => /beaten and dumped/.test(l)), 'the generic scenario ran');
        const lines = costLine(g);
        assert.equal(lines.length, 1, 'one cost line');
        for (const id of gone) assert.ok(lines[0].includes(resolveItemDef(id).name), `${id} is named`);
        for (const id of held(g)) assert.ok(!lines[0].includes(resolveItemDef(id).name), `${id} was kept, so not named`);
        assert.equal(lines[0], '[Taken: [Pipe], [Bandage] x3. GP taken: 0.]');
        assert.equal(g.gold, 40, 'the generic scenario takes no gold');
        assert.equal(g.logs.at(-1), lines[0], 'the cost line follows the scenario line');
    });

    test('a defeat that took nothing says so', () => {
        // Only quest items in the bag: they survive every defeat.
        const g = stage('factory', [['wererat_fur', 1], ['burger_fries', 1]]);
        lose(g, grunt());
        assert.deepEqual(held(g), ['wererat_fur', 'burger_fries']);
        assert.deepEqual(costLine(g), ['[Nothing was taken.]']);
    });

    test('a defeat with an empty bag says nothing was taken', () => {
        const g = stage('factory', []);
        lose(g, grunt());
        assert.deepEqual(costLine(g), ['[Nothing was taken.]']);
    });

    test('a fee in gold alone names the GP and no items', () => {
        // In the sewer a Wererat's eligible scenarios weigh robbed 3, patched 1,
        // beaten 1; a roll of 0.7 lands on Carrion's patch-up, which takes 10% gold.
        const g = stage('sewer', [['pipe', 1]], { roll: 0.7 });
        lose(g, wererat());
        assert.ok(g.logs.some((l) => /Carrion/.test(l)), 'Carrion patched you up');
        assert.equal(g.gold, 36);
        assert.deepEqual(costLine(g), ['[Taken: no items. GP taken: 4.]']);
    });

    test('a robbery you can win back still names everything taken', () => {
        const g = stage('sewer', [['pipe', 1], ['rock', 3]], { roll: 0 });
        lose(g, wererat());
        assert.ok(g.logs.some((l) => /rats rolled you/.test(l)), 'the rats robbed you');
        assert.deepEqual(held(g), []);
        assert.deepEqual(g.stashes, [['pipe', 'rock', 'rock', 'rock']], 'the haul went to the stash');
        assert.deepEqual(costLine(g), ['[Taken: [Pipe], [Rock] x3. GP taken: 0.]']);
    });
});

describe('losing adds no debuff (ruling DFR1)', () => {
    test('no scenario carries a status', () => {
        for (const s of DEFEAT_SCENARIOS) assert.equal(s.consequence.status, undefined, s.id);
    });

    for (const s of DEFEAT_SCENARIOS) {
        test(`${s.id}: no buff after the defeat, and a cost line`, () => {
            const g = stage('sewer', [['pipe', 1], ['bandage', 2], ['tunnel_mushroom', 1]]);
            g.buffs = [{ id: 'fire', turns: 3 }];   // a fight's DoT, cleared by the defeat
            g._runScenario(s, {});
            assert.deepEqual(g.buffCalls, []);
            assert.deepEqual(g.buffs, []);
            assert.equal(costLine(g).length, 1);
        });
    }

    test('a real defeat through _die adds no buff', () => {
        const g = stage('factory', [['pipe', 1]]);
        lose(g, grunt());
        assert.deepEqual(g.buffCalls, []);
        assert.deepEqual(g.buffs, []);
    });

    test('the boss retry adds no buff and takes nothing', () => {
        const g = stage('sewer', [['pipe', 1], ['bandage', 2]]);
        const boss = { boss: true, entity: { hp: 3, maxHp: 50 } };
        lose(g, boss);
        assert.deepEqual(g.buffCalls, []);
        assert.deepEqual(g.buffs, []);
        assert.deepEqual(held(g), ['pipe', 'bandage']);
        assert.equal(boss.entity.hp, 50);
    });

    test('the three dead debuffs are gone from the buff table', () => {
        for (const id of DEBUFFS) assert.equal(BUFF_DEFS[id], undefined, id);
        for (const id of DEBUFFS) assert.ok(!mainSrc.includes(`'${id}'`), `main.js never names ${id}`);
    });

    test('an old save still carrying one ticks off without an error', () => {
        const owner = {};
        const buffs = DEBUFFS.map((id) => ({ id, name: id, turns: 2, type: 'debuff' }));
        const expired = [];
        tickBuffList(buffs, owner, owner, (b) => expired.push(b.id));
        tickBuffList(buffs, owner, owner, (b) => expired.push(b.id));
        assert.deepEqual(buffs, []);
        assert.deepEqual(expired.sort(), [...DEBUFFS].sort());
    });
});
