// boss-names.test.js — every surface calls a boss by its one name
// (plans/fx4-boss-one-name.md). The Alien Invasion is spawned from the Factory
// map the way the game spawns him, then put through the real death handler,
// the real "turns on you" line, the real perception line and the real draw
// methods. An ordinary enemy goes through the same paths and must read exactly
// as it did before.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { resolveSpawn, defaultPicks, labelOf, requiredDropFor, dropLineFor } from '../game/slots.js';
import { Enemy, spawnEnemy, shownName } from '../game/enemies.js';
import { tickNpcState } from '../game/npc.js';
import { transferGold } from '../game/trade.js';
import { dropLoadout } from '../game/drops.js';
import { ITEMS } from '../game/items.js';
import { isHostile } from '../game/ai.js';
import { struck } from '../game/perception.js';
import { Renderer } from '../game/renderer.js';
import { DOCK } from '../game/layout.js';
import { computeViewport } from '../game/viewport.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const factory = JSON.parse(readFileSync(new URL('../game/factory-map.json', import.meta.url), 'utf8'));
const alien = () => spawnEnemy(resolveSpawn(factory.enemies.find(e => e.slot === 'factory.boss'), defaultPicks()));
const ally = () => spawnEnemy(resolveSpawn(factory.enemies.find(e => e.entry === 'alien_ally'), defaultPicks()));
const goon = () => new Enemy({ id: 'g1', type: 'Violet Fungus', x: 5, y: 5, gold: 0 });
const clean = (s) => String(s).replace(/[[\]]/g, '').toUpperCase();

// ── main.js methods, run as written against a stand-in game ─────────────────
const mainSrc = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
function liveMethod(signature, freeVars) {
    const at = mainSrc.indexOf(signature, mainSrc.indexOf('class Game {'));
    assert.ok(at > 0, `${signature} not found in main.js`);
    const body = mainSrc.slice(at + signature.indexOf('('), mainSrc.indexOf('\n    }', at) + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
}
const handleEnemyDeath = liveMethod('    _handleEnemyDeath(', {
    audio: { playSfx() {} }, transferGold, dropLoadout, requiredDropFor, dropLineFor, ITEMS,
    onSewerEnemyKilled() {},
});
const onEntityHarmed = liveMethod('    _onEntityHarmed(', { isHostile, struck });
const revertAlly = liveMethod('    _revertAlly(', {});

function standIn(enemies) {
    const g = {
        enemies, logs: [], groundItems: [], gold: 0, playerX: 0, playerY: 0,
        _muggedIds: new Set(), map: { enemySpawns: factory.enemies, isWalkable: () => true },
        questEngine: null,
        _log(m) { this.logs.push(m); },
        _spawnEventWord() {}, emitGameEvent() {}, _recordDrop() {}, _grantItem() {},
    };
    g.kill = (e) => { e.entity.hp = 0; e.entity.alive = false; handleEnemyDeath.call(g, e); };
    g.harm = (e) => onEntityHarmed.call(g, e);
    g.revert = (e) => revertAlly.call(g, e);
    return g;
}

// ── the renderer, drawing into a recording canvas ───────────────────────────
const VP = computeViewport({ cssW: 3440, cssH: 1440, dpr: 1, dock: DOCK });
function rig() {
    const state = { globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: null, strokeStyle: null, filter: 'none' };
    const ctx = new Proxy(state, {
        get(t, k) {
            if (k in t) return t[k];
            if (k === 'createImageData') return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
            return () => (/Gradient/.test(k) ? { addColorStop() {} } : undefined);
        },
        set(t, k, v) { t[k] = v; return true; },
    });
    const drawn = [];
    const r = Object.assign(Object.create(Renderer.prototype), {
        ctx, canvas: { width: VP.backingW, height: VP.backingH }, viewport: VP, sprites: {},
        font: { drawText: (c, text) => drawn.push(String(text)), measure: (t) => String(t).length * 6 },
        _fightFace: true, _hudFor: null, _hudFaceFor: null, _hudCache: null,
    });
    return { r, drawn };
}
const fightGame = (e) => ({
    playerX: e.x - 1, playerY: e.y, facing: 'right', _fightOn: true, wheel: null, _idleTick: 0, _animating: false,
    equipment: { weapon: null, top: null, bottom: null, front: null, back: null, sides: null },
    enemies: [e], _damageNumbers: [],
});
function surfaces(e) {
    e.state = 'chasing';
    const g = fightGame(e);
    const panel = rig(); panel.r._drawFightPanels(g);
    const over = rig(); over.r._drawEnemySprite(g, e, 0, 0, 0);
    const s = standIn([e]);
    s.kill(e);
    const ko = rig(); ko.r._drawEnemySprite(g, e, 0, 0, 0);
    return {
        panelAll: panel.drawn,
        overhead: over.drawn.find(t => t.includes(' · ')),
        death: s.logs.find(l => l.startsWith('[Defeated')),
        ko: ko.drawn.find(t => t.startsWith('[KO]')),
    };
}

describe('the Alien Invasion goes by one name everywhere', () => {
    const NAME = labelOf(alien());

    test('the fixture is an Act 2 boss with a name of its own, not its type', () => {
        const e = alien();
        assert.equal(e.boss, true);
        assert.equal(e.type, 'Boss');
        assert.equal(NAME, 'Alien Invasion');
        assert.equal(shownName(e), NAME);
    });

    test('death line, target panel, KO tag and overhead label all say it', () => {
        const s = surfaces(alien());
        assert.equal(s.death, `[Defeated [${NAME}]]`);
        assert.ok(s.panelAll.includes(clean(NAME)), s.panelAll.join(' | '));
        assert.ok(!s.panelAll.includes('BOSS'), 'the panel no longer prints the type');
        assert.equal(s.ko, `[KO] ${clean(NAME)}`);
        assert.ok(s.overhead && s.overhead.startsWith(`${clean(NAME)} · `), s.overhead);
    });

    test('the turn lines say it', () => {
        const e = alien();
        const g = standIn([e]);
        g.revert(e);
        assert.equal(g.logs[0], `[The ${NAME} turns on you!]`);
        const calm = alien();
        calm.allegiance = 'neutral'; calm.fsmState = null;
        g.harm(calm);
        assert.equal(g.logs[1], `[The ${NAME} turns on you!]`);
    });

    test('the perception lines (turns to face you) say it', () => {
        const e = alien();
        // Facing north, struck from the south: the blow comes from its blind side.
        e.x = 5; e.y = 5; e.state = 'idle'; e._lastDx = 0; e._lastDy = -1; e._struckBy = { x: 5, y: 6 };
        e.loadout = [];
        const g = { playerX: 5, playerY: 6, enemies: [e], containers: [], turn: 1, _MOVE_MS: 150,
            map: { isWalkable: () => true }, rng: { pick: (a) => a[0], float: () => 0.5 } };
        const messages = tickNpcState(g, e) || [];
        const line = messages.map(m => m.text).find(t => t.includes('turns to face you'));
        assert.equal(line, `[[${NAME}] turns to face you!]`);
    });

    test('every Act 2 boss gets the same treatment', () => {
        for (const slot of ['carnival.boss', 'factory.boss', 'graveyard.boss']) {
            const spawn = { id: slot, x: 1, y: 1, slot };
            const e = spawnEnemy(resolveSpawn(spawn, defaultPicks()));
            assert.equal(e.boss, true, slot);
            assert.notEqual(shownName(e), e.type, slot);
            assert.equal(e.entity.name, `[${shownName(e)}]`, slot);
        }
    });
});

describe('ordinary enemies read exactly as before', () => {
    test('a plain enemy: its type on every surface', () => {
        const e = goon();
        const s = surfaces(e);
        assert.equal(s.death, '[Defeated [Violet Fungus]]');
        assert.equal(s.ko, '[KO] VIOLET FUNGUS');
        assert.ok(s.panelAll.includes('VIOLET FUNGUS'), s.panelAll.join(' | '));
        assert.ok(s.overhead.startsWith('VIOLET FUNGUS · '), s.overhead);
    });

    test('a named non-boss keeps its type in the log, panel and KO tag, its name overhead', () => {
        const e = ally();
        assert.ok(!e.boss);
        assert.equal(shownName(e), e.type);
        const s = surfaces(e);
        assert.equal(s.death, `[Defeated [${e.type}]]`);
        assert.equal(s.ko, `[KO] ${e.type.toUpperCase()}`);
        assert.ok(s.panelAll.includes(e.type.toUpperCase()), s.panelAll.join(' | '));
        assert.ok(s.overhead.startsWith(`${clean(e.name)} · `), s.overhead);
        const g = standIn([e]);
        g.revert(e);
        assert.equal(g.logs[0], `[The ${e.type} turns on you!]`);
    });

    test('a character with no type or name still has the old fallbacks', () => {
        assert.equal(shownName(null), null);
        assert.equal(shownName({}), undefined);
    });
});
