// defeat-line-truth.test.js - a scenario's loss line only shows if something was lost (DL1).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isBoss, pickScenario, partitionInventory, matchTake, DEFEAT_SCENARIOS, EMPTY_TAKE_LOG } from '../game/defeat-scenarios.js';
import { resolveItemDef } from '../game/item-registry.js';
import { SAFE_SLOTS } from '../game/data.js';

const mainSrc = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
function liveMethod(signature, free) {
    const at = mainSrc.indexOf(signature, mainSrc.indexOf('class Game {'));
    assert.ok(at > 0, signature);
    const body = mainSrc.slice(at + signature.indexOf('('), mainSrc.indexOf('\n    }', at) + 6);
    return new Function(...Object.keys(free), `'use strict'; return function ${body}`)(...Object.values(free));
}
function stage(pack) {
    const inventory = Array(SAFE_SLOTS).fill(null);
    for (const id of pack) inventory.push({ itemDef: resolveItemDef(id), count: 1 });
    const g = {
        state: 'dead', map: { url: 'sewer-map.json', zoneName: 'sewer', spawn: { x: 3, y: 3 }, width: 10, height: 10,
            isInBounds: () => true, isWalkable: () => true, getTileDef: () => ({}) },
        playerX: 7, playerY: 7, playerHp: 0, playerMaxHp: 100, playerMp: 0, playerMaxMp: 50,
        gold: 0, buffs: [], logs: [], inventory, equipment: { weapon: null },
        _heldDirKeys: [], _physicalHeld: new Set(),
        _render() {}, _resumeHeldWalk() {}, _deAggroAll() {}, autosave() {}, _skipTime() {},
        _spawnStash() {}, _resolveItemDef: resolveItemDef, _addToInventory() { return true; },
        _log(m) { this.logs.push(m); },
    };
    const free = { STATE: { IDLE: 'idle', DEAD: 'dead' }, SAFE_SLOTS, isBoss, pickScenario, partitionInventory, matchTake, DEFEAT_SCENARIOS };
    for (const sig of ['_runScenario(pick, _ctx) {', '_resolveWakeCell(wakeAt) {', '_safeRespawnCell() {', '_applyTake(take) {'])
        g[sig.slice(0, sig.indexOf('('))] = liveMethod(sig, free);
    return g;
}
const byId = (id) => DEFEAT_SCENARIOS.find((s) => s.id === id);

describe('a defeat line only claims a loss that happened', () => {
    for (const id of ['processed_by_fungus', 'robbed_by_wererats', 'swept_into_sludge']) {
        const s = byId(id);
        test(`${id}: nothing takeable gives the generic line, then nothing taken`, () => {
            const g = stage(['wererat_fur', 'burger_fries']);   // quest items only: never taken
            g._runScenario(s, {});
            assert.ok(!g.logs.includes(s.consequence.log), 'the loss line is not shown');
            assert.deepEqual(g.logs, [EMPTY_TAKE_LOG, '[Nothing was taken.]']);
        });
        test(`${id}: a bag with takeable things keeps the scenario's line`, () => {
            const g = stage(['pipe', 'bandage', 'rock', 'tunnel_mushroom', 'foil_hat']);
            g._runScenario(s, {});
            assert.equal(g.logs[0], s.consequence.log);
            assert.match(g.logs.at(-1), /^\[Taken:/);
        });
    }
});
