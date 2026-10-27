// autosave-moments.test.js — FX24: the game saves right after you change your
// gear, loot, trade, eat or drink, and when the tab is hidden or closed.
//
// The bug: autosave wrote at most once every five turns, so the save on disk
// could sit at turn 6 while the game was at turn 9, and CONTINUE handed back
// the old bag and the Wooden Sword.
//
// main.js touches `document` at import, so, as in title-space.test.js and
// device-keys.test.js, the real methods are lifted out of the source and bound
// onto a small game object. Every test plays the moment through the real flow
// (the Remoticon's keys, the bar, walking onto an item, the offer screen), then
// reloads by pressing Space on a fresh title, which runs the real CONTINUE path
// through the real game/save.js against an in-memory localStorage.
//
// Each game starts at turn 7 with its last save at turn 6, and the stand-in
// world turn ends in the real throttled autosave(), as _advanceWorld's does: so
// without the moment's own save, nothing would reach the disk.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { writeSave, readSaveRaw, hasSave, loadInto } from '../game/save.js';
import { ITEMS, resolveUse, unequipItem } from '../game/items.js';
import { WEAPONS } from '../game/weapons.js';
import { resolveItemDef } from '../game/item-registry.js';
import { addToInventory, moveToZone, zoneOf, pageCount, slotOnPage, pageOfSlot } from '../game/inventory.js';
import { INVENTORY_SIZE, SAFE_SLOTS, PACK_PAGE, MAX_STACK } from '../game/data.js';
import { itemActions, equipOptions } from '../game/inspector.js';
import { slotRing, unslotRing } from '../game/rings.js';
import { buildXmbBar, resolveXmbSelection, xmbCategoryOf, XMB_LABELS } from '../game/xmb.js';
import {
    emptyOffer, commitBlocker, stage, unstage, settledGold, resolveOffer, sameEntry,
} from '../game/offer.js';
import { transferGold, sellPrice, buyPrice } from '../game/trade.js';
import { applyDispositionDelta, reactToTransaction } from '../game/give-action.js';
import { isHostile } from '../game/ai.js';
import { dispositionCeil } from '../game/disposition-curves.js';
import {
    HIT_SLOP, DEVICE_TABS, deviceTabRect, cycleDeviceTab, deviceBodyRect, deviceBagSlotRects, deviceBagPagerRects,
    deviceEquipLayout, deviceRingsLayout, inspectorActionRects, gearOptionRects, nearestRectInDir,
    OFFER_ROWS_VISIBLE, OFFER_TRAY_SLOTS,
} from '../game/layout.js';

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');

function liveMethod(name, params, freeVars) {
    const signature = `${name}(${params}) {`;
    const at = mainSrc.indexOf(signature);
    assert.ok(at > 0, `${name}(${params}) not found in main.js`);
    const closeAt = mainSrc.indexOf('\n    }', at);
    assert.ok(closeAt > at, `${name} body never closes`);
    const body = mainSrc.slice(at + name.length, closeAt + '\n    }'.length);
    const names = Object.keys(freeVars);
    const factory = new Function(...names, `'use strict'; return function ${body}`);
    return factory(...names.map(n => freeVars[n]));
}

function liveConst(name) {
    const m = new RegExp(`\\nconst ${name}\\s*=\\s*`).exec(mainSrc);
    assert.ok(m, `const ${name} not found in main.js`);
    const from = m.index + m[0].length;
    const end = mainSrc.indexOf('\n};', from);
    return new Function(`'use strict'; return ${mainSrc.slice(from, end + 2)}`)();
}

const STATE = liveConst('STATE');
const DIRS = liveConst('DIRS');
const SAVE_KEY = 'violencetown.save';
const audio = { init() {}, playMusic() {}, playSfx() {} };

// ── The page: document, window and the splash's elements ─────────────────────

function element(id, classes = []) {
    const el = new EventTarget();
    const cls = new Set(classes);
    el.id = id;
    el.classList = { add: c => cls.add(c), remove: c => cls.delete(c), contains: c => cls.has(c) };
    el.click = () => el.dispatchEvent(new Event('click'));
    return el;
}

class Key extends Event {
    constructor(type, code) {
        super(type, { bubbles: true, cancelable: true });
        this.code = code;
        this.key = code === 'Space' ? ' ' : code;
        this.repeat = false;
        this.ctrlKey = false; this.metaKey = false; this.altKey = false; this.shiftKey = false;
    }
}

function makePage() {
    const els = {
        'splash': element('splash'),
        'game-wrapper': element('game-wrapper', ['hidden']),
        'splash-go': element('splash-go'),
        'splash-continue': element('splash-continue', ['hidden']),
    };
    const document = new EventTarget();
    document.getElementById = id => els[id] ?? null;
    document.visibilityState = 'visible';
    const window = new EventTarget();
    return { document, window, els };
}

function installStorage() {
    const store = new Map();
    globalThis.localStorage = {
        getItem: k => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { store.set(k, String(v)); },
        removeItem: k => { store.delete(k); },
        clear: () => store.clear(),
    };
}

const onDisk = () => JSON.parse(localStorage.getItem(SAVE_KEY));

// ── The live methods ─────────────────────────────────────────────────────────

const FREE = {
    STATE, DIRS, audio, writeSave, hasSave, readSaveRaw, loadInto,
    resolveUse, unequipItem, addToInv: addToInventory, INVENTORY_SIZE, SAFE_SLOTS, MAX_STACK, PACK_PAGE, pageCount, slotOnPage, pageOfSlot,
    xmbCategoryOf, XMB_LABELS, buildXmbBar, resolveXmbSelection,
    HIT_SLOP, DEVICE_TABS, deviceTabRect, cycleDeviceTab, deviceBodyRect, deviceBagSlotRects, deviceBagPagerRects,
    deviceEquipLayout, deviceRingsLayout, inspectorActionRects, gearOptionRects, nearestRectInDir,
    itemActions, equipOptions, zoneOf, moveToZone, slotRing, unslotRing,
    emptyOffer, commitBlocker, stage, unstage, settledGold, resolveOffer, sameEntry,
    transferGold, sellPrice, buyPrice, applyDispositionDelta, reactToTransaction, isHostile,
    dispositionCeil, OFFER_ROWS_VISIBLE, OFFER_TRAY_SLOTS,
};

const LIVE = [
    // saving
    ['autosave', 'opts = {}'], ['_saveMoment', ''], ['_saveOnLeave', ''],
    // the bag, the bar and the ground
    ['_addToInventory', 'itemDef'], ['_removeFromSlot', 'slot'], ['_doItemUse', 'item'],
    ['_useXmbCurrent', ''], ['_tryPickup', ''], ['_takeItemAt', 'x, y'],
    ['_grantFromExaminable', 'target'],
    // the Remoticon
    ['_tapDevice', 'pt'], ['_deviceActivate', 'zone, index'], ['_deviceTargets', ''],
    ['_deviceFocus', 't, i'], ['_deviceKey', 'code'], ['_deviceBack', ''],
    ['_deviceCycleTab', 'dir'], ['_closeDevice', ''], ['_closeCurrentMenu', ''],
    ['_scrollJournal', 'delta'], ['_pointInRect', 'p, r, slop = 0'],
    ['_slotRing', 'slotKey, ringId'], ['_unslotRing', 'slotKey'],
    // the offer screen
    ['_openOffer', 'npc'], ['_closeOffer', ''], ['_offerActivate', 'zone, index'],
    ['_canStageGive', 'entry'], ['_commitOffer', ''], ['_containerEntries', 'container'],
    ['_containerStock', 'container'], ['_takeFromContainer', 'npc, at'],
    ['_buybackRecord', 'npc, itemId, kind, price'], ['_buybackLive', 'npc'], ['_endBuybacks', ''],
    ['_buybackList', 'npc'], ['_buybackConsume', 'npc, itemId'], ['_resettle', 'npc'],
    ['_goldTray', ''], ['_toggleOfferGold', 'npc'], ['_offerScrollBy', 'side, delta'],
    ['_logOffer', 'npc, R, { given, taken, gold }'],
    ['_offerTheirsList', ''], ['_offerYoursList', ''], ['_stagedCount', 'side, entry'],
    ['_offerSelection', ''], ['_offerBlocker', ''],
].map(([n, p]) => [n, liveMethod(n, p, FREE)]);

// ── The game ─────────────────────────────────────────────────────────────────

function fakeMap(url) {
    return {
        url, width: 20, height: 15, zoneName: 'TOWN',
        isInBounds: (x, y) => x >= 0 && y >= 0 && x < 20 && y < 15,
    };
}

// The fields save.js reads and writes, plus what the lifted flows touch. The
// world turn is a stand-in that ends the way the real one does: in the
// throttled autosave().
function makeGame(page) {
    const g = {
        state: STATE.SPLASH,
        map: fakeMap('town-map.json'), _mapUrl: 'town-map.json',
        turn: 0, rng: null, _dayClock: 0,
        playerX: 5, playerY: 5, playerHp: 10, playerMaxHp: 40, playerMp: 2, playerMaxMp: 30,
        facing: 'down', gold: 100,
        equipment: { weapon: WEAPONS.wooden_sword, left: null, top: null, bottom: null, front: null, back: null, sides: null },
        tempEquips: [], buffs: [], inventory: new Array(INVENTORY_SIZE).fill(null), selectedSlot: -1,
        ownedRings: new Set(), ringSlots: {}, ringTier: 1,
        groundItems: [], containers: [], enemies: [], _tileDiffs: [], _pendingTransition: null,
        _collectedItems: new Set(), _droppedItems: {}, _muggedIds: new Set(), _robbed: {}, _hot: {},
        questEngine: null, _sewerEscape: null,
        _lastAutosaveTurn: -999,
        _deviceTab: 'items', _deviceSel: null, _journalScroll: 0,
        xmbCat: null, xmbPick: {},
        _offerNpc: null, _offer: null, _offerCursor: null,
        _physicalHeld: new Set(), _heldDirKeys: [],
        logs: [], newRuns: 0,
        _log(m) { this.logs.push(m); },
        _render() {}, _resumeHeldWalk() {}, _fitCanvas() {}, _applyAudioSettings() {},
        _maybeShowFirstRunHint() {}, _startMainQuest() { this.newRuns++; },
        _refreshGrantedSkills() {},
        _applyFireBlood(who, turns) { this.buffs.push({ id: 'fire_blood', turnsLeft: turns }); },
        emitGameEvent() {},
        _resolveItemDef(id) { return id ? resolveItemDef(id) : null; },
        async _loadMap(url, x, y) {
            await Promise.resolve();
            this.map = fakeMap(url); this._mapUrl = url;
            this.playerX = x; this.playerY = y;
        },
        setTile() {},
        _advanceWorld() { this.turn++; this.autosave(); },
    };
    for (const [n, fn] of LIVE) g[n] = fn;
    // The order the game binds them in (main.js init).
    g._bindSplash = liveMethod('_bindSplash', '', { ...FREE, document: page.document, window: page.window });
    g._bindLeaveSave = liveMethod('_bindLeaveSave', '', { ...FREE, document: page.document, window: page.window });
    g._bindSplash();
    g._bindLeaveSave();
    return g;
}

// A run in progress: on the street at turn 7, last saved at turn 6 with
// whatever `setup` put in the bag, on the body and on the floor.
function playing(setup = () => {}) {
    const page = makePage();
    const g = makeGame(page);
    g.state = STATE.IDLE;
    setup(g);
    g.turn = 6;
    g.autosave({ force: true });
    g.turn = 7;
    assert.equal(onDisk().turn, 6, 'the run starts saved at turn 6');
    return { page, g };
}

async function settle() {
    for (let i = 0; i < 20; i++) await new Promise(r => setImmediate(r));
}

function press(page, code) {
    page.document.dispatchEvent(new Key('keydown', code));
    page.document.dispatchEvent(new Key('keyup', code));
}

// Reload: a fresh title (empty bag, Wooden Sword), and Space to CONTINUE. Given
// the game that was left, it also checks the save is from that game's turn.
async function reload(left = null) {
    const page = makePage();
    const g = makeGame(page);
    assert.equal(page.els['splash-continue'].classList.contains('hidden'), false, 'CONTINUE is offered');
    press(page, 'Space');
    await settle();
    assert.equal(g.state, STATE.IDLE, 'the save loaded');
    assert.equal(g.newRuns, 0, 'it continued, not a new run');
    if (left) assert.equal(g.turn, left.turn, 'the save is from the turn you left on');
    return g;
}

const put = (g, i, id, count = 1) => { g.inventory[i] = { itemDef: resolveItemDef(id), count }; };
const count = (g, id) => g.inventory.reduce((n, s) => n + (s && s.itemDef.id === id ? s.count : 0), 0);
const devKeys = (g, ...codes) => { for (const c of codes) g._deviceKey(c); };

// Walk the Remoticon cursor to target `want` with arrow keys, as a player does
// (the device-keys.test.js walk).
const centre = r => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
function walkTo(g, want) {
    let t = g._deviceTargets();
    if (t.cur < 0) { devKeys(g, 'ArrowRight'); t = g._deviceTargets(); }
    const goal = t.ids.indexOf(want);
    assert.ok(goal >= 0, `no target ${want} on this level`);
    for (let n = 0; n < 40 && t.cur !== goal; n++) {
        const a = centre(t.rects[t.cur]), b = centre(t.rects[goal]);
        const dx = b.x - a.x, dy = b.y - a.y;
        const code = Math.abs(dx) >= Math.abs(dy)
            ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft')
            : (dy > 0 ? 'ArrowDown' : 'ArrowUp');
        const before = t.cur;
        devKeys(g, code);
        t = g._deviceTargets();
        if (t.cur === before) {
            devKeys(g, Math.abs(dx) >= Math.abs(dy) ? (dy > 0 ? 'ArrowDown' : 'ArrowUp') : (dx > 0 ? 'ArrowRight' : 'ArrowLeft'));
            t = g._deviceTargets();
        }
    }
    assert.equal(t.cur, goal, `cursor never reached ${want}`);
}

function openDevice(g, tab) {
    g.state = STATE.DEVICE;
    g._deviceTab = tab;
    g._deviceSel = null;
}

beforeEach(() => { installStorage(); });

// ── Gear ─────────────────────────────────────────────────────────────────────

describe('gear: a reload keeps what you just put on', () => {
    test('a hat equipped from the bag with the Remoticon keys', async () => {
        const { g } = playing(x => put(x, 14, 'foil_hat'));
        openDevice(g, 'items');
        walkTo(g, 14);
        devKeys(g, 'Space', 'Space');
        assert.equal(g.equipment.top, ITEMS.foil_hat, 'the hat went on');

        const r = await reload(g);
        assert.equal(r.equipment.top?.id, 'foil_hat');
        assert.equal(count(r, 'foil_hat'), 0, 'and left the bag');
    });

    test('armour put on from the GEAR tab chooser', async () => {
        const { g } = playing(x => put(x, 11, 'cardboard_cuirass'));
        openDevice(g, 'gear');
        walkTo(g, 'front');
        devKeys(g, 'Enter', 'Enter');
        assert.equal(g.equipment.front, ITEMS.cardboard_cuirass);

        const r = await reload(g);
        assert.equal(r.equipment.front?.id, 'cardboard_cuirass');
        assert.equal(count(r, 'cardboard_cuirass'), 0);
    });

    test('a hat taken off on the GEAR tab (Bare)', async () => {
        const { g } = playing(x => { x.equipment.top = ITEMS.foil_hat; });
        openDevice(g, 'gear');
        walkTo(g, 'top');
        devKeys(g, 'Enter', 'Enter');
        assert.equal(g.equipment.top, null);

        const r = await reload(g);
        assert.equal(r.equipment.top, null);
        assert.equal(count(r, 'foil_hat'), 1, 'the hat is back in the bag');
    });
});

// ── Eating and drinking ──────────────────────────────────────────────────────

describe('eating and drinking: a reload keeps it', () => {
    test('a burger eaten from the bar', async () => {
        const { g } = playing(x => put(x, 3, 'boardwalk_burger', 2));
        g.xmbCat = 'eat';
        g._useXmbCurrent();
        assert.equal(count(g, 'boardwalk_burger'), 1);
        const hp = g.playerHp;
        assert.ok(hp > 10, 'the burger healed');

        const r = await reload(g);
        assert.equal(count(r, 'boardwalk_burger'), 1);
        assert.equal(r.playerHp, hp);
    });

    test('a mana poition drunk from the bar', async () => {
        const { g } = playing(x => put(x, 4, 'mana_poition'));
        g.xmbCat = 'drink';
        g._useXmbCurrent();
        assert.equal(count(g, 'mana_poition'), 0);
        const mp = g.playerMp;
        assert.ok(mp > 2, 'the poition restored MP');

        const r = await reload(g);
        assert.equal(count(r, 'mana_poition'), 0);
        assert.equal(r.playerMp, mp);
    });

    test('a bandage used from the Remoticon', async () => {
        const { g } = playing(x => put(x, 12, 'bandage', 2));
        openDevice(g, 'items');
        walkTo(g, 12);
        devKeys(g, 'Enter', 'Enter');
        assert.equal(count(g, 'bandage'), 1);

        const r = await reload(g);
        assert.equal(count(r, 'bandage'), 1);
        assert.equal(r.playerHp, g.playerHp);
    });

    test('Fire Blood drunk from the Remoticon', async () => {
        const { g } = playing(x => put(x, 3, 'fire_blood'));
        openDevice(g, 'items');
        walkTo(g, 3);
        devKeys(g, 'Enter', 'Enter');
        assert.equal(count(g, 'fire_blood'), 0);

        const r = await reload(g);
        assert.equal(count(r, 'fire_blood'), 0);
    });
});

// ── Pickups ──────────────────────────────────────────────────────────────────

describe('pickups: a reload keeps what you picked up', () => {
    test('walking onto a rock', async () => {
        const { g } = playing(x => x.groundItems.push({ type: 'rock', x: 5, y: 5, def: ITEMS.rock }));
        g._tryPickup();
        assert.equal(count(g, 'rock'), 1);

        const r = await reload(g);
        assert.equal(count(r, 'rock'), 1);
        assert.equal(r.groundItems.length, 0, 'and it is gone from the floor');
        assert.ok(r._collectedItems.has('town-map.json|5|5|rock'), 'and stays gone');
    });

    test('taking a hat off the next tile puts it on, and that holds', async () => {
        const { g } = playing(x => x.groundItems.push({ type: 'foil_hat', x: 6, y: 5, def: ITEMS.foil_hat }));
        g._takeItemAt(6, 5);
        assert.equal(g.equipment.top, ITEMS.foil_hat);

        const r = await reload(g);
        assert.equal(r.equipment.top?.id, 'foil_hat');
        assert.equal(r.groundItems.length, 0);
    });

    test('taking a rock off the next tile', async () => {
        const { g } = playing(x => x.groundItems.push({ type: 'rock', x: 6, y: 5, def: ITEMS.rock }));
        g._takeItemAt(6, 5);

        const r = await reload(g);
        assert.equal(count(r, 'rock'), 1);
        assert.equal(r.groundItems.length, 0);
    });

    test('taking something out of a spot you examine', async () => {
        const { g } = playing();
        g._grantFromExaminable({ id: 'grate', x: 2, y: 3, grants: 'soap' });
        assert.equal(count(g, 'soap'), 1);

        const r = await reload(g);
        assert.equal(count(r, 'soap'), 1);
        assert.ok(r._collectedItems.has('town-map.json|2|3|soap'));
    });

    test('a full bag picks nothing up and writes nothing', () => {
        const { g } = playing();
        for (let i = 0; i < INVENTORY_SIZE; i++) put(g, i, 'foil_hat');
        const before = localStorage.getItem(SAVE_KEY);
        g.groundItems.push({ type: 'rock', x: 5, y: 5, def: ITEMS.rock });
        g._tryPickup();
        assert.equal(g.groundItems.length, 1);
        assert.equal(localStorage.getItem(SAVE_KEY), before);
    });
});

// ── Trades ───────────────────────────────────────────────────────────────────

describe('trades: a reload keeps a finished trade', () => {
    const alive = { isAlive: () => true };
    const vendor = () => ({
        id: 'puck', type: 'puck', vendor: true, disposition: 40, gold: 200, entity: alive,
        stock: ['bandage', 'soap'], values: { soap: 4 }, behavior: ['IDLE'],
    });

    test('buying from a vendor: the item and the gold both hold', async () => {
        const { g } = playing();
        const npc = vendor();
        g._openOffer(npc);
        g._offerActivate('theirs', 0);   // a bandage
        const price = g._offer.gold;
        assert.ok(price > 0);
        g._offerActivate('commit');
        assert.equal(count(g, 'bandage'), 1, 'the trade went through');

        const r = await reload(g);
        assert.equal(count(r, 'bandage'), 1);
        assert.equal(r.gold, 100 - price);
    });

    test('emptying a chest: the chest stays emptied', async () => {
        const { g } = playing(x => x.containers.push({ id: 'c1', type: 'chest', x: 3, y: 3, contents: ['rock'] }));
        const chest = g.containers[0];
        g._openOffer({
            type: 'chest', vendor: true, bribeable: false, disposition: 100,
            _container: chest, stock: ['rock'], entity: alive,
        });
        g._offerActivate('theirs', 0);
        g._offerActivate('commit');
        assert.equal(count(g, 'rock'), 1);

        const r = await reload(g);
        assert.equal(count(r, 'rock'), 1);
        assert.deepEqual(r.containers[0].contents, []);
    });
});

// ── Leaving the tab ──────────────────────────────────────────────────────────

describe('hiding or closing the tab saves', () => {
    test('the tab going hidden writes the save', async () => {
        const { page, g } = playing();
        g.turn = 9;
        g.gold = 55;
        page.document.visibilityState = 'hidden';
        page.document.dispatchEvent(new Event('visibilitychange'));
        assert.equal(onDisk().turn, 9);

        const r = await reload(g);
        assert.equal(r.gold, 55);
    });

    test('the tab coming back does not write', () => {
        const { page, g } = playing();
        g.turn = 9;
        page.document.visibilityState = 'visible';
        page.document.dispatchEvent(new Event('visibilitychange'));
        assert.equal(onDisk().turn, 6);
    });

    test('closing the page (pagehide) writes the save', () => {
        const { page, g } = playing();
        g.turn = 8;
        page.window.dispatchEvent(new Event('pagehide'));
        assert.equal(onDisk().turn, 8);
    });
});

// ── Where it never writes ────────────────────────────────────────────────────

describe('never on the title, while dead, or mid zone change', () => {
    test('on the title, leaving writes nothing', () => {
        const page = makePage();
        makeGame(page);
        page.document.visibilityState = 'hidden';
        page.document.dispatchEvent(new Event('visibilitychange'));
        page.window.dispatchEvent(new Event('pagehide'));
        assert.equal(hasSave(), false);
    });

    test('on the title with a save, leaving leaves that save alone', () => {
        const { g: src } = playing();
        src.gold = 77; src.autosave({ force: true });
        const before = localStorage.getItem(SAVE_KEY);
        const page = makePage();
        makeGame(page);
        page.window.dispatchEvent(new Event('pagehide'));
        assert.equal(localStorage.getItem(SAVE_KEY), before);
    });

    test('while dead, neither a moment nor leaving writes', () => {
        const { page, g } = playing();
        g.state = STATE.DEAD;
        g.turn = 9;
        g.groundItems.push({ type: 'rock', x: 5, y: 5, def: ITEMS.rock });
        g._tryPickup();
        page.window.dispatchEvent(new Event('pagehide'));
        assert.equal(onDisk().turn, 6);
    });

    test('mid zone change, leaving waits for the load to save itself', () => {
        const { page, g } = playing();
        g.state = STATE.RESOLVING;
        g.turn = 9;
        page.window.dispatchEvent(new Event('pagehide'));
        assert.equal(onDisk().turn, 6);
    });

    test('a fresh run that has done nothing yet does not overwrite the old save on leaving', async () => {
        const { g: src } = playing();
        src.gold = 77; src.autosave({ force: true });
        const page = makePage();
        const g = makeGame(page);
        page.els['splash-go'].click();          // GAME START, by mistake
        assert.equal(g.state, STATE.IDLE);
        assert.equal(g.newRuns, 1);
        page.window.dispatchEvent(new Event('pagehide'));

        const r = await reload();
        assert.equal(r.gold, 77, 'the old run is still there to CONTINUE');
    });

    test('a fresh run that has picked something up does save on leaving', () => {
        const page = makePage();
        const g = makeGame(page);
        page.els['splash-go'].click();
        g.groundItems.push({ type: 'rock', x: 5, y: 5, def: ITEMS.rock });
        g._tryPickup();
        localStorage.clear();
        page.window.dispatchEvent(new Event('pagehide'));
        assert.equal(hasSave(), true);
        assert.equal(readSaveRaw().player.inventory.filter(Boolean)[0].id, 'rock');
    });
});

// ── The five-turn timer is unchanged ─────────────────────────────────────────

describe('an ordinary turn still waits on the five-turn timer', () => {
    test('two plain turns after a save write nothing; the fifth does', () => {
        const { g } = playing();
        g._advanceWorld();   // 8
        g._advanceWorld();   // 9
        assert.equal(onDisk().turn, 6);
        g._advanceWorld();   // 10
        g._advanceWorld();   // 11
        assert.equal(onDisk().turn, 11);
    });
});
