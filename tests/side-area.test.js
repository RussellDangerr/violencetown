// side-area.test.js — TX5 (plans/tx5-downtown-side-area.md).
//
// The small off-spine area behind the fenced gate on Downtown's west edge: its map loads, its door
// leads back to Downtown onto ground you can stand on, the World Map has a box for it joined to
// DOWNTOWN, and the gate cannot be walked through or torn down by bumping. The walks use real
// arrow keys through the real movement methods lifted from main.js (as in
// armour-shop-notice.test.js). Nothing in play reaches the area until TX6.

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
import { WORLD_ZONES, zoneByName, overworldZone, connectorPairs } from '../game/world-map.js';

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


const SIDE = 'side-area-map.json';
const rawSide = () => JSON.parse(readMap(SIDE));

describe('the side area', () => {
    test('it loads, with a name, a filler, no enemies and no items', () => {
        const m = new GameMap(rawSide(), SIDE);
        assert.equal(m.zoneName, '[SIDE AREA]');
        assert.ok(m.width * m.height <= 16 * 12 + 16, 'it stays small');
        assert.ok(m.border && m.border.tile != null, 'it names a border filler');
        assert.equal(m.isWalkable(m.spawn.x, m.spawn.y), true, 'the spawn is ground');
        assert.deepEqual(rawSide().enemies, []);
        assert.deepEqual(rawSide().items, []);
        assert.equal(rawSide().examinables.length, 1);
    });

    test('its door leads to Downtown onto ground you can stand on, not onto a door', () => {
        const side = new GameMap(rawSide(), SIDE);
        const down = new GameMap(JSON.parse(readMap('downtown-map.json')), 'downtown-map.json');
        const door = side.transitions.find(t => t.toMap === 'downtown-map.json');
        assert.ok(door, 'the area has a door to Downtown');
        assert.ok(down.isWalkable(door.toX, door.toY), 'the landing is walkable');
        assert.equal(down.getTransition(door.toX, door.toY), null, 'the landing is not a door');
    });

    test('the door is reachable from the spawn on foot', () => {
        const side = new GameMap(rawSide(), SIDE);
        const door = side.transitions[0];
        const seen = new Set([`${side.spawn.x},${side.spawn.y}`]);
        const q = [[side.spawn.x, side.spawn.y]];
        while (q.length) {
            const [x, y] = q.shift();
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const k = `${x + dx},${y + dy}`;
                if (seen.has(k) || !side.isInBounds(x + dx, y + dy) || !side.isWalkable(x + dx, y + dy)) continue;
                seen.add(k); q.push([x + dx, y + dy]);
            }
        }
        assert.ok(seen.has(`${door.x},${door.y}`));
    });

    test('walking left through its door with the arrow keys lands you in Downtown', async () => {
        const g = makeGame({ file: SIDE, start: [1, 6] });
        assert.equal(g._mapUrl, SIDE);
        await step(g, 'ArrowLeft');
        assert.equal(g._mapUrl, 'downtown-map.json');
        assert.ok(g.map.isWalkable(g.playerX, g.playerY), 'you stand on ground');
        assert.equal(g.map.zoneName.toUpperCase(), 'DOWNTOWN');
    });
});

describe('the World Map', () => {
    test('the area has a box, joined to DOWNTOWN both ways, in the free cell', () => {
        const z = zoneByName('[SIDE AREA]');
        assert.ok(z, 'a box for the side area');
        assert.deepEqual([z.col, z.row], [1, 0]);
        assert.ok(z.connects.includes('DOWNTOWN'));
        assert.ok(zoneByName('DOWNTOWN').connects.includes('[SIDE AREA]'));
        assert.ok(connectorPairs().some(p => p.includes('[SIDE AREA]') && p.includes('DOWNTOWN')));
        const cells = WORLD_ZONES.map(w => `${w.col},${w.row}`);
        assert.equal(new Set(cells).size, cells.length, 'no two boxes share a cell');
        assert.equal(overworldZone('[SIDE AREA]'), '[SIDE AREA]');
    });
});

describe("Downtown's fenced gate", () => {
    const down = () => new GameMap(JSON.parse(readMap('downtown-map.json')), 'downtown-map.json');

    test('the west-edge gate is a fence (17), never a barricade (23), with the door on it', () => {
        const m = down();
        const door = JSON.parse(readMap('downtown-map.json')).transitions.find(t => t.toMap === SIDE);
        assert.ok(door, 'Downtown has the door, in its file');
        assert.equal(m.getTile(door.x, door.y), 17);
        assert.equal(door.x, 0, 'on the west edge');
        assert.equal(m.isWalkable(door.x, door.y), false);
        // A door on ground nobody can stand on is dropped when the map loads, so no tile in the
        // loaded Downtown leads to the area until TX6 swaps the fence for road.
        assert.equal(m.transitions.some(t => t.toMap === SIDE), false);
        assert.ok(!m.tiles.includes(23), 'no barricade anywhere in Downtown');
    });

    test('bumping the fence with the arrow keys does nothing: it stays, and you stay', async () => {
        const g = makeGame({ file: 'downtown-map.json', start: [1, 9] });
        for (let i = 0; i < 6; i++) await g.press('ArrowLeft');
        assert.equal(g._mapUrl, 'downtown-map.json');
        assert.deepEqual([g.playerX, g.playerY], [1, 9]);
        assert.equal(g.map.getTile(0, 9), 17);
        assert.equal(g.map.isWalkable(0, 9), false);
    });

    test('the gate is clear of the taxi block and the driver', () => {
        const j = JSON.parse(readMap('downtown-map.json'));
        for (const e of j.enemies) assert.ok(!(e.x <= 1 && e.y === 9), `${e.id} stands at the gate`);
        assert.ok(j.tiles[9 * j.width + 1] !== 19, 'the landing in front of the gate is not the taxi');
    });
});
