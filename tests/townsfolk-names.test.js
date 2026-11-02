// townsfolk-names.test.js — a named townsperson goes by their name on every
// surface that used to print their type (plans/fx38-townsfolk-names.md).
// Knuckles, Macc and Platero are spawned from the maps the way the game spawns
// them, then put through the real death handler, the real "turns on you" line,
// the real shop lines and the real draw methods. Unnamed townsfolk go through
// the same paths and must read exactly as before.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { resolveSpawn, defaultPicks, requiredDropFor, dropLineFor } from '../game/slots.js';
import { Enemy, spawnEnemy, shownName, townName, theShown, unnestBrackets } from '../game/enemies.js';
import { transferGold } from '../game/trade.js';
import { dropLoadout } from '../game/drops.js';
import { ITEMS } from '../game/items.js';
import { isHostile } from '../game/ai.js';
import { struck } from '../game/perception.js';
import { Renderer } from '../game/renderer.js';
import { targetPanel } from '../game/fight-panels.js';
import { DOCK, MODAL_RECT, offerLayout } from '../game/layout.js';
import { computeViewport } from '../game/viewport.js';
import { emptyOffer } from '../game/offer.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const town = JSON.parse(readFileSync(new URL('../game/town-map.json', import.meta.url), 'utf8'));
const downtown = JSON.parse(readFileSync(new URL('../game/downtown-map.json', import.meta.url), 'utf8'));
const spawn = (map, id) => spawnEnemy(resolveSpawn(map.enemies.find(e => e.id === id), defaultPicks()));
const knuckles = () => spawn(town, 'townie-knuckles');
const macc = () => spawn(town, 'townie-macc');
const platero = () => spawn(downtown, 'dt-platero');
const local = () => spawn(downtown, 'dt-folk1');
const unnamedTownie = () => spawn(town, 'townie-e');

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
const logOffer = liveMethod('    _logOffer(', {});
const logLive = liveMethod('    _log(', { unnestBrackets, performance: { now: () => 0 } });

function standIn(enemies, map = town) {
    const g = {
        enemies, logs: [], groundItems: [], gold: 0, playerX: 0, playerY: 0,
        _muggedIds: new Set(), map: { enemySpawns: map.enemies, isWalkable: () => true },
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
        _drawMoodFace() {},
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
    const s = standIn([e]);
    s.kill(e);
    const ko = rig(); ko.r._drawEnemySprite(g, e, 0, 0, 0);
    return {
        panelAll: panel.drawn,
        death: s.logs.find(l => l.startsWith('[Defeated')),
        ko: ko.drawn.find(t => t.startsWith('[KO]')),
    };
}

// ── the shop ────────────────────────────────────────────────────────────────
const L = offerLayout(MODAL_RECT);
function shopTexts(npc) {
    const game = { _offerNpc: npc, gold: 0, _offer: { ...emptyOffer(), scroll: { theirs: 0, yours: 0 }, selection: null, goldPinned: false },
        _offerCursor: { side: 'yours', index: 0 }, _offerSelection: () => null };
    const head = rig(); head.r._drawOfferHeader(game, L, { points: 0 });
    const desc = rig(); desc.r._drawOfferDescription(game, L);
    const lists = rig();
    try { lists.r._drawOfferLists(game, L, { points: 0 }); } catch { /* only the header text is read */ }
    return { head: head.drawn, desc: desc.drawn, lists: lists.drawn };
}

describe('the helper', () => {
    test('a named townsperson goes by name; a boss, a placeholder, an unnamed one and a creature do not', () => {
        assert.equal(townName(knuckles()), 'Knuckles');
        assert.equal(shownName(knuckles()), 'Knuckles');
        assert.equal(shownName(macc()), 'Macc');
        assert.equal(shownName(platero()), 'Platero');
        assert.equal(shownName(local()), 'Violencian');
        assert.equal(shownName(unnamedTownie()), 'Violencian');
        assert.equal(shownName(new Enemy({ id: 'x', type: 'Violencian', name: '[TEXT]', dialogueId: 'taxi_driver', x: 1, y: 1 })), 'Violencian');
        assert.equal(shownName(new Enemy({ id: 'r', type: 'Rat', name: 'Canyon Rat', x: 1, y: 1 })), 'Rat', 'no dialogue: not a townsperson');
    });

    test('a name takes no article; a type does', () => {
        assert.equal(theShown(knuckles()), 'Knuckles');
        assert.equal(theShown(unnamedTownie()), 'The Violencian');
        assert.equal(knuckles().shownThe, 'Knuckles');
    });
});

describe('Knuckles in a fight', () => {
    test('the defeat line, the target panel and the KO tag say his name', () => {
        const s = surfaces(knuckles());
        assert.equal(s.death, '[Defeated [Knuckles]]');
        assert.ok(s.panelAll.includes('KNUCKLES'), s.panelAll.join(' | '));
        assert.ok(!s.panelAll.includes('VIOLENCIAN'), 'the panel no longer prints the type');
        assert.equal(s.ko, '[KO] KNUCKLES');
    });

    test('the fight-panels model reads the name too', () => {
        assert.equal(targetPanel(knuckles()).name, 'Knuckles');
        assert.equal(targetPanel({ type: 'Rat', entity: {} }).name, 'Rat');
    });

    test('"turns on you" has no article in front of a name', () => {
        const g = standIn([knuckles()]);
        g.revert(g.enemies[0]);
        assert.equal(g.logs[0], '[Knuckles turns on you!]');
        const calm = knuckles();
        calm.allegiance = 'neutral'; calm.fsmState = null;
        g.harm(calm);
        assert.equal(g.logs[1], '[Knuckles turns on you!]');
    });

    test('the live log shows no nested bracket for the defeat line', () => {
        const g = standIn([knuckles()]);
        g.kill(g.enemies[0]);
        const line = g.logs.find(l => l.startsWith('[Defeated'));
        const live = { _logStripMessages: [], _logHistory: [], _STRIP_MAX: 9, _LOG_HISTORY_MAX: 99 };
        logLive.call(live, line, 'combat');
        assert.equal(live._logHistory[0].text, '[Defeated Knuckles]');
        assert.equal(live._logStripMessages[0].text, '[Defeated Knuckles]');
    });
});

describe('unnamed townsfolk read as before', () => {
    test('an unnamed Violencian keeps the demonym on every surface', () => {
        const provoked = unnamedTownie(); provoked.ambient = false;   // a provoked townsperson fights for real
        const s = surfaces(provoked);
        assert.equal(s.death, '[Defeated [Violencian]]');
        assert.equal(s.ko, '[KO] VIOLENCIAN');
        assert.ok(s.panelAll.includes('VIOLENCIAN'), s.panelAll.join(' | '));
        const g = standIn([unnamedTownie()]);
        g.revert(g.enemies[0]);
        assert.equal(g.logs[0], '[The Violencian turns on you!]');
    });

    test('a creature keeps its type', () => {
        const e = new Enemy({ id: 'g1', type: 'Violet Fungus', x: 5, y: 5, gold: 0 });
        const s = surfaces(e);
        assert.equal(s.death, '[Defeated [Violet Fungus]]');
        assert.equal(s.ko, '[KO] VIOLET FUNGUS');
    });
});

describe('the barter screen', () => {
    test('Macc and Platero title it with their names, not VIOLENCIAN', () => {
        for (const [who, npc] of [['MACC', macc()], ['PLATERO', platero()]]) {
            const t = shopTexts(npc);
            assert.ok(t.head.includes(who), `${who} header: ${t.head.join(' | ')}`);
            assert.ok(!t.head.includes('VIOLENCIAN'));
            assert.ok(t.desc.some(x => x.startsWith(`${who} IS `)), t.desc.join(' | '));
            assert.ok(t.lists.includes(`${who}'S GOODS`), t.lists.join(' | '));
        }
    });

    test('an unnamed Violencian still titles it VIOLENCIAN', () => {
        const t = shopTexts(unnamedTownie());
        assert.ok(t.head.includes('VIOLENCIAN'), t.head.join(' | '));
    });

    test('a container keeps its type: the crate is not a person', () => {
        const crate = { type: 'Crate', _container: true, disposition: 100, entity: { isAlive: () => true } };
        const t = shopTexts(crate);
        assert.ok(t.head.includes('CRATE'), t.head.join(' | '));
        assert.ok(t.desc.some(x => x.startsWith('THE CRATE IS OPEN')), t.desc.join(' | '));
    });

    test('the shop lines in the log say the name', () => {
        const R = { points: 0, goldRefusedPoints: 0, goldUnspent: 5, fromGold: 0, itemUnspent: 0, fromItems: 0 };
        const g = { logs: [], _log(m) { this.logs.push(m); } };
        logOffer.call(g, macc(), R, { given: [], taken: [], gold: 5 });
        assert.equal(g.logs[0], '[You hand Macc 5 GP.]');
        assert.equal(g.logs[1], '[Macc pockets the gold. It buys nothing he wants.]');
        const u = { logs: [], _log(m) { this.logs.push(m); } };
        logOffer.call(u, unnamedTownie(), R, { given: [], taken: [], gold: 5 });
        assert.equal(u.logs[0], '[You hand Violencian 5 GP.]');
    });
});

describe('no log line nests brackets', () => {
    test('unnestBrackets drops only the nested pairs', () => {
        assert.equal(unnestBrackets('[Dropped [Rock] x2]'), '[Dropped Rock x2]');
        assert.equal(unnestBrackets('[Hit [Violencian] with [Rock] - hit]'), '[Hit Violencian with Rock - hit]');
        assert.equal(unnestBrackets('[Smashed [A [B]] on [C]]'), '[Smashed A B on C]');
        assert.equal(unnestBrackets('[Plain line.]'), '[Plain line.]');
        assert.equal(unnestBrackets('[One] [Two]'), '[One] [Two]');
        assert.equal(unnestBrackets('Rock [Rock] text'), 'Rock [Rock] text');
        assert.equal(unnestBrackets(']stray'), ']stray');
    });

    test('the live log flattens an item name inside a bracketed line, in the strip and the history', () => {
        const live = { _logStripMessages: [], _logHistory: [], _STRIP_MAX: 9, _LOG_HISTORY_MAX: 99 };
        for (const line of [`[Dropped ${ITEMS.rock.name}]`, `[Took ${ITEMS.rock.name} → bag.]`, `[Throw ${ITEMS.rock.name} — pick a direction]`]) {
            logLive.call(live, line, 'pickup');
        }
        for (const m of [...live._logHistory, ...live._logStripMessages]) {
            assert.ok(!/\[[^\]]*\[/.test(m.text), `nested bracket in: ${m.text}`);
        }
        assert.equal(live._logHistory[0].text, '[Dropped Rock]');
        assert.equal(live._logHistory[2].text, '[Throw Rock - pick a direction]');
    });
});
