// rat-robbery-stash-visible.test.js — RB2 (plans/rb2-stash-never-under-body.md).
// Harness copied from rat-robbery.test.js (RB1); see it for the lifted-method approach.
//
// Lose to one of the escape gauntlet's rats in the sewer and the rats rob you:
// your at-risk things go into a stash chest by the Were-Rat's floor, you wake at
// the sewer mouth, and you can walk over and take it all back.
//
// main.js touches `document` at import, so, as in canyon-branch.test.js, the real
// methods are lifted out of the source and bound onto a small game object. The
// sewer is the real map, and the gauntlet is the real one: startSewerEscape turns
// the fungus into rats, drops the portcullis and barricades the climb-out. The
// defeat is a real world turn: _advanceWorldOnce runs the real enemy turn, the rat
// swings through the real applyDamageToPlayer, and _die's timer runs the real
// _resolveDefeat, scenario, take and stash code. Then every step and every pick
// in the chest is a real key, through the real listeners _bindInput registers.
// Only the world beat during the walk back is a stand-in (it counts beats).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GameMap, carriesAll } from '../game/map.js';
import { spawnEnemy, resolveEnemyTurns } from '../game/enemies.js';
import { resolveSpawn, defaultPicks } from '../game/slots.js';
import { startSewerEscape } from '../game/sewer-setpiece.js';
import { isBoss, pickScenario, partitionInventory, matchTake, DEFEAT_SCENARIOS } from '../game/defeat-scenarios.js';
import { INVENTORY_SIZE, SAFE_SLOTS, PACK_PAGE, MAX_STACK } from '../game/data.js';
import { addToInventory as addToInv } from '../game/inventory.js';
import { resolveItemDef } from '../game/item-registry.js';
import { computeHit } from '../game/combat.js';
import { isHostile, isHunting } from '../game/ai.js';
import { findPath } from '../game/pathing.js';
import { RNG } from '../game/rng.js';
import { logCategory } from '../game/combat-log.js';
import { sumBuffStat } from '../game/buffs.js';
import { OFFER_ROWS_VISIBLE, OFFER_TRAY_SLOTS } from '../game/layout.js';
import { emptyOffer, commitBlocker, stage, unstage, settledGold, resolveOffer, sameEntry } from '../game/offer.js';
import { sellPrice, transferGold } from '../game/trade.js';
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
    // the world turn and the blow
    ['_advanceWorldOnce', ''], ['_routeWorldMessages', 'msgs'], ['_endCascadePhase', ''],
    ['applyDamageToPlayer', 'rawDamage, attacker = null'], ['_playerArmor', ''], ['_poitionMod', 'stat'],
    // the defeat
    ['_die', ''], ['_resolveDefeat', ''], ['_runBossRetry', 'boss'], ['_runScenario', 'pick, _ctx'], ['_resolveWakeCell', 'wakeAt'],
    ['_safeRespawnCell', ''], ['_applyTake', 'take'], ['_spawnStash', 'stashAt, itemIds, _gold'],
    ['_stashTile', 'near'], ['_deAggroAll', ''], ['_addToInventory', 'itemDef'], ['setTile', 'x, y, id'],
    // walking and bumping
    ['_bindInput', ''], ['_noteHeld', 'code'], ['_faceOf', 'dir'], ['_clearTurnTimer', ''],
    ['_beginMoveOrTurn', 'dir'], ['_intendedWalkDir', ''], ['_resolveWalkStep', 'dir'],
    ['_animateMove', 'fromX, fromY, toX, toY, callback, duration = this._animDuration'],
    ['_doMove', 'dir'], ['_canEnter', 'x, y'],
    // the chest
    ['_openContainer', 'container'], ['_containerStock', 'container'], ['_containerEntries', 'container'],
    ['_takeFromContainer', 'npc, at'], ['_openOffer', 'npc'], ['_closeOffer', ''],
    ['_offerTheirsList', ''], ['_offerYoursList', ''], ['_offerScrollBy', 'side, delta'],
    ['_offerActivate', 'zone, index'], ['_canStageGive', 'entry'], ['_resettle', 'npc'],
    ['_commitOffer', ''], ['_offerBlocker', ''],
    ['_removeFromSlot', 'slot'], ['_logOffer', 'npc, R, { given, taken, gold }'], ['_wheelOpenerUp', ''],
];

// A sewer in the middle of the escape gauntlet, bound to the real methods.
function makeGame({ seed = 7 } = {}) {
    const document = new EventTarget();
    const window = new EventTarget();
    const timers = [];
    const sewer = JSON.parse(sewerJson);
    const map = new GameMap(sewer, 'sewer-map.json');
    const enemies = sewer.enemies.map(s => spawnEnemy(resolveSpawn(s, defaultPicks()))).filter(Boolean);
    // The gauntlet starts once the converter is off the Were-Rat: it is down.
    const boss = enemies.find(e => isBoss(e));
    assert.ok(boss, 'the sewer has its boss');
    boss.entity.alive = false;

    const g = {
        state: STATE.IDLE, facing: 'down', turn: 1, map, _mapUrl: 'sewer-map.json',
        enemies, containers: (sewer.containers || []).map(c => ({ ...c, contents: (c.contents || []).slice() })),
        groundItems: [], examinables: [], _tileDiffs: [],
        playerX: 5, playerY: 6, playerHp: 100, playerMaxHp: 100, playerMp: 50, playerMaxMp: 50,
        gold: 25, buffs: [], ringMods: {}, equipment: { weapon: resolveItemDef('wooden_sword') },
        inventory: Array(INVENTORY_SIZE).fill(null),
        rng: new RNG(seed), _MOVE_MS: 0,
        _heldDirKeys: [], _physicalHeld: new Set(), _queuedMoveDir: null, _pathQueue: [], _pathArrive: null,
        _animating: false, _animDuration: 1, _TURN_MS: 70, _turnTimer: null, _paused: false,
        _pendingTransition: null, _ratFormTurns: 0, _hasteCharges: 0, _slowCharges: 0,
        _robbed: {}, _hot: {}, _stepIndex: 0,
        logs: [], beats: 0, timers,
        _log(m) { this.logs.push(m); },
        _render() {}, _onStepSettled() {}, _tryPickup() {}, _stopAutoRepeat() {}, _resumeHeldWalk() {},
        _flash() {}, _triggerScreenShake() {}, _spawnHitSplat() {}, _spawnEventWord() {},
        _spawnOverheadDialogue() {}, _ensureParticleLoop() {}, _spreadFireBlood() {},
        _handleEnemyDeath() {}, emitGameEvent() {}, autosave() {}, _skipTime() {},
        hasBuff(id) { return this.buffs.some(b => b.id === id); },
        _resolveItemDef: resolveItemDef,
        // Stand-in world beat for the walk back: it only counts. The defeat's turn is the real one.
        _advanceWorld() { this.beats++; },
    };
    const free = {
        STATE, DIRS, audio, document, window, carriesAll,
        requestAnimationFrame: (f) => queueMicrotask(() => f(Infinity)),
        performance: { now: () => 0 },
        setTimeout: (f) => { timers.push(f); return timers.length; },
        isBoss, isStoryBoss: isBoss, pickScenario, partitionInventory, matchTake, DEFEAT_SCENARIOS,
        INVENTORY_SIZE, SAFE_SLOTS, PACK_PAGE, MAX_STACK, addToInv, computeHit, resolveEnemyTurns,
        isHostile, isHunting, logCategory, sumBuffStat,
        OFFER_ROWS_VISIBLE, OFFER_TRAY_SLOTS, emptyOffer, commitBlocker, stage, unstage, settledGold,
        resolveOffer, sameEntry, sellPrice, transferGold, applyDispositionDelta, reactToTransaction,
    };
    for (const [n, p] of LIFTED) {
        g[n] = liveMethod(n, p, n === '_beginMoveOrTurn' ? { ...free, setTimeout: () => 0 } : free);
    }
    g._bindInput();
    g.press = async (code) => {
        document.dispatchEvent(new Key('keydown', code));
        document.dispatchEvent(new Key('keyup', code));
        await settle();
    };

    startSewerEscape(g);
    return g;
}

// The bag: pack items (all at risk), a quest item in the pack (safe wherever it sits).
const PACK = [['pipe', 1], ['rock', 3], ['bandage', 2], ['foil_hat', 1]];
function fillBag(g) {
    let i = SAFE_SLOTS;
    for (const [id, count] of PACK) {
        const itemDef = resolveItemDef(id);
        assert.ok(itemDef, `${id} is a real item`);
        g.inventory[i++] = { itemDef, count };
    }
    g.inventory[i++] = { itemDef: resolveItemDef('catalytic_converter'), count: 1 };
}
const counts = (g) => {
    const out = {};
    for (const s of g.inventory) if (s && s.itemDef) out[s.itemDef.id] = (out[s.itemDef.id] || 0) + s.count;
    return out;
};

const ratAt = (g, x, y) => g.enemies.find(e => e.entity.isAlive() && e.x === x && e.y === y && e.tag === 'sewer_rat');

// Lose to the rat born from the Ghost Fungus at (5,7), standing south of you at (5,6)
// and looking your way. No other rat is within reach, so it is the one that lands
// the blow. One real world turn: it sees you, closes and bites.
async function loseToARat(g, { roll = 0 } = {}) {
    const rat = ratAt(g, 5, 7);
    assert.ok(rat, 'the Ghost Fungus became a gauntlet rat at (5,7)');
    assert.equal(rat.type, 'Rat');
    rat._lastDx = 0; rat._lastDy = -1;           // facing north, at you
    g.playerHp = 1;
    g._advanceWorldOnce();                       // the real world turn
    assert.equal(g._lastDefeatedBy, rat, 'the rat landed the blow');
    assert.equal(g.state, STATE.DEAD, 'you went down');
    assert.equal(g.timers.length, 1, '_die waits a beat before the defeat resolves');
    g.rng.float = () => roll;                    // the scenario roll
    g.timers.splice(0).forEach(fn => fn());
    assert.equal(g.state, STATE.IDLE);
    return rat;
}

// Walk to (x,y) on the four arrow keys, by a shortest 4-way route over the live map.
// A tap toward a new facing only turns you, so a step that changes facing is two presses.
const ARROW = { '1,0': 'ArrowRight', '-1,0': 'ArrowLeft', '0,1': 'ArrowDown', '0,-1': 'ArrowUp' };
function route4(g, to) {
    const blocked = (x, y) => !g.map.isWalkable(x, y)
        || g.containers.some(c => c.x === x && c.y === y)
        || g.enemies.some(e => e.entity.isAlive() && e.x === x && e.y === y);
    const key = (x, y) => `${x},${y}`;
    const prev = new Map([[key(g.playerX, g.playerY), null]]);
    const q = [{ x: g.playerX, y: g.playerY }];
    while (q.length) {
        const c = q.shift();
        if (c.x === to.x && c.y === to.y) break;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const n = { x: c.x + dx, y: c.y + dy };
            if (prev.has(key(n.x, n.y)) || blocked(n.x, n.y)) continue;
            prev.set(key(n.x, n.y), c);
            q.push(n);
        }
    }
    if (!prev.has(key(to.x, to.y))) return null;
    const steps = [];
    for (let c = to, p; (p = prev.get(key(c.x, c.y))); c = p) steps.unshift(ARROW[`${c.x - p.x},${c.y - p.y}`]);
    return steps;
}
async function step(g, code) {
    const at = [g.playerX, g.playerY];
    await g.press(code);
    if (g.playerX === at[0] && g.playerY === at[1]) await g.press(code);   // the first press turned you
}

// Take every unit out of the open chest with the keys: over to its column, then
// Space down the rows a tray at a time and Enter, until the chest is empty.
async function takeAll(g, chest) {
    for (let guard = 0; chest.contents.length && guard < 10; guard++) {
        await g.press('ArrowRight');
        while (g._offerCursor.index > 0) await g.press('ArrowUp');
        const batch = Math.min(chest.contents.length, OFFER_TRAY_SLOTS - 1);
        for (let k = 0; k < batch; k++) {
            await g.press('Space');
            if (k < batch - 1) await g.press('ArrowDown');
        }
        await g.press('Enter');
    }
}

describe('the rats\' stash never hides under a body (RB2)', () => {
    test('the Were-Rat\'s body lies at (17,10), and the stash lands on a free tile beside it', async () => {
        const g = makeGame();
        fillBag(g);
        const boss = g.enemies.find(e => isBoss(e));
        assert.deepEqual([boss.x, boss.y], [17, 10], 'the body is on the stash spot');
        assert.equal(boss.entity.isAlive(), false);
        await loseToARat(g);
        const chest = g.containers.at(-1);
        assert.match(chest.id, /^stash_/);
        assert.notDeepEqual([chest.x, chest.y], [17, 10], 'not under the body');
        assert.equal(Math.max(Math.abs(chest.x - 17), Math.abs(chest.y - 10)), 1, 'on the nearest ring');
        assert.ok(g.map.isWalkable(chest.x, chest.y));
        for (const e of g.enemies) assert.ok(!(e.x === chest.x && e.y === chest.y), 'no body or live enemy on the chest tile');
    });

    test('with (17,10) clear of bodies the stash stays exactly there', async () => {
        const g = makeGame();
        fillBag(g);
        const boss = g.enemies.find(e => isBoss(e));
        boss.x = 3; boss.y = 3;                      // the body lies elsewhere
        await loseToARat(g);
        const chest = g.containers.at(-1);
        assert.deepEqual([chest.x, chest.y], [17, 10]);
    });

    test('walk to the visible chest with real keys and take everything back', async () => {
        const g = makeGame();
        fillBag(g);
        const had = counts(g);
        await loseToARat(g);
        const chest = g.containers.at(-1);
        for (const e of g.enemies) if (e.tag === 'sewer_rat') e.entity.alive = false;
        const beside = [{ x: chest.x - 1, y: chest.y }, { x: chest.x, y: chest.y + 1 }, { x: chest.x, y: chest.y - 1 }]
            .find(c => g.map.isWalkable(c.x, c.y) && route4(g, c));
        assert.ok(beside, 'a floor tile beside the chest is reachable');
        for (const k of route4(g, beside)) await step(g, k);
        assert.deepEqual([g.playerX, g.playerY], [beside.x, beside.y]);
        await step(g, ARROW[`${chest.x - beside.x},${chest.y - beside.y}`]);
        assert.equal(g.state, STATE.TRADE, 'the chest opens');
        await takeAll(g, chest);
        assert.deepEqual(counts(g), had);
    });
});
