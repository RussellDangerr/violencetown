// fire-blood.test.js — Fire Blood (plans/poisons.md stage 1).
//
// Fire Blood replaced the Fire Bottle. Whoever it burns also gets fire blood;
// while both last, every hit they land sets the target burning. The victim
// never gets fire blood, so it never chains.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ITEMS, resolveThrow } from '../game/items.js';
import { BUFF_DEFS } from '../game/buffs.js';
import { itemActions } from '../game/inspector.js';
import { Enemy } from '../game/enemies.js';

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');

function liveMethod(signature, freeVars = {}) {
    const at = mainSrc.indexOf(signature, mainSrc.indexOf('class Game {'));
    assert.ok(at > 0, `${signature} not found in main.js`);
    const body = mainSrc.slice(at + signature.indexOf('('), mainSrc.indexOf('\n    }', at) + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
}
function liveConst(name) {
    const m = new RegExp(`\\nconst ${name}\\s*=\\s*([^;]+);`).exec(mainSrc);
    assert.ok(m, `const ${name} not found in main.js`);
    return new Function(`'use strict'; return ${m[1]}`)();
}

const FIRE_BLOOD_TICK = liveConst('FIRE_BLOOD_TICK');
const FIRE_BLOOD_SPREAD_TURNS = liveConst('FIRE_BLOOD_SPREAD_TURNS');
const methods = {
    _hasFireBlood: liveMethod('_hasFireBlood(who) {'),
    _ignite: liveMethod('_ignite(who, turns) {', { FIRE_BLOOD_TICK }),
    _grantFireBlood: liveMethod('_grantFireBlood(who, turns) {'),
    _applyFireBlood: liveMethod('_applyFireBlood(who, turns) {'),
    _spreadFireBlood: liveMethod('_spreadFireBlood(attacker, target) {', { FIRE_BLOOD_SPREAD_TURNS }),
};

// The Game side: the player is the Game itself, with a buff list.
function playerGame() {
    const g = { buffs: [], logs: [], _log(m) { this.logs.push(m); }, ...methods };
    g.hasBuff = (id) => g.buffs.some(b => b.id === id);
    return g;
}
const foe = (over = {}) => new Enemy({ id: 'f1', type: 'Red Fungus', x: 3, y: 3, hp: 100, damage: 5,
                                        allegiance: 'hostile', behavior: ['HOSTILE'], ...over });
const buff = (who, id) => who.buffs.find(b => b.id === id);

describe('the item', () => {
    test('Fire Blood is a thrown, drinkable fire poison: 5 a turn for 5 turns', () => {
        const d = ITEMS.fire_blood;
        assert.equal(d.useType, 'throw');
        assert.equal(d.drinkable, true);
        assert.equal(d.fireBlood, true);
        assert.equal(d.category, 'poition');
        assert.deepEqual(d.poition, { stat: 'health', amount: -5, turns: 5, as: 'fire' });
    });
    test('the device offers Drink as its primary row', () => {
        assert.deepEqual(itemActions(ITEMS.fire_blood, 'pack').map(a => a.id), ['drink', 'protect', 'drop']);
    });
    test('fire blood is a rider with no tick of its own', () => {
        assert.ok(BUFF_DEFS.fire_blood);
        assert.equal(BUFF_DEFS.fire_blood.onTick, undefined);
    });
});

describe('the spread', () => {
    test('a burning, fire-blooded attacker sets its target burning for 3 turns', () => {
        const g = playerGame();
        g._applyFireBlood(g, 5);
        const f = foe();
        g._spreadFireBlood(g, f);
        assert.deepEqual({ turns: buff(f, 'fire').turns, dmg: buff(f, 'fire').dmg },
                         { turns: FIRE_BLOOD_SPREAD_TURNS, dmg: FIRE_BLOOD_TICK });
        assert.equal(FIRE_BLOOD_SPREAD_TURNS, 3);
        assert.match(g.logs.at(-1), /catches fire/);
    });

    test('the victim does not get fire blood, so it never chains', () => {
        const g = playerGame();
        g._applyFireBlood(g, 5);
        const a = foe(), b = foe({ id: 'f2' });
        g._spreadFireBlood(g, a);
        assert.equal(buff(a, 'fire_blood'), undefined);
        g._spreadFireBlood(a, b);
        assert.equal(buff(b, 'fire'), undefined, 'a victim of the spread passed it on');
    });

    test('it needs both: fire blood without the burn, or a burn without fire blood, spreads nothing', () => {
        const g = playerGame();
        g._grantFireBlood(g, 5);
        const f = foe();
        g._spreadFireBlood(g, f);
        assert.equal(buff(f, 'fire'), undefined);
        const h = playerGame();
        h._ignite(h, 5);
        h._spreadFireBlood(h, f);
        assert.equal(buff(f, 'fire'), undefined);
    });

    test('a longer burn already running is kept', () => {
        const g = playerGame();
        g._applyFireBlood(g, 5);
        const f = foe();
        f.buffs.push({ id: 'fire', name: 'Burning', turns: 7, type: 'debuff', dmg: 5 });
        g._spreadFireBlood(g, f);
        assert.equal(buff(f, 'fire').turns, 7);
        assert.equal(f.buffs.filter(b => b.id === 'fire').length, 1);
    });

    test('a dead target is left alone', () => {
        const g = playerGame();
        g._applyFireBlood(g, 5);
        const f = foe();
        f.entity.hp = 0; f.entity.alive = false;
        g._spreadFireBlood(g, f);
        assert.equal(buff(f, 'fire'), undefined);
    });

    test('a fire-blooded enemy sets YOU burning', () => {
        const g = playerGame();
        const f = foe();
        g._applyFireBlood(f, 5);
        g._spreadFireBlood(f, g);
        assert.equal(buff(g, 'fire').turns, 3);
        assert.match(g.logs.at(-1), /You catch fire/);
    });

    test('every hit seam carries it: your hits, an enemy hit on you, an ally hit', () => {
        const body = (sig) => { const at = mainSrc.indexOf(sig); return mainSrc.slice(at, mainSrc.indexOf('\n    }', at)); };
        assert.match(body('    combatAttack(enemyObj, damage, opts = {}) {'), /this\._spreadFireBlood\(this, enemyObj\)/);
        assert.match(body('    applyDamageToPlayer(rawDamage, attacker = null) {'), /this\._spreadFireBlood\(attacker, this\)/);
        assert.match(body('    _allyTakeTurn(ally) {'), /this\._spreadFireBlood\(ally, target\)/);
    });
});

describe('the thrown burst', () => {
    test('whoever the burst burns also gets fire blood, for as long', () => {
        const f = foe();
        let granted = null;
        const game = {
            playerX: 0, playerY: 3, enemies: [f], _MOVE_MS: 150,
            map: { isWalkable: () => true },
            _entitiesInRadius: (x, y, r) => [f].filter(e => Math.max(Math.abs(e.x - x), Math.abs(e.y - y)) <= r),
            _grantFireBlood(who, turns) { granted = { who, turns }; },
        };
        resolveThrow(game, ITEMS.fire_blood, null, 1, { x: 3, y: 3 });
        assert.equal(buff(f, 'fire').turns, 5);
        assert.deepEqual(granted, { who: f, turns: 5 });
    });
});
