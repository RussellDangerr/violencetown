// armour-shop-notice.test.js — AA1 (plans/aa1-armour-shop-notice.md).
//
// Walking into a zone whose shop sells a piece of armour you do not own puts one line in the log
// (placeholder words, "[TEXT]"). Owning every piece it sells, worn or in the bag, silences it.
//
// As in armour-by-zone.test.js, the real methods are lifted out of main.js and bound onto a small
// game object. The player walks through real doors with the arrow keys, the real
// _advanceWorldOnce logs the zone and calls the real notice, and the shop is bought from with
// real keys. Only the map fetch is stood in for: _loadMap reads the real JSON from disk.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GameMap, carriesAll } from '../game/map.js';
import { spawnEnemy, resolveEnemyTurns } from '../game/enemies.js';
import { worldBeatPlan } from '../game/buffs.js';
import { resolveSpawn, defaultPicks } from '../game/slots.js';
import { INVENTORY_SIZE, SAFE_SLOTS, PACK_PAGE, MAX_STACK } from '../game/data.js';
import { addToInventory as addToInv, zoneOf, moveToZone, pageCount, slotOnPage, pageOfSlot } from '../game/inventory.js';
import { resolveItemDef } from '../game/item-registry.js';
import { ITEMS, tickTempEquips } from '../game/items.js';
import { isHostile } from '../game/ai.js';
import { defaultVerb } from '../game/wheel-model.js';
import { RNG } from '../game/rng.js';
import {
    MODAL_RECT, HIT_SLOP, offerLayout, offerRowIndexAt, offerTraySlotAt, OFFER_ROWS_VISIBLE, OFFER_TRAY_SLOTS,
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
    ['_offerActivate', 'zone, index'], ['_canStageGive', 'entry'], ['_resettle', 'npc'],
    ['_goldTray', ''], ['_toggleOfferGold', 'npc'], ['_buybackList', 'npc'], ['_buybackLive', 'npc'],
    ['_buybackRecord', 'npc, itemId, kind, price'], ['_endBuybacks', ''],
    ['_commitOffer', ''], ['_offerBlocker', ''], ['_logOffer', 'npc, R, { given, taken, gold }'],
    ['_removeFromSlot', 'slot'], ['_addToInventory', 'itemDef'], ['_wheelOpenerUp', ''],
    // the zone change and the notice under test
    ['_advanceWorld', ''], ['_advanceWorldOnce', ''], ['_armourShopNotice', ''],
];

const NOTICE = '[TEXT]';

// Starts in `file` at `start`. Only vendors are placed (the beat is the shop's alone); a door
// walked through loads the real destination JSON the way _loadMap would.
function makeGame({ file, start }) {
    const document = new EventTarget();
    const window = new EventTarget();
    const load = (f) => {
        const json = JSON.parse(readMap(f));
        const vendors = (json.enemies || []).filter(s => s.vendor)
            .map(s => spawnEnemy(resolveSpawn(s, defaultPicks()))).filter(Boolean);
        return { map: new GameMap(json, f), vendors };
    };
    const first = load(file);
    const g = {
        state: STATE.IDLE, facing: 'right', turn: 1, map: first.map, _mapUrl: file,
        enemies: first.vendors, containers: [], groundItems: [], examinables: [], _tileDiffs: [],
        playerX: start[0], playerY: start[1], playerHp: 100, playerMaxHp: 100, playerMp: 50, playerMaxMp: 50,
        gold: 100, buffs: [], ringMods: {}, equipment: {},
        inventory: Array(INVENTORY_SIZE).fill(null),
        rng: new RNG(7), _MOVE_MS: 0,
        _heldDirKeys: [], _physicalHeld: new Set(), _queuedMoveDir: null, _pathQueue: [], _pathArrive: null,
        _animating: false, _animDuration: 1, _TURN_MS: 70, _turnTimer: null, _paused: false,
        tempEquips: [], _hasteCharges: 0, _slowCharges: 0, _pendingTransition: null, _robbed: {}, _hot: {}, _stepIndex: 0, _bagPage: 0,
        logs: [],
        _log(m) { this.logs.push(m); },
        _render() {}, _onStepSettled() {}, _tryPickup() {}, _stopAutoRepeat() {}, _resumeHeldWalk() {},
        _flash() {}, _triggerScreenShake() {}, emitGameEvent() {}, _saveMoment() {}, autosave() {},
        _captureFollowers() { return []; }, _zoneChange() {},
        hasBuff() { return false; },
        _resolveItemDef: resolveItemDef,
        async _loadMap(url, x, y) {
            const next = load(url);
            this.map = next.map; this._mapUrl = url; this.enemies = next.vendors;
            this.playerX = x ?? next.map.spawn.x; this.playerY = y ?? next.map.spawn.y;
        },
        // The world beat's neighbours, none of which matter to a walk between two shops.
        _routeWorldMessages() {}, _ensureParticleLoop() {}, _joinFight() {}, _worldBeat() {},
        _inCombat() { return false; }, _tickJammedDoor() {}, _cascadeMark() {}, _tickBuffs() {},
        _endCascadePhase() {}, _checkRingUnlocks() {}, _die() {},
    };
    const free = {
        STATE, DIRS, audio, document, window, carriesAll,
        requestAnimationFrame: (f) => queueMicrotask(() => f(Infinity)),
        performance: { now: () => 0 }, setTimeout: () => 0,
        defaultVerb, isHostile,
        SAFE_SLOTS, PACK_PAGE, MAX_STACK, INVENTORY_SIZE, addToInv, zoneOf, moveToZone, pageCount, slotOnPage, pageOfSlot,
        MODAL_RECT, HIT_SLOP, offerLayout, offerRowIndexAt, offerTraySlotAt, OFFER_ROWS_VISIBLE, OFFER_TRAY_SLOTS,
        emptyOffer, commitBlocker, stage, unstage, settledGold, resolveOffer, sameEntry,
        sellPrice, buyPrice, transferGold, applyDispositionDelta, reactToTransaction,
        worldBeatPlan, resolveEnemyTurns, tickTempEquips, MP_REGEN: 2,
    };
    for (const [n, p] of LIFTED) g[n] = liveMethod(n, p, free);
    g._bindInput();
    g.press = async (code) => {
        document.dispatchEvent(new Key('keydown', code));
        document.dispatchEvent(new Key('keyup', code));
        await settle();
    };
    return g;
}

const notices = (g) => g.logs.filter(l => l === NOTICE).length;
const bagCount = (g, id) => g.inventory.filter(s => s && s.itemDef.id === id).reduce((n, s) => n + s.count, 0);

// One walking step: a tap toward a new facing only turns you, so one more press moves you.
async function step(g, code) {
    const at = [g.playerX, g.playerY, g._mapUrl];
    await g.press(code);
    if (g.playerX === at[0] && g.playerY === at[1] && g._mapUrl === at[2]) await g.press(code);
}
async function walk(g, code, n) { for (let i = 0; i < n; i++) await step(g, code); }

async function buy(g, id) {
    await g.press('KeyE');
    assert.equal(g.state, STATE.TRADE, 'their shop is open');
    await g.press('ArrowRight');
    const at = g._offerTheirsList().map(r => r.def.id).indexOf(id);
    assert.ok(at >= 0, `${id} is on their shelf`);
    while (g._offerCursor.index < at) await g.press('ArrowDown');
    await g.press('Space');
    await g.press('Enter');
    if (g.state === STATE.TRADE) await g.press('KeyE');
    assert.equal(g.state, STATE.IDLE, 'the shop closed');
}

describe('Downtown (the Corner Merchant sells Latex Gloves)', () => {
    test('walk in from the diner: the line shows; buy the Gloves; walk in again: it stops', async () => {
        const g = makeGame({ file: 'diner-map.json', start: [6, 9] });
        await step(g, 'ArrowDown');                       // out through the diner door
        assert.equal(g._mapUrl, 'downtown-map.json', 'the real door took you to Downtown');
        assert.equal(notices(g), 1, 'one line on walking in');
        assert.equal(g.logs.at(-1), NOTICE, 'right after [Entered DOWNTOWN]');
        assert.ok(g.logs.some(l => l === '[Entered DOWNTOWN]'));

        // Down the street to the Corner Merchant (5,8): stand at (5,7) facing him.
        await walk(g, 'ArrowDown', 3);
        assert.deepEqual([g.playerX, g.playerY], [5, 7]);
        assert.equal(g.facing, 'down');
        await buy(g, 'latex_gloves');
        assert.equal(bagCount(g, 'latex_gloves'), 1, 'the Gloves are in your bag, not yet worn');

        // Back up and into the diner, then out again: a second visit.
        await walk(g, 'ArrowUp', 4);                      // (5,3) is the diner door
        assert.equal(g._mapUrl, 'diner-map.json');
        await step(g, 'ArrowDown');
        assert.equal(g._mapUrl, 'downtown-map.json');
        assert.equal(notices(g), 1, 'owning the only piece it sells, the line did not come back');
    });

    test('once per visit, not once ever: leave without buying and the next visit says it again', async () => {
        const g = makeGame({ file: 'diner-map.json', start: [6, 9] });
        await step(g, 'ArrowDown');
        assert.equal(notices(g), 1);
        await step(g, 'ArrowUp');                         // you arrive at (5,4), under the diner door
        assert.equal(g._mapUrl, 'diner-map.json');
        assert.equal(notices(g), 1, 'the diner itself sells no armour, so no line');
        await step(g, 'ArrowDown');
        assert.equal(notices(g), 2);
    });

    test('Gloves already worn count as owned', async () => {
        const g = makeGame({ file: 'diner-map.json', start: [6, 9] });
        g.equipment.sides = ITEMS.latex_gloves;
        await step(g, 'ArrowDown');
        assert.equal(g._mapUrl, 'downtown-map.json');
        assert.equal(notices(g), 0);
    });
});

describe('the Factory (Puck sells the Cardboard Cuirass)', () => {
    test('walk in from town: the line shows; buy the Cuirass; walk in again: it stops', async () => {
        const g = makeGame({ file: 'town-map.json', start: [1, 10] });
        await step(g, 'ArrowLeft');                        // town's west edge is the way to the Factory
        assert.equal(g._mapUrl, 'factory-map.json');
        assert.equal(notices(g), 1);

        const puck = g.enemies.find(e => e.id === 'puck');
        while (g.playerX > puck.x + 1) await step(g, 'ArrowLeft');
        assert.deepEqual([g.playerX, g.playerY], [puck.x + 1, puck.y]);
        await buy(g, 'cardboard_cuirass');
        assert.equal(bagCount(g, 'cardboard_cuirass'), 1);

        // Out to town and back in through the same door.
        await g._loadMap('town-map.json', 1, 10);
        await step(g, 'ArrowLeft');
        assert.equal(g._mapUrl, 'factory-map.json');
        assert.equal(notices(g), 1, 'the Cuirass is in your bag: no second line');
    });
});

describe('the rule, on other zones', () => {
    test('a zone whose shops sell no armour never says it', async () => {
        const g = makeGame({ file: 'downtown-map.json', start: [12, 14] });
        await step(g, 'ArrowDown');                        // south, back over the bridge to old town
        assert.equal(g._mapUrl, 'town-map.json');
        assert.equal(notices(g), 0);
    });

    test('a vendor you have struck (no stock) says nothing', () => {
        const g = makeGame({ file: 'downtown-map.json', start: [12, 8] });
        for (const e of g.enemies) { e.vendor = false; e.stock = null; }
        assert.equal(g._armourShopNotice(), false);
        assert.equal(notices(g), 0);
    });
});
