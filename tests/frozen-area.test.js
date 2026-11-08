// frozen-area.test.js — the frozen area joins the Factory to the Wilderness
// (plans/ic3-frozen-area.md): both doors lead in and back out, every landing
// is open ground, the map is one walkable piece, and the pond can be walked on.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { GameMap } from '../game/map.js';
import { TILES } from '../game/data.js';
import { TILE_SPRITE_MAP, ZONE_TILE_SPRITE_MAP } from '../game/sprites.js';
import { WORLD_ZONES, zoneByName, overworldZone, connectorPairs } from '../game/world-map.js';

const GAME = join(dirname(fileURLToPath(import.meta.url)), '..', 'game');
const load = (f) => new GameMap(JSON.parse(readFileSync(join(GAME, f), 'utf8')), f);

const FROZEN = 'frozen-map.json';
const maps = Object.fromEntries(['frozen-map.json', 'factory-map.json', 'wilderness-map.json'].map(f => [f, load(f)]));

// Every tile reachable on foot from (x, y), as "x,y" keys.
function reach(map, x, y) {
    const seen = new Set([`${x},${y}`]);
    const queue = [[x, y]];
    while (queue.length) {
        const [cx, cy] = queue.shift();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx, ny = cy + dy, k = `${nx},${ny}`;
            if (seen.has(k) || !map.isInBounds(nx, ny) || !map.isWalkable(nx, ny)) continue;
            seen.add(k);
            queue.push([nx, ny]);
        }
    }
    return seen;
}

const doorsTo = (map, toMap) => map.transitions.filter(t => t.toMap === toMap);

// Step through `door` from `fromFile`: land on its far side, check the landing,
// and check you can walk from there to a door that leads back.
function walkThrough(fromFile, door) {
    const there = maps[door.toMap];
    assert.ok(there, `${fromFile} has a door to ${door.toMap}, which this test does not load`);
    assert.ok(there.isWalkable(door.toX, door.toY), `${fromFile} -> ${door.toMap} lands on (${door.toX},${door.toY}), which is not walkable`);
    assert.equal(there.getTransition(door.toX, door.toY), null, `${fromFile} -> ${door.toMap} lands on a door, which would bounce you straight back`);
    const back = doorsTo(there, fromFile);
    assert.ok(back.length, `${door.toMap} has no door back to ${fromFile}`);
    const open = reach(there, door.toX, door.toY);
    assert.ok(back.some(t => open.has(`${t.x},${t.y}`)), `from where ${fromFile}'s door lands you in ${door.toMap}, you cannot walk to the door back`);
}

describe('the frozen area', () => {
    test('the Factory has a door into the frozen area, and the frozen area one back', () => {
        const doors = doorsTo(maps['factory-map.json'], FROZEN);
        assert.ok(doors.length, 'the Factory has no door into the frozen area');
        for (const d of doors) walkThrough('factory-map.json', d);
        const back = doorsTo(maps[FROZEN], 'factory-map.json');
        assert.ok(back.length, 'the frozen area has no door back to the Factory');
        for (const d of back) walkThrough(FROZEN, d);
    });

    test('the frozen area runs out into the Wilderness, and the Wilderness leads back', () => {
        const doors = doorsTo(maps[FROZEN], 'wilderness-map.json');
        assert.ok(doors.length, 'the frozen area has no door out to the Wilderness');
        for (const d of doors) walkThrough(FROZEN, d);
        const back = doorsTo(maps['wilderness-map.json'], FROZEN);
        assert.ok(back.length, 'the Wilderness has no door into the frozen area');
        for (const d of back) walkThrough('wilderness-map.json', d);
    });

    test('you can cross the frozen area from the Factory door to the Wilderness door', () => {
        const frozen = maps[FROZEN];
        const fromFactory = doorsTo(maps['factory-map.json'], FROZEN)[0];
        const open = reach(frozen, fromFactory.toX, fromFactory.toY);
        const out = doorsTo(frozen, 'wilderness-map.json');
        assert.ok(out.some(t => open.has(`${t.x},${t.y}`)), 'the Wilderness door is cut off from the Factory door');
        assert.ok(open.has(`${frozen.spawn.x},${frozen.spawn.y}`), 'the frozen area spawn is cut off from its doors');
    });

    test('the cold room joins the rest of the Factory floor', () => {
        const factory = maps['factory-map.json'];
        const landing = doorsTo(maps[FROZEN], 'factory-map.json')[0];
        const open = reach(factory, landing.toX, landing.toY);
        assert.ok(open.has(`${factory.spawn.x},${factory.spawn.y}`), 'the cold room is walled off from the Factory');
        assert.ok(doorsTo(factory, 'town-map.json').some(t => open.has(`${t.x},${t.y}`)), 'the cold room is walled off from the street door');
    });

    test('the pond is walkable, all of it, and is not the same ground as around it', () => {
        const frozen = maps[FROZEN];
        const pond = frozen.getRegion('pond');
        assert.ok(pond, 'the frozen area has no pond region');
        for (let y = pond.y; y < pond.y + pond.h; y++)
            for (let x = pond.x; x < pond.x + pond.w; x++)
                assert.ok(frozen.isWalkable(x, y), `pond cell (${x},${y}) is not walkable`);
        const cx = pond.x + (pond.w >> 1), cy = pond.y + (pond.h >> 1);
        assert.notEqual(frozen.getTile(cx, cy), frozen.getTile(frozen.spawn.x, frozen.spawn.y),
            'the pond is drawn with the same tile as the ground around it');
        assert.ok(reach(frozen, frozen.spawn.x, frozen.spawn.y).has(`${cx},${cy}`), 'the pond cannot be reached on foot');
    });

    test('the pond is iced over: ICE, and the ground around it SNOW', () => {
        const frozen = maps[FROZEN];
        const pond = frozen.getRegion('pond');
        const cx = pond.x + (pond.w >> 1), cy = pond.y + (pond.h >> 1);
        assert.equal(frozen.getTile(cx, cy), TILES.ICE.id);
        assert.equal(frozen.getTile(frozen.spawn.x, frozen.spawn.y), TILES.SNOW.id);
        assert.ok(TILES.ICE.walkable && !TILES.ICE.hazard, 'ice is ground you walk on, with no hazard');
        assert.ok(TILES.SNOW.walkable && !TILES.SNOW.hazard, 'snow is ground you walk on, with no hazard');
        const used = new Set(frozen.tiles);
        assert.deepEqual([...used].sort((a, b) => a - b), [TILES.SNOW.id, TILES.ICE.id], 'the frozen area is all snow and ice');
    });

    test('ice is not drawn like water, which you cannot walk on', () => {
        const all = { ...TILE_SPRITE_MAP, ...ZONE_TILE_SPRITE_MAP };
        const cell = (id) => all[id] && `${all[id].sheet}:${all[id].col},${all[id].row}`;
        assert.ok(cell(TILES.ICE.id) && cell(TILES.SNOW.id), 'snow and ice both have art');
        assert.notEqual(cell(TILES.ICE.id), cell(TILES.RIVER.id));
        assert.notEqual(TILES.ICE.fallbackColor, TILES.RIVER.fallbackColor);
    });

    test('its name is a placeholder until Caelan names it', () => {
        assert.match(maps[FROZEN].zoneName, /^\[.*\]$/);
    });

    test('the world map has it, joined to the Factory and the Wilderness, so "you are here" lands', () => {
        const here = overworldZone(maps[FROZEN].zoneName);
        assert.ok(here, 'the frozen area is not on the world map');
        const z = zoneByName(here);
        assert.deepEqual([...z.connects].sort(), ['FACTORY', 'WILDERNESS']);
        for (const other of ['FACTORY', 'WILDERNESS']) assert.ok(zoneByName(other).connects.includes(here), `${other} does not connect back`);
        const taken = WORLD_ZONES.filter(o => o !== z && o.col === z.col && o.row === z.row);
        assert.deepEqual(taken, [], 'its box sits on top of another zone');
        const pairs = connectorPairs().map(p => p.join('|'));
        assert.ok(pairs.includes(['FACTORY', here].sort().join('|')) && pairs.includes([here, 'WILDERNESS'].sort().join('|')));
    });
});
