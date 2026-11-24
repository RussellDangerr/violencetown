// ZE1 (ZER1 pick a): an exit between two outdoor zones sits on the map's very last row or
// column and covers every walkable tile of the road crossing it. Building doors are exempt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GameMap } from '../game/map.js';

const dir = new URL('../game/', import.meta.url);
const load = (f) => JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8'));
const maps = {};
for (const f of fs.readdirSync(dir).filter(n => n.endsWith('-map.json'))) {
    const data = load(f);
    maps[f] = { data, map: new GameMap(data, f) };   // GameMap gives isWalkable (tiles + props)
}

// Outdoor zones. Everything else is a building, a room or underground and is exempt.
const OUTDOOR = new Set(['town', 'factory', 'carnival', 'graveyard', 'wilderness', 'valley',
    'tunnels', 'frozen', 'canyon', 'gorge', 'sewer'].map(n => `${n}-map.json`));

// Every problem with the crossings that go from `file` to another outdoor zone.
export function crossingProblems(file) {
    const { data, map } = maps[file];
    const W = data.width, H = data.height;
    const problems = new Map();
    const note = (to, msg) => { const k = `${file} -> ${to}`; if (!problems.has(k)) problems.set(k, []); problems.get(k).push(msg); };
    const groups = new Map();
    for (const t of data.transitions || []) {
        if (!OUTDOOR.has(file) || !OUTDOOR.has(t.toMap)) continue;
        const k = `${t.toMap}|${t.toX}|${t.toY}`;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(t);
    }
    for (const group of groups.values()) {
        const to = group[0].toMap;
        const has = (x, y) => group.some(t => t.x === x && t.y === y);
        for (const t of group) {
            const edge = (t.x === 0 || t.x === W - 1) ? 'v' : (t.y === 0 || t.y === H - 1) ? 'h' : null;
            if (!edge) { note(to, `(${t.x},${t.y}) is not on the last row or column`); continue; }
            // Walk the edge line both ways: every walkable tile of the crossing is an exit.
            const step = edge === 'v' ? [0, 1] : [1, 0];
            for (const sign of [-1, 1]) {
                let x = t.x + sign * step[0], y = t.y + sign * step[1];
                while (map.isWalkable(x, y)) {
                    if (!has(x, y)) { note(to, `(${x},${y}) is road beside (${t.x},${t.y}) but not an exit`); break; }
                    x += sign * step[0]; y += sign * step[1];
                }
            }
        }
    }
    return problems;
}

// Every pair of outdoor zones joined by a road, each pair once.
const PAIRS = [];
for (const [a, { data }] of Object.entries(maps)) {
    if (!OUTDOOR.has(a)) continue;
    for (const b of new Set((data.transitions || []).map(t => t.toMap))) {
        if (OUTDOOR.has(b) && a < b) PAIRS.push([a, b]);
    }
}

test('every outdoor exit sits on the edge and covers its crossing (ZE2: no exceptions)', () => {
    let checked = 0;
    for (const file of Object.keys(maps)) {
        for (const [key, msgs] of crossingProblems(file)) assert.fail(`${key} should be on the edge: ${msgs.join('; ')}`);
        checked += (maps[file].data.transitions || []).filter(t => OUTDOOR.has(file) && OUTDOOR.has(t.toMap)).length;
    }
    assert.ok(checked > 20, 'the check looked at the outdoor exits');
});

test('the check still catches an exit off the edge, and a road left half covered', () => {
    const g = maps['graveyard-map.json'];
    const saved = g.data.transitions;
    try {
        g.data.transitions = saved.filter(t => !(t.x === 15 && t.y === 0));
        assert.match([...crossingProblems('graveyard-map.json').values()].flat().join(' '), /\(15,0\) is road beside/);
        g.data.transitions = saved.map(t => t.y === 27 ? { ...t, y: 26 } : t);
        assert.match([...crossingProblems('graveyard-map.json').values()].flat().join(' '), /is not on the last row or column/);
    } finally { g.data.transitions = saved; }
});

test("the Graveyard's two roads: both tiles wide, on the first and last rows", () => {
    const g = maps['graveyard-map.json'].data;
    assert.equal(g.height, 28, 'the solid rows under the south road are cut');
    const at = (to) => g.transitions.filter(x => x.toMap === to).map(x => `${x.x},${x.y}`).sort();
    assert.deepEqual(at('carnival-map.json'), ['14,0', '15,0']);
    assert.deepEqual(at('wilderness-map.json'), ['14,27', '15,27']);
    const w = maps['wilderness-map.json'].data.transitions.filter(x => x.toMap === 'graveyard-map.json');
    assert.deepEqual(w.map(x => `${x.x},${x.y}`).sort(), ['8,0', '9,0']);
});

test("Town's three roads: whole width, last row or column", () => {
    const t = maps['town-map.json'].data.transitions;
    const at = (to) => t.filter(x => x.toMap === to).map(x => `${x.x},${x.y}`).sort();
    assert.deepEqual(at('factory-map.json'), [10, 11, 12, 13, 14, 15].map(y => `0,${y}`).sort());
    assert.deepEqual(at('sewer-map.json'), [10, 11, 12, 13, 14, 15].map(y => `33,${y}`).sort());
    assert.deepEqual(at('carnival-map.json'), [14, 15, 16, 17, 18, 19].map(x => `${x},25`).sort());
});

test('every outdoor exit lands on a walkable tile that is not itself an exit', () => {
    for (const [file, { data }] of Object.entries(maps)) {
        for (const t of data.transitions || []) {
            if (!OUTDOOR.has(file) || !OUTDOOR.has(t.toMap)) continue;
            const dest = maps[t.toMap];
            assert.ok(dest.map.isWalkable(t.toX, t.toY), `${file} (${t.x},${t.y}) lands off the floor in ${t.toMap}`);
            const onExit = dest.map.transitions.some(d => d.x === t.toX && d.y === t.toY);
            assert.ok(!onExit, `${file} (${t.x},${t.y}) lands on an exit in ${t.toMap}`);
        }
    }
});

test('walking back lands beside the exit you came through', () => {
    assert.ok(PAIRS.length >= 10, `${PAIRS.length} pairs`);
    for (const [a, b] of PAIRS) {
        const there = maps[a].data.transitions.find(t => t.toMap === b);
        const back = maps[b].data.transitions.find(t => t.toMap === a);
        const nearBack = maps[b].map.transitions.some(d => d.toMap === a && Math.abs(d.x - there.toX) + Math.abs(d.y - there.toY) <= 2);
        const nearThere = maps[a].map.transitions.some(d => d.toMap === b && Math.abs(d.x - back.toX) + Math.abs(d.y - back.toY) <= 2);
        assert.ok(nearBack, `${a} -> ${b} lands near its exit back`);
        assert.ok(nearThere, `${b} -> ${a} lands near its exit back`);
    }
});
