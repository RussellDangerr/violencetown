// carrion-shop.test.js — CN1 (plans/cn1-carrion-sells.md).
//
// Carrion, in the Sewer's south corridor, is a vendor: facing her and pressing E opens her shop
// with Soap and Bandages, and her prices come from her disposition like every vendor's. A bribe
// that flips her moves her to a friendlier price band, so the same two things cost less.
//
// main.js touches `document` at import, so, as in rat-robbery.test.js, the real methods are
// lifted out of the source and bound onto a small game object. The Sewer is the real map and
// Carrion is the real spawn from sewer-map.json. The walk up to her and the E that opens her
// shop are real keys through the real listeners _bindInput registers, and the world beat after
// each step is the real enemy turn (resolveEnemyTurns), so her adjacency line is the real one.
// Staging goods and pressing MAKE THE OFFER are real keys too. The one exception is the gold
// chip: the offer screen reaches it only by a tap (the keyboard has no key for it), so that one
// press goes through the real _tapOffer at the chip's real rectangle.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GameMap, carriesAll } from '../game/map.js';
import { spawnEnemy, resolveEnemyTurns } from '../game/enemies.js';
import { resolveSpawn, defaultPicks } from '../game/slots.js';
import { INVENTORY_SIZE, SAFE_SLOTS, PACK_PAGE, MAX_STACK } from '../game/data.js';
import { addToInventory as addToInv } from '../game/inventory.js';
import { resolveItemDef } from '../game/item-registry.js';
import { isHostile } from '../game/ai.js';
import { defaultVerb } from '../game/wheel-model.js';
import { RNG } from '../game/rng.js';
import {
    MODAL_RECT, HIT_SLOP, offerLayout, offerRowIndexAt, offerTraySlotAt, OFFER_ROWS_VISIBLE, OFFER_TRAY_SLOTS,
} from '../game/layout.js';
import { emptyOffer, commitBlocker, stage, unstage, settledGold, resolveOffer, sameEntry } from '../game/offer.js';
import { band, buyPrice, sellPrice, transferGold } from '../game/trade.js';
import { applyDispositionDelta, reactToTransaction } from '../game/give-action.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');
const sewerJson = readFileSync(fileURLToPath(new URL('../game/sewer-map.json', import.meta.url)), 'utf8');

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
];

// The Sewer's south corridor with Carrion where the map puts her: only her, so the beat is
// hers alone. You start four tiles west of her on her row.
function makeGame({ seed = 7 } = {}) {
    const document = new EventTarget();
    const window = new EventTarget();
    const sewer = JSON.parse(sewerJson);
    const map = new GameMap(sewer, 'sewer-map.json');
    const carrion = sewer.enemies.filter(s => s.id === 'carrion')
        .map(s => spawnEnemy(resolveSpawn(s, defaultPicks()))).filter(Boolean);
    assert.equal(carrion.length, 1, 'the real Sewer carries Carrion');

    const g = {
        state: STATE.IDLE, facing: 'right', turn: 1, map, _mapUrl: 'sewer-map.json',
        enemies: carrion, containers: [], groundItems: [], examinables: [], _tileDiffs: [],
        playerX: 4, playerY: 17, playerHp: 100, playerMaxHp: 100, playerMp: 50, playerMaxMp: 50,
        gold: 100, buffs: [], ringMods: {}, equipment: {},
        inventory: Array(INVENTORY_SIZE).fill(null),
        rng: new RNG(seed), _MOVE_MS: 0,
        _heldDirKeys: [], _physicalHeld: new Set(), _queuedMoveDir: null, _pathQueue: [], _pathArrive: null,
        _animating: false, _animDuration: 1, _TURN_MS: 70, _turnTimer: null, _paused: false,
        _pendingTransition: null, _ratFormTurns: 0, _hasteCharges: 0, _slowCharges: 0,
        _robbed: {}, _hot: {}, _stepIndex: 0,
        logs: [], barks: [],
        _log(m) { this.logs.push(m); },
        _render() {}, _onStepSettled() {}, _tryPickup() {}, _stopAutoRepeat() {}, _resumeHeldWalk() {},
        _flash() {}, _triggerScreenShake() {}, emitGameEvent() {}, _saveMoment() {},
        hasBuff(id) { return this.buffs.some(b => b.id === id); },
        _resolveItemDef: resolveItemDef,
        // The world beat after a step is the real enemy turn: Carrion's adjacency line is hers.
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
        SAFE_SLOTS, PACK_PAGE, MAX_STACK, addToInv,
        MODAL_RECT, HIT_SLOP, offerLayout, offerRowIndexAt, offerTraySlotAt, OFFER_ROWS_VISIBLE, OFFER_TRAY_SLOTS,
        emptyOffer, commitBlocker, stage, unstage, settledGold, resolveOffer, sameEntry,
        sellPrice, buyPrice, transferGold, applyDispositionDelta, reactToTransaction,
    };
    for (const [n, p] of LIFTED) g[n] = liveMethod(n, p, free);
    g._bindInput();
    g.press = async (code) => {
        document.dispatchEvent(new Key('keydown', code));
        document.dispatchEvent(new Key('keyup', code));
        await settle();
    };
    g.carrion = carrion[0];
    return g;
}

// Soap in the pack: the thing she values most, and the thing a bribe is made of.
function giveBag(g, id, count) {
    g.inventory[SAFE_SLOTS] = { itemDef: resolveItemDef(id), count };
}

// A step on an arrow key. A tap toward a new facing only turns you, so one more press moves you.
async function step(g, code) {
    const at = [g.playerX, g.playerY];
    await g.press(code);
    if (g.playerX === at[0] && g.playerY === at[1]) await g.press(code);
}

// Walk the corridor to the tile beside her, facing her.
async function walkUp(g) {
    while (g.playerX < g.carrion.x - 1) await step(g, 'ArrowRight');
    assert.deepEqual([g.playerX, g.playerY], [g.carrion.x - 1, g.carrion.y], 'you stand beside her');
    assert.equal(g.facing, 'right', 'and you face her');
}

// The name of the item on a row of her column.
const theirNames = (g) => g._offerTheirsList().map(r => r.def.id);

// What the screen quotes for ONE unit of her `id`: stage it with the keys, read the gold chip.
// Positive is what you pay. Then close the shop, which discards the basket.
async function quote(g, id) {
    await g.press('KeyE');
    assert.equal(g.state, STATE.TRADE, 'her shop is open');
    await g.press('ArrowRight');                       // over to her column
    const at = theirNames(g).indexOf(id);
    assert.ok(at >= 0, `${id} is on her shelf`);
    while (g._offerCursor.index < at) await g.press('ArrowDown');
    await g.press('Space');
    const price = g._offer.gold;
    await g.press('KeyE');
    assert.equal(g.state, STATE.IDLE, 'the shop closed');
    return price;
}

// The gold chip sits in the slot just past the staged items of its tray. The offer screen has no
// key for it, so this is the one tap: the real _tapOffer, at the chip's real rectangle.
async function tapGoldChip(g) {
    const tray = g._goldTray();
    assert.ok(tray, 'the offer shows a gold chip');
    const L = offerLayout(MODAL_RECT);
    const slot = (tray === 'give' ? L.giveTray : L.takeTray)[(g._offer[tray === 'give' ? 'give' : 'take']).length];
    g._tapOffer({ x: slot.x + slot.w / 2, y: slot.y + slot.h / 2 });
}

// Bribe her with the keys: hand over soap, refuse the coin she would pay you, make the offer.
async function bribe(g) {
    await g.press('KeyE');
    assert.equal(g.state, STATE.TRADE);
    await g.press('Space');                            // stage the soap from the bag, a bar a press
    await g.press('Space');
    assert.equal(g._offer.give[0].count, 2, 'both bars are in the give tray');
    await tapGoldChip(g);                              // no payment: a gift
    assert.equal(g._offer.gold, 0, 'the gold chip was waved off');
    await g.press('Enter');                            // make the offer
    await g.press('KeyE');
    assert.equal(g.state, STATE.IDLE);
}

describe('Carrion keeps a shop (CN1)', () => {
    test('she is a vendor on the real Sewer map, with Soap and Bandages on the shelf', () => {
        const g = makeGame();
        assert.equal(g.carrion.vendor, true);
        assert.deepEqual(g.carrion.stock, ['soap', 'bandage']);
        assert.equal(g.carrion.onFlip, 'offerDiscount', 'her flip is still the merchant one');
    });

    test('walk up to her and press E: her shop opens with Soap and Bandages', async () => {
        const g = makeGame();
        await walkUp(g);
        await g.press('KeyE');
        assert.equal(g.state, STATE.TRADE, 'E opens the shop');
        assert.equal(g._offerNpc, g.carrion);
        assert.deepEqual(theirNames(g), ['soap', 'bandage']);
        assert.ok(g.logs.some(l => /opens the till/.test(l)), 'it opened as a till, not a bare satchel');
        await g.press('KeyE');
        assert.equal(g.state, STATE.IDLE, 'E closes it again');
    });

    test('she still speaks when you walk up to her, once', async () => {
        const g = makeGame();
        await walkUp(g);
        assert.equal(g.barks.length, 1, 'her adjacency line fires on the approach');
        await g.press('KeyE');
        await g.press('KeyE');
        g._advanceWorld();
        assert.equal(g.barks.length, 1, 'the shop does not make her repeat herself');
    });

    test('her price is her disposition\'s price, the same rule as every vendor', async () => {
        const g = makeGame();
        await walkUp(g);
        const d = g.carrion.disposition;
        assert.equal(await quote(g, 'soap'), buyPrice(resolveItemDef('soap'), d));
        assert.equal(await quote(g, 'bandage'), buyPrice(resolveItemDef('bandage'), d));
    });
});

describe('a bribe makes her cheaper (CN1)', () => {
    test('bribe her with the keys, and Soap and Bandages both cost less', async () => {
        const g = makeGame();
        giveBag(g, 'soap', 3);
        await walkUp(g);
        const before = { soap: await quote(g, 'soap'), bandage: await quote(g, 'bandage') };
        const d0 = g.carrion.disposition;
        assert.equal(g.carrion._wasFlipped ?? false, false);

        await bribe(g);

        assert.ok(g.carrion.disposition >= g.carrion.flipThreshold, `the bribe flipped her (${d0} -> ${g.carrion.disposition})`);
        assert.equal(g.carrion._wasFlipped, true, 'the flip fired');
        assert.notEqual(band(g.carrion.disposition), band(d0), 'she moved to a friendlier price band');
        assert.equal(g.carrion.vendor, true, 'she is still a vendor');
        assert.deepEqual(g.carrion.stock, ['soap', 'bandage'], 'with the same shelf');

        const after = { soap: await quote(g, 'soap'), bandage: await quote(g, 'bandage') };
        assert.ok(after.soap < before.soap, `Soap ${before.soap} -> ${after.soap}`);
        assert.ok(after.bandage < before.bandage, `Bandage ${before.bandage} -> ${after.bandage}`);
        assert.equal(after.soap, buyPrice(resolveItemDef('soap'), g.carrion.disposition), 'priced by disposition, nothing else');
        assert.equal(after.bandage, buyPrice(resolveItemDef('bandage'), g.carrion.disposition));
    });

    test('the flip no longer writes a dead discount flag', async () => {
        const g = makeGame();
        giveBag(g, 'soap', 3);
        await walkUp(g);
        await bribe(g);
        assert.equal(g.carrion._wasFlipped, true);
        assert.equal('_discountMode' in g.carrion, false);
    });

    test('and you can buy from her afterwards, at the lower price', async () => {
        const g = makeGame();
        giveBag(g, 'soap', 3);
        await walkUp(g);
        await bribe(g);
        const price = await quote(g, 'bandage');
        const gold = g.gold;
        await g.press('KeyE');
        await g.press('ArrowRight');
        while (theirNames(g)[g._offerCursor.index] !== 'bandage') await g.press('ArrowDown');
        await g.press('Space');
        await g.press('Enter');
        assert.equal(g.gold, gold - price, 'you paid the quoted price');
        const have = g.inventory.filter(s => s && s.itemDef.id === 'bandage').reduce((n, s) => n + s.count, 0);
        assert.equal(have, 1, 'and the Bandage is in your bag');
    });
});
