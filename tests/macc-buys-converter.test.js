// macc-buys-converter.test.js -- MC1: Macc really buys the Converter, and the taxi quest survives it
// (plans/mc1-macc-buys-converter.md). Real Macc from the real town map, every press a real keydown
// through the real listener, as in offer-cursor-after-sale.test.js.

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
import { band, buyPrice, sellPrice, specialDef, transferGold } from '../game/trade.js';
import { QuestEngine, QUESTS } from '../game/quests.js';
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
    ['_removeFromSlot', 'slot'], ['_addToInventory', 'itemDef'], ['_wheelOpenerUp', ''], ['_shelfPrice', 'npc, itemId'], ['_interactCar', ''], ['setTile', 'x, y, id'], ['_openBridgeIfCarFixed', ''],
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
        _flash() {}, _triggerScreenShake() {}, emitGameEvent(t, p) { this.questEngine.emit(t, p); }, _saveMoment() {}, carFuel: 'raw',
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
        sellPrice, buyPrice, specialDef, transferGold, applyDispositionDelta, reactToTransaction,
    };
    for (const [n, p] of LIFTED) g[n] = liveMethod(n, p, free);
    g._closeCurrentMenu = function () { this._closeOffer(); };
    g.questEngine = new QuestEngine(g);
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

const CONVERTER = () => ({ itemDef: resolveItemDef('catalytic_converter'), count: 1 });
const heldConverter = (g) => g.inventory.some(s => s && s.itemDef.id === 'catalytic_converter');
const shelved = (g) => g.questEngine.state.flags.shelved;

// Quest 1 at its last stage, the Converter in the bag, Macc a step away.
function atReturnStage(g) {
    g.questEngine.start('fix_car');
    g.questEngine.state.stageIndex = QUESTS.fix_car.stages.findIndex(s => s.id === 'return_to_car');
    g.inventory[SAFE_SLOTS] = CONVERTER();
}

async function sellIt(g) {
    await g.press('KeyE');
    assert.equal(g.state, STATE.TRADE, "Macc's shop is open");
    await g.press('Space');
    assert.equal(g._offer.give.length, 1, 'the Converter stages (no "hold onto that")');
    await g.press('Enter');
}

async function buyItBack(g) {
    await g.press('KeyE');
    assert.equal(g.state, STATE.TRADE);
    await g.press('ArrowRight');
    await g.press('Space');
    assert.equal(g._offer.take.length, 1, 'the shelf row stages');
    await g.press('Enter');
}

describe('Macc buys the Converter', () => {
    test('his purse can cover it, and his line promises it', () => {
        const g = makeGame();
        assert.equal(g.macc.specialBuys.catalytic_converter, 500);
        assert.ok(g.macc.gold >= 500);
    });

    test('selling with real keys pays exactly 500 and takes it from the bag', async () => {
        const g = makeGame();
        atReturnStage(g);
        const before = g.gold;
        await sellIt(g);
        assert.equal(g.gold, before + 500);
        assert.equal(heldConverter(g), false);
        assert.equal(shelved(g).catalytic_converter, 500, 'it sits on his shelf at what he paid');
    });

    test('the price is 500 at every mood that deals', () => {
        const def = specialDef(resolveItemDef('catalytic_converter'), 500);
        for (const d of [100, 60, 30, 10, -10, -40, -50]) assert.equal(sellPrice(def, d), 500, `at ${d}`);
        assert.equal(sellPrice(def, -51), null, 'below the floor he does not deal');
        assert.equal(sellPrice(resolveItemDef('catalytic_converter'), 60), null, 'every other merchant still cannot');
    });
});

describe('the taxi quest after a sale', () => {
    test('the objective says to buy it back, and reads as today before a sale', async () => {
        const g = makeGame();
        atReturnStage(g);
        const plain = QUESTS.fix_car.stages[3].objective;
        assert.equal(g.questEngine.getHudText(), plain);
        await sellIt(g);
        assert.equal(g.questEngine.getHudText(), QUESTS.fix_car.stages[3].objectiveShelved);
        assert.equal(g.questEngine.currentStageId(), 'return_to_car', 'the quest did not move');
    });

    test('buy it back for exactly 500 however he feels, then finish the taxi', async () => {
        const g = makeGame();
        atReturnStage(g);
        await sellIt(g);
        await g.press('Escape');
        // The mood moves; the price does not. Also leave the zone (the ordinary buyback shelf closes).
        g.macc.disposition = 70;
        g._endBuybacks();
        const gold = g.gold;
        await buyItBack(g);
        assert.equal(gold - g.gold, 500, 'back at what he paid');
        assert.equal(heldConverter(g), true);
        assert.equal(shelved(g).catalytic_converter, undefined, 'the shelf is empty again');
        await g.press('Escape');

        // The taxi: walk the last step into it with a real key.
        g.state = STATE.IDLE;
        g.playerX = 17; g.playerY = 4; g.facing = 'up';
        await g.press('ArrowUp');
        assert.ok(g.questEngine.isComplete('fix_car'), 'the taxi runs');
        assert.equal(heldConverter(g), false);
    });

    test('before selling, the quest plays as it did: install at the taxi', async () => {
        const g = makeGame();
        atReturnStage(g);
        g.playerX = 17; g.playerY = 4; g.facing = 'up';
        await g.press('ArrowUp');
        assert.ok(g.questEngine.isComplete('fix_car'));
        assert.equal(shelved(g), undefined);
    });

    test('the sale and the shelf survive a save', async () => {
        const g = makeGame();
        atReturnStage(g);
        await sellIt(g);
        const saved = JSON.parse(JSON.stringify(g.questEngine.serialize ? g.questEngine.serialize() : { flags: g.questEngine.state.flags }));
        assert.equal(saved.flags.shelved.catalytic_converter, 500);
    });
});
