// crat-reward.test.js — the Crat's reward (plans/cs2-crat-reward.md).
//
// Settling the Crat's dispute opens Carrion's blocked road: one saved flag, set
// once, and only by a ruling. Played through main.js's own _dialogueChoices and
// _pickDialogueChoice against a stand-in game, as tests/crat.test.js does.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { getDialogue, CRAT, CRAT_REWARD_FLAG, carrionRoadOpen } from '../game/dialogue.js';
import { transferGold } from '../game/trade.js';
import { applyDispositionDelta } from '../game/give-action.js';
import { QuestEngine } from '../game/quests.js';
import { resolveSpawn, defaultPicks } from '../game/slots.js';
import { spawnEnemy } from '../game/enemies.js';
import { GameMap } from '../game/map.js';

const room = JSON.parse(readFileSync(new URL('../game/sewer-north-map.json', import.meta.url), 'utf8'));

// ── main.js, lifted ─────────────────────────────────────────────────────────
const mainSrc = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
function liveMethod(signature, freeVars = {}) {
    const at = mainSrc.indexOf(signature, mainSrc.indexOf('class Game {'));
    assert.ok(at > 0, `${signature} not found in main.js`);
    const body = mainSrc.slice(at + signature.indexOf('('), mainSrc.indexOf('\n    }', at) + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
}
const hostileAt = Number(/const DIALOGUE_HOSTILE_AT = (-?\d+);/.exec(mainSrc)[1]);
const dialogueChoices = liveMethod('_dialogueChoices() {', { getDialogue });
const pickDialogueChoice = liveMethod('_pickDialogueChoice(choice) {', {
    getDialogue, transferGold, applyDispositionDelta, DIALOGUE_HOSTILE_AT: hostileAt,
    audio: { playSfx() {} },
});

const TALKERS = ['crat', 'crat-a', 'crat-b'].map(id => {
    const e = (room.enemies || []).map(s => spawnEnemy(resolveSpawn(s, defaultPicks()))).find(x => x.id === id);
    assert.ok(e, `${id} does not stand in the room`);
    return { id, dialogueId: e.dialogueId, gold: e.gold ?? 0, disposition: e.disposition ?? 0 };
});

// A stand-in game in the Crat's room. Every write to the reward flag is counted.
function inRoom() {
    const g = {
        gold: 0, inventory: [], log: [], rewardWrites: 0,
        _dialogueNpc: null, _dialogueReply: '', _dialogueCursor: 0,
        _render() {}, _closeDialogue() { this._dialogueNpc = null; }, _log(m) { this.log.push(m); },
        _onEntityHarmed() {}, emitGameEvent() {}, _removeFromSlot() {},
        _dialogueChoices: dialogueChoices, _pickDialogueChoice: pickDialogueChoice,
    };
    g.questEngine = new QuestEngine(g);
    g.questEngine.state.flags = new Proxy({}, {
        set(t, k, v) { if (k === CRAT_REWARD_FLAG) g.rewardWrites++; t[k] = v; return true; },
    });
    g.npcs = Object.fromEntries(TALKERS.map(e => [e.id, { ...e }]));
    return g;
}
const talkTo = (g, id) => { g._dialogueNpc = g.npcs[id]; g._dialogueCursor = 0; return g; };
const offered = (g, id) => talkTo(g, id)._dialogueChoices().map(c => c.id);
const pick = (g, id, choiceId) => {
    const c = talkTo(g, id)._dialogueChoices().find(x => x.id === choiceId);
    assert.ok(c, `${id} does not offer '${choiceId}' (offers: ${offered(g, id).join(', ')})`);
    g._pickDialogueChoice(c);
    return g._dialogueReply;
};
// Every choice everyone offers right now, picked once each — except a ruling.
const talkAround = (g) => {
    for (const id of ['crat', 'crat-a', 'crat-b']) {
        for (const c of offered(g, id)) if (!c.startsWith('rule_') && c !== 'offer') pick(g, id, c);
    }
    return g;
};
const hearBoth = (g) => { pick(g, 'crat-a', 'testify'); pick(g, 'crat-b', 'testify'); return g; };

describe('no reward before a ruling', () => {
    test('a fresh game has no reward', () => {
        assert.equal(carrionRoadOpen(inRoom()), false);
    });

    test('hearing both sides, asking around and taking a bribe earn nothing', () => {
        const g = inRoom();
        talkAround(g);   // hears both sides out, among the rest
        assert.ok(g.questEngine.state.flags.cratHeardA && g.questEngine.state.flags.cratHeardB);
        talkAround(g);
        pick(g, 'crat-a', 'offer');
        talkAround(g);
        assert.ok(offered(g, 'crat').some(c => c.startsWith('rule_')), 'the ruling should still be open');
        assert.equal(carrionRoadOpen(g), false);
        assert.equal(g.rewardWrites, 0);
    });
});

describe('settling the dispute opens Carrion\'s road, once', () => {
    // Every ruling there is: for either side, unbought or paid by either side.
    const ways = [];
    for (const side of CRAT.sides) {
        ways.push({ side, paidBy: null });
        for (const paidBy of CRAT.sides) ways.push({ side, paidBy });
    }

    for (const { side, paidBy } of ways) {
        const id = `rule_${side}${paidBy ? '_paid_' + paidBy : ''}`;
        test(`${id} gives the reward`, () => {
            const g = hearBoth(inRoom());
            if (paidBy) pick(g, `crat-${paidBy}`, 'offer');
            assert.equal(carrionRoadOpen(g), false);
            pick(g, 'crat', id);
            assert.equal(carrionRoadOpen(g), true);
            assert.equal(g.rewardWrites, 1);
        });
    }

    test('it is given once: nothing after the ruling gives it again', () => {
        const g = hearBoth(inRoom());
        pick(g, 'crat', `rule_${CRAT.trueSide}`);
        talkAround(g);
        talkAround(g);
        assert.ok(!offered(g, 'crat').some(c => c.startsWith('rule_')), 'a second ruling is on offer');
        assert.equal(carrionRoadOpen(g), true);
        assert.equal(g.rewardWrites, 1);
    });

    test('the reward survives a save, and a reload does not give it twice', () => {
        const g = hearBoth(inRoom());
        pick(g, 'crat', 'rule_b');
        const blob = JSON.parse(JSON.stringify(g.questEngine.serialize()));
        const back = { _render() {}, _log() {} };
        back.questEngine = new QuestEngine(back);
        back.questEngine.restore(blob);
        assert.equal(carrionRoadOpen(back), true);
        assert.equal(blob.flags[CRAT_REWARD_FLAG], true);
    });
});

// ── the road: a wall opens in the Sewer, on every load, from the saved flag ──
const mapData = (f) => JSON.parse(readFileSync(new URL(`../game/${f}`, import.meta.url), 'utf8'));
const openRoad = liveMethod('_openCarrionRoadIfRuled() {');
const setTile = liveMethod('setTile(x, y, id) {');

// A stand-in game that has just loaded `file`, the way _loadMap leaves it.
function loaded(file, flags = {}) {
    const g = { _tileDiffs: [], questEngine: { getFlag: (k) => flags[k] }, setTile, _openCarrionRoadIfRuled: openRoad };
    g.map = new GameMap(mapData(file), file);
    g._openCarrionRoadIfRuled();
    return g;
}
const WALL = { x: 9, y: 19 };

describe("Carrion's road", () => {
    test('before a ruling the wall stays shut and the Sewer has no way south', () => {
        const g = loaded('sewer-map.json');
        assert.equal(g.map.isWalkable(WALL.x, WALL.y), false);
        assert.ok(!g.map.transitions.some(t => t.toMap === 'carrion-room-map.json'));
    });

    test('after a ruling the wall opens onto the new room, on every load', () => {
        for (let i = 0; i < 2; i++) {   // a second load is a reload / CONTINUE
            const g = loaded('sewer-map.json', { [CRAT_REWARD_FLAG]: true });
            assert.equal(g.map.isWalkable(WALL.x, WALL.y), true);
            const doors = g.map.transitions.filter(t => t.toMap === 'carrion-room-map.json');
            assert.equal(doors.length, 1);
            assert.deepEqual([doors[0].x, doors[0].y], [WALL.x, WALL.y]);
        }
    });

    test('the opening has floor above it, and Carrion is not in it', () => {
        const g = loaded('sewer-map.json', { [CRAT_REWARD_FLAG]: true });
        assert.ok(g.map.isWalkable(WALL.x, WALL.y - 1));
        assert.ok(!g.map.enemySpawns.some(e => e.x === WALL.x && e.y === WALL.y));
    });

    test('other maps are left alone even with the flag set', () => {
        const g = loaded('sewer-north-map.json', { [CRAT_REWARD_FLAG]: true });
        assert.ok(!g.map.transitions.some(t => t.toMap === 'carrion-room-map.json'));
    });

    test('the new room ends in a sign and a way back, and its door lands on its floor', () => {
        const r = mapData('carrion-room-map.json');
        const g = loaded('sewer-map.json', { [CRAT_REWARD_FLAG]: true });
        const door = g.map.transitions.find(t => t.toMap === 'carrion-room-map.json');
        const room2 = new GameMap(r, 'carrion-room-map.json');
        assert.ok(room2.isWalkable(door.toX, door.toY), 'the door lands in a wall');
        const sign = r.examinables.find(e => e.id === 'carrion_road_sign');
        assert.ok(sign && room2.isWalkable(sign.x, sign.y), 'the sign is missing or in a wall');
        assert.match(sign.text, /^\[TEXT/);
        const back = r.transitions.find(t => t.toMap === 'sewer-map.json');
        assert.ok(back, 'no way back');
        assert.ok(g.map.isWalkable(back.toX, back.toY), 'the way back lands in a wall');
        assert.equal(r.zoneName, 'SEWER');
    });
});
