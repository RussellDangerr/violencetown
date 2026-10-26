// skills.test.js — light fingers: clean lifts rank up your thieving.
//
// Three layers. The pure table (game/skills.js); the Thieve resolver in main.js,
// lifted out and run for real against the real theft maths, so "a clean lift
// counts, a noticed one does not" is proved on the code the game runs; and the
// save, which must carry the record through a load and leave it out while empty
// (the autoplay fingerprint hashes the save).
//
// Design: plans/us1-light-fingers.md

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { SKILLS, rankOf, recordUse, skillPerks, mergePassives, sanitizeSkills } from '../game/skills.js';
import { coinTake, kitTake, gearTake, coinWeight, itemWeight, gearWeight,
         noticeBuffer, isClean, stealLimit, STEAL_BASE, NOTICE_BASE } from '../game/theft.js';
import { VERDICT } from '../game/perception.js';
import { transferGold } from '../game/trade.js';
import { serialize, loadInto, migrate } from '../game/save.js';
import { QuestEngine } from '../game/quests.js';
import { RNG, randomSeed } from '../game/rng.js';
import { pickSlots } from '../game/slots.js';
import { WEAPONS } from '../game/weapons.js';
import { PLAYER_MAX_HP, PLAYER_MAX_MP } from '../game/data.js';
import { RINGS, FUSIONS } from '../game/ring-data.js';
import { SPELLS } from '../game/spells.js';
import { TRICKS } from '../game/tricks.js';
import { slottedActives, resolveAdjacencies, aggregatePassives, mergeKnown, acquireRing } from '../game/rings.js';

const LF = 'light_fingers';
const ranks = SKILLS[LF].ranks;
const at = (k) => ranks[k - 1].at;           // clean lifts needed for rank k

// ── main.js, lifted ─────────────────────────────────────────────────────────

const mainSrc = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
const BASE_SPELLS = JSON.parse(/const BASE_SPELLS = (\[.*?\]);/.exec(mainSrc)[1].replace(/'/g, '"'));

// A Game method, run for real (same technique as restart.test.js).
function liveMethod(signature, freeVars = {}, { async = false } = {}) {
    const start = mainSrc.indexOf(signature, mainSrc.indexOf('class Game {'));
    assert.ok(start > 0, `${signature} not found in main.js`);
    const body = mainSrc.slice(start + signature.indexOf('('), mainSrc.indexOf('\n    }', start) + '\n    }'.length);
    const names = Object.keys(freeVars);
    const fn = `'use strict'; return ${async ? 'async ' : ''}function ${body}`;
    return new Function(...names, fn)(...names.map(n => freeVars[n]));
}

// The Thieve resolver: the whole case block, wrapped in a switch of its own.
function liftThieve(freeVars) {
    const head = "case 'thieveCoin': case 'thieveKit': case 'thieveGear': {";
    const from = mainSrc.indexOf(head);
    const to = mainSrc.indexOf("case 'trade': {", from);
    assert.ok(from > 0 && to > from, 'the Thieve resolver was not found in main.js');
    const block = mainSrc.slice(from, to);
    const names = Object.keys(freeVars);
    const fn = `'use strict'; return function (node, aimTile) { switch (node.resolver) { ${block} } }`;
    return new Function(...names, fn)(...names.map(n => freeVars[n]));
}

const skillMethods = {
    recordUse, skillPerks, mergePassives,
};
const theftPassives = liveMethod('_theftPassives() {', skillMethods);
const countCleanLift = liveMethod('_countCleanLift() {', skillMethods);
const refreshGrantedSkills = liveMethod('_refreshGrantedSkills() {', {
    RINGS, FUSIONS, SPELLS, TRICKS, BASE_SPELLS, slottedActives, resolveAdjacencies, aggregatePassives, mergeKnown,
});

let verdict = VERDICT.NONE;                  // what the victim sees of you
const thieve = liftThieve({
    perceives: () => verdict,
    coinTake, kitTake, gearTake, coinWeight, itemWeight, gearWeight, noticeBuffer, isClean, stealLimit,
    transferGold,
    audio: { playSfx() {} },
    reactToTransaction() {},
});

function thiefGame() {
    return {
        skills: {}, ringMods: {}, ringSlots: {}, ownedRings: new Set(), ringTier: 0,
        discoveredFusions: new Set(), equipment: { weapon: null },
        gold: 0, _robbed: {}, _hot: {}, logs: [], victims: [],
        map: {}, playerX: 0, playerY: 0,
        _theftPassives: theftPassives,
        _countCleanLift: countCleanLift,
        _refreshGrantedSkills: refreshGrantedSkills,
        _log(m) { this.logs.push(m); },
        _advanceWorld() {},
        _addToInventory() { return true; },
        _resolveItemDef() { return null; },
        _thieveTarget() { return this.victims[0] ?? null; },
        lift(victim) {
            this.victims = [victim];
            thieve.call(this, { resolver: 'thieveCoin' }, { x: 1, y: 0 });
        },
    };
}

let nextId = 0;
const mark = (gold = 1000) => ({ id: `mark_${nextId++}`, type: 'Violencian', gold });

beforeEach(() => { verdict = VERDICT.NONE; });

// ── The table ───────────────────────────────────────────────────────────────

describe('the light fingers table', () => {
    test('ranks rise with the count and never skip', () => {
        for (let i = 1; i < ranks.length; i++) assert.ok(ranks[i].at > ranks[i - 1].at, 'thresholds ascend');
        assert.equal(rankOf({}, LF), 0);
        assert.equal(rankOf({ [LF]: at(1) - 1 }, LF), 0);
        assert.equal(rankOf({ [LF]: at(1) }, LF), 1);
        assert.equal(rankOf({ [LF]: at(ranks.length) + 100 }, LF), ranks.length);
    });

    test('every perk is one theft.js already reads', () => {
        for (const r of ranks) {
            for (const k of Object.keys(r.perk)) assert.ok(['stealLimit', 'noticeBuffer'].includes(k), k);
        }
    });

    test('perks of every rank reached add together', () => {
        const all = skillPerks({ [LF]: at(ranks.length) });
        const sum = {};
        for (const r of ranks) for (const [k, v] of Object.entries(r.perk)) sum[k] = (sum[k] || 0) + v;
        assert.deepEqual(all, sum);
        assert.deepEqual(skillPerks({}), {});
    });

    test('recordUse reports the rank a use reaches, and only that use', () => {
        let s = {};
        const reached = [];
        for (let i = 0; i < at(ranks.length); i++) {
            const r = recordUse(s, LF);
            s = r.skills;
            if (r.rankedUp) reached.push([s[LF], r.rankedUp]);
        }
        assert.deepEqual(reached, ranks.map((r, i) => [r.at, i + 1]));
    });

    test('recordUse leaves the record it was given alone, and ignores unknown skills', () => {
        const s = { [LF]: 2 };
        recordUse(s, LF);
        assert.deepEqual(s, { [LF]: 2 });
        assert.deepEqual(recordUse(s, 'cooking'), { skills: { [LF]: 2 }, rankedUp: 0 });
    });

    test('mergePassives adds key by key', () => {
        assert.deepEqual(mergePassives({ stealLimit: 10, armor: 2 }, { stealLimit: 25, noticeBuffer: 1 }),
            { stealLimit: 35, armor: 2, noticeBuffer: 1 });
        assert.deepEqual(mergePassives(undefined, undefined), {});
    });

    test('sanitizeSkills keeps known skills as whole positive counts', () => {
        assert.deepEqual(sanitizeSkills({ [LF]: 4.7, cooking: 9 }), { [LF]: 4 });
        assert.deepEqual(sanitizeSkills({ [LF]: -3 }), {});
        assert.deepEqual(sanitizeSkills({ [LF]: 'lots' }), {});
        assert.deepEqual(sanitizeSkills({ [LF]: Infinity }), {});
        assert.deepEqual(sanitizeSkills([3]), {});
        assert.deepEqual(sanitizeSkills(null), {});
    });
});

// ── The Thieve resolver ─────────────────────────────────────────────────────

describe('a clean lift counts; a noticed or failed one does not', () => {
    test('a clean coin lift counts once', () => {
        const g = thiefGame();
        g.lift(mark());
        assert.equal(g.gold, STEAL_BASE, 'fixture: the lift happened');
        assert.equal(g._robbed[`mark_${nextId - 1}`].noticed, false, 'fixture: it was clean');
        assert.deepEqual(g.skills, { [LF]: 1 });
    });

    test('a noticed lift does not count', () => {
        const g = thiefGame();
        const v = mark();
        g.lift(v);                                   // weight 2 of a 3 buffer: clean
        g.lift(v);                                   // 4 > 3: they feel it
        assert.equal(g._robbed[v.id].noticed, true, 'fixture: the second lift was noticed');
        assert.deepEqual(g.skills, { [LF]: 1 });
    });

    test('a lift from their flank that gets noticed does not count', () => {
        const g = thiefGame();
        verdict = VERDICT.PERIPHERAL;                // the buffer halves to 1
        const v = mark();
        g.lift(v);
        assert.equal(g._robbed[v.id].noticed, true, 'fixture: noticed');
        assert.deepEqual(g.skills, {});
    });

    test('an empty pocket counts for nothing', () => {
        const g = thiefGame();
        g.lift(mark(0));
        assert.deepEqual(g.skills, {});
    });

    test('a full bag counts for nothing', () => {
        const g = thiefGame();
        g._resolveItemDef = () => ({ id: 'soap', name: '[Soap]', baseValue: 15 });
        g._addToInventory = () => false;
        g.victims = [{ ...mark(), loadout: ['soap'] }];
        thieve.call(g, { resolver: 'thieveKit' }, { x: 1, y: 0 });
        assert.ok(g.logs.includes('[Your bag is full.]'), 'fixture: the bag was full');
        assert.deepEqual(g.skills, {});
    });

    test('a clean kit lift counts too', () => {
        const g = thiefGame();
        g._resolveItemDef = () => ({ id: 'soap', name: '[Soap]', baseValue: 15 });
        g.victims = [{ ...mark(), loadout: ['soap'] }];
        thieve.call(g, { resolver: 'thieveKit' }, { x: 1, y: 0 });
        assert.deepEqual(g.skills, { [LF]: 1 });
    });
});

describe('reaching a rank grants its perk', () => {
    test('the rank-up writes one log line, on the lift that reaches it', () => {
        const g = thiefGame();
        for (let i = 0; i < at(1) - 1; i++) g.lift(mark());
        assert.ok(!g.logs.includes('[TEXT]'));
        g.lift(mark());
        assert.equal(g.logs.filter(l => l === '[TEXT]').length, 1);
        g.lift(mark());
        assert.equal(g.logs.filter(l => l === '[TEXT]').length, 1, 'no line between ranks');
    });

    test('a rank lets you lift more from one pocket', () => {
        const g = thiefGame();
        const firstRankLimit = ranks[0].perk.stealLimit;
        assert.ok(firstRankLimit > 0, 'fixture: rank 1 raises the steal ceiling');
        for (let i = 0; i < at(1); i++) g.lift(mark());
        const before = g.gold;
        g.lift(mark());
        assert.equal(g.gold - before, STEAL_BASE + firstRankLimit);
    });

    test('the lift that reaches a rank is judged without it', () => {
        const g = thiefGame();
        for (let i = 0; i < at(1) - 1; i++) g.lift(mark());
        const before = g.gold;
        g.lift(mark());                              // this one reaches rank 1
        assert.equal(g.gold - before, STEAL_BASE);
    });

    test('a rank lets you take more before they notice', () => {
        const g = thiefGame();
        const k = ranks.findIndex(r => r.perk.noticeBuffer) + 1;
        assert.ok(k > 0, 'fixture: some rank grows the notice buffer');
        const before = noticeBuffer(g._theftPassives(), VERDICT.NONE);
        g.skills = { [LF]: at(k) };
        const after = noticeBuffer(g._theftPassives(), VERDICT.NONE);
        assert.equal(before, NOTICE_BASE);
        assert.equal(after, NOTICE_BASE + skillPerks({ [LF]: at(k) }).noticeBuffer);
    });

    test('ring passives and skill perks stack', () => {
        const g = thiefGame();
        g.ringMods = { stealLimit: 10 };
        g.skills = { [LF]: at(1) };
        assert.equal(stealLimit(g._theftPassives()), STEAL_BASE + 10 + ranks[0].perk.stealLimit);
        assert.deepEqual(g.ringMods, { stealLimit: 10 }, 'the ring bag is not written into');
    });
});

describe('ranks belong to you, not to what you wear', () => {
    test('slotting and unslotting rings keeps every rank and its perk', () => {
        const g = thiefGame();
        g.skills = { [LF]: at(2) };
        const perks = skillPerks(g.skills);
        g.ringTier = 1;
        acquireRing(g.ownedRings, g.ringSlots, g.ringTier, 'rat_ring');
        g._refreshGrantedSkills();
        assert.deepEqual(g.skills, { [LF]: at(2) });
        for (const [k, v] of Object.entries(perks)) assert.ok(g._theftPassives()[k] >= v, k);
        g.ringSlots = {};
        g._refreshGrantedSkills();
        assert.deepEqual(g._theftPassives(), perks);
    });
});

// ── The save ────────────────────────────────────────────────────────────────

function installGlobals() {
    const store = new Map();
    globalThis.localStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { store.set(k, String(v)); },
        removeItem: (k) => { store.delete(k); },
    };
}

function saveGame(over = {}) {
    const g = {
        turn: 0, rng: null, map: null, playerX: 1, playerY: 1,
        playerHp: 100, playerMaxHp: 100, playerMp: 100, playerMaxMp: 100,
        facing: 'down', gold: 0, carFuel: 'raw',
        equipment: { weapon: null, left: null, top: null, bottom: null, front: null, back: null, sides: null },
        tempEquips: [], buffs: [], inventory: [], selectedSlot: -1,
        groundItems: [], containers: [], enemies: [], _tileDiffs: [],
        questEngine: null, state: 'boot',
        _log() {}, _render() {},
        _resolveItemDef: () => null,
        async _loadMap(url, x, y) {
            this.map = { url, width: 20, height: 15, isInBounds: () => true };
            this.playerX = x ?? 1; this.playerY = y ?? 1;
        },
        setTile() {},
        ...over,
    };
    return g;
}

describe('ranks survive a save and load', () => {
    beforeEach(installGlobals);

    test('the record round-trips', async () => {
        const blob = serialize(saveGame({ skills: { [LF]: 9 } }));
        assert.deepEqual(blob.player.skills, { [LF]: 9 });
        const dst = saveGame();
        await loadInto(dst, JSON.parse(JSON.stringify(blob)));
        assert.deepEqual(dst.skills, { [LF]: 9 });
        assert.equal(rankOf(dst.skills, LF), rankOf({ [LF]: 9 }, LF));
    });

    test('an empty record is left out, so the save is what it was before skills', () => {
        assert.ok(!('skills' in serialize(saveGame({ skills: {} })).player));
        assert.ok(!('skills' in serialize(saveGame()).player));
    });

    test('a save from before skills loads with none', async () => {
        const blob = serialize(saveGame());
        const dst = saveGame({ skills: { [LF]: 4 } });
        await loadInto(dst, blob);
        assert.deepEqual(dst.skills, {});
    });

    test('a corrupt record is cleaned, never trusted', async () => {
        const blob = serialize(saveGame());
        blob.player.skills = { [LF]: -7, cooking: 3 };
        const dst = saveGame();
        await loadInto(dst, blob);
        assert.deepEqual(dst.skills, {});
        blob.player.skills = 'yes';
        await loadInto(dst, blob);
        assert.deepEqual(dst.skills, {});
        assert.doesNotThrow(() => migrate({ player: { skills: [1, 2] } }));
    });

    test('the loaded record is a copy, not the save blob', async () => {
        const blob = serialize(saveGame({ skills: { [LF]: 2 } }));
        const dst = saveGame();
        await loadInto(dst, blob);
        dst.skills[LF]++;
        assert.equal(blob.player.skills[LF], 2);
    });
});

// ── RESTART ─────────────────────────────────────────────────────────────────

describe('a new game starts every skill from nothing', () => {
    const STATE = { SPLASH: 'splash', IDLE: 'idle' };
    const fullReset = liveMethod('_fullReset({ seed } = {}) {', {
        STATE, PLAYER_MAX_HP, PLAYER_MAX_MP, WEAPONS, RNG, QuestEngine, clearSave: () => {},
        randomSeed, pickSlots,
    }, { async: true });

    test('the constructor starts with no skills', () => {
        assert.match(mainSrc.slice(mainSrc.indexOf('constructor() {'), mainSrc.indexOf('_fullReset({ seed }')),
            /this\.skills\s*=\s*\{\};/);
    });

    test('RESTART clears them', async () => {
        const g = thiefGame();
        Object.assign(g, {
            inventory: [], _closeOffer() {}, _startMainQuest() {},
            async _loadMap() {},
        });
        g.skills = { [LF]: at(2) };
        await fullReset.call(g, { seed: 1 });
        assert.deepEqual(g.skills, {});
    });
});
