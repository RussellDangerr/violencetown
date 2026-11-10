// shop-talk.test.js -- PD1 (plans/pd1-shop-talk-button.md).
//
// A vendor with a dialogue gets a Talk button on the offer screen. T (or a tap on the button)
// closes the shop and opens their talk. The real Canyon holds Pike; the real Sewer holds Carrion,
// a vendor with nothing to say. Every press is a real keydown through the real listener.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
import { sellPrice, buyPrice, transferGold } from '../game/trade.js';
import { applyDispositionDelta, reactToTransaction } from '../game/give-action.js';
import { getDialogue } from '../game/dialogue.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');
const read = (f) => readFileSync(fileURLToPath(new URL(`../game/${f}`, import.meta.url)), 'utf8');

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
    ['_removeFromSlot', 'slot'], ['_addToInventory', 'itemDef'], ['_wheelOpenerUp', ''],
    ['_offerCanTalk', ''], ['_offerTalk', ''], ['_openDialogue', 'npc'], ['_closeDialogue', ''],
];

// `who` is 'pike' (Canyon) or 'carrion' (Sewer). You stand on the tile left of them, facing them.
function makeGame(who) {
    const document = new EventTarget();
    const window = new EventTarget();
    const file = who === 'pike' ? 'canyon-map.json' : 'sewer-map.json';
    const json = JSON.parse(read(file));
    const map = new GameMap(json, file);
    const enemies = json.enemies.filter(s => s.id === who)
        .map(s => spawnEnemy(resolveSpawn(s, defaultPicks()))).filter(Boolean);
    assert.equal(enemies.length, 1, `the real map carries ${who}`);
    const npc = enemies[0];
    const g = {
        state: STATE.IDLE, facing: 'right', turn: 1, map, _mapUrl: file,
        enemies, containers: [], groundItems: [], examinables: [], _tileDiffs: [],
        playerX: npc.x - 1, playerY: npc.y, playerHp: 100, playerMaxHp: 100, playerMp: 50, playerMaxMp: 50,
        gold: 100, buffs: [], ringMods: {}, equipment: {},
        inventory: Array(INVENTORY_SIZE).fill(null),
        rng: new RNG(7), _MOVE_MS: 0,
        _heldDirKeys: [], _physicalHeld: new Set(), _queuedMoveDir: null, _pathQueue: [], _pathArrive: null,
        _animating: false, _animDuration: 1, _TURN_MS: 70, _turnTimer: null, _paused: false,
        _pendingTransition: null, _ratFormTurns: 0, _hasteCharges: 0, _slowCharges: 0,
        _robbed: {}, _hot: {}, _stepIndex: 0,
        logs: [], barks: [],
        renderer: {},
        _log(m) { this.logs.push(m); },
        _render() {}, _onStepSettled() {}, _tryPickup() {}, _stopAutoRepeat() {}, _resumeHeldWalk() {},
        _flash() {}, _triggerScreenShake() {}, emitGameEvent() {}, _saveMoment() {},
        hasBuff(id) { return this.buffs.some(b => b.id === id); },
        _resolveItemDef: resolveItemDef,
        _advanceWorld() { this.turn++; },
    };
    const free = {
        STATE, DIRS, audio, document, window, carriesAll, getDialogue,
        requestAnimationFrame: (f) => queueMicrotask(() => f(Infinity)),
        performance: { now: () => 0 }, setTimeout: () => 0,
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
    g.npc = npc;
    return g;
}

describe('the shop screen has a Talk button (PD1)', () => {
    test("Pike's shop opens on E, and T lands in his talk, where the deal is", async () => {
        const g = makeGame('pike');
        await g.press('KeyE');
        assert.equal(g.state, STATE.TRADE, 'his shop is open');
        assert.equal(g._offerCanTalk(), true, 'the Talk button is offered');
        await g.press('KeyT');
        assert.equal(g.state, STATE.DIALOGUE, 'his talk is open');
        assert.equal(g._dialogueNpc, g.npc);
        assert.equal(g._offerNpc, null, 'the shop closed behind it');
        const deal = getDialogue('pike', g).choices.find(c => c.id === 'deal');
        assert.ok(deal, "the critters-for-the-rope deal is in Pike's talk");
    });

    test('a tap on the button does the same as the key', async () => {
        const g = makeGame('pike');
        await g.press('KeyE');
        const t = offerLayout(MODAL_RECT).talkButton;
        g._tapOffer({ x: t.x + t.w / 2, y: t.y + t.h / 2 });
        assert.equal(g.state, STATE.DIALOGUE);
    });

    test('a vendor with no dialogue shows no button, and T does nothing', async () => {
        const g = makeGame('carrion');
        await g.press('KeyE');
        assert.equal(g.state, STATE.TRADE, 'her shop is open');
        assert.equal(g._offerCanTalk(), false);
        await g.press('KeyT');
        assert.equal(g.state, STATE.TRADE, 'still in the shop');
        const t = offerLayout(MODAL_RECT).talkButton;
        g._tapOffer({ x: t.x + t.w / 2, y: t.y + t.h / 2 });
        assert.equal(g.state, STATE.TRADE, 'a tap where the button would be does nothing');
    });

    test('the renderer draws it from the shared layout rect, only when offered', () => {
        const r = read('renderer.js');
        assert.match(r, /_offerCanTalk/);
        assert.match(r, /L\.talkButton/);
    });
});
