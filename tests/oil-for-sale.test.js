// oil-for-sale.test.js — TX7: Hooch sells oil beside the alcohol (plans/tx7-hooch-sells-oil.md).
// The real town map and the real Hooch; the real offer-screen methods lifted out of main.js;
// every press a real keydown. Then the bought oil is spread at the bridge as in oil-slide.test.js.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ITEMS } from '../game/items.js';
import { GameMap, carriesAll } from '../game/map.js';
import { spawnEnemy } from '../game/enemies.js';
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
import { QuestEngine } from '../game/quests.js';
import { applyDispositionDelta, reactToTransaction } from '../game/give-action.js';
import { contextualUses } from '../game/item-uses.js';

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
        this.code = code; this.key = code; this.repeat = false;
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
    ['_offerActivate', 'zone, index'], ['_offerUnstageRow', 'zone, index'], ['_canStageGive', 'entry'], ['_resettle', 'npc'],
    ['_goldTray', ''], ['_toggleOfferGold', 'npc'], ['_buybackList', 'npc'], ['_buybackLive', 'npc'],
    ['_buybackRecord', 'npc, itemId, kind, price'], ['_endBuybacks', ''],
    ['_commitOffer', ''], ['_offerBlocker', ''], ['_logOffer', 'npc, R, { given, taken, gold }'],
    ['_removeFromSlot', 'slot'], ['_addToInventory', 'itemDef'], ['_wheelOpenerUp', ''], ['_interactCar', ''],
    ['setTile', 'x, y, id'], ['_openBridgeIfCarFixed', ''],
];

function makeGame() {
    const document = new EventTarget();
    const window = new EventTarget();
    const town = JSON.parse(townJson);
    const map = new GameMap(town, 'town-map.json');
    const hooch = spawnEnemy(resolveSpawn(town.enemies.find(s => s.id === 'townie-hooch'), defaultPicks()));
    assert.ok(hooch, 'the real town carries Hooch');
    const g = {
        state: STATE.IDLE, facing: 'right', turn: 1, map, _mapUrl: 'town-map.json',
        enemies: [hooch], containers: [], groundItems: [], examinables: map.examinableSpawns.map(e => ({ ...e })), _tileDiffs: [],
        playerX: hooch.x - 1, playerY: hooch.y, playerHp: 100, playerMaxHp: 100, playerMp: 50, playerMaxMp: 50,
        gold: 200, buffs: [], ringMods: {}, equipment: {},
        inventory: Array(INVENTORY_SIZE).fill(null),
        rng: new RNG(7), _MOVE_MS: 0,
        _heldDirKeys: [], _physicalHeld: new Set(), _queuedMoveDir: null, _pathQueue: [], _pathArrive: null,
        _animating: false, _animDuration: 1, _TURN_MS: 70, _turnTimer: null, _paused: false,
        _pendingTransition: null, _ratFormTurns: 0, _hasteCharges: 0, _slowCharges: 0,
        _robbed: {}, _hot: {}, _stepIndex: 0, logs: [],
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
        performance: { now: () => 0 }, setTimeout: () => 0,
        defaultVerb, isHostile, SAFE_SLOTS, PACK_PAGE, MAX_STACK, addToInv,
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
    g.hooch = hooch;
    return g;
}

const held = (g, id) => g.inventory.filter(s => s && s.itemDef.id === id).reduce((n, s) => n + s.count, 0);
const shelfIds = (g) => g._offerTheirsList().map(r => r.def.id);

// Open Hooch's shop, walk the cursor to the oil row, stage it, commit.
async function buyOil(g) {
    await g.press('KeyE');
    assert.equal(g.state, STATE.TRADE, "Hooch's shop is open");
    await g.press('ArrowRight');
    const at = shelfIds(g).indexOf('oil');
    assert.ok(at >= 0, 'oil is on his shelf');
    for (let i = 0; i < at; i++) await g.press('ArrowDown');
    await g.press('Space');
    assert.equal(g._offer.take.length, 1, 'the oil row stages');
    await g.press('Enter');
}

describe("Hooch's shelf", () => {
    test('the town map gives Hooch alcohol and oil', () => {
        assert.deepEqual(JSON.parse(townJson).enemies.find(s => s.id === 'townie-hooch').stock, ['alcohol', 'oil']);
    });

    test('oil is listed beside the alcohol, priced from the band table (56 vs 22 at his starting mood)', async () => {
        const g = makeGame();
        await g.press('KeyE');
        assert.equal(g.state, STATE.TRADE);
        const ids = shelfIds(g);
        assert.ok(ids.includes('alcohol') && ids.includes('oil'), `shelf: ${ids}`);
        assert.equal(band(g.hooch.disposition).mood, 'neutral');
        const oil = buyPrice(ITEMS.oil, g.hooch.disposition);
        const alcohol = buyPrice(ITEMS.alcohol, g.hooch.disposition);
        assert.equal(oil, 56);
        assert.ok(oil > 2 * alcohol, `oil ${oil} is more than twice alcohol ${alcohol}`);
    });

    test('the fuel card no longer promises a fuel that burns for hours', () => {
        const note = JSON.parse(townJson).examinables.find(e => e.id === 'fuel_note');
        assert.ok(note, 'the card is still there');
        assert.ok(!/hours|slow, dense|OIL/i.test(note.text), note.text);
        assert.match(note.text, /\[TEXT\]/);
    });
});

describe('buying the oil', () => {
    test('with real keys it costs exactly the listed price and lands in the bag', async () => {
        const g = makeGame();
        const price = buyPrice(ITEMS.oil, g.hooch.disposition);
        const gold = g.gold;
        await buyOil(g);
        assert.equal(held(g, 'oil'), 1);
        assert.equal(gold - g.gold, price);
    });

    test('and spreads at the bridge, setting the flag', async () => {
        const g = makeGame();
        await buyOil(g);
        await g.press('Escape');
        g.state = STATE.IDLE;
        assert.equal(held(g, 'oil'), 1);
        g.questEngine.forceComplete('fix_car');
        g.playerX = 15; g.playerY = 2; g.facing = 'right';
        g._targetAt = (x, y) => {
            const e = g.examinables.find(q => q.x === x && q.y === y);
            return e ? { x, y, npc: null, item: null, examinable: e, container: null } : null;
        };
        const slot = g.inventory.findIndex(s => s && s.itemDef.id === 'oil');
        const [use] = contextualUses(ITEMS.oil, g);
        assert.ok(use, 'the bought oil has its bridge use');
        use.apply(g, use.target, { slot });
        assert.equal(held(g, 'oil'), 0);
        assert.equal(g.questEngine.state.flags.oilSpread, true);
    });
});
