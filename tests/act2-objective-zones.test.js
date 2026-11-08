// act2-objective-zones.test.js — FX54: after Act 1, each Act 2 zone leaves the
// objective and the Map's rings once its required item is in the bag, and
// comes back if the item leaves (plans/fx54-act2-objective-drops-zones.md).
//
// A zone's item is read from its boss slot (`<zone>.boss` in SLOTS), so these
// tests take the ids from SLOTS too. The HUD line is read from what the real
// _drawQuestLog draws and the rings from the real _drawWorldMapBody.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GameMap } from '../game/map.js';
import { QuestEngine, BETWEEN_QUESTS } from '../game/quests.js';
import { SLOTS } from '../game/slots.js';
import { Renderer } from '../game/renderer.js';
import { WORLD_ZONES } from '../game/world-map.js';
import { DOCK } from '../game/layout.js';
import { computeViewport } from '../game/viewport.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const ITEM = {
    CARNIVAL: SLOTS['carnival.boss'].requiredDrop,
    FACTORY: SLOTS['factory.boss'].requiredDrop,
    GRAVEYARD: SLOTS['graveyard.boss'].requiredDrop,
};
const ICE_CONE = SLOTS['frozen.boss'].requiredDrop;
const FULL = BETWEEN_QUESTS.find(r => r.id === 'to_act2').objective;
const ALL = ['CARNIVAL', 'FACTORY', 'GRAVEYARD'];
const stack = (id) => ({ itemDef: { id, name: id }, count: 1 });

const map = new GameMap(JSON.parse(readFileSync(fileURLToPath(new URL('../game/downtown-map.json', import.meta.url)), 'utf8')), 'downtown-map.json');

// Act 1 is over (the delivery done, no quest active) and the bag holds `ids`.
function makeGame(ids = []) {
    const g = { map, inventory: ids.map(stack), _log() {} };
    g.questEngine = new QuestEngine(g);
    g.questEngine.forceComplete('fix_car');
    g.questEngine.state.flags.bridgeRoute = 'ramp';
    g.questEngine.forceComplete('deliver_burger');
    return g;
}

const VP = computeViewport({ cssW: 1920, cssH: 1080, dpr: 1, dock: DOCK });
function hudObjective(game) {
    const drawn = [];
    const ctx = new Proxy({ globalAlpha: 1 }, {
        get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })),
        set: (t, k, v) => { t[k] = v; return true; },
    });
    const r = Object.assign(Object.create(Renderer.prototype), {
        ctx, canvas: { width: VP.backingW, height: VP.backingH },
        viewport: VP, sprites: { uiPanel: null },
        font: { drawText: (c, text) => drawn.push(text) },
        _fightFace: false, _hudFor: null, _hudFaceFor: null, _hudCache: null,
    });
    r._drawQuestLog({
        map: game.map, _timeOfDay: () => '12:05', questEngine: game.questEngine,
        _logHistory: [], _logStripMessages: [],
    });
    return drawn.filter(t => t !== game.map.zoneName && t !== '12:05')[0] ?? null;
}

const RED = '#e8462f';
function ringed(game) {
    const rects = [], words = [];
    const ctx = new Proxy({}, {
        get: (t, k) => {
            if (k === 'strokeRect') return (x, y, w, h) => rects.push({ x, y, w, h, stroke: t.strokeStyle });
            return k in t ? t[k] : () => {};
        },
        set: (t, k, v) => { t[k] = v; return true; },
    });
    const r = Object.assign(Object.create(Renderer.prototype), {
        ctx, font: { drawText: (c, text, x, y) => words.push({ text, x, y }) },
    });
    r._drawWorldMapBody(game, { x: 0, y: 0, w: 608, h: 608 }, 40);
    const inside = (b, p) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
    const out = [];
    for (const z of WORLD_ZONES) {
        const label = words.find(w => w.text === z.label);
        const b = label && rects.find(rc => inside(rc, label));
        if (b && b.stroke === RED) out.push(z.zoneName);
    }
    return out.sort();
}

const both = (g) => ({ hud: hudObjective(g), map: ringed(g) });

describe('each Act 2 zone leaves the objective and the Map once you hold its item', () => {
    test('the three items come from the three boss slots, and the ice cone is a different item', () => {
        assert.equal(new Set(Object.values(ITEM)).size, 3);
        for (const id of Object.values(ITEM)) assert.ok(id && id !== ICE_CONE);
    });

    test('no required items: the objective and the Map read as they always did', () => {
        assert.deepEqual(both(makeGame()), { hud: FULL.toUpperCase(), map: ALL });
    });

    test('the ice cone is not an Act 2 item: holding it changes nothing', () => {
        assert.deepEqual(both(makeGame([ICE_CONE])), both(makeGame()));
    });

    test('one item held: its zone leaves the words and the rings', () => {
        const words = { CARNIVAL: 'FACTORY AND GRAVEYARD', FACTORY: 'CARNIVAL AND GRAVEYARD', GRAVEYARD: 'CARNIVAL AND FACTORY' };
        for (const zone of ALL) {
            const g = makeGame([ITEM[zone]]);
            assert.deepEqual(both(g), { hud: `EXPLORE THE ${words[zone]}`, map: ALL.filter(z => z !== zone) }, zone);
        }
    });

    test('two items held: the last zone stands alone', () => {
        const g = makeGame([ITEM.CARNIVAL, ITEM.GRAVEYARD]);
        assert.deepEqual(both(g), { hud: 'EXPLORE THE FACTORY', map: ['FACTORY'] });
    });

    test('lose the item and the zone comes back', () => {
        const g = makeGame([ITEM.CARNIVAL, ITEM.FACTORY]);
        assert.deepEqual(both(g).map, ['GRAVEYARD']);
        g.inventory = [stack(ITEM.FACTORY)];
        assert.deepEqual(both(g), { hud: 'EXPLORE THE CARNIVAL AND GRAVEYARD', map: ['CARNIVAL', 'GRAVEYARD'] });
        g.inventory = [];
        assert.deepEqual(both(g), { hud: FULL.toUpperCase(), map: ALL });
    });

    test('all three held: the objective is the [TEXT] placeholder and the Map rings Downtown only', () => {
        const g = makeGame(Object.values(ITEM));
        assert.deepEqual(both(g), { hud: '[TEXT]', map: ['DOWNTOWN'] });
        assert.equal(g.questEngine.getTargetZone(), 'DOWNTOWN');
    });

    test('an empty bag slot among the items does not break the row', () => {
        const g = makeGame([ITEM.CARNIVAL]);
        g.inventory.unshift(null);
        assert.equal(g.questEngine.getHudText(), 'Explore the Factory and Graveyard');
    });

    test('before the delivery the row is not in play, whatever the bag holds', () => {
        const g = { inventory: Object.values(ITEM).map(stack) };
        g.questEngine = new QuestEngine(g);
        assert.equal(g.questEngine.getHudText(), null);
        assert.deepEqual(g.questEngine.getTargetZones(), []);
    });

    test('the longest objective the row shows fits the phone budget', () => {
        const worst = makeGame().questEngine.getHudText();
        assert.ok(worst.length <= 46, `${worst.length} chars`);
    });
});
