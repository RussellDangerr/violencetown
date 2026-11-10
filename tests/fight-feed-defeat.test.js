// fight-feed-defeat.test.js — a foe going down reaches the fight panel's feed (plans/ff1-feed-says-foe-down.md).
// Runs the REAL _handleEnemyDeath and _log from main.js on a stand-in game.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { combatLines } from '../game/combat-log.js';
import { dropLoadout } from '../game/drops.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
const mainSrc = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
function liveMethod(signature, freeVars) {
    const at = mainSrc.indexOf(signature, mainSrc.indexOf('class Game {'));
    assert.ok(at > 0, `${signature} not found in main.js`);
    const body = mainSrc.slice(at + signature.indexOf('('), mainSrc.indexOf('\n    }', at) + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
}
const free = {
    audio: { playSfx() {} }, dropLoadout, unnestBrackets: (s) => s, performance,
    transferGold() {}, onSewerEnemyKilled() {}, ITEMS: {}, bossDropOnce: () => false, requiredDropFor: () => null,
};

function game() {
    return {
        _log: liveMethod('    _log(', free),
        _handleEnemyDeath: liveMethod('    _handleEnemyDeath(', free),
        _logHistory: [], _logStripMessages: [], _STRIP_MAX: 3, _LOG_HISTORY_MAX: 300,
        enemies: [], groundItems: [], _muggedIds: new Set(), _droppedItems: {}, _bossDropsGiven: new Set(),
        slots: {}, map: null, inventory: [], gold: 0, questEngine: null,
        _spawnEventWord() {}, emitGameEvent() {}, _render() {}, _saveMoment() {}, _grantItem() {},
        _startLootBurst() {}, _takeKillLoot: () => [], _clearRival: () => [], _alreadyHasRayGun: () => false,
        _rememberKill() {}, _bossFirstFall() {}, _recordDrop() {},
    };
}

test('beating a foe puts its defeat line in the fight feed', () => {
    const g = game();
    const e = { id: 'e1', type: 'rat', x: 1, y: 1, gold: 0, loadout: [], entity: { name: 'Test Foe', hp: 0, isAlive: () => false } };
    g._handleEnemyDeath(e);
    const feed = combatLines(g._logHistory);
    assert.deepEqual(feed.map((m) => m.text), ['[Defeated Test Foe]']);
    assert.ok(g._logStripMessages.some((m) => m.text === '[Defeated Test Foe]'), 'still in the strip');
});
