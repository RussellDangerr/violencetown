// quest-cape.test.js — QC2: finishing every quest gives you the [Lava Cape]
// (plans/qc2-quest-cape.md). +6 melee while worn (QC2R2 a), weapon swings only.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as combat from '../game/combat.js';
import { isBoss } from '../game/defeat-scenarios.js';
import { ITEMS } from '../game/items.js';
import { QUESTS, QuestEngine } from '../game/quests.js';
import { itemSprite, UNKNOWN_ITEM_SPRITE } from '../game/sprites.js';

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');

function liveMethod(name, params, freeVars = {}) {
    const at = mainSrc.indexOf(`${name}(${params}) {`);
    assert.ok(at > 0, `${name} not found in main.js`);
    const closeAt = mainSrc.indexOf('\n    }', at);
    const body = mainSrc.slice(at + name.length, closeAt + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
}

const seen = [];
const combatAttack = liveMethod('combatAttack', 'enemyObj, damage, opts = {}', {
    ...combat, isBoss, computeHit: (b) => { seen.push(b); return 0; },
});
function flatsOf(equipment, opts, poition = 0) {
    seen.length = 0;
    const game = { playerX: 1, playerY: 1, ringMods: {}, equipment, _poitionMod: () => poition, _log() {} };
    combatAttack.call(game, { x: 5, y: 5, type: 't', entity: {} }, 10, opts);
    assert.equal(seen.length, 1);
    return seen[0].flats;
}

describe('the Lava Cape item', () => {
    const cape = ITEMS.lava_cape;
    test('is a back-slot equip named in brackets, better than the red cape', () => {
        assert.equal(cape.name, '[Lava Cape]');
        assert.equal(cape.equipSlot, 'back');
        assert.equal(cape.useType, 'equip');
        assert.equal(cape.meleeBonus, 6);
        assert.ok(cape.armor >= ITEMS.red_cape.armor);
    });
    test('has an icon of its own', () => {
        assert.notEqual(itemSprite('lava_cape'), UNKNOWN_ITEM_SPRITE);
    });
});

describe('the +6 reaches weapon swings only', () => {
    const wearing = { back: ITEMS.lava_cape };
    test('a weapon swing gains 6, on top of a strength poition', () => {
        assert.equal(flatsOf({}, { weapon: {} }), 0);
        assert.equal(flatsOf(wearing, { weapon: {} }), 6);
        assert.equal(flatsOf(wearing, { weapon: {} }, 6), 12);
    });
    test('a spell or smash (no weapon) gains nothing', () => {
        assert.equal(flatsOf(wearing, { type: 'fire' }), 0);
        assert.equal(flatsOf(wearing, {}), 0);
    });
    test('a game with no equipment record still swings', () => {
        assert.equal(flatsOf(undefined, { weapon: {} }), 0);
    });
});

describe('the quest that completes the set grants it, once', () => {
    function engine() {
        const granted = [];
        const game = { _grantItem: (id) => { granted.push(id); return true; }, _render() {}, turn: 0 };
        return { qe: new QuestEngine(game), granted };
    }
    const ids = Object.keys(QUESTS);
    // The quests' own onComplete rewards need a whole game; only the grant is under test here.
    const saved = ids.map(id => QUESTS[id].onComplete);
    before(() => ids.forEach(id => { QUESTS[id].onComplete = undefined; }));
    after(() => ids.forEach((id, i) => { QUESTS[id].onComplete = saved[i]; }));
    test('the set is not empty', () => assert.ok(ids.length >= 2));
    test('nothing until the last one; then exactly one cape', () => {
        const { qe, granted } = engine();
        ids.slice(0, -1).forEach(id => qe.forceComplete(id));
        assert.deepEqual(granted, []);
        qe.forceComplete(ids[ids.length - 1]);
        assert.deepEqual(granted, ['lava_cape']);
        qe._complete();   // a stray completion must not grant a second
        assert.deepEqual(granted, ['lava_cape']);
    });
    test('it is the last-finished quest, in any order', () => {
        const { qe, granted } = engine();
        [...ids].reverse().forEach(id => qe.forceComplete(id));
        assert.deepEqual(granted, ['lava_cape']);
    });
});
