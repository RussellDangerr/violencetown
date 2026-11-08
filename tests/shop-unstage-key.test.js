// shop-unstage-key.test.js — FX33 (plans/fx33-shop-unstage-key.md).
//
// On the offer screen Space stages one unit of the row under the cursor, and Backspace takes one
// unit back out. Before this the keyboard could only stage; unstaging was a tap on a tray slot, so
// a mistake cost the whole basket (Esc). The footer names the key.
//
// As in carrion-shop.test.js, main.js touches `document` at import, so the real methods are lifted
// out of the source and bound onto a small game object. The Sewer is the real map, Carrion the
// real spawn, and every press is a real keydown through the real listener _bindInput registers.

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
    ['_offerActivate', 'zone, index'], ['_offerUnstageRow', 'zone, index'], ['_canStageGive', 'entry'], ['_resettle', 'npc'],
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


const trayCount = (g, side) => g._offer[side].reduce((n, e) => n + e.count, 0);

// Open her shop, cross to her column and rest the cursor on `id`.
async function openOn(g, id) {
    await g.press('KeyE');
    assert.equal(g.state, STATE.TRADE, 'her shop is open');
    await g.press('ArrowRight');
    const at = theirNames(g).indexOf(id);
    assert.ok(at >= 0, `${id} is on her shelf`);
    while (g._offerCursor.index < at) await g.press('ArrowDown');
    assert.equal(theirNames(g)[g._offerCursor.index], id, 'the cursor is on the row');
}

describe('Backspace takes one unit back out of the offer (FX33)', () => {
    test('buying: Space stages, Backspace unstages, one unit a press, the gold follows', async () => {
        const g = makeGame();
        await walkUp(g);
        await openOn(g, 'soap');
        await g.press('Space');
        await g.press('Space');
        assert.equal(trayCount(g, 'take'), 2, 'two bars staged');
        const two = g._offer.gold;
        assert.ok(two > 0, 'and you owe for them');

        await g.press('Backspace');
        assert.equal(trayCount(g, 'take'), 1, 'one came back out');
        assert.equal(g._offer.take.length, 1, 'the row is still in the tray, now with one');
        assert.ok(g._offer.gold > 0 && g._offer.gold < two, 'the price came down with it');

        await g.press('Backspace');
        assert.equal(g._offer.take.length, 0, 'the last one empties the tray');
        assert.equal(g._offer.gold, 0, 'and the gold settles back to nothing');
        assert.equal(g.state, STATE.TRADE, 'the shop is still open: no Esc was needed');
    });

    test('Backspace on a row with nothing staged does nothing, and Space still stages afterwards', async () => {
        const g = makeGame();
        await walkUp(g);
        await openOn(g, 'soap');
        await g.press('Backspace');
        assert.equal(g._offer.take.length, 0);
        assert.equal(g.state, STATE.TRADE);
        await g.press('Space');
        assert.equal(trayCount(g, 'take'), 1);
        await g.press('Space');
        assert.equal(trayCount(g, 'take'), 2, 'Space still tops a row up; it is not a toggle');
    });

    test('it unstages the row under the cursor, not the last one staged', async () => {
        const g = makeGame();
        await walkUp(g);
        await openOn(g, 'soap');
        await g.press('Space');                            // a soap
        await g.press('ArrowDown');
        assert.equal(theirNames(g)[g._offerCursor.index], 'bandage');
        await g.press('Space');                            // a bandage
        assert.equal(g._offer.take.length, 2);

        await g.press('ArrowUp');                          // back on the soap
        await g.press('Backspace');
        assert.deepEqual(g._offer.take.map(e => e.def.id), ['bandage'], 'the soap came out, the bandage stayed');

        await g.press('ArrowDown');                        // on the bandage again
        await g.press('Backspace');
        assert.equal(g._offer.take.length, 0);
    });

    test('giving: a bar at a time comes back out of the give tray, and the satchel is untouched', async () => {
        const g = makeGame();
        giveBag(g, 'soap', 3);
        await walkUp(g);
        await g.press('KeyE');
        assert.equal(g._offerCursor.side, 'yours', 'the cursor starts in your satchel');
        await g.press('Space');
        await g.press('Space');
        assert.equal(g._offer.give[0].count, 2);

        await g.press('Backspace');
        assert.equal(g._offer.give[0].count, 1, 'one bar back');
        await g.press('Backspace');
        assert.equal(g._offer.give.length, 0, 'and the other');
        assert.equal(g.inventory[SAFE_SLOTS].count, 3, 'nothing left your bag; it was only an offer');
        assert.equal(g.state, STATE.TRADE);
    });

    test('Backspace is not Escape: the rest of the basket survives it', async () => {
        const g = makeGame();
        await walkUp(g);
        await openOn(g, 'soap');
        await g.press('Space');
        await g.press('ArrowDown');
        await g.press('Space');
        await g.press('Space');                            // two bandages
        await g.press('Backspace');
        assert.equal(trayCount(g, 'take'), 2, 'one soap and one bandage are still staged');
        assert.equal(g.state, STATE.TRADE);
        await g.press('Enter');                            // and the offer can still be made
        assert.equal(g.inventory.filter(s => s).length, 2, 'both arrived in the bag');
    });

    test('the footer lists the key beside Space', () => {
        const renderer = readFileSync(fileURLToPath(new URL('../game/renderer.js', import.meta.url)), 'utf8');
        assert.match(renderer, /SPACE STAGE\s+BKSP UNSTAGE\s+ENTER OFFER/);
    });
});
