// finale-phase1.test.js — FIN2 (plans/fin2-financier-fight.md).
//
// The Financier stands in his vault. Talk to him and the fight starts with Sun Man at
// your side: three turns of heavy blows, then he leaves and the Financier is weakened for
// the rest of the fight. Beat him and phase 1 is won (a saved flag, a one-shot event).
//
// main.js touches `document` at import, so, as in rat-robbery.test.js, the real methods
// are lifted out of the source and bound onto a small game object. The map is the real
// vault and the Financier its real spawn. Every step, every talk and every blow is a real
// key through the real listeners _bindInput registers; the enemy turns are the real
// resolveEnemyTurns, and the dialogue, the summon, the weakening and the kill are the
// game's own methods. Stand-ins are only drawing, sound and the save.

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
import { attack, computeHit, elementalMult, weaponHitKind, isBackstab } from '../game/combat.js';
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
        requestAnimationFrame: (f) => queueMicrotask(() => f(Infinity)),
        performance: { now: () => 0 },
        setTimeout: (f) => { timers.push(f); return timers.length; },
        isBoss, bossInFight, pickScenario, partitionInventory, matchTake, DEFEAT_SCENARIOS, SAFE_SLOTS,
        computeHit, elementalMult, weaponHitKind, isBackstab, resolveEnemyTurns,
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

describe('the data', () => {
    const vault = JSON.parse(vaultJson);

    test('the vault holds one fixed Financier, placed by hand, three tiles in front of the door in', () => {
        assert.equal(vault.enemies.length, 1);
        const s = vault.enemies[0];
        assert.equal(s.entry, 'financier');
        assert.equal(s.slot, undefined, 'a Locked character is a fixed spawn, not a pool entry');
        assert.equal(vault.spawn.y - s.y, 3);
        assert.equal(vault.spawn.x, s.x);
        const g = makeGame();
        const fin = financierOf(g);
        assert.ok(fin, 'the spawn becomes the Financier');
        assert.equal(fin.boss, true);
        assert.equal(fin.entity.isAlive(), true);
    });

    test('he is the Were-Rat\'s boss block, copied: 100 HP, damage 12, the same kit; dressed, 4 armour', () => {
        const fin = financierOf(makeGame());
        const rat = ENTRIES.wererat;
        for (const k of ['hp', 'armor', 'damage', 'gold', 'loadout', 'equipped', 'boss']) {
            assert.deepEqual(ENTRIES.financier[k], rat[k], `the ${k} is copied`);
        }
        assert.equal(fin.entity.maxHp, 100);
        assert.equal(fin.damage, 12);
        assert.equal(fin.entity.armor, 4, 'his kit dresses him in the cuirass, as it does the Were-Rat');
        assert.equal(fin.type, 'Banker');
        assert.ok(ENEMY_SPRITES[fin.type], 'his look exists');
        assert.ok(ENEMY_SPRITES[FINALE_PHASE1.sunMan.type], 'Sun Man\'s borrowed look exists');
    });

    test('he is calm until you talk to him, and talking is how the fight starts', () => {
        const fin = financierOf(makeGame());
        assert.equal(isHostile(fin), false);
        assert.equal(isHunting(fin), false);
        const d = getDialogue(fin.dialogueId);
        assert.ok(d, 'he has a conversation');
        assert.ok(d.choices.some(c => typeof c.onPick === 'function'), 'one choice starts the fight');
        assert.ok(getDialogue(FINALE_PHASE1.sunMan.dialogueId), 'Sun Man has a conversation stub so he can be named');
    });

    test('every line the player reads is the [TEXT] placeholder', () => {
        const d = getDialogue('financier_vault');
        assert.equal(d.greeting, '[TEXT]');
        for (const c of d.choices) { assert.equal(c.label, '[TEXT]'); assert.equal(c.reply, '[TEXT]'); }
        assert.equal(getDialogue('sun_man').greeting, '[TEXT]');
    });

    test('Sun Man\'s numbers are the encounter\'s stand-ins: three turns, a lot more than the lion\'s 25', () => {
        assert.equal(FINALE_PHASE1.sunManTurns, 3);
        assert.ok(FINALE_PHASE1.sunMan.damage > 25);
        assert.equal(FINALE_PHASE1.sunMan.damage, 30, 'a stand-in: a change here is deliberate');
        assert.equal(FINALE_PHASE1.defenceDrop, 8, 'a stand-in: a change here is deliberate');
    });

    test('the content checker has nothing to say about the vault, the Financier or the registry', () => {
        const bank = JSON.parse(bankJson);
        const { problems } = validateContent([
            { file: 'bank-map.json', data: bank },
            { file: 'vault-map.json', data: vault },
        ]);
        // Only these two maps are fed in, so the slots and other maps read as missing: look at what
        // is about the vault, the Financier and the registry.
        const mine = problems.filter(m => /vault|financier|sun_man|registry|financier_vault/i.test(m));
        assert.deepEqual(mine, []);
    });

    test('weakenedBuff is a defence rider that sumBuffStat reads as a drop', () => {
        const b = weakenedBuff(6);
        assert.equal(b.id, 'weakened');
        assert.equal(b.stat, 'defence');
        assert.equal(b.amount, -6);
        assert.equal(sumBuffStat([b], 'defence'), -6);
        assert.ok(BUFF_DEFS.weakened);
        assert.equal(weakenedBuff(-6).amount, -6, 'the sign is the buff\'s, not the caller\'s');
    });
});

// ── The fight, with the real keys ───────────────────────────────────────────

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

describe('the fight, driven with real keys', () => {
    test('walk up, press E: the conversation opens, and its one choice starts the fight', async () => {
        const g = makeGame();
        await walkUpAndTalk(g);
        assert.equal(g.state, STATE.DIALOGUE, 'E opens his conversation');
        assert.equal(g._dialogueNpc, financierOf(g));
        assert.equal(isHostile(financierOf(g)), false, 'nothing has started yet');
        assert.equal(sunManOf(g), undefined);

        await g.press('Enter');                       // the one choice
        const fin = financierOf(g);
        assert.equal(isHostile(fin), true, 'he turns on you');
        assert.equal(fin.state, 'chasing');
        const sun = sunManOf(g);
        assert.ok(sun, 'Sun Man is at your side');
        assert.equal(sun._ally, true);
        assert.equal(sun._isSummon, true);
        assert.equal(sun._summonTurnsLeft, 3, 'three turns');
        assert.equal(sun.damage, FINALE_PHASE1.sunMan.damage);
        assert.equal(sun.shownName, 'Sun Man', 'the log and panel call him by name');
        assert.equal(sun.type, FINALE_PHASE1.sunMan.type);
        assert.ok(chebyshev(sun.x, sun.y, g.playerX, g.playerY) === 1, 'he stands beside you');
        assert.equal(g.logs.filter(l => l === '[TEXT]').length, 1, 'his arrival line is the placeholder');

        await g.press('KeyE');                        // read it, leave the conversation
        assert.equal(g.state, STATE.IDLE);
    });

    test('Sun Man hits hard for three turns and leaves; the Financier is weakened for the rest of the fight', async () => {
        const g = makeGame();
        await walkUpAndTalk(g);
        await g.press('Enter');
        await g.press('KeyE');
        const fin = financierOf(g);
        assert.equal(fin.entity.armor + sumBuffStat(fin.buffs, 'defence'), 4, 'his defence, before');

        const sunTurns = [];
        let weakenedAt = null;
        for (let i = 0; i < 40 && financierOf(g).entity.isAlive() && g.playerHp > 0; i++) {
            const f = financierOf(g);
            const dx = f.x - g.playerX, dy = f.y - g.playerY;
            const code = Math.abs(dx) + Math.abs(dy) === 1 ? ARROW[`${dx},${dy}`]
                : (route4(g, { x: f.x, y: f.y }, f) || ['ArrowUp'])[0];
            const turnBefore = g.turn;
            await step(g, code);
            if (g.turn !== turnBefore) {
                sunTurns.push(!!sunManOf(g));
                if (weakenedAt === null && f.hasBuff('weakened')) weakenedAt = sunTurns.length;
            }
            if (weakenedAt !== null) break;
        }
        assert.equal(weakenedAt, 3, 'he leaves on the third turn, and the Financier is weakened the moment he goes');
        assert.deepEqual(sunTurns, [true, true, false], 'Sun Man was there for turns 1 and 2 and gone after turn 3\'s blows');
        assert.equal(sunManOf(g), undefined, 'Sun Man is gone');
        assert.equal(fin.entity.armor + sumBuffStat(fin.buffs, 'defence'), 4 - FINALE_PHASE1.defenceDrop, 'his defence has dropped');
        assert.ok(g.logs.filter(l => l === '[TEXT]').length >= 2, 'Sun Man\'s leaving line is the placeholder');
        assert.ok(fin.buffs.some(b => b.id === 'weakened' && b.type === 'debuff'), 'the red W badge the renderer draws over an enemy');
        assert.equal(g.events.filter(e => e.type === 'sun_man_leaves').length, 1, 'the hook for the Bite fires once');
        assert.ok(!g.logs.some(l => /slinks back/.test(l)), 'he does not leave like the lion');

        // He hit hard: every one of his blows was his 30 less the Financier's 4 (before he was weakened).
        const sunBlows = g.blows.filter(b => b.by === '[Sun Man]');
        assert.ok(sunBlows.length >= 2, `Sun Man landed ${sunBlows.length} blows`);
        assert.ok(sunBlows.length <= 3, 'and never more than one a turn');
        for (const b of sunBlows) { assert.equal(b.raw, FINALE_PHASE1.sunMan.damage); assert.equal(b.dealt, FINALE_PHASE1.sunMan.damage - 4); }
    });

    test('hitting the calm Financier first starts the same fight, Sun Man and all', () => {
        const g = makeGame();
        g._onEntityHarmed(financierOf(g), { kind: 'attack' });
        assert.equal(isHostile(financierOf(g)), true);
        assert.ok(sunManOf(g));
        g._onEntityHarmed(financierOf(g), { kind: 'attack' });
        assert.equal(g.enemies.filter(e => e.tag === 'sun_man').length, 1, 'a second blow brings no second Sun Man');
    });

    test('talking again mid-fight does not summon a second Sun Man', async () => {
        const g = makeGame();
        await walkUpAndTalk(g);
        await g.press('Enter');
        assert.equal(g._beginFinalFight(financierOf(g)), false);
        assert.equal(g.enemies.filter(e => e.tag === 'sun_man').length, 1);
    });

    // Winnable with the weakest the game has: the wooden sword it starts you with and no armour.
    for (const seed of [1, 2, 3, 4, 5]) {
        test(`winnable with the starting wooden sword and no armour (seed ${seed})`, async () => {
            const g = makeGame({ seed });
            await walkUpAndTalk(g);
            await g.press('Enter');
            await g.press('KeyE');
            const turns = await fightOn(g, { limit: 120 });
            const fin = financierOf(g);
            assert.equal(fin.entity.isAlive(), false, `he fell (${turns.length} presses, ${g.playerHp} HP left)`);
            assert.ok(g.playerHp > 0, 'and you are standing');
            assert.equal(g.state, STATE.IDLE);
            assert.equal(g.questEngine.state.flags.finalePhase1, 'won', 'phase 1 is won');
            assert.equal(g.events.filter(e => e.type === 'finale_phase1_won').length, 1, 'announced once');
            g.measure = { seed, presses: turns.length, hpLeft: g.playerHp };
        });
    }

    test('winnable with the strongest weapon too, and armoured', async () => {
        const g = makeGame({ weapon: 'ray_gun', armor: 8 });
        await walkUpAndTalk(g);
        await g.press('Enter');
        await g.press('KeyE');
        await fightOn(g);
        assert.equal(financierOf(g).entity.isAlive(), false);
        assert.ok(g.playerHp > 50, `armoured with the Ray Gun it is no contest (${g.playerHp} HP left)`);
    });
});

// How winnable it is, measured: the real fight, ten seeds, with every weapon the game has and
// three amounts of armour (the game's pieces add to 10 at most: hat 2, cuirass 4, gloves 1,
// cape 1, shoe bags 2). No bandages, no poitions, no backstab: only swords and armour, so a
// player who uses any of the rest is better off than this table. FIN_TABLE=1 prints it.
describe('winnable at the gear the game has today', () => {
    const WEAPONS_TODAY = ['wooden_sword', 'lion_whip', 'fearmur', 'gator_tail', 'ray_gun'];
    const ARMOUR_TODAY = [0, 5, 10];
    test('every weapon at every armour wins, every seed, the starting sword with nothing worn included', async () => {
        const rows = [];
        for (const weapon of WEAPONS_TODAY) {
            for (const armor of ARMOUR_TODAY) {
                let wins = 0, hp = 0, presses = 0, worst = 100;
                for (let seed = 1; seed <= 10; seed++) {
                    const g = makeGame({ seed, weapon, armor });
                    await walkUpAndTalk(g);
                    await g.press('Enter');
                    await g.press('KeyE');
                    const t = await fightOn(g, { limit: 150 });
                    if (!financierOf(g).entity.isAlive() && g.playerHp > 0) {
                        wins++; hp += g.playerHp; presses += t.length; worst = Math.min(worst, g.playerHp);
                    }
                }
                rows.push({ weapon, armor, wins: `${wins}/10`, avgHpLeft: Math.round(hp / Math.max(1, wins)), worstHpLeft: worst, avgPresses: Math.round(presses / Math.max(1, wins)) });
                assert.equal(wins, 10, `${weapon} with ${armor} armour won ${wins}/10`);
            }
        }
        if (process.env.FIN_TABLE) console.table(rows);
        const floor = rows.find(r => r.weapon === 'wooden_sword' && r.armor === 0);
        assert.ok(floor.worstHpLeft >= 20, `the weakest gear wins with room to spare (${floor.worstHpLeft} HP in the worst seed)`);
    });
});

describe('winning phase 1', () => {
    async function win() {
        const g = makeGame();
        await walkUpAndTalk(g);
        await g.press('Enter');
        await g.press('KeyE');
        await fightOn(g, { limit: 120 });
        assert.equal(financierOf(g).entity.isAlive(), false);
        return g;
    }

    test('the hook is a saved flag and a one-shot event', async () => {
        const g = await win();
        assert.equal(g.questEngine.state.flags.finalePhase1, 'won');
        assert.equal(JSON.parse(JSON.stringify(g.questEngine.state)).flags.finalePhase1, 'won', 'it survives the save');
        assert.equal(g.events.filter(e => e.type === 'finale_phase1_won').length, 1);
        assert.deepEqual(g.events.find(e => e.type === 'finale_phase1_won').payload, { id: 'vault-financier' });
    });

    test('the save is not soft-locked: the vault door is open to you, nothing left in the room is hostile', async () => {
        const g = await win();
        assert.ok(!g.enemies.some(e => e.entity.isAlive() && isHostile(e)), 'nobody left to fight');
        assert.ok(!g.enemies.some(e => e._ally), 'Sun Man is gone');
        assert.equal(g.state, STATE.IDLE, 'you can act');
        const door = JSON.parse(vaultJson).transitions[0];
        const path = findPath({ map: g.map, enemies: g.enemies, containers: [], playerX: -1, playerY: -1 },
            { x: g.playerX, y: g.playerY }, { x: door.x, y: door.y });
        assert.ok(path && path.length > 0, 'the way back to the bank is walkable');
        assert.equal(door.toMap, 'bank-map.json');
    });

    test('a Financier who comes back (KS1) and falls again does not announce it twice', async () => {
        const g = await win();
        const again = spawnEnemy(resolveSpawn(JSON.parse(vaultJson).enemies[0], defaultPicks()));
        g.enemies.push(again);
        g._finaleOnDeath(again);
        assert.equal(g.events.filter(e => e.type === 'finale_phase1_won').length, 1);
        assert.equal(g.questEngine.state.flags.finalePhase1, 'won');
    });
});

describe('losing to the Financier', () => {
    test('the boss retry rebuilds him at his post and sends Sun Man away; talking starts it all again', async () => {
        const g = makeGame();
        await walkUpAndTalk(g);
        await g.press('Enter');
        await g.press('KeyE');
        // Fight until Sun Man has gone and he is weakened, then go down to him.
        for (let i = 0; i < 12 && !financierOf(g).hasBuff('weakened'); i++) {
            const f = financierOf(g);
            const dx = f.x - g.playerX, dy = f.y - g.playerY;
            await step(g, Math.abs(dx) + Math.abs(dy) === 1 ? ARROW[`${dx},${dy}`] : (route4(g, { x: f.x, y: f.y }, f) || ['ArrowUp'])[0]);
        }
        const old = financierOf(g);
        assert.ok(old.hasBuff('weakened'));
        g.playerHp = 1;
        const bag = g.inventory.filter(Boolean).length;
        for (let i = 0; i < 6 && g.state !== STATE.DEAD; i++) {
            const dx = old.x - g.playerX, dy = old.y - g.playerY;
            await step(g, Math.abs(dx) + Math.abs(dy) === 1 ? ARROW[`${dx},${dy}`] : (route4(g, { x: old.x, y: old.y }, old) || ['ArrowUp'])[0]);
        }
        assert.equal(g.state, STATE.DEAD, 'he put you down');
        g.timers.splice(0).forEach(fn => fn());      // the beat _die waits before the defeat resolves

        assert.equal(g.state, STATE.IDLE);
        assert.ok(g.logs.some(l => /Down but not out/.test(l)), 'the boss retry, not a defeat scenario');
        assert.equal(g.inventory.filter(Boolean).length, bag, 'nothing taken');
        const fin = financierOf(g);
        assert.notEqual(fin, old, 'he is rebuilt, not patched');
        assert.equal(fin.entity.hp, fin.entity.maxHp);
        assert.equal(fin.hasBuff('weakened'), false);
        assert.equal(fin.entity.armor + sumBuffStat(fin.buffs, 'defence'), 4);
        assert.equal(isHostile(fin), false, 'calm again');
        assert.deepEqual([fin.x, fin.y], [4, 2], 'at his post');
        assert.equal(sunManOf(g), undefined);
        assert.equal(g.enemies.filter(e => e.tag === 'financier_boss').length, 1, 'only one of him');
        assert.deepEqual([g.playerX, g.playerY], [4, 5], 'you wake at the door');

        // Again.
        g.playerHp = g.playerMaxHp;
        await walkUpAndTalk(g);
        assert.equal(g.state, STATE.DIALOGUE);
        await g.press('Enter');
        assert.ok(sunManOf(g), 'Sun Man comes back for the second try');
        assert.equal(sunManOf(g)._summonTurnsLeft, 3);
    });
});
