// hypno-vision.test.js — HV1: the Factory's Hypno Vision (plans/hv1-hypno-vision-factory.md).
//
// In its range and sight, one worker or robot turns every 3 committed actions. Out of range or
// sight none does, and a menu (no committed action) turns nobody. The nerd's choice or his
// knock-out switches it off: those turned go neutral, no more turn, a reload keeps it off.
// hypno-vision.js holds the rules; these run them on the real map, the real spawns and the real
// save.js.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GameMap } from '../game/map.js';
import { spawnEnemy } from '../game/enemies.js';
import { isHostile } from '../game/ai.js';
import { resolveSpawn, ENTRIES } from '../game/slots.js';
import { ENEMY_SPRITES } from '../game/sprites.js';
import { DIALOGUES, getDialogue } from '../game/dialogue.js';
import { serialize, loadInto } from '../game/save.js';
import { QuestEngine } from '../game/quests.js';
import {
    TV, RANGE, TURN_EVERY, TARGET_TAG, NERD_TAG, OFF_FLAG, LINES, SCREEN_EXAMINE,
    inSight, nextTarget, hypnoBeat, switchOff, hypnoOnDeath, applyHypno, isOff,
} from '../game/hypno-vision.js';

const GAME_DIR = new URL('../game/', import.meta.url);
const readJson = (f) => JSON.parse(readFileSync(new URL(f, GAME_DIR), 'utf8'));
const mainSrc = readFileSync(fileURLToPath(new URL('main.js', GAME_DIR)), 'utf8');

function standIn() {
    const g = {
        state: 'idle', logs: [], enemies: [], _tileDiffs: [], examinables: [], _pendingTransition: null,
        map: null, _mapUrl: null, turn: 0, rng: null,
        playerX: 0, playerY: 0, playerHp: 100, playerMaxHp: 100, playerMp: 100, playerMaxMp: 100,
        facing: 'down', gold: 0, _lastDefeatedBy: null,
        equipment: { weapon: null, left: null, top: null, bottom: null, front: null, back: null, sides: null },
        tempEquips: [], buffs: [], inventory: [], groundItems: [], containers: [],
        _log(m) { this.logs.push(m); },
        _render() {},
        _resolveItemDef: () => null,
        setTile(x, y, id) { this.map.tiles[y * this.map.width + x] = id; },
        async _loadMap(url, x, y) {
            this.map = new GameMap(readJson(url), url);
            this._mapUrl = url;
            this._tileDiffs = [];
            this.enemies = this.map.enemySpawns.map(s => spawnEnemy(resolveSpawn(s, {})));
            this.examinables = this.map.examinableSpawns.map(e => ({ ...e }));
            this.playerX = x ?? this.map.spawn.x;
            this.playerY = y ?? this.map.spawn.y;
            applyHypno(this);
        },
    };
    g.questEngine = new QuestEngine(g);
    return g;
}

async function factory(x, y) {
    const g = standIn();
    await g._loadMap('factory-map.json', x, y);
    g.logs.length = 0;
    return g;
}

const IN_SIGHT = [16, 3];   // two tiles below the screen
const OUT_OF_RANGE = [26, 14];   // the Factory's entrance
const targets = (g) => g.enemies.filter(e => e.tag === TARGET_TAG);
const turned = (g) => targets(g).filter(isHostile);
const beats = (g, n) => { for (let i = 0; i < n; i++) hypnoBeat(g); };
const standAt = (g, [x, y]) => { g.playerX = x; g.playerY = y; };

describe('the rules', () => {
    test('6 tiles and 3 actions', () => {
        assert.equal(RANGE, 6);
        assert.equal(TURN_EVERY, 3);
        assert.deepEqual(TV, { x: 16, y: 1 });
    });

    test('sight is range and a clear line', async () => {
        const g = await factory();
        assert.ok(inSight(g, 16, 3));
        assert.ok(inSight(g, 16, 7), 'six tiles down the open column');
        assert.ok(!inSight(g, 16, 8), 'seven tiles is out of range');
        assert.ok(!inSight(g, 10, 4), 'a wall between');
        assert.ok(!inSight(g, 26, 14));
    });
});

describe('the map and its cast', () => {
    test('two workers and a robot, neutral, in the screen\'s sight; the nerd is in the alcove', async () => {
        const g = await factory();
        const ts = targets(g);
        assert.deepEqual(ts.map(e => e.name), ['[Worker]', '[Worker]', '[Robot]']);
        for (const e of ts) {
            assert.equal(e.allegiance, 'neutral');
            assert.ok(inSight(g, e.x, e.y), `${e.id} is out of the screen's sight`);
        }
        const nerd = g.enemies.find(e => e.tag === NERD_TAG);
        assert.equal(nerd.name, '[Nerd]');
        assert.equal(nerd.damage, 0);
        assert.equal(nerd.dialogueId, 'hypno_nerd');
    });

    test('stand-in numbers: workers on the Skeleton, the robot on the Green', () => {
        const sk = ENTRIES.carnival_horse;
        for (const k of ['gold', 'loadout', 'hp', 'armor', 'damage']) assert.deepEqual(ENTRIES.factory_worker[k], sk[k], k);
        const green = readJson('factory-map.json').enemies.find(e => e.id === 'green1');
        assert.equal(ENTRIES.factory_robot.type, 'Greedy Green', 'the Green look');
        for (const k of ['gold', 'loadout', 'hp', 'armor', 'damage']) assert.deepEqual(ENTRIES.factory_robot[k], green[k], k);
        assert.ok(ENEMY_SPRITES[ENTRIES.factory_worker.type], 'the worker has art');
    });

    test('the nerd\'s alcove has one gap, at (17,26)', async () => {
        const g = await factory();
        const open = [];
        for (let x = 14; x <= 19; x++) if (g.map.isWalkable(x, 26)) open.push(x);
        assert.deepEqual(open, [17]);
        for (let x = 14; x <= 19; x++) assert.ok(g.map.isWalkable(x, 27), `(${x},27) is alcove floor`);
        // reachable from the Factory floor through the gap
        assert.ok(g.map.isWalkable(17, 25));
    });

    test('the screen is drawn at (16,1) and answers Examine', async () => {
        const g = await factory();
        assert.ok(g.map.propSpawns.some(p => p.x === 16 && p.y === 1), 'no prop at (16,1)');
        const ex = g.examinables.find(e => e.x === 16 && e.y === 1);
        assert.equal(ex.text, SCREEN_EXAMINE.text);
        assert.ok(ex.text.includes('Hypno Vision'));
        await g._loadMap('factory-map.json');   // a second load adds nothing
        assert.equal(g.examinables.filter(e => e.x === 16 && e.y === 1).length, 1);
        assert.equal(g.map.propSpawns.filter(p => p.x === 16 && p.y === 1).length, 1);
    });

    test('the Factory Manager, Puck and the Greedy Green are untouched by it', async () => {
        const g = await factory();
        for (const id of ['factory-manager', 'puck', 'green1']) {
            const e = g.enemies.find(x => x.id === id);
            assert.ok(e, id);
            assert.notEqual(e.tag, TARGET_TAG);
            assert.notEqual(e.tag, NERD_TAG);
        }
        standAt(g, IN_SIGHT);
        beats(g, 30);
        for (const id of ['factory-manager', 'puck']) assert.ok(!isHostile(g.enemies.find(x => x.id === id)), id);
        assert.ok(!isHostile(g.enemies.find(x => x.id === 'puck')));
        assert.ok(g.logs.every(l => !l.includes('Manager') && !l.includes('Puck')));
    });
});

describe('it turns one every 3 committed actions in its sight', () => {
    test('one at the 3rd, a second at the 6th, the last at the 9th, then no more', async () => {
        const g = await factory(...IN_SIGHT);
        beats(g, 2);
        assert.equal(turned(g).length, 0);
        beats(g, 1);
        assert.equal(turned(g).length, 1);
        beats(g, 3);
        assert.equal(turned(g).length, 2);
        beats(g, 3);
        assert.equal(turned(g).length, 3);
        beats(g, 12);
        assert.equal(turned(g).length, 3);
        assert.equal(g.logs.filter(l => l.startsWith('[The Hypno Vision turns')).length, 3);
    });

    test('a turned one is on the chase, with its mood to match', async () => {
        const g = await factory(...IN_SIGHT);
        beats(g, 3);
        const [e] = turned(g);
        assert.equal(e.fsmState, 'HOSTILE');
        assert.equal(e.state, 'chasing');
        assert.ok(e.disposition <= -50);
        assert.equal(g.logs[0], LINES.turn(e.name));
    });

    test('out of its range, none turns', async () => {
        const g = await factory(...OUT_OF_RANGE);
        beats(g, 60);
        assert.equal(turned(g).length, 0);
        assert.deepEqual(g.logs, []);
    });

    test('in range but with a wall in the way, none turns', async () => {
        const g = await factory(10, 4);
        assert.ok(!inSight(g, 10, 4));
        beats(g, 60);
        assert.equal(turned(g).length, 0);
    });

    test('stepping out of sight starts the count over', async () => {
        const g = await factory(...IN_SIGHT);
        beats(g, 2);
        standAt(g, OUT_OF_RANGE);
        beats(g, 1);
        standAt(g, IN_SIGHT);
        beats(g, 2);
        assert.equal(turned(g).length, 0, 'the earlier two actions still counted');
        beats(g, 1);
        assert.equal(turned(g).length, 1);
    });

    test('a target out of its sight is passed over; the next in sight turns', async () => {
        const g = await factory(...IN_SIGHT);
        const first = targets(g)[0];
        first.x = 10; first.y = 4;   // behind a wall
        beats(g, 3);
        const t = turned(g);
        assert.equal(t.length, 1);
        assert.notEqual(t[0], first);
        assert.equal(nextTarget(g) === first, false);
    });

    test('a map that is not the Factory never turns anyone', async () => {
        const g = await factory(...IN_SIGHT);
        g._mapUrl = 'town-map.json';
        beats(g, 30);
        assert.equal(turned(g).length, 0);
    });

    test('standing still at a menu turns nobody: only committed actions call the beat', () => {
        const calls = [...mainSrc.matchAll(/this\._hypnoBeat\?\.\(\)/g)];
        assert.equal(calls.length, 1, 'the beat is called from one seam');
        const at = calls[0].index;
        const before = mainSrc.slice(0, at);
        const fn = before.lastIndexOf('\n    _advanceWorldOnce(') >= 0 ? '_advanceWorldOnce' : null;
        assert.equal(fn, '_advanceWorldOnce', 'called outside the committed-action step');
        const between = mainSrc.slice(before.lastIndexOf('\n    _advanceWorldOnce('), at);
        assert.ok(between.includes('this._worldBeat('), 'it follows the world beat');
        assert.ok(!between.includes('\n    }\n'), 'it sits inside that one method');
    });
});

describe('switching it off', () => {
    async function allTurned() {
        const g = await factory(...IN_SIGHT);
        beats(g, 9);
        assert.equal(turned(g).length, 3);
        g.logs.length = 0;
        return g;
    }
    const nerdChoice = () => DIALOGUES.hypno_nerd.choices.find(c => c.id === 'switch_off');

    test('the nerd\'s dialogue choice switches it off and calms those it turned', async () => {
        const g = await allTurned();
        const c = nerdChoice();
        assert.ok(c.available(g));
        c.onPick(g);
        assert.ok(isOff(g));
        assert.equal(g.questEngine.state.flags[OFF_FLAG], true);
        for (const e of targets(g)) {
            assert.equal(e.allegiance, 'neutral');
            assert.equal(e.fsmState, 'IDLE');
            assert.equal(e.state, 'idle');
            assert.equal(e.disposition, 0);
        }
        assert.deepEqual(g.logs, [LINES.off]);
        assert.ok(!c.available(g), 'the choice is gone once it is off');
        assert.ok(DIALOGUES.hypno_nerd.choices.find(x => x.id === 'status').available(g));
    });

    test('his greeting says which it is', async () => {
        const g = await factory();
        const on = getDialogue('hypno_nerd', g).greeting;
        switchOff(g);
        assert.notEqual(getDialogue('hypno_nerd', g).greeting, on);
    });

    test('no more turn once it is off, in or out of sight', async () => {
        const g = await factory(...IN_SIGHT);
        beats(g, 3);
        assert.equal(turned(g).length, 1);
        switchOff(g);
        beats(g, 30);
        assert.equal(turned(g).length, 0);
        assert.equal(g.logs.filter(l => l.startsWith('[The Hypno Vision turns')).length, 1);
    });

    test('knocking the nerd out does the same', async () => {
        const g = await allTurned();
        const nerd = g.enemies.find(e => e.tag === NERD_TAG);
        assert.equal(hypnoOnDeath(g, targets(g)[0]), false, 'a worker falling is not the nerd');
        assert.ok(!isOff(g));
        nerd.entity.hp = 0;
        assert.equal(hypnoOnDeath(g, nerd), true);
        assert.ok(isOff(g));
        assert.equal(turned(g).length, 0);
        beats(g, 30);
        assert.equal(turned(g).length, 0);
    });

    test('main.js tells the Hypno Vision about every death, load and committed action', () => {
        assert.match(mainSrc, /_hypnoOnDeath\?\.\(enemyObj\)/);
        assert.match(mainSrc, /_applyHypno\?\.\(\)/);
        assert.match(mainSrc, /_hypnoBeat\(\) \{ return hypnoBeat\(this\); \}/);
    });

    test('switching off twice does nothing the second time', async () => {
        const g = await factory();
        assert.equal(switchOff(g), true);
        g.logs.length = 0;
        assert.equal(switchOff(g), false);
        assert.deepEqual(g.logs, []);
    });
});

describe('a reload keeps it off', () => {
    async function reload(g) {
        const next = standIn();
        await loadInto(next, JSON.parse(JSON.stringify(serialize(g))));
        return next;
    }

    test('off by the nerd\'s choice: the flag, the calm and the silence all come back', async () => {
        const g = await factory(...IN_SIGHT);
        beats(g, 6);
        switchOff(g);
        const n = await reload(g);
        assert.ok(isOff(n));
        assert.equal(turned(n).length, 0);
        n.logs.length = 0;
        beats(n, 30);
        assert.equal(turned(n).length, 0);
        assert.deepEqual(n.logs, []);
    });

    test('off by knocking him out: the same, and the nerd stays down', async () => {
        const g = await factory(...IN_SIGHT);
        beats(g, 3);
        const nerd = g.enemies.find(e => e.tag === NERD_TAG);
        nerd.entity.hp = 0; nerd.entity.alive = false;
        hypnoOnDeath(g, nerd);
        const n = await reload(g);
        assert.ok(isOff(n));
        assert.equal(turned(n).length, 0);
        beats(n, 30);
        assert.equal(turned(n).length, 0);
    });

    test('still on: a reload keeps the one it turned hostile and the others neutral', async () => {
        const g = await factory(...IN_SIGHT);
        beats(g, 3);
        const n = await reload(g);
        assert.ok(!isOff(n));
        assert.equal(turned(n).length, 1);
        assert.equal(targets(n).length, 3);
    });
});
