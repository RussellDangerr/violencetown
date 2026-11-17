// compactor.test.js — TC1: the trash compactor room (plans/tc1-trash-compactor-walls.md).
//
// Step in and the door shuts. The walls close one column from each side every 4 committed
// actions and the 5th step crushes you; breaking the compactor stops them and opens the door; a
// reload keeps them where they were; the retry finds the room open again. compactor.js holds the
// rules; these tests run them on the real map, the real spawn and the real save.js.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GameMap } from '../game/map.js';
import { Enemy, spawnEnemy, resolveEnemyTurns } from '../game/enemies.js';
import { isHostile } from '../game/ai.js';
import { struck } from '../game/perception.js';
import { resolveSpawn, ENTRIES } from '../game/slots.js';
import { ENEMY_SPRITES } from '../game/sprites.js';
import { WORLD_ZONES, zoneByName, overworldZone, connectorPairs } from '../game/world-map.js';
import { serialize, loadInto } from '../game/save.js';
import { QuestEngine } from '../game/quests.js';
import {
    COMPACTOR_MAP, COMPACTOR_TAG, STEP_EVERY, CRUSH_STEPS, DOOR, DOOR_BACK, FLOOR, WALL, LINES,
    newCompactor, sanitizeCompactor, compactorEntry, stepsAt, closedColumns,
    applyCompactor, compactorBeat, breakCompactor, resetCompactor, isCompactor,
} from '../game/compactor.js';

const GAME_DIR = new URL('../game/', import.meta.url);
const readJson = (f) => JSON.parse(readFileSync(new URL(f, GAME_DIR), 'utf8'));
const mainSrc = readFileSync(fileURLToPath(new URL('main.js', GAME_DIR)), 'utf8');

// ── A stand-in game: the real map, the real spawn, the real setTile, and the seams main.js has ──

const W = 11, H = 9;

function methodBody(name) {
    const at = mainSrc.search(new RegExp(`\\n    (async )?${name}\\(`));
    assert.ok(at > 0, `${name} not found in main.js`);
    const end = mainSrc.indexOf('\n    }', at + 1);
    return mainSrc.slice(at, end + '\n    }'.length);
}
// The real setTile, lifted out of main.js, so the diffs a save keeps are the ones the game makes.
const setTile = new Function(`'use strict'; return function ${methodBody('setTile').replace(/^\s*setTile/, 'setTile')}`)();

function standIn() {
    const g = {
        state: 'idle', logs: [], enemies: [], _tileDiffs: [], died: 0, _pendingTransition: null,
        map: null, _mapUrl: null, turn: 0, rng: null,
        playerX: 0, playerY: 0, playerHp: 100, playerMaxHp: 100, playerMp: 100, playerMaxMp: 100,
        facing: 'down', gold: 0, _lastDefeatedBy: null,
        equipment: { weapon: null, left: null, top: null, bottom: null, front: null, back: null, sides: null },
        tempEquips: [], buffs: [], inventory: [], groundItems: [], containers: [],
        _sewerEscape: null, _compactor: null,
        _log(m) { this.logs.push(m); },
        _die() { this.died++; this.state = 'dead'; },
        _render() {},
        _resolveItemDef: () => null,
        setTile,
        _applyCompactor() { applyCompactor(this); },
        // What _loadMap does for this room: a fresh map, its spawns, then the room from its state.
        async _loadMap(url, x, y) {
            this.map = new GameMap(readJson(url), url);
            this._mapUrl = url;
            this._tileDiffs = [];
            this.enemies = this.map.enemySpawns.map(s => spawnEnemy(resolveSpawn(s, {})));
            this.playerX = x ?? this.map.spawn.x;
            this.playerY = y ?? this.map.spawn.y;
            this._applyCompactor();
        },
    };
    g.questEngine = new QuestEngine(g);
    return g;
}

async function inRoom() {
    const g = standIn();
    await g._loadMap('factory-map.json', 4, 27);
    g.logs.length = 0;
    await g._loadMap(COMPACTOR_MAP);   // what walking through the Factory's door does
    return g;
}

const beats = (g, n) => { for (let i = 0; i < n; i++) if (compactorBeat(g)) return true; return false; };
const wallCols = (g) => {
    const cols = [];
    for (let x = 0; x < W; x++) if (g.map.getTile(x, 3) === WALL) cols.push(x);
    return cols;
};
const doorShut = (g) => g.map.getTile(DOOR.x, DOOR.y) === WALL && !g.map.transitions.some(t => t.x === DOOR.x && t.y === DOOR.y);
const doorOpen = (g) => g.map.getTile(DOOR.x, DOOR.y) === FLOOR && g.map.transitions.some(t => t.x === DOOR.x && t.y === DOOR.y);
const machine = (g) => g.enemies.find(e => e.tag === COMPACTOR_TAG);

// ── The pure rules ──

describe('the compactor rules', () => {
    test('a wall step every 4 actions, five steps, the fifth crushes', () => {
        assert.equal(STEP_EVERY, 4);
        assert.equal(CRUSH_STEPS, 5);
        assert.deepEqual([0, 3, 4, 7, 8, 12, 16, 19, 20, 40].map(stepsAt), [0, 0, 1, 1, 2, 3, 4, 4, 5, 5]);
    });

    test('the walls close from both sides and leave one column of an 11-column room', () => {
        assert.deepEqual(closedColumns(0, 11), []);
        assert.deepEqual(closedColumns(1, 11).sort((a, b) => a - b), [0, 10]);
        assert.deepEqual(closedColumns(4, 11).sort((a, b) => a - b), [0, 1, 2, 3, 7, 8, 9, 10]);
        const left = [0, 1, 2, 3, 4, 5].map(s => 11 - closedColumns(s, 11).length);
        assert.deepEqual(left, [11, 9, 7, 5, 3, 1]);
    });

    test('a saved state is made safe, and a room as new saves nothing', () => {
        assert.deepEqual(sanitizeCompactor(null), newCompactor());
        assert.deepEqual(sanitizeCompactor('x'), newCompactor());
        assert.deepEqual(sanitizeCompactor({ armed: 'yes', actions: -4, broken: 1 }), newCompactor());
        assert.equal(sanitizeCompactor({ actions: 400 }).actions, CRUSH_STEPS * STEP_EVERY - 1);
        assert.deepEqual(compactorEntry(null), {});
        assert.deepEqual(compactorEntry(newCompactor()), {});
        assert.deepEqual(compactorEntry({ armed: true, actions: 6, broken: false }), { compactor: { armed: true, actions: 6, broken: false } });
        assert.deepEqual(compactorEntry({ armed: true, actions: 6, broken: true }).compactor.broken, true);
    });

    test('only the compactor is the compactor', () => {
        assert.ok(isCompactor({ tag: COMPACTOR_TAG }));
        assert.ok(!isCompactor({ tag: 'wererat_boss' }));
        assert.ok(!isCompactor(null));
    });
});

// ── The map, the door and the machine ──

describe('the room and its door', () => {
    const room = readJson(COMPACTOR_MAP);
    const factory = readJson('factory-map.json');

    test('the Factory has a door at (4,28) into the room, landing on open floor inside it', () => {
        const fm = new GameMap(factory, 'factory-map.json');
        const door = fm.getTransition(4, 28);
        assert.ok(door, 'no door at the Factory (4,28)');
        assert.equal(door.toMap, COMPACTOR_MAP);
        const rm = new GameMap(room, COMPACTOR_MAP);
        assert.ok(rm.isWalkable(door.toX, door.toY));
        assert.equal(rm.getTransition(door.toX, door.toY), null, 'the landing is on a door, which would bounce you straight back');
        assert.ok(fm.isWalkable(4, 27), 'nothing to stand on in front of the door');
    });

    test('the room is 11 columns wide and its door leads back to open Factory floor', () => {
        assert.equal(room.width, 11);
        assert.equal(room.height, H);
        assert.deepEqual(room.transitions, [DOOR_BACK]);
        const fm = new GameMap(factory, 'factory-map.json');
        assert.ok(fm.isWalkable(DOOR_BACK.toX, DOOR_BACK.toY));
        assert.equal(fm.getTransition(DOOR_BACK.toX, DOOR_BACK.toY), null);
    });

    test('the walls only ever stand on floor columns of the room, never on the door row', () => {
        const rm = new GameMap(room, COMPACTOR_MAP);
        for (let x = 0; x < W; x++) for (let y = 1; y < H - 1; y++) assert.ok(rm.isWalkable(x, y), `(${x},${y}) is not floor`);
        assert.ok(rm.isWalkable(DOOR.x, DOOR.y));
    });

    test('the compactor stands in the middle, armour 6, damage 0, 100 HP, and never moves or hunts', () => {
        const spawn = room.enemies.find(e => e.entry === 'compactor');
        assert.ok(spawn && spawn.x === 5, 'no compactor in the middle column');
        const e = spawnEnemy(resolveSpawn(spawn, {}));
        assert.ok(e instanceof Enemy);
        assert.equal(e.tag, COMPACTOR_TAG);
        assert.equal(e.entity.maxHp, 100);
        assert.equal(e.entity.armor, 6);
        assert.equal(e.damage, 0);
        assert.equal(e.sightRange, 0, 'it could see you, and hunt');
        assert.equal(e.heavy, true);
        assert.equal(ENTRIES.compactor.tag, COMPACTOR_TAG);
        assert.ok(ENEMY_SPRITES[ENTRIES.compactor.type], 'the compactor has no art');
    });

    test('the room is a box on the Map tab, joined to the Factory', () => {
        const z = zoneByName(room.zoneName);
        assert.ok(z, `no map box for ${room.zoneName}`);
        assert.equal(overworldZone(room.zoneName), z.zoneName);
        assert.ok(zoneByName('FACTORY').connects.includes(z.zoneName));
        assert.ok(z.connects.includes('FACTORY'));
        assert.ok(connectorPairs().some(p => p.includes(z.zoneName) && p.includes('FACTORY')));
        const cells = WORLD_ZONES.map(w => `${w.col},${w.row}`);
        assert.equal(new Set(cells).size, cells.length, 'two boxes share a cell');
    });

    test('main.js names the room for the Continue line and calls the room at its seams', () => {
        assert.match(mainSrc, /'compactor-map\.json': '\[COMPACTOR ROOM\]'/);
        const loadMap = methodBody('_loadMap');
        assert.match(loadMap, /this\._applyCompactor\?\.\(\)/);
        const beat = methodBody('_advanceWorldOnce');
        assert.match(beat, /_worldBeat\([^)]*\)[\s\S]*if \(this\._compactorBeat\?\.\(\)\) return;/);
        assert.match(methodBody('_handleEnemyDeath'), /this\._breakCompactor\?\.\(enemyObj\)/);
        assert.match(methodBody('_resolveDefeat'), /this\._resetCompactor\?\.\(\)/);
        assert.match(methodBody('_onEntityHarmed'), /this\._isCompactor\?\.\(target\)\) return/);
    });
});

// ── The fight ──

describe('stepping in', () => {
    test('the door shuts behind you with a line, and stays shut', async () => {
        const g = await inRoom();
        assert.ok(doorShut(g));
        assert.ok(g._compactor.armed);
        assert.deepEqual(g.logs, [LINES.shut]);
        assert.deepEqual(wallCols(g), []);
        assert.ok(machine(g), 'no compactor in the room');
    });

    test('the Factory side is untouched: its door is open before you go in', async () => {
        const g = standIn();
        await g._loadMap('factory-map.json', 4, 27);
        assert.deepEqual(g.logs, []);
        assert.ok(g.map.getTransition(4, 28));
        assert.equal(g._compactor, null);
    });
});

describe('the walls step every 4 committed actions', () => {
    test('nothing moves for 3 actions, then a column from each side at the 4th', async () => {
        const g = await inRoom();
        beats(g, 3);
        assert.deepEqual(wallCols(g), []);
        beats(g, 1);
        assert.deepEqual(wallCols(g), [0, 10]);
        beats(g, 3);
        assert.deepEqual(wallCols(g), [0, 10]);
        beats(g, 1);
        assert.deepEqual(wallCols(g), [0, 1, 9, 10]);
    });

    test('actions 0, 12 and 20: open, three steps in, crushed', async () => {
        const g = await inRoom();
        assert.deepEqual(wallCols(g), []);
        beats(g, 12);
        assert.deepEqual(wallCols(g), [0, 1, 2, 8, 9, 10]);
        assert.equal(g.died, 0);
        beats(g, 7);
        assert.deepEqual(wallCols(g), [0, 1, 2, 3, 7, 8, 9, 10]);
        assert.equal(g.died, 0, 'died before action 20');
        assert.equal(compactorBeat(g), true);
        assert.deepEqual(wallCols(g), [0, 1, 2, 3, 4, 6, 7, 8, 9, 10], 'one column should be left');
        assert.equal(g._compactor.actions, 20);
        assert.equal(g.died, 1);
        assert.equal(g.playerHp, 0);
        assert.deepEqual(g._lastDefeatedBy, { cause: 'crushed' });
        assert.equal(g.logs.at(-1), LINES.crush);
    });

    test('a step that leaves by the door, another map and a broken room count nothing', async () => {
        const g = await inRoom();
        g._pendingTransition = { toMap: 'factory-map.json' };
        beats(g, 30);
        assert.equal(g._compactor.actions, 0);
        g._pendingTransition = null;

        const f = standIn();
        await f._loadMap('factory-map.json', 4, 27);
        for (let i = 0; i < 30; i++) compactorBeat(f);
        assert.equal(f._compactor, null);
        assert.equal(f.died, 0);

        const b = await inRoom();
        breakCompactor(b, machine(b));
        beats(b, 30);
        assert.equal(b._compactor.actions, 0);
        assert.equal(b.died, 0);
    });

    test('turning in place, the wheel and the menus never reach the beat; a step and a wait do', () => {
        // Turning in place: the pivot of _beginMoveOrTurn takes no step and calls no world beat.
        const free = { setTimeout: () => 0 };
        const lift = (name, params, vars = {}) => {
            const body = methodBody(name).replace(new RegExp(`^\\s*(async )?${name}`), '');
            const names = Object.keys({ ...free, ...vars });
            return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => ({ ...free, ...vars })[n]));
        };
        const calls = { world: 0, moves: [] };
        const me = {
            facing: 'left', _animating: false, _clearTurnTimer() {}, _render() {}, _TURN_MS: 70, _turnTimer: null,
            _advanceWorld() { calls.world++; }, _doMove(d) { calls.moves.push(d); },
        };
        me._faceOf = lift('_faceOf', 'dir');
        me._beginMoveOrTurn = lift('_beginMoveOrTurn', 'dir');
        me._beginMoveOrTurn({ dx: 0, dy: -1 });
        assert.equal(me.facing, 'up', 'did not turn');
        assert.equal(calls.world, 0, 'turning in place wound the world');
        assert.deepEqual(calls.moves, [], 'turning in place stepped');

        // The one door into the compactor's count is _advanceWorldOnce, which _advanceWorld runs.
        const pace = (name) => methodBody(name);
        for (const open of ['_wheelOpenerDown', '_openDevice', '_openLogModal', '_openJournal', '_openWorldMap', '_openEquipmentScreen', '_setPaused', '_openOffer', '_openDialogue']) {
            assert.doesNotMatch(pace(open), /_advanceWorld/, `${open} winds the world`);
        }
        assert.match(pace('_waitTurn'), /_advanceWorld\(\)/, 'waiting a turn is a committed action');
        assert.match(pace('_advanceWorld'), /this\._advanceWorldOnce\(\)/);
        assert.equal((mainSrc.match(/_compactorBeat\?\.\(\)/g) || []).length, 1, 'the beat has more than one home');
    });
});

describe('the walls shove you inward, and the last step crushes you', () => {
    test('a step onto your column moves you to the first open one, on the same row', async () => {
        const g = await inRoom();
        g.playerX = 0; g.playerY = 2;
        beats(g, 4);
        assert.deepEqual([g.playerX, g.playerY], [1, 2]);
        assert.equal(g.logs.at(-1), LINES.shove);

        const r = await inRoom();
        r.playerX = 10; r.playerY = 6;
        beats(r, 4);
        assert.deepEqual([r.playerX, r.playerY], [9, 6]);
    });

    test('standing clear of the walls, you stay where you are, and no shove is said', async () => {
        const g = await inRoom();
        g.playerX = 5; g.playerY = 2;
        beats(g, 4);
        assert.deepEqual([g.playerX, g.playerY], [5, 2]);
        assert.ok(!g.logs.includes(LINES.shove));
    });

    test('each step carries you further in when you stand in its way', async () => {
        const g = await inRoom();
        g.playerX = 1; g.playerY = 4;
        beats(g, 4);   // columns 0 and 10 close: x 1 is safe
        assert.equal(g.playerX, 1);
        beats(g, 4);   // columns 1 and 9 close
        assert.deepEqual([g.playerX, g.playerY], [2, 4]);
        beats(g, 4);   // 2 and 8 close
        assert.deepEqual([g.playerX, g.playerY], [3, 4]);
        beats(g, 4);   // 3 and 7 close
        assert.deepEqual([g.playerX, g.playerY], [4, 4]);
        assert.equal(g.died, 0);
    });

    test('a shove never lands you on the machine: you go to the next free tile', async () => {
        const g = await inRoom();
        const m = machine(g);
        // Put the player in column 4 the moment it closes (step 5 would crush, so test at step 4's edge
        // with the machine moved onto the first open column on the player's row).
        g.playerX = 3; g.playerY = 4;
        m.x = 4; m.y = 4;
        beats(g, 16);   // step 4 closes column 3 and column 7
        assert.equal(g.died, 0);
        assert.notDeepEqual([g.playerX, g.playerY], [4, 4]);
        assert.ok(g.map.isWalkable(g.playerX, g.playerY));
        assert.equal(g.playerX, 4, 'it should stay in the first open column');
        assert.equal(Math.abs(g.playerY - 4), 1);
    });

    test('at action 20 you die even in the one open column', async () => {
        const g = await inRoom();
        g.playerX = 5; g.playerY = 1;
        beats(g, 20);
        assert.equal(g.died, 1);
        assert.equal(g.playerHp, 0);
    });
});

describe('the retry finds the room open again', () => {
    test('the walls go back, the door opens, the machine is whole and the count starts over', async () => {
        const g = await inRoom();
        machine(g).entity.hp = 12;
        assert.equal(beats(g, 20), true);
        assert.ok(doorShut(g));
        g.playerHp = 100; g.state = 'idle'; g.logs.length = 0;
        assert.equal(resetCompactor(g), true);
        assert.deepEqual(wallCols(g), []);
        assert.ok(doorOpen(g));
        assert.deepEqual(g._compactor, { armed: false, actions: 0, broken: false });
        assert.equal(machine(g).entity.hp, 100);
    });

    test('the first action after it shuts the door again and the count runs as before', async () => {
        const g = await inRoom();
        beats(g, 20);
        resetCompactor(g);
        g.logs.length = 0;
        assert.equal(compactorBeat(g), false);
        assert.ok(doorShut(g));
        assert.deepEqual(g.logs, [LINES.shut]);
        assert.equal(g._compactor.actions, 1);
        beats(g, 3);
        assert.deepEqual(wallCols(g), [0, 10]);
    });

    test('leaving by the open door after a retry leaves the room as new', async () => {
        const g = await inRoom();
        beats(g, 20);
        resetCompactor(g);
        g._pendingTransition = DOOR_BACK;   // the walk onto the door tile
        beats(g, 3);
        assert.equal(g._compactor.actions, 0);
        assert.ok(doorOpen(g));
    });

    test('a defeat elsewhere, or in a room already broken, changes nothing', async () => {
        const f = standIn();
        await f._loadMap('factory-map.json', 4, 27);
        assert.equal(resetCompactor(f), false);
        const b = await inRoom();
        breakCompactor(b, machine(b));
        assert.equal(resetCompactor(b), false);
        assert.equal(b._compactor.broken, true);
    });
});

describe('breaking the compactor', () => {
    for (const when of [0, 3, 4, 9, 16, 19]) {
        test(`after ${when} actions: the walls stop where they are and the door opens`, async () => {
            const g = await inRoom();
            beats(g, when);
            const cols = wallCols(g);
            g.logs.length = 0;
            assert.equal(breakCompactor(g, machine(g)), true);
            assert.deepEqual(g.logs, [LINES.broken]);
            assert.ok(doorOpen(g));
            beats(g, 40);
            assert.deepEqual(wallCols(g), cols, 'the walls kept closing');
            assert.equal(g.died, 0);
            assert.equal(g._compactor.actions, when);
            // And the door is reachable: the open column holds the door's column.
            assert.ok(!cols.includes(DOOR.x));
        });
    }

    test('only the compactor breaks it, and it breaks once', async () => {
        const g = await inRoom();
        assert.equal(breakCompactor(g, { tag: 'wererat_boss' }), false);
        assert.equal(breakCompactor(g, null), false);
        assert.ok(doorShut(g));
        assert.equal(breakCompactor(g, machine(g)), true);
        assert.equal(breakCompactor(g, machine(g)), false);
    });

    test('coming back to a broken room: walls as they stopped, door open, no machine, nothing counts', async () => {
        const g = await inRoom();
        beats(g, 9);
        breakCompactor(g, machine(g));
        const again = standIn();
        again._compactor = g._compactor;
        await again._loadMap(COMPACTOR_MAP);
        assert.deepEqual(wallCols(again), [0, 1, 9, 10]);
        assert.ok(doorOpen(again));
        assert.equal(machine(again), undefined, 'the machine came back');
        beats(again, 30);
        assert.equal(again.died, 0);
        assert.ok(!again.logs.includes(LINES.shut));
    });
});

// ── The save ──

describe('a reload mid-fight keeps the walls where they were', () => {
    async function reload(g) {
        const next = standIn();
        await loadInto(next, JSON.parse(JSON.stringify(serialize(g))));
        return next;
    }

    test('three steps in: the same walls, the door shut, the count carries on', async () => {
        const g = await inRoom();
        g.playerX = 5; g.playerY = 3;
        beats(g, 13);
        const saved = serialize(g);
        assert.deepEqual(saved.world.compactor, { armed: true, actions: 13, broken: false });
        const n = await reload(g);
        assert.equal(n._mapUrl, COMPACTOR_MAP);
        assert.deepEqual(wallCols(n), [0, 1, 2, 8, 9, 10]);
        assert.ok(doorShut(n));
        assert.deepEqual(n._compactor, { armed: true, actions: 13, broken: false });
        assert.ok(machine(n));
        n.logs.length = 0;
        beats(n, 2);
        assert.deepEqual(wallCols(n), [0, 1, 2, 8, 9, 10]);
        beats(n, 1);   // action 16
        assert.deepEqual(wallCols(n), [0, 1, 2, 3, 7, 8, 9, 10]);
        assert.ok(!n.logs.includes(LINES.shut), 'the door shut a second time');
    });

    test('the walls are saved as tile diffs too, and agree with the count', async () => {
        const g = await inRoom();
        beats(g, 8);
        const diffs = serialize(g).world.tileDiffs;
        assert.ok(diffs.some(d => d.x === 0 && d.y === 3 && d.id === WALL));
        assert.ok(diffs.some(d => d.x === DOOR.x && d.y === DOOR.y && d.id === WALL));
    });

    test('broken: the walls as they stopped, the door open, the machine gone', async () => {
        const g = await inRoom();
        beats(g, 9);
        breakCompactor(g, machine(g));
        g.enemies = g.enemies.filter(e => e.entity.isAlive());
        const n = await reload(g);
        assert.deepEqual(n._compactor, { armed: true, actions: 9, broken: true });
        assert.deepEqual(wallCols(n), [0, 1, 9, 10]);
        assert.ok(doorOpen(n));
        assert.equal(machine(n), undefined);
    });

    test('a save from before the retry opened it, and from any other room, carries no compactor field', async () => {
        const f = standIn();
        await f._loadMap('factory-map.json', 4, 27);
        assert.ok(!('compactor' in serialize(f).world));
        const g = await inRoom();
        beats(g, 20);
        resetCompactor(g);
        assert.ok(!('compactor' in serialize(g).world));
    });

    test('a damaged compactor field loads as a room that never started', async () => {
        const f = standIn();
        await f._loadMap('factory-map.json', 4, 27);
        const raw = JSON.parse(JSON.stringify(serialize(f)));
        raw.world.compactor = { armed: 'x', actions: 'many', broken: [] };
        const n = standIn();
        await loadInto(n, raw);
        assert.deepEqual(n._compactor, newCompactor());
    });
});

// ── The machine itself never moves, hunts or swings ──

describe('the compactor never acts', () => {
    const lift = (name, vars = {}) => {
        const body = methodBody(name).replace(new RegExp(`^\\s*(async )?${name}`), '');
        const names = Object.keys(vars);
        return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => vars[n]));
    };

    test('noise from your own blows does not wake it, so it never goes looking', async () => {
        const g = await inRoom();
        const earshot = lift('_earshot', { isHostile });
        const heard = earshot.call({ enemies: g.enemies, _isCompactor: isCompactor });
        assert.deepEqual(heard, [], 'the compactor can hear');
        assert.ok(isHostile(machine(g)), 'it should still be a hostile you can hit by bumping');
        // A hostile that is not the compactor still hears.
        const other = { allegiance: 'hostile', tag: 'x' };
        assert.deepEqual(earshot.call({ enemies: [machine(g), other], _isCompactor: isCompactor }), [other]);
    });

    test('a blow to it does not provoke it', async () => {
        const g = await inRoom();
        const m = machine(g);
        const harmed = lift('_onEntityHarmed', { isHostile, struck });
        harmed.call({ _isCompactor: isCompactor, _log(l) { g.logs.push(l); } }, m, { kind: 'attack' });
        assert.equal(m._struckBy ?? null, null, 'it turned to face the blow');
        assert.equal(m.state, 'idle');
        assert.ok(!g.logs.some(l => /turns on you/.test(l)));
    });

    test('beside you for twenty beats it stays put and never swings', async () => {
        const g = await inRoom();
        const m = machine(g);
        g.playerX = 5; g.playerY = 4;
        const swings = [];
        Object.assign(g, {
            _MOVE_MS: 150, hasBuff: () => false, _cascadeMark() {}, ambientRng: null,
            applyDamageToPlayer(raw, by) { swings.push([raw, by.type]); },
        });
        for (let i = 0; i < 20; i++) { g.turn++; resolveEnemyTurns(g); }
        assert.deepEqual([m.x, m.y], [5, 5]);
        assert.equal(m.state, 'idle');
        assert.deepEqual(swings, []);
        // And with you out of reach it does not come for you either.
        g.playerX = 1; g.playerY = 1;
        for (let i = 0; i < 20; i++) { g.turn++; resolveEnemyTurns(g); }
        assert.deepEqual([m.x, m.y], [5, 5]);
    });
});
