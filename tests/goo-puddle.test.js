// goo-puddle.test.js - go2: aliens and robots throw goo, and are immune to it.
//
// A real ArrowRight goes through the game's own keydown listener and step (lifted out of
// main.js as in factory-goo.test.js). After each step the world beat runs the real npc.js
// turn for the alien ally (a real `alien_ally` entry, spawned the way the map spawns it), and
// the real _enemyThrow, _layPuddle and _tickPuddles, lifted from main.js.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TILES } from '../game/data.js';
import { ITEMS } from '../game/items.js';
import { ENTRIES, resolveSpawn, defaultPicks } from '../game/slots.js';
import { spawnEnemy } from '../game/enemies.js';
import { tickNpcState } from '../game/npc.js';
import { BUFF_DEFS } from '../game/buffs.js';
import { puddleTiles, layPuddle, puddleAt, dryPuddles } from '../game/puddles.js';
import { isSewerDweller } from '../game/ai.js';
import { elementalMult } from '../game/combat.js';
import { DAMAGE_TYPES, matchup } from '../game/elements.js';

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');
const classAt = mainSrc.indexOf('class Game {');
function liveMethod(signature, freeVars = {}) {
    const start = mainSrc.indexOf(signature, classAt);
    assert.ok(start > 0, `${signature} not found in main.js`);
    const lineEnd = mainSrc.indexOf('\n', start);
    const oneLiner = mainSrc.slice(start, lineEnd).trimEnd().endsWith('}');
    const end = oneLiner ? lineEnd : mainSrc.indexOf('\n    }', start) + '\n    }'.length;
    const body = mainSrc.slice(start + signature.indexOf('('), end);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
}
function liveConst(name) {
    const m = new RegExp(`\\nconst ${name}\\s*=\\s*`).exec(mainSrc);
    assert.ok(m, `const ${name} not found in main.js`);
    const from = m.index + m[0].length;
    return new Function(`'use strict'; return ${mainSrc.slice(from, mainSrc.indexOf('\n};', from) + 2)}`)();
}
const STATE = liveConst('STATE');
const DIRS = liveConst('DIRS');
const SLUDGE_DURATION = Number(/\nconst SLUDGE_DURATION = (\d+);/.exec(mainSrc)[1]);
const SLUDGE_DOT = 5;

class Key extends Event {
    constructor(type, code) {
        super(type, { bubbles: true, cancelable: true });
        this.code = code; this.key = code; this.repeat = false;
        this.ctrlKey = false; this.metaKey = false; this.altKey = false; this.shiftKey = false;
    }
}

const alienAlly = (x, y) => spawnEnemy(resolveSpawn({ id: 'alien-ally-1', entry: 'alien_ally', x, y }, defaultPicks()), new Set());

// An open corridor, the player at x=0 and the alien ally at x=6.
function makeGame() {
    const document = new EventTarget();
    const window = new EventTarget();
    const audio = { init() {}, playMusic() {}, playSfx() {} };
    const byId = Object.values(TILES).reduce((m, t) => (m[t.id] = t, m), {});
    const open = (x, y) => x >= 0 && x < 12 && y >= 0 && y < 8;
    const g = {
        state: STATE.IDLE, facing: 'right', playerX: 0, playerY: 3, buffs: [], logs: [], world: 0, equipment: {},
        enemies: [], containers: [], _stepIndex: 0, _animating: false, _paused: false, turn: 0, _MOVE_MS: 150,
        _physicalHeld: new Set(), _heldDirKeys: [], _queuedMoveDir: null, _pathQueue: [], _pathArrive: null,
        _TURN_MS: 70, _puddles: [], _ratFormTurns: 0,
        rng: { pick: (a) => a[0], float: () => 0.5 },
        map: {
            getTile: () => TILES.FLOOR.id, getTileDef: () => byId[TILES.FLOOR.id], isWalkable: open,
            getAnchor: () => null, getTransition: () => null,
        },
        _log(msg) { this.logs.push(msg); },
        _render() {}, _tryPickup() {}, _ensureParticleLoop() {}, _maybeShowHint() {},
        _closeCurrentMenu() { return false; }, _digitToSlot() { return -1; }, _autoRepeatShouldStop() { return false; },
        _animateMove(fx, fy, tx, ty, done) { this._settle = done; },
        questEngine: { getFlag: () => false },
        applyDamageToPlayer(d) { this.damageTaken = (this.damageTaken ?? 0) + d; },
        messages: [],
        // The world beat: every enemy takes its real turn, then the puddles tick.
        _advanceWorld() {
            this.world++; this.turn++;
            for (const e of this.enemies) {
                const out = tickNpcState(this, e, this.turn);
                for (const m of (Array.isArray(out) ? out : out?.messages ?? [])) this.messages.push(m.text ?? m);
            }
            this._tickPuddles();
        },
    };
    Object.assign(g, {
        _bindInput: liveMethod('_bindInput() {', { document, window, audio, STATE, DIRS, performance: { now: () => 0 } }),
        _doMove: liveMethod('_doMove(dir) {', { audio, SLUDGE_DURATION, defaultVerb() {}, hitBarricade() {} }),
        addBuff: liveMethod('addBuff(id, name, turns, type = \'buff\', extra = {}) {'),
        hasBuff: liveMethod('hasBuff(id) {'),
        _hasSludgeImmunity: liveMethod('_hasSludgeImmunity() {'),
        _canEnter: liveMethod('_canEnter(x, y) {'),
        _faceOf: liveMethod('_faceOf(dir) {'),
        _clearTurnTimer: liveMethod('_clearTurnTimer() {'),
        _noteHeld: liveMethod('_noteHeld(code) {'),
        _intendedWalkDir: liveMethod('_intendedWalkDir() {', { DIRS }),
        _resolveWalkStep: liveMethod('_resolveWalkStep(dir) {'),
        _beginMoveOrTurn: liveMethod('_beginMoveOrTurn(dir) {', { STATE }),
        _onStepSettled: liveMethod('_onStepSettled() {', { STATE }),
        _stopAutoRepeat: liveMethod('_stopAutoRepeat() {'),
        _enemyThrow: liveMethod('_enemyThrow(npc, def) {', { poitionBuff: () => ({}) }),
        _layPuddle: liveMethod('_layPuddle(from, at, kind, turns) {', { puddleTiles, layPuddle }),
        _tickPuddles: liveMethod('_tickPuddles() {', { puddleAt, dryPuddles, isSewerDweller, SLUDGE_DOT, SLUDGE_DURATION }),
    });
    g._bindInput();
    const doc = document;
    g.press = (code) => {
        doc.dispatchEvent(new Key('keydown', code)); doc.dispatchEvent(new Key('keyup', code));
        const s = g._settle; g._settle = null; if (s) s();
    };
    return g;
}

describe('an alien ally throws goo at you', () => {
    test('the ally is a real placed entry: goo in the kit, immune to it', () => {
        const a = alienAlly(6, 3);
        assert.ok(a.loadout.includes('goo'), 'no goo in the kit');
        assert.deepEqual(a.immune, ['goo']);
        assert.equal(a.type, 'Greedy Green');
    });

    test('walking toward it with ArrowRight: it throws, a puddle lies on you, and the Goo chip shows', () => {
        const g = makeGame();
        const a = alienAlly(6, 3);
        g.enemies.push(a);
        a.sightRange = 12;
        let thrown = false;
        for (let i = 0; i < 4 && !thrown; i++) {
            g.press('ArrowRight');
            thrown = g._puddles.length > 0;
        }
        assert.ok(thrown, `no throw; messages ${JSON.stringify(g.messages)}`);
        assert.ok(!a.loadout.includes('goo'), 'the goo left its kit');
        assert.ok(g.messages.some(m => /goo puddle covers/.test(m)), `no throw line: ${g.messages}`);
        for (const p of g._puddles) assert.equal(p.kind, 'goo');
        assert.ok(puddleAt(g._puddles, g.playerX, g.playerY), 'no puddle under you');
        assert.ok(g.hasBuff('goo'), 'no Goo chip');
        assert.equal(g.hasBuff('sludge'), false, 'goo must not sludge');
        const b = g.buffs.find(x => x.id === 'goo');
        assert.equal(b.turns, SLUDGE_DURATION);
        assert.equal(BUFF_DEFS.goo.name.length > 0, true);
    });

    test('bagged feet keep the goo puddle off you', () => {
        const g = makeGame();
        g.equipment.bottom = ITEMS.shoe_bags;
        g._puddles = layPuddle([], [{ x: 0, y: 3 }], 'goo');
        g._tickPuddles();
        assert.equal(g.hasBuff('goo'), false);
    });

    test('a sludge puddle still gives Sludge, not Goo', () => {
        const g = makeGame();
        g._puddles = layPuddle([], [{ x: 0, y: 3 }], 'sludge');
        g._tickPuddles();
        assert.ok(g.hasBuff('sludge'));
        assert.equal(g.hasBuff('goo'), false);
    });
});

describe('goo does nothing to aliens and robots', () => {
    test('an alien ally standing in its own goo puddle is unharmed and unchipped', () => {
        const g = makeGame();
        g.playerX = 9; g.playerY = 7;
        const a = alienAlly(4, 3);
        g.enemies.push(a);
        g._puddles = layPuddle([], [{ x: 4, y: 3 }], 'goo');
        const hp = a.entity.hp;
        for (let i = 0; i < 3; i++) g._tickPuddles();
        assert.equal(a.entity.hp, hp);
        assert.equal(a.buffs.length, 0);
    });

    test('goo is neutral on the chart and a goo hit on an alien does 0', () => {
        assert.equal(DAMAGE_TYPES.goo.phase, null);
        for (const t of Object.keys(DAMAGE_TYPES)) assert.equal(matchup('goo', t), null);
        const a = alienAlly(4, 3);
        assert.equal(elementalMult('goo', a), 0, 'goo hurt the alien');
        assert.equal(elementalMult('goo', { weak: ['fire'] }), 1, 'goo is neutral to a plain foe');
    });
});

describe('who carries it', () => {
    test('the goo item is a thrown, enemy-thrown puddle of kind goo with a placeholder name', () => {
        const d = ITEMS.goo;
        assert.equal(d.useType, 'throw');
        assert.equal(d.enemyThrows, true);
        assert.deepEqual(d.puddle, { kind: 'goo', turns: 8 });
        assert.equal(d.name, 'Goo');
    });
    for (const id of ['alien_ally', 'alien_invasion', 'robot_rat']) {
        test(`${id} carries goo and is immune to it`, () => {
            assert.ok(ENTRIES[id].loadout.includes('goo'));
            assert.deepEqual(ENTRIES[id].immune, ['goo']);
        });
    }
    test('green1 is left alone', () => {
        const m = JSON.parse(readFileSync(new URL('../game/factory-map.json', import.meta.url), 'utf8'));
        const g1 = m.enemies.find(e => e.id === 'green1');
        assert.ok(!g1.loadout.includes('goo'));
        assert.equal(g1.immune, undefined);
    });
    test('the goo drops on death like any carried item (it is in the kit)', () => {
        const a = alienAlly(6, 3);
        assert.ok(a.loadout.includes('goo'));
    });
});
