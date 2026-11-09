// finale-phase2.test.js — FIN3 (plans/fin3-bite-phase-two.md).
//
// After Sun Man's third turn the Financier bites him, once. He throws his cloak over his face,
// goes to a corner and takes no turns while he changes. You finish off the weakened Financier
// alone and he rises as Monstrous Sun Man; phase 2 is you against him, and he can only be hurt
// while he screams. Winning leaves a saved flag and a one-shot event for the credits.
//
// The harness is finale-phase1.test.js's (main.js touches `document` at import, so the real
// methods are lifted out of the source and bound onto a small game object). The map is the real
// vault. Every step, talk and blow is a real key through the real listeners; the enemy turns are
// the real resolveEnemyTurns. Stand-ins are only drawing, sound and the save.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GameMap, carriesAll } from '../game/map.js';
import { Enemy, spawnEnemy, resolveEnemyTurns } from '../game/enemies.js';
import { resolveSpawn, defaultPicks, ENTRIES, FINALE_PHASE1 } from '../game/slots.js';
import { isBoss, bossInFight, pickScenario, partitionInventory, matchTake, DEFEAT_SCENARIOS } from '../game/defeat-scenarios.js';
import { INVENTORY_SIZE, SAFE_SLOTS } from '../game/data.js';
import { resolveItemDef } from '../game/item-registry.js';
import { attack, computeHit, elementalMult, weaponHitKind, isBackstab, WEAKNESS_MULT, weaknessKinds, critOf, knockoutDamage } from '../game/combat.js';
import { isHostile, isHunting, allyAids } from '../game/ai.js';
import { fighters } from '../game/fight-area.js';
import { perceives, VERDICT, emitNoise, NOISE, struck } from '../game/perception.js';
import { getGreedyStep, stepEntity, findPath } from '../game/pathing.js';
import { RNG } from '../game/rng.js';
import { logCategory } from '../game/combat-log.js';
import { tickBuffList, sumBuffStat, weakenedBuff, worldBeatPlan, BUFF_DEFS } from '../game/buffs.js';
import { defaultVerb, isCombatActive } from '../game/wheel-model.js';
import { HEAVY_HIT_DAMAGE } from '../game/hit-splat.js';
import { RINGS } from '../game/ring-data.js';
import { getDialogue } from '../game/dialogue.js';
import { applyDispositionDelta } from '../game/give-action.js';
import { manhattan, chebyshev } from '../game/utils.js';
import { transferGold } from '../game/trade.js';
import { dropLoadout } from '../game/drops.js';
import { ENEMY_SPRITES } from '../game/sprites.js';
import { validateContent } from '../game/content-validate.js';
import { WEAPONS } from '../game/weapons.js';
import { biteSunMan, riseSunMan, beastFell, resetBeast, finaleTick, blocksCowerHit, restoreFinale, isCowering } from '../game/finale-setpiece.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');
const vaultJson = readFileSync(fileURLToPath(new URL('../game/vault-map.json', import.meta.url)), 'utf8');
const bankJson = readFileSync(fileURLToPath(new URL('../game/bank-map.json', import.meta.url)), 'utf8');

function liveMethod(name, params, freeVars) {
    const signature = `\n    ${name}(${params}) {`;
    const at = mainSrc.indexOf(signature, mainSrc.indexOf('class Game {'));
    assert.ok(at > 0, `${name}(${params}) not found in main.js`);
    const closeAt = mainSrc.indexOf('\n    }', at + 1);
    const body = mainSrc.slice(at + 5 + name.length, closeAt + '\n    }'.length);
    const names = Object.keys(freeVars);
    try {
        return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
    } catch (e) {
        throw new Error(`${name}: ${e.message}`);
    }
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
const MP_REGEN = 2;
const DIALOGUE_HOSTILE_AT = -40;
const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

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
    ['_advanceWorld', ''], ['_advanceWorldOnce', ''], ['_routeWorldMessages', 'msgs'],
    ['applyDamageToPlayer', 'rawDamage, attacker = null'], ['_playerArmor', ''], ['_poitionMod', 'stat'],
    ['_tickBuffs', ''], ['emitGameEvent', 'type, payload = {}'], ['_earshot', ''],
    // the fight, the ally, the summon
    ['combatAttack', 'enemyObj, damage, opts = {}'], ['_onEntityHarmed', 'target, { kind = \'attack\' } = {}'],
    ['_handleEnemyDeath', 'enemyObj'], ['_allyTakeTurn', 'ally'], ['_isHostileToPlayer', 'e'],
    ['_spawnSummon', 'type, turns, opts = {}'], ['_tileFreeForShove', 'x, y, exclude = null'],
    ['_revertAlly', 'enemyObj'],
    // the finale, phase 1
    ['_isFinancier', 'e'], ['_beginFinalFight', 'financier'], ['_finaleOnHarmed', 'target'],
    ['_finaleSummonLeft', 'e'], ['_finaleOnDeath', 'e'], ['_finaleReset', 'boss'],
    ['_finaleTick', ''], ['_finaleBlocksHit', 'target'], ['_finaleCowering', 'e'],
    // the defeat, and the boss retry
    ['_die', ''], ['_resolveDefeat', ''], ['_bossInFight', ''], ['_runBossRetry', 'boss'],
    ['_safeRespawnCell', ''], ['_deAggroAll', ''],
    // talking
    ['_openDialogue', 'npc'], ['_closeDialogue', ''], ['_dialogueChoices', ''], ['_pickDialogueChoice', 'choice'],
    // walking, bumping and the E key
    ['_bindInput', ''], ['_noteHeld', 'code'], ['_faceOf', 'dir'], ['_clearTurnTimer', ''],
    ['_beginMoveOrTurn', 'dir'], ['_intendedWalkDir', ''], ['_resolveWalkStep', 'dir'],
    ['_animateMove', 'fromX, fromY, toX, toY, callback, duration = this._animDuration'],
    ['_doMove', 'dir'], ['_canEnter', 'x, y'], ['_digitToSlot', 'code'],
    ['_targetAt', 'x, y'], ['_actOnTarget', 'verb, t'], ['_fireResolver', 'verb, t'],
];

// The vault, the Financier at his post, and you at the door you came in by. `weapon` and
// `armor` are what you fight with; the defaults are the weakest the game has.
function makeGame({ seed = 7, weapon = 'wooden_sword', armor = 0, hp = 100 } = {}) {
    const document = new EventTarget();
    const window = new EventTarget();
    const timers = [];
    const vault = JSON.parse(vaultJson);
    const map = new GameMap(vault, 'vault-map.json');
    const enemies = vault.enemies.map(s => spawnEnemy(resolveSpawn(s, defaultPicks()))).filter(Boolean);

    const g = {
        state: STATE.IDLE, facing: 'up', turn: 1, map, _mapUrl: 'vault-map.json',
        enemies, containers: [], groundItems: [], examinables: [], _tileDiffs: [],
        playerX: vault.spawn.x, playerY: vault.spawn.y, playerHp: hp, playerMaxHp: 100, playerMp: 50, playerMaxMp: 50,
        gold: 0, buffs: [], ringMods: {}, ringSlots: {}, slots: defaultPicks(),
        equipment: { weapon: WEAPONS[weapon] ?? resolveItemDef(weapon), top: null, bottom: null, front: null, back: null, sides: null },
        inventory: Array(INVENTORY_SIZE).fill(null),
        rng: new RNG(seed), _MOVE_MS: 0, _muggedIds: new Set(), _robbed: {}, _hot: {},
        _heldDirKeys: [], _physicalHeld: new Set(), _queuedMoveDir: null, _pathQueue: [], _pathArrive: null,
        _animating: false, _animDuration: 1, _TURN_MS: 70, _turnTimer: null, _paused: false,
        _pendingTransition: null, _ratFormTurns: 0, _hasteCharges: 0, _slowCharges: 0, _stepIndex: 0,
        _summonSeq: 0, _dayClock: 0, _nightLevel: 0,
        questEngine: {
            state: { stageIndex: 0, completed: [], flags: {} },
            getFlag(k) { return this.state.flags[k]; },
            emit(type, payload) { g.events.push({ type, payload }); },
        },
        logs: [], events: [], blows: [], timers, beats: 0, splats: [], armorPieces: armor,
        _log(m) { this.logs.push(m); },
        _render() {}, _onStepSettled() {}, _tryPickup() {}, _stopAutoRepeat() {}, _resumeHeldWalk() {},
        _flash() {}, _triggerScreenShake() {}, _spawnEventWord() {}, _spawnOverheadDialogue() {},
        _ensureParticleLoop() {}, _spreadFireBlood() {}, _endCascadePhase() {}, _cascadeMark() {},
        _joinFight() {}, _worldBeat() {}, _tickJammedDoor() {}, _checkRingUnlocks() {},
        autosave() {}, _skipTime() {}, _saveMoment() {}, _rememberKill() {}, _takeKillLoot: null,
        _recordDrop() {}, _ensureParticleLoop2() {}, _resolveItemDef: resolveItemDef,
        hasBuff(id) { return this.buffs.some(b => b.id === id); },
        hasItem() { return false; },
        _spawnHitSplat(x, y, text, type, opts = {}) { this.splats.push({ x, y, text, type, ally: !!opts.omni }); },
        _rockClatter() {}, _clearRival: () => [], renderer: {},
    };
    g._takeKillLoot = (drops) => { g.loot = drops; return []; };
    const free = {
        STATE, DIRS, audio, document, window, carriesAll, ENTRIES, FINALE_PHASE1, weakenedBuff,
        biteSunMan, riseSunMan, beastFell, resetBeast, finaleTick, blocksCowerHit, restoreFinale, isCowering,
        requestAnimationFrame: (f) => queueMicrotask(() => f(Infinity)),
        performance: { now: () => 0 },
        setTimeout: (f) => { timers.push(f); return timers.length; },
        isBoss, bossInFight, pickScenario, partitionInventory, matchTake, DEFEAT_SCENARIOS, SAFE_SLOTS,
        computeHit, elementalMult, weaponHitKind, isBackstab, WEAKNESS_MULT, weaknessKinds, critOf, knockoutDamage, resolveEnemyTurns,
        // every blow the game lands, by who struck it
        attack: (a, t, d) => { const r = attack(a, t, d); if (r) g.blows.push({ by: a.name, dealt: r.dealt, raw: r.rawDamage }); return r; },
        isHostile, isHunting, allyAids, fighters, isCombatActive, perceives, VERDICT,
        getGreedyStep, stepEntity, findPath, worldBeatPlan, logCategory, sumBuffStat, tickBuffList, defaultVerb, getDialogue,
        applyDispositionDelta, manhattan, transferGold, dropLoadout, Enemy, spawnEnemy, resolveSpawn,
        MP_REGEN, DIALOGUE_HOSTILE_AT, HEAVY_HIT_DAMAGE, NOISE, emitNoise, struck, cheb, RINGS,
        unnestBrackets: (s) => s, onSewerEnemyKilled: () => {}, requiredDropFor: () => null, dropLineFor: () => null,
        tickTempEquips: () => [], ITEMS: {}, bossDropOnce: () => true, formatDamageNumber: (r) => `${r.dealt}`,
        TRICKS: {}, SPELLS: {},
    };
    for (const [n, p] of LIFTED) {
        g[n] = liveMethod(n, p, n === '_beginMoveOrTurn' ? { ...free, setTimeout: () => 0 } : free);
    }
    g._inCombat = () => isCombatActive(g);     // a one-line method in main.js
    g._playerArmor = () => g.armorPieces;     // the armour you wear, as one flat number
    g._bossFirstFall = () => true;
    g._bindInput();
    g.press = async (code) => {
        document.dispatchEvent(new Key('keydown', code));
        document.dispatchEvent(new Key('keyup', code));
        await settle();
    };
    return g;
}

const financierOf = (g) => g.enemies.find(e => e.tag === FINALE_PHASE1.financierTag);
const sunManOf = (g) => g.enemies.find(e => e.tag === FINALE_PHASE1.sunManTag);


const ARROW = { '1,0': 'ArrowRight', '-1,0': 'ArrowLeft', '0,1': 'ArrowDown', '0,-1': 'ArrowUp' };
const DIR_OF = { ArrowRight: 'right', ArrowLeft: 'left', ArrowDown: 'down', ArrowUp: 'up' };

function route4(g, to, ignore = null) {
    const blocked = (x, y) => !g.map.isWalkable(x, y)
        || g.enemies.some(e => e !== ignore && e.entity.isAlive() && e.x === x && e.y === y);
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

// One arrow press; a tap toward a new facing only turns you, so press again if you did not move.
// A bump into the enemy is a blow: the world turn it costs is the proof it landed.
async function step(g, code) {
    const at = [g.playerX, g.playerY, g.turn];
    await g.press(code);
    if (g.playerX === at[0] && g.playerY === at[1] && g.turn === at[2]) await g.press(code);
}

// Walk up to the Financier and talk to him: up the room to the tile below him, then E.
async function walkUpAndTalk(g) {
    const fin = financierOf(g);
    const keys = route4(g, { x: fin.x, y: fin.y + 1 });
    assert.ok(keys && keys.length === 2, `two steps up the room (${keys})`);
    for (const k of keys) await step(g, k);
    assert.deepEqual([g.playerX, g.playerY], [fin.x, fin.y + 1]);
    assert.equal(g.facing, 'up');
    await g.press('KeyE');
}

// Fight on with the arrow keys until the Financier or you are down. Each press is a turn:
// a blow when he is beside you, a step to get beside him otherwise.
async function fightOn(g, { limit = 80 } = {}) {
    const turns = [];
    for (let i = 0; i < limit; i++) {
        const fin = financierOf(g);
        if (!fin || !fin.entity.isAlive() || g.state === STATE.DEAD || g.playerHp <= 0) break;
        const dx = fin.x - g.playerX, dy = fin.y - g.playerY;
        let code;
        if (Math.abs(dx) + Math.abs(dy) === 1) code = ARROW[`${dx},${dy}`];
        else {
            const keys = route4(g, { x: fin.x, y: fin.y }, fin) ;
            // walk to a tile beside him: the first step of the shortest route to him
            code = keys && keys.length ? keys[0] : 'ArrowUp';
        }
        const before = g.turn;
        await step(g, code);
        turns.push({ turn: g.turn, sun: !!sunManOf(g), fin: fin.entity.hp, me: g.playerHp });
        if (process.env.FIN_TRACE) console.log(JSON.stringify(turns.at(-1)), g.logs.slice(-3).join(' | '));
        if (g.turn === before) await g.press(code);
    }
    return turns;
}


import { FINALE_PHASE2, isBeast, isExposedOn, cornerFor } from '../game/finale-setpiece.js';

const beastOf = (g) => g.enemies.find(e => e.tag === FINALE_PHASE2.beastTag);
const eventsOf = (g, type) => g.events.filter(e => e.type === type);
const isCorner = (map, x, y) => {
    const wall = (a, b) => !map.isInBounds(a, b) || !map.isWalkable(a, b);
    return map.isWalkable(x, y) && (wall(x - 1, y) || wall(x + 1, y)) && (wall(x, y - 1) || wall(x, y + 1));
};

// Start the fight the way a player does: walk up, talk, take the one choice, leave the talk.
async function startFight(g) {
    await walkUpAndTalk(g);
    await g.press('Enter');
    await g.press('KeyE');
}

// One key at a time toward whoever is left to fight (the Financier, then the beast): a blow when
// he is beside you, a step toward him otherwise. Every press is a real key. Returns after
// `until(g)` is true or the limit is reached. `samples` records each world turn.
async function fightOnward(g, { limit = 200, until = () => false, samples = null } = {}) {
    for (let i = 0; i < limit; i++) {
        if (until(g) || g.state === STATE.DEAD || g.playerHp <= 0) break;
        const foe = [financierOf(g), beastOf(g)].find(e => e && e.entity.isAlive());
        if (!foe) break;
        const dx = foe.x - g.playerX, dy = foe.y - g.playerY;
        let code;
        if (Math.abs(dx) + Math.abs(dy) === 1) code = ARROW[`${dx},${dy}`];
        else {
            const keys = route4(g, { x: foe.x, y: foe.y }, foe);
            code = keys && keys.length ? keys[0] : 'ArrowUp';
        }
        const before = {
            turn: g.turn, hp: g.playerHp, foeHp: foe.entity.hp, foe,
            exposed: foe.hasBuff('weakened'), adjacent: Math.abs(dx) + Math.abs(dy) === 1,
            blows: g.blows.length,
        };
        await g.press(code);
        if (process.env.FIN_TRACE) console.log(JSON.stringify({ t: g.turn, me: g.playerHp, foe: foe.entity.name, hp: foe.entity.hp, open: foe.hasBuff('weakened'), at: [foe.x, foe.y], me_at: [g.playerX, g.playerY] }), g.blows.slice(-2).map(b => `${b.by}:${b.dealt}`).join(' '));
        if (samples && g.turn !== before.turn) {
            samples.push({
                ...before, foeHpAfter: foe.entity.hp, tookTurns: g.turn - before.turn,
                foeBlows: before.hp - g.playerHp > 0 ? 1 : 0,   // the foe's swing is the only thing that lowers your HP here
            });
        }
    }
}

const phase2Won = (g) => g.questEngine.state.flags.finalePhase2 === 'won';

describe('the data', () => {
    test('Monstrous Sun Man is the stand-in boss block copied from the Financier, with its kit emptied', () => {
        const g = makeGame();
        g.enemies = [];
        restoreFinale({ ...g, enemies: g.enemies }, 'not-the-vault');
        const spawnEntry = ENTRIES.financier;
        const beast = (() => {
            g.questEngine.state.flags.finalePhase1 = 'won';
            restoreFinale(g, FINALE_PHASE2.vaultMap);
            return beastOf(g);
        })();
        assert.ok(beast, 'the vault holds him once phase 1 is won');
        assert.equal(beast.boss, true);
        assert.ok(beast.tag.endsWith('_boss'), 'a `_boss` tag so losing to him runs the boss retry');
        assert.equal(beast.entity.maxHp, spawnEntry.hp);
        assert.equal(beast.entity.armor, spawnEntry.armor);
        assert.equal(beast.damage, spawnEntry.damage);
        assert.deepEqual(beast.loadout, []);
        assert.ok(ENEMY_SPRITES[beast.type], 'his borrowed look exists');
        assert.equal(beast.type, FINALE_PHASE2.beastLook);
        assert.equal(beast.name, 'Monstrous Sun Man');
    });

    test('the scream rhythm is a function of the turn: it opens for screamTurns of every screamEvery', () => {
        let open = 0;
        for (let n = 0; n < FINALE_PHASE2.screamEvery * 5; n++) if (isExposedOn(n)) open++;
        assert.equal(open, FINALE_PHASE2.screamTurns * 5);
        assert.ok(FINALE_PHASE2.screamTurns < FINALE_PHASE2.screamEvery, 'it is not open all the time');
        assert.ok(FINALE_PHASE2.screamTurns >= 1);
    });

    test('the sunlight is bigger than anything the weakest weapon can do, so only the scream opens him', () => {
        assert.ok(FINALE_PHASE2.sunlitDefence >= 22, 'beyond the strongest weapon today (the Ray Gun, 22)');
    });

    test('cornerFor finds a floor tile with a wall on two axes, nearest first', () => {
        const g = makeGame();
        const c = cornerFor(g, 4, 3);
        assert.ok(c);
        assert.ok(isCorner(g.map, c.x, c.y));
        const vault = JSON.parse(vaultJson);
        const everyCorner = [];
        for (let y = 0; y < vault.height; y++) for (let x = 0; x < vault.width; x++) if (isCorner(g.map, x, y)) everyCorner.push([x, y]);
        assert.ok(everyCorner.length >= 4, 'the vault has its four corners');
        const nearest = Math.min(...everyCorner.map(([x, y]) => cheb(x, y, 4, 3)));
        assert.equal(cheb(c.x, c.y, 4, 3), nearest);
    });
});

describe('the Bite', () => {
    test('it comes after Sun Man\'s third turn, once, not at a health threshold', async () => {
        const g = makeGame();
        await startFight(g);
        const start = g.turn;
        const fin = financierOf(g);
        let bittenAt = null;
        for (let i = 0; i < 12 && bittenAt === null; i++) {
            const dx = fin.x - g.playerX, dy = fin.y - g.playerY;
            await step(g, Math.abs(dx) + Math.abs(dy) === 1 ? ARROW[`${dx},${dy}`] : (route4(g, { x: fin.x, y: fin.y }, fin) || ['ArrowUp'])[0]);
            if (eventsOf(g, 'sun_man_bitten').length && bittenAt === null) bittenAt = g.turn - start;
        }
        assert.equal(bittenAt, 3, 'on the third turn');
        assert.ok(fin.entity.hp > 0 && fin.entity.hp < fin.entity.maxHp, 'the Financier is hurt but up: it is the turn count, not his health');
        await fightOnward(g, { limit: 6, until: (x) => !financierOf(x).entity.isAlive() });
        assert.equal(eventsOf(g, 'sun_man_bitten').length, 1, 'once');
        assert.equal(eventsOf(g, 'sun_man_leaves').length, 0, 'Sun Man no longer leaves');
    });

    test('the Financier is weakened at the Bite, and Sun Man hit only in turns 1 to 3', async () => {
        const g = makeGame();
        await startFight(g);
        const fin = financierOf(g);
        await fightOnward(g, { limit: 12, until: () => eventsOf(g, 'sun_man_bitten').length > 0 });
        assert.equal(fin.hasBuff('weakened'), true);
        assert.equal(g.events.find(e => e.type === 'sun_man_bitten').payload.weakened, true);
        const sunBlows = g.blows.filter(b => b.by === '[Sun Man]');
        assert.ok(sunBlows.length >= 2 && sunBlows.length <= 3);
    });

    test('Sun Man cowers in a corner, face to the wall, and takes no turns while he changes', async () => {
        const g = makeGame();
        await startFight(g);
        await fightOnward(g, { limit: 12, until: () => eventsOf(g, 'sun_man_bitten').length > 0 });
        const sun = sunManOf(g);
        assert.ok(sun, 'he is still in the room');
        assert.equal(isCowering(sun), true);
        assert.equal(sun._isSummon, false, 'off the summon clock, so the cleanup keeps him');
        assert.equal(sun._ally, true);
        assert.ok(isCorner(g.map, sun.x, sun.y), `a corner of the room (${sun.x},${sun.y})`);
        assert.ok(g.logs.filter(l => l === '[TEXT]').length >= 3, 'the lines are placeholders');
        const at = [sun.x, sun.y];
        const blowsBefore = g.blows.filter(b => b.by === '[Sun Man]').length;
        await fightOnward(g, { limit: 12, until: (x) => !financierOf(x).entity.isAlive() });
        // He is still there, not moved, not fighting, not hostile, and nobody hurt him.
        const nowSun = sunManOf(g) ?? beastOf(g);
        assert.equal(g.blows.filter(b => b.by === '[Sun Man]').length, blowsBefore, 'he struck no blow after the Bite');
        assert.ok(nowSun);
        assert.equal(sun.entity.hp, sun.entity.maxHp, 'unhurt');
        assert.deepEqual([sun.x, sun.y], at, 'he did not move');
        assert.equal(isHostile(sun), false);
    });

    test('a blow aimed at the cowering Sun Man is refused; he does not turn on you', async () => {
        const g = makeGame();
        await startFight(g);
        await fightOnward(g, { limit: 12, until: () => eventsOf(g, 'sun_man_bitten').length > 0 });
        const sun = sunManOf(g);
        const logs = g.logs.length;
        assert.equal(g.combatAttack(sun, 50), null);
        assert.equal(sun.entity.hp, sun.entity.maxHp);
        assert.equal(sun._ally, true);
        assert.equal(isHostile(sun), false);
        assert.equal(g.logs.length, logs + 1, 'a line says so');
    });

    test('a cowering Sun Man takes no ally turn, whatever the fight does', async () => {
        const g = makeGame();
        await startFight(g);
        await fightOnward(g, { limit: 12, until: () => eventsOf(g, 'sun_man_bitten').length > 0 });
        const sun = sunManOf(g);
        const pos = [sun.x, sun.y];
        g.playerX = pos[0] - 1; g.playerY = pos[1];         // beside him, so there is every reason to act
        assert.deepEqual(g._allyTakeTurn(sun), []);
        assert.deepEqual([sun.x, sun.y], pos);
    });

    test('the cowering survives a save: tag, ally and no summon are all the Enemy keeps', async () => {
        const g = makeGame();
        await startFight(g);
        await fightOnward(g, { limit: 12, until: () => eventsOf(g, 'sun_man_bitten').length > 0 });
        const back = Enemy.fromSave(JSON.parse(JSON.stringify(sunManOf(g).toSave())));
        assert.equal(isCowering(back), true);
    });

    test('losing after the Bite starts phase 1 over, Sun Man and all', async () => {
        const g = makeGame();
        await startFight(g);
        await fightOnward(g, { limit: 12, until: () => eventsOf(g, 'sun_man_bitten').length > 0 });
        g.playerHp = 1;
        await fightOnward(g, { limit: 12 });
        assert.equal(g.state, STATE.DEAD);
        g.timers.splice(0).forEach(fn => fn());
        assert.equal(sunManOf(g), undefined, 'he is sent away with the rest');
        assert.equal(beastOf(g), undefined);
        assert.equal(isHostile(financierOf(g)), false, 'the Financier is calm at his post');
        g.playerHp = g.playerMaxHp;
        await walkUpAndTalk(g);
        await g.press('Enter');
        assert.ok(sunManOf(g) && sunManOf(g)._isSummon, 'a fresh Sun Man for the second try');
    });
});

describe('the rise', () => {
    async function toRise(opts) {
        const g = makeGame(opts);
        await startFight(g);
        await fightOnward(g, { limit: 120, until: () => !!beastOf(g) });
        return g;
    }

    test('when the weakened Financier falls to you alone, Sun Man rises where he cowered', async () => {
        const g = makeGame();
        await startFight(g);
        await fightOnward(g, { limit: 12, until: () => eventsOf(g, 'sun_man_bitten').length > 0 });
        const corner = [sunManOf(g).x, sunManOf(g).y];
        await fightOnward(g, { limit: 120, until: () => !!beastOf(g) });
        const beast = beastOf(g);
        assert.ok(beast, 'Monstrous Sun Man');
        assert.equal(g.enemies.filter(isBeast).length, 1);
        assert.equal(sunManOf(g), undefined, 'Sun Man is the beast now');
        assert.deepEqual([beast.x, beast.y], corner, 'where he cowered');
        assert.equal(financierOf(g).entity.isAlive(), false, 'the Financier is down first');
        assert.equal(isHostile(beast), true);
        assert.equal(beast.state, 'chasing');
        assert.equal(beast.entity.hp, beast.entity.maxHp);
        assert.equal(g.questEngine.state.flags.finalePhase1, 'won');
        assert.equal(g.questEngine.state.flags.finalePhase2, undefined, 'phase 2 is not won yet');
        assert.equal(eventsOf(g, 'monstrous_sun_man_rises').length, 1);
        assert.equal(eventsOf(g, 'finale_phase1_won').length, 1);
        assert.equal(phase2Won(g), false);
    });

    test('the coaching cue is shown when he rises: a line, and words over his head', async () => {
        const g = makeGame();
        await startFight(g);
        await fightOnward(g, { limit: 12, until: () => eventsOf(g, 'sun_man_bitten').length > 0 });
        const said = [];
        g._spawnOverheadDialogue = (x, y, t) => said.push({ x, y, t });
        const before = g.logs.length;
        await fightOnward(g, { limit: 120, until: () => !!beastOf(g) });
        const lines = g.logs.slice(before).filter(l => l === '[TEXT]');
        assert.ok(lines.length >= 2, 'he rises, and the cue tells you to hit him when he screams');
        const b = beastOf(g);
        assert.ok(said.some(s => s.x === b.x && s.y === b.y && s.t === '[TEXT]'), 'words over his head');
    });

    test('if the Financier falls before the third turn ends, the Bite lands first and he still rises', async () => {
        const g = makeGame();
        await startFight(g);
        financierOf(g).entity.hp = 1;
        await fightOnward(g, { limit: 12, until: () => !!beastOf(g) });
        assert.ok(beastOf(g), 'no dead end');
        assert.equal(eventsOf(g, 'sun_man_bitten').length, 1);
        assert.equal(sunManOf(g), undefined);
        assert.equal(g.questEngine.state.flags.finalePhase1, 'won');
        assert.equal(eventsOf(g, 'monstrous_sun_man_rises').length, 1);
    });

    test('a Financier who falls with no Sun Man about raises no beast', () => {
        const g = makeGame();
        const fin = financierOf(g);
        fin.entity.hp = 0; fin.entity.alive = false;
        g._finaleOnDeath(fin);
        assert.equal(beastOf(g), undefined);
        assert.equal(g.questEngine.state.flags.finalePhase1, 'won');
    });
});

describe('phase 2', () => {
    test('he is wrapped in sunlight until he screams: one point a blow, then the scream opens him', async () => {
        const g = makeGame();
        await startFight(g);
        await fightOnward(g, { limit: 120, until: () => !!beastOf(g) });
        const beast = beastOf(g);
        assert.equal(beast.hasBuff('sunlit') || beast.hasBuff('weakened'), true);
        const samples = [];
        await fightOnward(g, { limit: 60, samples, until: () => phase2Won(g) });
        const guarded = samples.filter(s => s.foe === beast && s.adjacent && !s.exposed);
        const open = samples.filter(s => s.foe === beast && s.adjacent && s.exposed);
        assert.ok(guarded.length > 0 && open.length > 0, `both kinds of turn happened (${guarded.length}, ${open.length})`);
        for (const s of guarded) assert.ok(s.foeHp - s.foeHpAfter <= 1, `in the sunlight a blow does one point (${s.foeHp - s.foeHpAfter})`);
        for (const s of open) assert.ok(s.foeHp - s.foeHpAfter >= 10, `in the scream a blow lands (${s.foeHp - s.foeHpAfter})`);
    });

    test('while he screams he swings at nothing; while he is lit he swings', async () => {
        const g = makeGame({ armor: 10 });
        await startFight(g);
        await fightOnward(g, { limit: 120, until: () => !!beastOf(g) });
        g.playerHp = g.playerMaxHp = 1000;           // outlast everything: this reads his rhythm, not the odds
        const beast = beastOf(g);
        const samples = [];
        await fightOnward(g, { limit: 40, samples, until: () => phase2Won(g) });
        const mine = samples.filter(s => s.foe === beast && s.adjacent);
        const screaming = mine.filter(s => s.exposed);
        const lit = mine.filter(s => !s.exposed);
        assert.ok(screaming.length > 0 && lit.length > 0);
        for (const s of screaming) assert.equal(s.foeBlows, 0, 'no blow from him while he screams');
        assert.ok(lit.some(s => s.foeBlows > 0), 'but he swings when lit');
    });

    test('the scream is announced when it opens, and the rhythm is the turn number alone', async () => {
        const g = makeGame();
        await startFight(g);
        await fightOnward(g, { limit: 120, until: () => !!beastOf(g) });
        g.playerHp = g.playerMaxHp = 1000;
        const beast = beastOf(g);
        beast.entity.hp = beast.entity.maxHp = 100000;      // long enough to watch two full rhythms
        const seen = [];
        let wasOpen = beast.hasBuff('weakened');
        for (let i = 0; i < FINALE_PHASE2.screamEvery * 2; i++) {
            const dx = beast.x - g.playerX, dy = beast.y - g.playerY;
            const logsBefore = g.logs.length;
            const turnBefore = g.turn;
            await g.press(Math.abs(dx) + Math.abs(dy) === 1 ? ARROW[`${dx},${dy}`] : (route4(g, { x: beast.x, y: beast.y }, beast) || ['ArrowUp'])[0]);
            if (g.turn === turnBefore) continue;
            const open = beast.hasBuff('weakened');
            seen.push({ n: g.turn, open, opened: open && !wasOpen, logs: g.logs.length - logsBefore });
            wasOpen = open;
        }
        assert.ok(seen.length >= FINALE_PHASE2.screamEvery, 'a full rhythm was watched');
        for (const s of seen) assert.equal(s.open, isExposedOn(s.n + 1), `at the end of turn ${s.n} the state is the one turn ${s.n + 1} calls for`);
        const opens = seen.filter(s => s.opened);
        assert.ok(opens.length >= 1);
        for (const s of opens) assert.ok(s.logs >= 1, `a line announces the scream that opens after turn ${s.n}`);
    });

    test('winning phase 2: a saved flag and a one-shot event for the credits', async () => {
        const g = makeGame({ weapon: 'ray_gun', armor: 5 });
        await startFight(g);
        await fightOnward(g, { limit: 250, until: () => phase2Won(g) });
        assert.equal(beastOf(g).entity.isAlive(), false);
        assert.ok(g.playerHp > 0);
        assert.equal(g.questEngine.state.flags.finalePhase2, 'won');
        assert.equal(JSON.parse(JSON.stringify(g.questEngine.state)).flags.finalePhase2, 'won', 'it survives the save');
        assert.equal(eventsOf(g, 'finale_phase2_won').length, 1);
        assert.deepEqual(eventsOf(g, 'finale_phase2_won')[0].payload, { id: FINALE_PHASE2.beastId });
        // And only once: a second fall announces nothing.
        beastFell(g, beastOf(g));
        assert.equal(eventsOf(g, 'finale_phase2_won').length, 1);
    });

    test('winning does not soft-lock: nobody is left hostile and the door out is walkable', async () => {
        const g = makeGame({ weapon: 'ray_gun', armor: 5 });
        await startFight(g);
        await fightOnward(g, { limit: 250, until: () => phase2Won(g) });
        assert.ok(!g.enemies.some(e => e.entity.isAlive() && isHostile(e)));
        assert.equal(g.state, STATE.IDLE);
        const door = JSON.parse(vaultJson).transitions[0];
        const path = findPath({ map: g.map, enemies: g.enemies, containers: [], playerX: -1, playerY: -1 },
            { x: g.playerX, y: g.playerY }, { x: door.x, y: door.y });
        assert.ok(path && path.length > 0);
    });
});

describe('losing to Monstrous Sun Man, leaving the vault, coming back', () => {
    async function toBeast() {
        const g = makeGame();
        await startFight(g);
        await fightOnward(g, { limit: 120, until: () => !!beastOf(g) });
        return g;
    }

    test('the boss retry sends him back to his corner at full health, calm; the fight can be tried again', async () => {
        const g = await toBeast();
        const old = beastOf(g);
        const corner = [old.homeX, old.homeY];
        g.playerHp = 1;
        await fightOnward(g, { limit: 30, until: (x) => x.state === STATE.DEAD });
        assert.equal(g.state, STATE.DEAD, 'he put you down');
        g.timers.splice(0).forEach(fn => fn());
        assert.equal(g.state, STATE.IDLE);
        assert.ok(g.logs.some(l => /Down but not out/.test(l)), 'the boss retry, not a defeat scenario');
        const again = beastOf(g);
        assert.equal(g.enemies.filter(isBeast).length, 1);
        assert.equal(again.entity.hp, again.entity.maxHp);
        assert.equal(isHostile(again), true);
        assert.equal(again.state, 'idle', 'calm until he sees you');
        assert.ok(isCorner(g.map, again.x, again.y), 'back in a corner');
        assert.equal(g.questEngine.state.flags.finalePhase1, 'won', 'phase 1 stays won');
        assert.equal(phase2Won(g), false);
        g.playerHp = g.playerMaxHp;
        await fightOnward(g, { limit: 250, until: (x) => phase2Won(x) || x.playerHp <= 0 });
        assert.equal(beastOf(g).entity.isAlive(), false, 'and he can be beaten the second time');
    });

    test('back in the vault after phase 1 is won: no Financier, and the beast waits in a corner', async () => {
        const g = makeGame();
        g.questEngine.state.flags.finalePhase1 = 'won';
        restoreFinale(g, 'vault-map.json');
        assert.equal(financierOf(g), undefined, 'he does not come back');
        const beast = beastOf(g);
        assert.ok(beast);
        assert.ok(isCorner(g.map, beast.x, beast.y));
        assert.equal(g.enemies.filter(isBeast).length, 1);
        restoreFinale(g, 'vault-map.json');
        assert.equal(g.enemies.filter(isBeast).length, 1, 'a second load does not double him');
    });

    test('after phase 2 is won the vault holds neither of them', () => {
        const g = makeGame();
        g.questEngine.state.flags.finalePhase1 = 'won';
        g.questEngine.state.flags.finalePhase2 = 'won';
        restoreFinale(g, 'vault-map.json');
        assert.equal(financierOf(g), undefined);
        assert.equal(beastOf(g), undefined);
    });

    test('before phase 1 is won, or in any other zone, the loader changes nothing', () => {
        const g = makeGame();
        restoreFinale(g, 'vault-map.json');
        assert.ok(financierOf(g), 'the vault is as FIN2 left it');
        assert.equal(beastOf(g), undefined);
        g.questEngine.state.flags.finalePhase1 = 'won';
        restoreFinale(g, 'bank-map.json');
        assert.ok(financierOf(g));
        assert.equal(beastOf(g), undefined);
    });
});

// How winnable the whole finale is, measured: the real fight from the first talk to the credits
// hook, ten seeds, every weapon the game has, three amounts of armour. No bandages, no poitions,
// no backstab, and no waiting for the scream (a blow every turn): only swords and armour, so a
// player who uses the rest, or who waits for the scream, does better than this table.
// FIN_TABLE=1 prints it.
describe('winnable at the gear the game has today', () => {
    const WEAPONS_TODAY = ['wooden_sword', 'lion_whip', 'fearmur', 'gator_tail', 'ray_gun'];
    const ARMOUR_TODAY = [0, 5, 10];
    test('every weapon at every armour wins both phases, every seed, the starting sword with nothing worn included', async () => {
        const rows = [];
        for (const weapon of WEAPONS_TODAY) {
            for (const armor of ARMOUR_TODAY) {
                let wins = 0, hp = 0, worst = 100, presses = 0;
                for (let seed = 1; seed <= 10; seed++) {
                    const g = makeGame({ seed, weapon, armor });
                    await startFight(g);
                    const t0 = g.turn;
                    await fightOnward(g, { limit: 400, until: (x) => phase2Won(x) });
                    if (phase2Won(g) && g.playerHp > 0) { wins++; hp += g.playerHp; worst = Math.min(worst, g.playerHp); presses += g.turn - t0; }
                }
                rows.push({ weapon, armor, wins: `${wins}/10`, avgHpLeft: Math.round(hp / Math.max(1, wins)), worstHpLeft: worst, avgTurns: Math.round(presses / Math.max(1, wins)) });
                assert.equal(wins, 10, `${weapon} with ${armor} armour won ${wins}/10`);
            }
        }
        if (process.env.FIN_TABLE) console.table(rows);
        const floor = rows.find(r => r.weapon === 'wooden_sword' && r.armor === 0);
        assert.ok(floor.worstHpLeft >= 20, `the weakest gear wins with something to spare (${floor.worstHpLeft} HP in the worst seed)`);
    });
});
