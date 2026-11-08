// act2-item-checklist.test.js — NI2: after Act 1's delivery the Quests tab lists the three
// Act 2 items, the zone each is found in, and a tick once the bag holds it
// (plans/ni2-quests-tab-items.md).
//
// The lines are read from what the real _drawJournalQuestsBody draws. The names come from
// the item data (ITEMS), the ids from the boss slots. The save test goes through the real
// serialize -> JSON -> loadInto path.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { QuestEngine, act2Checklist } from '../game/quests.js';
import { SLOTS } from '../game/slots.js';
import { ITEMS } from '../game/items.js';
import { resolveItemDef } from '../game/item-registry.js';
import { Renderer } from '../game/renderer.js';
import { serialize, loadInto } from '../game/save.js';

const ZONES = ['CARNIVAL', 'FACTORY', 'GRAVEYARD'];
const ID = Object.fromEntries(ZONES.map(z => [z, SLOTS[`${z.toLowerCase()}.boss`].requiredDrop]));
const stack = (id) => ({ itemDef: resolveItemDef(id), count: 1 });

function installGlobals() {
    const store = new Map();
    globalThis.localStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { store.set(k, String(v)); },
        removeItem: (k) => { store.delete(k); },
    };
    globalThis.document = { createElement: () => ({ set textContent(v) {}, get innerHTML() { return ''; } }) };
}
beforeEach(installGlobals);

function makeGame({ delivered, held = [] }) {
    const g = {
        inventory: held.map(stack), _log() {}, turn: 0, gold: 0,
        playerX: 1, playerY: 1, playerHp: 100, playerMaxHp: 100, playerMp: 10, playerMaxMp: 10, facing: 'down',
        equipment: { weapon: null, left: null, top: null, bottom: null, front: null, back: null, sides: null },
        tempEquips: [], buffs: [], groundItems: [], containers: [], enemies: [],
        _tileDiffs: [], _pendingTransition: null, _sewerEscape: null, selectedSlot: -1, state: 'idle',
        rng: { s: 1, getState() { return this.s; }, setState(s) { this.s = s; } },
        map: { url: 'town-map.json', width: 20, height: 15, zoneName: 'Town', isInBounds: () => true },
        _resolveItemDef: resolveItemDef,
        async _loadMap() {}, setTile() {}, _render() {},
    };
    g.questEngine = new QuestEngine(g);
    if (delivered) {
        g.questEngine.forceComplete('fix_car');
        g.questEngine.state.flags.bridgeRoute = 'ramp';
        g.questEngine.forceComplete('deliver_burger');
    }
    return g;
}

// Every line the real Quests body draws, in order.
function tabLines(game) {
    const lines = [];
    const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ width: 0 })), set: (t, k, v) => { t[k] = v; return true; } });
    const r = Object.assign(Object.create(Renderer.prototype), {
        ctx, font: { drawText: (c, text) => lines.push(text) },
        _measurer: () => (s) => s.length * 8,
    });
    r._drawJournalQuestsBody(game, { x: 0, y: 0, w: 608, h: 608 });
    return lines;
}
const itemLines = (game) => tabLines(game).filter(t => / @ /.test(t) && !t.startsWith('@'));
const NAME = { CARNIVAL: 'Stuffed Animal', FACTORY: 'Flux Capacitor', GRAVEYARD: 'Soul Crystal' };

describe('the Act 2 checklist on the Quests tab', () => {
    test('the three ids come from the boss slots and their names from the item data', () => {
        assert.equal(new Set(Object.values(ID)).size, 3);
        for (const z of ZONES) assert.equal(ITEMS[ID[z]].name, NAME[z]);
    });

    test('before the delivery the list is not shown, even holding the items', () => {
        const g = makeGame({ delivered: false, held: Object.values(ID) });
        assert.equal(act2Checklist(g.questEngine), null);
        assert.deepEqual(itemLines(g), []);
        assert.ok(!tabLines(g).includes('[TEXT]'));
    });

    test('after the delivery: heading [TEXT], then each item at its zone, none ticked', () => {
        const lines = tabLines(makeGame({ delivered: true }));
        assert.ok(lines.includes('[TEXT]'));
        assert.deepEqual(itemLines(makeGame({ delivered: true })), [
            '· Stuffed Animal @ Carnival', '· Flux Capacitor @ Factory', '· Soul Crystal @ Graveyard',
        ]);
    });

    test('picking up an item ticks only its line', () => {
        for (const z of ZONES) {
            const want = ZONES.map(zz => `${zz === z ? '✓' : '·'} ${NAME[zz]} @ ${zz[0]}${zz.slice(1).toLowerCase()}`);
            assert.deepEqual(itemLines(makeGame({ delivered: true, held: [ID[z]] })), want, z);
        }
    });

    test('two held, then all three; losing one unticks it', () => {
        const g = makeGame({ delivered: true, held: [ID.CARNIVAL, ID.GRAVEYARD] });
        assert.deepEqual(act2Checklist(g.questEngine).map(r => r.held), [true, false, true]);
        g.inventory.push(stack(ID.FACTORY));
        assert.deepEqual(act2Checklist(g.questEngine).map(r => r.held), [true, true, true]);
        g.inventory.splice(0, 1);
        assert.deepEqual(act2Checklist(g.questEngine).map(r => r.held), [false, true, true]);
    });
});

describe('the checklist survives a save and reload', () => {
    test('ticks and visibility come back through the real save path', async () => {
        const src = makeGame({ delivered: true, held: [ID.FACTORY] });
        const blob = JSON.parse(JSON.stringify(serialize(src)));
        const dst = makeGame({ delivered: false });
        await loadInto(dst, blob);
        assert.deepEqual(itemLines(dst), itemLines(src));
        assert.deepEqual(act2Checklist(dst.questEngine).map(r => r.held), [false, true, false]);
    });

    test('a save made before the delivery reloads with no list', async () => {
        const src = makeGame({ delivered: false, held: [ID.FACTORY] });
        const dst = makeGame({ delivered: true });
        await loadInto(dst, JSON.parse(JSON.stringify(serialize(src))));
        assert.deepEqual(itemLines(dst), []);
    });
});
