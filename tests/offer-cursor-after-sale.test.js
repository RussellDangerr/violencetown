//
// After a sale the keyboard cursor must land on a row that still exists. Real Macc from the real
// town map, every press a real keydown through the real listener (as in shop-unstage-key.test.js).
// main.js touches `document` at import, so the real methods are lifted out of the source.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ITEMS } from '../game/items.js';
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
const townJson = readFileSync(fileURLToPath(new URL('../game/town-map.json', import.meta.url)), 'utf8');

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

function makeGame() {
    const document = new EventTarget();
    const window = new EventTarget();
    const town = JSON.parse(townJson);
    const map = new GameMap(town, 'town-map.json');
    const macc = spawnEnemy(resolveSpawn(town.enemies.find(s => s.id === 'townie-macc'), defaultPicks()));
    assert.ok(macc, 'the real town carries Macc');
    const g = {
        state: STATE.IDLE, facing: 'right', turn: 1, map, _mapUrl: 'town-map.json',
        enemies: [macc], containers: [], groundItems: [], examinables: [], _tileDiffs: [],
        playerX: macc.x - 1, playerY: macc.y, playerHp: 100, playerMaxHp: 100, playerMp: 50, playerMaxMp: 50,
        gold: 100, buffs: [], ringMods: {}, equipment: {},
        inventory: Array(INVENTORY_SIZE).fill(null),
        rng: new RNG(7), _MOVE_MS: 0,
        _heldDirKeys: [], _physicalHeld: new Set(), _queuedMoveDir: null, _pathQueue: [], _pathArrive: null,
        _animating: false, _animDuration: 1, _TURN_MS: 70, _turnTimer: null, _paused: false,
        _pendingTransition: null, _ratFormTurns: 0, _hasteCharges: 0, _slowCharges: 0,
        _robbed: {}, _hot: {}, _stepIndex: 0,
        logs: [],
        _log(m) { this.logs.push(m); },
        _render() {}, _onStepSettled() {}, _tryPickup() {}, _stopAutoRepeat() {}, _resumeHeldWalk() {},
        _flash() {}, _triggerScreenShake() {}, emitGameEvent() {}, _saveMoment() {},
        hasBuff(id) { return this.buffs.some(b => b.id === id); },
        _resolveItemDef: resolveItemDef,
        _advanceWorld() { this.turn++; },
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
    g.macc = macc;
    return g;
}

// Six single items in the bag, in the first six safe slots.
function fillBag(g, n = 6) {
    const ids = Object.keys(ITEMS).filter(k => !ITEMS[k].questItem).slice(0, n);
    assert.equal(ids.length, n);
    ids.forEach((id, i) => { g.inventory[SAFE_SLOTS + i] = { itemDef: resolveItemDef(id), count: 1 }; });
}

const cur = (g) => ({ side: g._offerCursor.side, index: g._offerCursor.index });

describe('the cursor after a sale (OC1)', () => {
    test('sell the last row of the bag: the cursor sits on the new last row and Space stages it', async () => {
        const g = makeGame();
        fillBag(g, 6);
        await g.press('KeyE');
        assert.equal(g.state, STATE.TRADE, "Macc's shop is open");
        assert.equal(g._offerYoursList().length, 6);
        for (let i = 0; i < 5; i++) await g.press('ArrowDown');
        assert.deepEqual(cur(g), { side: 'yours', index: 5 });
        await g.press('Space');
        assert.equal(g._offer.give.length, 1, 'the last row is staged');
        await g.press('Enter');
        assert.equal(g._offerYoursList().length, 5, 'it sold');
        assert.deepEqual(cur(g), { side: 'yours', index: 4 }, 'the cursor is on the new last row');
        await g.press('Space');
        assert.equal(g._offer.give.length, 1, 'Space stages that row');
        assert.equal(g._offer.give[0].def.id, g._offerYoursList()[4].def.id);
    });

    test('selling a middle row leaves the cursor where it was', async () => {
        const g = makeGame();
        fillBag(g, 6);
        await g.press('KeyE');
        await g.press('ArrowDown');
        await g.press('Space');
        await g.press('Enter');
        assert.deepEqual(cur(g), { side: 'yours', index: 1 });
        await g.press('Space');
        assert.equal(g._offer.give.length, 1);
    });

    test('selling the whole bag leaves the cursor at 0, not -1', async () => {
        const g = makeGame();
        fillBag(g, 1);
        await g.press('KeyE');
        await g.press('Space');
        await g.press('Enter');
        assert.equal(g._offerYoursList().length, 0);
        assert.equal(g._offerCursor.index, 0);
    });
});
