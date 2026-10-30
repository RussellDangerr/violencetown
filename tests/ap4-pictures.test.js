// ap4-pictures.test.js — the casino's slot machine and the bank's vault door
// draw as the ruled pictures (plans/ap4-slot-machine-vault-door-art.md).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { GameMap } from '../game/map.js';
import { PROP_SPRITES } from '../game/sprites.js';
import { resolveExamine } from '../game/examine.js';
import { TILES } from '../game/data.js';

const GAME = join(dirname(fileURLToPath(import.meta.url)), '..', 'game');
const load = (f) => JSON.parse(readFileSync(join(GAME, f), 'utf8'));

describe('the ruled pictures', () => {
    test('the slot machine is Tiny Dungeon (6,4)', () => {
        const d = PROP_SPRITES.slotMachine;
        assert.equal(d.sheet, 'tinyDungeon');
        assert.deepEqual([d.sx / 16, d.sy / 16, d.sw, d.sh], [6, 4, 16, 16]);
    });

    test('the vault door is Tiny Town (5,10)', () => {
        const d = PROP_SPRITES.vaultDoor;
        assert.equal(d.sheet, 'tinyTown');
        assert.deepEqual([d.sx / 16, d.sy / 16, d.sw, d.sh], [5, 10, 16, 16]);
    });
});

describe('the casino slot machine', () => {
    const data = load('casino-map.json');
    const ex = data.examinables.find(e => e.id === 'casino_slots');

    test('it stands on the floor at the examine spot, and blocks it like furniture', () => {
        const props = data.props.filter(p => p.type === 'slotMachine');
        assert.deepEqual(props.map(p => [p.x, p.y]), [[ex.x, ex.y]]);
        assert.notEqual(props[0].solid, false);
        const m = new GameMap(data, 'casino-map.json');
        assert.equal(m.isWalkable(ex.x, ex.y), false);
        assert.equal(m.isWalkable(ex.x, ex.y + 1), true, 'you can stand below it to examine');
    });

    test('examining it still gives the authored text', () => {
        const m = new GameMap(data, 'casino-map.json');
        const g = { examinables: data.examinables.map(e => ({ ...e })), enemies: [], containers: [], groundItems: [], map: m, playerX: ex.x, playerY: ex.y + 1, facing: 'up' };
        assert.equal(resolveExamine(g, ex.x, ex.y).body, ex.text);
    });
});

describe('the bank vault door', () => {
    const data = load('bank-map.json');
    const door = data.transitions.find(t => t.toMap === 'vault-map.json');

    test('the picture is on the real door tile and does not block it', () => {
        const props = data.props.filter(p => p.type === 'vaultDoor');
        assert.deepEqual(props.map(p => [p.x, p.y]), [[door.x, door.y]]);
        assert.equal(props[0].solid, false);
        assert.equal(data.tiles[door.y * data.width + door.x], TILES.DOOR.id);
        const m = new GameMap(data, 'bank-map.json');
        assert.equal(m.isWalkable(door.x, door.y), true, 'you still walk into the door tile');
    });

    test('the gate is exactly as it was', () => {
        assert.deepEqual(door.requires, ['act2_item_a', 'act2_item_b', 'act2_item_c']);
        assert.ok(door.requiresMsg);
        const m = new GameMap(data, 'bank-map.json');
        assert.deepEqual(m.getTransition(door.x, door.y).requires, door.requires);
    });

    test('the vault examine spot is still bare and its text unchanged', () => {
        const ex = data.examinables.find(e => e.id === 'bank_vault');
        assert.deepEqual([ex.x, ex.y], [door.x, door.y + 1]);
        assert.ok(!data.props.some(p => p.x === ex.x && p.y === ex.y));
        assert.match(ex.text, /^\[A vault door, cold to the touch/);
    });
});

describe('the two props examined as props', () => {
    test('they are named, not left as raw types', () => {
        for (const [type, name] of [['slotMachine', 'Slot machine'], ['vaultDoor', 'Vault door']]) {
            const g = {
                examinables: [], enemies: [], containers: [], groundItems: [], playerX: 5, playerY: 5, facing: 'down',
                map: { getTile: () => TILES.FLOOR.id, isInBounds: () => true, propSpawns: [{ type, x: 0, y: 0 }] },
            };
            assert.equal(resolveExamine(g, 0, 0).body, `[${name}.]`);
        }
    });
});
