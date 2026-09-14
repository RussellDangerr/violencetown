// fight-start.test.js — main.js notices a fight's edges, and stamps how it began
// (plans/fight-fog.md §2).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fighters } from '../game/fight-area.js';
import { fightStartKind, entranceFor, ENTRANCES } from '../game/fight-entrance.js';
import { Enemy } from '../game/enemies.js';
import { tickNpcState } from '../game/npc.js';
import { emitNoise, NOISE } from '../game/perception.js';

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');

// A method lifted out of main.js and run against a stand-in `this`, as
// tests/hunting-state.test.js does.
function liveMethod(name, params, freeVars = {}) {
    const signature = `${name}(${params}) {`;
    const at = mainSrc.indexOf(signature);
    assert.ok(at > 0, `${name}(${params}) not found in main.js`);
    const closeAt = mainSrc.indexOf('\n    }', at);
    const body = mainSrc.slice(at + name.length, closeAt + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
}
const methodBody = (signature) => {
    const at = mainSrc.indexOf(signature);
    assert.ok(at > 0, `${signature} not found in main.js`);
    return mainSrc.slice(at, mainSrc.indexOf('\n    }', at));
};

const STATE = { DEAD: 'dead', IDLE: 'idle' };
const trackFight = liveMethod('_trackFight', '', { fighters, fightStartKind, entranceFor, STATE });

function world(enemies, over = {}) {
    const g = {
        enemies, turn: 7, state: STATE.IDLE, loops: 0, dropped: 0,
        _ensureParticleLoop() { this.loops++; },
        renderer: { dropFightFog: () => { g.dropped++; } },
        ...over,
    };
    return g;
}
const foe = (state, over = {}) => ({ state, entity: { isAlive: () => true }, sightRange: 8, x: 5, y: 5, ...over });

describe("a fight's edges", () => {
    test('the first fighter starts it: how, when, and which entrance', () => {
        const g = world([foe('chasing')]);
        trackFight.call(g);
        assert.equal(g._fightOn, true);
        assert.equal(g._fightStart.kind, 'spotted');
        assert.equal(g._fightStart.entrance, ENTRANCES.spotted);
        assert.equal(typeof g._fightStart.at, 'number');
        assert.ok(g.loops > 0, 'the render loop starts, so the entrance plays');
    });

    test('it stamps once, not every frame', () => {
        const g = world([foe('chasing')]);
        trackFight.call(g);
        const first = g._fightStart;
        trackFight.call(g);
        assert.equal(g._fightStart, first);
    });

    test('the last one leaving ends it, and notes when', () => {
        const g = world([foe('chasing')]);
        trackFight.call(g);
        g.enemies[0].state = 'returning';
        trackFight.call(g);
        assert.equal(g._fightOn, false);
        assert.equal(typeof g._fightEndedAt, 'number');
        assert.equal(g.dropped, 0, 'an ordinary end fades');
    });

    test('a fight that restarts inside 3 s gets no second entrance', () => {
        const g = world([foe('chasing')]);
        trackFight.call(g);
        g.enemies[0].state = 'returning';
        trackFight.call(g);
        g.enemies[0].state = 'chasing';
        trackFight.call(g);
        assert.equal(g._fightOn, true);
        assert.equal(g._fightStart.entrance, null);
    });

    test('dying ends it at once, without the fade', () => {
        const g = world([foe('chasing')]);
        trackFight.call(g);
        g.state = STATE.DEAD;
        trackFight.call(g);
        assert.equal(g._fightOn, false);
        assert.equal(g.dropped, 1);
    });
});

describe('each way a fight starts stamps the right kind', () => {
    const start = (g) => { trackFight.call(g); return g._fightStart.kind; };

    test('a sighting: they spotted you', () => {
        assert.equal(start(world([foe('chasing')])), 'spotted');
    });

    test('hitting someone who is not hostile: combatAttack notes the blow, _onEntityHarmed turns them', () => {
        const npc = foe('idle');
        const g = world([npc]);
        npc._struckAt = g.turn;      // what combatAttack does
        npc.state = 'chasing';       // what _onEntityHarmed does
        assert.equal(start(g), 'struck');
    });

    test('hitting a hostile enemy from its blind spot: the noise turns it, its own turn makes it search', () => {
        const g = { playerX: 5, playerY: 1, enemies: [], containers: [], turn: 7, _MOVE_MS: 150,
            map: { isWalkable: (x, y) => x >= 0 && y >= 0 && x < 11 && y < 5 },
            rng: { pick: (a) => a[0], float: () => 0.5 }, applyDamageToPlayer() {} };
        const e = new Enemy({ id: 'h1', type: 'Rat', x: 5, y: 2, sightRange: 8, facing: 'S' });   // you are behind it
        assert.equal(e.allegiance, 'hostile');
        g.enemies.push(e);
        e._struckAt = g.turn;                                  // the blow (combatAttack)
        emitNoise([e], g.playerX, g.playerY, NOISE.melee);     // fighting is loud
        assert.equal(e.state, 'suspicious');
        g.turn++;                                              // the world beat
        tickNpcState(g, e, g.turn);
        assert.equal(e.state, 'searching', 'you are in its blind spot');
        assert.equal(start(world(g.enemies, { turn: g.turn })), 'struck');
    });

    test('a conversation that sours: they turn on you, but you hit nobody', () => {
        assert.equal(start(world([foe('chasing', { _struckAt: null })])), 'spotted');
    });

    test('a search: suspicion grew into one', () => {
        assert.equal(start(world([foe('searching')])), 'search');
    });
});

describe('main.js wiring', () => {
    test('every frame checks the fight before drawing it', () => {
        const body = methodBody('    _render() {');
        const track = body.indexOf('this._trackFight();');
        assert.ok(track >= 0 && track < body.indexOf('this.renderer.renderFrame(this);'));
    });

    test('combatAttack notes the turn of every blow that lands', () => {
        const body = methodBody('    combatAttack(enemyObj, damage, opts = {}) {');
        const stamp = body.indexOf('enemyObj._struckAt = this.turn;');
        assert.ok(stamp > body.indexOf('const result = attack('), 'after the blow lands');
    });

    test('a zone change drops the fog', () => {
        assert.match(methodBody('    async _loadMap(url, spawnX, spawnY) {'), /this\.renderer\.dropFightFog\(\);/);
    });

    test("the render loop runs while the fog or the entrance moves; the spotlight's ease is gone", () => {
        assert.match(methodBody('    _hasActiveEffects() {'),
            /fightFxActive\(this\._fightOn, this\._fightStart, this\._fightEndedAt, now\)/);
        assert.ok(!mainSrc.includes('_arenaLevel'));
    });
});
