// pike-rope-price.test.js — BH1 (plans/bh1-pike-rope-price.md): Pike's rope is priced so a
// sewer haul can buy it. Rulings BHR1 (a), BH1R1 (a, about 21 GP at his till) and EK1R1 (b).
//
// Three things are pinned: the rope costs about 21 GP at Pike's own disposition, what the
// Sewer's enemies and chests can give (tests/helpers/zone-haul.js) covers that, and Pike's
// till really sells it for that price.
//
// main.js touches `document` at import, so, as in carrion-shop.test.js, the real methods are
// lifted out of the source and bound onto a small game object. The Canyon is the real map and
// Pike is the real spawn from canyon-map.json, alone. The E that opens his till, the cursor
// moves, the staging Space and the Enter that makes the offer are real keys through the real
// listeners _bindInput registers.

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
import { buyPrice, sellPrice, transferGold } from '../game/trade.js';
import { applyDispositionDelta, reactToTransaction } from '../game/give-action.js';
import { loadMap, zoneHaul, describeHaul } from './helpers/zone-haul.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');
const canyonJson = readFileSync(fileURLToPath(new URL('../game/canyon-map.json', import.meta.url)), 'utf8');

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
    ['_bindInput', ''], ['_noteHeld', 'code'], ['_faceOf', 'dir'], ['_clearTurnTimer', ''],
    ['_beginMoveOrTurn', 'dir'], ['_intendedWalkDir', ''], ['_resolveWalkStep', 'dir'],
    ['_animateMove', 'fromX, fromY, toX, toY, callback, duration = this._animDuration'],
    ['_doMove', 'dir'], ['_canEnter', 'x, y'], ['_digitToSlot', 'code'],
    ['_targetAt', 'x, y'], ['_actOnTarget', 'verb, t'], ['_fireResolver', 'verb, t'],
    ['_openOffer', 'npc'], ['_closeOffer', ''], ['_tapOffer', 'pt'], ['_pointInRect', 'p, r, slop = 0'],
    ['_offerTheirsList', ''], ['_offerYoursList', ''], ['_offerScrollBy', 'side, delta'],
    ['_offerActivate', 'zone, index'], ['_canStageGive', 'entry'], ['_resettle', 'npc'],
    ['_goldTray', ''], ['_toggleOfferGold', 'npc'], ['_buybackList', 'npc'], ['_buybackLive', 'npc'],
    ['_buybackRecord', 'npc, itemId, kind, price'], ['_endBuybacks', ''],
    ['_commitOffer', ''], ['_offerBlocker', ''], ['_logOffer', 'npc, R, { given, taken, gold }'],
    ['_removeFromSlot', 'slot'], ['_addToInventory', 'itemDef'], ['_wheelOpenerUp', ''],
];

const pikeSpawn = JSON.parse(canyonJson).enemies.find((s) => s.id === 'pike');

// The Canyon with Pike where the map puts him, alone, and you beside him, facing him.
function makeGame({ gold = 0, seed = 7 } = {}) {
    const document = new EventTarget();
    const window = new EventTarget();
    const canyon = JSON.parse(canyonJson);
    const map = new GameMap(canyon, 'canyon-map.json');
    const pike = canyon.enemies.filter((s) => s.id === 'pike')
        .map((s) => spawnEnemy(resolveSpawn(s, defaultPicks()))).filter(Boolean);
    assert.equal(pike.length, 1, 'the real Canyon carries Pike');

    const g = {
        state: STATE.IDLE, facing: 'right', turn: 1, map, _mapUrl: 'canyon-map.json',
        enemies: pike, containers: [], groundItems: [], examinables: [], _tileDiffs: [],
        playerX: pike[0].x - 1, playerY: pike[0].y, playerHp: 100, playerMaxHp: 100, playerMp: 50, playerMaxMp: 50,
        gold, buffs: [], ringMods: {}, equipment: {},
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
        _advanceWorld() {
            this.turn++;
            resolveEnemyTurns(this);
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
    g.pike = pike[0];
    return g;
}

const theirNames = (g) => g._offerTheirsList().map((r) => r.def.id);
const hooksIn = (g) => g.inventory.filter((s) => s && s.itemDef.id === 'grappling_hook')
    .reduce((n, s) => n + (s.count ?? 1), 0);

// Open the till, go over to his column, put the rope in the basket. Leaves the shop open.
async function stageRope(g) {
    await g.press('KeyE');
    assert.equal(g.state, STATE.TRADE, "Pike's till is open");
    await g.press('ArrowRight');
    const at = theirNames(g).indexOf('grappling_hook');
    assert.ok(at >= 0, 'the rope is on his shelf');
    while (g._offerCursor.index < at) await g.press('ArrowDown');
    await g.press('Space');
}

const hook = resolveItemDef('grappling_hook');

describe("the rope's price at Pike's till (BH1R1)", () => {
    test('Pike is a vendor on the real Canyon map with the rope on his shelf', () => {
        assert.ok(pikeSpawn.vendor && pikeSpawn.stock.includes('grappling_hook'));
        assert.equal(typeof pikeSpawn.disposition, 'number');
    });

    test('it costs about 21 GP at his disposition', () => {
        assert.equal(buyPrice(hook, pikeSpawn.disposition), 21);
    });

    test('his disposition still moves it: a friendlier Pike charges less, a wary one more', () => {
        const here = buyPrice(hook, pikeSpawn.disposition);
        assert.ok(buyPrice(hook, 80) < here, 'adoring is cheaper');
        assert.ok(buyPrice(hook, -30) > here, 'wary costs more');
    });
});

describe('what the Sewer can give pays for the rope (BHR1, EK1R1)', () => {
    // The cache behind the Sludge Bloom needs a fire to reach, so it is not on the plain
    // route and is not added (tests/ramp-route-gold.test.js).
    const sewer = loadMap('sewer-map.json');
    const price = buyPrice(hook, pikeSpawn.disposition);
    const haul = zoneHaul(sewer, pikeSpawn.disposition, { gatedChests: ['bloom-cache'] });

    test("its purses, kit and chests, sold at Pike's disposition, cover the rope", () => {
        // This is what a full clear gives, not what is guaranteed on any one run.
        assert.ok(haul.total >= price,
            `the Sewer gives ${describeHaul(haul)}; the rope costs ${price} gp at Pike's disposition ${pikeSpawn.disposition}`);
    });

    test('and it does not lean on one part alone', () => {
        assert.ok(haul.purses.total > 0, 'the Sewer has purses to take');
        assert.ok(haul.kit.total > 0, 'some kit survives a fight');
        assert.ok(haul.chests.total > 0, 'the open chest has something in it');
    });
});

describe("buying the rope through Pike's till with real keys", () => {
    test('with the Sewer haul in your pocket, E, Space and Enter buy it at the quoted price', async () => {
        const sewer = loadMap('sewer-map.json');
        const haul = zoneHaul(sewer, pikeSpawn.disposition, { gatedChests: ['bloom-cache'] });
        const g = makeGame({ gold: haul.total });
        await stageRope(g);
        const price = buyPrice(hook, g.pike.disposition);
        assert.equal(g._offer.gold, price, 'the till quotes the rope at his price');
        assert.equal(price, 21);
        await g.press('Enter');
        assert.equal(g.gold, haul.total - price, 'you paid that price');
        assert.equal(hooksIn(g), 1, 'and the rope is in your bag');
        await g.press('KeyE');
        assert.equal(g.state, STATE.IDLE, 'the till closes');
    });

    test('a pocket one gold short cannot buy it', async () => {
        const g = makeGame({ gold: buyPrice(hook, pikeSpawn.disposition) - 1 });
        await stageRope(g);
        await g.press('Enter');
        assert.equal(hooksIn(g), 0, 'no rope without the gold');
    });
});
