// armour-by-zone.test.js — GP1 (plans/gp1-armour-by-zone.md).
//
// Armour climbs through the zones: the Sewer holds three pieces (Foil Hat, Shoe Bags, the Red
// Cape in its grate), Latex Gloves are bought from the Corner Merchant in Downtown, and the
// Cardboard Cuirass is bought from Puck in the Factory. Prices are the shop's one rule, so this
// file pins the numbers the card named (13 and 17) and the rule they come from.
//
// main.js touches `document` at import, so, as in carrion-shop.test.js, the real methods are
// lifted out of the source and bound onto a small game object. The maps and the two vendors are
// the real ones from the real JSON. Walking up, opening the shop, staging a purchase, making the
// offer, and wearing a piece (Tab, the GEAR tab, a plate, the chooser) are all real keys through
// the real listeners _bindInput registers. The armour read is the real _playerArmor, the same
// number the EQUIPMENT panel prints after the word ARMOR.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GameMap, carriesAll } from '../game/map.js';
import { spawnEnemy, resolveEnemyTurns } from '../game/enemies.js';
import { resolveSpawn, defaultPicks } from '../game/slots.js';
import { INVENTORY_SIZE, SAFE_SLOTS, PACK_PAGE, MAX_STACK } from '../game/data.js';
import { addToInventory as addToInv, zoneOf, moveToZone, pageCount, slotOnPage, pageOfSlot } from '../game/inventory.js';
import { resolveItemDef } from '../game/item-registry.js';
import { ITEMS, resolveUse, unequipItem } from '../game/items.js';
import { itemActions, equipOptions } from '../game/inspector.js';
import { isHostile } from '../game/ai.js';
import { defaultVerb } from '../game/wheel-model.js';
import { RNG } from '../game/rng.js';
import {
    MODAL_RECT, HIT_SLOP, offerLayout, offerRowIndexAt, offerTraySlotAt, OFFER_ROWS_VISIBLE, OFFER_TRAY_SLOTS,
    DEVICE_TABS, deviceTabRect, cycleDeviceTab, deviceBodyRect, deviceBagSlotRects, deviceBagPagerRects,
    deviceEquipLayout, deviceRingsLayout, inspectorActionRects, gearOptionRects, nearestRectInDir,
} from '../game/layout.js';
import { emptyOffer, commitBlocker, stage, unstage, settledGold, resolveOffer, sameEntry } from '../game/offer.js';
import { buyPrice, sellPrice, transferGold } from '../game/trade.js';
import { applyDispositionDelta, reactToTransaction } from '../game/give-action.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');
const readMap = (file) => readFileSync(fileURLToPath(new URL(`../game/${file}`, import.meta.url)), 'utf8');

function liveMethod(name, params, freeVars) {
    const signature = `\n    ${name}(${params}) {`;
    const at = mainSrc.indexOf(signature, mainSrc.indexOf('class Game {'));
    assert.ok(at > 0, `${name}(${params}) not found in main.js`);
    const closeAt = mainSrc.indexOf('\n    }', at + 1);
    const body = mainSrc.slice(at + 5 + name.length, closeAt + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
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
const audio = { playSfx() {}, playMusic() {} };

class Key extends Event {
    constructor(type, code) {
        super(type, { bubbles: true, cancelable: true });
        this.code = code;
        this.key = code;
        this.repeat = false;
        this.ctrlKey = false; this.metaKey = false; this.altKey = false; this.shiftKey = false;
    }
}

const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r)); };

const LIFTED = [
    // walking, bumping and the E key
    ['_bindInput', ''], ['_noteHeld', 'code'], ['_faceOf', 'dir'], ['_clearTurnTimer', ''],
    ['_beginMoveOrTurn', 'dir'], ['_intendedWalkDir', ''], ['_resolveWalkStep', 'dir'],
    ['_animateMove', 'fromX, fromY, toX, toY, callback, duration = this._animDuration'],
    ['_doMove', 'dir'], ['_canEnter', 'x, y'], ['_digitToSlot', 'code'],
    ['_targetAt', 'x, y'], ['_actOnTarget', 'verb, t'], ['_fireResolver', 'verb, t'],
    // the offer screen
    ['_openOffer', 'npc'], ['_closeOffer', ''], ['_tapOffer', 'pt'], ['_pointInRect', 'p, r, slop = 0'],
    ['_offerTheirsList', ''], ['_offerYoursList', ''], ['_offerScrollBy', 'side, delta'],
    ['_offerActivate', 'zone, index'], ['_canStageGive', 'entry'], ['_resettle', 'npc'],
    ['_goldTray', ''], ['_toggleOfferGold', 'npc'], ['_buybackList', 'npc'], ['_buybackLive', 'npc'],
    ['_buybackRecord', 'npc, itemId, kind, price'], ['_endBuybacks', ''],
    ['_commitOffer', ''], ['_offerBlocker', ''], ['_logOffer', 'npc, R, { given, taken, gold }'],
    ['_removeFromSlot', 'slot'], ['_addToInventory', 'itemDef'], ['_wheelOpenerUp', ''],
    // the Remoticon's GEAR tab, where a piece is put on, and the armour sum the panel prints
    ['_openDevice', "tab = 'items'"], ['_closeDevice', ''], ['_deviceKey', 'code'],
    ['_deviceActivate', 'zone, index'], ['_deviceTargets', ''], ['_deviceFocus', 't, i'],
    ['_deviceBack', ''], ['_deviceCycleTab', 'dir'], ['_playerArmor', ''],
];

// One real map, one real vendor from it, and nobody else: the beat is theirs alone.
function makeGame({ file, vendorId, start, seed = 7 }) {
    const document = new EventTarget();
    const window = new EventTarget();
    const json = JSON.parse(readMap(file));
    const map = new GameMap(json, file);
    const vendors = json.enemies.filter(s => s.id === vendorId)
        .map(s => spawnEnemy(resolveSpawn(s, defaultPicks()))).filter(Boolean);
    assert.equal(vendors.length, 1, `the real map carries ${vendorId}`);

    const g = {
        state: STATE.IDLE, facing: 'right', turn: 1, map, _mapUrl: file,
        enemies: vendors, containers: [], groundItems: [], examinables: [], _tileDiffs: [],
        playerX: start[0], playerY: start[1], playerHp: 100, playerMaxHp: 100, playerMp: 50, playerMaxMp: 50,
        gold: 100, buffs: [], ringMods: {}, equipment: {},
        inventory: Array(INVENTORY_SIZE).fill(null),
        rng: new RNG(seed), _MOVE_MS: 0,
        _heldDirKeys: [], _physicalHeld: new Set(), _queuedMoveDir: null, _pathQueue: [], _pathArrive: null,
        _animating: false, _animDuration: 1, _TURN_MS: 70, _turnTimer: null, _paused: false,
        _pendingTransition: null, _ratFormTurns: 0, _hasteCharges: 0, _slowCharges: 0,
        _robbed: {}, _hot: {}, _stepIndex: 0, _deviceTab: 'items', _deviceSel: null, _bagPage: 0,
        logs: [], barks: [],
        _log(m) { this.logs.push(m); },
        _render() {}, _onStepSettled() {}, _tryPickup() {}, _stopAutoRepeat() {}, _resumeHeldWalk() {},
        _flash() {}, _triggerScreenShake() {}, emitGameEvent() {}, _saveMoment() {},
        _refreshGrantedSkills() {}, _poitionMod() { return 0; },   // no poitions, no granted skills here
        hasBuff(id) { return this.buffs.some(b => b.id === id); },
        _resolveItemDef: resolveItemDef,
        _advanceWorld() {
            this.turn++;
            for (const m of resolveEnemyTurns(this)) {
                if (m && m.category === 'adjacency-bark') this.barks.push(m.text ?? m.message ?? m);
            }
        },
    };
    const free = {
        STATE, DIRS, audio, document, window, carriesAll,
        requestAnimationFrame: (f) => queueMicrotask(() => f(Infinity)),
        performance: { now: () => 0 },
        setTimeout: () => 0,
        defaultVerb, isHostile,
        SAFE_SLOTS, PACK_PAGE, MAX_STACK, INVENTORY_SIZE, addToInv, zoneOf, moveToZone, pageCount, slotOnPage, pageOfSlot,
        MODAL_RECT, HIT_SLOP, offerLayout, offerRowIndexAt, offerTraySlotAt, OFFER_ROWS_VISIBLE, OFFER_TRAY_SLOTS,
        emptyOffer, commitBlocker, stage, unstage, settledGold, resolveOffer, sameEntry,
        sellPrice, buyPrice, transferGold, applyDispositionDelta, reactToTransaction,
        DEVICE_TABS, deviceTabRect, cycleDeviceTab, deviceBodyRect, deviceBagSlotRects, deviceBagPagerRects,
        deviceEquipLayout, deviceRingsLayout, inspectorActionRects, gearOptionRects, nearestRectInDir,
        itemActions, equipOptions, resolveUse, unequipItem,
    };
    for (const [n, p] of LIFTED) g[n] = liveMethod(n, p, free);
    g._bindInput();
    g.press = async (code) => {
        document.dispatchEvent(new Key('keydown', code));
        document.dispatchEvent(new Key('keyup', code));
        await settle();
    };
    g.vendor = vendors[0];
    return g;
}

const downtown = () => makeGame({ file: 'downtown-map.json', vendorId: 'dt-merch1', start: [1, 8] });
const factory = () => makeGame({ file: 'factory-map.json', vendorId: 'puck', start: [3, 14] });

const armour = (g) => g._playerArmor();
const bagCount = (g, id) => g.inventory.filter(s => s && s.itemDef.id === id).reduce((n, s) => n + s.count, 0);
const theirNames = (g) => g._offerTheirsList().map(r => r.def.id);

// A step on an arrow key. A tap toward a new facing only turns you, so one more press moves you.
async function step(g, code) {
    const at = [g.playerX, g.playerY];
    await g.press(code);
    if (g.playerX === at[0] && g.playerY === at[1]) await g.press(code);
}

// Walk the row to the tile beside the vendor, facing them.
async function walkUp(g) {
    while (g.playerX < g.vendor.x - 1) await step(g, 'ArrowRight');
    assert.deepEqual([g.playerX, g.playerY], [g.vendor.x - 1, g.vendor.y], 'you stand beside them');
    assert.equal(g.facing, 'right', 'and you face them');
}

// Open the shop, stage one `id` from their shelf with the keys, make the offer. Returns what the
// screen quoted for it (what you pay), and leaves the shop closed.
async function buy(g, id) {
    await g.press('KeyE');
    assert.equal(g.state, STATE.TRADE, 'their shop is open');
    await g.press('ArrowRight');                       // over to their column
    const at = theirNames(g).indexOf(id);
    assert.ok(at >= 0, `${id} is on their shelf`);
    while (g._offerCursor.index < at) await g.press('ArrowDown');
    await g.press('Space');
    const price = g._offer.gold;
    await g.press('Enter');                            // make the offer
    if (g.state === STATE.TRADE) await g.press('KeyE');
    assert.equal(g.state, STATE.IDLE, 'the shop closed');
    return price;
}

// Put a piece on with the keys: Tab opens the Remoticon, C the GEAR tab, arrows walk the cursor to
// the plate, Enter opens its chooser, Enter again picks the piece.
async function wear(g, slotKey) {
    await g.press('Tab');
    assert.equal(g.state, STATE.DEVICE, 'the Remoticon is open');
    await g.press('KeyC');
    assert.equal(g._deviceTab, 'gear');
    await g.press('ArrowRight');                       // the first move only shows the cursor
    for (let n = 0; n < 12 && g._deviceSel?.slotKey !== slotKey; n++) {
        const t = g._deviceTargets();
        const want = t.rects[t.ids.indexOf(slotKey)];
        const here = t.rects[t.cur];
        const dx = (want.x + want.w / 2) - (here.x + here.w / 2);
        const dy = (want.y + want.h / 2) - (here.y + here.h / 2);
        const code = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft') : (dy > 0 ? 'ArrowDown' : 'ArrowUp');
        await g.press(code);
    }
    assert.equal(g._deviceSel?.slotKey, slotKey, `the cursor reached the ${slotKey} plate`);
    await g.press('Enter');                            // open the chooser
    await g.press('Enter');                            // pick its first piece
    assert.ok(g.equipment[slotKey], `something is worn on ${slotKey}`);
    await g.press('Tab');
    assert.equal(g.state, STATE.IDLE, 'the Remoticon closed');
}

describe('the Sewer no longer holds the two pieces that are sold (GP1)', () => {
    const sewer = JSON.parse(readMap('sewer-map.json'));
    const onFloor = sewer.items.map(i => i.type);

    test('no Latex Gloves and no Cardboard Cuirass on the floor', () => {
        assert.ok(onFloor.length > 5, 'there is a floor to check');
        assert.equal(onFloor.includes('latex_gloves'), false);
        assert.equal(onFloor.includes('cardboard_cuirass'), false);
    });

    test('Foil Hat and Shoe Bags are still there, and so is the Red Cape\'s grate', () => {
        assert.equal(onFloor.filter(t => t === 'foil_hat').length, 1);
        assert.equal(onFloor.filter(t => t === 'shoe_bags').length, 1);
        assert.equal(sewer.examinables.filter(e => e.grants === 'red_cape').length, 1);
    });

    test('no other zone leaves either piece on the ground', () => {
        for (const file of ['downtown-map.json', 'factory-map.json', 'sewer-map.json']) {
            const types = (JSON.parse(readMap(file)).items || []).map(i => i.type);
            assert.equal(types.includes('latex_gloves'), false, file);
            assert.equal(types.includes('cardboard_cuirass'), false, file);
        }
    });
});

describe('the shelves', () => {
    test('Corner Merchant stocks Latex Gloves beside what he sold before', () => {
        const g = downtown();
        assert.equal(g.vendor.vendor, true);
        assert.deepEqual(g.vendor.stock, ['bandage', 'rock', 'latex_gloves']);
    });

    test('Puck stocks the Cardboard Cuirass beside what he sold before', () => {
        const g = factory();
        assert.equal(g.vendor.vendor, true);
        assert.ok(g.vendor.stock.includes('cardboard_cuirass'));
        assert.deepEqual(g.vendor.stock.filter(s => s !== 'cardboard_cuirass'),
            ['bandage', 'hot_dog', 'boardwalk_burger', 'soap', 'rock', 'sludge_sack', 'pipe', 'health_poition', 'mana_poition']);
    });

    test('the prices are the shop\'s one rule at each vendor\'s disposition, 13 and 17', () => {
        assert.equal(buyPrice(ITEMS.latex_gloves, downtown().vendor.disposition), 13);
        assert.equal(buyPrice(ITEMS.cardboard_cuirass, factory().vendor.disposition), 17);
    });
});

describe('buying and wearing, by the keys (GP1)', () => {
    test('Latex Gloves: walk up to the Corner Merchant, buy them for 13 GP, wear them for +1 armour', async () => {
        const g = downtown();
        await walkUp(g);
        assert.equal(armour(g), 0);
        const price = await buy(g, 'latex_gloves');
        assert.equal(price, 13, 'the screen quoted 13 GP');
        assert.equal(g.gold, 100 - 13, 'and 13 GP left your purse');
        assert.equal(bagCount(g, 'latex_gloves'), 1, 'the Gloves are in your bag');
        assert.equal(armour(g), 0, 'in the bag they do nothing');
        await wear(g, 'sides');
        assert.equal(g.equipment.sides, ITEMS.latex_gloves);
        assert.equal(bagCount(g, 'latex_gloves'), 0);
        assert.equal(armour(g), 1, 'worn, they add 1');
    });

    test('Cardboard Cuirass: walk up to Puck, buy it for 17 GP, wear it for +4 armour', async () => {
        const g = factory();
        await walkUp(g);
        assert.equal(armour(g), 0);
        const price = await buy(g, 'cardboard_cuirass');
        assert.equal(price, 17, 'the screen quoted 17 GP');
        assert.equal(g.gold, 100 - 17, 'and 17 GP left your purse');
        assert.equal(bagCount(g, 'cardboard_cuirass'), 1, 'the Cuirass is in your bag');
        await wear(g, 'front');
        assert.equal(g.equipment.front, ITEMS.cardboard_cuirass);
        assert.equal(armour(g), 4, 'worn, it adds 4');
    });

    test('all five worn: the two bought pieces and the three from the Sewer read 10 armour', async () => {
        const g = downtown();
        // The Sewer's three, as the floor and the grate hand them over.
        const cfg = { size: INVENTORY_SIZE, safeSlots: SAFE_SLOTS, maxStack: MAX_STACK, pageSize: PACK_PAGE };
        for (const id of ['foil_hat', 'shoe_bags', 'red_cape']) assert.ok(addToInv(g.inventory, resolveItemDef(id), cfg));
        await walkUp(g);
        await buy(g, 'latex_gloves');
        // On to Puck's counter with the same bag: the Cuirass is bought on the same terms.
        const f = factory();
        f.inventory = g.inventory; f.equipment = g.equipment; f.gold = g.gold;
        await walkUp(f);
        await buy(f, 'cardboard_cuirass');
        assert.equal(f.gold, 100 - 13 - 17);

        for (const slot of ['top', 'bottom', 'back', 'sides', 'front']) await wear(f, slot);
        assert.deepEqual(Object.keys(f.equipment).sort(), ['back', 'bottom', 'front', 'sides', 'top']);
        assert.equal(f.equipment.top, ITEMS.foil_hat);
        assert.equal(f.equipment.bottom, ITEMS.shoe_bags);
        assert.equal(f.equipment.back, ITEMS.red_cape);
        assert.equal(f.equipment.sides, ITEMS.latex_gloves);
        assert.equal(f.equipment.front, ITEMS.cardboard_cuirass);
        assert.equal(armour(f), 10, '2 + 2 + 1 + 1 + 4');
    });
});
